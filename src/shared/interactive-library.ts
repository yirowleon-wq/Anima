import { createLibrary, createParser, defineAction, defineComponent, markReactive,
  type Library, type EvaluationContext } from '@openuidev/lang-core';
import * as z from 'zod/v4';
import { createInteractiveFunctions, interactiveFunctionMetadata } from './interactive-functions';
import { checkCurveNames, parseCurveExpression } from './curve-expression';
import type { InteractiveProgramComponentDiagnostic } from './harness';
import { INTERACTIVE_PROGRAM_LIMITS, PROGRAM_AST_RULES, PROGRAM_LIBRARY_VERSION, interactiveStateValuesSchema,
  programKeySchema, programNodeIdSchema, checkedProgramPatch, initialProgramState,
  interactiveProgramDraftSchema, interactiveProgramPatchSchema,
  type InteractiveStateDeclarations, type ProgramDataMap } from './interactive-program';

const finite = z.number().finite(), coordinate = finite.nullable().default(null);
const color = z.enum(['ink', 'muted', 'accent', 'blue', 'violet', 'green', 'rose', 'paper'])
  .describe('Use the limited current-paper palette: ink, muted, accent, blue, violet, rose or paper. green is retained only for historical compatibility and renders violet; use violet for new graphics.');
const text = z.string().max(INTERACTIVE_PROGRAM_LIMITS.text);
const point = z.object({ x: coordinate, y: coordinate }).strict().nullable();
const uiBinding = z.record(z.string(), z.unknown()); markReactive(uiBinding);

export const interactiveActions = [
  defineAction({ name: 'LocalChange', description: 'Change only local fields declared by this program. Atomically commit the complete next $ui only after schema validation; do not run tools or send messages.',
    params: z.object({ values: interactiveStateValuesSchema }).strict() }),
  defineAction({ name: 'LocalReset', description: 'Reset declared fields to their initial values; an empty array means all local fields. Do not restore data sources, permissions or business actions.',
    params: z.object({ fields: z.array(programKeySchema).max(INTERACTIVE_PROGRAM_LIMITS.states).default([]) }).strict() }),
  defineAction({ name: 'Continue', description: 'Attach the current node and actual local inputs to the same ordinary composer. Do not fabricate user words, send automatically or perform a business action.',
    params: z.object({}).strict() }),
] as const;
const localAction = z.union(interactiveActions.map(action => action.ref) as [z.ZodType, z.ZodType, ...z.ZodType[]]);
let viewRefs: z.ZodType[] = [], graphicRefs: z.ZodType[] = [];
const children = (kind: 'view' | 'graphic' | 'same') => z.array(z.lazy(() => {
  const refs = kind === 'view' ? viewRefs : kind === 'graphic' ? graphicRefs : [...viewRefs, ...graphicRefs];
  return z.union(refs as [z.ZodType, z.ZodType, ...z.ZodType[]]);
})).max(INTERACTIVE_PROGRAM_LIMITS.expandedNodes);
type PrimitiveKind = 'document' | 'view' | 'graphic' | 'motion' | 'control' | 'source';
interface PrimitiveSpec {
  name: string; description: string; kind: PrimitiveKind;
  props: z.ZodObject<any>; scalarProps: z.ZodObject<any>;
  childSlot?: 'view' | 'graphic' | 'same';
  stateKind?: 'number' | 'boolean' | 'text' | 'choice' | 'sequence';
}
const specs: PrimitiveSpec[] = [];
function primitive(name: string, description: string, kind: PrimitiveKind, fields: z.ZodRawShape,
  options: Pick<PrimitiveSpec, 'childSlot' | 'stateKind'> = {}) {
  const shape = options.stateKind ? { ...fields, disabled: z.boolean().default(false) } : fields;
  const required = Object.fromEntries(Object.entries(shape).filter(([, schema]) => !(schema as z.ZodType).isOptional()));
  const optional = Object.fromEntries(Object.entries(shape).filter(([, schema]) => (schema as z.ZodType).isOptional()));
  const scalarProps = z.object({ id: programNodeIdSchema, ...required, ...optional }).strict();
  const props = options.childSlot ? z.object({ id: programNodeIdSchema, ...required, children: children(options.childSlot), ...optional }).strict() : scalarProps;
  specs.push({ name, description, kind, props, scalarProps, ...options });
}

// Fields keep a stable positional order in the generated OpenUI signatures.
// This is the actual library, not a second prose catalog or a business router.
const documentScalars = z.object({ id: programNodeIdSchema, title: z.string().max(160).optional(), presentation: z.enum(['paper', 'flow']).default('paper') }).strict();
specs.push({ name: 'Document', kind: 'document', description: 'A general interactive document inside this reply. Optional title renders directly; do not repeat it in Text. presentation=paper gives one sheet; flow has no outer frame and interleaves prose, Papers and interactive graphics. Everything shares the same $ui; related mechanics and sound must not become disconnected works. ui binds directly to host-generated $ui. The host still owns the app character and chat composer.',
  scalarProps: documentScalars,
  props: z.object({ id: programNodeIdSchema, ui: uiBinding, children: children('view'), title: z.string().max(160).optional(), presentation: z.enum(['paper', 'flow']).default('paper') }).strict(), childSlot: 'view' });
