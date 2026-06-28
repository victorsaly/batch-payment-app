import Modal from './Modal.jsx';
import { useApp } from '../store.jsx';

export default function ErrorModal({ error, onClose, onViewLog }) {
  const { showToast } = useApp();
  const open = !!error;

  const copy = async () => {
    try { await navigator.clipboard.writeText(error.code); showToast('Reference code copied'); }
    catch (_) { showToast('Could not copy', true); }
  };

  return (
    <Modal open={open} onOpenChange={(o) => { if (!o) onClose(); }} title="Something went wrong" hideTitle>
      <h3>⚠️ Something went wrong</h3>
      <p className="error-msg">{error ? (error.message || 'An unexpected error occurred.') : ''}</p>
      <div className="error-code-row">
        <span>Reference</span>
        <code>{error ? error.code : 'ERR-—'}</code>
        <button className="btn ghost tiny" onClick={copy}>Copy</button>
      </div>
      <p className="hint">Quote this code if you report the issue. Nothing was sent anywhere.</p>
      <div className="form-actions">
        <button className="btn ghost" onClick={onViewLog}>View error log</button>
        <button className="btn primary" onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}
