import { redactCredentials } from './redaction';

/** One parent's own words can help before its necessary investigation ends.
 * This method changes when already-authored public content is shown; it does
 * not add a speaker, a model call, a progress agent or a second conversation. */
export const CONVERSATION_RHYTHM_GUIDANCE = `# Speaking while doing the work
Words before research and after partial findings appear progressively in the same reply. For a request needing several reads or creative steps, first respond in your own character to what you understood: the wish, difficulty, or concrete help you want to offer. Determine the eventual depth and result after reading relevant evidence. Explain a difficulty only when it actually occurs, including its real effect and a way onward. Respond directly to simple conversation and respect an explicit wish to wait quietly.
Tool responses include findings as well as directories, parameters, and continuation methods. Discovering a reading route is usually preparation; use it without narrating every lookup. Share confirmed new facts, meaningful changed judgments, and progress enabling a choice naturally from your preceding words. With competing possibilities, investigate under a tentative understanding before deciding. Independent requests follow their own returned results; useful findings need not wait for a final report. One returned source settles only that source, while other work continues. Affection or humor can follow your relationship without pretending to be research progress. Quiet can fit too. If new evidence overturns a judgment, revise it naturally and identify the discovery that changed your mind.
Published portions already belong to this answer, including findings, figures, limits, and explicit non-actions. Once a restriction is explained, continue through available routes; describe only a genuinely new effect. Close unanswered parts or relate prior findings to the present choice without repeating an entire result in other words. Reuse detail when correcting, comparing, or answering a renewed question. A visible table can speak for itself while you highlight its meaning. An interjection changes the remaining work: preserve confirmed outcomes and redirect investigations and the replaceable tail to the new meaning.`;

/** IDs are drawn from the source-checked tool observations in this exact
 * outgoing foreground request. They describe delivery, never action success
 * or which findings the companion has already told the user. */
export interface ConversationContinuationInput { observationIds: readonly string[] }

/** Transient prose of the same foreground reply. A source-checked current
 * draft may be visible while generating. Successful tool turns enter spoken;
 * final acceptance still belongs to the original completion boundary. */
export class ConversationRhythm {
  private readonly spoken: string[] = [];
  private generation = 0;
  private draft?: { generation: number; raw: string; publication: string; observationIds?: string[] };
  private lastPublication = '';
  private continuationStart = 0;
  private readonly deliveredObservationIds = new Set<string>();
  private readonly observationsAfterLastContribution = new Set<string>();
  private readonly excludedObservationIds = new Set<string>();
  private readonly priorPublications: { messageId: string; state: 'superseded_tail'; exposure: 'unknown';
    publication: Omit<NonNullable<ReturnType<ConversationRhythm['continuationContext']>>, 'meaning'> }[] = [];

  constructor(readonly enabled: boolean) {}

  /** One actual foreground model request. A replay replaces its unfinished
   * draft; it never appends the old request's partial text a second time. */
  beginDraft() {
    const generation = ++this.generation;
    this.draft = { generation, raw: '', publication: this.lastPublication || this.current() };
    return generation;
  }

  appendDraft(generation: number, delta: string) {
    if (this.enabled && this.draft?.generation === generation) this.draft.raw += delta;
  }

  replaceDraft(generation: number, content: string) {
    if (this.draft?.generation !== generation) return;
    this.draft.raw = content;
    // The existing caller reaches this point only after the provider request
    // and its source checks have completed. A failed or cancelled request
    // cannot acknowledge observations merely by preparing its prompt.
    for (const id of this.draft.observationIds || []) {
      if (!this.deliveredObservationIds.has(id)) this.observationsAfterLastContribution.add(id);
      this.deliveredObservationIds.add(id);
    }
  }

  get hasDraft() { return this.draft !== undefined; }

  /** The generation is also the admission token for a completed proposal.
   * Withdrawing a visible tail retires its late prose and tool calls together. */
  isCurrentDraft(generation: number) { return this.draft?.generation === generation; }

