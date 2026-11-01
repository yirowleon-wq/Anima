import * as z from 'zod';
import type { Store } from '../store';
import { HarnessError, objectId, assistantWorkSourceSchema, interactiveProgramSourceSchema,
  type AssistantWorkSource, type InteractiveProgramSource, type ContextReceipt, type EvidenceEvent, type ScopeHandle } from '../../shared/harness';
import type { ReplySourceDisplay, ReplySourcePage, ReplySourceRange } from '../../shared/types';
import { materialCropSchema, materialReferenceSchema, type MaterialItem } from '../../shared/materials';
import { noteSourceProofSchema, type NoteSourceProof } from '../../shared/notes-source';
import { readEvidenceImage } from './evidence-images';
import { programReferenceIdentity, programSourcesReadable } from './interactive-program-sources';
import { programDocumentTitle } from './keep';

const inputSchema = z.object({ sessionId: objectId, messageId: objectId,
  offset: z.number().int().nonnegative().default(0), limit: z.number().int().min(1).max(24).default(12) }).strict();
const natural = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;

function materialRanges(receipt: ContextReceipt, event: EvidenceEvent, item: MaterialItem): ReplySourceDisplay['reading'] {
  if (!Array.isArray(receipt.materialReads)) return { state: 'unknown', ranges: [] };
  const ranges: ReplySourceRange[] = [];
  for (const read of receipt.materialReads) {
    if (read.sourceEventId !== event.id || read.parentEventId !== event.parentEventId || read.sourceSessionId !== event.sessionId
      || read.sourceContentVersion !== event.contentVersion || read.resourceId !== item.resourceId
      || read.sha256 !== item.sha256 || read.version !== 1) continue;
    const pdf = item.mediaType === 'application/pdf';
    if (pdf ? !natural(read.page) || read.page < 1 || read.page > 200 : read.page !== undefined) continue;
    if (read.capability === 'materials.observe' && pdf) {
      const crop = read.crop === undefined ? undefined : materialCropSchema.safeParse(read.crop);
      if (crop && !crop.success) continue;
      ranges.push({ unit: 'page_image', page: read.page, complete: read.complete === true,
        ...(crop?.success ? { crop: crop.data } : {}) });
    } else if (read.capability === 'materials.read' && natural(read.start) && natural(read.end) && natural(read.total)
      && read.end > read.start && read.end <= read.total) {
      ranges.push({ unit: pdf ? 'page_unicode_code_point' : 'unicode_code_point', ...(pdf ? { page: read.page } : {}),
        start: read.start, end: read.end, total: read.total, complete: read.complete === true });
    }
  }
  const unique = [...new Map(ranges.map(range => [JSON.stringify(range), range])).values()];
  return { state: unique.some(range => range.unit !== 'page_image') ? 'text_ranges'
    : unique.length ? 'page_images' : 'provided', ranges: unique };
}

function materialStatus(reading: ReplySourceDisplay['reading']) {
  const pages = [...new Set(reading.ranges.flatMap(range => range.page ? [range.page] : []))];
  if (reading.state === 'text_ranges') return pages.length ? `Text fragment from page ${pages.join('、')}` : "Text fragment from the file";
  if (reading.state === 'page_images') return reading.ranges.some(range => range.crop) ? "Crop of the original page" : "Original page image";
  return reading.state === 'unknown' ? "The original file remains; the exact read range cannot yet be verified" : "Material supplied this round without a body-read range yet";
}

function materialUnavailable(error: HarnessError) {
  return error.code === 'material_integrity' ? "The original file content changed. Add the intended file again."
    : error.code === 'material_source_forbidden' ? "The original text's permitted use changed. Select it again from the original file."
      : "The original file is not here. Add it again to continue.";
}

function unavailableOwner(id: string, kind: ReplySourceDisplay['kind'], title: string, reason: string): ReplySourceDisplay {
  return { id, kind, title, availability: 'unavailable', reading: { state: 'unknown', ranges: [] },
    statusText: "Cannot open now", unavailableReason: reason };
}

