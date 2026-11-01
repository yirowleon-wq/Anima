import * as z from 'zod/v4';

/** One version of the shared component/function contract, independent of the
 * OpenUI package version. Version 1 remains the existing Scene-only library. */
export const PROGRAM_LIBRARY_VERSION = 2 as const;
/** Opened only when the same bundle has its actual renderer and source gates. */
export const INTERACTIVE_PROGRAM_AVAILABLE = true as boolean;
export const INTERACTIVE_PROGRAM_LIMITS = {
  dslBytes: 64000, tokens: 12000, depth: 32, statements: 160,
  states: 32, stateBytes: 24000, collection: 256, sequence: 128,
  text: 4000, expandedNodes: 4096, evaluationSteps: 24000,
  bindings: 8, pathDepth: 12, motionSeconds: 30,
} as const;

const forbiddenKeys = new Set(['__proto__', 'prototype', 'constructor']);
export const programKeySchema = z.string().min(1).max(48).regex(/^[A-Za-z][A-Za-z0-9_]*$/)
  .refine(value => !forbiddenKeys.has(value), 'This name is not an available local field.');
const id = z.string().min(1).max(160);
export const programNodeIdSchema = id.refine(value => !!value.trim() && !forbiddenKeys.has(value) && !/[\u0000-\u001f\u007f]/.test(value),
  'A node address cannot be blank, a control character or a reserved object field.');
const finite = z.number().finite();
const numberState = z.object({ kind: z.literal('number'), initial: finite, min: finite, max: finite,
  step: finite.positive().optional(), transient: z.boolean().optional() }).strict();
const booleanState = z.object({ kind: z.literal('boolean'), initial: z.boolean(), transient: z.boolean().optional() }).strict();
const textState = z.object({ kind: z.literal('text'), initial: z.string().max(INTERACTIVE_PROGRAM_LIMITS.text),
  maxLength: z.number().int().min(1).max(INTERACTIVE_PROGRAM_LIMITS.text), transient: z.boolean().optional() }).strict();
const choiceState = z.object({ kind: z.literal('choice'), initial: z.string().max(160),
  options: z.array(z.string().min(1).max(160)).min(1).max(64), transient: z.boolean().optional() }).strict();
const sequenceState = z.object({ kind: z.literal('sequence'), element: z.enum(['number', 'text']),
  initial: z.array(z.union([finite, z.string().max(256)])).max(INTERACTIVE_PROGRAM_LIMITS.sequence),
  maxItems: z.number().int().min(1).max(INTERACTIVE_PROGRAM_LIMITS.sequence),
  min: finite.optional(), max: finite.optional(), maxItemLength: z.number().int().min(1).max(256).optional(), transient: z.boolean().optional() }).strict();

const aligned = (value: number, min: number, step: number) => {
  const index = (value - min) / step;
  return Number.isFinite(index) && Math.abs(index - Math.round(index)) <= 1e-7;
};
export const interactiveStateDeclarationSchema = z.discriminatedUnion('kind', [numberState, booleanState, textState, choiceState, sequenceState])
  .superRefine((state, context) => {
    const issue = (message: string) => context.addIssue({ code: 'custom', message });
    if (state.kind === 'number') {
      const span = state.max - state.min;
      if (!(span > 0) || !Number.isFinite(span) || state.initial < state.min || state.initial > state.max)
        issue('The numeric initial value needs a finite nonzero-width range.');
      if (state.step !== undefined && (state.step > span || span / state.step > 1000000 || !aligned(state.initial, state.min, state.step)))
        issue('The initial value and step must align to the same finite numeric grid.');
    } else if (state.kind === 'text') {
      if (state.initial.length > state.maxLength) issue('The text initial value exceeds its declared length.');
    } else if (state.kind === 'choice') {
      if (new Set(state.options).size !== state.options.length || !state.options.includes(state.initial))
        issue('Options must be unique and include the initial value.');
    } else if (state.kind === 'sequence') {
      if (state.initial.length > state.maxItems || state.min !== undefined && state.max !== undefined && state.min > state.max)
        issue('The sequence length or numeric range is invalid.');
      if (state.element === 'text' && (state.min !== undefined || state.max !== undefined)
        || state.element === 'number' && state.maxItemLength !== undefined)
        issue('Sequence element constraints must match their text or numeric type.');
      if (state.initial.some(value => state.element === 'number'
        ? typeof value !== 'number' || !Number.isFinite(value) || state.min !== undefined && value < state.min || state.max !== undefined && value > state.max
        : typeof value !== 'string' || value.length > (state.maxItemLength ?? 256)))
        issue('The initial sequence violates its element constraints.');
    }
  });
