import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { Download, LoaderCircle, Upload, Undo2 } from 'lucide-react';
import type { PersonaCore, PersonaState } from '../shared/persona';
import {
  PERSONA_PRESETS,
  PERSONA_SCENARIOS,
  exportPersonaTemplate,
  importPersonaTemplate,
  personaCoreSchema,
  personaPreset,
} from '../shared/persona';
import type { SettingsUpdate, State } from '../shared/types';
import { previewPersonaCharacterCard } from '../shared/persona-card-import';
import { uiError } from './ui';
import './persona.css';

export interface PersonaDraft {
  expectedRevision: number;
  core: PersonaCore;
  beforeReplacement?: { expectedRevision: number; core: PersonaCore };
}
type PersonaCandidate = { core: PersonaCore; origin: string; external: boolean; ignoredFields?: string[]; preserveAddress?: boolean; preservedAddress?: string };
export interface PersonaPreviewDraft {
  candidate: PersonaCandidate;
  editing: boolean;
  editor: PersonaDraft;
}
export function samePersonaCore(left: PersonaCore, right: PersonaCore) {
  const snapshot = (core: PersonaCore) => {
    const value = personaCoreSchema.parse(core);
    value.examples.sort((a, b) => a.scenario.localeCompare(b.scenario));
    return JSON.stringify(value);
  };
  return snapshot(left) === snapshot(right);
}
function SavedPersonaWords({ core, against }: { core: PersonaCore; against?: PersonaCore }) {
  const fields = [['name', 'Name'], ['address', 'What to call you'], ['description', 'How you would like to interact'], ['selfReference', 'Self-reference'], ['identity', 'Identity or relationship'], ['voice', 'Voice'], ['fictionalBackstory', 'Character backstory']] as const;
  const changedFields = fields.filter(([field]) => !against || core[field] !== against[field]);
  const examples = PERSONA_SCENARIOS.filter(scene => !against || core.examples.find(example => example.scenario === scene.id)?.response !== against.examples.find(example => example.scenario === scene.id)?.response);
  const changedBinding = !against || JSON.stringify(core.visualBinding) !== JSON.stringify(against.visualBinding);
  return <div className="persona-current-words" role="region" aria-label={against ? 'Changed wording' : 'Complete agreement'} tabIndex={0}>
    <dl>{changedFields.map(([field, label]) => <div key={field}><dt>{label}</dt><dd>{core[field] || 'Not filled in'}</dd></div>)}</dl>
    {examples.length > 0 && <div className="persona-current-examples">{examples.map(scene => <section key={scene.id}><h5>{scene.label}</h5><p>{core.examples.find(example => example.scenario === scene.id)?.response || 'No example written'}</p></section>)}</div>}
    {changedBinding && <p className="persona-current-binding">Character starting point · {core.visualBinding?.characterName || core.name || 'Custom'}</p>}
    {against && changedFields.length === 0 && examples.length === 0 && !changedBinding && <p>The wording is unchanged.</p>}
  </div>;
}
export function PersonaEditor({
  persona,
  legacyGuidance,
  draft,
  onState,
  busy,
  saving,
  perform,
}: {
  persona: PersonaState;
  legacyGuidance: string;
  draft: MutableRefObject<{ persona?: PersonaDraft; personaPreview?: PersonaPreviewDraft }>;
  onState: (state: State) => void;
  busy: boolean;
  saving: boolean;
  perform: (operation: () => Promise<void>) => Promise<void>;
}) {
  const [editor, setEditor] = useState<PersonaDraft>(
    () =>
      draft.current.persona || draft.current.personaPreview?.editor
        || { expectedRevision: persona.revision, core: structuredClone(persona.core) },
  );
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; error?: boolean }>();
  const [scenario, setScenario] = useState<(typeof PERSONA_SCENARIOS)[number]['id']>('chat');
  const [undoRevision, setUndoRevision] = useState<number>();
  const [reviewedRevision, setReviewedRevision] = useState<number>();
  const [legacySelection, setLegacySelection] = useState('');
  const [candidate, setCandidate] = useState<PersonaCandidate | undefined>(() => draft.current.personaPreview?.candidate);
  const fileRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const importRevision = useRef(0);
  const preservedAddress = candidate?.preservedAddress ?? editor.core.address;
  const core = candidate ? (candidate.preserveAddress ? { ...candidate.core, address: preservedAddress } : candidate.core) : editor.core;
  const locked = pending || saving;
  const dirty = !samePersonaCore(core, persona.core);
  const stale = editor.expectedRevision !== persona.revision;
  const selectedScene = PERSONA_SCENARIOS.find((entry) => entry.id === scenario)!;
  const response = core.examples.find((entry) => entry.scenario === scenario)?.response || '';
  useEffect(() => {
    if (candidate) draft.current.personaPreview = { candidate, editing: true, editor };
    else delete draft.current.personaPreview;
  }, [draft, candidate, editor]);
  useEffect(() => {
    if (!candidate && !draft.current.persona && editor.expectedRevision !== persona.revision) {
      importRevision.current++;
      setEditor({ expectedRevision: persona.revision, core: structuredClone(persona.core) });
    }
  }, [persona, editor.expectedRevision, draft, candidate]);
  useEffect(
    () => () => {
      importRevision.current++;
    },
    [],
  );
  function keepEditor(next: PersonaDraft) {
    setEditor(next);
    if (!next.beforeReplacement && next.expectedRevision === persona.revision && samePersonaCore(next.core, persona.core))
      delete draft.current.persona;
    else draft.current.persona = next;
  }
  function replace(next: PersonaCore) {
    importRevision.current++;
    const nextEditor = { ...editor, core: next };
    keepEditor(nextEditor);
    setFeedback(undefined);
  }
  function patch(value: Partial<PersonaCore>) {
    if (candidate) {
      importRevision.current++;
      setCandidate(current => current ? { ...current, ...('address' in value ? { preserveAddress: false } : {}), core: { ...current.core, ...value } } : current);
      setFeedback(undefined);
    } else replace({ ...core, ...value });
  }
  function previewCandidate(next: PersonaCandidate) {
    importRevision.current++;
    setCandidate({ ...next, preservedAddress: core.address, preserveAddress: !!core.address && next.core.address !== core.address });
    setFeedback(undefined);
    descriptionRef.current?.focus();
  }
  function dismissCandidate() {
    importRevision.current++;
    delete draft.current.personaPreview;
    setCandidate(undefined);
  }
  function restoreReplacedDraft() {
    if (!editor.beforeReplacement || locked) return;
    importRevision.current++;
    const restored = structuredClone(editor.beforeReplacement);
    keepEditor(restored);
    setFeedback({ text: 'The draft from before replacement was restored.' });
  }
  function reset(next = persona) {
    importRevision.current++;
    const nextEditor = { expectedRevision: next.revision, core: structuredClone(next.core) };
    setEditor(nextEditor);
    delete draft.current.persona;
    delete draft.current.personaPreview;
    setCandidate(undefined);
    setFeedback(undefined);
    setUndoRevision(undefined);
    setReviewedRevision(undefined);
  }
  async function save(update: NonNullable<SettingsUpdate['personaUpdate']>) {
    if (locked) return;
    importRevision.current++;
    const submittedDraft = draft.current.persona;
    const submittedPreview = draft.current.personaPreview;
    setPending(true);
    setFeedback(undefined);
    try {
      await perform(async () => {
        let next: State;
        try { next = await window.anima.saveSettings({ personaUpdate: update }); }
        catch (problem) {
          try {
            const current = await window.anima.state();
            onState(current);
            if (current.settings.persona.revision !== update.expectedRevision) {
              setFeedback({ text: 'The agreement was changed elsewhere. Your draft is preserved.' });
              return;
            }
          } catch { /* The editor keeps its own draft. */ }
          throw problem;
        }
        onState(next);
        setEditor({
          expectedRevision: next.settings.persona.revision,
          core: structuredClone(next.settings.persona.core),
        });
        if (draft.current.persona === submittedDraft) delete draft.current.persona;
        if (draft.current.personaPreview === submittedPreview) delete draft.current.personaPreview;
        setCandidate(undefined);
        setUndoRevision(undefined);
        setReviewedRevision(undefined);
        setFeedback({ text: 'undoRevision' in update ? 'The previous agreement was restored' : 'This is how we will interact' });
      });
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="preference-section persona-editor">
      <div className="persona-heading">
        <h3 className="section-title">How you would like to interact</h3>
      </div>
      <div className="persona-writing">
        <div className="persona-identity-row">
          <label className="field-label">
            Name
            <input aria-label="Character name" value={core.name} maxLength={60} disabled={locked}
              onChange={event => patch({ name: event.target.value })} />
          </label>
          <label className="field-label">
            What to call you
            <input aria-label="What the character calls you" value={core.address} maxLength={100} disabled={locked}
              onChange={event => patch({ address: event.target.value })} placeholder="Not agreed yet" />
          </label>
        </div>
        <label className="field-label persona-description">
          How you would like to interact
          <textarea ref={descriptionRef} aria-label="How you would like to interact" value={core.description}
            maxLength={4000} rows={5} disabled={locked}
            onChange={event => patch({ description: event.target.value })} />
        </label>
        {candidate && <details className="persona-source-review">
          <summary>From {candidate.origin}</summary>
          {!!preservedAddress && candidate.core.address !== preservedAddress &&
            <label className="persona-keep-address">
              <input type="checkbox" disabled={locked} checked={!!candidate.preserveAddress}
                onChange={event => setCandidate(current => current && ({ ...current, preserveAddress: event.target.checked }))} />
              Keep the existing form of address <span>{preservedAddress}</span>
            </label>}
          <p className="persona-current-label">Draft before replacement</p>
          <SavedPersonaWords core={editor.core} against={core} />
          {candidate.external && <p className="persona-import-note">Only character text is imported. Greeting messages, lorebooks, and executable content are excluded.</p>}
        </details>}
        <details className="persona-details">
          <summary>Voice and story</summary>
          <div className="persona-details-body">
            <div className="preference-fields">
              <label>Self-reference<input aria-label="Character self-reference" value={core.selfReference} maxLength={60}
                disabled={locked} onChange={event => patch({ selfReference: event.target.value })} /></label>
              <label>Identity or relationship<input aria-label="Character identity or relationship" value={core.identity} maxLength={500}
                disabled={locked} onChange={event => patch({ identity: event.target.value })} /></label>
            </div>
            <label className="field-label">Voice
              <textarea value={core.voice} maxLength={1000} rows={3} disabled={locked}
                onChange={event => patch({ voice: event.target.value })} />
            </label>
            <label className="field-label">Character backstory
              <textarea value={core.fictionalBackstory} maxLength={1000} rows={3} disabled={locked}
                onChange={event => patch({ fictionalBackstory: event.target.value })} />
            </label>
          </div>
        </details>
        <details className="persona-details persona-examples">
          <summary>Example responses</summary>
          <div className="persona-details-body">
            <div className="persona-preview-heading">
              <select aria-label="Character preview scene" value={scenario}
                onChange={event => setScenario(event.target.value as typeof scenario)}>
                {PERSONA_SCENARIOS.map(scene => <option key={scene.id} value={scene.id}>{scene.label}</option>)}
              </select>
              <span className="persona-scene">{selectedScene.preview}</span>
            </div>
            <label className="field-label">{selectedScene.label} response
              <textarea aria-label={selectedScene.label + 'Example responses'} value={response} maxLength={500} rows={3}
                disabled={locked} placeholder="Write a response you would like"
                onChange={event => patch({ examples: [
                  ...core.examples.filter(example => example.scenario !== scenario),
                  ...(event.target.value ? [{ scenario, response: event.target.value }] : []),
                ] })} />
            </label>
          </div>
        </details>
        <details className="persona-details persona-manage">
          <summary>Starting points and previous agreements</summary>
          <div className="persona-details-body">
            <details className="persona-starting-points">
              <summary>Choose another starting point</summary>
              <div className="persona-presets" role="group" aria-label="Choose how to begin">
                {PERSONA_PRESETS.map(preset => <button key={preset.id} type="button"
                  className="persona-preset" aria-pressed={core.presetId === preset.id} disabled={locked}
                  onClick={() => previewCandidate({ core: { ...personaPreset(preset.id), address: core.address }, origin: preset.label, external: false })}>
                  <strong>{preset.label}</strong><span>{preset.summary}</span>
                </button>)}
              </div>
            </details>
            <div className="persona-transfer-actions">
              <button className="text-button" disabled={locked}
                onClick={() => fileRef.current?.click()}><Upload size={14} />Import character settings</button>
              <button className="text-button" disabled={locked} onClick={() => {
                const blob = new Blob([exportPersonaTemplate(core)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const anchor = document.createElement('a');
                anchor.href = url; anchor.download = 'anima-persona.json'; anchor.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
                setFeedback({ text: 'These character settings were exported.' });
              }}><Download size={14} />Export this agreement</button>
            </div>
            {persona.history.length > 0 && <details className="persona-history">
              <summary>Previous agreements</summary>
              <div className="persona-details-body">
                <label className="field-label">Choose one
                  <select aria-label="Character version history" value={undoRevision ?? ''} disabled={locked}
                    onChange={event => setUndoRevision(event.target.value ? Number(event.target.value) : undefined)}>
                    <option value="">Previous interaction settings</option>
                    {[...persona.history].reverse().map(version => <option key={version.revision} value={version.revision}>
                      {version.core.name || 'No name yet'} · {version.savedAt
                        ? new Date(version.savedAt).toLocaleDateString('en-US') : 'Original agreement'}
                    </option>)}
                  </select>
                </label>
                {undoRevision !== undefined && persona.history.find(version => version.revision === undoRevision) &&
                  <SavedPersonaWords core={persona.history.find(version => version.revision === undoRevision)!.core} />}
                <button className="text-button persona-history-restore"
                  disabled={locked || busy || dirty || undoRevision === undefined}
                  onClick={() => undoRevision !== undefined && void save({ expectedRevision: persona.revision, undoRevision })}>
                  <Undo2 size={14} />Restore this agreement
                </button>
              </div>
            </details>}
            {legacyGuidance && <details className="persona-legacy">
              <summary>Earlier writing</summary>
              <textarea aria-label="Original private guidance" readOnly value={legacyGuidance} rows={4}
                onSelect={event => {
                  const target = event.currentTarget;
                  setLegacySelection(target.value.slice(target.selectionStart, target.selectionEnd));
                }} />
              <button className="text-button" disabled={!legacySelection || locked} onClick={() => {
                patch({ description: legacySelection });
                setFeedback({ text: 'The selected original text was added to the draft.' });
              }}>Use selected original text</button>
            </details>}
          </div>
        </details>
        {stale && <div className="persona-conflict">
          <div className="persona-conflict-heading">
            <p role="status">This agreement was changed elsewhere.</p>
            <button type="button" className="text-button" aria-expanded={reviewedRevision !== undefined}
              onClick={() => setReviewedRevision(reviewedRevision === persona.revision ? undefined : persona.revision)}>
              {reviewedRevision === persona.revision ? 'Close comparison' : 'Compare with the current agreement'}
            </button>
          </div>
          {reviewedRevision !== undefined && <>
            <p className="persona-current-label">Changed wording currently saved</p>
            <SavedPersonaWords core={persona.core} against={core} />
          </>}
        </div>}
        <div className="field-buttons persona-save-row">
          <button className="primary-button"
            disabled={locked || busy || !dirty || (stale && reviewedRevision !== persona.revision)}
            onClick={() => {
              if (stale) {
                if (reviewedRevision === persona.revision) void save({ expectedRevision: reviewedRevision, core });
              } else void save({ expectedRevision: editor.expectedRevision, core });
            }}>
            {locked && <LoaderCircle size={14} className="spin" />}
            {stale ? 'Replace with this draft' : 'Save agreement'}
          </button>
          {(dirty || stale || !!candidate) && <button className="text-button" disabled={locked}
            onClick={() => candidate ? dismissCandidate() : reset()}>
            {candidate ? 'Return to original draft' : 'Cancel changes'}
          </button>}
          {!candidate && editor.beforeReplacement && <button className="text-button persona-draft-restore"
            disabled={locked} onClick={restoreReplacedDraft}><Undo2 size={13} />Restore draft before replacement</button>}
        </div>
        {feedback && <p className={'inline-status' + (feedback.error ? ' error' : '')}
          role={feedback.error ? 'alert' : 'status'}>{feedback.text}</p>}
      </div>
      <input className="sr-only" ref={fileRef} type="file" tabIndex={-1}
        accept="application/json,.json" aria-label="Choose my settings file"
        onChange={async event => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          const importingRevision = ++importRevision.current;
          const beforeImport = draft.current.persona;
          const beforePreview = draft.current.personaPreview;
          try {
            if (file.size > 600_000) throw new Error('Choose a JSON file under 600 KB.');
            const text = await file.text();
            let imported: PersonaCandidate;
            const format = JSON.parse(text)?.format;
            if (format === 'anima-persona-template')
              imported = { core: importPersonaTemplate(text), origin: file.name, external: false };
            else {
              const preview = previewPersonaCharacterCard(text);
              imported = { core: { ...preview.core, address: core.address }, origin: file.name,
                external: true, ignoredFields: preview.ignoredFields };
            }
            if (importRevision.current !== importingRevision || draft.current.persona !== beforeImport
              || draft.current.personaPreview !== beforePreview) return;
            previewCandidate(imported);
          } catch (error) {
            if (importRevision.current !== importingRevision) return;
            setFeedback({ text: uiError(error), error: true });
          }
        }} />
    </section>
  );
}
