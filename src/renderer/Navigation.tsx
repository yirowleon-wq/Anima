import { Pencil, Search, Settings2, Sun } from 'lucide-react';
import type { WorkspaceView } from './Workspace';
import { CompanionAvatar } from './companion';
import { APPEARANCE_PALETTES, useEffectiveEnvironment } from './appearance';

/** Places stay stable; personal appearance and app preferences have their own
 * entrances instead of sharing a drawer with every kind of work. */
export function Navigation({ busy, view, onView, onNew, onHistory, onCompanion }: {
  busy: boolean;
  view: WorkspaceView | 'home';
  onView: (view: WorkspaceView) => void;
  onNew: () => void;
  onHistory: () => void;
  onCompanion: (entry: 'partner' | 'light') => void;
}) {
  const environment = useEffectiveEnvironment();
  const lightName = APPEARANCE_PALETTES.find(item => item.id === environment.palette)?.name || 'Light';
  return <nav className="top-navigation" aria-label="Common actions">
    <div className="primary-navigation" aria-label="Main pages" data-view={view === 'notes' || view === 'keep' ? 'notes' : view === 'materials' ? 'chat' : view}>
      <span className="primary-selection" aria-hidden="true" />
      <button type="button" aria-current={view === 'chat' || view === 'materials' ? 'page' : undefined} onClick={() => onView('chat')}>Chat</button>
      <button type="button" aria-current={view === 'agenda' ? 'page' : undefined} onClick={() => onView('agenda')}>Today</button>
      <button type="button" aria-current={view === 'notes' || view === 'keep' ? 'page' : undefined} onClick={() => onView('keep')}>Keep</button>
    </div>
    <div className="navigation-personal">
      <button type="button" className="nav-button" aria-label="Search conversations, notes, and materials" title="Search · Ctrl K" onClick={onHistory}><Search size={19} /></button>
      {(view === 'chat' || view === 'home') && <button type="button" className="nav-button nav-new-conversation" aria-label="New conversation" title="New conversation · Ctrl N" onClick={onNew} disabled={busy}><Pencil size={18} /></button>}
      <button type="button" className="nav-button navigation-atmosphere" aria-label={`Choose atmosphere, currently ${lightName}`} title="Choose atmosphere" onClick={() => onCompanion('light')}><Sun size={19} /><span>{lightName}</span></button>
      <button type="button" className="nav-button companion-menu-trigger" aria-label="Choose companion" title="Choose companion" aria-current={view === 'companion' ? 'page' : undefined} onClick={() => onCompanion('partner')}><CompanionAvatar size={35} /></button>
      <button type="button" className="nav-button navigation-preferences" aria-label="Conversation, reading, and connection settings" title="Settings" aria-current={view === 'settings' ? 'page' : undefined} onClick={() => onView('settings')}><Settings2 size={19} /></button>
    </div>
  </nav>;
}
