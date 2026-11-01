import { generatePrompt } from '@openuidev/lang-core';
import * as z from 'zod';
import { getInteractiveProgramSpec } from '../../shared/interactive-library';
import { PROGRAM_LIBRARY_VERSION } from '../../shared/interactive-program';
import { HarnessError } from '../../shared/harness';
import type { WorkflowSkill } from './skills';

export const INTERACTIVE_PROGRAM_METHOD_ID = 'interactive-program';

/** Small public capability metadata. Actual grammar is fetched only as a
 * method; no data, persona instruction or generated demonstration lives here. */
export function interactiveProgramCapabilityHint() {
  return { libraryVersion: PROGRAM_LIBRARY_VERSION,
    method: { tool: 'read_skill', arguments: { id: INTERACTIVE_PROGRAM_METHOD_ID } },
    authoring: { tool: 'read_skill', arguments: { id: INTERACTIVE_PROGRAM_METHOD_ID, section: 'authoring' } },
    meaning: 'Make the idea under discussion into something you can explore together. Share discoveries and invitations in character. For a new creation, authoring provides the complete authoring contract; for an edit, read the original and obtain only needed additional signatures through method. Inspect implementation details during authoring and explain them when the person wants them.' };
}

type Signature = { signature: string; description?: string };
const methodWelcome = 'Compose pages, graphics, local inputs and sound freely around the current question. You remain the same companion, with your own curiosity, names and closeness: share what interests you and what a gesture can reveal. Read source details as needed during authoring and use tool feedback to revise. Bring the relationships, observed changes and your own ideas into the conversation. Explain an actual limitation and a usable way forward in your own voice when it affects the content or operation.';
const compositionGuidance = 'Build the first view around the relationship most worth seeing and trying. Keep the subject and essential operation together, placing equations, explanations and supporting controls near their roles. Directly manipulated graphics, names and current readings should be close, without a separate large paper for every parameter group. Document.title is already visible and control names already explain actions; leave room for discoveries instead of repeated headings. For axes with different units, default independent scaling can give a curve the paper width; use equal when geometric lengths and angles must be preserved. Use ink for main content, muted for supporting material and restrained accent for current attention on the warm gray paper. Let whitespace follow this creation.';
const eachValueGuidance = 'For formula-defined curves such as functions, superposed waves, decay and trajectories, prefer Curve: write one expression, put draggable quantities in params bound to $ui, and let native sampling avoid spending the general computation budget. Reserve Each/Range for real finite data sequences. Each returns finite inline-template values for component properties as well as children. Within collection and execution limits, map a finite Range to {x,y}, scalar or null values, or pass a scalar array to the actual Points function as its property signature allows. Iteration variables exist only in their inline template; do not extract a global declaration referring to them. Use actual pure functions, retain null gaps and avoid manually expanding a declaration for every point.';
const directManipulationGuidance = 'Place DragHandle on the relationship the person wants to change. For example, bind amplitude through yField and use Group to place it at the current peak; bind phase and observation time through their own xField at an axis or observation line. Group inverts the same coordinates, while the other axis and labels read shared derived quantities. Retain numeric editing for keyboard access. Curves, formulas and observations derive from the same parameters. A half-cycle phase shift cancels everywhere only when frequency and amplitude also match. Overlapping handles need separately reachable positions, and labels need readable boundary space. This illustrates content-centered manipulation, not a fixed waveform template.';
const geometricConstraintGuidance = 'For force transmission or contact, establish fixed supports, moving joints and rigid-body local points, then derive world coordinates with shared rotation and translation. Connected rod ends, supports and component origins must share those exact points rather than separately drawn approximations. Atan2(y,x) returns radians; Group.rotate uses degrees. Convert units once for the rigid body instead of duplicating transforms per vertex. A zero vector has no direction and stays unknown. Derive force directions from the same joints so connected ends cannot move inconsistently. Contact boundaries use real contours and a common scale. Visual and sound events share the contact instant; rebound must not pass through the obstacle. Screen-pixel radii and line widths differ from data coordinates and follow actual signatures. After drive disengagement, support remains attached to the moving joint. Retain the disengaged phase through the monotonic process until actual reset instead of inferring reengagement from rebound height. Simplification may omit detail while preserving retained connections and causality.';
const nullableValueGuidance = 'Choose explicitly supplies true, false and unknown branches. With a boolean-or-null condition and all three branches explicitly boolean, the result supports native boolean operators. If the result may remain null or unknown, choose an appropriate pure value for the unknown branch before && or ||. Known checks presence, meaning non-null/non-undefined; numeric and boolean kinds still need their own appropriate conditions.';
const sharedProcessGuidance = 'Document presentation=flow can interleave Papers and explanatory paragraphs sharing one $ui, keeping linked mechanisms and manipulation in the same creation. Publish a meaningful operable core first, then use its real programRef with previous+patch to add components, explanations and linkage while the person explores. Continue completing the other requirements in that same work; a published fragment does not complete the task. A held state differs from a triggered self-running process. After a body leaves its drive, Motion releaseBehavior=finish can complete a finite motion after release. For sound at contact, Voice.trigger can compare the same local clock against the contact point, firing false-to-true. A monotonic clock still records crossing at the final frame, so reduced motion completing the segment does not skip a gate true only momentarily in the middle. Choose values, phases and approximations from the actual principle.';
const processGuidance = 'Key components read the same local quantities so manipulation reveals relationships and causality. Press can be a held button in text or wrap pressable Rect/Polygon geometry in Graphic. field expresses holding and triggerField a new strike; a free phase after drive release can continue on an independent Motion track. Voice belongs in view containers such as Document/Flow and reads the same state as graphics; one collision gives one strike. A user-started finite Motion can produce a delayed strike by changing an integer triggerField once at contact; gate controls sustained energy. Retain input parameters and observation positions. Declare held states, sound gates, pedals and advancing time/event counters transient:true so reopening uses declared initial values and stays quiet. A few nearby controls are often sufficient; the host places the sound entrance on the same page. Consult real signatures and feedback for fields and limits.';
const causalTimeGuidance = 'Separate sustained force, drive disengagement, single contact, free vibration and damping contact, then give them a shared process clock. Press represents real hold and release; an automatic process started by a click is not a release gesture. Press.values can select an object and latch initial force, frequency and other conditions on actual press in the same checked update as the held gate. Do not infer initial energy from pressure already zero after release. Fire sound at actual contact, without repeating collisions while held or deleting free motion upon release. Initial action quantities may be written on a Motion first frame to independent transient numeric tracks for later frames. Slow motion stretches visible mechanism time while pitch follows physical parameters; explicitly identify any deliberate audio time-scale change. A damping gate represents releasing sustain or contact damping, separately from a master sound switch. Sustain changes energy decay instead of striking again; continuous energy input differs from natural decay. AudioTrace displays actual digital samples from the same synthesis output. A formula Curve and sampled output have different roles; mute must not draw fake sounding samples. Graphics, readings and the next sound retain the same parameter relationships. Explain the simplified model versus a real device where the difference affects understanding.';
const pianoGuidance = 'Piano can show 88 keys, chords, sustain, the actual digital waveform and a user-controlled action on one page. Sound is modal synthesis with independently decaying harmonics, not measured sample recordings. Four independent local fields suffice: held is number sequence (initial:[], min:21, max:108, maxItems:88, transient:true); selected is number (initial:60, min:21, max:108, step:1); pedal is boolean (initial:false, transient:true); phase is number (initial:0, min:0, max:1, transient:true). Bind further force, slow-motion factor, string length/tension/linear-density ratios and brightness through current numeric fields and nearby Number controls to the corresponding Piano parameters. Let the keyboard and one mechanism be the main subject instead of adding a dark dashboard. Keep equations and discoveries near their parameters. Piano supplies its own continuation entrance and actual AudioTrace; do not duplicate sound switches or waveform views. String ratios explore an ideal string; a specific piano requires actual sources. Slow motion changes mechanism time, preserving pitch. A new user key press immediately takes over instead of queuing the old demonstration.';
const creationExample = 'For an ideal pendulum, explain fixed string length, side-to-side motion, ignored friction and air drag, and the lowest point as zero gravitational potential. Invite the person to pull the bob left and see why it returns. Slow at the highest point to notice zero speed and energy in gravitational potential, then its conversion to kinetic energy. If adding resistance later, show the new assumption and energy loss. This is one example of selecting gestures and explanation from a real relationship. Choose the subject, words and page composition for the actual person and question.';
const programReadGuidance = `For an existing creation, read_interactive_program defaults to overview with a limited visual and state preview. stateOrigin/coverage identifies where values came from and actual read coverage. Read complete declarations with mode=states and needed stateKeys, following next. mode=source pages by absolute Unicode offset/limit; find locates literal text. For the whole source, explicitly use full:true and omit offset/limit/find. Overview, source pages, curve points and SourceSlot original text each retain their own coverage and reading entry.
present_view.program accepts a complete dsl or a local patch at the same work's real previous. Each patch item is a complete native declaration, replacing or adding by name; name=null explicitly deletes it. Unmentioned declarations remain unchanged. Read relevant source and actual state before choosing a complete or partial revision.
stateChanges lists explicitly changed field declarations; inputChanges lists explicitly changed input values. A local continuation uses this Enter submission's frozen inputs as identified by stateOrigin, or the original document.initialState when no formal inputs were submitted. Later live gestures belong to later operations. Retain existing declarations and values separately; only new fields start at initial, while Reset follows declared defaults. Incompatibility leaves source and inputs in place for repair. A complete dsl begins from its own states.initial.
An empty patch still requires an explicit field, input or new binding change. Reused bindings must point to currently lawful, unexpired live original material. Historical clues or missing content require rereading from the original owner. Reuse already read applicable methods; read exact names for new primitives or concrete errors.
For continuation, copy the returned previous: id is programId or published programRef.id, and expectedRevision is that version's revision or programRef.revision. This addresses the exact original version; messageId separately identifies message ownership, and the save result assigns the next revision. For a real conflict, reread the current version at its original entry.`;