primitive('Flow', 'Compose row, column or grid content. Layout does not establish step execution or factual relationships.', 'view', {
  direction: z.enum(['column', 'row', 'grid']).default('column'), gap: z.number().int().min(0).max(48).default(16),
  columns: z.number().int().min(1).max(6).default(2), align: z.enum(['start', 'center', 'stretch']).default('stretch'),
}, { childSlot: 'view' });
primitive('Paper', 'Carry a group of current content using the app’s materials and colors, not a new page or another chat shell.', 'view', {
  tone: z.enum(['plain', 'paper', 'glass']).default('plain'), padding: z.number().int().min(0).max(40).default(16),
}, { childSlot: 'view' });
primitive('Text', 'Display text or finite scalars. null explicitly means unavailable and never becomes zero. HTML is not accepted.', 'view', {
  value: z.union([text, finite, z.boolean(), z.null()]).default(null), size: z.enum(['small', 'body', 'title']).default('body'),
  tone: z.enum(['ink', 'muted', 'accent']).default('ink'),
});
primitive('Formula', 'Typeset current TeX text without executing formulas or scripts. Source quotations and assistant explanations retain their identities.', 'view', {
  tex: z.string().max(2000).nullable().default(null), display: z.boolean().default(true),
});
primitive('Number', 'Edit a declared number field using the range, step and initial value in states; change only after validating the complete next $ui.', 'view', {
  field: programKeySchema, label: z.string().min(1).max(160), presentation: z.enum(['inline', 'slider', 'input']).default('slider'),
}, { stateKind: 'number' });
primitive('TextInput', 'Edit local text in a declared text field without creating another chat input. Only Continue brings the actual input back to the original composer.', 'view', {
  field: programKeySchema, label: z.string().min(1).max(160), placeholder: z.string().max(200).optional(), multiline: z.boolean().default(false),
}, { stateKind: 'text' });
primitive('SequenceInput', 'Edit a declared number or text sequence, checking each element’s type, length and range without executing text as code.', 'view', {
  field: programKeySchema, label: z.string().min(1).max(160), placeholder: z.string().max(200).optional(),
}, { stateKind: 'sequence' });
primitive('Choice', 'Choose an option of a declared choice field. Options come from states and can use buttons, a select or tabs.', 'view', {
  field: programKeySchema, label: z.string().min(1).max(160), presentation: z.enum(['select', 'buttons', 'tabs']).default('select'),
}, { stateKind: 'choice' });
primitive('Toggle', 'Toggle a declared boolean field, changing only local display or calculation without inferring preferences or approving an action.', 'view', {
  field: programKeySchema, label: z.string().min(1).max(160),
}, { stateKind: 'boolean' });
primitive('Press', 'Hold and release a transient boolean field using mouse, touch or keyboard. Wrap pressable geometry inside Graphic or button content in prose. field requires transient:true and initial:false. Optional pressureField is transient with initial:0 and an explicitly chosen strength, never a claimed mouse-pressure measurement. triggerField is a transient integer event counter, incrementing on each new press and wrapping max to min; release leaves it unchanged. On the first actual press, optional values writes other declared local initial conditions—such as the selected object, launch strength or frequency—in the same checked change; release does not erase those conditions. values cannot include this Press’s field, pressureField or triggerField. When several Press controls share a field, release only after the last holder lets go, clearing the pressure actually written by the first press. The initial entry writes only its own declared values/pressureField/triggerField and borrows no fields from another entry. A pictured key and keyboard representing the same strike can therefore share pressure and trigger fields. hotkey responds only within this work’s focus, outside text input. Blur, cancellation or unmount releases automatically, without sending a message or restoring a held state.', 'control', {
  field: programKeySchema, label: z.string().min(1).max(160), strength: finite.min(0).max(1).default(1),
  pressureField: programKeySchema.nullable().optional(), triggerField: programKeySchema.nullable().optional(),
  hotkey: z.string().regex(/^[\x21-\x7e]$/).nullable().optional(),
  appearance: z.enum(['plain', 'light', 'dark']).default('plain'), disabled: z.boolean().default(false),
  values: interactiveStateValuesSchema.nullable().optional().describe('Finite local initial conditions written on the first actual press, such as selected object, launch strength or frequency. Validate against current states and commit with the hold, pressure and count in one checked patch. Release clears only gates and pressure owned by Press, leaving these conditions intact. Exclude this Press’s field, pressureField and triggerField. No action, tool or business operation executes.'),
}, { childSlot: 'same', stateKind: 'boolean' });
const voiceSettings = z.object({ gain: finite.min(0).max(1).default(.25), velocity: finite.min(0).max(1).default(1),
  harmonics: z.array(finite.min(-1).max(1)).min(1).max(32).default([1]),
  attackMs: finite.min(1).max(2000).default(8), decayMs: finite.min(1).max(10000).default(250),
  sustainLevel: finite.min(0).max(1).default(.45), releaseMs: finite.min(1).max(10000).default(180),
}).strict();
primitive('Voice', 'Synthesize a retriggerable local sound. The host supplies this work’s master sound/mute control. gateField describes whether the current process still holds or drives the sound; do not add a redundant master switch. gateField is a transient boolean initially false. Optional triggerField is a transient integer event counter and fires only when changed. Alternatively use the final pure trigger expression: boolean fires on false-to-true, number on every change; never supply both. Positional settings, sustainField and triggerField may be null to reach the later trigger argument. This lets the same local time fire sound at mechanical contact rather than prematurely at key press. Without either trigger, a false-to-true gate fires. sustainField is transient and initially false; when true after gate release it retains the decaying sound until switched off. gain, velocity, attackMs, decayMs and sustainLevel are sampled at each strike; later edits apply to the next strike. attackMs rises to peak and decayMs falls to sustainLevel. A zero sustainLevel decays naturally to silence and ends; positive levels hold that amplitude. Sustain adds no energy and does not alter this envelope. releaseMs controls damping after an unsustained gate release or when sustain turns off. frequency is Hz; null is silent. Frequency and harmonics may change live. The default is sine; harmonics explicitly shape timbre. Sound requires the user’s explicit activation and does not play on initial load or reopening.', 'view', {
  gateField: programKeySchema, frequency: finite.min(1).max(20000).nullable(),
  settings: voiceSettings.nullable().optional(), sustainField: programKeySchema.nullable().optional(), triggerField: programKeySchema.nullable().optional(),
  trigger: z.union([finite, z.boolean()]).optional(),
});
primitive('AudioTrace', 'Show this work’s actual local digital waveform after Voice synthesis and master gain, not a separately plotted formula. The horizontal axis is a short current audio sample window, not the slow-motion mechanism timeline. Silence gives a quiet baseline. Sample only while the visible work is sounding and the user enabled sound. Do not access the microphone, external audio or save a recording. magnification changes drawn amplitude only, not loudness. The trace represents digital output and does not prove that a person heard the speaker.', 'view', {
  label: z.string().min(1).max(160), height: z.number().int().min(80).max(240).default(120),
  magnification: finite.min(1).max(16).default(4), color: color.default('accent'),
});
primitive('Piano', 'A playable 88-key grand-piano principle model, using the original work’s AudioScope for finite modal synthesis rather than samples or another engine. selectedField is MIDI note 21–108. heldField is a transient number sequence initially [], bounded 21–108 with maxItems at least 88. pedalField is a transient boolean initially false; phaseField is a transient number initially zero in [0,1]. All four fields are independent. Keys, chords, sustain, mechanism and actual output share current inputs; keyboard play works within the work’s focus. Slow motion lengthens the teaching mechanism process without changing pitch. velocity is explicitly selected strength, never claimed mouse measurement. slowMotion stretches duration 1–100 times. Pitch uses A4 tuningHz and equal temperament, multiplied by sqrt(tensionRatio/densityRatio)/lengthRatio so ideal string parameters have audible causes. These ratios are not measured dimensions of a real piano. brightness changes modal excitation. Compose Number, Formula, Text and AudioTrace in the same Document, read $ui, persist through the original program and Continue the same work. Sound requires explicit activation; reopening restores no held keys, pedal, mechanism process or sound.', 'view', {
  heldField: programKeySchema, selectedField: programKeySchema, pedalField: programKeySchema, phaseField: programKeySchema,
  velocity: finite.min(.05).max(1).default(.65), slowMotion: finite.min(1).max(100).default(1),
  tuningHz: finite.min(400).max(480).default(440), lengthRatio: finite.min(.5).max(2).default(1),
  tensionRatio: finite.min(.25).max(4).default(1), densityRatio: finite.min(.25).max(4).default(1),
  brightness: finite.min(0).max(1).default(.55), showMechanism: z.boolean().default(true), disabled: z.boolean().default(false),
});
primitive('Button', 'Perform one checked local change, reset or Continue. Do not run native Set/Run, tools, external links or automatic sending.', 'view', {
  label: z.string().min(1).max(160), action: localAction, emphasis: z.enum(['quiet', 'normal']).default('quiet'), disabled: z.boolean().default(false),
});
primitive('SourceSlot', 'Place an exact Scene reference actually admitted by the original tool in this work. ref is a literal original id@revision address rendered by its host owner; do not query a tool or copy the body.', 'source', {
  ref: z.string().min(1).max(320),
});
primitive('Graphic', 'A general data-coordinate canvas combining safe geometry and text. coordinateScale=equal gives both axes equal unit lengths so rotated rigid geometry preserves lengths and angles. Default independent suits charts with different axis units. Unused areas stay empty and pointers use the same coordinate mapping. Optional axis names may be null. Missing coordinates leave gaps; offscreen values are not changed.', 'view', {
  domain: z.object({ xMin: finite, xMax: finite, yMin: finite, yMax: finite }).strict(),
  height: z.number().int().min(120).max(600).default(260), yDirection: z.enum(['up', 'down']).default('up'),
  axes: z.boolean().default(false), xLabel: z.string().max(80).nullable().optional(), yLabel: z.string().max(80).nullable().optional(),
  label: z.string().min(1).max(240),
  coordinateScale: z.enum(['independent', 'equal']).default('independent'),
}, { childSlot: 'graphic' });
primitive('Group', 'Group geometry within Graphic using finite translation, rotation and scaling only. Children use group-local coordinates; rotate acts around local (0,0), then places that pivot at x/y. A fixed-pivot rigid body keeps x/y and changes rotate. Changing x/y moves the pivot too. Use equal coordinate scaling when physical lengths and angles must remain intact.', 'graphic', {
  x: coordinate.default(0), y: coordinate.default(0), rotate: finite.min(-36000).max(36000).default(0),
  scale: finite.min(.001).max(1000).default(1),
}, { childSlot: 'graphic' });
primitive('Line', 'Draw a line between two points. Any unknown coordinate leaves a gap without substituting zero.', 'graphic', {
  x1: coordinate, y1: coordinate, x2: coordinate, y2: coordinate, color: color.default('ink'),
  width: finite.min(.25).max(8).default(1.5), dashed: z.boolean().default(false),
});
primitive('Polyline', 'Connect the finite points actually supplied. null or unknown points break the line without invented connections.', 'graphic', {
  points: z.array(point).max(INTERACTIVE_PROGRAM_LIMITS.collection).nullable().default(null), color: color.default('ink'),
  width: finite.min(.25).max(8).default(1.75), dashed: z.boolean().default(false),
});
primitive('Curve', 'Plot a continuous mathematical curve. expression gives y in variable (default x); supplying xExpression makes a parametric curve with both expressions in the same variable, such as t. The grammar accepts numbers, + - * / ^, parentheses, common functions sin cos tan exp ln log sqrt abs min max, pi/e and named params. Bind params to $ui so dragging changes the curve immediately. Sample samples points between from and to, breaking at undefined values; no code executes. One curve is one node, so waves, superposition, decay and trajectories need no manually expanded point arrays.', 'graphic', {
  expression: z.string().min(1).max(400), from: finite, to: finite,
  params: z.record(programKeySchema, finite.nullable()).default({}),
  color: color.default('accent'), samples: z.number().int().min(2).max(512).default(160),
  width: finite.min(.25).max(8).default(2), dashed: z.boolean().default(false),
  variable: z.string().regex(/^[A-Za-z]$/).default('x'),
  xExpression: z.string().min(1).max(400).optional(),
});
primitive('Circle', 'Draw a finite-coordinate dot or circle with radius in screen pixels, without external images or business actions.', 'graphic', {
  x: coordinate, y: coordinate, radius: finite.min(.5).max(80).default(4), color: color.default('accent'), filled: z.boolean().default(true),
});
primitive('Rect', 'Draw a rectangle in current data coordinates and follow Group transforms. Dimensions use data units; stroke width uses pixels. paper follows the current sheet; arbitrary CSS is not accepted.', 'graphic', {
  x: coordinate, y: coordinate, width: finite.positive(), height: finite.positive(), color: color.default('ink'),
  filled: z.boolean().default(false), strokeWidth: finite.min(0).max(8).default(1.5),
});
primitive('Polygon', 'A closed polygon in current data coordinates, following Group transforms. Any unknown point leaves the whole polygon empty rather than inventing a fill across a gap.', 'graphic', {
  points: z.array(point).min(3).max(INTERACTIVE_PROGRAM_LIMITS.collection), color: color.default('ink'),
  filled: z.boolean().default(false), strokeWidth: finite.min(0).max(8).default(1.5),
});
primitive('Label', 'Show short text at current Graphic coordinates. Unknown coordinates or text leave a gap.', 'graphic', {
  x: coordinate, y: coordinate, text: z.string().max(240).nullable().default(null), color: color.default('ink'),
  anchor: z.enum(['start', 'middle', 'end']).default('start'),
});
primitive('DragHandle', 'Directly drag declared number fields in Graphic. checkedPatch writes local values without changing source data. Pass null for xField when binding only y; at least one axis is required. The unbound axis stays at local zero or the nearest domain edge if zero is outside. Put the handle in Group to move it to a peak, phase axis or observation line; inversion still uses the same coordinates. Preserve grab offset on press. Arrow keys provide equivalent changes. Escape, blur or cancellation restores pre-grab values; release retains the new position.', 'graphic', {
  xField: programKeySchema.nullable().optional(), yField: programKeySchema.nullable().optional(), label: z.string().min(1).max(160),
  color: color.default('accent'), radius: finite.min(3).max(14).default(5), disabled: z.boolean().default(false),
});
const frame = z.object({ opacity: finite.min(0).max(1).optional(),
  x: finite.min(-1000).max(1000).optional().describe('Temporary visual CSS-pixel translation for this frame, positive to screen right. It is not Graphic data coordinates; remove the visual transform when the process ends.'),
  y: finite.min(-1000).max(1000).optional().describe('Temporary visual CSS-pixel translation for this frame, positive down the screen. It is not Graphic data coordinates; remove the visual transform when the process ends.'),
  rotate: finite.min(-360).max(360).optional(), scale: finite.min(.1).max(4).optional(),
  values: z.record(programKeySchema, finite).optional() }).strict();
