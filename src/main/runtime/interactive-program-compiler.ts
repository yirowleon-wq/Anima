import { createHash } from 'node:crypto';
import { evaluate, evaluateRoot, isReactiveAssign, walkAST, type ASTNode, type ElementNode, type EvaluationContext, type OpenUIError } from '@openuidev/lang-core';
import { HarnessError, type InteractiveProgramInputDiagnostic } from '../../shared/harness';
import { createInteractiveLibrary, createInteractiveParser, getInteractiveProgramSpec, interactiveEvaluationFunctions,
  inspectInteractivePrimitiveProperties } from '../../shared/interactive-library';
import { interactiveFunctionMetadata, interactiveFunctionNames } from '../../shared/interactive-functions';
import { INTERACTIVE_PROGRAM_LIMITS, PROGRAM_AST_RULES, PROGRAM_LIBRARY_VERSION, initialProgramState,
  interactiveProgramDraftSchema, validateProgramState, type InteractiveProgramDocument, type InteractiveProgramDraft,
  type ProgramDataMap, type ProgramJsonValue, type ProgramStateValues } from '../../shared/interactive-program';
import { canonical } from './semantics';
import { inspectInteractiveProgram, type ProgramAstPolicy } from './interactive-program-ast';
import { INTERACTIVE_PROGRAM_METHOD_ID } from './interactive-program-guidance';

function fail(message: string): never { throw new HarnessError('interactive_program', message); }
const digest = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');
const spec = getInteractiveProgramSpec();
const primitiveNames = new Set(Object.keys(spec.components));
const functionNames = new Set([...interactiveFunctionNames, ...PROGRAM_AST_RULES.customActions]);
const functionHelp: ProgramAstPolicy['functionHelp'] = { methodId: INTERACTIVE_PROGRAM_METHOD_ID,
  entries: Object.fromEntries(Object.entries(spec.library.functions || {}).flatMap(([name, entry]) => {
    const metadata = interactiveFunctionMetadata[name];
    return metadata && functionNames.has(name) ? [[name, { signature: `@${entry.signature}`, returnKind: metadata.returnKind,
      ...(metadata.minimumArguments === undefined ? {} : { minimumArguments: metadata.minimumArguments }) }]] : [];
  })) };
const prototypeKeys = new Set(PROGRAM_AST_RULES.forbiddenMemberKeys);
type NativeParserInput = Extract<InteractiveProgramInputDiagnostic, { layer: 'native_parser' }>;
/** Project the native JSON Pointer through the fixed library schema. The
 * parser's message can contain rejected values, so it never crosses this port. */
function nativeProperty(name: string | undefined, pointer: string | undefined): NativeParserInput['errors'][number]['property'] | undefined {
  if (!name || typeof pointer !== 'string' || !Object.hasOwn(spec.schema.$defs || {}, name) || !pointer.startsWith('/')) return;
  const root = spec.schema.$defs![name] as Record<string, any>;
  let current = root;
  const path: (string | number)[] = [], parts = pointer.slice(1).split('/').map(part => part.replace(/~1/g, '/').replace(/~0/g, '~'));
  let pathComplete = parts.length <= 12;
  for (const part of parts.slice(0, 12)) {
    const properties = current.properties;
    if (properties && typeof properties === 'object' && Object.hasOwn(properties, part)) {
      path.push(part); current = properties[part];
    } else if (current.type === 'array' && /^(?:0|[1-9]\d*)$/.test(part) && Number.isSafeInteger(Number(part))
      && current.items && typeof current.items === 'object' && !Array.isArray(current.items)) {
      path.push(Number(part)); current = current.items;
    } else { pathComplete = false; break; }
    if (!current || typeof current !== 'object' || Array.isArray(current)) { pathComplete = false; break; }
  }
  if (!path.length) return;
  const parameterIndex = Object.keys(root.properties || {}).indexOf(String(path[0]));
  const tail = current as Record<string, any>, kind = tail.type === 'integer' ? 'int' : tail.type;
  const expected = typeof kind === 'string' && ['string', 'number', 'int', 'boolean', 'array', 'object', 'null'].includes(kind)
    ? kind as NonNullable<NativeParserInput['errors'][number]['property']>['expected'] : undefined;
  return { path, pathComplete, ...(parameterIndex >= 0 ? { parameterIndex } : {}), ...(expected ? { expected } : {}) };
}
function componentFailure(name: string, problem: NonNullable<ReturnType<typeof inspectInteractivePrimitiveProperties>>, statementOrdinal?: number): never {
  const definitions = spec.library.components || {};
  const definition = Object.hasOwn(definitions, name) ? definitions[name] : undefined;
  if (!definition) fail(problem.message);
  throw new HarnessError('interactive_program', problem.message, 'never', { rejectedDimensions: ['component_properties'],
    component: { name, signature: definition.signature, ...(statementOrdinal === undefined ? {} : { statementOrdinal }), issues: problem.issues.slice(0, 4),
      read: { tool: 'read_skill', arguments: { id: INTERACTIVE_PROGRAM_METHOD_ID, section: 'components', names: [name], limit: 1 } } },
    explanation: "component supplies the current signature. issues identifies fields or numeric indexes located this time; original values remain in the source. parameterIndex is zero-based into the signature; statementOrdinal is one-based into the original declaration. With repeated component kinds inside a declaration, inspect that declaration to identify the exact instance. Follow attached read entries for parameter documentation and continue repairing this same work." });
}