export type InteractiveStateDeclaration = z.infer<typeof interactiveStateDeclarationSchema>;
export const interactiveStateDeclarationsSchema = z.record(programKeySchema, interactiveStateDeclarationSchema)
  .refine(value => Object.keys(value).length <= INTERACTIVE_PROGRAM_LIMITS.states, 'There are too many local fields. Keep those needed by the current interaction.');
export type InteractiveStateDeclarations = z.infer<typeof interactiveStateDeclarationsSchema>;
export type ProgramStateValue = number | boolean | string | (number | string)[];
export type ProgramStateValues = Record<string, ProgramStateValue>;
export type ProgramJsonValue = null | boolean | number | string | ProgramJsonValue[] | { [key: string]: ProgramJsonValue };
export type ProgramDataMap = Readonly<Record<string, ProgramJsonValue>>;

export const interactiveStateValuesSchema = z.record(programKeySchema, z.union([
  finite, z.boolean(), z.string().max(INTERACTIVE_PROGRAM_LIMITS.text),
  z.array(z.union([finite, z.string().max(256)])).max(INTERACTIVE_PROGRAM_LIMITS.sequence),
]));
const pathKey = z.string().min(1).max(160).refine(value => !forbiddenKeys.has(value), 'This path field cannot be read.');
export const interactiveBindingInputSchema = z.object({ alias: programKeySchema,
  observationId: id.describe('The top-level observationId of a read-only tool result actually delivered to the model this turn, not a source eventId, file ID or new authority.'),
  path: z.array(z.union([pathKey, z.number().int().min(0).max(1000000)])).max(INTERACTIVE_PROGRAM_LIMITS.pathDepth)
    .describe('A literal JSON key or array index in the original result, not a dotted path, query expression or tool argument.'),
}).strict();
export type InteractiveBindingInput = z.infer<typeof interactiveBindingInputSchema>;

const previousProgramSchema = z.object({
  id: id.describe('Copy previous.id from the original work read result: programId or programRef.id from a published ACK, not messageId, sceneId or nodeId.'),
  expectedRevision: z.number().int().positive().describe('Copy previous.expectedRevision from the same original version: its read revision or published programRef.revision. Do not add one; it is not the future revision.'),
}).strict();
const bindingsSchema = z.array(interactiveBindingInputSchema).max(INTERACTIVE_PROGRAM_LIMITS.bindings)
  .refine(bindings => new Set(bindings.map(binding => binding.alias)).size === bindings.length, 'Read-only data aliases must be unique.');
const sourceTextSchema = z.string().max(INTERACTIVE_PROGRAM_LIMITS.dslBytes)
  .refine(value => new TextEncoder().encode(value).byteLength <= INTERACTIVE_PROGRAM_LIMITS.dslBytes,
    'This interface is too long. Keep the part needed now.');
