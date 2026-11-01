import type { WorkspaceContext, WorkspaceSettingsContext, WorkspaceSurface, WorkspaceTarget } from '../../shared/workspace-context';
import type { RunSession } from './coordinator';
import type { DeferredFamily } from './tool-surface';
import type { InputControls } from './policy';

const focusedKeys = ['rehearsalInteraction', 'rehearsalAdmission', 'letterReference', 'noteReference', 'notebookQuote',
  'mapRouteReference', 'agendaFocus', 'materialQuote', 'conversationQuote', 'noteQuote', 'curiosityReference',
  'programReference', 'preparationReference', 'companionReference', 'studyInteraction', 'studySelection',
  'selection', 'campusSelection'] as const;

export function workspaceInputControls(controls: InputControls, target: WorkspaceTarget): InputControls {
  const focused = { ...controls, workspaceContext: undefined };
  for (const key of focusedKeys) if (key in focused) delete (focused as Record<string, unknown>)[key];
  switch (target.kind) {
    case 'material_quote': focused.materialQuote = target.reference; break;
    case 'note_quote': focused.noteQuote = target.reference; break;
    case 'notebook_quote': focused.notebookQuote = target.reference; break;
    case 'conversation_quote': focused.conversationQuote = target.reference; break;
    // A selected assistant passage uses the workspace's narrow history owner,
    // never the user-original conversationQuote control.
    case 'assistant_text': break;
    case 'agenda': focused.agendaFocus = target.reference; break;
    case 'map_route': focused.mapRouteReference = target.reference; break;
    case 'study': focused.studyInteraction = { kind: 'reference', focus: target.reference }; break;
    case 'interactive': focused.programReference = target.reference; break;
    case 'companion': focused.companionReference = target.reference; break;
    case 'curiosity': focused.curiosityReference = target.reference; break;
    case 'preparation': focused.preparationReference = target.reference; break;
    case 'letter': focused.letterReference = target.reference; break;
    case 'note': focused.noteReference = target.reference; break;
    case 'rehearsal': focused.rehearsalInteraction = { kind: 'reference', ref: target.reference }; break;
    case 'scene': focused.selection = target.reference; break;
    // A whole document is an address, not an invented one-character excerpt.
    // The body-free control context resolves its document identity directly.
    case 'material': break;
    case 'notebook': focused.noteQuote = { ...target.reference, start: 0, end: 1 }; break;
  }
  return focused;
}

export function workspaceAppearance(value: WorkspaceSettingsContext['appearance']['saved']) {
  const characters: Record<string, string> = { sakiko: "Sakiko Togawa", mutsumi: "Mutsumi Wakaba", uika: "Uika Misumi", umiri: "Umiri Yahata",
    nyamu: "Nyamu Yūtenji", tomori: "Tomori Takamatsu", anon: "Anon Chihaya", rana: "Rāna Kaname", soyo: "Soyo Nagasaki", taki: "Taki Shiina", light: "A light" };
  return { ...value, characterName: characters[value.character] || "Custom character",
    paletteName: { apricot: "Apricot", mist: "Morning mist", violet: "Twilight violet", rain: "Rainy-night gold" }[value.palette],
    presenceName: { window: "By the window", corner: "At the page corner", hidden: "Put away for now" }[value.presence],
    environmentModeName: value.environmentMode === 'auto' ? "Follow the environment" : "Manual choice",
    readingScaleName: value.readingScale === 1 ? "Standard" : value.readingScale === 1.15 ? "Larger" : "Largest",
    densityName: value.density === 'comfortable' ? "Comfortable" : "Compact" };
}

/** A short-lived view of the same run. Every read still goes through the
 * coordinator's original owner resolver and the original context receipt. */
export function workspaceFocusedRun(session: RunSession, target: WorkspaceTarget): RunSession {
  const focused = { ...session };
  for (const key of focusedKeys) delete focused[key];
  switch (target.kind) {
    case 'material_quote': focused.materialQuote = target.reference; break;
    case 'note_quote': focused.noteQuote = target.reference; break;
    case 'notebook_quote': focused.notebookQuote = target.reference; break;
    case 'conversation_quote': focused.conversationQuote = target.reference; break;
    case 'assistant_text': break;
    case 'agenda': focused.agendaFocus = target.reference; break;
    case 'map_route': focused.mapRouteReference = target.reference; break;
    case 'study': focused.studyInteraction = { kind: 'reference', focus: target.reference }; break;
    case 'interactive': focused.programReference = target.reference; break;
    case 'companion': focused.companionReference = target.reference; break;
    case 'curiosity': focused.curiosityReference = target.reference; break;
    case 'preparation': focused.preparationReference = target.reference; break;
    case 'letter': focused.letterReference = target.reference; break;
    case 'note': focused.noteReference = target.reference; break;
    case 'rehearsal': focused.rehearsalInteraction = { kind: 'reference', ref: target.reference }; break;
  }
  return focused;
}

export function workspaceProjectionKey(target: WorkspaceTarget) {
  switch (target.kind) {
    case 'material_quote': return 'currentMaterial';
    case 'note_quote': case 'notebook_quote': case 'note': case 'notebook': return 'currentNote';
    case 'conversation_quote': return 'currentConversationQuote';
    case 'assistant_text': return 'currentAssistantText';
    case 'agenda': return 'currentAgenda';
    case 'map_route': return 'currentMapRoute';
    case 'study': return 'currentStudy';
    case 'interactive': return 'currentInteractive';
    case 'companion': return 'currentCompanion';
    case 'curiosity': return 'currentCuriosity';
    case 'preparation': return 'currentPreparation';
    case 'letter': return 'currentLetter';
    case 'rehearsal': return 'currentRehearsal';
    case 'scene': return 'currentSelection';
    case 'material': return 'currentMaterialReference';
  }
}