/** Bound data remains a live projection; neither this clone nor its digest is
 * a new source owner or permission to restore it from history. */
function admittedData(aliases: readonly string[], raw?: ProgramDataMap): ProgramDataMap {
  if (aliases.some(alias => !raw || !Object.hasOwn(raw, alias)))
    throw new HarnessError('interactive_program_data_unavailable', "The original data for this interaction has not been reread. Reconnect its source first.");
  let count = 0;
  const copy = (value: unknown, depth: number): ProgramJsonValue => {
    if (++count > INTERACTIVE_PROGRAM_LIMITS.evaluationSteps || depth > INTERACTIVE_PROGRAM_LIMITS.depth)
      fail("The bound-data structure is too large. Narrow the actual read scope first.");
    if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
    if (typeof value === 'number') { if (!Number.isFinite(value)) fail("Bound data contains a nonfinite number."); return value; }
    if (Array.isArray(value)) {
      if (value.length > INTERACTIVE_PROGRAM_LIMITS.collection) fail("The bound sequence is too long. Read a bounded portion; no tail was silently truncated.");
      return Object.freeze(value.map(item => copy(item, depth + 1))) as unknown as ProgramJsonValue[];
    }
    if (!value || typeof value !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(value)))
      fail("Bound data must be delivered ordinary JSON values.");
    const tagged = value as Record<string, unknown>;
    if (Object.hasOwn(tagged, '__reactive') || typeof tagged.k === 'string'
      && ['Comp', 'Str', 'Num', 'Bool', 'Null', 'Arr', 'Obj', 'Ref', 'Ph', 'StateRef', 'RuntimeRef', 'BinOp', 'UnaryOp', 'Ternary', 'Member', 'Index', 'Assign'].includes(tagged.k)
      || tagged.type === 'element' && typeof tagged.typeName === 'string')
      fail("Bound data contains reserved interpreter markers. Select the needed ordinary fields or text.");
    const result: Record<string, ProgramJsonValue> = Object.create(null);
    for (const [key, child] of Object.entries(value)) {
      if (prototypeKeys.has(key)) fail("These data contain unavailable object fields. Select the exact needed portion.");
      result[key] = copy(child, depth + 1);
    }
    return Object.freeze(result);
  };
  return Object.freeze(Object.fromEntries(aliases.map(alias => [alias, copy(raw![alias], 0)])));
}
function largestCollection(value: ProgramJsonValue): number {
  if (Array.isArray(value)) return Math.max(value.length, 0, ...value.map(largestCollection));
  if (value && typeof value === 'object') return Math.max(0, ...Object.values(value).map(largestCollection));
  return 0;
}
function programHash(program: Pick<InteractiveProgramDocument, 'sourceDsl' | 'states' | 'bindingAliases' | 'sourceSlots' | 'provenance' | 'initialState' | 'initialStateMode' | 'initialInputFields'>, data: ProgramDataMap) {
  return digest({ libraryVersion: PROGRAM_LIBRARY_VERSION, sourceDsl: program.sourceDsl, states: program.states,
    bindingAliases: program.bindingAliases, sourceSlots: program.sourceSlots || [], data: digest(data), provenance: program.provenance,
    ...(program.initialStateMode === 'admitted_seed' ? { initialStateMode: program.initialStateMode, initialState: program.initialState,
      ...(program.initialInputFields?.length ? { initialInputFields: program.initialInputFields } : {}) } : {}) });
}
export interface InteractiveProgramEvaluation {
  inputs: ProgramStateValues;
  root: ElementNode;
  nodeIds: string[];
  stats: InteractiveProgramDocument['stats'];
}