  /** The caller admits the current scope/source proof immediately before
   * this projection. No provider completion or action success is implied. */
  previewDraft(generation: number, complete = false): { changed: boolean; text: string } {
    if (!this.enabled || this.draft?.generation !== generation) return { changed: false, text: this.currentPublication() };
    const visible = redactStreamingDraft(this.draft.raw, complete);
    // A held credential span or a replay of the accepted prefix contributes
    // no new public words. Compare the projection, not the provider's raw
    // candidate, so neither creates an empty progress pulse in the UI.
    if (!visible && !complete) return { changed: false, text: this.draft.publication };
    const text = !complete && this.partialProseReplay(visible) ? this.current() : this.finish(visible);
    const changed = text !== this.draft.publication;
    this.draft.publication = text;
    this.lastPublication = text;
    return { changed, text };
  }

  /** Reconcile to the provider's authoritative complete content only after
   * its original completion/source checks pass. This is still a tool-turn
   * contribution, not the final completion-review verdict. */
  commitDraft(generation: number, content: string) {
    if (this.draft?.generation !== generation) return { changed: false, text: this.currentPublication() };
    this.closeDraft();
    const offered = this.offer(redactStreamingDraft(content, true));
    // Empty tool turns and exact replays do not count as a new contribution.
    // Advancing this time boundary never claims every result was discussed.
    if (offered.changed) this.observationsAfterLastContribution.clear();
    return offered;
  }

  /** Failure text stays unfinished and outside the accepted spoken ledger.
   * Revoked sources discard the draft; an ordinary interruption may retain
   * only the safe prefix the user actually saw. */
  interruptDraft(discard: boolean) {
    const publication = this.draft?.publication || this.lastPublication;
    this.clearReviewPublications();
    this.closeDraft();
    return discard ? this.current() : publication || this.current();
  }

  acceptFinal() { this.closeDraft(); this.clearReviewPublications(); }

  invalidateSources() {
    this.excludeObservationContext();
    this.spoken.splice(0); this.closeDraft(); this.continuationStart = 0;
    this.clearReviewPublications();
  }

  /** A changed source must not be copied back as fresh conversational context.
   * Keep the actual publication intact; later source-checked words may follow. */
  discardContinuationContext() {
    this.excludeObservationContext();
    this.continuationStart = Array.from(this.current()).length;
    this.closeDraft();
    this.clearReviewPublications();
  }

  /** Preserve only the safe, actually published candidate before a repair
   * replaces it. A review verdict or an unshown provider tail is not evidence. */
  captureReviewPublication(messageId: string) {
    const context = this.continuationContext();
    if (!context?.replaceableTail) return;
    // The stable prefix remains in reply. Only this replaced tail needs its
    // earlier identity; it cannot stand in for the current readable answer.
    const publication = { replaceableTail: context.replaceableTail };
    this.priorPublications.push({ messageId, state: 'superseded_tail', exposure: 'unknown', publication });
    this.priorPublications.splice(0, Math.max(0, this.priorPublications.length - 2));
  }

  reviewPublications(messageId: string) {
    return structuredClone(this.priorPublications.filter(publication => publication.messageId === messageId));
  }

  clearReviewPublications() { this.priorPublications.splice(0); }

  /** Every existing stop/revision/acceptance boundary retires its generation.
   * Late stream chunks and completions keep their old token and cannot become
   * the draft of a later provider request. The caller still owns source proof. */
  private closeDraft() {
    this.generation++;
    this.draft = undefined;
    this.lastPublication = '';
  }

  private currentPublication() { return this.draft?.publication ?? this.current(); }

  /** A replayed tail sentence may arrive over several chunks. Keep its exact
   * unfinished prefix out of the bubble until it either matches fully or
   * diverges into new prose. This holds words, never invents progress, and is
   * used only for an unfinished preview, not an authoritative final answer. */
  private partialProseReplay(content: string) {
    const before = this.current();
    if (!plainProse(before)) return false;
    for (const boundary of before.matchAll(proseBoundary())) {
      const overlap = before.slice(boundary.index! + boundary[0].length);
      if (overlap.length > content.length && plainProse(overlap) && overlap.startsWith(content)) return true;
    }
    return false;
  }

