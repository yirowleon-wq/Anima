import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, BookOpen, ChevronRight, FileText, History, LoaderCircle, MessageCircle, Search, Trash2, X } from 'lucide-react';
import type { Conversation, State } from '../shared/types';
import { LOCAL_SEARCH_LIMITS, type LocalSearchBridge, type LocalSearchHit, type LocalSearchKind, type LocalSearchLocator, type LocalSearchPage } from '../shared/search';
import { IconButton, Modal, uiError } from './ui';
import { formatDateTime } from './time';
import './local-search.css';

const api = window.anima as typeof window.anima & LocalSearchBridge;
const kinds = [{ value: 'all', label: 'All' }, { value: 'conversation', label: 'Conversation' }, { value: 'note', label: 'Notes' }, { value: 'material', label: 'Materials' }] as const;
const kindName = { conversation: 'Conversation', note: 'Notes', material: 'Materials' };
const kindAction = { conversation: 'Return to this sentence', note: 'Open this page', material: 'Open original' };

function Excerpt({ hit }: { hit: LocalSearchHit }) {
  const text = Array.from(hit.snippet);
  return <>{text.slice(0, hit.match.start).join('')}<mark>{text.slice(hit.match.start, hit.match.end).join('')}</mark>{text.slice(hit.match.end).join('')}</>;
}