function signatures(entries: Record<string, Signature> | undefined) {
  return Object.entries(entries || {}).map(([name, entry]) => ({ name,
    signature: entry.signature, ...(entry.description ? { description: entry.description } : {}) }));
}

export const interactiveProgramMethodReadFields = {
  section: z.enum(['authoring', 'overview', 'grammar', 'components', 'functions', 'actions']).optional()
    .describe('Authoring method: authoring delivers all signatures, type information and core grammar together. Prefer it for a new work; use overview when a checked current work or read original is already available. Read source and precise new or error-related names for edits. Grammar and paginated signatures remain independently readable.'),
  names: z.array(z.string().min(1).max(80)).max(16).optional()
    .describe('Exact component, function or action names copied from the overview. Omit to page in catalog order.'),
  offset: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional().describe('Continuation position copied from methodRead.next.'),
  limit: z.number().int().min(1).max(12).optional().describe('Complete signature entries per page, default 6. names and offset select this page; copy next to continue. Individual signatures are never truncated.'),
};
export type InteractiveProgramMethodRead = { section?: 'authoring' | 'overview' | 'grammar' | 'components' | 'functions' | 'actions';
  names?: string[]; offset?: number; limit?: number };
const methodReadInput = z.object(interactiveProgramMethodReadFields).strict();
type MethodSection = NonNullable<InteractiveProgramMethodRead['section']>;
type MethodReadLink = { tool: 'read_skill'; arguments: { id: typeof INTERACTIVE_PROGRAM_METHOD_ID; section: MethodSection;
  names?: string[]; offset?: number; limit?: number } };
