import * as z from 'zod';

const finite = z.number().finite();
const parameterId = z.string().regex(/^[a-wyz][a-z0-9]{0,11}$/);
const scalar = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('constant'), value: finite.min(-10000).max(10000) }).strict(),
  z.object({ kind: z.literal('parameter'), id: parameterId }).strict(),
]);
const adjustable = z.object({ min: finite.min(-1000).max(1000), max: finite.min(-1000).max(1000),
  step: finite.positive().min(.0001).max(2000), initial: finite.min(-1000).max(1000) }).strict();
const parameters = adjustable.safeExtend({ id: parameterId, label: z.string().min(1).max(60) });

const aligned = (value: number, min: number, step: number) => {
  const index = (value - min) / step;
  return Math.abs(index - Math.round(index)) <= 1e-7 * Math.max(1, Math.abs(index));
};

/** A disclosed quadratic relation, not a program or a general simulation.
 * Source, lifecycle and the current teaching depth remain with its Study step. */
export const explorableStudySchema = z.object({
  kind: z.literal('quadratic'),
  relationship: z.enum(['original_problem', 'illustrative_example']).describe('Use original_problem only for the original problem actually read. Use illustrative_example for a separate example explaining the current difficulty without substituting a different problem.'),
  coefficients: z.object({ a: scalar, b: scalar, c: scalar }).strict(),
  parameters: z.array(parameters).max(3).describe('Only these finite parameters are editable. Coefficients are fixed numbers or parameter references, not arbitrary expressions, JS or HTML.'),
  x: adjustable.describe('The x probe and its range. Changing x moves the observation point on the same curve.'),
  y: z.object({ min: finite.min(-1000000).max(1000000), max: finite.min(-1000000).max(1000000) }).strict(),
  showSlope: z.boolean().describe('Show tangent and slope only when this teaching step addresses local rate of change. Do not hide later answers in the plot.'),
}).strict().superRefine((value, context) => {
  const ids = new Set<string>();
  const checkRange = (range: z.infer<typeof adjustable>, path: (string | number)[]) => {
    if (range.min >= range.max || range.max - range.min > 2000 || range.step > range.max - range.min
      || (range.max - range.min) / range.step > 10000 || range.initial < range.min || range.initial > range.max
      || !aligned(range.initial, range.min, range.step))
      context.addIssue({ code: 'custom', path, message: 'Range, initial value and step must form a finite adjustable relation.' });
  };
  checkRange(value.x, ['x']);
  if (value.y.min >= value.y.max || value.y.max - value.y.min < .01)
    context.addIssue({ code: 'custom', path: ['y'], message: 'The y-axis needs a nonzero-width range.' });
  value.parameters.forEach((parameter, index) => {
    checkRange(parameter, ['parameters', index]);
    if (ids.has(parameter.id)) context.addIssue({ code: 'custom', path: ['parameters', index, 'id'], message: 'Parameter IDs must be unique.' });
    ids.add(parameter.id);
  });
  const used = new Set<string>();
  for (const [key, coefficient] of Object.entries(value.coefficients)) if (coefficient.kind === 'parameter') {
    if (!ids.has(coefficient.id)) context.addIssue({ code: 'custom', path: ['coefficients', key], message: 'Coefficients may reference only declared parameters.' });
    used.add(coefficient.id);
  }
  for (const id of ids) if (!used.has(id)) context.addIssue({ code: 'custom', path: ['parameters'], message: 'Every editable parameter must participate in the relation; do not provide an inert control.' });
});
export type ExplorableStudySpec = z.infer<typeof explorableStudySchema>;
export const explorableStudyValuesSchema = z.object({ x: finite.min(-1000).max(1000),
  parameters: z.record(parameterId, finite.min(-1000).max(1000)) }).strict();
