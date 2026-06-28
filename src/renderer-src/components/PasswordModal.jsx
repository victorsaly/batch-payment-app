import { useEffect, useState } from 'react';
import Modal from './Modal.jsx';

/* Password prompt for backup encrypt / restore decrypt. `confirm` requires the
 * password to be typed twice (backup). Resolves via onSubmit(password). */
export default function PasswordModal({ open, title, help, confirm, onSubmit, onCancel }) {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => { if (open) { setPw(''); setPw2(''); setErr(''); } }, [open]);

  const submit = () => {
    if (!pw) { setErr('Please enter a password.'); return; }
    if (confirm && pw !== pw2) { setErr('The two passwords don’t match.'); return; }
    onSubmit(pw);
  };
  const onKey = (e) => { if (e.key === 'Enter') submit(); };

  return (
    <Modal open={open} onOpenChange={(o) => { if (!o) onCancel(); }} title={title || 'Password'}>
      {help && <p className="muted">{help}</p>}
      <label>Password <input type="password" autoComplete="off" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={onKey} /></label>
      {confirm && <label>Confirm password <input type="password" autoComplete="off" value={pw2} onChange={(e) => setPw2(e.target.value)} onKeyDown={onKey} /></label>}
      {err && <p className="field-msg err">{err}</p>}
      <div className="form-actions">
        <button className="btn primary" onClick={submit}>OK</button>
        <button className="btn ghost" onClick={onCancel}>Cancel</button>
      </div>
    </Modal>
  );
}