function evaluateProgram(sourceDsl: string, states: InteractiveProgramDocument['states'], inputs: ProgramStateValues,
  aliases: readonly string[], data: ProgramDataMap, sourceSlots: readonly string[]): InteractiveProgramEvaluation & { dsl: string } {
  const library = createInteractiveLibrary({ data });
  const nativeFunctions = interactiveEvaluationFunctions(library);
  let steps = 0;
  const charge = () => { if (++steps > INTERACTIVE_PROGRAM_LIMITS.evaluationSteps) fail("This computation exceeds the finite workload. Narrow its content."); };
  const functions: NonNullable<EvaluationContext['functions']> = Object.fromEntries(Object.entries(nativeFunctions).map(([name, definition]) =>
    [name, { ...definition, fn: (args: unknown) => { charge(); return definition.fn(args); } }]));
  const reports: string[] = [];
  let statements: ReadonlyMap<string, ASTNode> = new Map();
  const resolving = new Set<string>(), values = new Map<string, unknown>();
  const context: EvaluationContext = {
    getState(name) { charge(); return name === PROGRAM_AST_RULES.stateRoot ? inputs : undefined; },
    resolveRef(name) {
      charge();
      if (values.has(name)) return values.get(name);
      const node = statements.get(name);
      if (!node || resolving.has(name)) fail("An interactive reference is missing or cyclic.");
      resolving.add(name);
      try { const value = evaluate(node, context, { library }); values.set(name, value); return value; }
      finally { resolving.delete(name); }
    },
    functions, actions: library.toJSONSchema().actions, reportError(message) { reports.push(message); },
  };
  const stateKinds = Object.fromEntries(Object.entries(states).map(([key, state]) => [key,
    state.kind === 'number' || state.kind === 'boolean' ? state.kind : state.kind === 'text' || state.kind === 'choice' ? 'string' : 'unknown'])) as ProgramAstPolicy['stateKinds'];
  const stateLengths = Object.fromEntries(Object.entries(states).flatMap(([key, state]) => state.kind === 'sequence' ? [[key, state.maxItems]] : []));
  const stateNumberMaxima = Object.fromEntries(Object.entries(states).flatMap(([key, state]) => state.kind === 'number' ? [[key, state.max]] : []));
  const fixedLengths = new WeakMap<ASTNode, number | undefined>();
  const fixedNumbers = new WeakMap<ASTNode, number | undefined>();
  const independentReferences = new Map<string, boolean>();
  const stateIndependent = (node: ASTNode, visiting: ReadonlySet<string>): boolean => {
    switch (node.k) {
      case 'StateRef': case 'Assign': case 'RuntimeRef': case 'Ph': return false;
      case 'Ref': {
        if (!statements.has(node.n) || visiting.has(node.n)) return false;
        if (independentReferences.has(node.n)) return independentReferences.get(node.n)!;
        const independent = stateIndependent(statements.get(node.n)!, new Set([...visiting, node.n]));
        independentReferences.set(node.n, independent); return independent;
      }
      case 'Comp': return node.name !== 'Each' && !primitiveNames.has(node.name) && node.args.every(arg => stateIndependent(arg, visiting));
      case 'Arr': return node.els.every(arg => stateIndependent(arg, visiting));
      case 'Obj': return node.entries.every(([, arg]) => stateIndependent(arg, visiting));
      case 'Member': return stateIndependent(node.obj, visiting);
      case 'Index': return stateIndependent(node.obj, visiting) && stateIndependent(node.index, visiting);
      case 'BinOp': return stateIndependent(node.left, visiting) && stateIndependent(node.right, visiting);
      case 'UnaryOp': return stateIndependent(node.operand, visiting);
      case 'Ternary': return stateIndependent(node.cond, visiting) && stateIndependent(node.then, visiting) && stateIndependent(node.else, visiting);
      default: return true;
    }
  };
  const policy: ProgramAstPolicy = { components: primitiveNames, functions: functionNames, bindingNames: new Set(aliases), sourceSlots: new Set(sourceSlots), stateKinds, functionHelp,
    stateCollectionLengths: stateLengths, stateNumberMaxima,
    bindingCollectionLengths: Object.fromEntries(Object.entries(data).map(([alias, value]) => [alias, largestCollection(value)])),
    functionCardinalityRules: Object.fromEntries(Object.entries(interactiveFunctionMetadata).flatMap(([name, metadata]) =>
      metadata.cardinalityRule ? [[name, metadata.cardinalityRule]] : [])),
    functionKinds: Object.fromEntries(Object.entries(interactiveFunctionMetadata).map(([name, metadata]) => [name,
      metadata.returnKind === 'boolean' || metadata.returnKind === 'boolean?' || metadata.returnKind === 'number?' ? metadata.returnKind
        : metadata.returnKind === 'text?' ? 'string?' : 'unknown'])),
    functionReturnRules: Object.fromEntries(Object.entries(interactiveFunctionMetadata).flatMap(([name, metadata]) =>
      metadata.returnRule ? [[name, metadata.returnRule]] : [])),
    functionMinimumArguments: Object.fromEntries(Object.entries(interactiveFunctionMetadata).flatMap(([name, metadata]) =>
      metadata.minimumArguments === undefined ? [] : [[name, metadata.minimumArguments]])),
    limits: { bytes: INTERACTIVE_PROGRAM_LIMITS.dslBytes, tokens: INTERACTIVE_PROGRAM_LIMITS.tokens, depth: INTERACTIVE_PROGRAM_LIMITS.depth,
      statements: INTERACTIVE_PROGRAM_LIMITS.statements, nodes: INTERACTIVE_PROGRAM_LIMITS.expandedNodes,
      collection: INTERACTIVE_PROGRAM_LIMITS.collection, expandedNodes: INTERACTIVE_PROGRAM_LIMITS.expandedNodes },
    constantCollectionLength(node) {
      if (fixedLengths.has(node)) return fixedLengths.get(node);
      if (!stateIndependent(node, new Set())) { fixedLengths.set(node, undefined); return; }
      const value = evaluate(node, context, { library });
      const length = Array.isArray(value) ? value.length : undefined;
      fixedLengths.set(node, length); return length;
    },
    constantNumber(node) {
      if (fixedNumbers.has(node)) return fixedNumbers.get(node);
      if (!stateIndependent(node, new Set())) { fixedNumbers.set(node, undefined); return; }
      const value = evaluate(node, context, { library });
      const number = typeof value === 'number' && Number.isFinite(value) ? value : undefined;
      fixedNumbers.set(node, number); return number;
    },
  };
  // Build the native statement map first. Expansion inspection then has the
  // same pure resolver for exact state-independent collection cardinality.
  const initialInspection = inspectInteractiveProgram(sourceDsl, { ...policy, constantCollectionLength: undefined, constantNumber: undefined }, false);
  statements = initialInspection.statements;
  // A finite trajectory does not change its own endpoints as $ui advances.
  // Check every declared branch through the same native evaluator, including
  // Motion nodes not materialized by the initial condition.
  let motionStatementOrdinal = 0;
  for (const statement of statements.values()) {
    motionStatementOrdinal++;
    walkAST(statement, node => {
      if (node.k !== 'Comp' || node.name !== 'Motion') return;
      const frames = node.args[1];
      if (!frames || !stateIndependent(frames, new Set())) fail("Motion frames require finite pure expressions independent of adjustable inputs and Each locals.");
      const problem = inspectInteractivePrimitiveProperties('Motion', { id: 'motion-frame-boundary',
        frames: evaluate(frames, context, { library }) }, states);
      if (problem) componentFailure('Motion', problem, motionStatementOrdinal);
    });
  }
  const inspection = inspectInteractiveProgram(sourceDsl, policy);
  statements = inspection.statements;
  values.clear();
  const dsl = `${PROGRAM_AST_RULES.stateRoot} = ${JSON.stringify(initialProgramState(states))}\n${sourceDsl}`;
  const parsed = createInteractiveParser().parse(dsl);
  if (parsed.meta.incomplete || parsed.meta.unresolved.length || parsed.meta.errors.length || parsed.queryStatements.length || parsed.mutationStatements.length) {
    const counts = { incomplete: parsed.meta.incomplete ? 1 : 0, unresolved: parsed.meta.unresolved.length,
      parseErrors: parsed.meta.errors.length, query: parsed.queryStatements.length, mutation: parsed.mutationStatements.length };
    const flags = { incomplete: parsed.meta.incomplete, unresolved: counts.unresolved > 0,
      parseErrors: counts.parseErrors > 0, query: counts.query > 0, mutation: counts.mutation > 0 };
    const ordinals = new Map([...inspection.statements.keys()].map((name, index) => [name, index + 1]));
    const errors: NativeParserInput['errors'] = parsed.meta.errors.slice(0, 4).map(error => {
      const statementOrdinal = error.statementId === undefined ? undefined : ordinals.get(error.statementId);
      const name = error.component;
      const components = spec.library.components || {}, functions = spec.library.functions || {};
      let contract: NativeParserInput['errors'][number]['contract'];
      if (typeof name === 'string' && (Object.hasOwn(components, name) || Object.hasOwn(functions, name))) {
        const component = Object.hasOwn(components, name), definition = component ? components[name] : functions[name];
        contract = { kind: component ? 'component' : 'function', name,
          signature: `${component ? '' : '@'}${definition.signature}`,
          read: { tool: 'read_skill', arguments: { id: INTERACTIVE_PROGRAM_METHOD_ID,
            section: component ? 'components' : 'functions', names: [name], limit: 1 } } };
      }
      const property = nativeProperty(name, error.path);
      return { code: error.code, ...(statementOrdinal === undefined ? {} : { statementOrdinal }), ...(property ? { property } : {}), ...(contract ? { contract } : {}) };
    });
    const input: NativeParserInput = { tool: 'present_view', layer: 'native_parser', flags, counts, errors };
    throw new HarnessError('interactive_program_parse', "This view's source has not connected successfully. The parse result and continuation methods follow.", 'never', {
      rejectedDimensions: ([['native_parser.incomplete', flags.incomplete], ['native_parser.unresolved', flags.unresolved],
        ['native_parser.parse_errors', flags.parseErrors], ['native_parser.query', flags.query], ['native_parser.mutation', flags.mutation]] as const)
        .filter(([, blocked]) => blocked).map(([name]) => name), input,
      explanation: "input.flags/counts record this native parse. unresolved counts undefined references; orphaned counts unused declarations. statementOrdinal is one-based in original source. property.path uses fixed component fields and array indexes; parameterIndex is zero-based into the signature. With repeated component names, locate the declaration then inspect its source. pathComplete=false means traversal stopped before an unknown or record key. expected supplies the shared type; contract supplies current signature and read. Feedback describes only known positions, types, and reading methods; inspect the original input for its content.",
    });
  }
  if (Object.keys(parsed.stateDeclarations).length !== 1 || !Object.hasOwn(parsed.stateDeclarations, PROGRAM_AST_RULES.stateRoot))
    fail("Interactive content can use only one host-generated $ui record.");
  const errors: OpenUIError[] = [];
  const root = evaluateRoot(parsed, { ctx: context, library, store: null, errors });
  if (!root || reports.length || errors.some(error => error.severity !== 'warning')) fail("Interactive expressions cannot be fully evaluated under these conditions. Revise the affected relationship.");
  const nodeIds: string[] = [], identities = new Set<string>(), placedSources = new Set<string>();
  let materialized = 0;
  const walkChildren = (value: unknown, slot: 'view' | 'graphic', depth: number): void => {
    if (value === null || value === undefined) return;
    if (Array.isArray(value)) {
      if (value.length > INTERACTIVE_PROGRAM_LIMITS.expandedNodes) fail("Children exceed this page's finite expansion bounds.");
      for (const child of value) walkChildren(child, slot, depth + 1);
      return;
    }
    if (typeof value !== 'object' || (value as ElementNode).type !== 'element') fail("Children must be actual interactive components.");
    walk(value as ElementNode, slot, depth);
  };
  const walk = (node: ElementNode, slot: 'root' | 'view' | 'graphic', depth: number): void => {
    if (++materialized > INTERACTIVE_PROGRAM_LIMITS.expandedNodes || depth > INTERACTIVE_PROGRAM_LIMITS.depth) fail("View expansion exceeds this page's finite bounds.");
    const metadata = spec.components[node.typeName];
    if (!metadata || slot === 'root' && metadata.kind !== 'document' || slot !== 'root' && metadata.kind === 'document'
      || slot === 'view' && metadata.kind === 'graphic' || slot === 'graphic' && ['view', 'source'].includes(metadata.kind)) fail("Place a component inside a container that actually supports it.");
    const problem = inspectInteractivePrimitiveProperties(node.typeName, node.props, states);
    if (problem) componentFailure(node.typeName, problem);
    const id = node.props.id;
    if (typeof id !== 'string' || identities.has(id)) fail("Every expanded component needs a unique stable node address.");
    identities.add(id); nodeIds.push(id);
    if (metadata.kind === 'source') {
      const ref = node.props.ref;
      if (typeof ref !== 'string' || !sourceSlots.includes(ref) || placedSources.has(ref))
        fail("An original surface requires the unique exact address admitted this round.");
      placedSources.add(ref);
    }
    if (metadata.kind === 'document') {
      if (!isReactiveAssign(node.props.ui) || node.props.ui.target !== PROGRAM_AST_RULES.stateRoot
        || node.props.ui.expr.k !== 'StateRef' || node.props.ui.expr.n !== '$value') fail("A document may bind directly only to the host's $ui record.");
    }
    if (!metadata.childSlot && node.props.children !== undefined) fail("This component has no child slot.");
    if (metadata.childSlot) {
      const childSlot = metadata.childSlot === 'same' ? slot === 'graphic' ? 'graphic' : 'view' : metadata.childSlot;
      walkChildren(node.props.children, childSlot, depth + 1);
    }
  };
  walk(root, 'root', 0);
  return { inputs, root, nodeIds, dsl, stats: { statements: inspection.statements.size, astNodes: inspection.nodeCount,
    expandedNodes: Math.max(inspection.expandedNodes, materialized) } };
}