export const interactiveProgramDraftSchema = z.object({ libraryVersion: z.literal(PROGRAM_LIBRARY_VERSION),
  dsl: sourceTextSchema.min(1),
  states: interactiveStateDeclarationsSchema,
  bindings: bindingsSchema,
  previous: previousProgramSchema.optional(),
}).strict();
export type InteractiveProgramDraft = z.infer<typeof interactiveProgramDraftSchema>;
export const interactiveProgramPatchSchema = z.object({ libraryVersion: z.literal(PROGRAM_LIBRARY_VERSION),
  previous: previousProgramSchema,
  patch: sourceTextSchema.describe('A patch containing complete native OpenUI declarations. Replace or add by declaration name; name = null explicitly deletes it. Unmentioned declarations remain, without automatic removal of unreachable declarations.'),
  stateChanges: z.record(programKeySchema, interactiveStateDeclarationSchema.nullable())
    .refine(value => Object.keys(value).length <= INTERACTIVE_PROGRAM_LIMITS.states, 'Too many local field changes.').optional()
    .describe('List only complete field declarations explicitly added or replaced; null deletes a field. Existing fields keep the submitted inputs, when present, or the original initialState. Only new fields use initial. Reset still follows declared initial values. Change existing conditions explicitly through inputChanges rather than resetting through initial.'),
  inputChanges: interactiveStateValuesSchema
    .refine(value => Object.keys(value).length <= INTERACTIVE_PROGRAM_LIMITS.states, 'Too many condition changes.').optional()
    .describe('Only explicitly changed local conditions. Unmentioned fields keep the submitted snapshot. Validate strictly against the complete merged states, without automatic clamping. These are not user words or action permission.'),
  bindings: bindingsSchema.optional().describe('Only bindings actually delivered this turn that are added or replaced. Unmentioned old aliases can be inherited only while their live original sources remain permitted and unexpired.'),
}).strict().superRefine((input, context) => {
  if (!input.patch.trim() && !Object.keys(input.stateChanges || {}).length && !Object.keys(input.inputChanges || {}).length && !input.bindings?.length)
    context.addIssue({ code: 'custom', path: ['patch'], message: 'An empty source patch needs explicit field, condition or new-binding changes.' });
});
export const interactiveProgramInputSchema = z.union([interactiveProgramDraftSchema, interactiveProgramPatchSchema]);
export type InteractiveProgramInput = z.infer<typeof interactiveProgramInputSchema>;

/** Source-owned provenance is opaque here. Only its owner may validate it;
 * it is neither model input nor a client-provided permission. currentData is
 * for a live, currently admitted delivery and must not become stored truth. */
export interface InteractiveProgramDocument {
  libraryVersion: typeof PROGRAM_LIBRARY_VERSION;
  dsl: string;
  sourceDsl: string;
  states: InteractiveStateDeclarations;
  initialState: ProgramStateValues;
  /** New patch deliveries may seed the native record independently of the
   * declarations' Reset defaults. The seed is then part of the hash. Absent
   * on older/full-draft documents, whose existing hash contract is retained. */
  initialStateMode?: 'admitted_seed';
  /** Explicit patch inputChanges. Live hand adjustments may not overwrite
   * these fields, even when the requested value equals the former seed. */
  initialInputFields?: string[];
  /** Names only, never a source proof. Nonempty aliases require all current
   * data to be re-admitted before evaluation; absent data is not an empty set. */
  bindingAliases: string[];
  /** Exact Scene addresses admitted with this view. Rendering delegates to
   * their original owner; these names do not grant another source read. */
  sourceSlots?: string[];
  currentData?: ProgramDataMap;
  hash: string;
  nodeIds: string[];
  stats: { statements: number; astNodes: number; expandedNodes: number };
  provenance?: unknown;
}

/** The compiler and on-demand method consume the same actual subset. Native
 * OpenUI parsing/evaluation still owns expressions; this is its admission
 * policy, not another language evaluator. */
