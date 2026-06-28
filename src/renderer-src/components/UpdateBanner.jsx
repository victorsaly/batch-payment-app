import { useEffect, useState, useRef } from 'react';
import { useApp } from '../store.jsx';

// Smooth OS-detecting download page (used only by the dev/unsigned fallback;
// packaged builds download + install in-app via electron-updater).
const DOWNLOAD_PAGE = 'https://victorsaly.github.io/batch-payment-app/#download';

/* Update banner. Packaged builds get real electron-updater events (download +
 * install in-app); dev/unpackaged falls back to the lightweight GitHub-API
 * check whose Download button opens the browser. Ported from renderer.js. */
export default function UpdateBanner({ onWhatsNew }) {
  const { showToast } = useApp();
  const [state, setState] = useState({ visible: false, text: '', action: 'open', label: 'Download', url: '', busy: false });
  const autoMode = useRef(false);
  const manualPending = useRef(false);

  useEffect(() => {
    let off;
    (async () => {
      let supported = false;
      try { supported = await window.api.updateSupported(); } catch (_) { /* keep false */ }
      autoMode.current = supported;

      if (supported) {
        off = window.api.onUpdateEvent((p) => {
          if (p.type === 'available') {
            setState({ visible: true, text: `PayBatch ${p.version} is available.`, action: 'download', label: 'Download', url: '', busy: false });
          } else if (p.type === 'progress') {
            setState((s) => ({ ...s, visible: true, text: `Downloading update… ${p.percent}%`, busy: true }));
          } else if (p.type === 'downloaded') {
            setState({ visible: true, text: `Update ${p.version} is ready to install.`, action: 'install', label: 'Restart & install', url: '', busy: false });
          } else if (p.type === 'none') {
            if (manualPending.current) { showToast('You’re on the latest version'); manualPending.current = false; }
          } else if (p.type === 'error') {
            if (manualPending.current) { showToast('Could not check for updates right now', true); manualPending.current = false; }
          }
        });
      } else {
        let res;
        try { res = await window.api.checkUpdate(); } catch (_) { res = { ok: false }; }
        if (res && res.available) {
          setState({ visible: true, text: `PayBatch ${res.latest} is available (you have ${res.current}).`, action: 'open', label: 'Download', url: res.url || '', busy: false });
        }
      }
    })();
    return () => { if (typeof off === 'function') off(); };
  }, [showToast]);

  if (!state.visible) return null;

  const onDownload = () => {
    if (state.action === 'download') window.api.downloadUpdate();
    else if (state.action === 'install') window.api.installUpdate();
    else window.api.openExternal(DOWNLOAD_PAGE);
  };

  return (
    <div className="update-banner">
      <span>{state.text}</span>
      <span className="spacer"></span>
      <button className="btn tiny ghost" onClick={onWhatsNew}>What’s new</button>
      <button className="btn tiny primary" disabled={state.busy} onClick={onDownload}>{state.label}</button>
      <button className="btn tiny ghost" onClick={() => setState((s) => ({ ...s, visible: false }))}>Dismiss</button>
    </div>
  );
}
