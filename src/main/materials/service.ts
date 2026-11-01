import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import * as z from 'zod';
import { HarnessError, materialNavigationProofSchema, type EvidenceEvent, type ScopeHandle } from '../../shared/harness';
import { MATERIAL_LIMITS, materialCropSchema, materialReferenceSchema, materialTargetSchema, materialReadSchema, materialQuoteInputSchema, materialKeepQuoteInputSchema, materialMoveNoteInputSchema, materialNotesInputSchema, materialQuoteReferenceSchema, materialQuoteAddress, type MaterialQuoteReference, type MaterialQuote, type MaterialReference, type MaterialTarget, type MaterialItem, type MaterialPage, type MaterialNotes } from '../../shared/materials';
import type { TextAttachment } from '../../shared/types';
import type { KernelRepository } from '../storage/repository';
import type { PolicyKernel } from '../runtime/policy';
import type { VisualObservation } from '../runtime/spatial';
import type { CapabilityBroker } from '../capabilities/broker';
import { hasCredentials } from '../runtime/redaction';
import type { NotesService } from '../notes/service';
import type { NoteMutation } from '../../shared/notes';
import { canonical } from '../runtime/semantics';

type Binding = { eventId: string; parentEventId: string; sessionId: string; eventVersion: number; retention: string;
  ownerId?: string; workspaceId?: string; nativeTicketContinuation?: true };
type Resource = { reference: MaterialReference; epoch: number; bytes?: Buffer; text?: string; encoding?: string; binding?: Binding; saved?: boolean; notebookOriginal?: boolean; discoverySequence?: number; draftIds?: Set<string>; preparedFor?: Set<string>; releaseRequested?: boolean;
  nativeContinuationFor?: string;
  publicSource?: { url: string; scopeId: string; sourceId: 'web:public'; fetchedAt: string; httpStatus?: number; contentType?: string }; };
const materialAccessCapabilities = ['materials.describe', 'materials.read', 'materials.find', 'materials.table', 'materials.observe'] as const;
type MaterialNavigationSource = Pick<MaterialReference, 'resourceId' | 'sha256' | 'version' | 'name'> & {
  kind: 'user_selected_file'; authority: 'quotation'; sourceId: string;
  sourceEventId: string; contentVersion: number; parentEventId: string; sessionId: string; roots: string[];
};
type MaterialNavigationAddress<C extends string> = { tool: 'look_up'; arguments: {
  source: 'capability'; capability: C; arguments: { resourceId: string; page?: number; offset?: number; limit?: number; crop?: z.infer<typeof materialCropSchema> };
} };
export interface MaterialReadNavigation {
  resourceId: string; accessSha256: string; name: string; mediaType: MaterialReference['mediaType']; source: MaterialNavigationSource;
  originalContentsRead: false;
  priorAccess: { capability: typeof materialAccessCapabilities[number]; page?: number; extraction?: string;
    sourceContentVersion?: number; sourceSessionId?: string; readOrdinal?: number; observedAt?: string; resultComplete: boolean;
    crop?: z.infer<typeof materialCropSchema>; rendererVersion?: string;
    range?: { unit: 'unicode_code_point' | 'unicode_code_point_within_page'; start: number; end: number; total: number };
    meaning: string };
  describe: MaterialNavigationAddress<'materials.describe'>;
  read: MaterialNavigationAddress<'materials.read'>;
  observe?: MaterialNavigationAddress<'materials.observe'>;
}
export type MaterialSubmissionReadPurpose = { source: MaterialNavigationSource; metadataOnly: true; meaning: string } & (
  { targetKind: 'user_message'; relation: 'material_submission_parent'; coordinateUnit: 'unicode_code_point_in_message'; materialBodyRead: false }
  | { targetKind: 'file_import'; relation: 'material_document_body'; readTarget: 'materials.read'; page?: 1;
    coordinateUnit: 'unicode_code_point' | 'unicode_code_point_within_page' }
);
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const resourceId = z.string().regex(/^material-[a-f0-9-]{36}$/);
const discoveryInput = z.object({
  resourceId: resourceId.optional(),
  query: z.string().trim().max(200).optional(),
  mediaType: z.enum(['text/plain', 'text/markdown', 'application/pdf']).optional(),
  receivedFrom: z.string().datetime({ offset: true }).optional(),
  receivedBefore: z.string().datetime({ offset: true }).optional(),
  cursor: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(12).default(6),
}).strict().superRefine((input, context) => {
  if (input.resourceId && [input.query, input.mediaType, input.receivedFrom, input.receivedBefore, input.cursor].some(value => value !== undefined))
    context.addIssue({ code: 'custom', message: "Supply resourceId to read only that file; omit it while finding files." });
  if (input.receivedFrom && input.receivedBefore && Date.parse(input.receivedFrom) >= Date.parse(input.receivedBefore))
    context.addIssue({ code: 'custom', message: "The file-received start time must precede its end time." });
});
type DiscoveryPosition = { binding: string; snapshot: number; before: number; expiresAt: number;
  query?: string; mediaType?: string; receivedFrom?: string; receivedBefore?: string };
const findInput = z.object({ resourceId, query: z.string().min(1).max(200),
  page: z.number().int().min(1).max(MATERIAL_LIMITS.pages).optional(),
  offset: z.number().int().min(0).max(MATERIAL_LIMITS.textCodePoints).default(0),
  limit: z.number().int().min(1).max(12).default(6) }).strict();
const materialNavigationRead = z.object({ capability: z.enum(materialAccessCapabilities), resourceId,
  sha256: z.string().regex(/^[a-f0-9]{64}$/), version: z.number().int().positive(),
  sourceEventId: z.string().min(1).max(160), parentEventId: z.string().min(1).max(160),
  page: z.number().int().min(1).max(MATERIAL_LIMITS.pages).optional(),
  start: z.number().int().nonnegative().optional(), end: z.number().int().nonnegative().optional(), total: z.number().int().nonnegative().optional(),
  complete: z.boolean(), extraction: z.string().max(160).optional(),
  sourceContentVersion: z.number().int().positive().optional(),
  sourceSessionId: z.string().min(1).max(160).optional(),
  crop: materialCropSchema.optional(), rendererVersion: z.string().min(1).max(160).optional(),
  readOrdinal: z.number().int().positive().optional(), observedAt: z.string().datetime({ offset: true }).optional(),
}).refine(read => [read.start, read.end, read.total].every(value => value === undefined)
  || read.start !== undefined && read.end !== undefined && read.total !== undefined && read.start <= read.end && read.end <= read.total);

function decode(bytes: Buffer) {
  const encoding = bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf-16le' : bytes[0] === 0xfe && bytes[1] === 0xff ? 'utf-16be' : 'utf-8';
  try { return { text: new TextDecoder(encoding, { fatal: true }).decode(bytes), encoding }; }
  catch { throw new HarnessError('material_encoding', "This text encoding is unreadable. Original bytes were neither replaced nor truncated."); }
}

/** Selected originals stay with this owner. A volatile upload does not save
 * bytes by itself; an explicit notebook keep or persisted draft can retain the
 * same original locally, without granting it to a model. */
