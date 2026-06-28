import { useEffect, useState } from 'react';
import Modal from './Modal.jsx';
import { useApp } from '../store.jsx';
import { onlyDigits } from '../lib/payments.js';

export default function PayeeModal({ open, payee, onOpenChange }) {
  const { upsertPayee, showToast } = useApp();
  const [form, setForm] = useState({ name: '', sortCode: '', accountNumber: '', reference: '' });

  useEffect(() => {
    if (!open) return;
    setForm({
      name: payee ? payee.name || '' : '',
      sortCode: payee ? payee.sortCode || '' : '',
      accountNumber: payee ? payee.accountNumber || '' : '',
      reference: payee ? payee.reference || '' : ''
    });
  }, [open, payee]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = () => {
    const name = form.name.trim();
    if (!name) { showToast('Name is required', true); return; }
    if (onlyDigits(form.sortCode).length !== 6) { showToast('Sort code must be 6 digits', true); return; }
    if (onlyDigits(form.accountNumber).length !== 8) { showToast('Account number must be 8 digits', true); return; }
    upsertPayee({
      id: (payee && payee.id) || 'py_' + Date.now(),
      name, sortCode: form.sortCode, accountNumber: form.accountNumber, reference: form.reference.trim()
    });
    showToast('Payee saved');
    onOpenChange(false);
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange} title={payee ? 'Edit payee' : 'New payee'}>
      <label>Name <input type="text" value={form.name} onChange={set('name')} autoFocus /></label>
      <div className="row">
        <label>Sort code <input type="text" placeholder="12-34-56" value={form.sortCode} onChange={set('sortCode')} /></label>
        <label>Account number <input type="text" placeholder="12345678" value={form.accountNumber} onChange={set('accountNumber')} /></label>
      </div>
      <label>Default reference (optional) <input type="text" value={form.reference} onChange={set('reference')} /></label>
      <div className="form-actions">
        <button className="btn primary" onClick={save}>Save</button>
        <button className="btn ghost" onClick={() => onOpenChange(false)}>Cancel</button>
      </div>
    </Modal>
  );
}