type OverviewRead = { section: 'authoring' | 'overview' | 'grammar';
  coverage: { scope: 'authoring_contract' | 'overview_and_name_catalogs' | 'grammar_only'; complete: true; wholeMethodProvided: false;
    signatures?: { components: number; functions: number; actions: number }; scalarSchemaProvided?: false; parameterConstraintsProvided?: true; toolSchemaProvided?: false };
  sections: Record<string, MethodReadLink>; next: null; meaning: string };
export type SignatureRead = { section: 'components' | 'functions' | 'actions'; names?: string[]; unknownNames?: string[];
  coverage: { scope: 'requested_names' | 'whole_section'; offset: number; returned: number; total: number; catalogTotal: number;
    complete: boolean; wholeMethodProvided: false };
  next: MethodReadLink | null; meaning: string };
export type MethodReadMetadata = OverviewRead | SignatureRead;
type ProgramSpec = ReturnType<typeof getInteractiveProgramSpec>;
type MethodEntry = Signature & { name: string; kind?: string; childSlot?: string; stateKind?: string }
  & Partial<ProgramSpec['functions'][string]>;
function methodCatalogs(actual: ProgramSpec): Record<'components' | 'functions' | 'actions', MethodEntry[]> {
  return {
    components: signatures(actual.library.components).map(entry => ({ ...entry, ...actual.components[entry.name] })),
    functions: signatures(actual.library.functions).map(entry => ({ ...entry, signature: `@${entry.signature}`, ...actual.functions[entry.name] })),
    actions: signatures(actual.library.actions).map(entry => ({ ...entry, signature: `@${entry.signature}` })),
  };
}
function signatureLine(entry: Signature & { name: string }) {
  const { name: _name, signature, description, ...metadata } = entry;
  return signature + (description ? ' — ' + description : '')
    + (Object.keys(metadata).length ? ' ' + JSON.stringify(metadata) : '');
}

