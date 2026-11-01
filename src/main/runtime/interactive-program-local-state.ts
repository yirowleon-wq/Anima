import type { Store } from '../store';
import { programLocalStateAddressSchema, programLocalStateSaveSchema, retainedProgramState, restoredProgramState,
  type ProgramLocalStateAddress, type ProgramLocalStateReceipt, type ProgramLocalState } from '../../shared/interactive-program';
import type { PresentationView } from '../../shared/scenes';
import { programReferenceIdentity, programSourcesReadable } from './interactive-program-sources';

/** Private UI state belongs to the original message/version. This reader
 * does not restore Data, an old permission, a running clock or an action. */
export class NativeProgramLocalState {
  constructor(private readonly store: Store) {}
  private owner(input: ProgramLocalStateAddress) {
    const runtime = this.store.runtime;
    if (runtime.presentation.public || input.privacyEpoch !== this.store.kernel.epoch || input.policyRevision !== this.store.kernel.policyRevision)
      throw new Error("The source scope just changed. Return to this page before retrying.");
    const scope = runtime.policy.hostScope(), source = { messageId: input.messageId, programId: input.programId, revision: input.revision };
    const identity = programReferenceIdentity(runtime, scope, source, input.sessionId, { localDisplay: true });
    if (!identity || identity.sessionId !== input.sessionId || !programSourcesReadable(runtime, scope, [source], undefined, true))
      throw new Error("A source on this page changed. Return to its original content.");
    const row = this.store.db.prepare(`SELECT v.key AS slot,v.value AS view FROM messages m,json_each(m.payload,'$.views') v
      WHERE m.id=? AND m.session_id=? AND json_extract(v.value,'$.id')=? AND json_extract(v.value,'$.revision')=? LIMIT 1`)
      .get(input.messageId, input.sessionId, input.programId, input.revision);
    if (!row) return undefined;
    const view = JSON.parse(String(row.view)) as PresentationView;
    if (!view.program || view.program.hash !== input.programHash) throw new Error("This page has another revision. Return to the intended original revision.");
    const local = view.localState?.programHash === input.programHash ? view.localState : undefined;
    return { view, slot: Number(row.slot), local };
  }
  read(raw: unknown): ProgramLocalStateReceipt {
    const input = programLocalStateAddressSchema.parse(raw), owner = this.owner(input);
    if (!owner || input.ephemeral || this.store.conversationPolicy(input.sessionId)?.retention === 'session_only') return { status: 'ephemeral', stateRevision: 0 };
    return { status: 'ready', stateRevision: owner.local?.stateRevision || 0,
      inputs: restoredProgramState(owner.view.program!, owner.local?.inputs), ...(owner.local ? { updatedAt: owner.local.updatedAt } : {}) };
  }
  save(raw: unknown): ProgramLocalStateReceipt {
    const input = programLocalStateSaveSchema.parse(raw);
    return this.store.kernel.write(() => {
      const owner = this.owner(input);
      if (!owner || input.ephemeral || this.store.conversationPolicy(input.sessionId)?.retention === 'session_only') return { status: 'ephemeral', stateRevision: 0 };
      const stateRevision = owner.local?.stateRevision || 0;
      if (input.expectedStateRevision !== stateRevision) return { status: 'conflict', stateRevision };
      const inputs = retainedProgramState(owner.view.program!.states, input.inputs);
      if (owner.local && JSON.stringify(inputs) === JSON.stringify(owner.local.inputs))
        return { status: 'unchanged', stateRevision, updatedAt: owner.local.updatedAt };
      const local: ProgramLocalState = { programHash: input.programHash, stateRevision: stateRevision + 1, inputs, updatedAt: this.store.kernel.clock.now() };
      // The numeric slot came from json_each after exact id/revision/hash
      // matching. Only this host-owned field is changed; prose is untouched.
      this.store.db.prepare(`UPDATE messages SET payload=json_set(payload,?,json(?)) WHERE id=? AND session_id=?`)
        .run(`$.views[${owner.slot}].localState`, JSON.stringify(local), input.messageId, input.sessionId);
      const saved = this.owner(input);
      if (saved?.local?.stateRevision !== local.stateRevision) throw new Error("This page just changed. Your current adjustment stays here.");
      return { status: 'saved', stateRevision: local.stateRevision, updatedAt: local.updatedAt };
    });
  }
}
