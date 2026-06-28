import { Home, Table, Users, History, CircleHelp, Monitor, Sun, Moon } from 'lucide-react';
import { useApp } from '../store.jsx';
import logoUrl from '../../logo.svg';

const NAV = [
  { view: 'home', label: 'Home', Icon: Home },
  { view: 'batch', label: 'Build batch', Icon: Table },
  { view: 'payees', label: 'Saved payees', Icon: Users },
  { view: 'history', label: 'History', Icon: History }
];

const THEME_ORDER = ['system', 'light', 'dark'];
const THEME_ICON = { system: Monitor, light: Sun, dark: Moon };
const THEME_LABEL = { system: 'System', light: 'Light', dark: 'Dark' };

export default function Sidebar() {
  const { view, navigate, settings, setTheme } = useApp();
  const theme = settings.theme || 'system';
  const ThemeIcon = THEME_ICON[theme];

  const cycleTheme = () => {
    const i = THEME_ORDER.indexOf(theme);
    setTheme(THEME_ORDER[(i + 1) % THEME_ORDER.length]);
  };

  return (
    <aside className="sidebar">
      <div className="brand sidebar-brand" title="Go to home" onClick={() => navigate('home')}>
        <img className="logo" src={logoUrl} alt="PayBatch logo" />
        <h1>PayBatch</h1>
      </div>

      <nav className="sidebar-nav">
        {NAV.map(({ view: v, label, Icon }) => (
          <button
            key={v}
            className={'nav-item' + (view === v ? ' active' : '')}
            onClick={() => navigate(v)}
          >
            <Icon className="icon" size={18} />
            <span className="nav-label">{label}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar-foot">
        <button className={'nav-item' + (view === 'help' ? ' active' : '')} onClick={() => navigate('help')}>
          <CircleHelp className="icon" size={18} />
          <span className="nav-label">Help</span>
        </button>
        <button className="nav-item theme-toggle" onClick={cycleTheme} title="Switch light / dark / system theme">
          <ThemeIcon className="icon" size={18} />
          <span className="nav-label theme-label">{THEME_LABEL[theme]}</span>
        </button>
      </div>
    </aside>
  );
}
