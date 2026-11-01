import type { ToolSpec } from '../provider';

/**
 * What the model sees on every request. The full tool contracts stay with the
 * host (zod validation, permissions and execution are unchanged); the model
 * gets the everyday tools directly, plus one `use_tool` entry through which the
 * specialized ones can be inspected and called. Measured on 2026-10-21 the full
 * catalogue was ~190K characters per request, most of it schema structure for
 * tools a given turn never needs.
 */

/** Specialized tools, grouped by the activity they serve. A family is offered
 * directly again whenever the current turn is already inside that activity. */
export const DEFERRED_TOOL_FAMILIES = {
  study: ['study_companion', 'read_study_companion', 'manage_learning', 'read_learning'],
  rehearsal: ['manage_relationship_rehearsal', 'read_relationship_rehearsal'],
  letter: ['write_reflective_letter', 'read_reflective_letter'],
  curiosity: ['curiosity_invitation', 'read_shared_creation'],
  companion: ['manage_companion_session', 'read_companion_session', 'read_companion_history', 'manage_companion', 'read_companion'],
  planning: ['offer_planning_alternatives', 'read_planning_alternative', 'continue_planning', 'manage_planning_intent', 'calculate_available_time'],
  methods: ['manage_method', 'read_method_help', 'manage_basis'],
} as const;
export type DeferredFamily = keyof typeof DEFERRED_TOOL_FAMILIES;
const FAMILY_PURPOSE: Record<DeferredFamily, string> = {
  study: 'Study together, returning to the original problem, attempt and hint',
  rehearsal: 'Try saying something that is difficult to put into words',
  letter: 'Write a letter grounded in actual shared experiences',
  curiosity: 'Bring something new to play with or create together',
  companion: 'Work together, leave a stopping point and continue later',
  planning: 'Compare arrangements, tradeoffs and genuinely available time',
  methods: 'Save, revise or disable personal methods; find existing methods with discover_skills and read_skill',
};
const familyOf = new Map<string, DeferredFamily>(Object.entries(DEFERRED_TOOL_FAMILIES)
  .flatMap(([family, names]) => names.map(name => [name, family as DeferredFamily] as const)));
export const USE_TOOL = 'use_tool';

/** One-line purposes shown in the `use_tool` description so the model knows
 * what exists without reading any schema. */
const PURPOSE: Record<string, string> = {
  study_companion: 'Open or continue a study sheet with its original problem, personal attempt and hint depth',
  read_study_companion: 'Read the original study sheet',
  manage_learning: 'Record a real attempt in shared study work',
  read_learning: 'Find earlier original problems, attempts and help',
  manage_relationship_rehearsal: 'Rehearse difficult words together; simulate one possible response from the other person',
  read_relationship_rehearsal: 'Read an earlier rehearsal',
  write_reflective_letter: 'Write a private letter with a real reason behind it',
  read_reflective_letter: 'Read an existing letter',
  curiosity_invitation: 'Bring something immediately readable or playable: a creation, puzzle, observation or real discovery',
  read_shared_creation: 'Read the original chapter of a shared creation',
  manage_companion_session: 'Begin, checkpoint, put aside or resume something you are doing together',
  read_companion_session: 'Return to the stopping point of shared work',
  read_companion_history: 'Read an original explanation on a shared work page',
  manage_companion: 'Keep an entrance to a worthwhile topic, shared expression or feedback',
  read_companion: 'Return to the original words of an unfinished topic or shared expression',
  offer_planning_alternatives: 'Compare two to four meaningfully different complete arrangements',
  read_planning_alternative: 'Read one version of an arrangement',
  continue_planning: 'Continue revising or saving an arrangement already compared',
  manage_planning_intent: 'Retain or revise the conditions this plan must respect so discussion can continue later',
  calculate_available_time: 'Calculate usable time from occupied intervals and transition costs',
  manage_method: 'Save a grounded personal method when the person asks for this kind of help again',
  read_method_help: 'Read the original help behind a personal method',
  manage_basis: 'Record an interpretation needed across turns and the conditions for retiring it',
};