export class MaterialService {
  private records = new Map<string, Resource>();
  private images = new Map<string, VisualObservation>();
  private imageScopes = new Map<string, ScopeHandle>();
  private visualHolders = new Map<string, Set<string>>();
  private discoveryPositions = new Map<string, DiscoveryPosition>();
  private discoverySequence = 0;
  private active = new Set<AbortController>();
  private nativeReads = new Map<string, AbortController>();
  readonly directory: string;
  constructor(private repo: KernelRepository, private policy: PolicyKernel,
    private evidence: (scope: ScopeHandle, id: string) => EvidenceEvent | undefined) {
    this.directory = path.join(path.dirname(path.resolve(repo.databasePath)), 'materials');
    if (fs.existsSync(this.directory)) for (const name of fs.readdirSync(this.directory)) {
      if (!/^material-[a-f0-9-]{36}\.json$/.test(name)) continue;
      try {
        const record = JSON.parse(fs.readFileSync(path.join(this.directory, name), 'utf8'));
        if (record.ownerId !== repo.identity.principalId || record.workspaceId !== repo.identity.workspaceId) continue;
        materialReferenceSchema.parse(record.reference);
        this.records.set(record.reference.resourceId, { ...record, saved: true, bytes: undefined, text: undefined });
      } catch { /* A malformed manifest cannot become a readable source. */ }
    }
    this.sweep();
    for (const record of this.records.values()) if (record.saved && record.binding) this.validateParentBinding(record);
    // Saved originals retain their received order after reopening. The sequence
    // itself is process-local, just like the cursors, and includes temporary
    // conversation files once they are actually bound to a submitted message.
    const saved = [...this.records.values()].filter(record => record.binding).map(record => ({ record,
      sequence: Number(repo.db.prepare('SELECT seq FROM h_evidence WHERE id=?').get(record.binding!.eventId)?.seq || 0) }));
    for (const { record } of saved.sort((a, b) => a.sequence - b.sequence)) record.discoverySequence = ++this.discoverySequence;
    repo.onPrivacyCleanup(() => { this.cancel(); this.images.clear(); this.imageScopes.clear(); this.visualHolders.clear(); this.sweep(); });
    policy.onBarrier(() => { this.cancel(); this.images.clear(); this.imageScopes.clear(); this.visualHolders.clear(); for (const [id, record] of this.records) {
      if (!record.saved) this.remove(id); else { record.bytes = undefined; record.text = undefined; }
    } this.sweep(); });
  }
  private file(id: string, extension: string) { resourceId.parse(id); return path.join(this.directory, id + extension); }
  // A live run may keep pixels beyond the ordinary cache size. Holding a
  // cache entry never replaces visual()'s source and scope checks.
  private trimVisuals(keepId?: string) {
    while (this.images.size > 4) {
      const oldest = [...this.images.keys()].find(id => id !== keepId && !this.visualHolders.has(id));
      if (!oldest) break;
      this.images.delete(oldest); this.imageScopes.delete(oldest);
    }
  }
  private trimPublicRecords(keepId?: string) {
    // A held page still needs its immutable PDF owner during visual().
    const heldResources = new Set([...this.images.values()].filter(image => this.visualHolders.has(image.id))
      .map(image => (image.source as { resourceId?: string }).resourceId));
    let records = [...this.records.values()].filter(record => record.publicSource);
    while (records.length > 16 || records.reduce((total, record) => total + record.reference.byteLength, 0) > 32_000_000) {
      const oldest = records.find(record => record.reference.resourceId !== keepId && !heldResources.has(record.reference.resourceId));
      if (!oldest) break;
      this.remove(oldest.reference.resourceId);
      records = records.filter(record => record !== oldest);
    }
  }
  private remove(id: string) {
    const record = this.records.get(id); record?.bytes?.fill(0); this.records.delete(id);
    for (const image of this.images.values()) if ((image.source as any)?.resourceId === id) {
      this.images.delete(image.id); this.imageScopes.delete(image.id); this.visualHolders.delete(image.id);
    }
    for (const extension of ['.bin', '.json']) if (fs.existsSync(this.file(id, extension))) fs.unlinkSync(this.file(id, extension));
  }
  private persistedDraftOwns(record: Resource) {
    if (!record.saved || record.binding) return false;
    const rows = this.repo.db.prepare(`SELECT json_extract(a.value,'$.resource') AS reference
      FROM meta m,json_each(CASE WHEN json_type(m.value,'$.attachments')='array' THEN json_extract(m.value,'$.attachments')
        ELSE json_array(json_extract(m.value,'$.attachment')) END) a
      WHERE m.key LIKE 'draft:%' AND json_valid(m.value) AND json_extract(a.value,'$.kind')='text'
      AND json_extract(a.value,'$.resource.resourceId')=?`).all(record.reference.resourceId);
    return rows.some(row => {
      try {
        const parsed = materialReferenceSchema.safeParse(JSON.parse(String(row.reference)));
        return parsed.success && JSON.stringify(parsed.data) === JSON.stringify(record.reference);
      } catch { return false; }
    });
  }
  /** The notebook owns the decision to keep an original locally. Only its
   * current address metadata is inspected; note text is neither copied here
   * nor admitted to a model. A recycle-bin page may retain bytes for restore,
   * but it is not an active native-library read grant. */
  private notebookOwns(record: Resource, includeDeleted = false) {
    if (!record.notebookOriginal || this.repo.hasFence(record.reference.resourceId)
      || this.repo.db.prepare('SELECT 1 FROM h_source_restrictions WHERE event_id=? LIMIT 1').get(record.reference.resourceId)
      || !this.repo.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='h_notes'").get()) return false;
    const rows = this.repo.db.prepare(`SELECT id,state FROM h_notes WHERE owner=? AND workspace=?
      AND state IN ('active','deleted') AND json_valid(payload)
      AND json_extract(payload,'$.source.material.resourceId')=? AND json_extract(payload,'$.source.material.sha256')=?`)
      .all(this.repo.identity.principalId, this.repo.identity.workspaceId, record.reference.resourceId, record.reference.sha256);
    return rows.some(row => (row.state === 'active' || includeDeleted) && !this.repo.hasFence(String(row.id), 'notes:self'));
  }
  /** Only a notebook original kept before its first submission has an
   * independent native owner. Removing a later chat binding cannot turn an
   * ordinary chat-derived note into such an original. */
  private releaseConversationBinding(record: Resource) {
    if (!record.notebookOriginal || !this.notebookOwns(record, true)) return false;
    record.binding = undefined; record.discoverySequence = undefined;
    this.save(record);
    return true;
  }
  /** Privileged cleanup reads only source status/version, never source text. */
  sweep() {
    for (const [id, record] of this.records) {
      if (this.repo.hasFence(id) || this.repo.db.prepare('SELECT 1 FROM h_source_restrictions WHERE event_id=? LIMIT 1').get(id)) { this.remove(id); continue; }
      if (record.notebookOriginal && !this.notebookOwns(record, true)) {
        record.notebookOriginal = undefined;
        if (record.saved && record.binding?.retention === 'session_only') {
          record.bytes ||= this.nativeBytes(record);
          for (const extension of ['.bin', '.json']) if (fs.existsSync(this.file(id, extension))) fs.unlinkSync(this.file(id, extension));
          record.saved = false;
        } else if (record.saved && record.binding) this.save(record);
      }
      if (!record.binding) {
        if (record.saved && !record.draftIds?.size && !this.persistedDraftOwns(record) && !this.notebookOwns(record, true)) {
          // An admitted send may cross ordinary owner cleanup while awaiting
          // controls. Its existing lease ends in bind/releasePreparation. A
          // privacy-epoch change or source fence still removes immediately.
          if (record.preparedFor?.size && record.epoch === this.repo.epoch) record.releaseRequested = true;
          else this.remove(id);
        }
        continue;
      }
      const ids = [record.binding.eventId, record.binding.parentEventId];
      if (record.binding.retention === 'session_only') {
        // Temporary events live in the runtime's ephemeral evidence owner,
        // not h_evidence. Scope/evidence checks still gate every model read.
        const withdrawn = record.epoch !== this.repo.epoch || ids.some(eventId => this.repo.hasFence(eventId)
          || !!this.repo.db.prepare('SELECT 1 FROM h_source_restrictions WHERE event_id=? LIMIT 1').get(eventId));
        if (withdrawn && !this.releaseConversationBinding(record)) this.remove(id);
        continue;
      }
      if (!record.saved) continue;
      if (ids.some((eventId, index) => {
        const row = this.repo.db.prepare("SELECT status,source,json_extract(payload,'$.contentVersion') AS version FROM h_evidence WHERE id=?").get(eventId);
        const restricted = this.repo.db.prepare("SELECT 1 FROM h_source_restrictions WHERE event_id=? AND predicate='*' LIMIT 1").get(eventId);
        return !row || (index ? !['active', 'redacted'].includes(String(row.status)) : row.status !== 'active')
          || !index && Number(row.version) !== record.binding!.eventVersion || !!restricted || this.repo.hasFence(eventId, String(row.source));
      }) && !this.releaseConversationBinding(record)) this.remove(id);
    }
  }
  private save(record: Resource) {
    fs.mkdirSync(this.directory, { recursive: true });
    if (record.bytes) fs.writeFileSync(this.file(record.reference.resourceId, '.bin'), record.bytes, { mode: 0o600 });
    fs.writeFileSync(this.file(record.reference.resourceId, '.json'), JSON.stringify({ reference: record.reference, epoch: record.epoch,
      binding: record.binding?.retention === 'session_only' ? undefined : record.binding, notebookOriginal: record.notebookOriginal,
      ownerId: this.repo.identity.principalId, workspaceId: this.repo.identity.workspaceId }), { mode: 0o600 });
    record.saved = true;
  }
  /** The parent owns submission lifetime, not the independent file's words.
   * Whole-parent erasure follows the typed cleanup closure. A local erasure
   * in the parent's text cannot erase the original attachment. */
  private validateParentBinding(record: Resource): boolean {
    const binding = record.binding;
    if (!binding || !record.saved || record.publicSource || binding.retention === 'session_only') return false;
    const bytes = this.file(record.reference.resourceId, '.bin');
    if (!fs.existsSync(bytes) || fs.statSync(bytes).size !== record.reference.byteLength) return false;
    const row = this.repo.db.prepare(`SELECT e.version,e.status,e.source,
      json_extract(e.payload,'$.parentEventId') AS parent,json_extract(e.payload,'$.sessionId') AS session,
      json_extract(e.payload,'$.kind') AS kind,json_extract(e.payload,'$.speaker') AS speaker,
      json_extract(e.payload,'$.authority') AS authority,json_extract(e.payload,'$.locator.kind') AS locator_kind,
      json_extract(e.payload,'$.locator.artifactId') AS artifact,
      p.status AS parent_status,p.source AS parent_source,json_extract(p.payload,'$.sessionId') AS parent_session,
      json_extract(p.payload,'$.kind') AS parent_kind,json_extract(p.payload,'$.speaker') AS parent_speaker
      FROM h_evidence e JOIN h_evidence p ON p.id=? AND p.owner=e.owner AND p.workspace=e.workspace
      WHERE e.id=? AND e.owner=? AND e.workspace=?`).get(binding.parentEventId, binding.eventId,
        this.repo.identity.principalId, this.repo.identity.workspaceId);
    if (!row || !this.fileEventMatches(binding.eventId, binding.parentEventId) || row.parent !== binding.parentEventId
      || row.version !== binding.eventVersion || row.status !== 'active' || !['active', 'redacted'].includes(String(row.parent_status))
      || row.kind !== 'file_import' || row.speaker !== 'external' || row.authority !== 'quotation'
      || row.locator_kind !== 'file' || row.artifact !== record.reference.resourceId
      || row.session !== binding.sessionId || row.parent_session !== binding.sessionId
      || row.parent_kind !== 'user_message' || row.parent_speaker !== 'user'
      || this.repo.hasFence(binding.eventId, String(row.source)) || this.repo.hasFence(binding.parentEventId, String(row.parent_source))) return false;
    this.repo.write(() => this.repo.db.prepare(`DELETE FROM h_dependencies WHERE consumer_id=? AND producer_id=?
      AND producer_revision=0 AND sensitivity='privacy' AND invalidation='block'`).run(binding.eventId, binding.parentEventId));
    return true;
  }
  stageFile(file: string): TextAttachment {
    const info = fs.statSync(file);
    if (!info.isFile() || info.size > MATERIAL_LIMITS.bytes) throw new HarnessError('material_size', "Choose a file no larger than 20 MB.");
    return this.stageBytes(path.basename(file), fs.readFileSync(file));
  }
  private fileEventMatches(eventId: string, parentEventId: string) {
    const prefix = parentEventId + ':file';
    return eventId === prefix || eventId.startsWith(prefix + ':') && z.string().uuid().safeParse(eventId.slice(prefix.length + 1)).success;
  }
  /** Host/test import only: never exposed as an IPC accepting a chosen path. */
  stageBytes(name: string, input: Buffer, publicImport = false): TextAttachment {
    if (input.length > MATERIAL_LIMITS.bytes) throw new HarnessError('material_size', "The file exceeds this reading-size limit.");
    const extension = path.extname(name).toLowerCase(), mediaType = extension === '.pdf' ? 'application/pdf' : extension === '.md' ? 'text/markdown' : extension === '.txt' ? 'text/plain' : undefined;
    if (!mediaType) throw new HarnessError('material_type_unsupported', "TXT, Markdown and PDF are supported here. This format is not connected yet.");
    if (mediaType === 'application/pdf' && !input.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new HarnessError('material_type_mismatch', "The file content is not a verifiable PDF.");
    const bytes = Buffer.from(input), decoded: { text?: string; encoding?: string } = mediaType === 'application/pdf' ? {} : decode(bytes);
    if (decoded.text && Array.from(decoded.text).length > MATERIAL_LIMITS.textCodePoints) throw new HarnessError('material_size', "The text exceeds the complete-resource limit and was not accepted as a truncated file.");
    const reference: MaterialReference = { resourceId: 'material-' + randomUUID(), accessKey: randomBytes(32).toString('hex'),
      name: name.replace(/[\r\n\x00-\x1f]/g, '').replaceAll(']', '］').slice(0, 260) || "File material", mediaType, byteLength: bytes.length, sha256: sha(bytes), version: 1 };
    const pending = [...this.records.values()].filter(record => !record.binding && !record.saved && !record.publicSource);
    if (!publicImport && pending.length >= MATERIAL_LIMITS.pending) throw new HarnessError('material_pending_limit', "Too many unsent files are staged. Remove unneeded draft attachments first.");
    this.records.set(reference.resourceId, { reference, bytes, ...decoded, epoch: this.repo.epoch });
    return { kind: 'text', attachmentId: randomUUID(), name: reference.name, text: this.legacyText(reference), resource: structuredClone(reference) };
  }
  private legacyText(reference: MaterialReference) {
    return `The complete file is staged. Read its text by range or page.
[Anima complete file:${reference.resourceId}:${reference.accessKey}]`;
  }
  referenceFromLegacy(text?: string): MaterialReference | undefined {
    const marker = text?.match(/\[Anima complete file:(material-[a-f0-9-]{36}):([a-f0-9]{64})\]/);
    if (!marker) return;
    const record = this.records.get(marker[1]);
    if (!record || marker[2] !== record.reference.accessKey) throw new HarnessError('material_reference_invalid', "This file reference is not a current host-issued selection. Add the file again.");
    this.pending(record.reference);
    return structuredClone(record.reference);
  }
  private current(raw: MaterialReference) {
    const ref = materialReferenceSchema.parse(raw), record = this.records.get(ref.resourceId);
    if (!record || JSON.stringify(ref) !== JSON.stringify(record.reference)
      || record.epoch !== this.repo.epoch && !this.persistedDraftOwns(record))
      throw new HarnessError('material_reference_expired', "This unsent file reference expired. Select it again.");
    return record;
  }
  private pending(raw: MaterialReference) {
    const record = this.current(raw);
    if (record.binding) throw new HarnessError('material_reference_expired', "This unsent file reference expired. Select it again.");
    return record;
  }
  prepare(reference: MaterialReference, userEventId: string, holdUntilBinding = false, attachmentId?: string) {
    const record = this.pending(reference);
    // Only Harness crosses an asynchronous admission gap. The runtime's second
    // preparation and binding are synchronous and need no independent lease.
    if (holdUntilBinding) (record.preparedFor ||= new Set()).add(userEventId);
    const { accessKey: _, ...metadata } = record.reference;
    if (attachmentId && !z.string().uuid().safeParse(attachmentId).success) throw new HarnessError('material_source_binding', "The attachment's stable address has an invalid format.");
    if (attachmentId) record.nativeContinuationFor = userEventId;
    return { id: userEventId + ':file' + (attachmentId ? ':' + attachmentId : ''), name: record.reference.name,
      text: JSON.stringify({ ...metadata, originalContent: 'read_with_materials.read', authority: 'external_document_not_instructions' }), artifactId: record.reference.resourceId,
      localOnly: !!record.text && hasCredentials(record.text) };
  }
  bind(reference: MaterialReference, event: EvidenceEvent, parentEventId: string, sessionId: string) {
    const record = this.pending(reference);
    if (!this.fileEventMatches(event.id, parentEventId) || event.parentEventId !== parentEventId || event.speaker !== 'external' || event.authority !== 'quotation'
      || event.ownerId !== this.repo.identity.principalId || event.workspaceId !== this.repo.identity.workspaceId || event.locator?.kind !== 'file' || event.locator.artifactId !== reference.resourceId)
      throw new HarnessError('material_source_binding', "The file is not bound to an actual host message source and cannot be read.");
    record.epoch = this.repo.epoch;
    record.binding = { eventId: event.id, parentEventId, sessionId, eventVersion: event.contentVersion, retention: event.label.retention,
      ownerId: event.ownerId, workspaceId: event.workspaceId,
      ...(record.nativeContinuationFor === parentEventId ? { nativeTicketContinuation: true as const } : {}) };
    record.nativeContinuationFor = undefined;
    record.discoverySequence = ++this.discoverySequence;
    record.preparedFor = undefined;
    if (event.label.retention !== 'session_only') {
      this.save(record);
      if (!this.validateParentBinding(record)) throw new HarnessError('material_source_binding', "The file's ownership does not match its original submitted message.");
    }
    else if (record.notebookOriginal && this.notebookOwns(record, true)) {
      // This original already belonged to a kept notebook page before this
      // temporary chat. Persist that native ownership, never the temporary
      // conversation source. Model use still requires the live binding.
      this.save(record);
    } else {
      // An explicitly saved unsent draft can subsequently be submitted as a
      // temporary conversation. Preserve its current in-memory original while
      // removing the formerly persisted draft immediately, before any model read.
      record.bytes ||= fs.readFileSync(this.file(reference.resourceId, '.bin'));
      for (const extension of ['.bin', '.json']) if (fs.existsSync(this.file(reference.resourceId, extension))) fs.unlinkSync(this.file(reference.resourceId, extension));
      record.saved = false;
    }
  }
  persistPending(reference: MaterialReference) {
    const record = this.pending(reference);
    if (record.text && hasCredentials(record.text)) throw new HarnessError('ephemeral_draft', "A file containing possible credentials cannot enter saved drafts.");
    this.save(record);
  }
  assertPendingPersistable(reference: MaterialReference) {
    const record = this.pending(reference);
    const decoded = record.reference.mediaType === 'application/pdf' ? undefined : decode(record.bytes || fs.readFileSync(this.file(reference.resourceId, '.bin')));
    if (decoded && hasCredentials(decoded.text)) throw new HarnessError('ephemeral_draft', "A file containing possible credentials cannot enter saved drafts.");
  }
  attachDraft(reference: MaterialReference, draftId: string, validateOnly = false) {
    const record = this.current(reference);
    if (validateOnly) return;
    record.epoch = this.repo.epoch;
    (record.draftIds ||= new Set()).add(draftId);
  }
  releasePreparation(reference: MaterialReference, userEventId: string) {
    const parsed = materialReferenceSchema.safeParse(reference), record = this.records.get(reference.resourceId);
    if (!parsed.success || !record || JSON.stringify(parsed.data) !== JSON.stringify(record.reference)) return;
    if (record.nativeContinuationFor === userEventId) record.nativeContinuationFor = undefined;
    if (!record.preparedFor?.delete(userEventId)) return;
    if (!record.preparedFor.size) record.preparedFor = undefined;
    // A failed send may be retried with its original selection. Only an actual
    // discard/released draft asks to remove it once the last lease is gone.
    if (record.releaseRequested) this.releasePending(reference);
  }
  releasePending(reference?: MaterialReference, draftId?: string) {
    if (!reference) return;
    const parsed = materialReferenceSchema.safeParse(reference), record = this.records.get(reference.resourceId);
    if (!parsed.success || !record || JSON.stringify(parsed.data) !== JSON.stringify(record.reference)) return;
    if (draftId !== undefined) {
      if (!record.draftIds?.delete(draftId)) return;
    }
    if (record.binding || record.draftIds?.size || this.persistedDraftOwns(record) || this.notebookOwns(record, true)) return;
    if (record.preparedFor?.size) { record.releaseRequested = true; return; }
    this.remove(reference.resourceId);
  }
  /** Called after the original draft metadata deletion has committed. */
  releasePersistedDraft(reference: MaterialReference, draftId: string) {
    const parsed = materialReferenceSchema.safeParse(reference), record = this.records.get(reference.resourceId);
    if (!parsed.success || !record || record.binding || JSON.stringify(parsed.data) !== JSON.stringify(record.reference)) return;
    record.draftIds?.delete(draftId);
    if (this.persistedDraftOwns(record) || this.notebookOwns(record, true)) return;
    if (record.epoch !== this.repo.epoch) this.remove(reference.resourceId);
    else this.releasePending(reference);
  }
  endConversation(sessionId?: string) {
    this.cancel(); this.images.clear(); this.imageScopes.clear(); this.visualHolders.clear();
    for (const [id, record] of this.records) {
      if (record.binding?.retention === 'session_only' && (!sessionId || record.binding.sessionId === sessionId)) {
        if (!this.releaseConversationBinding(record)) this.remove(id);
        continue;
      }
      if (record.saved || !record.binding && record.draftIds?.size) continue;
      if (!sessionId || record.publicSource || record.binding?.sessionId === sessionId) this.remove(id);
    }
    this.sweep();
  }
  cancel() { for (const controller of this.active) controller.abort(new DOMException("The material scope changed", 'AbortError')); this.active.clear(); this.nativeReads.clear(); this.discoveryPositions.clear(); }
  private resolveMetadata(scope: ScopeHandle, id: string, sweep = true) {
    resourceId.parse(id); if (sweep) this.sweep();
    const allowed = this.policy.require(scope, 'evidence:read'), record = this.records.get(id);
    if (!record) throw new HarnessError('material_expired', "This file's original content is unavailable. Add it again or reread its source.");
    if (record.publicSource) {
      if (record.epoch !== allowed.privacyEpoch || record.publicSource.scopeId !== scope.id || !allowed.sources.includes('web:public')) throw new HarnessError('material_source_forbidden', "Public material is outside the currently admitted scope.");
    } else {
      if (!record.binding) throw new HarnessError('material_not_sent', "Unsent files are not supplied to the model.");
      if (!allowed.sources.includes('current') && !allowed.sources.includes('file:' + record.binding.eventId))
        throw new HarnessError('material_source_forbidden', "The current material namespace does not admit this local file.");
      const event = this.evidence(scope, record.binding.eventId);
      if (!event || event.status !== 'active' || event.contentVersion !== record.binding.eventVersion || event.locator?.kind !== 'file' || event.locator.artifactId !== id)
        throw new HarnessError('material_source_forbidden', "The file source is not among the originals permitted this turn.");
      if (record.saved && record.binding.retention !== 'session_only' && !this.validateParentBinding(record))
        throw new HarnessError('material_source_forbidden', "The file no longer matches its original submitted message's current source.");
      record.epoch = allowed.privacyEpoch;
    }
    return { record, allowed };
  }
  private resolve(scope: ScopeHandle, id: string) {
    const { record, allowed } = this.resolveMetadata(scope, id);
    const bytes = record.bytes || fs.readFileSync(this.file(id, '.bin'));
    if (bytes.length !== record.reference.byteLength || sha(bytes) !== record.reference.sha256) throw new HarnessError('material_integrity', "The file bytes differ from the registered revision. Check the original file first.");
    return { record, bytes, allowed };
  }
  private navigationRecord(scope: ScopeHandle, id: string, sessionId: string, allowCurrent = false) {
    const { record, allowed } = this.resolveMetadata(scope, id, false), binding = record.binding;
    // Stored host receipts navigate their original submission. Saving native
    // notebook bytes does not persist a temporary parent proof: only the
    // current submitted temporary pair can identify its own read target.
    if (record.publicSource || !binding || binding.sessionId !== sessionId) return;
    if (binding.retention === 'session_only' ? !(allowCurrent && allowed.retention === 'session_only'
      && allowed.currentEventIds.includes(binding.eventId) && allowed.currentEventIds.includes(binding.parentEventId)) : !record.saved) return;
    return { record, binding };
  }
  private navigationSource(record: Resource, binding: Binding): MaterialNavigationSource {
    const { resourceId, sha256, version, name } = record.reference;
    return { kind: 'user_selected_file', authority: 'quotation', resourceId, sha256, version, name,
      sourceId: 'file:' + binding.eventId, sourceEventId: binding.eventId, contentVersion: binding.eventVersion,
      parentEventId: binding.parentEventId, sessionId: binding.sessionId, roots: [binding.eventId] };
  }
  /** Qualify an exact old host address without reading its text layer or pixels. */
  materialReadNavigation(scope: ScopeHandle, read: unknown, sessionId: string): MaterialReadNavigation | undefined {
    const parsed = materialNavigationRead.safeParse(read);
    if (!parsed.success) return;
    try {
      const prior = parsed.data, current = this.navigationRecord(scope, prior.resourceId, prior.sourceSessionId || sessionId);
      if (!current) return;
      const { record, binding } = current, ref = record.reference, pdf = ref.mediaType === 'application/pdf';
      if (ref.sha256 !== prior.sha256 || ref.version !== prior.version || binding.eventId !== prior.sourceEventId
        || binding.parentEventId !== prior.parentEventId || prior.sourceContentVersion !== undefined && binding.eventVersion !== prior.sourceContentVersion
        || !pdf && prior.page !== undefined || pdf && prior.start !== undefined && prior.page === undefined
        || prior.crop !== undefined && (!pdf || prior.capability !== 'materials.observe')) return;
      const page = pdf ? prior.page || 1 : undefined;
      return { resourceId: ref.resourceId, accessSha256: sha(Buffer.from(canonical(prior), 'utf8')),
        name: ref.name, mediaType: ref.mediaType, source: this.navigationSource(record, binding),
        originalContentsRead: false,
        priorAccess: { capability: prior.capability, ...(prior.page === undefined ? {} : { page: prior.page }),
          ...(prior.extraction === undefined ? {} : { extraction: prior.extraction }),
          ...(prior.sourceContentVersion === undefined ? {} : { sourceContentVersion: prior.sourceContentVersion }),
          ...(prior.sourceSessionId === undefined ? {} : { sourceSessionId: prior.sourceSessionId }),
          ...(prior.crop === undefined ? {} : { crop: prior.crop }),
          ...(prior.rendererVersion === undefined ? {} : { rendererVersion: prior.rendererVersion }),
          ...(prior.readOrdinal === undefined ? {} : { readOrdinal: prior.readOrdinal }),
          ...(prior.observedAt === undefined ? {} : { observedAt: prior.observedAt }), resultComplete: prior.complete,
          ...(prior.start === undefined ? {} : { range: { unit: pdf ? 'unicode_code_point_within_page' : 'unicode_code_point',
            start: prior.start, end: prior.end!, total: prior.total! } }),
          meaning: "This retains only the address and range of that observation. Original text and page pixels are not embedded in it." },
        describe: { tool: 'look_up', arguments: { source: 'capability', capability: 'materials.describe', arguments: { resourceId: ref.resourceId } } },
        read: { tool: 'look_up', arguments: { source: 'capability', capability: 'materials.read', arguments: { resourceId: ref.resourceId,
          ...(page === undefined ? {} : { page }), offset: 0, limit: 8000 } } },
        ...(page === undefined ? {} : { observe: { tool: 'look_up', arguments: { source: 'capability', capability: 'materials.observe',
          arguments: { resourceId: ref.resourceId, page, ...(prior.crop === undefined ? {} : { crop: prior.crop }) } } } }),
      };
    } catch (error) {
      if (error instanceof HarnessError || error instanceof z.ZodError) return;
      throw error;
    }
  }
  /** Revalidate host metadata provenance; no document or reply body is read. */
  materialNavigationSourcesReadable(scope: ScopeHandle, proofs: unknown): boolean {
    const parsed = z.array(materialNavigationProofSchema).safeParse(proofs);
    if (!parsed.success) return false;
    if (!parsed.data.length) return true;
    try {
      const allowed = this.policy.require(scope, 'evidence:read');
      if (allowed.principalId !== this.repo.identity.principalId || allowed.workspaceId !== this.repo.identity.workspaceId
        || allowed.subjectId !== allowed.principalId || allowed.worldId !== 'real' || allowed.audience !== 'self'
        || !allowed.sources.includes('history:self')) return false;
      return parsed.data.every(proof => {
        const candidate = this.repo.conversationMaterialReadCandidates(scope, proof.sessionId,
          { messageIds: [proof.messageId], limit: 1 }).find(value => value.messageId === proof.messageId && value.receiptId === proof.receiptId);
        if (!candidate) return false;
        const originReadable = candidate.reads.some(read => {
          const navigation = this.materialReadNavigation(scope, read, proof.sessionId), source = navigation?.source;
          return !!navigation && !!source && navigation.accessSha256 === proof.accessSha256
            && navigation.resourceId === proof.resourceId && source.sha256 === proof.sha256 && source.version === proof.version
            && source.sourceEventId === proof.sourceEventId && source.contentVersion === proof.sourceContentVersion
            && source.parentEventId === proof.parentEventId;
        });
        if (!originReadable) return false;
        const { via = [], ...origin } = proof, originIdentity = canonical(origin);
        return via.every(reference => {
          const metadata = this.repo.materialNavigationViaMetadata(scope, reference);
          if (!metadata || metadata.receiptId !== reference.receiptId) return false;
          const inherited = z.array(materialNavigationProofSchema).safeParse(metadata.sources);
          return inherited.success && inherited.data.some(({ via: _via, ...base }) => canonical(base) === originIdentity);
        });
      });
    } catch (error) {
      if (error instanceof HarnessError || error instanceof z.ZodError) return false;
      throw error;
    }
  }
  /** Identify what read_evidence will read, without opening the parent message. */
  submissionReadPurpose(scope: ScopeHandle, id: string, sessionId: string): MaterialSubmissionReadPurpose | undefined {
    try {
      this.policy.require(scope, 'evidence:read');
      const matches = [...this.records.values()].filter(record => record.binding?.sessionId === sessionId
        && (record.binding.parentEventId === id || record.binding.eventId === id));
      if (matches.length !== 1) return;
      const current = this.navigationRecord(scope, matches[0].reference.resourceId, sessionId, true);
      if (!current) return;
      const { record, binding } = current, source = this.navigationSource(record, binding);
      if (id === binding.parentEventId) return { targetKind: 'user_message', relation: 'material_submission_parent',
        coordinateUnit: 'unicode_code_point_in_message', materialBodyRead: false, source, metadataOnly: true,
        meaning: "This address returns to the statement submitted with the attachment. offset and limit count Unicode code points in that message. The file body has a separate address for reading its intended pages." };
      const pdf = record.reference.mediaType === 'application/pdf';
      return { targetKind: 'file_import', relation: 'material_document_body', readTarget: 'materials.read',
        ...(pdf ? { page: 1 as const } : {}), coordinateUnit: pdf ? 'unicode_code_point_within_page' : 'unicode_code_point',
        source, metadataOnly: true,
        meaning: pdf ? "This address opens PDF page 1 text through materials.read. offset and limit count that page's Unicode code points. Continue other pages by page number; use materials.observe for charts and layout."
          : "This address opens the original text file through materials.read. offset and limit count file Unicode code points. The attachment's submission statement remains in its parent message.",
      };
    } catch (error) {
      if (error instanceof HarnessError || error instanceof z.ZodError) return;
      throw error;
    }
  }
  /** A kept artifact may retain an address to a text layer already delivered
   * by this owner. Recheck that exact resource lifetime without re-reading its
   * body, parsing a PDF, or manufacturing a new model observation. */
  retainedTextIdentityCurrent(scope: ScopeHandle, ref: {
    resourceId: string; sha256: string; version: number; sourceEventId: string;
    contentVersion: number; parentEventId: string;
  }): boolean {
    try {
      const { record } = this.resolveMetadata(scope, ref.resourceId, false), binding = record.binding;
      if (record.publicSource || !binding || record.reference.sha256 !== ref.sha256 || record.reference.version !== ref.version
        || binding.eventId !== ref.sourceEventId || binding.eventVersion !== ref.contentVersion || binding.parentEventId !== ref.parentEventId
        || !record.bytes && (!record.saved || !fs.existsSync(this.file(ref.resourceId, '.bin')))) return false;
      const original = this.evidence(scope, binding.eventId);
      return !!original && original.status === 'active' && original.label.retention === 'purpose_scoped'
        && !this.repo.hasFence(original.id, original.sourceId)
        && this.repo.availableInferenceRanges(original).some(range => range.start === 0 && range.end === Array.from(original.text).length);
    } catch (error) {
      if (error instanceof HarnessError || error instanceof z.ZodError) return false;
      throw error;
    }
  }
  /** Discover addresses before reading bytes. A fixed submission sequence keeps
   * later uploads from moving a page, while every returned file is rechecked. */
  private discover(scope: ScopeHandle, raw: unknown, signal: AbortSignal) {
    const input = discoveryInput.parse(raw), allowed = this.policy.require(scope, 'evidence:read');
    this.sweep();
    const now = Date.parse(this.repo.clock.now());
    const binding = sha(Buffer.from(JSON.stringify({ principal: allowed.principalId, workspace: allowed.workspaceId,
      subject: allowed.subjectId, world: allowed.worldId, audience: allowed.audience, epoch: this.repo.epoch,
      policy: this.repo.policyRevision, sources: [...allowed.sources].sort(), purposes: [...allowed.purposes].sort(),
      grants: [...allowed.grants].sort(), current: [...allowed.currentEventIds].sort(), retention: allowed.retention })));
    for (const [id, position] of this.discoveryPositions) if (position.expiresAt <= now) this.discoveryPositions.delete(id);
    const prior = input.cursor ? this.discoveryPositions.get(input.cursor) : undefined;
    if (input.cursor && (!prior || prior.binding !== binding))
      throw new HarnessError('material_cursor_expired', "The file-directory cursor expired or its readable scope changed. Find the file again.");
    const query = input.query === undefined ? prior?.query : input.query.normalize('NFKC').toLowerCase();
    const mediaType = input.mediaType ?? prior?.mediaType;
    const receivedFrom = input.receivedFrom ?? prior?.receivedFrom, receivedBefore = input.receivedBefore ?? prior?.receivedBefore;
    if (prior && (query !== prior.query || mediaType !== prior.mediaType || receivedFrom !== prior.receivedFrom || receivedBefore !== prior.receivedBefore))
      throw new HarnessError('material_cursor_range', "Keep the original search scope when paging. To change scope, restart without cursor.");
    const snapshot = prior?.snapshot ?? this.discoverySequence;
    let before = prior?.before ?? snapshot + 1;
    const candidates = [...this.records.values()].flatMap(record => {
      if (!record.binding || record.publicSource) return [];
      const sequence = record.discoverySequence;
      return sequence !== undefined && Number.isSafeInteger(sequence) && sequence <= snapshot && sequence < before ? [{ record, sequence }] : [];
    }).sort((a, b) => b.sequence - a.sequence);
    const items: Record<string, unknown>[] = [];
    let scanned = 0, lookAhead = false;
    for (const candidate of candidates) {
      if (scanned >= 200) break;
      signal.throwIfAborted(); scanned++;
      const { record, sequence } = candidate;
      let permitted = false;
      try { this.resolveMetadata(scope, record.reference.resourceId, false); permitted = true; } catch (error) {
        if (error instanceof HarnessError && ['material_expired', 'material_source_forbidden', 'material_not_sent'].includes(error.code)) { /* Current visibility may have narrowed. */ }
        else throw error;
      }
      const event = permitted ? this.evidence(scope, record.binding!.eventId) : undefined;
      const matches = event && (!query || record.reference.name.normalize('NFKC').toLowerCase().includes(query))
        && (!mediaType || record.reference.mediaType === mediaType)
        && (!receivedFrom || Date.parse(event.receivedAt) >= Date.parse(receivedFrom))
        && (!receivedBefore || Date.parse(event.receivedAt) < Date.parse(receivedBefore));
      if (matches) {
        if (items.length === input.limit) { lookAhead = true; break; }
        items.push({ resourceId: record.reference.resourceId, name: record.reference.name, mediaType: record.reference.mediaType,
          sha256: record.reference.sha256, version: record.reference.version, receivedAt: event.receivedAt,
          source: { ...this.source(record), contentVersion: event.contentVersion }, originalContentsRead: false,
          read: { capability: 'materials.read', arguments: { resourceId: record.reference.resourceId,
            ...(record.reference.mediaType === 'application/pdf' ? { page: 1 } : {}), offset: 0, limit: 8000 } } });
      }
      before = sequence;
    }
    let nextCursor: string | null = null;
    if (lookAhead || scanned < candidates.length) {
      nextCursor = randomUUID();
      while (this.discoveryPositions.size >= 128) this.discoveryPositions.delete(this.discoveryPositions.keys().next().value!);
      this.discoveryPositions.set(nextCursor, { binding, snapshot, before, query, mediaType, receivedFrom, receivedBefore,
        expiresAt: Math.min(now + 30 * 60_000, Date.parse(allowed.expiresAt)) });
    }
    return { status: nextCursor ? 'partial' : 'fresh', sourceId: 'current', observedAt: this.repo.clock.now(), simulated: false,
      data: { items, nextCursor, originalContentsRead: false,
        coverage: { snapshot: 'fixed_on_first_page', bounded: true, currentVisibilityRechecked: true },
        guidance: "This is an address catalog of currently permitted files; their bodies have not been read. query matches filenames only. Change terms or omit query to browse if nothing matches. Use read for originals and inspect PDFs page by page. Times are receipt times; empty pages with cursor still continue. Restart to include later uploads." },
      coverage: { complete: !nextCursor, scope: 'currently_permitted_material_descriptors' } };
  }
  private source(record: Resource) {
    return { kind: record.publicSource ? 'public_https' : 'user_selected_file', authority: 'quotation', resourceId: record.reference.resourceId,
      sourceId: record.publicSource ? 'web:public' : 'file:' + record.binding!.eventId,
      sha256: record.reference.sha256, version: record.reference.version, name: record.reference.name,
      ...(record.binding ? { sourceEventId: record.binding.eventId, contentVersion: record.binding.eventVersion,
        parentEventId: record.binding.parentEventId, sessionId: record.binding.sessionId, roots: [record.binding.eventId] }
        : { url: record.publicSource!.url, fetchedAt: record.publicSource!.fetchedAt, httpStatus: record.publicSource!.httpStatus, contentType: record.publicSource!.contentType }) };
  }
  private result(record: Resource, data: object, complete = false, reason?: string, deliveredPage = false) {
    return { status: complete ? 'fresh' : 'partial', sourceId: record.publicSource ? 'web:public' : 'current', observedAt: this.repo.clock.now(), simulated: false,
      ...(reason ? { reason } : {}), data: JSON.parse(JSON.stringify({ source: this.source(record), ...data })),
      ...(deliveredPage ? { delivery: { kind: 'page' as const, complete: true as const } } : {}),
      coverage: { complete, scope: record.reference.resourceId } };
  }
  private find(record: Resource, text: string, args: { query: string; offset?: number; limit?: number }, page?: number, pageCount?: number, needsVisual?: boolean) {
    const points = Array.from(text), offset = args.offset || 0;
    if (offset > points.length) throw new HarnessError('material_range', "The search offset is past this original text. Return to an existing location.");
    let position = points.slice(0, offset).join('').length;
    const matches: { start: number; end: number; excerpt: string; excerptRange: { start: number; end: number };
      read: { capability: string; arguments: Record<string, string | number> } }[] = [];
    let nextOffset: number | null = null;
    while (position <= text.length) {
      const found = text.indexOf(args.query, position);
      if (found < 0) break;
      const start = Array.from(text.slice(0, found)).length, end = start + Array.from(args.query).length;
      if (matches.length >= (args.limit || 6)) { nextOffset = start; break; }
      const excerptStart = Math.max(0, start - 120), excerptEnd = Math.min(points.length, end + 120);
      const excerpt = points.slice(excerptStart, excerptEnd).join('');
      if (hasCredentials(excerpt)) throw new HarnessError('material_credentials', "The nearby match contains possible credentials and was not supplied to a cloud model.");
      matches.push({ start, end, excerpt, excerptRange: { start: excerptStart, end: excerptEnd },
        read: { capability: 'materials.read', arguments: { resourceId: record.reference.resourceId,
          ...(page === undefined ? {} : { page }), offset: excerptStart, limit: Math.min(8000, points.length - excerptStart || 1) } } });
      position = found + Array.from(args.query)[0].length;
    }
    return this.result(record, { resourceId: record.reference.resourceId, matches, nextOffset, page, pageCount, needsVisual,
      nextPage: page !== undefined && pageCount !== undefined && page < pageCount ? page + 1 : null,
      coverage: { unit: page === undefined ? 'unicode_code_point' : 'unicode_code_point_within_page',
        searchedFrom: offset, total: points.length, literalMatchesComplete: nextOffset === null,
        provided: 'matched_excerpts_only', fullOriginalRead: false, semanticRelevance: 'not_judged', visualContentsSearched: false },
      guidance: "These are exact locations in the original text layer; nearby excerpts do not replace full conditions. Read context through read. No match means only that this exact text is absent from the selected range, not that related meaning is absent. PDF search covers the selected page; continue through nextPage and observe charts or scans directly." }, false);
  }
  /** A native picker ticket owns this exact original in the current window,
   * including its transition into a submitted file. It never grants a model
   * scope or turns a temporary original into a saved library item. */
  private nativeRecord(raw: MaterialTarget) {
    const target = materialTargetSchema.parse(raw);
    this.sweep();
    const scope = this.policy.hostScope({ infer: false });
    this.policy.require(scope, 'evidence:read');
    const record = target.kind === 'pending' ? this.current(target.reference) : this.records.get(target.resourceId);
    if (!record || record.publicSource || target.kind === 'saved' && (!record.saved || !record.binding && !this.notebookOwns(record)))
      throw new HarnessError('material_unavailable', "This original is no longer available here. Select the file again.");
    if (record.notebookOriginal && this.notebookOwns(record)) return record;
    if (record.binding) {
      const binding = record.binding;
      // Only canonical queue admission carries the native-window handoff.
      // Legacy single-file tickets keep their original post-send expiry;
      // their durable source remains available through the saved-owner door.
      if (target.kind === 'pending' && !binding.nativeTicketContinuation)
        throw new HarnessError('material_reference_expired', "This unsent file reference expired. Open it from received original material.");
      if (binding.retention === 'session_only') {
        // The model's ephemeral events end with its turn. The original native
        // ticket and same-epoch Resource binding remain the person's window
        // owner until endConversation; no transcript copy or new proof is kept.
        if (target.kind !== 'pending' || record.epoch !== this.repo.epoch
          || binding.ownerId !== this.repo.identity.principalId || binding.workspaceId !== this.repo.identity.workspaceId
          || !binding.sessionId || !Number.isSafeInteger(binding.eventVersion) || binding.eventVersion < 1
          || !this.fileEventMatches(binding.eventId, binding.parentEventId)
          || this.repo.hasFence(binding.eventId, 'file:' + binding.eventId) || this.repo.hasFence(binding.parentEventId, 'history:self')
          || this.repo.db.prepare('SELECT 1 FROM h_source_restrictions WHERE event_id IN (?,?) LIMIT 1').get(binding.eventId, binding.parentEventId))
          throw new HarnessError('material_unavailable', "This original's permitted use changed. Select the file again.");
        this.nativeBytes(record);
        return record;
      }
      if (!record.saved || !this.validateParentBinding(record))
        throw new HarnessError('material_unavailable', "This original no longer matches its submitted message's ownership. Select the file again.");
      const sourceScope = this.policy.hostScope({ sources: ['history:self', 'file:' + binding.eventId], infer: false });
      const original = this.evidence(sourceScope, binding.eventId);
      const parent = this.evidence(sourceScope, binding.parentEventId);
      if (!original || !parent || original.status !== 'active' || !['active', 'redacted'].includes(parent.status)
        || original.contentVersion !== binding.eventVersion || original.locator?.kind !== 'file'
        || original.locator.artifactId !== record.reference.resourceId
        || original.kind !== 'file_import' || original.speaker !== 'external' || original.authority !== 'quotation'
        || original.sourceId !== 'file:' + binding.eventId || original.parentEventId !== binding.parentEventId || original.sessionId !== binding.sessionId
        || original.ownerId !== this.repo.identity.principalId || original.workspaceId !== this.repo.identity.workspaceId
        || parent.ownerId !== this.repo.identity.principalId || parent.workspaceId !== this.repo.identity.workspaceId
        || parent.kind !== 'user_message' || parent.speaker !== 'user' || parent.sessionId !== binding.sessionId
        || original.label.retention !== binding.retention || original.label.retention === 'session_only'
        || this.repo.hasFence(binding.eventId, original.sourceId) || this.repo.hasFence(binding.parentEventId, parent.sourceId)
        || this.repo.db.prepare('SELECT 1 FROM h_source_restrictions WHERE event_id IN (?,?) LIMIT 1').get(binding.eventId, binding.parentEventId))
        throw new HarnessError('material_unavailable', "This original's permitted use changed. Select the file again.");
      record.epoch = this.repo.epoch;
    }
    return record;
  }
  private nativeItem(record: Resource): MaterialItem {
    const { resourceId, name, mediaType, byteLength, sha256 } = record.reference;
    return { resourceId, name, mediaType, byteLength, sha256, ...(record.binding ? { sessionId: record.binding.sessionId } : {}),
      ...(record.notebookOriginal && this.notebookOwns(record) ? { originalRetained: true } : {}) };
  }
  /** Native preview metadata only, after its exact quotation was re-read. */
  notebookOriginalRequired(reference: MaterialQuoteReference): boolean {
    const record = this.records.get(reference.resourceId);
    if (!record) throw new HarnessError('material_unavailable', "The original file was put away. Retrieve it again at its original place.");
    this.assertQuoteMetadata(record, reference);
    return !record.binding && !this.notebookOwns(record);
  }
  private nativeBytes(record: Resource) {
    const bytes = record.bytes || fs.readFileSync(this.file(record.reference.resourceId, '.bin'));
    if (bytes.length !== record.reference.byteLength || sha(bytes) !== record.reference.sha256)
      throw new HarnessError('material_integrity', "This file differs from the retained version. Select the original again.");
    return bytes;
  }
  nativeList(sessionId?: string): MaterialItem[] {
    this.sweep();
    return [...this.records.values()].flatMap(record => {
      if (!record.saved || !record.binding && !this.notebookOwns(record) || record.publicSource) return [];
      try {
        const current = this.nativeRecord({ kind: 'saved', resourceId: record.reference.resourceId });
        return [this.nativeItem(current)];
      } catch { return []; }
    }).sort((a, b) => Number(b.sessionId === sessionId) - Number(a.sessionId === sessionId));
  }
  /** Native source-panel metadata. This verifies the original owner/binding
   * and bytes, but never records a model read or lends that owner a run scope. */
  nativeReplySource(input: { resourceId: string; sourceEventId: string; parentEventId: string; sessionId: string; contentVersion: number }) {
    const target = { kind: 'saved' as const, resourceId: input.resourceId };
    const record = this.nativeRecord(target), binding = record.binding;
    if (!binding || binding.eventId !== input.sourceEventId || binding.parentEventId !== input.parentEventId
      || binding.sessionId !== input.sessionId || binding.eventVersion !== input.contentVersion)
      throw new HarnessError('material_source_forbidden', "The original file no longer connects to this message's source. Reopen the original.");
    try { this.nativeBytes(record); }
    catch (error) {
      if (['ENOENT', 'ENOTDIR', 'EACCES', 'EPERM'].includes(String((error as NodeJS.ErrnoException)?.code)))
        throw new HarnessError('material_unavailable', "The original file cannot be opened now. Add it again.");
      throw error;
    }
    return { item: this.nativeItem(record), target };
  }
  /** Host-only ingress for an explicitly selected document on a real send.
   * The returned ticket stays in main and enters the existing Harness file
   * admission; a native preview/keep never calls this or grants model access. */
  prepareDocumentSend(raw: { resourceId: string; sha256: string },
    draftOwner?: { draftOwnerId: string; reference: MaterialReference }):
    { kind: 'draft' | 'notebook'; reference: MaterialReference } | undefined {
    const input = z.object({ resourceId, sha256: materialReferenceSchema.shape.sha256 }).strict().parse(raw);
    // Main supplies this ticket only after finding it in this exact native
    // draft. An address alone never upgrades an ordinary pending original.
    const candidate = draftOwner && this.records.get(input.resourceId);
    const draftRecord = candidate && !candidate.binding && candidate.draftIds?.has(draftOwner!.draftOwnerId) ? candidate : undefined;
    const record = draftRecord ? this.nativeRecord({ kind: 'pending', reference: draftOwner!.reference })
      : this.nativeRecord({ kind: 'saved', resourceId: input.resourceId });
    if (draftRecord && (record !== draftRecord || record.epoch !== this.repo.epoch || !record.draftIds?.has(draftOwner!.draftOwnerId)))
      throw new HarnessError('material_reference_expired', "The original left this draft. Select the file to read again.");
    if (record.reference.sha256 !== input.sha256)
      throw new HarnessError('material_reference_changed', "This material was replaced later. Retrieve it again from the original file.");
    this.nativeBytes(record);
    if (draftRecord) return { kind: 'draft', reference: structuredClone(record.reference) };
    // Each explicit delivery needs this run's real temporary file event. Its
    // independent notebook original re-enters ordinary admission; previews and
    // native keeps never invoke this host-only formal-send boundary.
    if (record.binding?.retention === 'session_only')
      this.releaseConversationBinding(record);
    if (record.binding) return;
    if (!this.notebookOwns(record)) throw new HarnessError('material_unavailable', "This original cannot currently be attached to the conversation. Check its provenance in the note.");
    record.epoch = this.repo.epoch;
    return { kind: 'notebook', reference: structuredClone(record.reference) };
  }
  cancelNativeRead(readerId?: string) {
    const key = readerId || 'legacy';
    this.nativeReads.get(key)?.abort(); this.nativeReads.delete(key);
  }
  /** Local inspection never inserts an observation into the model image queue. */
  async nativeReadPage(raw: unknown): Promise<MaterialPage> {
    const input = materialReadSchema.parse(raw), record = this.nativeRecord(input.target);
    const bytes = this.nativeBytes(record), item = this.nativeItem(record);
    this.cancelNativeRead(input.readerId);
    const controller = new AbortController();
    const readerKey = input.readerId || 'legacy';
    this.nativeReads.set(readerKey, controller); this.active.add(controller);
    const epoch = this.repo.epoch, revision = this.repo.policyRevision, boundary = this.policy.sourceBoundary;
    try {
      let text: string, page: number | undefined, pageCount: number | undefined, needsVisual: boolean | undefined;
      let image: MaterialPage['image'], textRuns: MaterialPage['textRuns'], selectionUnavailable: boolean | undefined;
      if (item.mediaType === 'application/pdf') {
        const { parsePdf } = await import('./pdf');
        if (input.view === 'page') {
          // Both projections use the same verified snapshot and cancellation
          // boundary. A damaged text layer must not hide a readable original.
          const [parsed, layer] = await Promise.all([
            parsePdf(bytes, { operation: 'render', page: input.page }, controller.signal),
            parsePdf(bytes, { operation: 'read', page: input.page }, controller.signal).catch(() => undefined),
          ]);
          image = parsed.image; page = parsed.page; pageCount = parsed.pageCount; text = layer?.text || '';
          needsVisual = layer?.needsVisual;
          selectionUnavailable = !layer || undefined;
          let position = 0;
          textRuns = layer?.items?.map(item => {
            const start = position, end = start + Array.from(item.text).length;
            position = end + (item.hasEOL ? 1 : 0);
            return { text: item.text, start, end, bbox: item.bbox, dir: item.dir };
          });
          // The extraction order and its EOLs must reconstruct the exact
          // original being addressed. Never repair a mismatch by text search.
          if (position !== Array.from(text).length
            || layer?.items?.map(item => item.text + (item.hasEOL ? '\n' : '')).join('') !== text) {
            textRuns = undefined; selectionUnavailable = true;
          }
        } else {
          const parsed = await parsePdf(bytes, { operation: 'read', page: input.page }, controller.signal);
          text = parsed.text || ''; page = parsed.page; pageCount = parsed.pageCount; needsVisual = parsed.needsVisual;
        }
      } else text = decode(bytes).text;
      controller.signal.throwIfAborted();
      if (epoch !== this.repo.epoch || revision !== this.repo.policyRevision || boundary !== this.policy.sourceBoundary)
        throw new HarnessError('material_changed', "The material's use scope changed. Reopen it.");
      this.nativeRecord(input.target);
      const points = Array.from(text), start = input.offset;
      if (start > points.length) throw new HarnessError('material_range', "This passage ends here. Return to an earlier passage.");
      const end = Math.min(points.length, start + MATERIAL_LIMITS.readCodePoints);
      textRuns = textRuns?.filter(run => run.start >= start && run.end <= end && run.end > run.start);
      return { item, text: points.slice(start, end).join(''), start, end, total: points.length,
        nextOffset: end < points.length ? end : null, page, pageCount, needsVisual, image, textRuns, selectionUnavailable };
    } finally { this.active.delete(controller); if (this.nativeReads.get(readerKey) === controller) this.nativeReads.delete(readerKey); }
  }
  /** Read the selected range independently of the reader's cancellable page
   * request. Neither a copied UI string nor its UTF-16 coordinates are trusted. */
  async nativeQuote(raw: unknown, signal?: AbortSignal): Promise<MaterialQuote> {
    const input = materialQuoteInputSchema.parse(raw), ref = input.quote;
    const target = input.target;
    const record = this.nativeRecord(target), item = this.nativeItem(record);
    this.assertQuoteMetadata(record, ref);
    const bytes = this.nativeBytes(record), epoch = this.repo.epoch, revision = this.repo.policyRevision,
      boundary = this.policy.sourceBoundary, controller = new AbortController();
    const abort = () => controller.abort(signal?.reason);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    this.active.add(controller);
    try {
      let text: string;
      if (item.mediaType === 'application/pdf') {
        const { parsePdf } = await import('./pdf');
        const parsed = await parsePdf(bytes, { operation: 'read', page: ref.page! }, controller.signal);
        text = parsed.text || '';
      } else text = decode(bytes).text;
      controller.signal.throwIfAborted();
      if (epoch !== this.repo.epoch || revision !== this.repo.policyRevision || boundary !== this.policy.sourceBoundary)
        throw new HarnessError('material_changed', "The material's use scope changed. Select this passage again in the original.");
      this.assertQuoteMetadata(this.nativeRecord(target), ref);
      const points = Array.from(text);
      if (ref.end > points.length || !points.slice(ref.start, ref.end).join('').trim())
        throw new HarnessError('material_quote_range', "This passage moved from its original position. Select it again in the original.");
      return { ...materialQuoteAddress(ref), name: item.name, text: points.slice(ref.start, ref.end).join('') };
    } finally { signal?.removeEventListener('abort', abort); this.active.delete(controller); }
  }
  /** A notebook bookmark keeps only an address. Its exact original is readable
   * locally while a draft or kept note owns it; neither path stores a bearer
   * ticket in the note or admits the file to model reads. */
  async nativeBookmarkQuote(raw: MaterialQuoteReference): Promise<MaterialQuote> {
    const reference = materialQuoteReferenceSchema.parse(raw);
    const record = this.records.get(reference.resourceId);
    if (record?.saved && !record.binding && this.notebookOwns(record))
      return this.nativeQuote({ target: { kind: 'saved', resourceId: reference.resourceId }, quote: reference });
    const draftOwns = () => !!record && !record.binding && (!!record.draftIds?.size || this.persistedDraftOwns(record));
    if (!draftOwns()) return this.nativeQuote({ target: { kind: 'saved', resourceId: reference.resourceId }, quote: reference });
    const quote = await this.nativeQuote({ target: { kind: 'pending', reference: record!.reference }, quote: reference });
    // Reading a PDF crosses an async boundary. A discarded draft must not
    // deliver its old excerpt even when another preparation still holds bytes.
    if (!record!.binding && !draftOwns()) throw new HarnessError('material_unavailable', "The original draft was put away. Bring this material again.");
    return quote;
  }
  private assertQuoteMetadata(record: Resource, ref: MaterialQuoteReference) {
    if (record.reference.resourceId !== ref.resourceId || record.reference.sha256 !== ref.sha256
      || (record.reference.mediaType === 'application/pdf' ? ref.page === undefined : ref.page !== undefined))
      throw new HarnessError('material_quote_changed', "This quote differs from the original file. Select it again in the original.");
  }
  /** A text bookmark may not widen a problem that was observed only through
   * a page crop. Whole intersecting PDF runs must fit that original crop;
   * character geometry is never guessed from the reader's DOM. */
  async quoteWithinCrop(scope: ScopeHandle, raw: MaterialQuoteReference, rawCrop: unknown, signal: AbortSignal) {
    const reference = materialQuoteReferenceSchema.parse(raw), crop = materialCropSchema.parse(rawCrop);
    const { record, bytes } = this.resolve(scope, reference.resourceId);
    this.assertQuoteMetadata(record, reference);
    if (record.reference.mediaType !== 'application/pdf') return false;
    const { parsePdf } = await import('./pdf');
    const parsed = await parsePdf(bytes, { operation: 'read', page: reference.page }, signal);
    signal.throwIfAborted(); this.resolve(scope, reference.resourceId);
    let position = 0, found = false;
    for (const item of parsed.items || []) {
      const start = position, end = start + Array.from(item.text).length;
      position = end + (item.hasEOL ? 1 : 0);
      if (start >= reference.end || end <= reference.start) continue;
      found = true;
      const [left, top, right, bottom] = item.bbox;
      if (left < crop.x || top < crop.y || right > crop.x + crop.width || bottom > crop.y + crop.height) return false;
    }
    return found && reference.end <= Array.from(parsed.text || '').length;
  }
  private keepNotebookOriginal(reference: MaterialQuoteReference, createNote: () => NoteMutation): NoteMutation {
    const record = this.records.get(reference.resourceId);
    if (!record) throw new HarnessError('material_unavailable', "The original file was put away. Your writing remains; bring the file again.");
    this.nativeRecord(record.binding || record.saved && this.notebookOwns(record)
      ? { kind: 'saved', resourceId: record.reference.resourceId } : { kind: 'pending', reference: record.reference });
    this.assertQuoteMetadata(record, reference); this.nativeBytes(record);
    const previouslySaved = !!record.saved, previousNotebookOriginal = record.notebookOriginal;
    if (!record.binding && !record.saved) this.assertPendingPersistable(record.reference);
    try {
      // File bytes must be durable before a successful note receipt. The
      // original Resource and notebook row are the only owners; no synthetic
      // message, new resource, key or model grant is created for this keep.
      return this.repo.write(() => {
        if (!record.binding) record.notebookOriginal = true;
        if (!record.saved || record.notebookOriginal !== previousNotebookOriginal) this.save(record);
        return createNote();
      });
    } catch (error) {
      record.notebookOriginal = previousNotebookOriginal;
      // A failed notebook transaction must not turn a volatile attachment
      // into a hidden durable file. Keep its live bytes and original draft.
      if (!previouslySaved && !this.notebookOwns(record, true) && !this.persistedDraftOwns(record)) {
        record.saved = false;
        for (const extension of ['.bin', '.json']) if (fs.existsSync(this.file(reference.resourceId, extension))) fs.unlinkSync(this.file(reference.resourceId, extension));
      } else if (previouslySaved && !previousNotebookOriginal) {
        this.save(record);
      }
      throw error;
    }
  }
  /** The native bookmark caller has just re-read this exact address and
   * checked its private presentation boundary. Keep the commit synchronous so
   * a second asynchronous PDF read cannot outlive that final check. */
  retainNotebookOriginal(reference: MaterialQuoteReference, createNote: () => NoteMutation): NoteMutation {
    return this.keepNotebookOriginal(reference, createNote);
  }
  /** A kept excerpt has its own editable note. Only explicit retainOriginal
   * also keeps the same native original across ordinary draft removal. */
  async nativeKeepQuote(raw: unknown, notes: NotesService, beforeCommit?: () => void) {
    const input = materialKeepQuoteInputSchema.parse(raw);
    const quote = await this.nativeQuote({ target: input.target, quote: input.quote });
    beforeCommit?.();
    const annotation = input.annotation?.trim();
    const createNote = () => notes.create({ title: Array.from(`${quote.name}${quote.page ? ` · page ${quote.page}` : ''}`).slice(0, 160).join(''), body: quote.text + (annotation ? `\n\n${annotation}` : '') }, undefined,
      { via: 'notebook', material: { ...materialQuoteAddress(quote), name: quote.name } });
    return input.retainOriginal ? this.keepNotebookOriginal(quote, createNote) : createNote();
  }
  async nativeMoveNote(raw: unknown, notes: NotesService, beforeCommit?: () => void) {
    const input = materialMoveNoteInputSchema.parse(raw);
    if (input.from.resourceId !== input.quote.resourceId || input.from.sha256 !== input.quote.sha256)
      throw new HarnessError('material_note_source', "Keep the note in the same original file.");
    // Both ends are read through the original owner, including saved/pending
    // adoption, file hash, page-local Unicode range, and current source scope.
    await this.nativeQuote({ target: input.target, quote: input.from });
    const quote = await this.nativeQuote({ target: input.target, quote: input.quote });
    beforeCommit?.();
    return notes.moveMaterialSource(input.noteId, input.expectedRevision, input.from,
      { ...materialQuoteAddress(quote), name: quote.name });
  }
  /** Native notebook projection only. A note's retained source address cannot
   * reopen a withdrawn material or grant the model new source access. */
  nativeNotes(raw: unknown, notes: NotesService): MaterialNotes {
    const input = materialNotesInputSchema.parse(raw), record = this.nativeRecord(input.target);
    if (record.reference.mediaType !== 'application/pdf' && input.page !== undefined)
      throw new HarnessError('material_page', "This material has no PDF page number.");
    const result = notes.forMaterial(record.reference.resourceId, record.reference.sha256, input.page);
    this.nativeRecord(input.target);
    return result;
  }
  /** Body-free identity for ingress interpretation. The actual read still
   * happens after this turn's source and transmission controls are applied. */
  workspaceIdentity(scope: ScopeHandle, ref: { resourceId: string; sha256: string; page?: number; offset?: number }) {
    const { record } = this.resolveMetadata(scope, ref.resourceId);
    if (record.reference.sha256 !== ref.sha256 || ref.page !== undefined
      && (record.reference.mediaType !== 'application/pdf' || ref.page < 1 || ref.page > MATERIAL_LIMITS.pages))
      throw new HarnessError('material_reference_changed', "The material revision or page changed. Reconnect from the original file.");
    const reference = { resourceId: record.reference.resourceId, sha256: record.reference.sha256,
      ...(ref.page === undefined ? {} : { page: ref.page }), ...(ref.offset === undefined ? {} : { offset: ref.offset }) };
    return { reference, name: record.reference.name, mediaType: record.reference.mediaType, source: this.source(record),
      bodyProvided: false, read: { tool: 'look_up', arguments: { source: 'capability', capability: 'materials.read', arguments: {
        resourceId: reference.resourceId, ...(reference.page === undefined ? {} : { page: reference.page }),
        offset: reference.offset || 0, limit: 4000 } } },
      meaning: "This is the current file's original address and position. Open its body through read." };
  }
  quoteIdentity(scope: ScopeHandle, raw: MaterialQuoteReference) {
    const ref = materialQuoteReferenceSchema.parse(raw), { record } = this.resolveMetadata(scope, ref.resourceId);
    this.assertQuoteMetadata(record, ref);
    return { origin: 'external_document' as const, reference: ref };
  }
  async resolveQuote(scope: ScopeHandle, raw: MaterialQuoteReference, signal: AbortSignal) {
    const ref = materialQuoteReferenceSchema.parse(raw);
    this.quoteIdentity(scope, ref);
    const result = await this.invoke(scope, 'materials.read', { resourceId: ref.resourceId,
      ...(ref.page === undefined ? {} : { page: ref.page }), offset: ref.start, limit: ref.end - ref.start }, signal);
    this.quoteIdentity(scope, ref);
    if (result.data?.coverage?.start !== ref.start || result.data?.coverage?.end !== ref.end
      || typeof result.data.text !== 'string' || !result.data.text.trim())
      throw new HarnessError('material_quote_range', "This original passage moved. Select it again in the original.");
    const { record } = this.resolveMetadata(scope, ref.resourceId);
    return { quote: { ...materialQuoteAddress(ref), name: record.reference.name, text: result.data.text } as MaterialQuote, result };
  }
  /** Returned bytes stay in main and go only to an owner-selected Save dialog. */
  nativeOriginal(target: MaterialTarget) {
    const record = this.nativeRecord(target);
    return { item: this.nativeItem(record), bytes: this.nativeBytes(record) };
  }
  async invoke(scope: ScopeHandle, operation: string, args: any, signal: AbortSignal,
    onVisualPrepared?: (id: string) => void): Promise<any> {
    signal.throwIfAborted();
    if (!['materials.describe', 'materials.read', 'materials.find', 'materials.table', 'materials.observe'].includes(operation)) throw new HarnessError('material_operation_unsupported', "This file-reading operation is not connected.");
    if (operation === 'materials.find') args = findInput.parse(args);
    if (!args.resourceId) {
      if (operation !== 'materials.describe') throw new HarnessError('material_required', "Select the original file from the file catalog first.");
      return this.discover(scope, args, signal);
    }
    const { record, bytes } = this.resolve(scope, args.resourceId), ref = record.reference;
    if (operation === 'materials.describe' && ref.mediaType !== 'application/pdf') {
      const decoded = decode(bytes); return this.result(record, { resourceId: ref.resourceId, mediaType: ref.mediaType, byteLength: bytes.length,
        units: [{ kind: 'text', id: 'original', totalCodePoints: Array.from(decoded.text).length }], encoding: decoded.encoding, extraction: 'decoded_original_preserved_newlines', originalContentsRead: false }, true);
    }
    if (ref.mediaType !== 'application/pdf') {
      if (operation === 'materials.find') return this.find(record, decode(bytes).text, args);
      if (operation !== 'materials.read') throw new HarnessError('material_operation_unsupported', "This text resource supports reading original ranges. Page images and PDF tables do not apply.");
      const decoded = decode(bytes), points = Array.from(decoded.text), offset = args.offset || 0, end = Math.min(points.length, offset + (args.limit || 8000));
      if (offset > points.length) throw new HarnessError('material_range', "The passage offset is past the original text.");
      const text = points.slice(offset, end).join('');
      if (hasCredentials(text)) throw new HarnessError('material_credentials', "This material contains possible credentials and was not supplied to a cloud model.");
      return this.result(record, { resourceId: ref.resourceId, text, encoding: decoded.encoding, extraction: 'decoded_original_preserved_newlines',
        locator: { kind: 'file', artifactId: ref.resourceId, version: 1, paragraphId: `cp-${offset}-${end}` },
        coverage: { unit: 'unicode_code_point', start: offset, end, total: points.length, complete: offset === 0 && end === points.length }, nextOffset: end < points.length ? end : null }, offset === 0 && end === points.length, undefined, true);
    }
    const controller = new AbortController(); this.active.add(controller);
    try {
      const { parsePdf } = await import('./pdf');
      const parsed: any = await parsePdf(bytes, { operation: operation === 'materials.describe' ? 'describe' : ['materials.read', 'materials.find'].includes(operation) ? 'read' : operation === 'materials.table' ? 'table' : 'render', page: args.page || 1, crop: args.crop }, AbortSignal.any([signal, controller.signal]));
      this.resolve(scope, args.resourceId); signal.throwIfAborted();
      if (operation === 'materials.describe') return this.result(record, { resourceId: ref.resourceId, mediaType: ref.mediaType, byteLength: bytes.length, pageCount: parsed.pageCount, originalContentsRead: false }, false);
      if (operation === 'materials.find') return this.find(record, parsed.text || '', args, parsed.page, parsed.pageCount, parsed.needsVisual);
      if (operation === 'materials.read') {
        const points = Array.from(parsed.text as string), offset = args.offset || 0, end = Math.min(points.length, offset + (args.limit || 8000));
        if (offset > points.length) throw new HarnessError('material_range', "The passage offset is past this page's original text layer.");
        const text = points.slice(offset, end).join('');
        if (hasCredentials(text)) throw new HarnessError('material_credentials', "This page text contains possible credentials and was not supplied to a cloud model.");
        return this.result(record, { resourceId: ref.resourceId, page: parsed.page, pageCount: parsed.pageCount, text, extraction: 'pdf_text_layer', needsVisual: parsed.needsVisual,
          locator: { kind: 'file', artifactId: ref.resourceId, version: 1, page: parsed.page, paragraphId: `cp-${offset}-${end}` },
          coverage: { unit: 'unicode_code_point_within_page', start: offset, end, total: points.length, textLayerComplete: offset === 0 && end === points.length,
            pageComplete: !parsed.needsVisual && offset === 0 && end === points.length, complete: false },
          nextOffset: end < points.length ? end : null, nextPage: parsed.page < parsed.pageCount ? parsed.page + 1 : null }, false,
          parsed.needsVisual ? points.length === 0 ? "This page's text layer yielded no body text. Use " + (record.publicSource ? 'research.read（view=image）' : 'materials.observe') + " to observe the actual page."
            : "The listed text was read. Observe this page's graphics and images with " + (record.publicSource ? 'research.read（view=image）' : 'materials.observe') + "." : undefined,
          // Completion of this requested bounded text slice is separate from
          // PDF/image/document coverage. Empty scanned pages need a visual read.
          points.length > 0 && (end > offset || offset === points.length));
      }
      if (operation === 'materials.table') return this.result(record, { resourceId: ref.resourceId, ...parsed, locator: { kind: 'file', artifactId: ref.resourceId, version: 1, page: parsed.page } }, false);
      const image: VisualObservation = { id: randomUUID(), image: parsed.image, hash: sha(Buffer.from(parsed.image.dataUrl.split(',')[1], 'base64')),
        version: `${ref.sha256}:${ref.version}:p${parsed.page}:${parsed.rendererVersion}:${JSON.stringify(args.crop || null)}`,
        sourceId: record.publicSource ? 'web:public' : 'file:' + record.binding!.eventId, source: { ...this.source(record), page: parsed.page, rendererVersion: parsed.rendererVersion },
        crop: args.crop || null, scopeId: scope.id, epoch: this.policy.validate(scope).privacyEpoch };
      this.images.set(image.id, image); this.imageScopes.set(image.id, scope);
      onVisualPrepared?.(image.id);
      this.trimVisuals(image.id);
      return this.result(record, { resourceId: ref.resourceId, page: parsed.page, pageCount: parsed.pageCount, observationId: image.id, hash: image.hash, version: image.version,
        source: image.source, crop: image.crop, transport: 'prepared_for_next_model_request', meaning: "The actual page image is prepared for the next request. Continue using both pixels and text." }, false);
    } finally { this.active.delete(controller); }
  }
  visual(scope: ScopeHandle, id: string) {
    const image = this.images.get(id), capturedScope = this.imageScopes.get(id), allowed = this.policy.validate(scope);
    if (!image || !capturedScope || image.epoch !== allowed.privacyEpoch) throw new HarnessError('image_observation_missing', "There is no actual file-page observation in the current scope. Read it again.");
    const captured = this.policy.validate(capturedScope);
    if (['principalId', 'workspaceId', 'subjectId', 'worldId', 'audience'].some(key => (allowed as any)[key] !== (captured as any)[key]) || !captured.purposes.every(purpose => allowed.purposes.includes(purpose)))
      throw new HarnessError('image_scope', "File-page images cannot cross subject, purpose or disclosure scope.");
    const resolved = this.resolve(capturedScope, (image.source as any).resourceId);
    if (resolved.record.publicSource) { if (!allowed.sources.includes('web:public')) throw new HarnessError('image_scope', "The current scope admits no public file source."); }
    else this.resolve(scope, (image.source as any).resourceId);
    return image;
  }
  retainVisual(scope: ScopeHandle, id: string, runId: string): VisualObservation {
    const image = this.visual(scope, id);
    const holders = this.visualHolders.get(id) || new Set<string>();
    holders.add(runId); this.visualHolders.set(id, holders);
    return image;
  }
  releaseVisuals(runId: string) {
    for (const [id, holders] of this.visualHolders) {
      holders.delete(runId);
      if (!holders.size) this.visualHolders.delete(id);
    }
    this.trimVisuals(); this.trimPublicRecords();
  }
  publicPdf(scope: ScopeHandle, bytes: Buffer, url: string, name: string, network?: { httpStatus: number; contentType: string }) {
    const allowed = this.policy.require(scope, 'evidence:read');
    if (!allowed.sources.includes('web:public')) throw new HarnessError('material_source_forbidden', "The public file source is outside the current scope.");
    if (bytes.length > 8_000_000) throw new HarnessError('material_size', "The public PDF exceeds the 8 MB reading limit.");
    const hash = sha(bytes);
    const cached = [...this.records.values()].find(record => record.publicSource?.scopeId === scope.id && record.publicSource.url === url && record.reference.sha256 === hash && record.epoch === allowed.privacyEpoch);
    if (cached) { this.records.delete(cached.reference.resourceId); this.records.set(cached.reference.resourceId, cached); return cached.reference.resourceId; }
    const staged = this.stageBytes(name.toLowerCase().endsWith('.pdf') ? name : name + '.pdf', bytes, true), record = this.records.get(staged.resource!.resourceId)!;
    record.publicSource = { url, sourceId: 'web:public', scopeId: scope.id, fetchedAt: this.repo.clock.now(), ...network }; record.epoch = allowed.privacyEpoch;
    this.trimPublicRecords(record.reference.resourceId);
    return record.reference.resourceId;
  }
  /** A local discovery contract cannot relabel public evidence as current user input. */
  invokeLocal(scope: ScopeHandle, operation: string, args: any, signal: AbortSignal,
    onVisualPrepared?: (id: string) => void) {
    if (args.resourceId && this.records.get(args.resourceId)?.publicSource)
      return Promise.resolve({ status: 'unsupported', sourceId: 'current', simulated: false, reason: "Continue public PDF pages, tables or images through research.read. This entry reads only supplied local files.",
        data: { resourceId: args.resourceId, useCapability: 'research.read' }, coverage: { complete: false, scope: 'local_material_contract' } });
    return this.invoke(scope, operation, args, signal, onVisualPrepared);
  }
  invokePublic(scope: ScopeHandle, operation: string, args: any, signal: AbortSignal,
    onVisualPrepared?: (id: string) => void) {
    if (!args.resourceId || !this.records.get(args.resourceId)?.publicSource)
      throw new HarnessError('material_source_forbidden', "A public-file entry cannot read or relabel private local material.");
    return this.invoke(scope, operation, args, signal, onVisualPrepared);
  }
}

export function registerMaterials(broker: CapabilityBroker, materials: MaterialService) {
  const base = { version: '1', output: z.record(z.string(), z.json()), effect: 'read' as const, requiredScopes: ['evidence:read'],
    subjects: ['self', 'other', 'fictional'] as ('self' | 'other' | 'fictional')[], worlds: ['real', 'scenario'] as ('real' | 'scenario')[], timeoutMs: 25000, maxBytes: 100000,
    supportsIdempotency: false, supportsInspect: false, supportsCancel: false };
  broker.register({ manifest: { id: 'material-reader', sourceId: 'current', version: '1', trust: 'bundled_reviewed', egressHosts: [], publicRead: false,
    platforms: ['*'], simulated: false, offline: 'read_cache', license: 'Project-owned resource host; PDF.js Apache-2.0 and canvas MIT notices accompany the runtime', capabilities: [
      { ...base, version: '2', name: 'materials.describe', displayName: "Find supplied files", description: "Find currently available file addresses by filename query, mediaType and receivedFrom/receivedBefore. Empty query browses the catalog; nextCursor continues. resourceId describes one file's type, page count and text size. Open returned addresses to read the body.", input: discoveryInput },
      { ...base, name: 'materials.read', displayName: "Read original file text", description: "Open original content by file ID, PDF page and Unicode text range. Results preserve provenance, file SHA, revision and actual reading range. nextOffset and nextPage continue reading. Use materials.observe for actual scanned pages and charts.", input: z.object({ resourceId, page: z.number().int().min(1).max(MATERIAL_LIMITS.pages).optional(), offset: z.number().int().min(0).max(MATERIAL_LIMITS.textCodePoints).default(0), limit: z.number().int().min(1).max(MATERIAL_LIMITS.readCodePoints).default(8000) }).strict() },
      { ...base, name: 'materials.find', displayName: "Find exact text in material", description: "Find exact query text in a text file or selected PDF page, returning Unicode coordinates, context and reading addresses. nextOffset continues the range; nextPage searches other pages. Try alternate wording for related meaning; observe the page for image content.", input: findInput },
      { ...base, name: 'materials.table', displayName: "Read file tables", description: "Read extracted PDF table and row/column candidates on a selected page, preserving page, coordinates and extraction status. Observe complex layouts or missing tables with materials.observe.", input: z.object({ resourceId, page: z.number().int().min(1).max(MATERIAL_LIMITS.pages).default(1) }).strict() },
      { ...base, name: 'materials.observe', displayName: "Observe this file page", description: "Open an actual JPEG render of a PDF page, optionally cropped with normalized 0..1 coordinates. The image remains bound to original file SHA, page and revision; reopen the same address for another observation.", input: z.object({ resourceId, page: z.number().int().min(1).max(MATERIAL_LIMITS.pages).default(1), crop: materialCropSchema.optional() }).strict() },
    ] }, invoke: (name, args, context) => materials.invokeLocal(context.scope, name, args, context.signal, context.onVisualPrepared) }, { reviewed: true, source: 'host-owned immutable document snapshots' });
}
