import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowUpRight, BookOpen, Check, FileText, MessageCircle, Quote, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { SOURCE_BOOKMARK_MIME, sourceBookmarkAddress, sourceBookmarkReferenceSchema, type SourceBookmarkPreview,
  type SourceBookmarkReference } from '../shared/source-bookmark';
import { uiError } from './ui';
import { RichText } from './RichText';
import './source-bookmark.css';
import './keep-note-actions.css';

export interface StudyBookmarkDestination {
  sessionId: string;
  studyId: string;
  messageId?: string;
}
export interface BookmarkTarget {
  key: string;
  label: string;
  location?: StudyBookmarkDestination;
  preview: (reference: SourceBookmarkReference) => Promise<SourceBookmarkPreview>;
  accept: (reference: SourceBookmarkReference) => Promise<void>;
}
interface BookmarkTray {
  pick: (reference: SourceBookmarkReference, source?: HTMLElement | null) => Promise<void>;
  cite: (reference: SourceBookmarkReference, source?: HTMLElement | null) => Promise<void>;
  note: (reference: SourceBookmarkReference, source?: HTMLElement | null) => Promise<void>;
  offer: (reference: SourceBookmarkReference, key: string, source?: HTMLElement | null) => Promise<void>;
  register: (target: BookmarkTarget) => () => void;
  stage: (reference: SourceBookmarkReference, source?: HTMLElement | null) => void;
  release: (reference: SourceBookmarkReference) => void;
  getInteractionVersion: () => number | undefined;
}
const BookmarkTrayContext = createContext<BookmarkTray | undefined>(undefined);
export const useBookmarkTray = () => useContext(BookmarkTrayContext);
export function readBookmarkTransfer(transfer: DataTransfer): SourceBookmarkReference | undefined {
  const raw = transfer.getData(SOURCE_BOOKMARK_MIME);
  if (!raw || raw.length > 5000) return;
  try { const value = sourceBookmarkReferenceSchema.safeParse(JSON.parse(raw)); return value.success ? value.data : undefined; }
  catch { return; }
}
export function writeBookmarkTransfer(transfer: DataTransfer, reference: SourceBookmarkReference) {
  // Pending-file bearer tickets stay in this renderer's live hand-off, never
  // in a drag payload another application could receive.
  transfer.clearData();
  transfer.setData(SOURCE_BOOKMARK_MIME, JSON.stringify(sourceBookmarkAddress(reference))); transfer.effectAllowed = 'copy';
}

interface BookmarkReturnFocus {
  element: HTMLElement | null;
  input?: { length: number; text: string; start: number; end: number; direction: 'forward' | 'backward' | 'none' };
  passage?: { range: Range; text: string };
}
function bookmarkReturnFocus(source?: HTMLElement | null): BookmarkReturnFocus {
  const element = source || (document.activeElement instanceof HTMLElement ? document.activeElement : null);
  if ((element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement)
    && element.selectionStart !== null && element.selectionEnd !== null)
    return { element, input: { length: element.value.length, text: element.value.slice(element.selectionStart, element.selectionEnd),
      start: element.selectionStart, end: element.selectionEnd,
      direction: element.selectionDirection || 'none' } };
  const selection = window.getSelection();
  const range = selection?.rangeCount && !selection.isCollapsed ? selection.getRangeAt(0).cloneRange() : undefined;
  return { element, ...(range && (!source || source.contains(range.startContainer) && source.contains(range.endContainer))
    ? { passage: { range, text: range.toString() } } : {}) };
}
function restoreBookmarkFocus(place?: BookmarkReturnFocus) {
  if (!place?.element?.isConnected || !place.element.getClientRects().length) return;
  place.element.focus({ preventScroll: true });
  const { input, passage } = place;
  if (input && (place.element instanceof HTMLTextAreaElement || place.element instanceof HTMLInputElement)
    && place.element.value.length === input.length && place.element.value.slice(input.start, input.end) === input.text)
    place.element.setSelectionRange(input.start, input.end, input.direction);
  if (passage && passage.range.startContainer.isConnected && passage.range.endContainer.isConnected
    && passage.range.toString() === passage.text) {
    const selection = window.getSelection();
    selection?.removeAllRanges(); selection?.addRange(passage.range);
  }
}