export type ExplorableStudyValues = z.infer<typeof explorableStudyValuesSchema>;
export interface ExplorableStudyReading { x: number; value: number; slope?: number }
export interface ExplorableStudyObservation {
  kind: 'calculation_hypothesis'; model: 'quadratic';
  values: ExplorableStudyValues;
  coefficients: { a: number; b: number; c: number };
  current: ExplorableStudyReading;
  original: { values: ExplorableStudyValues; reading: ExplorableStudyReading };
  originalAtCurrentX: ExplorableStudyReading;
  parameterChanged: boolean;
  changeExplanation?: string;
  meaning: string;
}
export interface ExplorableStudyProjection {
  observation: ExplorableStudyObservation;
  curve: { x: number; y: number }[];
  originalCurve?: { x: number; y: number }[];
  tangent?: { x: number; y: number }[];
  pointVisible: boolean;
}

export function initialExplorableValues(spec: ExplorableStudySpec): ExplorableStudyValues {
  return { x: spec.x.initial, parameters: Object.fromEntries(spec.parameters.map(parameter => [parameter.id, parameter.initial])) };
}
export function snapExplorableValue(value: number, range: { min: number; max: number; step: number }) {
  const lastIndex = Math.floor((range.max - range.min) / range.step + 1e-8);
  const index = Math.max(0, Math.min(lastIndex, Math.round((value - range.min) / range.step)));
  return Math.max(range.min, Math.min(range.max, range.min + index * range.step));
}
/** Legal values on the same declared step are the same condition, including
 * decimal steps whose binary floating-point representations differ. */
export function sameExplorableValue(left: number, right: number, range: { min: number; step: number }) {
  return Math.round((left - range.min) / range.step) === Math.round((right - range.min) / range.step);
}
export function validateExplorableValues(spec: ExplorableStudySpec, raw: unknown): ExplorableStudyValues {
  const values = explorableStudyValuesSchema.parse(raw);
  const valid = (value: number, range: { min: number; max: number; step: number }) =>
    value >= range.min && value <= range.max && aligned(value, range.min, range.step);
  if (!valid(values.x, spec.x) || Object.keys(values.parameters).length !== spec.parameters.length
    || spec.parameters.some(parameter => !Object.hasOwn(values.parameters, parameter.id)
      || !valid(values.parameters[parameter.id], parameter)))
    throw new Error('This condition is outside the current explanation’s finite range. Adjust it from the current sheet.');
  return values;
}
function coefficients(spec: ExplorableStudySpec, values: ExplorableStudyValues) {
  const read = (value: z.infer<typeof scalar>) => value.kind === 'constant' ? value.value : values.parameters[value.id];
  return { a: read(spec.coefficients.a), b: read(spec.coefficients.b), c: read(spec.coefficients.c) };
}
function reading(spec: ExplorableStudySpec, values: ExplorableStudyValues, x = values.x): ExplorableStudyReading {
  const { a, b, c } = coefficients(spec, values), value = a * x * x + b * x + c, slope = 2 * a * x + b;
  if (!Number.isFinite(value) || !Number.isFinite(slope)) throw new Error('The value under this condition exceeds this step’s display range.');
  return { x, value, ...(spec.showSlope ? { slope } : {}) };
}

function explainChange(observation: ExplorableStudyObservation, xChanged: boolean) {
  if (!observation.parameterChanged && !xChanged) return;
  const current = observation.current, before = observation.parameterChanged ? observation.originalAtCurrentX : observation.original.reading;
  const close = (left: number, right: number) => Math.abs(left - right) <= 1e-8 * Math.max(1, Math.abs(left), Math.abs(right));
  const prefix = observation.parameterChanged ? 'At the same x, compared with the original conditions, ' : 'Compared with the initial observation point, ';
  const height = current.value === before.value ? 'the height is unchanged' : close(current.value, before.value)
    ? 'the height is almost unchanged' : current.value > before.value ? 'the point is higher' : 'the point is lower';
  if (current.slope === undefined || before.slope === undefined) return prefix + height + '。';
  if (current.slope * before.slope < 0) return prefix + height + ', but the tangent tilts in the opposite direction.';
  const nowTilt = Math.abs(current.slope), previousTilt = Math.abs(before.slope);
  const tilt = nowTilt === previousTilt ? 'the tangent is equally steep' : close(nowTilt, previousTilt)
    ? 'the tangent is almost equally steep' : nowTilt > previousTilt ? 'the tangent is steeper' : 'the tangent is flatter';
  return prefix + height + '，' + tilt + '。';
}

