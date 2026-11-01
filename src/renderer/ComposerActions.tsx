import { ArrowUp, Square } from 'lucide-react';
import './composer-actions.css';

export interface ComposerActionsProps {
  busy: boolean;
  submitting: boolean;
  hasDraft: boolean;
  onStop: () => void;
}

/** The same composer keeps both choices available: stop this reply, or send
 * the words already being written so the conversation can follow them. */
export function ComposerActions({ busy, submitting, hasDraft, onStop }: ComposerActionsProps) {
  return <>
    {busy && <button
      className="send-button stop"
      type="button"
      title="Stop reply · Esc"
      aria-label="Stop reply"
      onClick={onStop}
    ><Square size={13} fill="currentColor" /></button>}
    {(!busy || hasDraft) && <button
      className={`send-button${busy ? ' composer-supplement' : ''}`}
      type="submit"
      aria-label={busy ? 'Send a follow-up and continue from it' : 'Send'}
      title={busy ? 'Continue with this follow-up · Enter' : 'Send · Enter'}
      disabled={submitting || !hasDraft}
    >{busy ? 'Add a thought' : <ArrowUp size={22} />}</button>}
  </>;
}