/** Owner-only local retrieval. A hit is resolved again before leaving the sheet. */
export function LocalSearchPanel({ state, conversations, busy, onClose, onRestoreFocus, onOpen, onSelect, onDelete }: {
  state: Pick<State, 'privacyEpoch' | 'policyRevision' | 'sourceBoundary' | 'settings'>;
  conversations: Conversation[];
  busy: boolean;
  onClose: () => void;
  onRestoreFocus: () => void;
  onOpen: (id: string) => Promise<void>;
  onSelect: (locator: LocalSearchLocator) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<'all' | LocalSearchKind>('all');
  const [scope, setScope] = useState<'all' | 'selected'>('all');
  const [chosenSessions, setChosenSessions] = useState<string[]>([]);
  const [scopePickerOpen, setScopePickerOpen] = useState(true);
  const [result, setResult] = useState<LocalSearchPage>();
  const [resultKey, setResultKey] = useState('');
  const [loading, setLoading] = useState(false), [opening, setOpening] = useState('');
  const [error, setError] = useState(''), [retry, setRetry] = useState(0);
  const [deleting, setDeleting] = useState(''), [removing, setRemoving] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const generation = useRef(0), mounted = useRef(true);
  const boundary = `${state.privacyEpoch}:${state.policyRevision}:${state.sourceBoundary ?? 0}`;
  const currentBoundary = useRef(boundary);
  currentBoundary.current = boundary;
  const term = query.trim();
  const selectedScope = kind === 'conversation' && scope === 'selected';
  const availableSessions = new Set(conversations.map(conversation => conversation.id));
  const sessionIds = [...new Set(chosenSessions.filter(id => availableSessions.has(id)))].sort();
  const selectionMissing = selectedScope && !sessionIds.length;
  const requestKey = JSON.stringify([boundary, kind, selectedScope ? sessionIds : null, term]);
  const currentRequest = useRef(requestKey);
  currentRequest.current = requestKey;
  const visible = resultKey === requestKey && result && result.privacyEpoch === state.privacyEpoch
    && result.policyRevision === state.policyRevision && (result.sourceBoundary ?? 0) === (state.sourceBoundary ?? 0) ? result : undefined;

  function invalidate() {
    generation.current++;
    setResult(undefined); setError(''); setOpening(''); setLoading(false); setDeleting('');
    void api.searchCancel().catch(() => {});
  }
  function chooseSession(id: string) {
    invalidate();
    setChosenSessions(previous => sessionIds.includes(id) ? previous.filter(value => value !== id)
      : sessionIds.length < LOCAL_SEARCH_LIMITS.sessions ? [...sessionIds, id] : sessionIds);
  }
  function searchInput() {
    return { query: term, ...(kind === 'all' ? {} : { kinds: [kind] }), ...(selectedScope ? { sessionIds } : {}) };
  }

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current++; void api.searchCancel().catch(() => {}); }; }, []);
  useEffect(() => {
    const token = ++generation.current;
    setResult(undefined); setError(''); setOpening(''); setLoading(!!term && !selectionMissing); setDeleting('');
    void api.searchCancel().catch(() => {});
    if (!term || selectionMissing) return;
    const timer = window.setTimeout(() => {
      void api.searchLocal(searchInput()).then(page => {
        if (mounted.current && token === generation.current && currentRequest.current === requestKey
          && currentBoundary.current === boundary) { setResult(page); setResultKey(requestKey); }
      }).catch(cause => {
        if (mounted.current && token === generation.current && currentRequest.current === requestKey) setError(uiError(cause));
      }).finally(() => { if (mounted.current && token === generation.current && currentRequest.current === requestKey) setLoading(false); });
    }, 180);
    return () => { window.clearTimeout(timer); generation.current++; void api.searchCancel().catch(() => {}); };
  }, [requestKey, retry]);

  async function more() {
    if (loading || !visible?.nextCursor) return;
    const token = generation.current;
    setLoading(true); setError('');
    try {
      const page = await api.searchLocal({ ...searchInput(), cursor: visible.nextCursor });
      if (!mounted.current || token !== generation.current || currentRequest.current !== requestKey || currentBoundary.current !== boundary) return;
      setResult(previous => ({ ...page, items: [...new Map([...(previous?.items || []), ...page.items].map(item => [item.id, item])).values()], warnings: [...new Map([...(previous?.warnings || []), ...page.warnings].map(warning => [`${warning.kind}:${warning.code}:${warning.resourceId || ''}`, warning])).values()] }));
    } catch (cause) { if (mounted.current && token === generation.current && currentRequest.current === requestKey) setError(uiError(cause)); }
    finally { if (mounted.current && token === generation.current && currentRequest.current === requestKey) setLoading(false); }
  }
  async function select(hit: LocalSearchHit) {
    if (opening || busy) return;
    const token = generation.current;
    setOpening(hit.id); setError('');
    try {
      const locator = await api.searchResolve(hit.locator);
      if (!mounted.current || token !== generation.current || currentRequest.current !== requestKey || currentBoundary.current !== boundary) return;
      await onSelect(locator);
    } catch (cause) {
        if (mounted.current && token === generation.current && currentRequest.current === requestKey) {
        setError(uiError(cause));
        setResult(previous => previous && { ...previous, items: previous.items.filter(item => item.id !== hit.id) });
      }
    } finally { if (mounted.current && token === generation.current && currentRequest.current === requestKey) setOpening(''); }
  }
  async function remove(id: string) {
    setRemoving(true); setError('');
    try { await onDelete(id); if (mounted.current) setDeleting(''); }
    catch (cause) { if (mounted.current) setError(uiError(cause)); }
    finally { if (mounted.current) setRemoving(false); }
  }

  return <Modal title="Search" className="local-search-panel" onClose={onClose} fallbackFocus={onRestoreFocus}>
    <div className="local-search-body">
      <div className="local-search-input">
        <Search size={21} strokeWidth={1.5} />
        <input ref={input} autoFocus aria-label={selectedScope ? 'Search original words in the selected conversations' : 'Search conversations, notes, and materials'} placeholder="What would you like to find?" value={query} maxLength={LOCAL_SEARCH_LIMITS.query} onChange={event => { invalidate(); setQuery(event.target.value); }} />
        {query && <IconButton label="Clear search" onClick={() => { invalidate(); setQuery(''); input.current?.focus(); }}><X size={17} /></IconButton>}
      </div>
      <div className="local-search-kinds" role="group" aria-label="Content to find">
        {kinds.map(option => <button type="button" key={option.value} aria-pressed={kind === option.value} onClick={() => { if (kind !== option.value) { invalidate(); setKind(option.value); } }}>{option.label}</button>)}
      </div>
      {kind === 'conversation' && <section className="local-search-scope" aria-label="Conversation search scope">
        <div className="local-scope-choices" role="group" aria-label="Choose conversations to search">
          <button type="button" aria-pressed={scope === 'all'} onClick={() => { if (scope !== 'all') { invalidate(); setScope('all'); } }}>All conversations</button>
          <button type="button" aria-pressed={scope === 'selected'} onClick={() => { setScopePickerOpen(true); if (scope !== 'selected') { invalidate(); setScope('selected'); } }}>Only selected conversations</button>
        </div>
        {selectedScope && <>
          {!!sessionIds.length && <div className="local-scope-chips" aria-label="Selected conversations">{conversations.filter(conversation => sessionIds.includes(conversation.id)).map(conversation =>
            <button type="button" key={conversation.id} onClick={() => chooseSession(conversation.id)} aria-label={`Remove from search: ${conversation.title}`}><span>{conversation.title}</span><X size={13} /></button>)}</div>}
          <details className="local-scope-picker" open={scopePickerOpen} onToggle={event => setScopePickerOpen(event.currentTarget.open)}>
            <summary>{sessionIds.length ? `Search ${sessionIds.length} conversations · change scope` : 'Choose conversations first'}</summary>
            <div className="local-scope-list">{conversations.map(conversation => <label key={conversation.id}>
              <input type="checkbox" checked={sessionIds.includes(conversation.id)} disabled={!sessionIds.includes(conversation.id) && sessionIds.length >= LOCAL_SEARCH_LIMITS.sessions} onChange={() => chooseSession(conversation.id)} />
              <span title={formatDateTime(conversation.updatedAt, state.settings.timeZone)}><strong>{conversation.title}</strong></span>
            </label>)}</div>
            {sessionIds.length >= LOCAL_SEARCH_LIMITS.sessions && <p>Choose up to {LOCAL_SEARCH_LIMITS.sessions} conversations for this search.</p>}
          </details>
        </>}
      </section>}
      <div className="local-search-results" aria-busy={loading}>
        {selectionMissing ? <div className="local-search-empty"><MessageCircle size={34} strokeWidth={1.2} /><h3>{conversations.length ? 'Which conversations would you like to return to?' : 'No saved conversations yet.'}</h3><p>{conversations.length ? 'Choose the scope, then search the words from that time.' : 'Saved conversations will be available to search here.'}</p></div> : !term ? kind === 'all' || kind === 'conversation' ? <>
          {conversations.filter(conversation => !selectedScope || sessionIds.includes(conversation.id)).map(conversation => <div className="local-recent-row" key={conversation.id}>
            <button type="button" className="local-recent-open" disabled={busy || removing} onClick={() => void onOpen(conversation.id)}>
              <span className="local-search-symbol"><MessageCircle size={21} strokeWidth={1.4} /></span>
              <span className="local-recent-copy" title={formatDateTime(conversation.updatedAt, state.settings.timeZone)}><strong>{conversation.title}</strong></span>
              <span className="local-search-action" aria-label="Discuss"><ChevronRight size={18} /></span>
            </button>
            {deleting === conversation.id ? <div className="local-search-delete"><span>Delete this conversation?</span><button disabled={busy || removing} onClick={() => void remove(conversation.id)}>Delete</button><button disabled={removing} onClick={() => setDeleting('')}>Keep</button></div> : <IconButton className="local-recent-remove" label={`Delete conversation: ${conversation.title}`} disabled={busy} onClick={() => setDeleting(conversation.id)}><Trash2 size={15} /></IconButton>}
          </div>)}
          {!conversations.length && <div className="local-search-empty"><History size={34} strokeWidth={1.2} /><h3>It starts with a first conversation.</h3><p>When a sentence comes back to you, find it here.</p></div>}
        </> : <div className="local-search-empty"><BookOpen size={35} strokeWidth={1.2} /><h3>Do you remember a word?</h3><p>Write it to search {kindName[kind]}.</p></div> : <>
          {visible?.items.map(hit => {
            const Icon = hit.kind === 'conversation' ? MessageCircle : hit.kind === 'note' ? BookOpen : FileText;
            return <button type="button" className={`local-search-hit is-${hit.kind}`} key={hit.id} disabled={busy || !!opening} onClick={() => void select(hit)}>
              <span className="local-search-symbol"><Icon size={23} strokeWidth={1.4} /></span>
              <span className="local-hit-copy"><span className="local-hit-kind">{kindName[hit.kind]}{hit.locator.kind === 'material' && hit.locator.page ? ` · p. ${hit.locator.page}` : hit.kind === 'conversation' && hit.role ? hit.role === 'user' ? ' · Your words' : ' · Anima’s reply' : ''}</span><strong>{hit.title}</strong><span className="local-hit-excerpt"><Excerpt hit={hit} /></span></span>
              <span className="local-search-action">{opening === hit.id ? <LoaderCircle size={17} className="spin" /> : <>{kindAction[hit.kind]}<ArrowUpRight size={16} /></>}</span>
            </button>;
          })}
          {loading && !visible?.items.length ? <div className="local-search-empty local-search-looking" role="status"><LoaderCircle size={28} strokeWidth={1.2} className="spin" /><p>Searching saved text…</p></div> : visible && !visible.items.length && !error && <div className="local-search-empty"><BookOpen size={36} strokeWidth={1.1} /><h3>{visible.nextCursor ? 'There is more to search further back.' : 'No match found this time.'}</h3><p>{visible.nextCursor ? 'Earlier text remains to be searched. You can continue.' : 'Try a shorter search term.'}</p></div>}
          {visible?.nextCursor && <button type="button" className="text-button local-search-more" disabled={loading || !!opening} onClick={() => void more()}>{loading ? <><LoaderCircle size={16} className="spin" />Looking further…</> : 'Search further back'}</button>}
        </>}
      </div>
      {error && <div className="local-search-problem" role="alert"><p>This search did not finish. Try again.</p><button type="button" className="text-button" onClick={() => setRetry(value => value + 1)}>Search again</button><details><summary>View reason</summary><p>{error}</p></details></div>}
      {!!visible?.warnings.length && <details className="local-search-coverage"><summary>Some content could not be searched</summary>{visible.warnings.map((warning, index) => <p key={index}>{warning.message}</p>)}</details>}
    </div>
  </Modal>;
}