primitive('Motion', 'Start finite motion when a user’s button, Press or choice changes when. Frame values change only declared numbers; tracks interpolate between adjacent frames and round to state.step. Frame x/y are temporary visual CSS pixels and rotate/scale act around visible bounds; remove these visual transforms at the end. They change neither Graphic coordinates nor persistent positions. To retain a part at a location, rotate around a fixed pivot or drive other parts, have Group read shared local values and let Motion.values drive those numbers. End-frame values are not written only at the end: a step=1 track from 0 to 1 changes midway and can cancel early if it also controls when. releaseBehavior=cancel cancels when false; finish completes an already-started finite process, suitable for free motion after excitation has disengaged. Keep release state separate from that clock. Manual numbers, text and drag handles take over immediately. Never autoplay; reduced motion jumps to the final frame.', 'motion', {
  when: z.union([finite, z.string().max(160), z.boolean(), z.null()]).optional(),
  frames: z.array(frame).min(2).max(8), durationMs: z.number().int().min(1).max(10000).default(280),
  iterations: z.number().int().min(1).max(3).default(1), easing: z.enum(['linear', 'ease', 'ease-out']).default('ease-out'),
  releaseBehavior: z.enum(['cancel', 'finish']).default('cancel'),
}, { childSlot: 'same' });

