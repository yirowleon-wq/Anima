import { autoClose, parseExpression, split, tokenize, type ASTNode } from '@openuidev/lang-core';
import { HarnessError, type InteractiveProgramDepthDiagnostic, type InteractiveProgramExpansionDiagnostic, type InteractiveProgramExpressionDiagnostic } from '../../shared/harness';
import { PROGRAM_AST_RULES } from '../../shared/interactive-program';
import type { InteractiveFunctionReturnRule, InteractiveFunctionCardinalityRule } from '../../shared/interactive-functions';

type ValueKind = 'number' | 'string' | 'boolean' | 'number?' | 'string?' | 'boolean?' | 'null' | 'unknown';
export interface ProgramAstPolicy {
  components: ReadonlySet<string>;
  functions: ReadonlySet<string>;
  bindingNames: ReadonlySet<string>;
  sourceSlots?: ReadonlySet<string>;
  stateKinds: Readonly<Record<string, ValueKind>>;
  functionKinds?: Readonly<Record<string, ValueKind>>;
  functionReturnRules?: Readonly<Record<string, InteractiveFunctionReturnRule>>;
  functionCardinalityRules?: Readonly<Record<string, InteractiveFunctionCardinalityRule>>;
  functionMinimumArguments?: Readonly<Record<string, number>>;
  functionHelp: {
    methodId: string;
    entries: Readonly<Record<string, { signature: string; returnKind: string; minimumArguments?: number }>>;
  };
  bindingCollectionLengths?: Readonly<Record<string, number>>;
  stateCollectionLengths?: Readonly<Record<string, number>>;
  stateNumberMaxima?: Readonly<Record<string, number>>;
  /** Only return an exact length for an expression independent of $ui and iterators. */
  constantCollectionLength?: (node: ASTNode) => number | undefined;
  constantNumber?: (node: ASTNode) => number | undefined;
  limits: { bytes: number; tokens: number; depth: number; statements: number; nodes: number; collection: number; expandedNodes: number };
}
export interface ProgramAstInspection {
  statements: ReadonlyMap<string, ASTNode>;
  nodeCount: number;
  expandedNodes: number;
}
const forbiddenKeys = new Set(PROGRAM_AST_RULES.forbiddenMemberKeys);
const forbiddenCalls = new Set(PROGRAM_AST_RULES.forbiddenCalls);
const identifier = /^[a-zA-Z_][a-zA-Z0-9_]{0,79}$/;
const interpreterTags = new Set(['Comp', 'Str', 'Num', 'Bool', 'Null', 'Arr', 'Obj', 'Ref', 'Ph', 'StateRef', 'RuntimeRef', 'BinOp', 'UnaryOp', 'Ternary', 'Member', 'Index', 'Assign']);
function fail(message: string): never { throw new HarnessError('interactive_program', message); }

/** Inspect the original statements, not just the parser's reachable root.
 * OpenUI intentionally permits incomplete/unused input; publishing does not. */
