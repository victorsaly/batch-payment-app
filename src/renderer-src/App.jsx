import { useEffect, useState, useRef, useCallback } from 'react';
import { useApp } from './store.jsx';
import Sidebar from './components/Sidebar.jsx';
import UpdateBanner from './components/UpdateBanner.jsx';
import Footer from './components/Footer.jsx';
import ChangelogModal from './components/ChangelogModal.jsx';
import ErrorLogModal from './components/ErrorLogModal.jsx';
import ErrorModal from './components/ErrorModal.jsx';

import Home from './screens/Home.jsx';
import Build from './screens/Build.jsx';
import Payees from './screens/Payees.jsx';
import History from './screens/History.jsx';
import Help from './screens/Help.jsx';

function SplashLogo() {
  return (
    <svg className="splash-logo" viewBox="0 0 1024 1024" role="img" aria-label="PayBatch">
      <defs>
        <linearGradient id="slg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6b8bff" />
          <stop offset="1" stopColor="#3358d4" />
        </linearGradient>
        <linearGradient id="ssh" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.22" />
          <stop offset="0.55" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g className="sl-tile">
        <rect x="64" y="64" width="896" height="896" rx="232" fill="url(#slg)" />
        <rect x="64" y="64" width="896" height="896" rx="232" fill="url(#ssh)" />
      </g>
      <rect className="sl-row" style={{ '--d': '120ms' }} x="248" y="300" width="440" height="74" rx="37" fill="rgba(255,255,255,.98)" />
      <rect className="sl-row" style={{ '--d': '220ms' }} x="248" y="430" width="440" height="74" rx="37" fill="rgba(255,255,255,.82)" />
      <rect className="sl-row" style={{ '--d': '320ms' }} x="248" y="560" width="300" height="74" rx="37" fill="rgba(255,255,255,.66)" />
      <g className="sl-coin">
        <circle cx="730" cy="700" r="150" fill="#ffffff" />
        <text x="730" y="768" fontFamily="Georgia, 'Times New Roman', serif" fontSize="210" fontWeight="700" fill="#3358d4" textAnchor="middle">£</text>
      </g>
    </svg>
  );
}

function Splash({ gone }) {
  return (
    <div id="splash" className={gone ? 'hide' : ''} style={gone ? { display: 'none' } : undefined}>
      <SplashLogo />
      <div className="splash-name">Pay<span>Batch</span></div>
      <div className="splash-tag">Bulk payments, without the spreadsheet</div>
    </div>
  );
}

export default function App() {
  const { view, ready } = useApp();
  const [splashGone, setSplashGone] = useState(false);

  // App-level modals
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [errorLogOpen, setErrorLogOpen] = useState(false);
  const [appError, setAppError] = useState(null); // { code, message }
  const lastErrorAt = useRef(0);

  const openChangelog = useCallback(() => setChangelogOpen(true), []);
  const openErrorLog = useCallback(() => setErrorLogOpen(true), []);

  // Reveal the app once data is ready, holding the splash briefly for a smooth start.
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => setSplashGone(true), 1150); // let the logo animation play
    return () => clearTimeout(t);
  }, [ready]);

  // Global error capture → log + show a reference code (ported from renderer.js).
  useEffect(() => {
    async function report(context, err) {
      const message = err && err.message ? err.message : String(err);
      const stack = (err && err.stack) || '';
      let code = 'ERR-LOCAL';
      try { const r = await window.api.logError({ context, message, stack }); if (r && r.code) code = r.code; } catch (_) { /* ignore */ }
      const now = Date.now();
      if (now - lastErrorAt.current < 500) return;
      lastErrorAt.current = now;
      setAppError({ code, message });
    }
    const onError = (e) => report('renderer', e.error || { message: e.message, stack: `${e.filename}:${e.lineno}` });
    const onRej = (e) => { const r = e.reason; report('promise', r instanceof Error ? r : { message: String(r), stack: '' }); };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRej);
    return () => { window.removeEventListener('error', onError); window.removeEventListener('unhandledrejection', onRej); };
  }, []);

  return (
    <>
      <Splash gone={splashGone} />

      <div className="app-shell">
        <Sidebar />
        <div className="app-body">
          <UpdateBanner onWhatsNew={openChangelog} />
          <main>
            <section className={'view' + (view === 'home' ? ' active' : '')} style={{ display: view === 'home' ? 'block' : 'none' }}>
              {view === 'home' && <Home />}
            </section>
            <section className={'view' + (view === 'batch' ? ' active' : '')} style={{ display: view === 'batch' ? 'block' : 'none' }}>
              {view === 'batch' && <Build />}
            </section>
            <section className={'view' + (view === 'payees' ? ' active' : '')} style={{ display: view === 'payees' ? 'block' : 'none' }}>
              {view === 'payees' && <Payees />}
            </section>
            <section className={'view' + (view === 'history' ? ' active' : '')} style={{ display: view === 'history' ? 'block' : 'none' }}>
              {view === 'history' && <History />}
            </section>
            <section className={'view' + (view === 'help' ? ' active' : '')} style={{ display: view === 'help' ? 'block' : 'none' }}>
              {view === 'help' && <Help onChangelog={openChangelog} onErrorLog={openErrorLog} />}
            </section>
          </main>
          <Footer onChangelog={openChangelog} />
        </div>
      </div>

      <ChangelogModal open={changelogOpen} onOpenChange={setChangelogOpen} />
      <ErrorLogModal open={errorLogOpen} onOpenChange={setErrorLogOpen} />
      <ErrorModal error={appError} onClose={() => setAppError(null)} onViewLog={() => { setAppError(null); openErrorLog(); }} />
    </>
  );
}
