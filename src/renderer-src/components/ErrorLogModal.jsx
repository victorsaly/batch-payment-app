import { useEffect, useState, useCallback } from 'react';
import Modal from './Modal.jsx';
import { useApp } from '../store.jsx';

export default function ErrorLogModal({ open, onOpenChange }) {
  const { showToast } = useApp();
  const [list, setList] = useState(null);

  const load = useCallback(async () => {
    setList(null);
    let l = [];
    try { l = await window.api.listErrors(); } catch (_) { /* ignore */ }
    setList(l);
  }, []);

  useEffect(() => { if (open) load(); }, [open, load]);

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Error log" hideTitle wide>
      <div className="card-head">
        <h3>Error log</h3>
        <button className="btn ghost tiny" onClick={() => onOpenChange(false)}>Close</button>
      </div>
      <div className="changelog-body">
        {list === null && 'Loading…'}
        {list !== null && list.length === 0 && <p className="recent-empty">No errors recorded. 🎉</p>}
        {list !== null && list.map((e, i) => (
          <div className="errlog-item" key={i}>
            <div className="errlog-top"><code>{e.code}</code><span>{new Date(e.time).toLocaleString()}</span></div>
            <div className="errlog-msg">{e.message}</div>
            <div className="errlog-meta">{e.context} · v{e.version} · {e.platform}</div>
          </div>
        ))}
      </div>
      <div className="form-actions">
        <button className="btn ghost" onClick={() => window.api.revealErrorLog()}>Open log file</button>
        <button className="btn ghost danger" onClick={async () => { await window.api.clearErrors(); load(); showToast('Error log cleared'); }}>Clear log</button>
      </div>
    </Modal>
  );
}
