import { useEffect, useState } from 'react';
import { useApp } from '../store.jsx';

export default function Footer({ onChangelog }) {
  const { toast } = useApp();
  const [version, setVersion] = useState('');
  const [storage, setStorage] = useState({ label: 'Stored locally on this device', path: '' });
  const [toastView, setToastView] = useState({ msg: '', error: false, show: false });

  useEffect(() => {
    (async () => {
      try { const v = await window.api.appVersion(); setVersion(v); } catch (_) { /* ignore */ }
      try {
        const st = await window.api.dataStatus();
        setStorage({
          label: st.encrypted ? '🔒 Encrypted & stored on this device' : '⚠️ Stored on this device (unencrypted)',
          path: st.path || ''
        });
      } catch (_) { /* ignore */ }
    })();
  }, []);

  // Show each new toast for 3.6s.
  useEffect(() => {
    if (!toast.n) return;
    setToastView({ msg: toast.msg, error: toast.error, show: true });
    const t = setTimeout(() => setToastView((v) => ({ ...v, show: false })), 3600);
    return () => clearTimeout(t);
  }, [toast.n, toast.msg, toast.error]);

  return (
    <footer className="statusbar">
      <span className="status-left">
        <button className="version-pill" title="View changelog" onClick={onChangelog}>
          {version ? `PayBatch v${version}` : 'PayBatch'}
        </button>
        <span id="storage-path" title={storage.path}>{storage.label}</span>
      </span>
      <span className="status-right">
        <span className={'toast' + (toastView.show ? ' show' : '') + (toastView.error ? ' err' : '')}>{toastView.msg}</span>
        <span className="author">
          Created by <button className="link-quiet" onClick={() => window.api.openExternal('https://github.com/victorsaly')}>Victor Saly</button>
        </span>
      </span>
    </footer>
  );
}