// The neutral definitions use an opaque renderer slot; lang-core never calls
// it. The later React adapter injects actual renderers with the same schemas.
const neutralDefinitions = specs.map(spec => defineComponent({ name: spec.name, props: spec.props,
  description: spec.description, component: null }));
viewRefs = neutralDefinitions.filter(def => ['view', 'motion', 'control', 'source'].includes(specs.find(spec => spec.name === def.name)!.kind)).map(def => def.ref as z.ZodType);
graphicRefs = neutralDefinitions.filter(def => ['graphic', 'motion', 'control'].includes(specs.find(spec => spec.name === def.name)!.kind)).map(def => def.ref as z.ZodType);
export const interactiveComponentSpecs: readonly PrimitiveSpec[] = Object.freeze(specs);
export const interactiveComponentNames: readonly string[] = Object.freeze(specs.map(spec => spec.name));
export type InteractiveComponentName = 'Document' | 'Flow' | 'Paper' | 'Text' | 'Formula' | 'Number' | 'TextInput' | 'SequenceInput'
  | 'Choice' | 'Toggle' | 'Press' | 'Voice' | 'AudioTrace' | 'Piano' | 'Button' | 'SourceSlot' | 'Graphic' | 'Group' | 'Line' | 'Polyline' | 'Curve' | 'Circle' | 'Rect' | 'Polygon' | 'Label' | 'DragHandle' | 'Motion';