/** Only the small paper currently in the hand lives here. Material, notebook,
 * and study truth remain in their original owners; closing drops this address. */
export function SourceBookmarkProvider({ boundaryKey, active = true, resetKey, onUnsavedChange, onDiscuss, onOpenNote, onOpenStudy, onOpenSource, onNoteSaved, getInteractionVersion, children }: {
  boundaryKey: string;
  active?: boolean;
  /** Changes only for a real clear-all operation, not ordinary source exit. */
  resetKey?: string | number;
  onUnsavedChange?: (unsaved: boolean) => void;
  onDiscuss: (reference: SourceBookmarkReference) => boolean | Promise<boolean>;
  onOpenNote?: (id: string, revision: number) => void;
  onOpenStudy?: (location: StudyBookmarkDestination) => void;
  onOpenSource?: (reference: SourceBookmarkReference) => void | Promise<void>;
  onNoteSaved?: (id: string, revision: number) => void;
  getInteractionVersion?: () => number;
  children: ReactNode;
}) {
  const targets = useRef(new Map<string, BookmarkTarget>());
  const staged = useRef<SourceBookmarkReference | undefined>(undefined), stagedFocus = useRef<BookmarkReturnFocus | undefined>(undefined);
  const sameAddress = (left: SourceBookmarkReference, right: SourceBookmarkReference) =>
    JSON.stringify(sourceBookmarkAddress(left)) === JSON.stringify(sourceBookmarkAddress(right));
  const [targetRevision, changed] = useState(0), [loadedPaper, setPaper] = useState<SourceBookmarkPreview>();
  const liveBoundary = useRef(boundaryKey); liveBoundary.current = boundaryKey;
  const paperBoundary = useRef(boundaryKey);
  const paper = paperBoundary.current === boundaryKey ? loadedPaper : undefined;
  const [destination, setDestination] = useState<string>(), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const previewTarget = useRef<BookmarkTarget | undefined>(undefined);
  const operation = useRef(0), returnFocus = useRef<BookmarkReturnFocus | undefined>(undefined), tray = useRef<HTMLElement>(null);
  const carriedReference = useRef<SourceBookmarkReference | undefined>(undefined), committing = useRef<number | undefined>(undefined);
  const [accepting, setAccepting] = useState(false);
  const [directCiting, setDirectCiting] = useState(false);
  const [directNote, setDirectNote] = useState(false);
  const [annotation, setAnnotation] = useState('');
  const annotationDraft = useRef(''); annotationDraft.current = annotation;
  const [detached, setDetached] = useState(false);
  const detachedDraft = useRef(detached); detachedDraft.current = detached;
  const privateSurface = useRef(active); privateSurface.current = active;
  const annotationInput = useRef<HTMLTextAreaElement>(null);
  const [savedNote, setSavedNote] = useState<{ id: string; revision: number; boundary: string; focus?: BookmarkReturnFocus }>();
  const receipt = useRef<HTMLElement>(null);
  const [announcement, setAnnouncement] = useState('');
  const onDiscussRef = useRef(onDiscuss); onDiscussRef.current = onDiscuss;
  const onOpenSourceRef = useRef(onOpenSource); onOpenSourceRef.current = onOpenSource;
  const onNoteSavedRef = useRef(onNoteSaved); onNoteSavedRef.current = onNoteSaved;
  const unsavedCallback = useRef(onUnsavedChange); unsavedCallback.current = onUnsavedChange;
  const interactionVersion = useRef(getInteractionVersion); interactionVersion.current = getInteractionVersion;
  const clear = useCallback((restoreFocus = true) => {
    operation.current++; setPaper(undefined); setDestination(undefined); setError(''); setBusy(false); setAccepting(!!committing.current);
    setAnnotation(''); setDetached(false); setDirectCiting(false); setDirectNote(false);
    staged.current = undefined; stagedFocus.current = undefined; previewTarget.current = undefined; carriedReference.current = undefined;
    const focus = returnFocus.current; returnFocus.current = undefined;
    const request = operation.current, boundary = liveBoundary.current, interaction = interactionVersion.current?.();
    if (restoreFocus) requestAnimationFrame(() => {
      if (request === operation.current && boundary === liveBoundary.current
        && interaction === interactionVersion.current?.()) restoreBookmarkFocus(focus);
    });
  }, []);
  const previousBoundary = useRef(boundaryKey), previousReset = useRef(resetKey);
  useEffect(() => {
    if (previousBoundary.current === boundaryKey) return;
    previousBoundary.current = boundaryKey;
    const ownWriting = annotationDraft.current;
    clear(false); setSavedNote(undefined); setAnnouncement('');
    // Retire the source and its permission. Only the person's unsaved writing
    // survives, detached from any old address; saving it is a separate action.
    if (ownWriting.trim()) { setAnnotation(ownWriting); setDetached(true); }
  }, [boundaryKey, clear]);
  useEffect(() => {
    if (active) return;
    const ownWriting = annotationDraft.current;
    clear(false); setSavedNote(undefined); setAnnouncement('');
    if (ownWriting.trim()) { setAnnotation(ownWriting); setDetached(true); }
  }, [active, clear]);
  useEffect(() => {
    if (previousReset.current === resetKey) return;
    previousReset.current = resetKey;
    clear(false); setSavedNote(undefined); setAnnouncement('');
  }, [resetKey, clear]);
  useEffect(() => { unsavedCallback.current?.(!!annotation.trim()); }, [annotation]);
  useEffect(() => () => unsavedCallback.current?.(false), []);
  useEffect(() => {
    if (!savedNote) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => { timer = setTimeout(() => {
      // A keyboard user can finish reading or open the note without the
      // receipt disappearing under their focused control.
      if (receipt.current?.matches(':hover, :focus-within')) schedule();
      else setSavedNote(current => current === savedNote ? undefined : current);
    }, 6000); };
    schedule(); return () => clearTimeout(timer);
  }, [savedNote]);
  useEffect(() => () => { operation.current++; }, []);
  const register = useCallback((target: BookmarkTarget) => {
    targets.current.set(target.key, target); changed(value => value + 1);
    return () => { if (targets.current.get(target.key) === target) { targets.current.delete(target.key); changed(value => value + 1); } };
  }, []);
  const stage = useCallback((reference: SourceBookmarkReference, source?: HTMLElement | null) => {
    if (!privateSurface.current) return;
    staged.current = reference;
    stagedFocus.current = source ? bookmarkReturnFocus(source) : undefined;
  }, []);
  const release = useCallback((reference: SourceBookmarkReference) => {
    if (staged.current && sameAddress(staged.current, reference)) { staged.current = undefined; stagedFocus.current = undefined; }
  }, []);
  const detachWriting = useCallback(() => {
    setPaper(undefined); setDestination(undefined); setDetached(!!annotationDraft.current.trim());
    carriedReference.current = undefined; staged.current = undefined; stagedFocus.current = undefined;
    previewTarget.current = undefined; returnFocus.current = undefined;
  }, []);
  const offer = useCallback(async (reference: SourceBookmarkReference, key?: string, sourceElement?: HTMLElement | null, noteEditor = false) => {
    // Acceptance has already crossed from a preview to its owner. A second paper
    // cannot cancel that write or silently replace its eventual receipt.
    if (committing.current || !privateSurface.current) return;
    if (detachedDraft.current && annotationDraft.current.trim()) {
      setError('Save your thoughts or explicitly discard them before choosing another source passage.'); return;
    }
    if (annotationDraft.current.trim() && key !== 'note') {
      setError('Your thoughts are preserved here. Save them as a note, or cancel before changing their use.'); return;
    }
    if (annotationDraft.current.trim() && carriedReference.current && !sameAddress(carriedReference.current, reference)) {
      setError('Your thoughts are preserved under this source passage. Save or cancel before choosing another passage.'); return;
    }
    setDirectCiting(false); setDetached(false); setDirectNote(noteEditor);
    const request = ++operation.current, boundary = liveBoundary.current, interaction = interactionVersion.current?.();
    const owns = () => request === operation.current && boundary === liveBoundary.current;
    const current = () => owns() && privateSurface.current && interaction === interactionVersion.current?.();
    // Changing the destination is still the same paper in the same hand.
    // Keep the original editor/selection rather than a button in this tray.
    if (!carriedReference.current || !sameAddress(carriedReference.current, reference)) {
      setAnnotation('');
      returnFocus.current = staged.current && sameAddress(staged.current, reference) && stagedFocus.current || bookmarkReturnFocus(sourceElement);
    }
    carriedReference.current = reference;
    setSavedNote(undefined); setAnnouncement('');
    setBusy(true); setError(''); setDestination(key); setPaper(undefined); previewTarget.current = undefined;
    const source = staged.current && sameAddress(staged.current, reference) ? staged.current : reference;
    const target = key && !['chat', 'note'].includes(key) ? targets.current.get(key) : undefined;
    try {
      if (key && !['chat', 'note'].includes(key) && !target) throw new Error('This study sheet was put away. Keep this passage in the conversation or notes for now.');
      const preview = target ? await target.preview(source) : await window.anima.sourceBookmarkPreview(source);
      if (!current()) return;
      paperBoundary.current = boundary;
      carriedReference.current = preview.reference; previewTarget.current = target; setPaper(preview);
      requestAnimationFrame(() => { if (current()) {
        if (key === 'note') annotationInput.current?.focus({ preventScroll: true });
        else tray.current?.querySelector<HTMLButtonElement>('[data-bookmark-primary]')?.focus({ preventScroll: true });
      } });
    } catch (problem) {
      if (!current()) return;
      // A different question may decline this paper. Reopen its source before
      // offering another destination: an old preview is never recovery proof.
      if (key && !['chat', 'note'].includes(key)) {
        try {
          const preview = await window.anima.sourceBookmarkPreview(source);
          if (!current()) return;
          paperBoundary.current = boundary; carriedReference.current = preview.reference; setPaper(preview); setDestination(undefined);
          requestAnimationFrame(() => { if (current()) tray.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true }); });
        } catch (sourceProblem) { if (current()) { setDestination(undefined); setError(uiError(sourceProblem)); } return; }
      }
      if (current()) { setDestination(undefined); setError(uiError(problem)); }
    }
    finally { if (owns()) {
      setBusy(false);
      if (!current() && annotationDraft.current.trim()) detachWriting();
    } }
  }, []);
  const pick = useCallback((reference: SourceBookmarkReference, source?: HTMLElement | null) => offer(reference, undefined, source), [offer]);
  const note = useCallback((reference: SourceBookmarkReference, source?: HTMLElement | null) => offer(reference, 'note', source, true), [offer]);
  const cite = useCallback(async (reference: SourceBookmarkReference, source?: HTMLElement | null) => {
    if (committing.current || !privateSurface.current) return;
    if (annotationDraft.current.trim()) { setError('Your thoughts remain here. Save them as a note, or cancel before quoting.'); return; }
    const request = ++operation.current, boundary = liveBoundary.current, interaction = interactionVersion.current?.();
    const owns = () => request === operation.current && boundary === liveBoundary.current;
    const current = () => owns() && privateSurface.current && interaction === interactionVersion.current?.();
    const original = staged.current && sameAddress(staged.current, reference) ? staged.current : reference;
    returnFocus.current = bookmarkReturnFocus(source); carriedReference.current = original;
    setPaper(undefined); setDestination(undefined); setDetached(false); setBusy(true); setDirectCiting(true); setError(''); setSavedNote(undefined); setAnnouncement('Quoting this passage…');
    try {
      const preview = await window.anima.sourceBookmarkPreview(original);
      if (!current()) return;
      committing.current = request;
      if (!await onDiscussRef.current(preview.reference)) throw new Error('The conversation target has changed. The source was not added to another draft. Quote this passage again.');
      if (owns()) { clear(false); setAnnouncement('Quoted in the input.'); }
    } catch (problem) { if (current()) setError(uiError(problem)); }
    finally { if (committing.current === request) { committing.current = undefined; setAccepting(false); }
      if (owns()) { setBusy(false); setDirectCiting(false); } }
  }, [clear]);
  const getCurrentInteractionVersion = useCallback(() => interactionVersion.current?.(), []);
  const value = useMemo(() => ({ register, pick, cite, note, offer, stage, release, getInteractionVersion: getCurrentInteractionVersion }),
    [register, pick, cite, note, offer, stage, release, getCurrentInteractionVersion]);
  const choose = async (key: string) => {
    if (!paper || busy || committing.current || !privateSurface.current) return;
    if (annotationDraft.current.trim() && key !== 'note') { setError('Your thoughts are preserved here. Save them as a note, or cancel before changing their use.'); return; }
    if (key === 'chat') { await cite(paper.reference, returnFocus.current?.element); return; }
    if (key === 'note') { previewTarget.current = undefined; setDestination(key); setError('');
      requestAnimationFrame(() => annotationInput.current?.focus({ preventScroll: true })); return; }
    await offer(paper.reference, key);
  };
  const accept = async () => {
    if (!paper || !destination || busy || committing.current || !privateSurface.current) return;
    const request = ++operation.current, reference = paper.reference, boundary = liveBoundary.current,
      interaction = interactionVersion.current?.();
    const owns = () => request === operation.current && boundary === liveBoundary.current;
    const current = () => owns() && privateSurface.current && interaction === interactionVersion.current?.();
    let accepted = false;
    committing.current = request; setAccepting(true); setBusy(true); setError('');
    try {
      if (destination === 'chat') {
        if (!await onDiscussRef.current(reference)) throw new Error('The conversation target has changed. The source was not added to another draft. Quote this passage again.');
        accepted = true;
      }
      else if (destination === 'note') {
        const result = await window.anima.sourceBookmarkKeep({ bookmark: reference, annotation,
          ...(paper.retainOriginalRequired ? { retainOriginal: true } : {}) });
        if (result.status !== 'saved') throw new Error('This note was edited elsewhere. Your original writing is preserved.');
        accepted = true;
        if (current()) { setSavedNote({ id: result.note.id, revision: result.note.revision, boundary, focus: returnFocus.current });
          onNoteSavedRef.current?.(result.note.id, result.note.revision); }
      } else {
        const target = targets.current.get(destination);
        if (!target) throw new Error('This study sheet was put away. The source is preserved; reopen the sheet before placing it.');
        if (target !== previewTarget.current) throw new Error('This study sheet has progressed. Select it again to place the passage at its current position.');
        await target.accept(reference);
        accepted = true;
        if (current() && target.location) onOpenStudy?.(target.location);
      }
    } catch (problem) {
      if (owns()) {
        if (committing.current === request) committing.current = undefined;
        setAccepting(false);
        // The owner may have refused a changed or withdrawn source after its
        // preview. Keep the paper only if that exact address still opens now.
        if (annotationDraft.current.trim()) detachWriting();
        else { setPaper(undefined); setDestination(undefined); previewTarget.current = undefined; }
        if (!current()) return;
        try {
          const preview = await window.anima.sourceBookmarkPreview(reference);
          if (current()) {
            paperBoundary.current = boundary; carriedReference.current = preview.reference; setDetached(false); setPaper(preview);
            if (annotationDraft.current.trim()) setDestination('note');
            setError(uiError(problem));
          }
        } catch (sourceProblem) { if (current()) setError(uiError(sourceProblem)); }
      }
    }
    finally {
      if (committing.current === request) { committing.current = undefined; setAccepting(false); }
      // A real acceptance is finished even when a later gesture vetoes only
      // its navigation. Retire this paper without focus or duplicate writes.
      if (accepted && owns()) clear(false);
      else if (owns()) { setBusy(false); setAccepting(false); }
    }
  };
  const saveDetached = async () => {
    if (!detached || !annotation.trim() || busy || committing.current || !privateSurface.current) return;
    const request = ++operation.current, boundary = liveBoundary.current, interaction = interactionVersion.current?.();
    const owns = () => request === operation.current && boundary === liveBoundary.current;
    const current = () => owns() && privateSurface.current && interaction === interactionVersion.current?.();
    let accepted = false;
    committing.current = request; setAccepting(true); setBusy(true); setError('');
    try {
      // This is deliberately a new native notebook document containing only
      // the person's writing. No retired source address or cached quote joins it.
      const result = await window.anima.notesCreate({ title: '', body: annotation });
      if (result.status !== 'saved') throw new Error('Your thoughts have not been saved. Review the current content.');
      accepted = true;
      if (current()) { setSavedNote({ id: result.note.id, revision: result.note.revision, boundary, focus: returnFocus.current });
        onNoteSavedRef.current?.(result.note.id, result.note.revision); }
    } catch (problem) { if (current()) setError(uiError(problem)); }
    finally {
      if (committing.current === request) { committing.current = undefined; setAccepting(false); }
      if (accepted && owns()) clear(false);
      else if (owns()) { setBusy(false); setAccepting(false); }
    }
  };
  const openSource = async () => {
    if (!paper || busy || committing.current || !onOpenSourceRef.current || !privateSurface.current) return;
    if (annotationDraft.current.trim()) { setError('Your thoughts remain here. Save them as a note before opening the source.'); return; }
    const request = ++operation.current, boundary = liveBoundary.current, interaction = interactionVersion.current?.();
    const owns = () => request === operation.current && boundary === liveBoundary.current;
    const current = () => owns() && privateSurface.current && interaction === interactionVersion.current?.();
    setBusy(true); setError('');
    try {
      const preview = await window.anima.sourceBookmarkPreview(paper.reference);
      if (!current()) return;
      await onOpenSourceRef.current(preview.reference);
      if (owns()) clear(false);
    } catch (problem) { if (current()) setError(uiError(problem)); }
    finally { if (owns()) setBusy(false); }
  };
  const dismissReceipt = () => {
    const saved = savedNote, boundary = liveBoundary.current, interaction = interactionVersion.current?.();
    setSavedNote(undefined);
    requestAnimationFrame(() => {
      if (saved?.boundary === boundary && boundary === liveBoundary.current && interaction === interactionVersion.current?.())
        restoreBookmarkFocus(saved.focus);
    });
  };
  const studyTargets = useMemo(() => [...targets.current.values()], [targetRevision]);
  const directNoteEditor = directNote && destination === 'note' && !detached;
  const noteSaveLabel = paper?.retainOriginalRequired ? 'Save note and original'
    : directNoteEditor ? annotation.trim() ? 'Save note' : 'Keep this passage' : 'Save as note';
  // The paper belongs in the room's current light. Keeping the portal on
  // this stable surface also preserves its draft when the reader is closed.
  const portalHost = document.querySelector<HTMLElement>('.app-main') || document.body;
  return <BookmarkTrayContext.Provider value={value}>{children}
    {active && (paper || error || detached || busy && !directCiting) && createPortal(<aside ref={tray} className={`source-bookmark-tray${directNoteEditor ? ' is-direct-note' : ''}`} aria-label="Quotations and notes"
      onKeyDown={event => { if (event.key === 'Escape' && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); clear(); } }}>
      <header><Quote size={16} aria-hidden="true" /><strong>{detached ? 'Your thoughts' : destination === 'note' ? 'Save as note' : 'This source passage'}</strong><button type="button" className="icon-button"
        aria-label={accepting ? 'Dismiss save progress' : annotation.trim() ? 'Discard these unsaved thoughts' : 'Cancel this action'}
        title={annotation.trim() && !accepting ? 'Discard these unsaved thoughts' : undefined} onClick={() => clear()}><X size={16} /></button></header>
      {detached && <><p>The source has changed. Your writing is preserved; you can save just your own thoughts as a note.</p>
        <label className="source-bookmark-annotation">Your thoughts
          <textarea ref={annotationInput} aria-label="Your unsaved thoughts" value={annotation} maxLength={4000} readOnly={busy}
            onChange={event => setAnnotation(event.target.value)} />
        </label>
        {accepting && !busy && <p role="status">The save is still in progress. Your writing remains here.</p>}
        <footer><button type="button" className="text-button" disabled={busy || accepting} onClick={() => clear()}>Discard these thoughts</button>
          <button type="button" className="primary-button" disabled={busy || accepting || !annotation.trim()} onClick={() => void saveDetached()}>{busy || accepting ? 'Saving…' : 'Save only my thoughts'}</button></footer>
      </>}
      {paper && <><div className="source-bookmark-paper" draggable={!busy} onDragStart={event => { stage(paper.reference); writeBookmarkTransfer(event.dataTransfer, paper.reference); }} onDragEnd={() => release(paper.reference)}>
        {directNoteEditor ? <div className="source-bookmark-source-header"><span>{paper.title}{paper.page ? ` · p. ${paper.page}` : ''}</span>
          {onOpenSource && <button type="button" className="icon-button" aria-label="Open original" title="Open original" disabled={busy} onClick={() => void openSource()}><ArrowUpRight size={15} /></button>}
        </div> : <span>{paper.title}{paper.page ? ` · p. ${paper.page}` : ''}</span>}
        <blockquote><RichText text={paper.text} /></blockquote></div>
        {!directNoteEditor && <div className="source-bookmark-destinations" role="group" aria-label="Source passage actions">
          <button type="button" data-bookmark-primary disabled={busy} onClick={() => void choose('chat')}><MessageCircle size={16} />Quote passage</button>
          <button type="button" aria-pressed={destination === 'note'} disabled={busy} onClick={() => void choose('note')}><FileText size={16} />Save as note</button>
          {onOpenSource && <button type="button" disabled={busy} onClick={() => void openSource()}><BookOpen size={16} />Open original</button>}
        </div>}
        {!directNoteEditor && studyTargets.length > 0 && <details className="source-bookmark-study-targets"><summary>Use in current study</summary><div className="source-bookmark-destinations">
          {studyTargets.map(target => <button type="button" key={target.key} aria-pressed={destination === target.key} disabled={busy} onClick={() => void choose(target.key)}><BookOpen size={16} />{target.label}</button>)}
        </div></details>}
        {destination === 'note' && <label className="source-bookmark-annotation">Your thoughts
          <textarea ref={annotationInput} aria-label="Thoughts about this source passage" placeholder="What came to mind…" maxLength={4000}
            value={annotation} readOnly={busy} onChange={event => setAnnotation(event.target.value)} />
        </label>}
        {destination === 'note' && paper.retainOriginalRequired && <p>The original file will also be saved on this device.</p>}
        {destination && <footer>
          <button type="button" className="text-button" disabled={busy} title={directNoteEditor && annotation.trim() ? 'Discard these unsaved thoughts' : undefined}
            onClick={() => { if (!committing.current) clear(); }}>{!directNoteEditor && annotation.trim() ? 'Discard these thoughts' : 'Cancel'}</button>
          <button type="button" className="primary-button" disabled={busy} onClick={() => void accept()}>{busy ? destination === 'note' ? 'Saving…' : 'Quoting…' : destination === 'note' ? noteSaveLabel : destination === 'chat' ? 'Quote passage' : 'Quote in this study'}</button></footer>}
      </>}
      {error && <p role="status">{error}</p>}{busy && !paper && <p role="status">Opening this source passage…</p>}
      {error && !destination && !busy && !detached && <footer>
        <button type="button" className="text-button" onClick={() => clear()}>{annotation.trim() ? 'Discard these thoughts' : 'Cancel'}</button>
        {carriedReference.current && <button type="button" className="primary-button" onClick={() => {
          const reference = carriedReference.current; if (reference) void offer(reference);
        }}>Look again</button>}
      </footer>}
    </aside>, portalHost)}
    {active && savedNote?.boundary === boundaryKey && createPortal(<aside ref={receipt} className="source-bookmark-tray source-bookmark-receipt" role="status" aria-label="Note saved">
      <Check size={16} /><span>Saved as a note</span>
      {onOpenNote && <button type="button" className="text-button" onClick={() => { onOpenNote(savedNote.id, savedNote.revision); setSavedNote(undefined); }}>Open note</button>}
      <button type="button" className="icon-button" aria-label="Dismiss saved note notice" onClick={dismissReceipt}><X size={16} /></button>
    </aside>, portalHost)}
    <span className="sr-only" role="status">{active ? announcement : ''}</span>
  </BookmarkTrayContext.Provider>;
}