/** A projection of this library's real schema, never a second set of rules. */
function parameterConstraints(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const schema = raw as Record<string, unknown>, result: Record<string, unknown> = {};
  for (const key of ['$ref', 'type', 'const', 'enum', 'default', 'required', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum',
    'multipleOf', 'minLength', 'maxLength', 'pattern', 'format', 'minItems', 'maxItems', 'uniqueItems', 'minProperties', 'maxProperties'])
    if (Object.hasOwn(schema, key)) result[key] = structuredClone(schema[key]);
  if (schema.properties && typeof schema.properties === 'object' && !Array.isArray(schema.properties))
    result.properties = Object.fromEntries(Object.entries(schema.properties).map(([name, property]) => [name, parameterConstraints(property)]));
  for (const key of ['items', 'additionalProperties', 'propertyNames']) if (Object.hasOwn(schema, key)) result[key] = parameterConstraints(schema[key]);
  for (const key of ['anyOf', 'oneOf', 'allOf']) if (Array.isArray(schema[key]))
    result[key] = [...new Map(schema[key].map(value => { const part = parameterConstraints(value); return [JSON.stringify(part), part]; })).values()];
  return result;
}

/** Return only the requested complete part. A full-method identity in the
 * descriptor never means that omitted signatures were delivered/read. */