export function parseProgramStatements(dsl: string, limits: ProgramAstPolicy['limits'], requireRoot = true): ReadonlyMap<string, ASTNode> {
  if (!dsl.trim() || Buffer.byteLength(dsl, 'utf8') > limits.bytes)
    fail("This interactive content exceeds the current size limit. Keep the relationships most useful here.");
  const closed = autoClose(dsl);
  if (closed.wasIncomplete) {
    const suffix = closed.text.slice(dsl.length), safe = [...suffix].every(value => ['\\', '"', "'", ')', ']', '}'].includes(value));
    const returned = Math.min(64, suffix.length);
    throw new HarnessError('interactive_program', "The interactive source is incomplete. Complete its quotes or brackets.", 'never', {
      rejectedDimensions: ['native_auto_close.incomplete'],
      input: { tool: 'present_view', layer: 'source_completion', nativeIncomplete: true,
        end: { unit: 'utf16_code_units', offset: dsl.length, line: dsl.split('\n').length - 1,
          column: dsl.length - dsl.lastIndexOf('\n') - 1 },
        ...(safe ? { completion: { suffix: suffix.slice(0, returned), returned, total: suffix.length, complete: returned === suffix.length } } : {}) },
      explanation: "end is the zero-based UTF-16 position, line, and column at the actual end of this draft, not a guessed missing-character location. completion contains only brackets, quotes, or escape characters appended by this same native autoClose call; more than 64 characters is explicitly partial. The completed candidate was not adopted as source, published, or given a new revision.",
    });
  }
  const tokens = tokenize(dsl);
  if (tokens.length > limits.tokens) fail("Too many interactive expressions. Narrow this page first.");
  const brackets: number[] = [];
  for (const token of tokens) {
    if ([1, 3, 5].includes(token.t)) {
      brackets.push(token.t);
      if (brackets.length > limits.depth) fail("Interactive expressions are nested too deeply.");
    } else if ([2, 4, 6].includes(token.t) && brackets.pop() !== token.t - 1) fail("Interactive brackets do not match.");
  }
  if (brackets.length) fail("Interactive brackets do not match.");
  const raw = split(tokens);
  if (!raw.length || raw.length > limits.statements) fail("The number of interactive declarations is outside the supported range.");
  // Native split skips invalid top-level lines. Account for every source token.
  const represented = raw.flatMap(statement => [{ t: statement.idTokenType, v: statement.id }, { t: 9 }, ...statement.tokens]);
  const meaningful = tokens.filter(token => token.t !== 0 && token.t !== 13);
  if (JSON.stringify(represented) !== JSON.stringify(meaningful)) fail("Interactive content must consist of complete OpenUI declarations.");
  const statements = new Map<string, ASTNode>();
  for (const statement of raw) {
    if (!identifier.test(statement.id) || statement.id.startsWith('$'))
      fail("The host declares adjustable inputs as $ui. Do not create or overwrite another state in the program.");
    if (statements.has(statement.id)) fail(`Interactive declaration ${statement.id} is duplicated.`);
    // parseExpression does not expose its consumed offset. A native parenthesized
    // expression followed by a marker proves it consumed the complete RHS.
    const end = '\u0000interactive-program-end';
    const guarded = parseExpression([{ t: 1 }, ...statement.tokens, { t: 2 }, { t: 25 }, { t: 14, v: end }]);
    if (guarded.k !== 'BinOp' || guarded.op !== '==' || guarded.right.k !== 'Str' || guarded.right.v !== end)
      fail(`Interactive declaration ${statement.id} contains unparsed content.`);
    statements.set(statement.id, guarded.left);
  }
  if (requireRoot && !statements.has('root')) fail("Interactive content needs a root.");
  return statements;
}