export const PROGRAM_AST_RULES = {
  stateRoot: '$ui', modelStateDeclarations: false, assignments: false,
  numericBinaryOperators: [] as readonly string[],
  knownTextConcatenation: ['+'] as readonly string[],
  booleanOperators: ['!', '&&', '||'] as readonly string[],
  sameKnownPrimitiveComparisons: ['==', '!='] as readonly string[],
  knownFiniteNumberComparisons: ['>', '>=', '<', '<='] as readonly string[],
  ternaryNeedsKnownBoolean: true, dataAliasMustBeLiteral: true,
  safeLiteralMemberOrIndexOnly: true,
  forbiddenMemberKeys: [...forbiddenKeys] as readonly string[],
  allowedBuiltins: ['Each'] as readonly string[],
  forbiddenCalls: ['Query', 'Mutation', 'Run', 'OpenUrl', 'ToAssistant', 'Action', 'Set', 'Reset'] as readonly string[],
  customActions: ['LocalChange', 'LocalReset', 'Continue'] as readonly string[],
  writableBindingMustBeDirectStateRoot: true,
  sourceSlotReference: 'literal_in_current_scene_refs_once',
  motionFrames: 'bounded_state_independent_values_numeric_only',
} as const;

/** Address and the user-selected local input only. Never accepts a program
 * body, source proof, derived answer, tool name or permission from the client. */
export const interactiveProgramReferenceSchema = z.object({ messageId: id, programId: id,
  revision: z.number().int().positive(), nodeId: programNodeIdSchema,
  inputs: interactiveStateValuesSchema.optional(),
}).strict();
export type ProgramFollowupReference = z.infer<typeof interactiveProgramReferenceSchema>;
/** Bound-source history retains only an original view address until its owner
 * has re-admitted the actual source for a live delivery. */
export interface InteractiveProgramHistoryReference {
  messageId: string;
  programId: string;
  revision: number;
  status: 'needs_refresh' | 'source_unavailable';
  /** Original host-evaluated root, only supplied for readable continuation. */
  nodeId?: string;
}

export class InteractiveProgramValueError extends Error {
  readonly code = 'interactive_state_invalid';
  constructor(message = 'These local conditions are outside the current interface range. Keep the draft and choose again.') { super(message); this.name = 'InteractiveProgramValueError'; }
}
function plainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
function valueAllowed(state: InteractiveStateDeclaration, value: unknown) {
  if (state.kind === 'number') return typeof value === 'number' && Number.isFinite(value)
    && value >= state.min && value <= state.max && (state.step === undefined || aligned(value, state.min, state.step));
  if (state.kind === 'boolean') return typeof value === 'boolean';
  if (state.kind === 'text') return typeof value === 'string' && value.length <= state.maxLength;
  if (state.kind === 'choice') return typeof value === 'string' && state.options.includes(value);
  return Array.isArray(value) && value.length <= state.maxItems && value.every(item => state.element === 'number'
    ? typeof item === 'number' && Number.isFinite(item) && (state.min === undefined || item >= state.min) && (state.max === undefined || item <= state.max)
    : typeof item === 'string' && item.length <= (state.maxItemLength ?? 256));
}
export function validateProgramState(states: InteractiveStateDeclarations, raw: unknown): ProgramStateValues {
  if (!plainRecord(raw) || Object.keys(raw).length !== Object.keys(states).length
    || Object.keys(raw).some(key => !Object.hasOwn(states, key))) throw new InteractiveProgramValueError();
  const result: ProgramStateValues = {};
  for (const [key, state] of Object.entries(states)) {
    const value = raw[key];
    if (!Object.hasOwn(raw, key) || !valueAllowed(state, value)) throw new InteractiveProgramValueError(`Local field “${key}” is outside its current declared range.`);
    result[key] = Array.isArray(value) ? [...value] as (number | string)[] : value as number | boolean | string;
  }
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength > INTERACTIVE_PROGRAM_LIMITS.stateBytes)
    throw new InteractiveProgramValueError('These inputs are too long. Include only the part needed for continuation.');
  return result;
}
export function initialProgramState(states: InteractiveStateDeclarations): ProgramStateValues {
  return validateProgramState(states, Object.fromEntries(Object.entries(states).map(([key, state]) => [key, state.initial])));
}
/** Viewing conditions stay with this exact work. Held keys, gates and clocks
 * are deliberately absent from the stored record. */