/** Everyday tools stay directly callable. These short introductions only
 * replace repeated top-level prose; use_tool reads the owner's original
 * description and full parameters when more detail is useful. */
const TOOL_INTRODUCTIONS: Record<string, string> = {
  present_view: 'Let your visual participation and the material being considered follow the conversation. To choose only your own activity, pass {"companionActivity":"play","sceneRefs":[],"layout":"stack"}, for example when making or playing with something together; use reading for shared reading and consult companionActivity for other poses. No lookup, task or new Scene is required. A request not to research still allows choosing your expression. Keep the current activity when suitable; a call every turn is unnecessary. This delivers a pose intention, not proof of a seen gesture. Distinguish imagination, invitation and actual rendering; hidden, portrait-only, custom appearance and reduced-motion choices take precedence. Maps, schedules, study sheets, plan comparisons and creations can also unfold here. Use real returned sceneRefs; for notes and rehearsal use the original result present.arguments; campusDisplay selects term and grade basis. Read authoring methods through read_skill. Continue original objects at their real addresses and versions, respecting the camera after manual browsing.',
  update_collaboration: 'Record what is clear, what remains undone, what an actual attempt showed and what changed. Keep established points and provisional hypotheses distinct; use choose for an explicit choice or withdrawal. Explanation, spontaneous writing and discussion can live directly in the reply. Link an independent draft or native page when one is needed. Save real arrangements through their original action.',
  prepare_release: 'Prepare a separate draft page, version or body for a specific recipient when explicitly requested, preserving the audience, purpose and permitted material. Continue an existing draft with its real priorArtifactId; include concrete from/to for availability writing. The body appears on its own page while conversation and revision continue. Ordinary explanation, spontaneous co-writing and private discussion can be completed in the reply; choose delivery from the actual need.',
  prepare_action: 'Complete an explicitly delegated local arrangement, or prepare an actionable proposal while it is still being discussed. Offer a complete plan through its original planId. Preserve real dates and reminder times for individual requests, leaving unknown duration unset. The result distinguishes a prepared suggestion, a saved arrangement and any missing step.',
  look_up: 'Read relevant original sources: campus courses and grades, saved arrangements, weather, maps or earlier words. source chooses the source; use the capability catalog for others, describeOnly for the contract, then arguments to read. Try other terms or browse the catalog when a query fails. Continue dates and pages at the original address; returned sceneRefs can unfold directly. situation.read combines arrangements across sources for up to 31 days.',
  manage_attention: 'Retain an entrustment, pause or stop it, change it to one reminder, or record feedback about contact timing. Continue the original entrustment with its deadline, channel and stop conditions. Use wakeAt for a definite instant and recalculate relative dates from the current day. Reservations and outgoing messages use their own actions.',
  restore_collaboration: 'Resume unfinished discussion or work, finding original words, earlier understanding and later condition changes. The default is the current conversation. With an original source address, source_related finds related work and methods; continue through their bodies and pagination. Read planning conditions through planning_intent. Judge current relevance after finding a lead.',
  inspect_help: 'Review prepared materials, entrusted work and interaction agreements. Find them by terms, related work, status or date, then read their bodies and reasons at the original id. decide_help can bring still-applicable materials into the conversation; actual delivery stages are recorded separately.',
  read_assistant_history: 'Read what you previously said or offered. Page through a known reply id, or locate a continuous phrase. conversationContext beside original user words can reach adjacent replies; historicalWorks reaches original shared chapters. Continue from what was actually read, while checking later revisions.',
  read_skill: 'Read a suitable method and its conditions at its exact id, following next for later pages. Choose interactive-program authoring for new creations; recover the original before editing. When applying a personal method now, forCurrentHelp links this turn and work. Read a method directly when reviewing or revising it.',
  discover_skills: 'Find saved personal methods or methods for the current matter. Read catalog ids through read_skill, preserving forCurrentHelp when applying them. Use manage_method to save a new approach, revise one or disable it.',
  read_interactive_program: 'Recover the same interactive creation source, text positions and actual state declarations at messageId/programId/revision. overview gives a summary; source provides pages or full source; find locates text; states reads fields. Continue current gestures and values from this turn UIref. Source and subsequent pages retain the original address.',
  read_current_campus_selection: 'Open the indicated campus record at its original ID and version. Select slot A or B when currentWorkspace contains both. For courses, occurrences and exams, fields selects only what is needed. Read grades and GPA under their original policy basis; the result records the actual read extent.',
};