/** Both renderer preview and host adoption use this exact finite calculation.
 * The host must still re-read the current owner before adopting the result. */
export function projectExplorableStudy(spec: ExplorableStudySpec, raw: unknown): ExplorableStudyProjection {
  const values = validateExplorableValues(spec, raw), originalValues = initialExplorableValues(spec);
  const current = reading(spec, values), original = reading(spec, originalValues);
  const parameterChanged = spec.parameters.some(parameter => !sameExplorableValue(values.parameters[parameter.id], parameter.initial, parameter));
  const points = (condition: ExplorableStudyValues) => Array.from({ length: 201 }, (_, index) => {
    const x = spec.x.min + (spec.x.max - spec.x.min) * index / 200;
    return { x, y: reading(spec, condition, x).value };
  });
  const halfTangent = (spec.x.max - spec.x.min) * .12;
  const observation: ExplorableStudyObservation = { kind: 'calculation_hypothesis', model: 'quadratic', values,
    coefficients: coefficients(spec, values), current, original: { values: originalValues, reading: original },
    originalAtCurrentX: reading(spec, originalValues, values.x), parameterChanged,
    meaning: 'These are finite calculations for changed conditions in the current teaching model. They do not prove a changed original problem, real user facts, a personal answer, completion or mastery. Curve samples are only for drawing; observation values and slope are calculated directly from the original expression.' };
  const changeExplanation = explainChange(observation, !sameExplorableValue(values.x, spec.x.initial, spec.x));
  if (changeExplanation) observation.changeExplanation = changeExplanation;
  return { observation,
    curve: points(values), ...(parameterChanged ? { originalCurve: points(originalValues) } : {}),
    ...(spec.showSlope ? { tangent: [-1, 1].map(direction => ({ x: values.x + direction * halfTangent,
      y: current.value + current.slope! * direction * halfTangent })) } : {}),
    pointVisible: current.value >= spec.y.min && current.value <= spec.y.max };
}

export function formatExplorableNumber(value: number) {
  if (value === 0) return '0';
  if (Math.abs(value) >= 100000 || Math.abs(value) < .0001) return value.toExponential(3);
  return String(Number(value.toFixed(4)));
}
export function explorableQuadraticTex(spec: ExplorableStudySpec) {
  const terms: string[] = [];
  for (const [key, power] of [['a', 2], ['b', 1], ['c', 0]] as const) {
    const scalar = spec.coefficients[key];
    if (scalar.kind === 'constant' && scalar.value === 0) continue;
    const negative = scalar.kind === 'constant' && scalar.value < 0;
    const magnitude = scalar.kind === 'constant' ? Math.abs(scalar.value) : undefined;
    const number = scalar.kind === 'parameter' ? `\\mathrm{${scalar.id}}` : String(magnitude).includes('e')
      ? magnitude!.toExponential().replace(/([\d.]+)e([+-]?\d+)/, (_, base, exponent) => `${base}\\cdot10^{${Number(exponent)}}`) : String(magnitude);
    const coefficient = magnitude === 1 && power > 0 ? '' : number;
    terms.push(`${terms.length ? negative ? '-' : '+' : negative ? '-' : ''}${coefficient}${power === 2 ? 'x^2' : power === 1 ? 'x' : ''}`);
  }
  return `f(x)=${terms.join('') || '0'}`;
}