export function createInteractiveLibrary<C = null>(options: { data?: ProgramDataMap; renderers?: Partial<Record<InteractiveComponentName, C>> } = {}) {
  const components = neutralDefinitions.map(def => ({ ...def,
    component: (options.renderers?.[def.name as InteractiveComponentName] ?? null) as C }));
  return createLibrary({ id: 'anima-interactive-v2', root: 'Document', components,
    functions: createInteractiveFunctions(options.data), actions: [...interactiveActions] });
}
const neutralLibrary = createInteractiveLibrary();
export function createInteractiveParser() { return createParser(neutralLibrary.toJSONSchema(), neutralLibrary.root); }
export function getInteractiveProgramSpec() {
  return { libraryVersion: PROGRAM_LIBRARY_VERSION, library: neutralLibrary.toSpec(), schema: neutralLibrary.toJSONSchema(),
    rules: PROGRAM_AST_RULES, limits: INTERACTIVE_PROGRAM_LIMITS, functions: interactiveFunctionMetadata,
    components: Object.fromEntries(specs.map(spec => [spec.name, { kind: spec.kind,
      ...(spec.childSlot ? { childSlot: spec.childSlot } : {}), ...(spec.stateKind ? { stateKind: spec.stateKind } : {}) }])) };
}
/** Runtime function schemas and implementations must travel together. */
export function interactiveEvaluationFunctions(library: Library): NonNullable<EvaluationContext['functions']> {
  const schemas = library.toJSONSchema().functions ?? {};
  return Object.fromEntries(Object.entries(schemas).flatMap(([name, schema]) => {
    const implementation = library.functions?.[name]?.fn;
    return implementation ? [[name, { ...schema, fn: implementation }]] : [];
  }));
}