const DROP_KEYS = new Set(['$schema', 'minLength', 'maxLength', 'minItems', 'maxItems', 'pattern']);
/** Remove validation-only noise from a model-facing schema. Enums, required
 * lists, formats, defaults and descriptions stay; the host still validates the
 * full contract before anything runs. */
export function compactSchema<T>(value: T): T {
  // A schema node's keys are keywords; the keys of a `properties` (or `$defs`)
  // map are field names and must survive even when one is called maxLength.
  const names = (node: unknown): unknown => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return schema(node);
    return Object.fromEntries(Object.entries(node).map(([name, item]) => [name, schema(item)]));
  };
  const schema = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(schema);
    if (!node || typeof node !== 'object') return node;
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(node)) {
      if (DROP_KEYS.has(key)) continue;
      if (key === 'additionalProperties' && item === false) continue;
      if (key === 'maximum' && item === Number.MAX_SAFE_INTEGER) continue;
      result[key] = ['properties', 'patternProperties', '$defs', 'definitions'].includes(key) ? names(item) : schema(item);
    }
    return result;
  };
  return schema(value) as T;
}
export function compactToolSpec(spec: ToolSpec): ToolSpec {
  return { ...spec, function: { ...spec.function, parameters: compactSchema(spec.function.parameters) } };
}

export function deferredFamily(name: string) { return familyOf.get(name); }

/** Search only the host's current permission-filtered contracts. This is an
 * explicit model query over documentation, never a router over user messages. */
export function deferredToolCatalog(all: readonly ToolSpec[], options: {
  query?: string; family?: DeferredFamily; offset?: number; limit?: number;
} = {}) {
  const query = (options.query || '').normalize('NFKC').trim(), normalized = query.toLowerCase();
  const terms = [...new Set((normalized.match(/[a-z0-9_.:-]+|[\p{Script=Han}]+/gu) || []).flatMap(word => {
    if (!/\p{Script=Han}/u.test(word)) return [word];
    const points = Array.from(word);
    return [word, ...points.slice(0, -1).map((point, index) => point + points[index + 1])];
  }))];
  const rows = all.flatMap(spec => {
    const family = familyOf.get(spec.function.name);
    if (!family || options.family && family !== options.family) return [];
    const purpose = PURPOSE[spec.function.name] || spec.function.description;
    const text = `${spec.function.name} ${family} ${FAMILY_PURPOSE[family]} ${purpose} ${spec.function.description}`.normalize('NFKC').toLowerCase();
    const score = normalized === spec.function.name.toLowerCase() ? Number.MAX_SAFE_INTEGER
      : terms.reduce((total, term) => total + (text.includes(term) ? term.length : 0), 0);
    return normalized && !score ? [] : [{ spec, family, purpose, score }];
  }).sort((a, b) => b.score - a.score || a.spec.function.name.localeCompare(b.spec.function.name, 'en'));
  const offset = options.offset || 0, limit = options.limit || 8;
  const items = rows.slice(offset, offset + limit).map(({ spec, family, purpose }) => ({
    name: spec.function.name, family, purpose, familyPurpose: FAMILY_PURPOSE[family],
    ...(Array.isArray((spec.function.parameters as { required?: string[] }).required)
      ? { required: (spec.function.parameters as { required: string[] }).required } : {}),
    read: { tool: USE_TOOL, arguments: { name: spec.function.name } },
  }));
  const nextOffset = offset + items.length < rows.length ? offset + items.length : null;
  return { status: 'catalog' as const, catalogOnly: true, items, nextOffset, total: rows.length,
    ...(nextOffset !== null ? { continuation: { tool: USE_TOOL, arguments: {
      ...(query ? { query } : {}), ...(options.family ? { family: options.family } : {}), offset: nextOffset, limit,
    } } } : {}),
    ...(normalized || options.family ? { browse: { tool: USE_TOOL, arguments: { offset: 0, limit } } } : {}),
    ...(offset > 0 ? { restart: { tool: USE_TOOL, arguments: {
      ...(query ? { query } : {}), ...(options.family ? { family: options.family } : {}), offset: 0, limit,
    } } } : {}),
    coverage: { query, family: options.family || null, matchingOnly: !!normalized, offset, returned: items.length, totalMatches: rows.length,
      meaning: items.length
        ? `Found ${rows.length} relevant methods; this page lists ${items.length}. Follow each entry for its full contract. ${nextOffset !== null ? 'Continue to the next page.' : 'This is the last matching page.'}`
        : rows.length
          ? `Found ${rows.length} methods, but this offset is beyond the catalog. Use restart to return to the first matching page.`
          : normalized || options.family
            ? 'No close method was found for this purpose. Try other terms or browse the catalog. Use look_up for public sources, weather, campus and maps.'
            : 'No additional specialized tools are listed here. Continue with the directly available tools; look_up can find data sources.' },
  };
}