export function interactiveProgramMethodPage(raw: InteractiveProgramMethodRead = {}): { instructions: string; methodRead: MethodReadMetadata } {
  const input = methodReadInput.parse(raw), section = input.section || 'overview';
  const names = input.names?.length ? [...new Set(input.names)] : undefined;
  const offset = input.offset || 0, limit = input.limit || 6;
  if ((section === 'authoring' || section === 'overview' || section === 'grammar') && (names?.length || offset
    || section === 'authoring' && input.limit !== undefined))
    throw new HarnessError('method_part_parameters', 'authoring is a complete page: omit names, offset and limit. overview and grammar are also whole pages. Choose components, functions or actions to select signatures by name or position.');
  const actual = getInteractiveProgramSpec(), catalogs = methodCatalogs(actual);
  const { syntax, builtins: nativeBuiltins } = nativeLibraryGuidance(actual);
  const builtins = '## Allowed native functions\n' + nativeBuiltins.join('\n');
  const grammar = [syntax,
    'Ordinary Ref declarations inline at each use; splitting declarations does not cache intermediate results. For a long pure derivation, Each can traverse an array containing one parameter record, read the evaluated local record inside the same inline template, then derive the next finite record. Every stage retains depth and collection limits. Local variables remain inside their template, never global declarations referring to that variable. Use strict actual pure functions for numeric and unknown values. Keep SourceSlot outside Each.',
    '## Accepted language rules\n' + JSON.stringify(actual.rules),
    builtins, '## Runtime limits\n' + JSON.stringify(actual.limits)].join('\n\n');
  const read = (part: MethodSection, position?: number): MethodReadLink => ({ tool: 'read_skill', arguments: {
    id: INTERACTIVE_PROGRAM_METHOD_ID, section: part, ...(names ? { names } : {}),
    ...(position !== undefined ? { offset: position, limit } : {}) } });
  if (section === 'authoring') {
    const prelude = workflowIntroduction(actual).join('\n\n');
    return { instructions: [prelude, grammar,
      '## Complete component signatures and parameter constraints\n' + catalogs.components.map(entry => signatureLine(entry)
        + '\nparameterConstraints: ' + JSON.stringify(parameterConstraints(actual.schema.$defs?.[entry.name]))).join('\n\n'),
      '## Complete pure-function signatures and strict metadata\n' + catalogs.functions.map(signatureLine).join('\n\n'),
      '## Complete local-action signatures\n' + catalogs.actions.map(signatureLine).join('\n\n'),
      'parameterConstraints projects required/default, enums, numeric and length bounds and nested references from the current shared definition. default is a default the native component can supply; $ref names a definition in the same library. This page supplies authoring signatures, compact constraints and core grammar. Read full scalar schema through components/names; the present_view envelope is in its tool schema. For edits, use the real original and read new or error-related entries, reusing already applicable signatures.',
    ].join('\n\n'), methodRead: { section,
      coverage: { scope: 'authoring_contract', complete: true, wholeMethodProvided: false,
        signatures: { components: catalogs.components.length, functions: catalogs.functions.length, actions: catalogs.actions.length },
        scalarSchemaProvided: false, parameterConstraintsProvided: true, toolSchemaProvided: false },
      sections: Object.fromEntries((['overview', 'grammar', 'components', 'functions', 'actions'] as const).map(part => [part, read(part)])),
      next: null, meaning: 'This page contains all authoring signatures, compact parameter constraints and core grammar. Follow section entries for parameter detail. It describes methods; source reading and business actions still follow their own agreements.' } };
  }
  if (section === 'overview' || section === 'grammar') {
    const minimalSyntax = syntax.split('\n').filter(line => /^(?:[123]\.|- Strings)/.test(line)).join('\n');
    const builtinSignatures = builtins.split('\n').filter(line => line.startsWith('@'));
    const componentNamesByKind: Record<string, string[]> = {};
    for (const entry of catalogs.components) (componentNamesByKind[entry.kind || 'unknown'] ??= []).push(entry.name);
    const instructions = section === 'grammar' ? grammar : [
      methodWelcome,
      `Interactive content remains in the original message. Put DSL in present_view.program with libraryVersion=${actual.libraryVersion}; consult the current tool schema for states/bindings/previous. The host supplies $ui for read-only DSL access; finite local actions perform writes. Invoke components by name, pure functions and local actions with @name, using positional arguments.`,
      compositionGuidance,
      processGuidance,
      causalTimeGuidance,
      pianoGuidance,
      sharedProcessGuidance,
      geometricConstraintGuidance,
      directManipulationGuidance,
      'Compute with actual pure functions, preserving null and gaps. Data binds an observationId genuinely read this turn and a literal JSON path. Earlier assistant text, bindingOrigins and priorDelivery can locate the original owner for a current read. Local inputs are hypotheses inside this creation, distinct from real personal facts, preferences and actions. Edit at the real previous id/revision. Continue returns content to the same composer, preserving the original and leaving send to the person. ' + nullableValueGuidance,
      programReadGuidance,
      '## Minimal native syntax\n' + minimalSyntax,
      'Reuse ordinary declarations by name; displayed declarations must be reachable from root. Component argument order follows its actual signature. Read full grammar, operators, indexing and finite limits when needed. Use already delivered applicable methods instead of making whole-guide loading a prerequisite.',
      '## Allowed native functions\n' + builtinSignatures.join('\n'),
      actual.rules.allowedBuiltins.includes('Each')
        ? 'Each templates inline at their position. varName is visible only inside its template, never a new global name. Return finite point objects, scalars, nulls or component arrays only to properties or children accepting that actual kind.' : '',
      'SourceSlot retains the original surface and selection entry through a sceneRef supplied this turn. For computation, obtain Data through the original reading entry. Local actions manipulate this creation; real note saves and calendar edits use their own business entries.',
      '## Component names by kind; read signatures separately\n' + JSON.stringify(componentNamesByKind),
      '## Pure-function names; read signatures separately\n' + catalogs.functions.map(entry => entry.name).join(', '),
      '## Local-action signatures\n' + catalogs.actions.map(signatureLine).join('\n'),
      'Read the needed signatures through methodRead.sections with exact names. The catalog locates entries; signatures supply actual parameters. Each page contains complete entries; copy next for more. Start authoring when methods already suffice, then revise the same work from concrete feedback.',
    ].filter(Boolean).join('\n\n');
    return { instructions, methodRead: { section, coverage: { scope: section === 'overview' ? 'overview_and_name_catalogs' : 'grammar_only', complete: true, wholeMethodProvided: false },
      sections: Object.fromEntries((['grammar', 'components', 'functions', 'actions'] as const).map(part => [part, read(part)])),
      next: null, meaning: section === 'grammar'
        ? 'This page contains grammar and admitted scope. Read component, function and action signatures through the section entries as needed.'
        : 'This page contains authoring ideas, basic use and name catalogs. Read needed parameter contracts below; start when the available method is sufficient.' } };
  }
  const catalog = catalogs[section];
  const selected = names ? names.flatMap(name => { const row = catalog.find(entry => entry.name === name); return row ? [row] : []; }) : catalog;
  const page = selected.slice(offset, offset + limit), nextOffset = offset + page.length < selected.length ? offset + page.length : null;
  const delivered = section === 'components' ? page.map(entry => ({ ...entry,
    parameterSchema: actual.schema.$defs?.[entry.name],
  })) : page;
  return { instructions: `## ${section} · shared library ${actual.libraryVersion}\n` + delivered.map(signatureLine).join('\n\n')
    + (section === 'components' ? '\n\nparameterSchema supplies this component fields, choices, defaults and bounds. Argument order follows the same signature; $ref names a definition in this library. Read another exact catalog name when another component is needed.' : ''),
    methodRead: { section, ...(names ? { names, unknownNames: names.filter(name => !catalog.some(entry => entry.name === name)) } : {}),
      coverage: { scope: names ? 'requested_names' : 'whole_section', offset, returned: page.length,
        total: selected.length, catalogTotal: catalog.length, complete: nextOffset === null, wholeMethodProvided: false },
      next: nextOffset === null ? null : read(section, nextOffset),
      meaning: page.length === 0 ? 'This page has no entries. Check catalog names and offset, then select the required portion.'
        : nextOffset === null ? 'This is the final page of the selected scope; each entry is complete. Return to the catalog for other components.'
          : 'These signatures are complete, with further entries in this scope. Copy next to continue, or begin authoring if these methods suffice.' } };
}