const nativeLocalActionPlan = z.object({ steps: z.array(z.object({ type: z.literal('custom_action'),
  name: z.string(), params: z.record(z.string(), z.unknown()),
}).strict()).length(1) }).strict();
/** OpenUI evaluates an action expression into its native ActionPlan. The
 * expression-slot schema is for parsing, not for this materialized value. */
export function validateInteractiveActionPlan(raw: unknown, states: InteractiveStateDeclarations, disabled = false): string | undefined {
  const parsed = nativeLocalActionPlan.safeParse(raw);
  if (!parsed.success) return 'The button needs an explicit local operation.';
  const step = parsed.data.steps[0], definition = interactiveActions.find(action => action.name === step.name);
  if (!definition) return 'The button can only change local conditions, reset values or continue the current content.';
  const params = definition.params.safeParse(step.params);
  if (!params.success) return 'The button arguments do not match the declared local operation.';
  if (step.name === 'LocalChange') {
    const values = (params.data as { values: Record<string, unknown> }).values;
    for (const [field, value] of Object.entries(values)) {
      const state = states[field];
      if (!Object.hasOwn(states, field) || !state || (state.kind === 'number' ? typeof value !== 'number' || !Number.isFinite(value)
        : state.kind === 'boolean' ? typeof value !== 'boolean'
          : state.kind === 'sequence' ? !Array.isArray(value) || value.some(item => state.element === 'number'
            ? typeof item !== 'number' || !Number.isFinite(item) : typeof item !== 'string') : typeof value !== 'string'))
        return 'Local changes must match declared fields and input types.';
    }
    // A disabled boundary button may describe the next out-of-range value.
    // It cannot execute; actual events always validate the full next state.
    if (!disabled) {
      try { checkedProgramPatch(states, initialProgramState(states), values); }
      catch { return 'Local changes must satisfy current declared fields, types and ranges.'; }
    }
  }
  if (step.name === 'LocalReset' && (params.data as { fields: string[] }).fields.some(field => !Object.hasOwn(states, field)))
    return 'A reset button needs exact currently declared fields.';
  return undefined;
}

type ComponentIssue = InteractiveProgramComponentDiagnostic['issues'][number];
export interface InteractivePrimitivePropertiesProblem { message: string; issues: ComponentIssue[] }
const schemaIssueCodes = new Set(['invalid_type', 'too_big', 'too_small', 'invalid_format', 'not_multiple_of',
  'unrecognized_keys', 'invalid_union', 'invalid_key', 'invalid_element', 'invalid_value', 'custom']);
const schemaExpectedTypes = new Set(['string', 'number', 'int', 'boolean', 'array', 'object', 'null', 'record', 'nonoptional']);

/** Traverse only the fixed schema. Record/unknown keys stop the path rather
 * than echoing supplied names; union details, messages and inputs stay out. */
function safeSchemaIssue(schema: z.ZodType, issue: z.core.$ZodIssue, parameterFields?: readonly string[]): ComponentIssue {
  let current = schema;
  const path: (string | number)[] = [];
  let pathComplete = true;
  for (const part of issue.path) {
    for (let depth = 0; depth < 8 && (current instanceof z.ZodOptional || current instanceof z.ZodNullable
      || current instanceof z.ZodDefault || current instanceof z.ZodReadonly); depth++) current = current.unwrap() as z.ZodType;
    if (typeof part === 'string' && current instanceof z.ZodObject && Object.hasOwn(current.shape, part)) {
      path.push(part); current = current.shape[part];
    } else if (typeof part === 'number' && Number.isSafeInteger(part) && part >= 0 && current instanceof z.ZodArray) {
      path.push(part); current = current.element as z.ZodType;
    } else { pathComplete = false; break; }
  }
  for (let depth = 0; depth < 8 && (current instanceof z.ZodOptional || current instanceof z.ZodNullable
    || current instanceof z.ZodDefault || current instanceof z.ZodReadonly); depth++) current = current.unwrap() as z.ZodType;
  const allowedProperties = issue.code === 'unrecognized_keys' && pathComplete && current instanceof z.ZodObject
    ? Object.keys(current.shape) : undefined;
  const parameterIndex = typeof path[0] === 'string' ? parameterFields?.indexOf(path[0]) ?? -1 : -1;
  return { stage: 'schema', code: schemaIssueCodes.has(issue.code) ? issue.code as ComponentIssue['code'] : 'schema_issue',
    path, pathComplete, ...(parameterIndex >= 0 ? { parameterIndex } : {}),
    ...(allowedProperties ? { allowedProperties } : {}),
    ...(issue.code === 'invalid_type' && schemaExpectedTypes.has(issue.expected)
      ? { expected: issue.expected as ComponentIssue['expected'] } : {}),
    ...(issue.code === 'too_small' && typeof issue.minimum === 'number' && Number.isFinite(issue.minimum) ? { minimum: issue.minimum } : {}),
    ...(issue.code === 'too_big' && typeof issue.maximum === 'number' && Number.isFinite(issue.maximum) ? { maximum: issue.maximum } : {}),
    ...((issue.code === 'too_small' || issue.code === 'too_big') && typeof issue.inclusive === 'boolean' ? { inclusive: issue.inclusive } : {}) };
}

