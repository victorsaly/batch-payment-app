import { useState, useEffect } from 'react';
import Modal from './Modal.jsx';
import * as Core from '../core.js';
import { SEPA } from '../lib/payments.js';

const S = Core.Santander;

function fieldDefs(outputFormat) {
  if (outputFormat === SEPA) {
    return [
      { key: 'name', label: 'Beneficiary name', required: true },
      { key: 'iban', label: 'IBAN', required: true },
      { key: 'bic', label: 'BIC (optional)', required: false },
      { key: 'amount', label: 'Amount', required: true },
      { key: 'reference', label: 'Reference', required: false }
    ];
  }
  return [
    { key: 'name', label: 'Beneficiary name', required: true },
    { key: 'sort', label: 'Sort code', required: true },
    { key: 'account', label: 'Account number', required: true },
    { key: 'amount', label: 'Amount', required: true },
    { key: 'reference', label: 'Reference', required: false }
  ];
}

export default function ColumnMapper({ analysis, settings, onImport, onClose }) {
  const open = !!analysis;
  const defs = fieldDefs(settings.outputFormat);
  const [mapping, setMapping] = useState({});
  const [error, setError] = useState('');

  useEffect(() => {
    if (!analysis) return;
    const sugg = analysis.suggestion || {};
    const init = {};
    defs.forEach((d) => { init[d.key] = sugg[d.key] == null ? -1 : sugg[d.key]; });
    setMapping(init);
    setError('');
  }, [analysis]);

  if (!open) return null;

  const doImport = () => {
    const full = { name: -1, sort: -1, account: -1, amount: -1, reference: -1, iban: -1, bic: -1, ...mapping };
    const missing = defs.filter((d) => d.required && (full[d.key] == null || full[d.key] < 0)).map((d) => d.label);
    if (missing.length) { setError('Please choose a column for: ' + missing.join(', ')); return; }
    const rows = S.rowsToPayments(analysis.dataRows, full);
    onImport(rows);
  };

  return (
    <Modal open={open} onOpenChange={(o) => { if (!o) onClose(); }} title="Match your columns" hideTitle wide>
      <div className="card-head">
        <h3>Match your columns</h3>
        <button className="btn ghost tiny" onClick={onClose}>Cancel</button>
      </div>
      <p className="muted">Tell PayBatch which column holds each field. We’ve guessed from your file — adjust any that are wrong, then import.</p>
      <div className="map-fields">
        {defs.map((d) => (
          <label className="map-field" key={d.key}>
            <span>{d.label}{d.required ? ' *' : ''}</span>
            <select value={mapping[d.key] ?? -1} onChange={(e) => setMapping((m) => ({ ...m, [d.key]: parseInt(e.target.value, 10) }))}>
              <option value={-1}>— none —</option>
              {analysis.headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
            </select>
          </label>
        ))}
      </div>
      <h4 className="map-preview-title">Preview (first rows)</h4>
      <div className="map-preview">
        <table className="preview-table">
          <thead><tr>{analysis.headers.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
          <tbody>
            {analysis.preview.map((r, ri) => (
              <tr key={ri}>{analysis.headers.map((_, ci) => <td key={ci}>{r[ci] == null ? '' : r[ci]}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
      {error && <p className="field-msg err">{error}</p>}
      <div className="form-actions">
        <button className="btn primary" onClick={doImport}>Import</button>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  );
}