/** The native generator supplies syntax; its default tool/actions tutorial
 * is deliberately not injected into this host's smaller admitted language. */
function nativeLibraryGuidance(actual: ProgramSpec): { syntax: string; builtins: string[] } {
  const syntaxPrompt = generatePrompt({ ...actual.library, components: {}, componentGroups: [],
    functions: {}, actions: {}, tools: [], toolCalls: false, bindings: false, builtinFunctions: false,
    examples: [], toolExamples: [], editMode: false, inlineMode: false, preamble: '', additionalRules: [] });
  const start = syntaxPrompt.indexOf('## Syntax Rules\n');
  const end = syntaxPrompt.indexOf('\n## ', start + 1);
  if (start < 0) throw new Error('The current OpenUI library did not provide readable native syntax guidance.');
  const syntax = syntaxPrompt.slice(start, end < 0 ? undefined : end).trim();
  const builtinPrompt = generatePrompt({ ...actual.library, components: {}, componentGroups: [],
    functions: {}, actions: {}, tools: [], toolCalls: false, bindings: false, builtinFunctions: true,
    examples: [], toolExamples: [], editMode: false, inlineMode: false, preamble: '', additionalRules: [] });
  const lines = builtinPrompt.split('\n');
  const builtins = actual.rules.allowedBuiltins.map(name => {
    const signature = lines.find(line => line.startsWith(`@${name}(`));
    if (!signature) throw new Error(`The current OpenUI library did not provide the native signature for ${name}.`);
    return signature;
  });
  return { syntax, builtins };
}