/** Used only by the original program envelope parse, never a second parse.
 * Keep the same safe projection as component errors, with no source position. */
export function interactiveProgramInputIssues(schema: z.ZodType, issues: readonly z.core.$ZodIssue[], mode?: 'draft' | 'patch'): ComponentIssue[] {
  if (mode && schema instanceof z.ZodObject && Object.hasOwn(schema.shape, 'program')) {
    // This projects errors from the same original union parse, never reparses
    // input. Only the two fixed program envelope branches are unwrapped.
    const branch = mode === 'patch' ? interactiveProgramPatchSchema : interactiveProgramDraftSchema;
    const knownSchema = z.object({ ...schema.shape, program: branch.optional() });
    const branchIssues = issues.flatMap(issue => issue.code === 'invalid_union'
      && issue.path.length === 1 && issue.path[0] === 'program'
      ? (issue.errors[mode === 'patch' ? 1 : 0] || []).map(child => ({ ...child, path: ['program', ...child.path] }))
      : [issue]);
    return branchIssues.slice(0, 4).map(issue => safeSchemaIssue(knownSchema, issue));
  }
  return issues.slice(0, 4).map(issue => safeSchemaIssue(schema, issue));
}

/** The original property/contract checks, returning only safe metadata from
 * the actual failed check. Renderer callers retain the string wrapper below. */
