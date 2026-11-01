import { defineFunction, type DefinedFunction, type EvaluationContext } from '@openuidev/lang-core';
import * as z from 'zod/v4';
import { INTERACTIVE_PROGRAM_LIMITS, PROGRAM_AST_RULES, type ProgramDataMap } from './interactive-program';

export type InteractiveFunctionReturnKind = 'number?' | 'boolean?' | 'boolean' | 'text?' | 'collection?' | 'data';
export type InteractiveFunctionReturnRule = { kind: 'branch_join'; conditionArgument: 0;
  branchArguments: readonly [1, 2, 3]; condition: 'boolean_or_null' };
export type InteractiveFunctionCardinalityRule = { kind: 'length'; argument: 0 }
  | { kind: 'count_argument'; argument: 2 }
  | { kind: 'input_length' | 'at_most_input'; argument: 0; countArgument?: 2 };
export interface InteractiveFunctionMetadata {
  returnKind: InteractiveFunctionReturnKind;
  maxItems?: number;
  minimumArguments?: number;
  returnRule?: InteractiveFunctionReturnRule;
  cardinalityRule?: InteractiveFunctionCardinalityRule;
}
type Entry = InteractiveFunctionMetadata & { definition: DefinedFunction<any, any> };
const scalar = z.number().finite().nullable().default(null);
const numberResult = z.number().finite().nullable();
const collection = z.array(z.unknown()).max(INTERACTIVE_PROGRAM_LIMITS.collection).nullable().default(null);
const numericCollection = z.array(z.number().finite().nullable()).max(INTERACTIVE_PROGRAM_LIMITS.collection).nullable().default(null);
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const resultNumber = (value: number) => Number.isFinite(value) ? value : null;
function bounded<T>(values: T[]): T[] {
  if (values.length > INTERACTIVE_PROGRAM_LIMITS.collection)
    throw new Error('This sequence exceeds the supported range. Reduce its size; a truncated sequence was not presented as complete.');
  return values;
}
function unary(name: string, description: string, compute: (value: number) => number | null): Entry {
  return { returnKind: 'number?', definition: defineFunction({ name, description,
    params: z.object({ value: scalar }), returns: numberResult,
    fn: ({ value }) => { if (!isNumber(value)) return null; const result = compute(value); return result === null ? null : resultNumber(result); },
  }) };
}
function binary(name: string, description: string, compute: (left: number, right: number) => number | null): Entry {
  return { returnKind: 'number?', definition: defineFunction({ name, description,
    params: z.object({ left: scalar, right: scalar }), returns: numberResult,
    fn: ({ left, right }) => { if (!isNumber(left) || !isNumber(right)) return null;
      const result = compute(left, right); return result === null ? null : resultNumber(result); },
  }) };
}
function comparison(name: string, description: string, compare: (left: number, right: number) => boolean): Entry {
  return { returnKind: 'boolean?', definition: defineFunction({ name, description,
    params: z.object({ left: scalar, right: scalar }), returns: z.boolean().nullable(),
    fn: ({ left, right }) => isNumber(left) && isNumber(right) ? compare(left, right) : null,
  }) };
}
function aggregate(name: string, description: string, compute: (values: number[]) => number | null): Entry {
  return { returnKind: 'number?', definition: defineFunction({ name, description,
    params: z.object({ values: numericCollection }), returns: numberResult,
    fn: ({ values }) => {
      if (!Array.isArray(values)) return null;
      bounded(values);
      if (!values.every(isNumber)) return null;
      const result = compute(values); return result === null ? null : resultNumber(result);
    },
  }) };
}
const entries: Entry[] = [
  binary('Add', 'Add finite real numbers. Unknown values propagate as null; missing values never become zero.', (a, b) => a + b),
  binary('Subtract', 'Subtract finite real numbers; unknown values propagate as null.', (a, b) => a - b),
  binary('Multiply', 'Multiply finite real numbers; unknown values propagate as null.', (a, b) => a * b),
  binary('Divide', 'Divide finite real numbers. A zero denominator, unknown input or nonfinite result returns null.', (a, b) => b === 0 ? null : a / b),
  binary('Remainder', 'Remainder of finite real numbers; zero divisor or unknown input returns null.', (a, b) => b === 0 ? null : a % b),
  binary('Power', 'Real exponentiation. Nonreal results, zero to the zeroth power, unknown inputs and nonfinite results return null.', (a, b) => a === 0 && b === 0 ? null : Math.pow(a, b)),
  unary('Negative', 'Negate a finite real number; unknown input returns null.', value => -value),
  unary('Absolute', 'Absolute value of a finite real number; unknown input returns null.', Math.abs),
  unary('Sin', 'Sine in radians; unknown or nonfinite input returns null.', Math.sin),
  unary('Cos', 'Cosine in radians; unknown or nonfinite input returns null.', Math.cos),
  { returnKind: 'number?', definition: defineFunction({ name: 'Atan2', description: 'Signed angle of vector (x,y) relative to positive x, in [-π,π] radians. Arguments are y,x; a zero vector, unknown or nonfinite input returns null.',
    params: z.object({ y: scalar, x: scalar }), returns: numberResult,
    fn: ({ y, x }) => isNumber(y) && isNumber(x) && (x !== 0 || y !== 0) ? Math.atan2(y, x) : null }) },
  unary('Sqrt', 'Square root of a nonnegative real number; negative or unknown input returns null.', value => value < 0 ? null : Math.sqrt(value)),
  unary('Exp', 'Natural exponential; overflow or unknown input returns null.', Math.exp),
  unary('Log', 'Natural logarithm; nonpositive or unknown input returns null.', value => value <= 0 ? null : Math.log(value)),
  comparison('Less', 'Strict less-than for finite real numbers; either unknown input returns null.', (a, b) => a < b),
  comparison('LessEqual', 'Less-than-or-equal for finite real numbers; either unknown input returns null.', (a, b) => a <= b),
  comparison('Greater', 'Strict greater-than for finite real numbers; either unknown input returns null.', (a, b) => a > b),
  comparison('GreaterEqual', 'Greater-than-or-equal for finite real numbers; either unknown input returns null.', (a, b) => a >= b),
  aggregate('Total', 'Sum a known numeric sequence; a known empty sequence sums to zero. Unknown members or overflow return null.', values => values.reduce((sum, value) => sum + value, 0)),
  aggregate('Mean', 'Mean of a known nonempty numeric sequence; empty, unknown or overflowing results return null.', values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null),
  aggregate('Smallest', 'Minimum of a known nonempty numeric sequence; empty or unknown input returns null.', values => values.length ? Math.min(...values) : null),
  aggregate('Largest', 'Maximum of a known nonempty numeric sequence; empty or unknown input returns null.', values => values.length ? Math.max(...values) : null),
  { returnKind: 'boolean', definition: defineFunction({ name: 'Known', description: 'Whether a value is neither null nor undefined. This does not judge source completeness or factual correctness.',
    params: z.object({ value: z.unknown().default(null) }), returns: z.boolean(), fn: ({ value }) => value !== null && value !== undefined }) },
  { returnKind: 'data', minimumArguments: 4, returnRule: { kind: 'branch_join', conditionArgument: 0,
    branchArguments: [1, 2, 3], condition: 'boolean_or_null' }, definition: defineFunction({ name: 'Choose', description: 'Choose one supplied pure value for true, false or unknown. All three branches are required; unknown is not false. No action executes.',
    params: z.object({ condition: z.boolean().nullable().default(null), whenTrue: z.unknown().default(null),
      whenFalse: z.unknown().default(null), whenUnknown: z.unknown().default(null) }), returns: z.unknown(),
    fn: ({ condition, whenTrue, whenFalse, whenUnknown }) => condition === true ? whenTrue : condition === false ? whenFalse : whenUnknown }) },
  { returnKind: 'boolean?', definition: defineFunction({ name: 'Equal', description: 'Strictly compare finite scalars of the same type; unknown or different types are not treated as equal.',
    params: z.object({ left: z.union([scalar, z.string(), z.boolean()]).default(null), right: z.union([scalar, z.string(), z.boolean()]).default(null) }),
    returns: z.boolean().nullable(), fn: ({ left, right }) => left === null || right === null ? null : typeof left === typeof right && left === right }) },
  { returnKind: 'number?', definition: defineFunction({ name: 'AsNumber', description: 'Accept only an actual finite number; do not coerce text, empty values or booleans.',
    params: z.object({ value: z.unknown().default(null) }), returns: numberResult, fn: ({ value }) => isNumber(value) ? value : null }) },
  { returnKind: 'text?', definition: defineFunction({ name: 'AsText', description: 'Accept only an actual string; unknown or other types return null.',
    params: z.object({ value: z.unknown().default(null) }), returns: z.string().nullable(), fn: ({ value }) => typeof value === 'string' ? value : null }) },
  { returnKind: 'number?', definition: defineFunction({ name: 'ParseNumber', description: 'Explicitly parse decimal text. Empty, invalid or nonfinite values return null without an implicit zero.',
    params: z.object({ text: z.string().max(160).nullable().default(null) }), returns: numberResult,
    fn: ({ text }) => typeof text === 'string' && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text.trim())
      ? resultNumber(Number(text.trim())) : null }) },
  { returnKind: 'number?', cardinalityRule: { kind: 'length', argument: 0 }, definition: defineFunction({ name: 'Length', description: 'Length of a known array; unknown input returns null. It is not a count of unread or undelivered data.',
    params: z.object({ values: collection }), returns: numberResult,
    fn: ({ values }) => Array.isArray(values) ? bounded(values).length : null }) },
  { returnKind: 'data', definition: defineFunction({ name: 'Item', description: 'Read a zero-based index of a known array; out-of-range or unknown input returns null and does not acquire new data.',
    params: z.object({ values: collection, index: scalar }), returns: z.unknown(),
    fn: ({ values, index }) => Array.isArray(values) && isNumber(index) && Number.isSafeInteger(index)
      && index >= 0 && index < bounded(values).length ? values[index] ?? null : null }) },
  { returnKind: 'data', definition: defineFunction({ name: 'Field', description: 'Read one literal own field of a supplied JSON object. Unknown or prototype fields return null; no path or query executes.',
    params: z.object({ value: z.unknown().default(null), key: z.string().min(1).max(160) }), returns: z.unknown(),
    fn: ({ value, key }) => value && typeof value === 'object' && !Array.isArray(value)
      && !PROGRAM_AST_RULES.forbiddenMemberKeys.includes(key) && Object.hasOwn(value, key)
      ? (value as Record<string, unknown>)[key] ?? null : null }) },
  { returnKind: 'collection?', maxItems: INTERACTIVE_PROGRAM_LIMITS.collection, cardinalityRule: { kind: 'count_argument', argument: 2 }, definition: defineFunction({ name: 'Range',
    description: 'Sample count finite numbers uniformly from start through end, including both ends. count=1 gives start; count=0 gives an empty sequence. More than 256 items is explicitly rejected without silent truncation.',
    params: z.object({ start: scalar, end: scalar, count: scalar }), returns: numericCollection,
    fn: ({ start, end, count }) => {
      if (!isNumber(start) || !isNumber(end) || !isNumber(count)) return null;
      if (!Number.isSafeInteger(count) || count < 0) return null;
      if (count > INTERACTIVE_PROGRAM_LIMITS.collection) throw new Error('At most 256 items can be expanded. Reduce the point count; truncation is not a complete sequence.');
      if (count === 0) return [];
      if (count === 1) return [start];
      const span = end - start;
      if (!Number.isFinite(span)) return null;
      const values = Array.from({ length: count }, (_, index) => start + span * (index / (count - 1)));
      return values.every(isNumber) ? values : null;
    } }) },
  { returnKind: 'collection?', maxItems: INTERACTIVE_PROGRAM_LIMITS.collection, cardinalityRule: { kind: 'input_length', argument: 0 }, definition: defineFunction({ name: 'Enumerate',
    description: 'Convert a known array to an {index,value} sequence for graphics or lists; unknown input returns null, with at most 256 items.',
    params: z.object({ values: collection }), returns: collection,
    fn: ({ values }) => Array.isArray(values) ? bounded(values).map((value, index) => ({ index, value })) : null }) },
  { returnKind: 'collection?', maxItems: INTERACTIVE_PROGRAM_LIMITS.collection, cardinalityRule: { kind: 'input_length', argument: 0 }, definition: defineFunction({ name: 'ReverseSequence',
    description: 'Return a reversed copy of a known sequence without modifying its read-only source; unknown input returns null.',
    params: z.object({ values: collection }), returns: collection,
    fn: ({ values }) => Array.isArray(values) ? [...bounded(values)].reverse() : null }) },
  { returnKind: 'collection?', maxItems: INTERACTIVE_PROGRAM_LIMITS.collection, cardinalityRule: { kind: 'at_most_input', argument: 0, countArgument: 2 }, definition: defineFunction({ name: 'SliceSequence',
    description: 'Explicitly take count items from start in a known sequence. This is not proof of completeness and does not modify the source. Unknown input or invalid indices return null.',
    params: z.object({ values: collection, start: scalar, count: scalar }), returns: collection,
    fn: ({ values, start, count }) => Array.isArray(values) && isNumber(start) && Number.isSafeInteger(start) && start >= 0
      && isNumber(count) && Number.isSafeInteger(count) && count >= 0 && count <= INTERACTIVE_PROGRAM_LIMITS.collection
      ? bounded(values).slice(start, start + count) : null }) },
  { returnKind: 'collection?', maxItems: INTERACTIVE_PROGRAM_LIMITS.collection, cardinalityRule: { kind: 'input_length', argument: 0 }, definition: defineFunction({ name: 'SortSequence',
    description: 'Sort a copy of a known homogeneous finite-number or text sequence. Text uses deterministic lexical order, not a linguistic collation. Mixed or unknown members return null.',
    params: z.object({ values: collection, direction: z.enum(['asc', 'desc']).default('asc') }), returns: collection,
    fn: ({ values, direction }) => {
      if (!Array.isArray(values)) return null;
      bounded(values);
      const sign = direction === 'desc' ? -1 : 1;
      if (values.every(isNumber)) return [...values].sort((a, b) => a < b ? -sign : a > b ? sign : 0);
      if (values.every((value): value is string => typeof value === 'string'))
        return [...values].sort((a, b) => a < b ? -sign : a > b ? sign : 0);
      return null;
    } }) },
  { returnKind: 'number?', definition: defineFunction({ name: 'TextLength', description: 'Unicode code-point count of known text; unknown input returns null. UTF-16 surrogate pairs are not split.',
    params: z.object({ text: z.string().max(INTERACTIVE_PROGRAM_LIMITS.text).nullable().default(null) }), returns: numberResult,
    fn: ({ text }) => typeof text === 'string' ? Array.from(text).length : null }) },
  { returnKind: 'boolean?', definition: defineFunction({ name: 'TextContains', description: 'Literal substring matching without regular-expression or code execution; unknown input returns null.',
    params: z.object({ text: z.string().max(INTERACTIVE_PROGRAM_LIMITS.text).nullable().default(null),
      query: z.string().max(INTERACTIVE_PROGRAM_LIMITS.text).nullable().default(null), caseSensitive: z.boolean().default(false) }),
    returns: z.boolean().nullable(), fn: ({ text, query, caseSensitive }) => typeof text !== 'string' || typeof query !== 'string' ? null
      : caseSensitive ? text.includes(query) : text.toLowerCase().includes(query.toLowerCase()) }) },
  { returnKind: 'collection?', maxItems: INTERACTIVE_PROGRAM_LIMITS.collection, definition: defineFunction({ name: 'SplitText',
    description: 'Split known text on a literal delimiter; an empty delimiter splits Unicode code points. At most 256 items are allowed; excess is explicitly rejected. No regular expression executes.',
    params: z.object({ text: z.string().max(INTERACTIVE_PROGRAM_LIMITS.text).nullable().default(null), separator: z.string().max(32).default('\n') }),
    returns: collection, fn: ({ text, separator }) => typeof text === 'string' ? bounded(separator === '' ? Array.from(text) : text.split(separator)) : null }) },
  { returnKind: 'collection?', maxItems: INTERACTIVE_PROGRAM_LIMITS.collection, cardinalityRule: { kind: 'at_most_input', argument: 0 }, definition: defineFunction({ name: 'FilterText',
    description: 'Filter a known text sequence by literal containment without acquiring data. Unknown or mixed members return null; an empty result does not establish absence from the source.',
    params: z.object({ values: z.array(z.string()).max(INTERACTIVE_PROGRAM_LIMITS.collection).nullable().default(null),
      query: z.string().max(INTERACTIVE_PROGRAM_LIMITS.text).nullable().default(null), caseSensitive: z.boolean().default(false) }),
    returns: collection, fn: ({ values, query, caseSensitive }) => {
      if (!Array.isArray(values) || typeof query !== 'string') return null;
      bounded(values);
      if (!values.every(value => typeof value === 'string')) return null;
      const needle = caseSensitive ? query : query.toLowerCase();
      return bounded(values).filter(value => (caseSensitive ? value : value.toLowerCase()).includes(needle));
    } }) },
  { returnKind: 'collection?', maxItems: INTERACTIVE_PROGRAM_LIMITS.collection, definition: defineFunction({ name: 'Points',
    description: 'Pair equal-length x/y sequences into {x,y} points. Unknown points retain null gaps; unequal lengths or unknown sequences return null without invented connections.',
    params: z.object({ x: numericCollection, y: numericCollection }),
    returns: z.array(z.object({ x: z.number().finite(), y: z.number().finite() }).nullable()).max(INTERACTIVE_PROGRAM_LIMITS.collection).nullable(),
    fn: ({ x, y }) => {
      if (!Array.isArray(x) || !Array.isArray(y) || x.length !== y.length) return null;
      bounded(x); bounded(y);
      return x.map((value, index) => isNumber(value) && isNumber(y[index]) ? { x: value, y: y[index]! } : null);
    } }) },
  { returnKind: 'text?', definition: defineFunction({ name: 'FormatNumber', description: 'Format a finite number as text with at most the specified 0–10 decimal places. Unknown input returns null; rounding is not proof of mathematical equality.',
    params: z.object({ value: scalar, decimals: z.number().int().min(0).max(10).default(3) }), returns: z.string().nullable(),
    fn: ({ value, decimals }) => isNumber(value) && Number.isSafeInteger(decimals) && decimals >= 0 && decimals <= 10
      ? String(Number(value.toFixed(decimals))) : null }) },
  { returnKind: 'text?', definition: defineFunction({ name: 'JoinText', description: 'Join a known text sequence. Any unknown item returns null rather than silently turning missing text into a definite statement.',
    params: z.object({ parts: z.array(z.string().nullable()).max(INTERACTIVE_PROGRAM_LIMITS.collection).nullable().default(null), separator: z.string().max(32).default('') }),
    returns: z.string().max(INTERACTIVE_PROGRAM_LIMITS.text).nullable(), fn: ({ parts, separator }) => {
      if (!Array.isArray(parts)) return null;
      bounded(parts);
      if (!parts.every(part => typeof part === 'string')) return null;
      const text = parts.join(separator);
      if (text.length > INTERACTIVE_PROGRAM_LIMITS.text) throw new Error('This derived text is too long; keep only the part needed now.');
      return text;
    } }) },
];

