import { useState } from 'react';
import { useApp } from '../store.jsx';
import { validateRow, emptyPayment, SEPA } from '../lib/payments.js';

const BLANK = { name: '', sortCode: '', accountNumber: '', iban: '', bic: '', amount: '', reference: '', rti: '', savePayee: false, payeeId: '' };

export default function AddPaymentForm() {
  const { Core, settings, data, setBatch, upsertPayee, showToast } = useApp();
  const S = Core.Santander;
  const [form, setForm] = useState(BLANK);
  const isSepa = settings.outputFormat === SEPA;
  const isBacs = settings.outputFormat === S.OUTPUT_FORMATS.BACS_IMPORT;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const payees = data.payees.slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  const onPickPayee = (e) => {
    const p = data.payees.find((x) => x.id === e.target.value);
    if (!p) { setForm((f) => ({ ...f, payeeId: '' })); return; }
    setForm((f) => ({ ...f, payeeId: p.id, name: p.name || '', sortCode: p.sortCode || '', accountNumber: p.accountNumber || '', reference: p.reference || '' }));
  };

  const submit = (e) => {
    e.preventDefault();
    const p = {
      name: form.name, sortCode: form.sortCode, accountNumber: form.accountNumber,
      iban: form.iban, bic: form.bic, amount: form.amount, reference: form.reference, rti: form.rti
    };
    const { errors } = validateRow(p, settings);
    if (errors.length) { showToast('Fix before adding: ' + errors[0], true); return; }
    setBatch((prev) => [...prev, { ...emptyPayment(), ...p }]);
    if (form.savePayee) {
      upsertPayee({ id: 'py_' + Date.now(), name: p.name.trim(), sortCode: p.sortCode, accountNumber: p.accountNumber, reference: p.reference });
    }
    setForm(BLANK);
    showToast('Payment added');
  };

  return (
    <div className="card">
      <h2>Add a payment</h2>
      <label>Quick add from saved payee
        <select value={form.payeeId} onChange={onPickPayee}>
          <option value="">— choose a saved payee —</option>
          {payees.map((p) => (
            <option key={p.id} value={p.id}>{p.name} — {S.formatSortCode(p.sortCode)} / {String(p.accountNumber || '').replace(/\D/g, '')}</option>
          ))}
        </select>
      </label>

      <form onSubmit={submit} autoComplete="off">
        <label>Beneficiary name
          <input type="text" placeholder="e.g. Acme Ltd" value={form.name} onChange={set('name')} />
        </label>
        {!isSepa && (
          <div className="row">
            <label>Sort code <input type="text" inputMode="numeric" placeholder="12-34-56" value={form.sortCode} onChange={set('sortCode')} /></label>
            <label>Account number <input type="text" inputMode="numeric" placeholder="12345678" value={form.accountNumber} onChange={set('accountNumber')} /></label>
          </div>
        )}
        {isSepa && (
          <>
            <label>IBAN <input type="text" placeholder="DE89 3704 0044 0532 0130 00" value={form.iban} onChange={set('iban')} /></label>
            <label>BIC <span className="hint">optional</span> <input type="text" placeholder="DEUTDEFF" value={form.bic} onChange={set('bic')} /></label>
          </>
        )}
        <div className="row">
          <label>Amount <input type="text" inputMode="decimal" placeholder="0.00" value={form.amount} onChange={set('amount')} /></label>
          <label>Reference <input type="text" placeholder="INV-1001" value={form.reference} onChange={set('reference')} /></label>
        </div>
        {isBacs && (
          <label>RTI reference <span className="hint">optional, HMRC e.g. /123</span>
            <input type="text" placeholder="/123" value={form.rti} onChange={set('rti')} />
          </label>
        )}
        <label className="check">
          <input type="checkbox" checked={form.savePayee} onChange={(e) => setForm((f) => ({ ...f, savePayee: e.target.checked }))} /> Also save this payee for next time
        </label>
        <div className="form-actions">
          <button type="submit" className="btn primary">Add to batch</button>
          <button type="button" className="btn ghost" onClick={() => setForm(BLANK)}>Clear</button>
        </div>
      </form>
    </div>
  );
}