const surfaces: Record<WorkspaceSurface, { meaning: string; tools: string[]; capabilities?: string[] }> = {
  home: { meaning: "The current conversation and carried matters. Continue from the original composer, or simply share one thought.", tools: ['restore_collaboration', 'read_assistant_history', 'present_view'] },
  conversation: { meaning: "Original words, replies, and shared objects in the same conversation; the unsent draft remains in the composer.", tools: ['read_evidence', 'read_assistant_history', 'restore_collaboration'] },
  keep: { meaning: "The person's notes, lawful originals, original works, and conversation entries. Opening or selecting establishes neither reading, citation, nor lasting inference permission. Follow the exact currently indicated address; saving remains with the original owner.", tools: ['manage_note', 'read_interactive_program', 'read_assistant_history', 'restore_collaboration', 'present_view'] },
  materials: { meaning: "The original file, current page, and selection. Read neighboring text, figures, and later pages when explanation needs them.", tools: ['look_up', 'present_view'], capabilities: ['materials.describe', 'materials.read', 'materials.find', 'materials.observe', 'materials.table', 'research.read'] },
  notes: { meaning: "The person's saved note and original address. Read, edit, undo, and verify against the same page.", tools: ['manage_note', 'present_view'] },
  study: { meaning: "The same original problem, personal attempt, and current help. Compare, change conditions, or continue reasoning.", tools: ['read_study_companion', 'study_companion', 'read_learning', 'manage_learning', 'present_view'] },
  agenda: { meaning: "Saved arrangements and trial revisions. Compare tradeoffs, edit, and inspect original outcomes.", tools: ['look_up', 'prepare_action', 'inspect_action', 'change_local_action', 'cancel_action', 'offer_planning_alternatives', 'continue_planning'], capabilities: ['local.agenda.read', 'planning.preview'] },
  campus: { meaning: "Courses, times, and campus records from their original declared sources. Read the relevant scope for the current question.", tools: ['look_up', 'read_current_campus_selection', 'present_view'], capabilities: ['campus.query', 'campus.lookup', 'campus.overview'] },
  map: { meaning: "The focused map place, route, and journey. Compare legs, query a new route, and return to the same map; map focus is not device location.", tools: ['map_overview', 'map_search', 'map_route', 'manage_space', 'present_view'], capabilities: ['map.journey.read'] },
  interactive: { meaning: "The same creation's source, text position, and actual submission-time local state. Continue exploration and revision.", tools: ['read_interactive_program', 'present_view', 'read_skill'] },
  letter: { meaning: "Original letter sentences, provenance, and stopping point. Continue reading or responding through the same letter.", tools: ['read_reflective_letter', 'write_reflective_letter', 'present_view'] },
  characters: { meaning: "The saved character and relationship agreement. Appearance preview and saved personality remain separate.", tools: ['read_skill'] },
  appearance: { meaning: "The open appearance settings; theme and split layout follow local choices.", tools: [] },
  memory: { meaning: "Original words, historical interpretation, and later corrections, recoverable through their real sources.", tools: ['recall_experience', 'read_understanding', 'read_evidence', 'propose_memory_change'] },
  settings: { meaning: "Saved usage preferences and connection entries. Adjust actual controls in their original settings.", tools: [] },
  preparation: { meaning: "Prepared material, its provenance, and where to retrieve it. Open it and return to the matter that needs it.", tools: ['inspect_help', 'decide_help', 'restore_collaboration'] },
  rehearsal: { meaning: "The person's actual rehearsal words and one possible response. Continue, revise meaning, or stop here.", tools: ['read_relationship_rehearsal', 'manage_relationship_rehearsal', 'present_view'] },
};

export function workspaceSurfaceDirectory(tools: ReadonlySet<string>, capabilities: ReadonlySet<string>) {
  return Object.entries(surfaces).map(([surface, entry]) => ({ surface, meaning: entry.meaning,
    operations: [...entry.tools.filter(tool => tools.has(tool)).map(tool => ({ tool })),
      ...(entry.capabilities || []).filter(capability => capabilities.has(capability)).map(capability => ({
        tool: 'look_up', arguments: { source: 'capability', capability, describeOnly: true },
      }))], returnTo: { surface } }));
}

export function workspaceToolFamilies(context?: WorkspaceContext): DeferredFamily[] {
  if (!context) return [];
  const kinds = new Set(context.objects.map(object => object.target.kind));
  return [
    ...(context.surface === 'study' || kinds.has('study') ? ['study' as const] : []),
    ...(context.surface === 'rehearsal' || kinds.has('rehearsal') ? ['rehearsal' as const] : []),
    ...(context.surface === 'letter' || kinds.has('letter') ? ['letter' as const] : []),
    ...(kinds.has('curiosity') ? ['curiosity' as const] : []),
    ...(kinds.has('companion') ? ['companion' as const] : []),
    ...(context.surface === 'agenda' || kinds.has('agenda') ? ['planning' as const] : []),
  ];
}