function notebookSource(store: Store, scope: ScopeHandle, id: string, proofs: NoteSourceProof[]): ReplySourceDisplay {
  const missing = () => unavailableOwner(id, 'notebook', "This note page", "This note revision or range is unavailable. Open the note for its current content.");
  if (!store.kernel.noteSourcesReadable(scope, proofs)) return missing();
  const proof = proofs[0], owner = store.kernel.identity;
  const row = store.db.prepare(`SELECT json_extract(v.payload,'$.title') AS title,
    note_codepoint_length(json_extract(v.payload,'$.body')) AS total FROM h_notes n JOIN h_note_versions v ON v.note_id=n.id
    WHERE n.id=? AND v.revision=? AND n.owner=? AND n.workspace=?`).get(proof.id, proof.revision, owner.principalId, owner.workspaceId);
  if (!row) return missing();
  const ranges: ReplySourceRange[] = proofs.filter(value => value.end > value.start).map(value => ({ unit: 'unicode_code_point',
    start: value.start, end: value.end, total: Number(row.total), complete: value.start === 0 && value.end === row.total }));
  return { id, kind: 'notebook', title: typeof row.title === 'string' && row.title.trim() ? row.title : "Untitled note",
    availability: 'available', reading: { state: ranges.length ? 'text_ranges' : 'unknown', ranges },
    statusText: ranges.length ? `Text fragment in revision ${proof.revision}` : `Note address at revision ${proof.revision}`,
    address: { kind: 'notebook', noteId: proof.id, revision: proof.revision, sha256: proof.sha256,
      start: ranges[0]?.start ?? proof.start, end: ranges[0]?.end ?? proof.end } };
}

function programSource(store: Store, scope: ScopeHandle, receipt: ContextReceipt, id: string, source: InteractiveProgramSource): ReplySourceDisplay {
  const runtime = store.runtime, missing = () => unavailableOwner(id, 'interactive', "This interactive creation",
    "The original work or a source cannot currently be opened. Return to the original conversation for current content.");
  const identity = programReferenceIdentity(runtime, scope, source, undefined, { localDisplay: true });
  if (!identity || !programSourcesReadable(runtime, scope, [source], undefined, true)) return missing();
  const row = store.db.prepare(`SELECT json_extract(v.value,'$.program.hash') AS hash,
    json_extract(v.value,'$.program.sourceDsl') AS source_dsl,json_extract(v.value,'$.program.dsl') AS dsl,
    json_extract(v.value,'$.program.nodeIds[0]') AS node_id FROM messages m,json_each(m.payload,'$.views') v
    WHERE m.id=? AND m.session_id=? AND json_extract(v.value,'$.id')=? AND json_extract(v.value,'$.revision')=?
    AND json_extract(v.value,'$.libraryVersion')=2 LIMIT 1`).get(source.messageId, identity.sessionId, source.programId, source.revision);
  if (!row || typeof row.hash !== 'string' || !/^[a-f0-9]{64}$/.test(row.hash)) return missing();
  const ranges: ReplySourceRange[] = [];
  for (const read of receipt.interactiveProgramReads || []) {
    const coverage = read.coverage;
    if (read.delivery !== 'delivered_to_model' || read.source.messageId !== source.messageId || read.source.programId !== source.programId
      || read.source.revision !== source.revision || !natural(coverage.offset) || !natural(coverage.end) || !natural(coverage.total)
      || coverage.end <= coverage.offset || coverage.end > coverage.total) continue;
    // sourceBodiesProvided concerns bound SourceSlot originals, not DSL text.
    // A literal search's scanned extent also is not a delivered DSL range.
    if (read.mode === 'source' && (!natural(read.counts.sourceCodePoints) || read.counts.sourceCodePoints === 0
      || read.counts.sourceCodePoints !== coverage.end - coverage.offset)) continue;
    ranges.push({ unit: read.mode === 'source' ? 'program_source' : read.mode === 'states' ? 'program_states' : 'program_outline',
      start: coverage.offset, end: coverage.end, total: coverage.total, complete: coverage.complete === true });
  }
  return { id, kind: 'interactive', title: programDocumentTitle(String(row.source_dsl || row.dsl || '')), availability: 'available',
    reading: { state: ranges.length ? 'program_reads' : 'unknown', ranges },
    statusText: ranges.length ? "This work retains an exact read range" : "Original-work entry",
    // The hash comes from the qualified original view, never invented from a receipt.
    address: { kind: 'interactive', sessionId: identity.sessionId, ...source, programHash: row.hash,
      ...(typeof row.node_id === 'string' ? { nodeId: row.node_id } : {}) } };
}