export function inspectInteractiveProgram(dsl: string, policy: ProgramAstPolicy, checkExpansion = true): ProgramAstInspection {
  const statements = parseProgramStatements(dsl, policy.limits);
  let nodeCount = 0;
  const sourceSlots = new Set<string>();
  const joinKinds = (kinds: readonly ValueKind[]): ValueKind => {
    if (!kinds.length) return 'unknown';
    if (kinds.every(value => value === 'null')) return 'null';
    for (const base of ['number', 'string', 'boolean'] as const) {
      const nullable: ValueKind = `${base}?`;
      if (kinds.every(value => value === base || value === nullable || value === 'null'))
        return kinds.every(value => value === base) ? base : nullable;
    }
    return 'unknown';
  };
  const operationKind = (operator: string, left: ValueKind, right: ValueKind): ValueKind => {
    if (PROGRAM_AST_RULES.booleanOperators.includes(operator)) return left === 'boolean' && right === 'boolean' ? 'boolean' : 'unknown';
    if (PROGRAM_AST_RULES.sameKnownPrimitiveComparisons.includes(operator))
      return ['boolean', 'string', 'number'].includes(left) && left === right ? 'boolean' : 'unknown';
    if (PROGRAM_AST_RULES.knownFiniteNumberComparisons.includes(operator)) return left === 'number' && right === 'number' ? 'boolean' : 'unknown';
    return PROGRAM_AST_RULES.knownTextConcatenation.includes(operator) && left === 'string' && right === 'string' ? 'string' : 'unknown';
  };
  const inferredStatements = new Map<string, ValueKind>();
  const kind = (node: ASTNode, visiting = new Set<string>(), depth = 0): ValueKind => {
    if (depth > policy.limits.depth) return 'unknown';
    const childKind = (value: ASTNode) => kind(value, visiting, depth + 1);
    if (node.k === 'Num') return Number.isFinite(node.v) ? 'number' : 'unknown';
    if (node.k === 'Str') return 'string';
    if (node.k === 'Bool') return 'boolean';
    if (node.k === 'Null') return 'null';
    if (node.k === 'UnaryOp' && node.op === '-' && node.operand.k === 'Num') return childKind(node.operand);
    if (node.k === 'Member' && node.obj.k === 'StateRef' && node.obj.n === PROGRAM_AST_RULES.stateRoot) return policy.stateKinds[node.field] || 'unknown';
    if (node.k === 'Index' && node.obj.k === 'StateRef' && node.obj.n === PROGRAM_AST_RULES.stateRoot && node.index.k === 'Str')
      return policy.stateKinds[node.index.v] || 'unknown';
    if (node.k === 'Ref' && statements.has(node.n) && !visiting.has(node.n)) {
      const cached = inferredStatements.get(node.n);
      if (cached !== undefined) return cached;
      const result = kind(statements.get(node.n)!, new Set([...visiting, node.n]), depth + 1);
      inferredStatements.set(node.n, result); return result;
    }
    if (node.k === 'UnaryOp') return node.op === '!' && childKind(node.operand) === 'boolean' ? 'boolean' : 'unknown';
    if (node.k === 'BinOp') return operationKind(node.op, childKind(node.left), childKind(node.right));
    if (node.k === 'Comp') {
      const rule = policy.functionReturnRules?.[node.name];
      if (rule?.kind === 'branch_join') {
        const condition = node.args[rule.conditionArgument];
        if (!condition || rule.branchArguments.some(index => !node.args[index])) return 'unknown';
        const conditionKind = childKind(condition);
        if (rule.condition !== 'boolean_or_null' || !['boolean', 'boolean?', 'null'].includes(conditionKind)) return 'unknown';
        return joinKinds(rule.branchArguments.map(index => childKind(node.args[index])));
      }
      return policy.functionKinds?.[node.name] || 'unknown';
    }
    if (node.k === 'Ternary') {
      return childKind(node.cond) === 'boolean' ? joinKinds([childKind(node.then), childKind(node.else)]) : 'unknown';
    }
    return 'unknown';
  };
  const expressionFailure = (message: string, statementOrdinal: number, location: string,
    category: InteractiveProgramExpressionDiagnostic['category'], operator: string,
    operandKinds: InteractiveProgramExpressionDiagnostic['operandKinds'], candidates: readonly string[]): never => {
    const functions = [...new Set(candidates)].flatMap(name => {
      const entry = policy.functionHelp.entries[name];
      return entry && policy.functions.has(name) ? [{ name, ...entry }] : [];
    }).slice(0, 3);
    const operators = new Set(['+', '-', '*', '/', '%', '==', '!=', '>', '>=', '<', '<=', '&&', '||', '!', '?:', '[]']);
    const expression: InteractiveProgramExpressionDiagnostic = { statementOrdinal, location,
      category, operator: operators.has(operator) ? operator as InteractiveProgramExpressionDiagnostic['operator'] : 'unsupported',
      operandKinds, functions,
      read: { tool: 'read_skill', arguments: { id: policy.functionHelp.methodId,
        section: 'functions', names: functions.map(entry => entry.name), limit: Math.max(1, functions.length) } } };
    throw new HarnessError('interactive_program', message, 'never', { rejectedDimensions: ['expression_semantics'], expression,
      explanation: "statementOrdinal is one-based. In location, sN denotes declaration N; subsequent indexes are zero-based in original order: call arguments, array items, object values; binary left/right; ternary condition/true/false; Each template is 2. functions comes from the current library. Nullable results remain unknown, never implicitly zero or false. Revise the affected expression before resubmitting." });
  };
  const statementOrdinals = new Map([...statements.keys()].map((name, index) => [name, index + 1]));
  const depthFailure = (phase: InteractiveProgramDepthDiagnostic['phase'], depth: number,
    statementOrdinal: number, location: string): never => {
    throw new HarnessError('interactive_program', "Interactive reference nesting is too deep.", 'never', {
      rejectedDimensions: ['depth'],
      depth: { phase, depth, limit: policy.limits.depth, statementOrdinal, location: location.slice(-160),
        referenceSemantics: 'ordinary_refs_inline',
        read: { tool: 'read_skill', arguments: { id: policy.functionHelp.methodId, section: 'grammar' } } },
      explanation: "depth is the actual stopping depth, not a whole-source maximum. statementOrdinal is one-based; location contains declaration and child indexes plus r/t reference or template steps. Ordinary declaration Refs inline at every use; splitting declarations does not cache intermediates. Each can iterate an array containing one pure parameter record and read its evaluated local values inside the inline template. Staged computation obeys the same depth and collection limits. Do not lift local-dependent expressions into global declarations. No new version was published; continue the original revision.",
    });
  };
  const checkedStatements = new Set<string>(), checkingStatements = new Set<string>();
  function checkStatement(name: string, referenceDepth = 0): void {
    if (checkingStatements.has(name)) fail(`Interactive declaration ${name} creates a reference cycle.`);
    if (checkedStatements.has(name)) return;
    const node = statements.get(name), ordinal = statementOrdinals.get(name);
    if (!node || ordinal === undefined) fail("An interactive reference is undeclared.");
    if (referenceDepth > policy.limits.depth) depthFailure('statement_references', referenceDepth, ordinal, `s${ordinal}`);
    checkingStatements.add(name);
    try {
      check(node, new Set(), 0, ordinal, `s${ordinal}`, referenceDepth);
      checkedStatements.add(name);
    } finally { checkingStatements.delete(name); }
  }
  const check = (node: ASTNode, locals: ReadonlySet<string>, depth: number, statementOrdinal: number, location: string, referenceDepth: number): void => {
    if (depth > policy.limits.depth) depthFailure('ast_structure', depth, statementOrdinal, location);
    if (++nodeCount > policy.limits.nodes) fail("The interactive structure exceeds the supported limits.");
    let childOrdinal = 0;
    const child = (value: ASTNode) => check(value, locals, depth + 1, statementOrdinal, `${location}/${childOrdinal++}`, referenceDepth);
    switch (node.k) {
      case 'Num': if (!Number.isFinite(node.v)) fail("Interactive numeric values must be finite."); return;
      case 'Str': case 'Bool': case 'Null': return;
      case 'StateRef': if (node.n !== PROGRAM_AST_RULES.stateRoot) fail("Only this page's declared $ui state can be referenced."); return;
      case 'RuntimeRef': case 'Assign': case 'Ph': fail("Interactive content cannot invoke tools or directly overwrite state.");
      case 'Ref':
        if (!locals.has(node.n) && !statements.has(node.n)) fail(`Interactive reference ${node.n} is undeclared.`);
        if (!locals.has(node.n)) checkStatement(node.n, referenceDepth + 1);
        return;
      case 'Member':
        if (forbiddenKeys.has(node.field)) fail("Interactive content cannot access prototype fields.");
        if (node.obj.k === 'StateRef' && !Object.hasOwn(policy.stateKinds, node.field)) fail(`Adjustable input ${node.field} is undeclared.`);
        child(node.obj); return;
      case 'Index':
        if (node.index.k === 'Str' && forbiddenKeys.has(node.index.v)) fail("Interactive content cannot access prototype fields.");
        child(node.obj); child(node.index);
        if (node.index.k !== 'Str' && kind(node.index) !== 'number') expressionFailure("Dynamic indexing requires a concrete numeric index. Field access uses an exact name.",
          statementOrdinal, location, 'index', '[]', { right: kind(node.index) }, ['Item', 'Known', 'Choose']);
        if (node.obj.k === 'StateRef' && (node.index.k !== 'Str' || !Object.hasOwn(policy.stateKinds, node.index.v)))
          fail("An adjustable-input index must identify an exact declared field.");
        return;
      case 'Obj': {
        const names = new Set<string>();
        for (const [name, value] of node.entries) {
          if (forbiddenKeys.has(name) || names.has(name)) fail("An interactive object field is duplicated or unavailable.");
          if (name === '__reactive' || name === 'k' && (value.k === 'Str' ? interpreterTags.has(value.v) : ['unknown', 'string', 'number?', 'string?', 'boolean?'].includes(kind(value)))
            || name === 'type' && value.k === 'Str' && value.v === 'element')
            fail("Use native declarations, not handwritten interpreters, state bindings, or component-marker objects.");
          names.add(name); child(value);
        }
        return;
      }
      case 'Arr':
        if (node.els.length > policy.limits.collection) fail("The interactive collection is too long. Keep a bounded portion.");
        node.els.forEach(child); return;
      case 'UnaryOp':
        child(node.operand);
        if (node.op === '-' && node.operand.k === 'Num') return;
        if (node.op !== '!' || kind(node.operand) !== 'boolean') expressionFailure("Use strict pure library functions for numeric derivation.",
          statementOrdinal, location, 'unary', node.op, { right: kind(node.operand) }, node.op === '-' ? ['Negative', 'Known', 'Choose'] : ['Choose', 'Known']);
        return;
      case 'BinOp': {
        child(node.left); child(node.right);
        const left = kind(node.left), right = kind(node.right);
        const allowed = operationKind(node.op, left, right) !== 'unknown';
        if (!allowed) {
          const candidates = node.op === '+' ? [left, right].some(value => value === 'string' || value === 'string?') ? ['JoinText', 'FormatNumber', 'Known'] : ['Add', 'Known', 'Choose']
            : ({ '-': ['Subtract'], '*': ['Multiply'], '/': ['Divide'], '%': ['Remainder'], '<': ['Less'], '<=': ['LessEqual'],
              '>': ['Greater'], '>=': ['GreaterEqual'], '==': ['Equal'], '!=': ['Equal'] } as Record<string, string[]>)[node.op] || [];
          expressionFailure("Use strict pure library functions for numeric derivation and unknown-value comparison.", statementOrdinal, location, 'binary', node.op,
            { left, right }, [...candidates, 'Known', 'Choose']);
        }
        return;
      }
      case 'Ternary':
        child(node.cond); child(node.then); child(node.else);
        if (kind(node.cond) !== 'boolean') expressionFailure("An interactive branch condition must be an explicit boolean.", statementOrdinal, location,
          'condition', '?:', { condition: kind(node.cond) }, ['Choose', 'Known']);
        return;
      case 'Comp': {
        if (forbiddenCalls.has(node.name)) fail("The view handles only local page state and discussion references, without dispatching tools or external actions.");
        if (node.name === 'Each') {
          if (node.args.length !== 3) fail("Each needs a finite collection, local name, and content.");
          const binder = node.args[1], name = binder.k === 'Str' ? binder.v : binder.k === 'Ref' ? binder.n : '';
          if (!identifier.test(name) || locals.has(name) || statements.has(name) || forbiddenKeys.has(name)) fail("An Each local name is invalid or shadows another binding.");
          child(node.args[0]);
          check(node.args[2], new Set([...locals, name]), depth + 1, statementOrdinal, `${location}/2`, referenceDepth); return;
        }
        if (!policy.components.has(node.name) && !policy.functions.has(node.name)) fail(`The current interactive library does not include ${node.name}。`);
        if (node.args.length < (policy.functionMinimumArguments?.[node.name] ?? 0)) fail(`${node.name} requires all mandatory branches explicitly.`);
        if (node.name === 'Document' && (node.args[1]?.k !== 'StateRef' || node.args[1].n !== PROGRAM_AST_RULES.stateRoot))
          fail("Document ui directly references only the host-generated $ui.");
        if (node.name === 'Data' && (node.args[0]?.k !== 'Str' || !policy.bindingNames.has(node.args[0].v)))
          fail("Data can reference only exact source names bound in this request.");
        if (node.name === 'SourceSlot') {
          const ref = node.args[1];
          if (ref?.k !== 'Str' || !policy.sourceSlots?.has(ref.v))
            fail("SourceSlot directly references only exact id@revision addresses admitted in this request.");
          if (sourceSlots.has(ref.v)) fail("The same original surface can appear only once in this interaction.");
          sourceSlots.add(ref.v);
        }
        node.args.forEach(child); return;
      }
    }
  };
  for (const name of statements.keys()) checkStatement(name);
  if (!checkExpansion) return { statements, nodeCount, expandedNodes: 0 };
  const countUpper = (value: number | undefined) => value !== undefined && Number.isFinite(value) && value >= 0
    ? Math.min(policy.limits.collection, Math.floor(value)) : undefined;
  const stateField = (node: ASTNode): string | undefined => node.k === 'Member' && node.obj.k === 'StateRef' && node.obj.n === PROGRAM_AST_RULES.stateRoot
    ? node.field : node.k === 'Index' && node.obj.k === 'StateRef' && node.obj.n === PROGRAM_AST_RULES.stateRoot && node.index.k === 'Str' ? node.index.v : undefined;
  const numberMaxima = new Map<string, number | undefined>(), collectionMaxima = new Map<string, number | undefined>();
  const referenceBounds = new Map<string, number>();
  // These bounds describe possible output lengths, never a substitute value
  // for null/unknown. No initial $ui value participates in their calculation.
  const numberUpper = (node: ASTNode, visiting: ReadonlySet<string>, locals: ReadonlyMap<string, number>): number | undefined => {
    const fixed = policy.constantNumber?.(node);
    if (fixed !== undefined) return Number.isSafeInteger(fixed) ? countUpper(fixed) : undefined;
    if (node.k === 'Num') return Number.isSafeInteger(node.v) ? countUpper(node.v) : undefined;
    const field = stateField(node);
    if (field !== undefined && Object.hasOwn(policy.stateNumberMaxima || {}, field)) return countUpper(policy.stateNumberMaxima![field]);
    if (node.k === 'Ref' && statements.has(node.n) && !visiting.has(node.n)) {
      if (numberMaxima.has(node.n)) return numberMaxima.get(node.n);
      const bound = numberUpper(statements.get(node.n)!, new Set([...visiting, node.n]), new Map());
      numberMaxima.set(node.n, bound); return bound;
    }
    const rule = node.k === 'Comp' ? policy.functionCardinalityRules?.[node.name] : undefined;
    if (node.k === 'Comp' && rule?.kind === 'length' && node.args[rule.argument])
      return knownCollectionUpper(node.args[rule.argument], visiting, locals);
    return undefined;
  };
  const knownCollectionUpper = (node: ASTNode, visiting: ReadonlySet<string>, locals: ReadonlyMap<string, number>): number | undefined => {
    const fixed = policy.constantCollectionLength?.(node);
    if (fixed !== undefined) {
      if (!Number.isSafeInteger(fixed) || fixed < 0 || fixed > policy.limits.collection) fail("The interactive collection exceeds this page's finite bounds.");
      return fixed;
    }
    if (node.k === 'Arr') return node.els.length;
    const field = stateField(node);
    if (field !== undefined && Object.hasOwn(policy.stateCollectionLengths || {}, field)) return policy.stateCollectionLengths![field];
    if (node.k === 'Ref' && statements.has(node.n) && !visiting.has(node.n)) {
      if (collectionMaxima.has(node.n)) return collectionMaxima.get(node.n);
      const bound = knownCollectionUpper(statements.get(node.n)!, new Set([...visiting, node.n]), new Map());
      collectionMaxima.set(node.n, bound); return bound;
    }
    const rule = node.k === 'Comp' ? policy.functionCardinalityRules?.[node.name] : undefined;
    if (node.k === 'Comp' && (node.name === 'Each' || rule && rule.kind !== 'length')) return arrayBound(node, visiting, locals);
    return undefined;
  };
  const arrayBound = (node: ASTNode, visiting: ReadonlySet<string>, locals: ReadonlyMap<string, number>, precise = true): number => {
    if (precise) {
      const fixed = policy.constantCollectionLength?.(node);
      if (fixed !== undefined) {
        if (!Number.isSafeInteger(fixed) || fixed < 0 || fixed > policy.limits.collection) fail("The interactive collection exceeds this page's finite bounds.");
        return fixed;
      }
    }
    if (node.k === 'Arr') return precise ? node.els.length : Math.max(node.els.length, ...node.els
      .map(value => arrayBound(value, visiting, locals, precise)));
    if (node.k === 'Obj') return Math.max(0, ...node.entries.map(([, value]) => arrayBound(value, visiting, locals, precise)));
    if (node.k === 'Ref' && locals.has(node.n)) return locals.get(node.n)!;
    if (node.k === 'Ref' && statements.has(node.n) && !visiting.has(node.n)) {
      const key = `${precise ? 'outer' : 'descendant'}:${node.n}`;
      if (referenceBounds.has(key)) return referenceBounds.get(key)!;
      const bound = arrayBound(statements.get(node.n)!, new Set([...visiting, node.n]), new Map(), precise);
      referenceBounds.set(key, bound); return bound;
    }
    // Native Each is Array.map: its outer length is the input length even
    // when its template reads $ui. Item descendants keep the conservative
    // pass below, so mapping an item to a large array cannot hide nesting.
    if (precise && node.k === 'Comp' && node.name === 'Each')
      return arrayBound(node.args[0], visiting, locals, true);
    if (precise && node.k === 'Comp') {
      const rule = policy.functionCardinalityRules?.[node.name];
      if (rule?.kind === 'count_argument') return node.args[rule.argument]
        ? numberUpper(node.args[rule.argument], visiting, locals) ?? policy.limits.collection : policy.limits.collection;
      if (rule?.kind === 'input_length' || rule?.kind === 'at_most_input') {
        const input = node.args[rule.argument], inputUpper = input ? knownCollectionUpper(input, visiting, locals) : undefined;
        const count = rule.countArgument === undefined || !node.args[rule.countArgument] ? undefined : numberUpper(node.args[rule.countArgument], visiting, locals);
        return Math.min(inputUpper ?? policy.limits.collection, count ?? policy.limits.collection);
      }
    }
    if (node.k === 'Comp' && node.name === 'Data' && node.args[0]?.k === 'Str')
      return policy.bindingCollectionLengths?.[node.args[0].v] ?? policy.limits.collection;
    if (node.k === 'Member' && node.obj.k === 'StateRef') return policy.stateCollectionLengths?.[node.field] ?? policy.limits.collection;
    if (node.k === 'Index' && node.obj.k === 'StateRef' && node.index.k === 'Str') return policy.stateCollectionLengths?.[node.index.v] ?? policy.limits.collection;
    if (node.k === 'Member' || node.k === 'Index') return arrayBound(node.obj, visiting, locals, false);
    if (node.k === 'Num' || node.k === 'Str' || node.k === 'Bool' || node.k === 'Null') return 0;
    return policy.limits.collection;
  };
  const collectionKind = (node: ASTNode, visiting = new Set<string>()): 'exact' | 'upper_bound' => {
    if (policy.constantCollectionLength?.(node) !== undefined) return 'exact';
    if (node.k === 'Ref' && statements.has(node.n) && !visiting.has(node.n))
      return collectionKind(statements.get(node.n)!, new Set([...visiting, node.n]));
    if (node.k === 'Comp' && node.name === 'Each') return collectionKind(node.args[0], visiting);
    return 'upper_bound';
  };
  type LoopCost = { count: number; kind: 'exact' | 'upper_bound'; templateUnits: number; units: number };
  const expansion = (node: ASTNode, visiting: ReadonlySet<string>, depth: number, locals: ReadonlyMap<string, number>,
    placedSources: Set<string>, loops: LoopCost[], statementOrdinal: number,
    location: string): number => {
    if (depth > policy.limits.depth) depthFailure('reference_expansion', depth, statementOrdinal, location);
    let size = 1;
    const charge = (amount: number) => {
      size += amount;
      if (!Number.isSafeInteger(size) || size > policy.limits.expandedNodes) {
        const loop = [...loops].sort((a, b) => b.units - a.units)[0];
        const functions = ['Field', 'AsNumber'].flatMap(name => Object.hasOwn(policy.functionHelp.entries, name)
          ? [{ name, ...policy.functionHelp.entries[name] }] : []);
        const metrics: InteractiveProgramExpansionDiagnostic = { measure: 'partial_static_expansion_upper_bound',
          estimatedSoFar: size, limit: policy.limits.expandedNodes, rawAstNodes: nodeCount, statements: statements.size,
          statementOrdinal, location: location.slice(-160),
          ...(loop ? { loop: { count: loop.count, kind: loop.kind, templateUnits: loop.templateUnits, units: loop.units } } : {}),
          referenceSemantics: 'ordinary_refs_inline',
          ...(functions.length ? { functions, read: { tool: 'read_skill', arguments: { id: policy.functionHelp.methodId,
            section: 'functions', names: functions.map(entry => entry.name), limit: functions.length } } } : {}),
          builtinRead: { tool: 'read_skill', arguments: { id: policy.functionHelp.methodId, section: 'grammar' } } };
        throw new HarnessError('interactive_program', "Interactive expansion is too large. Narrow collections or reduce nesting.", 'never', {
          rejectedDimensions: ['expandedNodes'],
          expansion: metrics,
          explanation: "expansion is a partial conservative static workload stopped at its threshold, not an exact whole-program count or UI-node count. Ordinary declaration Refs inline at each use and do not cache computed parameters or point arrays. Check collection length together with per-item templateUnits; reduce repeated parameter computation first. An existing Each may traverse an array containing one pure parameter record, then iterate the original collection in the same inline template using evaluated locals. Do not lift locals into outer declarations; keep SourceSlot outside Each. functions supplies actual current compact signatures and builtinRead the original Each grammar. Do not remove interactions or impoverish curves to pass. The complete compilation remains authoritative; no new version was published.",
        });
      }
    };
    let childOrdinal = 0;
    const add = (value: ASTNode) => charge(expansion(value, visiting, depth + 1, locals, placedSources,
      loops, statementOrdinal, `${location}/${childOrdinal++}`));
    switch (node.k) {
      case 'Ref':
        if (statements.has(node.n)) {
          if (visiting.has(node.n)) fail(`Interactive declaration ${node.n} creates a reference cycle.`);
          charge(expansion(statements.get(node.n)!, new Set([...visiting, node.n]), depth + 1, locals, placedSources,
            loops, statementOrdinal, `${location}/r`));
        }
        break;
      case 'Comp':
        if (node.name === 'SourceSlot') {
          const ref = node.args[1];
          if (ref.k !== 'Str' || locals.size || placedSources.has(ref.v))
            fail("Do not expand the same original view twice or create multiple surfaces inside Each.");
          placedSources.add(ref.v);
        }
        if (node.name === 'Each') {
          add(node.args[0]);
          const bound = arrayBound(node.args[0], visiting, locals), binder = node.args[1];
          const name = binder.k === 'Str' ? binder.v : binder.k === 'Ref' ? binder.n : '';
          const nestedBound = Math.max(bound, arrayBound(node.args[0], visiting, locals, false));
          const templateUnits = expansion(node.args[2], visiting, depth + 1,
            new Map([...locals, [name, nestedBound]]), placedSources, loops,
            statementOrdinal, `${location}/t`);
          const units = bound * templateUnits;
          loops.push({ count: bound, kind: collectionKind(node.args[0]), templateUnits, units });
          charge(units);
        } else node.args.forEach(add);
        break;
      case 'Arr': node.els.forEach(add); break;
      case 'Obj': node.entries.forEach(([, value]) => add(value)); break;
      case 'Member': add(node.obj); break;
      case 'Index': add(node.obj); add(node.index); break;
      case 'UnaryOp': add(node.operand); break;
      case 'BinOp': add(node.left); add(node.right); break;
      case 'Ternary': add(node.cond); add(node.then); add(node.else); break;
    }
    charge(0);
    return size;
  };
  let expandedNodes = 0;
  let statementOrdinal = 0;
  for (const [name, node] of statements) {
    statementOrdinal++;
    expandedNodes = Math.max(expandedNodes,
      expansion(node, new Set([name]), 0, new Map(), new Set(), [], statementOrdinal, `s${statementOrdinal}`));
  }
  return { statements, nodeCount, expandedNodes };
}