export function inspectInteractivePrimitiveProperties(name: string, raw: Record<string, unknown>, states: InteractiveStateDeclarations): InteractivePrimitivePropertiesProblem | undefined {
  const spec = specs.find(value => value.name === name);
  if (!spec) return { message: 'The interface references a component outside the current library.',
    issues: [{ stage: 'contract', code: 'unknown_component', path: [], pathComplete: true }] };
  const reject = (message: string, code: ComponentIssue['code'], paths: (string | number)[][]): InteractivePrimitivePropertiesProblem => ({
    message, issues: paths.slice(0, 4).map(path => {
      const parameterIndex = typeof path[0] === 'string' ? Object.keys(spec.props.shape).indexOf(path[0]) : -1;
      return { stage: 'contract', code, path, pathComplete: true, ...(parameterIndex >= 0 ? { parameterIndex } : {}) };
    }),
  });
  const scalars = Object.fromEntries(Object.entries(raw).filter(([key]) => key !== 'children' && !(name === 'Document' && key === 'ui')));
  const schema = name === 'Button' ? spec.scalarProps.omit({ action: true }) : spec.scalarProps;
  const checked = schema.safeParse(name === 'Button' ? Object.fromEntries(Object.entries(scalars).filter(([key]) => key !== 'action')) : scalars);
  if (!checked.success) return { message: `Component ${name} has properties outside the current library declaration.`,
    issues: checked.error.issues.slice(0, 4).map(issue => safeSchemaIssue(schema, issue, Object.keys(spec.props.shape))) };
  if (name === 'Button') {
    const problem = validateInteractiveActionPlan(raw.action, states, raw.disabled === true);
    if (problem) return reject(problem, 'local_action', [['action']]);
  }
  if (spec.stateKind && (typeof raw.field !== 'string' || states[raw.field]?.kind !== spec.stateKind))
    return reject(`Component ${name} needs a declared ${spec.stateKind} local field.`, 'state_kind', [['field']]);
  if (name === 'Piano') {
    const fields = ['heldField', 'selectedField', 'pedalField', 'phaseField'];
    if (new Set(fields.map(key => raw[key])).size !== fields.length)
      return reject('Held keys, selected note, pedal and mechanism phase need separate fields.', 'state_kind', fields.map(key => [key]));
    const held = states[String(raw.heldField)], selected = states[String(raw.selectedField)],
      pedal = states[String(raw.pedalField)], phase = states[String(raw.phaseField)];
    if (held?.kind !== 'sequence' || held.element !== 'number' || !held.transient || held.initial.length
      || held.min !== 21 || held.max !== 108 || held.maxItems < 88)
      return reject('The 88-key held state needs a number sequence with transient:true, initial:[], range 21–108 and maxItems at least 88.', 'state_kind', [['heldField']]);
    if (selected?.kind !== 'number' || selected.min !== 21 || selected.max !== 108 || selected.step !== 1)
      return reject('The selected note needs a number field in 21–108 with step:1.', 'state_kind', [['selectedField']]);
    if (pedal?.kind !== 'boolean' || !pedal.transient || pedal.initial !== false)
      return reject('The sustain pedal needs a boolean field with transient:true and initial:false.', 'state_kind', [['pedalField']]);
    if (phase?.kind !== 'number' || !phase.transient || phase.initial !== 0 || phase.min !== 0 || phase.max !== 1)
      return reject('Mechanism phase needs a number field with transient:true, initial:0 and range 0–1.', 'state_kind', [['phaseField']]);
  }
  if (name === 'Press' || name === 'Voice') {
    if (name === 'Voice' && raw.triggerField != null && raw.trigger !== undefined)
      return reject('Choose either triggerField counting or a trigger expression for one voice, not both.', 'state_kind', [['triggerField'], ['trigger']]);
    const heldKey = name === 'Press' ? 'field' : 'gateField';
    for (const key of [heldKey, ...(raw.sustainField == null ? [] : ['sustainField'])]) {
      const state = typeof raw[key] === 'string' ? states[raw[key] as string] : undefined;
      if (state?.kind !== 'boolean' || state.initial !== false || state.transient !== true)
        return reject('Hold, sound gate and sustain need boolean fields with transient:true and initial:false. Reopening cannot restore holds or sound.', 'state_kind', [[key]]);
    }
    if (raw.pressureField != null) {
      const state = states[String(raw.pressureField)];
      if (state?.kind !== 'number' || state.transient !== true || state.initial !== 0 || state.min > 0 || state.max < 1)
        return reject('A pressure field needs a number declaration with transient:true, initial:0 and range covering 0–1.', 'state_kind', [['pressureField']]);
    }
    if (raw.triggerField != null) {
      const state = states[String(raw.triggerField)];
      if (state?.kind !== 'number' || state.transient !== true || state.initial !== 0 || state.min !== 0
        || !Number.isInteger(state.max) || state.step !== 1 || raw.triggerField === raw.pressureField)
        return reject('The strike counter needs a separate transient integer number field with initial/min=0 and step=1; every change is a new strike.', 'state_kind', [['triggerField']]);
    }
    if (name === 'Press' && raw.values != null) {
      const values = checked.data.values as Record<string, unknown>;
      if ([raw.field, raw.pressureField, raw.triggerField].some(key => typeof key === 'string' && Object.hasOwn(values, key)))
        return reject('This Press owns its hold, pressure and strike count; values may contain only other declared local initial conditions.', 'state_kind', [['values']]);
      try { checkedProgramPatch(states, initialProgramState(states), values); }
      catch { return reject('Initial press conditions must satisfy current local fields, types and ranges.', 'state_kind', [['values']]); }
    }
  }
  if (name === 'Graphic') {
    const domain = checked.data.domain as { xMin: number; xMax: number; yMin: number; yMax: number };
    if (!(domain.xMax > domain.xMin) || !(domain.yMax > domain.yMin)
      || !Number.isFinite(domain.xMax - domain.xMin) || !Number.isFinite(domain.yMax - domain.yMin))
      return reject('The canvas needs finite nonzero-width ranges on both axes.', 'graphic_domain', [['domain']]);
  }
  if (name === 'Curve') {
    const params = (checked.data.params || {}) as Record<string, unknown>, variable = String(checked.data.variable || 'x');
    if (Object.hasOwn(params, variable)) return reject('A curve variable cannot also name a parameter.', 'curve_expression', [['params']]);
    for (const key of ['expression', 'xExpression'] as const) {
      const source = checked.data[key];
      if (source === undefined) continue;
      try {
        const problem = checkCurveNames(parseCurveExpression(String(source)), [variable, ...Object.keys(params)]);
        if (problem) return reject(problem, 'curve_expression', [[key]]);
      } catch (error) { return reject(error instanceof Error ? error.message : 'This expression is invalid.', 'curve_expression', [[key]]); }
    }
    if (!(Number(checked.data.to) > Number(checked.data.from))) return reject('Curve from must be less than to.', 'curve_range', [['from'], ['to']]);
  }
  if (name === 'DragHandle') {
    const fields = [raw.xField, raw.yField].filter((value): value is string => typeof value === 'string');
    if (!fields.length || new Set(fields).size !== fields.length || fields.some(field => states[field]?.kind !== 'number'))
      return reject('A drag handle needs at least one existing, distinct local number field.', 'drag_fields', [['xField'], ['yField']]);
  }
  if (name === 'Motion' && Number(checked.data.durationMs) * Number(checked.data.iterations) > INTERACTIVE_PROGRAM_LIMITS.motionSeconds * 1000)
    return reject('This motion exceeds the supported finite duration.', 'motion_duration', [['durationMs'], ['iterations']]);
  if (name === 'Motion') {
    try {
      for (const frame of checked.data.frames as { values?: Record<string, unknown> }[])
        if (frame.values) {
          if (Object.keys(frame.values).some(key => states[key]?.kind !== 'number')) return reject('Motion frames can change only currently declared local number inputs.', 'motion_number_fields', [['frames']]);
          checkedProgramPatch(states, initialProgramState(states), frame.values);
        }
    } catch { return reject('Motion frames must satisfy currently declared local fields, types and ranges.', 'motion_state_patch', [['frames']]); }
  }
  return undefined;
}

/** Cross-prop/state checks absent from JSON Schema. Parent child-slot checks
 * and stable node identities belong to the compiler's native-tree walk. */
export function validateInteractivePrimitiveProperties(name: string, raw: Record<string, unknown>, states: InteractiveStateDeclarations): string | undefined {
  return inspectInteractivePrimitiveProperties(name, raw, states)?.message;
}