export function compileInteractiveProgram(raw: InteractiveProgramDraft, readonlyData: ProgramDataMap = {}, provenance?: unknown,
  sourceSlots: readonly string[] = [], admittedAliases?: readonly string[], initialInputs?: ProgramStateValues,
  initialInputFields?: readonly string[]): InteractiveProgramDocument {
  const input = interactiveProgramDraftSchema.parse(raw), aliases = [...(admittedAliases ?? input.bindings.map(binding => binding.alias))];
  if (aliases.length > INTERACTIVE_PROGRAM_LIMITS.bindings || new Set(aliases).size !== aliases.length)
    fail("Only finite, uniquely named data bindings are retained.");
  if (sourceSlots.length > 5 || new Set(sourceSlots).size !== sourceSlots.length
    || sourceSlots.some(ref => typeof ref !== 'string' || !ref.length || ref.length > 320 || /[\u0000-\u001f]/.test(ref)))
    fail("Original-surface references need finite exact addresses checked in this round.");
  const data = admittedData(aliases, readonlyData), inputs = initialInputs === undefined
    ? initialProgramState(input.states) : validateProgramState(input.states, initialInputs);
  if (initialInputFields?.length && (initialInputs === undefined || initialInputFields.length > INTERACTIVE_PROGRAM_LIMITS.states
    || new Set(initialInputFields).size !== initialInputFields.length || initialInputFields.some(key => !Object.hasOwn(input.states, key))))
    fail("Explicit input changes must belong to this complete local-input set.");
  const result = evaluateProgram(input.dsl, input.states, inputs, aliases, data, sourceSlots);
  const document: InteractiveProgramDocument = { libraryVersion: PROGRAM_LIBRARY_VERSION, dsl: result.dsl, sourceDsl: input.dsl,
    states: input.states, initialState: inputs, ...(initialInputs === undefined ? {} : { initialStateMode: 'admitted_seed' as const }),
    ...(initialInputFields?.length ? { initialInputFields: [...initialInputFields].sort() } : {}),
    bindingAliases: aliases, ...(aliases.length ? { currentData: data } : {}),
    ...(sourceSlots.length ? { sourceSlots: [...sourceSlots] } : {}),
    hash: '', nodeIds: result.nodeIds, stats: result.stats, ...(provenance === undefined ? {} : { provenance }) };
  document.hash = programHash(document, data);
  return document;
}

/** Recompute client-selected inputs; client positions, derived answers and
 * permissions never enter this function. Source admission remains its owner. */
export function validateProgramStateAndEvaluate(program: InteractiveProgramDocument, completeInputs: unknown,
  readonlyData: ProgramDataMap | undefined = program.currentData): InteractiveProgramEvaluation {
  if (program.libraryVersion !== PROGRAM_LIBRARY_VERSION) fail("This interaction uses another library version. Reopen its original content.");
  const data = admittedData(program.bindingAliases, readonlyData), inputs = validateProgramState(program.states, completeInputs);
  if (program.hash !== programHash(program, data)) throw new HarnessError('interactive_program_changed', "This interaction or its data changed. Continue from its current revision.");
  const evaluated = evaluateProgram(program.sourceDsl, program.states, inputs, program.bindingAliases, data, program.sourceSlots || []);
  return { inputs: evaluated.inputs, root: evaluated.root, nodeIds: evaluated.nodeIds, stats: evaluated.stats };
}