function sceneSource(store: Store, scope: ScopeHandle, id: string, source: AssistantWorkSource): ReplySourceDisplay {
  const repo = store.kernel, missing = () => unavailableOwner(id, 'scene', "The shared work then",
    "The original shared page or a source is unavailable. Return to the original conversation for current content.");
  const identity = repo.assistantHistoricalWorkIdentity(scope, source) || repo.assistantCoWorkIdentity(scope, source).length;
  if (!identity || !repo.assistantWorkSourcesReadable(scope, [source], { checked: new Map(), localDisplay: true })) return missing();
  const row = store.db.prepare(`SELECT m.session_id AS session_id,
    json_extract(s.value,'$.matter.title') AS matter_title,json_extract(s.value,'$.view.title') AS view_title
    FROM messages m,json_each(m.payload,'$.scenes') s WHERE m.id=? AND json_extract(s.value,'$.id')=?
    AND json_extract(s.value,'$.revision')=? LIMIT 1`).get(source.messageId, source.sceneId, source.sceneRevision);
  if (!row) return missing();
  return { id, kind: 'scene', title: String(row.matter_title || row.view_title || "The shared work then"), availability: 'available',
    reading: { state: 'unknown', ranges: [] }, statusText: "Original shared-page entry",
    address: { kind: 'scene', sessionId: String(row.session_id), messageId: source.messageId,
      sceneId: source.sceneId, revision: source.sceneRevision } };
}

type SourceCandidate = { kind: 'evidence'; id: string; eventId: string }
  | { kind: 'notebook'; id: string; proofs: NoteSourceProof[] }
  | { kind: 'interactive'; id: string; source: InteractiveProgramSource }
  | { kind: 'scene'; id: string; source: AssistantWorkSource };

/** A view of existing owners, with bounded original-utterance titles. It is
 * not a new source/body store or a model tool. */