/** Section identity is structural; localized prose is never a slicing key. */
function workflowIntroduction(actual: ProgramSpec): string[] {
  return [
    methodWelcome,
    'Choose what is worth manipulating and what it reveals from the current question, then author the creation. Explain naturally in ordinary text where sufficient; compose shared primitives for relationships worth exploring by hand. Earlier creations can inform new choices.',
    compositionGuidance,
    processGuidance,
    causalTimeGuidance,
    pianoGuidance,
    sharedProcessGuidance,
    geometricConstraintGuidance,
    directManipulationGuidance,
    creationExample,
    `Put DSL in present_view.program with libraryVersion=${actual.libraryVersion}. The current tool schema defines states, bindings and previous. Declare finite local inputs in states so the host supplies one $ui initial state. DSL reads it as a read-only expression; local actions change inputs, while source data remains with its original owner.`,
    'After genuinely reading permitted material this turn, bind its observationId and literal JSON path to an alias for Data. Original explanations, labels and computational assumptions can be authored directly, retaining their creative or hypothetical identity. User gestures and inputs explore this creation; retained preferences, real decisions and business state use their corresponding original operations.',
    'Assistant history can locate origins. To use its material, follow actual returned creation, note or other owner entries for a current-purpose read, then give Data the new observationId. bindingOrigins, priorDelivery and sourceNavigation in an original program read retain old provenance. Follow those leads to exact currently usable content and addresses, leaving unfound portions unknown.',
    programReadGuidance,
    'Current library signatures and kinds follow. Invoke components directly by name and pure functions/actions as @name with positional arguments. Grammar placeholders explain positions; choose concrete parts from the real catalog. Define and reuse expressions. Numeric derivations use actual pure functions; null and zero remain different. ' + nullableValueGuidance,
    'For a same-work edit, provide previous with its real id and expectedRevision. To continue the conversation, return this node and actual local inputs to the same composer, preserve the original and let the person send. You design content, layout and shared exploration; the host manages sources, state and actual saving.',
  ];
}

export function interactiveProgramWorkflowSkill(): WorkflowSkill {
  const actual = getInteractiveProgramSpec();
  const { syntax, builtins } = nativeLibraryGuidance(actual);
  const { components, functions, actions } = methodCatalogs(actual);
  const instructions = [
    ...workflowIntroduction(actual),
    syntax,
    '## Compiler language rules\n' + JSON.stringify(actual.rules),
    '## Component signatures, purposes and containment\n' + JSON.stringify(components),
    '## Pure-function signatures and return kinds\n' + JSON.stringify(functions),
    '## Allowed native functions\n' + builtins.join('\n'),
    eachValueGuidance,
    '## Local actions\n' + JSON.stringify(actions),
    '## Runtime limits\n' + JSON.stringify(actual.limits),
    'These catalogs and rules come from the current shared library. Author with its actual signatures, then revise from real tool results and feedback. Discuss discoveries from the creation in your own voice.',
  ].join('\n\n');
  return { id: INTERACTIVE_PROGRAM_METHOD_ID, version: String(actual.libraryVersion),
    name: 'Make an idea into something to explore',
    description: 'Make the current idea into an interactive creation. For a new work, read_skill section=authoring provides signatures and grammar; for continuation, read the original and only new or error-related methods.',
    requirements: [{ kind: 'tool', name: 'present_view', purpose: 'Place the creation in its original message to explore together' }], instructions };
}