export function retainedProgramState(states: InteractiveStateDeclarations, raw: unknown): ProgramStateValues {
  const inputs = validateProgramState(states, raw);
  return Object.fromEntries(Object.entries(inputs).filter(([key]) => states[key].transient !== true));
}
export function restoredProgramState(program: Pick<InteractiveProgramDocument, 'states' | 'initialState'>, raw?: unknown): ProgramStateValues {
  if (raw !== undefined && !plainRecord(raw)) throw new InteractiveProgramValueError();
  const retained = raw as ProgramStateValues | undefined;
  if (retained && Object.keys(retained).some(key => !Object.hasOwn(program.states, key) || program.states[key].transient))
    throw new InteractiveProgramValueError();
  return validateProgramState(program.states, Object.fromEntries(Object.entries(program.states).map(([key, state]) =>
    [key, state.transient ? state.initial : retained && Object.hasOwn(retained, key) ? retained[key] : program.initialState[key]])));
}

export const programLocalStateAddressSchema = z.object({ sessionId: id, messageId: id, programId: id,
  revision: z.number().int().positive(), programHash: z.string().min(1).max(128),
  privacyEpoch: z.number().int().nonnegative(), policyRevision: z.number().int().nonnegative(),
  ephemeral: z.boolean().optional() }).strict();
export const programLocalStateSaveSchema = programLocalStateAddressSchema.extend({
  expectedStateRevision: z.number().int().nonnegative(), inputs: interactiveStateValuesSchema,
}).strict();
export type ProgramLocalStateAddress = z.infer<typeof programLocalStateAddressSchema>;
export type ProgramLocalStateSave = z.infer<typeof programLocalStateSaveSchema>;
export interface ProgramLocalStateReceipt {
  status: 'ready' | 'saved' | 'unchanged' | 'conflict' | 'ephemeral';
  stateRevision: number;
  inputs?: ProgramStateValues;
  updatedAt?: string;
}
export interface ProgramLocalState {
  programHash: string;
  stateRevision: number;
  inputs: ProgramStateValues;
  updatedAt: string;
}
/** The one native $ui record is changed atomically only after this succeeds. */
export function checkedProgramPatch(states: InteractiveStateDeclarations, current: unknown, rawPatch: unknown): ProgramStateValues {
  const before = validateProgramState(states, current);
  if (!plainRecord(rawPatch) || Object.keys(rawPatch).some(key => !Object.hasOwn(states, key))) throw new InteractiveProgramValueError();
  return validateProgramState(states, { ...before, ...rawPatch });
}
export function resetProgramState(states: InteractiveStateDeclarations, current: unknown, keys?: readonly string[]) {
  if (!keys?.length) return initialProgramState(states);
  const defaults = initialProgramState(states), patch: ProgramStateValues = {};
  for (const key of keys) {
    if (!Object.hasOwn(defaults, key)) throw new InteractiveProgramValueError();
    patch[key] = defaults[key];
  }
  return checkedProgramPatch(states, current, patch);
}
export function snapProgramNumber(value: number, state: Extract<InteractiveStateDeclaration, { kind: 'number' }>) {
  if (!Number.isFinite(value)) throw new InteractiveProgramValueError();
  if (state.step === undefined) return Math.min(state.max, Math.max(state.min, value));
  const last = Math.floor((state.max - state.min) / state.step + 1e-8);
  const index = Math.max(0, Math.min(last, Math.round((value - state.min) / state.step)));
  // Only a gesture's snapped grid value is rounded, never a typed input. Retain
  // the declaration's decimal precision without leaking e.g. -3 + 49 * 0.1.
  const places = (number: number) => {
    const [coefficient, exponent = '0'] = String(number).toLowerCase().split('e');
    return Math.max(0, (coefficient.split('.')[1]?.length || 0) - Number(exponent));
  };
  const precision = Math.max(places(state.min), places(state.step));
  const snapped = state.min + index * state.step;
  const decimal = precision <= 100 ? Number(snapped.toFixed(precision)) : snapped;
  return Math.max(state.min, Math.min(state.max, decimal));
}