  /** The parent's current reply, not another history or a claim of being seen.
   * A bounded excerpt stays bounded even after native transcript compression. */
  continuationContext(input?: ConversationContinuationInput) {
    if (!this.enabled) return;
    const observationIds = input ? [...new Set(input.observationIds)].filter(id =>
      typeof id === 'string' && id.trim() && !this.excludedObservationIds.has(id)) : [];
    if (input && this.draft) this.draft.observationIds = observationIds;
    const prefix = this.current();
    const excerpt = (text: string, floor = 0) => {
      const points = Array.from(text), end = points.length;
      if (end <= floor) return;
      const start = Math.max(floor, end - 2400);
      return { text: points.slice(start).join(''), start, end, totalCharacters: end,
        coverage: start === 0 ? 'complete' as const : 'partial' as const };
    };
    const publishedPrefix = excerpt(prefix, this.continuationStart);
    const replaceableTail = this.lastPublication ? excerpt(this.lastPublication.slice(prefix.length)) : undefined;
    const newlyAvailableIds = observationIds.filter(id => !this.deliveredObservationIds.has(id));
    const sinceLastContributionIds = [...new Set([...this.observationsAfterLastContribution, ...newlyAvailableIds])]
      .filter(id => observationIds.includes(id));
    const boundedIds = (ids: string[]) => ({ ids: ids.slice(-24), ...(ids.length > 24 ? { omitted: ids.length - 24 } : {}) });
    const observations = sinceLastContributionIds.length ? {
      newlyAvailable: boundedIds(newlyAvailableIds),
      sinceLastContribution: boundedIds(sinceLastContributionIds),
      meaning: "Newly available tool responses and material since the latest conversational contribution are identified here; originals remain in their tool results. Directory, parameter, and pagination discovery usually prepares the next step rather than becoming a progress report. Share real new facts, changed judgments, or choice-enabling progress. Affection and humor can follow the actual relationship without using research as a pretext. Earlier explained limits remain in the published prefix; continue through feasible routes. Pending independent questions await their own results.",
    } : undefined;
    // The first request needs the same near-at-hand speaking context as later
    // requests. Requiring existing prose left every request in a silent
    // tool sequence without this near-at-hand speaking context.
    const opening = !!input && !prefix && !this.lastPublication;
    if (!publishedPrefix && !replaceableTail && !observations && !opening) return;
    const continuation = publishedPrefix
      ? "The published prefix already belongs to this reply, including discoveries, figures, limits, and care. Complete unanswered parts or explain a new finding's effect. Do not restate the whole prefix in the tail. Correct the specific affected point directly."
      : opening
        ? "No words to the person have been published in this reply yet. If the request needs several reads or creative steps, respond first to the wish or difficulty you understood, then use tools. Results need not have returned to acknowledge the current request. Describe problems only if they actually arise, with real effects and a way onward. Honor quiet waiting. Let actual evidence and still-valid agreements determine the help."
        : "This is still the same reply in progress. Continue from the current original words and newly read evidence.";
    const revision = replaceableTail
      ? "The earlier tail may have appeared briefly and will be replaced by this revision. Retain still-sound, needed content. If your judgment changes, explain the discovery naturally."
      : '';
    return { ...(publishedPrefix ? { publishedPrefix } : {}), ...(replaceableTail ? { replaceableTail } : {}),
      ...(observations ? { observations } : {}),
      meaning: continuation + revision + (publishedPrefix || replaceableTail
        ? "This excerpt contains recently displayed text; earlier portions may be absent. Display does not establish how much the person read." : '')
        + "Decide how to continue in your own character and the current exchange." };
  }

  private excludeObservationContext() {
    for (const id of [...this.deliveredObservationIds, ...(this.draft?.observationIds || [])]) this.excludedObservationIds.add(id);
    this.deliveredObservationIds.clear();
    this.observationsAfterLastContribution.clear();
    if (this.draft) this.draft.observationIds = undefined;
  }

  offer(content: string): { changed: boolean; text: string } {
    if (!this.enabled || !content.trim()) return { changed: false, text: this.current() };
    const text = redactStreamingDraft(content, true);
    const before = this.current(), combined = this.finish(text);
    if (combined === before) return { changed: false, text: before };
    // Preview and commit use the same exact reconciliation. A model that
    // resumes with its earlier prefix must not duplicate it at commit time.
    this.spoken.splice(0, this.spoken.length, combined);
    return { changed: true, text: this.current() };
  }