const dataEntry = (data: ProgramDataMap): Entry => ({ returnKind: 'data', maxItems: INTERACTIVE_PROGRAM_LIMITS.collection,
  definition: defineFunction({ name: 'Data', description: 'Read only host-checked alias data bound to this program. Unknown aliases return null; no file, network or tool access occurs and no new permission is granted.',
    params: z.object({ alias: z.string().min(1).max(48) }), returns: z.unknown(),
    fn: ({ alias }) => Object.hasOwn(data, alias) ? data[alias] : null,
  }),
});
/** The metadata and definitions come from the same entries, not a parallel
 * hand-maintained permission list. No callbacks, I/O or model code run here. */
export const interactiveFunctionMetadata: Readonly<Record<string, InteractiveFunctionMetadata>> = Object.freeze(
  Object.fromEntries([...entries, dataEntry({})].map(({ definition, returnKind, maxItems, minimumArguments, returnRule, cardinalityRule }) => [definition.name,
    { returnKind, ...(maxItems === undefined ? {} : { maxItems }), ...(minimumArguments === undefined ? {} : { minimumArguments }),
      ...(returnRule === undefined ? {} : { returnRule }), ...(cardinalityRule === undefined ? {} : { cardinalityRule }) }])),
);
export const interactiveFunctionNames: readonly string[] = Object.freeze(Object.keys(interactiveFunctionMetadata));
export function createInteractiveFunctions(data: ProgramDataMap = {}): DefinedFunction<any, any>[] {
  return [...entries.map(entry => entry.definition), dataEntry(data).definition];
}
export type InteractiveEvaluationFunctions = NonNullable<EvaluationContext['functions']>;