/** Build the model-facing surface from the host's full, already permission-
 * filtered list. Promotion follows host state (an open study paper, a current
 * rehearsal...), never keywords in the user's words. */
export function modelToolSurface(all: ToolSpec[], promoted: ReadonlySet<DeferredFamily> = new Set()): ToolSpec[] {
  const direct: ToolSpec[] = [], behind: ToolSpec[] = [];
  for (const spec of all) {
    const family = familyOf.get(spec.function.name);
    (family && !promoted.has(family) ? behind : direct).push(spec);
  }
  const introduced = direct.map(spec => compactToolSpec({ ...spec, function: { ...spec.function,
    description: TOOL_INTRODUCTIONS[spec.function.name] || spec.function.description,
  } }));
  if (!behind.length) return introduced;
  const examples = Object.values(DEFERRED_TOOL_FAMILIES).flatMap(names => {
    const name = names.find(name => behind.some(spec => spec.function.name === name));
    return name ? [name] : [];
  });
  const gateway: ToolSpec = { type: 'function', function: {
    name: USE_TOOL,
    description: `Describe a purpose in query, choose a family, or leave both unset to browse specialized tools. Follow continuation for later pages, try other terms or browse after a miss, and use restart after an out-of-range offset. name alone reads any available tool's full contract; submit name with arguments to execute a specialized tool. Everyday tools retain their direct entry points. Examples include ${examples.join(', ')}; specialized tool links returned by sources or views also continue here. Find public sources, weather, campus and maps through look_up.`,
    parameters: { type: 'object', properties: {
      name: { type: 'string', enum: all.map(spec => spec.function.name), description: 'Exact tool name to read its full contract; omit to search or browse the specialized catalog.' },
      query: { type: 'string', maxLength: 300, description: 'Purpose or tool name for documentation search. Reading actual material still follows its existing scope.' },
      family: { type: 'string', enum: Object.keys(DEFERRED_TOOL_FAMILIES), description: Object.entries(FAMILY_PURPOSE).map(([name, purpose]) => `${name}: ${purpose}`).join('; ') },
      offset: { type: 'integer', minimum: 0, default: 0 },
      limit: { type: 'integer', minimum: 1, maximum: 23, default: 8 },
      arguments: { type: 'object', description: 'Arguments following this tool contract. Omit to inspect the instructions and required fields first.' },
    }, additionalProperties: false },
  } };
  return [...introduced, gateway];
}