  current() { return this.spoken.join('\n\n'); }

  /** Published tool-turn prose is a stable prefix. Reconcile only an exact
   * prefix or complete prose at the join; never reorder earlier words or
   * search inside a candidate for matching formulas, quotes or code. */
  finish(finalContent: string) {
    const safeFinal = redactStreamingDraft(finalContent, true);
    const before = this.current(), after = safeFinal;
    if (!before) return safeFinal;
    if (!after.trim()) return before;
    if (after.startsWith(before)) return after;
    if (before.startsWith(after)) return before;
    // A final candidate can repeat its opening sentence, then diverge after
    // an intervening tool-turn finding. Keep that finding in place and omit
    // only the exact repeated prose opening. Structured material is excluded:
    // a repeated equation, list heading or code block may be intentional.
    const boundaries = () => plainProse(before) ? proseBoundary() : /\n\s*\n/g;
    let repeatedOpening = 0;
    for (const boundary of before.matchAll(boundaries())) {
      const end = boundary.index! + boundary[0].length;
      const opening = before.slice(0, end);
      if (!after.startsWith(before.slice(0, end)) || !plainProse(opening)) break;
      repeatedOpening = end;
    }
    if (repeatedOpening) return before + '\n\n' + after.slice(repeatedOpening);
    for (const boundary of before.matchAll(boundaries())) {
      const start = boundary.index! + boundary[0].length;
      const overlap = before.slice(start);
      if (plainProse(overlap) && after.startsWith(overlap)) return before + after.slice(overlap.length);
    }
    return before + '\n\n' + after;
  }
}

function plainProse(text: string) {
  const trimmed = text.trim();
  return (trimmed.match(/[\p{L}\p{N}]/gu)?.length || 0) >= 2 && /[。！？.!?…][”’"']?$/.test(trimmed)
    && !trimmed.replace(/\r?\n[ \t]*\r?\n/g, '').includes('\n')
    && !/(?:^|\n)[ \t]*(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|>|\|)|[`$“”‘’「」『』"'=≠≤≥∑∫√+*/^<>×÷]|~~~|\\(?:begin|\[|\()/.test(text);
}

/** Dots inside a number or identifier are not sentence boundaries. A prose
 * replay is removed only from the candidate's start, at a complete sentence
 * already present at the prefix or join; no fuzzy or semantic deletion. */
function proseBoundary() { return /[。！？!?…][ \t]*|\.(?=\s|$)[ \t]*|\n[ \t]*\n/g; }

/** The existing credential redactor needs complete spans. Keep an open key
 * token or private-key block out of a live prefix until it can be redacted;
 * never reveal one chunk and try to take it back in the next chunk. */
function redactStreamingDraft(raw: string, complete = false) {
  let end = raw.length;
  const starts = ['-----BEGIN PRIVATE KEY-----', '-----BEGIN RSA PRIVATE KEY-----',
    '-----BEGIN EC PRIVATE KEY-----', '-----BEGIN OPENSSH PRIVATE KEY-----'];
  for (const start of starts) {
    const index = raw.lastIndexOf(start);
    if (index >= 0 && !raw.includes(start.replace('BEGIN', 'END'), index + start.length)) end = Math.min(end, index);
    if (!complete) for (let length = 1; length < start.length; length++)
      if (raw.endsWith(start.slice(0, length))) end = Math.min(end, raw.length - length);
  }
  if (!complete) for (const pattern of [/\bsk-[A-Za-z0-9_-]*$/, /\bBearer[ \t]+[A-Za-z0-9._~+/-]*=*$/i,
    /password["']?[ \t]*[\p{Po}=][ \t]*["']?[^\s"']*$/iu,
    /password["']?[ \t]*(?:[\p{Po}=]|\bis\b)[ \t]*(?:"(?:\\(?:[\s\S]|$)|[^"\\])*|'(?:\\(?:[\s\S]|$)|[^'\\])*|“[^”]*|‘[^’]*|[^\s"'“”‘’\u0080-\uFFFF]*)$/iu]) {
    const open = pattern.exec(raw);
    if (open) end = Math.min(end, open.index);
  }
  return redactCredentials(raw.slice(0, end)) + (complete && end < raw.length ? "[Credentials hidden]" : '');
}