export function replySources(store: Store, raw: unknown): ReplySourcePage {
  const input = inputSchema.parse(raw), runtime = store.runtime, repo = store.kernel;
  if (runtime.presentation.public) throw new HarnessError('source_private', "Return to your private conversation before opening the original.");
  const handle = runtime.policy.hostScope({ infer: false }), scope = runtime.policy.validate(handle);
  const boundary = runtime.policy.sourceBoundary;
  const row = store.db.prepare(`SELECT json_extract(payload,'$.contextReceipt') AS receipt,json_extract(payload,'$.status') AS status FROM messages
    WHERE id=? AND session_id=? AND role='assistant'`).get(input.messageId, input.sessionId);
  const receipt = row?.receipt ? JSON.parse(String(row.receipt)) as ContextReceipt : undefined;
  const ids = [...new Set(Array.isArray(receipt?.providedEvidenceIds) ? receipt.providedEvidenceIds.filter(id => typeof id === 'string') : [])];
  const candidates: SourceCandidate[] = ids.map(eventId => ({ kind: 'evidence', id: eventId, eventId }));
  const notes = new Map<string, NoteSourceProof[]>();
  for (const raw of receipt?.noteSources || []) {
    const parsed = noteSourceProofSchema.safeParse(raw); if (!parsed.success) continue;
    const proof = parsed.data, key = `notebook:${proof.id}@${proof.revision}:${proof.sha256}`;
    notes.set(key, [...(notes.get(key) || []), proof]);
  }
  for (const [id, proofs] of notes) candidates.push({ kind: 'notebook', id, proofs });
  const programs = new Map<string, InteractiveProgramSource>();
  for (const raw of [...(receipt?.interactiveProgramSources || []), ...(receipt?.interactiveProgramReads || []).map(read => read.source)]) {
    const parsed = interactiveProgramSourceSchema.safeParse(raw); if (!parsed.success) continue;
    const source = parsed.data; programs.set(`interactive:${source.messageId}/${source.programId}@${source.revision}`, source);
  }
  for (const [id, source] of programs) candidates.push({ kind: 'interactive', id, source });
  const scenes = new Map<string, AssistantWorkSource>();
  for (const raw of receipt?.assistantWorkSources || []) {
    const parsed = assistantWorkSourceSchema.safeParse(raw); if (!parsed.success) continue;
    const source = parsed.data; scenes.set(`scene:${source.messageId}/${source.sceneId}@${source.sceneRevision}`, source);
  }
  for (const [id, source] of scenes) candidates.push({ kind: 'scene', id, source });
  const unavailable = (eventId: string, reason = "This original changed or is outside the readable scope. Select it again from its original position."): ReplySourceDisplay => ({
    id: eventId, eventId, kind: 'other', title: "This source", availability: 'unavailable', reading: { state: 'unknown', ranges: [] },
    statusText: "Cannot open now", unavailableReason: reason });
  const projectEvidence = (eventId: string): ReplySourceDisplay => {
    const event = repo.evidence(handle, eventId);
    const version = receipt?.providedObjectVersions?.find(value => value.kind === 'evidence' && value.id === eventId)?.revision;
    if (!event || !runtime.policy.can(handle, 'evidence:read') || event.status !== 'active'
      || version !== undefined && version !== event.contentVersion || repo.hasFence(event.id, event.sourceId)
      || repo.sourceRestrictions(handle, event.id).length || repo.sourceLineageRestricted(event)
      || event.sourceId === 'profile:self' && !runtime.policy.can(handle, 'memory:read')) return unavailable(eventId);
    const originalMessage = () => {
      if (!event.parentEventId || !event.sessionId) return;
      const parent = repo.evidence(handle, event.parentEventId);
      if (!parent || !['active', 'redacted'].includes(parent.status) || parent.speaker !== 'user'
        || parent.kind !== 'user_message' || parent.sessionId !== event.sessionId || repo.hasFence(parent.id, parent.sourceId)
        || repo.sourceRestrictions(handle, parent.id).length || repo.sourceLineageRestricted(parent)) return;
      const row = store.db.prepare("SELECT id FROM messages WHERE id=? AND session_id=? AND role='user'").get(parent.id, parent.sessionId);
      return row ? { kind: 'conversation' as const, sessionId: parent.sessionId!, messageId: parent.id, contentVersion: parent.contentVersion } : undefined;
    };
    if (event.kind === 'file_import') {
      if (event.locator?.kind !== 'file' || !materialReferenceSchema.shape.resourceId.safeParse(event.locator.artifactId).success
        || !event.sessionId || !event.parentEventId) {
        const recovery = originalMessage();
        return { ...unavailable(eventId, "This source has no directly openable original file. Check the original message or add the file again."),
          kind: 'document' as const, title: event.fileName || "Original material", ...(recovery ? { address: recovery } : {}) };
      }
      try {
        const { item, target } = runtime.materials.nativeReplySource({ resourceId: event.locator.artifactId,
          sourceEventId: event.id, parentEventId: event.parentEventId, sessionId: event.sessionId, contentVersion: event.contentVersion });
        const reading = materialRanges(receipt!, event, item), first = reading.ranges[0];
        return { id: eventId, eventId, kind: 'document' as const, title: item.name, availability: 'available' as const, reading,
          statusText: materialStatus(reading), address: { kind: 'material' as const, target, resourceId: item.resourceId, sha256: item.sha256,
            ...(first?.page ? { page: first.page } : {}), ...(first?.start === undefined ? {} : { start: first.start, end: first.end }) } };
      } catch (error) {
        if (!(error instanceof HarnessError)) throw error;
        const recovery = originalMessage();
        return { ...unavailable(eventId, materialUnavailable(error)), kind: 'document' as const, title: event.fileName || "Original material",
          ...(recovery ? { address: recovery } : {}) };
      }
    }
    if (event.imageSource && event.sessionId) {
      try { readEvidenceImage(repo, handle, event.id, event.contentVersion); }
      catch (error) {
        if (error instanceof HarnessError || error instanceof z.ZodError)
          return unavailable(eventId, "The original image is outside the readable scope. Add the image again.");
        throw error;
      }
      const parentId = event.parentEventId || event.id;
      const attachment = event.parentEventId ? store.db.prepare(`SELECT json_extract(a.value,'$.attachmentId') AS attachment_id,
        json_extract(a.value,'$.name') AS name FROM messages m,json_each(m.payload,'$.attachments') a
        WHERE m.id=? AND m.session_id=? AND json_extract(a.value,'$.sourceEventId')=?`).get(parentId, event.sessionId, event.id)
        : store.db.prepare("SELECT json_extract(payload,'$.image.name') AS name FROM messages WHERE id=? AND session_id=? AND role='user'").get(parentId, event.sessionId);
      const delivered = receipt?.imageRequests?.some(read => read.accepted && read.sourceEventId === event.id
        && read.sourceContentVersion === event.contentVersion && read.sha256 === event.imageSource!.sha256);
      return { id: eventId, eventId, kind: 'image' as const, title: attachment?.name ? String(attachment.name) : "Your supplied image",
        availability: 'available' as const, reading: { state: delivered ? 'page_images' as const : 'unknown' as const,
          ranges: delivered ? [{ unit: 'page_image' as const, complete: true }] : [] },
        statusText: delivered ? "The original image was supplied this round" : "Your supplied image", address: { kind: 'image' as const,
          sessionId: event.sessionId, messageId: parentId, sourceEventId: event.id,
          ...(attachment?.attachment_id ? { attachmentId: String(attachment.attachment_id) } : {}), sha256: event.imageSource.sha256 } };
    }
    if (event.speaker === 'user' && event.kind === 'user_message' && event.sessionId) {
      const original = store.db.prepare("SELECT id FROM messages WHERE id=? AND session_id=? AND role='user'").get(event.id, event.sessionId);
      if (!original) return unavailable(eventId, "These words were not retained in the conversation. You can continue in the current conversation.");
      const points = Array.from(event.text), excerpt = points.slice(0, 24).join('');
      const title = excerpt.trim() ? `“${excerpt}”${points.length > 24 ? '…' : ''}` : "Your original conversation words";
      return { id: eventId, eventId, kind: 'conversation' as const, title, availability: 'available' as const,
        reading: { state: 'provided' as const, ranges: [] }, statusText: "Return to these original words",
        address: { kind: 'conversation' as const, sessionId: event.sessionId, messageId: event.id, contentVersion: event.contentVersion } };
    }
    return unavailable(eventId, "This record has no directly openable original. Check it through the corresponding feature.");
  };
  const items = candidates.slice(input.offset, input.offset + input.limit).map(candidate => candidate.kind === 'evidence'
    ? projectEvidence(candidate.eventId) : candidate.kind === 'notebook' ? notebookSource(store, handle, candidate.id, candidate.proofs)
      : candidate.kind === 'interactive' ? programSource(store, handle, receipt!, candidate.id, candidate.source)
        : sceneSource(store, handle, candidate.id, candidate.source));
  runtime.policy.validate(handle);
  if (boundary !== runtime.policy.sourceBoundary || runtime.presentation.public)
    throw new HarnessError('source_changed', "The source scope changed. Reopen the original.");
  return { items, nextOffset: input.offset + items.length < candidates.length ? input.offset + items.length : null, total: candidates.length,
    privacyEpoch: scope.privacyEpoch, policyRevision: scope.policyRevision, sourceBoundary: boundary,
    ...(!row ? { unavailableReason: "This reply's source addresses cannot currently be verified. Already open original files remain readable." }
      : !receipt ? { unavailableReason: row.status === 'running' ? "These sources are still being reconnected. Open them again shortly."
        : "This old reply retained no verifiable source addresses." } : {}) };
}
