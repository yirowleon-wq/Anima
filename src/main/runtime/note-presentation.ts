import { createHash } from 'node:crypto';
import { HarnessError, type ScopeHandle } from '../../shared/harness';
import { NOTE_READING_MEANING, noteNativeInput, notePresentationInput, noteReferenceSchema,
  type NoteScene, type NoteReference, type NoteNativeInput } from '../../shared/note-presentation';
import { noteSourceProofSchema, type NoteSourceProof } from '../../shared/notes-source';
import type { Store } from '../store';
import type { Message } from '../../shared/types';
import type { RunSession } from './coordinator';
import type { NotebookQuoteReference } from '../../shared/notes';

export class NotePresentationService {
  constructor(readonly store: Store) {}
  private boundary() { const runtime = this.store.runtime; return `${this.store.kernel.epoch}:${this.store.kernel.policyRevision}:${runtime.policy.sourceBoundary}`; }
  private readable(handle: ScopeHandle, proof: NoteSourceProof) {
    this.store.runtime.policy.require(handle, 'evidence:read');
    if (!this.store.kernel.noteSourcesReadable(handle, [proof]))
      throw new HarnessError('note_source_changed', "This note cannot be expanded through its original source now. Review currently permitted content.");
  }
  private page(handle: ScopeHandle, proof: NoteSourceProof, sessionId: string): NoteScene {
    this.readable(handle, proof);
    const page = this.store.notes.read({ id: proof.id, revision: proof.revision, offset: proof.start,
      limit: Math.max(1, proof.end - proof.start) }, handle);
    if (page.note.sha256 !== proof.sha256 || page.note.revision !== proof.revision || page.offset !== proof.start
      || page.end !== proof.end) throw new HarnessError('note_source_changed', "The original position in this note changed. Old words were not restored.");
    this.readable(handle, proof);
    const identity = createHash('sha256').update(JSON.stringify(proof)).digest('hex');
    return { kind: 'note', id: `note-reading:${identity}`, revision: proof.revision, sessionId, createdAt: this.store.kernel.clock.now(),
      source: { sourceId: 'notes:self', fetchedAt: this.store.kernel.clock.now(), version: `${proof.id}@${proof.revision}` },
      sourceBoundary: this.boundary(), proof, title: page.note.title || "Untitled note", body: page.body, updatedAt: page.note.updatedAt,
      coverage: { start: page.offset, end: page.end, total: page.total, hasMore: page.hasMore }, meaning: NOTE_READING_MEANING };
  }
  create(session: RunSession, raw: unknown, signal: AbortSignal) {
    signal.throwIfAborted();
    const input = notePresentationInput.parse(raw), pack = session.pack;
    if (!pack || session.background || this.store.runtime.policy.validate(pack.contract.scope).child)
      throw new HarnessError('note_presentation_owner', "Actually read this note in the current conversation before presenting it together.");
    const delivered = pack.receipt.noteSources?.find(proof => proof.id === input.id && proof.revision === input.revision
      && proof.start <= input.start && proof.end >= input.end);
    if (!delivered) throw new HarnessError('note_not_delivered', "This original page has not been delivered this round. Use manage_note read; do not invent a display address.");
    const proof = noteSourceProofSchema.parse({ ...delivered, start: input.start, end: input.end });
    const scene = this.page(pack.contract.scope, proof, session.sceneSessionId || session.sessionId);
    signal.throwIfAborted(); this.readable(pack.contract.scope, proof);
    return { scene, sources: [proof] };
  }
  snapshotReadable(handle: ScopeHandle, scene: NoteScene) {
    try { this.readable(handle, noteSourceProofSchema.parse(scene.proof)); return true; }
    catch (error) { if (error instanceof HarnessError || error instanceof Error && error.name === 'ZodError') return false; throw error; }
  }
  private original(sessionId: string, input: Pick<NoteNativeInput, 'messageId' | 'sceneId' | 'sceneRevision'>) {
    const row = this.store.db.prepare("SELECT payload FROM messages WHERE session_id=? AND id=? AND role='assistant'")
      .get(sessionId, input.messageId);
    const message = row ? JSON.parse(String(row.payload)) as Message : undefined;
    const scene = message?.scenes?.find(value => value.kind === 'note' && value.id === input.sceneId && value.revision === input.sceneRevision);
    if (!message || !scene || scene.kind !== 'note'
      || !this.store.runtime.presentation.sourceCurrentMessage(message).scenes?.some(value => value.id === scene.id && value.revision === scene.revision))
      throw new HarnessError('note_reference_missing', "This page is not in a currently readable original reply.");
    return scene;
  }
  project(raw: NoteNativeInput, signal: AbortSignal): NoteScene {
    const input = noteNativeInput.parse(raw), runtime = this.store.runtime;
    if (runtime.presentation.public) throw new HarnessError('note_private', "Return to your private conversation before opening notes.");
    const before = this.boundary(), scope = runtime.policy.hostScope(); signal.throwIfAborted();
    const original = this.original(input.sessionId, input), current = this.page(scope, original.proof, input.sessionId);
    if (current.id !== original.id || current.revision !== original.revision) throw new HarnessError('note_reference_changed', "This original note page needs rereading.");
    signal.throwIfAborted();
    if (runtime.presentation.public || before !== this.boundary()) throw new HarnessError('note_source_changed', "The source scope changed. Reopen from the current conversation.");
    return current;
  }
  referenceIdentity(handle: ScopeHandle, raw: NoteReference, sessionId: string) {
    this.store.runtime.policy.require(handle, 'evidence:read');
    const ref = noteReferenceSchema.parse(raw);
    const row = this.store.db.prepare(`SELECT json_extract(s.value,'$.proof.id') AS note_id,
      json_extract(s.value,'$.proof.revision') AS note_revision,json_extract(s.value,'$.proof.start') AS start,
      json_extract(s.value,'$.proof.end') AS end FROM messages m,json_each(m.payload,'$.scenes') s
      WHERE m.session_id=? AND m.id=? AND m.role='assistant' AND json_extract(s.value,'$.kind')='note'
      AND json_extract(s.value,'$.id')=? AND json_extract(s.value,'$.revision')=? LIMIT 1`)
      .get(sessionId, ref.messageId, ref.sceneId, ref.sceneRevision);
    if (!row || row.note_id !== ref.noteId || row.note_revision !== ref.revision
      || typeof row.start !== 'number' || typeof row.end !== 'number' || !Number.isSafeInteger(row.start)
      || !Number.isSafeInteger(row.end) || row.start < 0 || row.end < row.start
      || ref.start < Number(row.start) || ref.end > Number(row.end)
      || ref.intent === 'continue_reading' && ref.end !== row.end)
      throw new HarnessError('note_reference_missing', "This quotation is absent from that original note page.");
    return { origin: 'user_note' as const };
  }
  resolveReference(handle: ScopeHandle, raw: NoteReference, sessionId: string) {
    const input = noteReferenceSchema.parse(raw); this.referenceIdentity(handle, input, sessionId);
    const original = this.original(sessionId, input);
    if (input.intent === 'continue_reading') {
      this.readable(handle, original.proof);
      if (!original.coverage.hasMore || input.end !== original.proof.end)
        throw new HarnessError('note_continuation_changed', "The original page has no unread continuation. Return to its current page.");
      return { text: '', title: original.title, origin: 'user_note' as const, reference: input,
        sources: [{ ...original.proof, start: input.end, end: input.end }], meaning: NOTE_READING_MEANING,
        read: { tool: 'manage_note', arguments: { operation: 'read', input: {
          id: original.proof.id, revision: original.proof.revision, offset: input.end, limit: 4000 } } } };
    }
    const proof = { ...original.proof, start: input.start, end: input.end };
    const scene = this.page(handle, proof, sessionId), text = scene.body;
    if (!text.trim()) throw new HarnessError('note_reference_empty', "Select a short original passage to discuss.");
    this.readable(handle, proof);
    return { text, title: scene.title, origin: 'user_note' as const, reference: input, sources: [proof], meaning: NOTE_READING_MEANING };
  }
  resolveNotebookQuote(handle: ScopeHandle, raw: NotebookQuoteReference) {
    const selected = this.store.notes.notebookQuote(raw, handle), { proof } = this.store.notes.notebookQuoteIdentity(raw, handle);
    this.readable(handle, proof);
    return { ...selected, origin: 'user_note' as const, sources: [proof], meaning: NOTE_READING_MEANING };
  }
  notebookQuoteIdentity(handle: ScopeHandle, raw: NotebookQuoteReference) {
    const { reference, proof } = this.store.notes.notebookQuoteIdentity(raw, handle);
    this.readable(handle, proof);
    return { origin: 'user_note' as const, reference, selectedRange: { start: proof.start, end: proof.end },
      meaning: "The current UI selection points to this saved-note passage. It resolves the reference only and expands no note reading, retention, or editing permission." };
  }
  /** Identifies the document currently being pointed at without delivering any
   * additional text or granting a later private read. */
  readPurposeReference(handle: ScopeHandle, raw: NoteReference, sessionId: string) {
    const ref = noteReferenceSchema.parse(raw); this.referenceIdentity(handle, ref, sessionId);
    const row = this.store.db.prepare(`SELECT json_extract(s.value,'$.proof.id') AS note_id,
      json_extract(s.value,'$.proof.revision') AS note_revision,json_extract(s.value,'$.proof.sha256') AS note_sha,
      json_extract(s.value,'$.proof.start') AS source_start,json_extract(s.value,'$.proof.end') AS source_end
      FROM messages m,json_each(m.payload,'$.scenes') s WHERE m.session_id=? AND m.id=? AND m.role='assistant'
      AND json_extract(s.value,'$.kind')='note' AND json_extract(s.value,'$.id')=? AND json_extract(s.value,'$.revision')=? LIMIT 1`)
      .get(sessionId, ref.messageId, ref.sceneId, ref.sceneRevision);
    if (!row) throw new HarnessError('note_reference_missing', "This note source cannot currently be located.");
    const proof = noteSourceProofSchema.parse({ id: row.note_id, revision: row.note_revision, sha256: row.note_sha,
      start: row.source_start, end: row.source_end });
    this.readable(handle, proof);
    return { origin: 'user_note' as const, reference: ref, selectedRange: { start: ref.start, end: ref.end },
      displayedPage: { start: proof.start, end: proof.end },
      meaning: "This current UI reference resolves a target only. It is not permission or proof of a full read this round. Independent note reads still depend on current source, purpose, and scope checks." };
  }
}
