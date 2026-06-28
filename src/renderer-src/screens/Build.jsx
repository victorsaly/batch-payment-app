import { useEffect, useState, useCallback } from 'react';
import { useApp } from '../store.jsx';
import { validateRow, emptyPayment, SEPA, ISO20022, STANDARD18, EXPORT_LABELS } from '../lib/payments.js';
import SettingsCard from '../components/SettingsCard.jsx';
import AddPaymentForm from '../components/AddPaymentForm.jsx';
import BatchGrid from '../components/BatchGrid.jsx';
import ColumnMapper from '../components/ColumnMapper.jsx';

export default function Build() {
  const { Core, settings, updateSettings, batch, setBatch, saveBatch, showToast, view, intent, setIntent } = useApp();
  const S = Core.Santander;
  const [analysis, setAnalysis] = useState(null); // column-mapper input
  const bank = Core.Banks.get(settings.selectedBank) || Core.Banks.get('santander');
  const available = bank.status === 'available';

  // ---- cell + row ops (caret-safe: only the edited row's object changes) ----
  const onCell = useCallback((id, field, value) => {
    setBatch((prev) => prev.map((r) => (r._id === id ? { ...r, [field]: value } : r)));
  }, [setBatch]);
  const onRemove = useCallback((id) => setBatch((prev) => prev.filter((r) => r._id !== id)), [setBatch]);
  const onAddRow = () => setBatch((prev) => [...prev, emptyPayment()]);
  const onClear = () => { if (batch.length && confirm('Clear all payments from the current batch?')) setBatch([]); };

  // ---- import ----
  const addImportedRows = useCallback((rows) => {
    if (!rows || !rows.length) { showToast('No payment rows found in that file', true); return; }
    setBatch((prev) => prev.concat(rows));
    showToast(`Imported ${rows.length} payment${rows.length > 1 ? 's' : ''} — review highlighted rows`);
  }, [setBatch, showToast]);

  const onImport = useCallback(async () => {
    const res = await window.api.importFile();
    if (!res || !res.imported) return;
    try {
      const a = S.analyzeImport(res.contents);
      if (a.generated) { addImportedRows(a.payments); return; }
      if (!a.dataRows.length) { showToast('No payment rows found in that file', true); return; }
      setAnalysis(a);
    } catch (_) { showToast('Could not read that file', true); }
  }, [S, addImportedRows, showToast]);

  // Home → "Import a file" sets this intent; run it once on entry.
  useEffect(() => {
    if (view === 'batch' && intent === 'import') { setIntent(null); if (available) onImport(); }
  }, [view, intent, available, onImport, setIntent]);

  // ---- paste straight from Excel/Sheets (tabular clipboard) ----
  useEffect(() => {
    const onPaste = (e) => {
      if (view !== 'batch' || !available) return;
      const text = (e.clipboardData || window.clipboardData)?.getData?.('text') || '';
      if (!text) return;
      const isTabular = text.indexOf('\t') !== -1 || /\n.*\S/.test(text.trim());
      if (!isTabular) return;
      const rows = S.importPayments(text);
      if (!rows.length) return;
      e.preventDefault();
      setBatch((prev) => prev.concat(rows));
      showToast(`Pasted ${rows.length} payment${rows.length > 1 ? 's' : ''} from the clipboard — review highlighted rows`);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [view, available, S, setBatch, showToast]);

  // ---- template ----
  const onTemplate = async () => {
    const res = await window.api.exportFile({ suggestedName: 'batch-payment-template.csv', contents: S.buildTemplate(), kind: 'template' });
    if (res && res.saved) showToast('Template saved & opened — fill it in, then Import');
  };

  // ---- save to history ----
  const onSave = () => {
    if (!batch.length) return;
    saveBatch({
      id: 'b_' + Date.now(),
      savedAt: new Date().toISOString(),
      total: S.totalAmount(batch),
      paymentType: settings.paymentType,
      settings: { ...settings },
      payments: batch.map(({ _id, ...p }) => p)
    });
    showToast('Batch saved to history');
  };

  // ---- export (ported faithfully from renderer.js) ----
  const onExport = async () => {
    const format = settings.outputFormat;
    const stamp = S.toDDMMYYYY(S.todayISO());
    if (!batch.length) { showToast('Add at least one payment first', true); return; }
    if (batch.map((p) => validateRow(p, settings)).some((r) => r.errors.length)) { showToast('Fix the highlighted errors first', true); return; }

    let contents, suggestedName, exportKind;
    const now = new Date();
    const messageId = ('PB' + now.toISOString().replace(/[^0-9]/g, '').slice(0, 14) + Math.random().toString(36).slice(2, 6).toUpperCase()).slice(0, 35);

    if (format === SEPA) {
      const sepaSettings = { debtorName: settings.fileLocationId || '', debtorIban: settings.debtorIban, debtorBic: settings.debtorBic, requestedExecutionDate: settings.paymentDate, creationDateTime: now.toISOString().slice(0, 19), messageId };
      const sv = Core.Sepa.validateSepaSettings(sepaSettings);
      if (!sv.valid) { showToast('Settings: ' + sv.errors[0], true); return; }
      contents = Core.Sepa.buildSepaPain001(sepaSettings, batch);
      suggestedName = `sepa-pain001-${stamp}.xml`; exportKind = 'xml';
    } else if (format === ISO20022) {
      const isoSettings = { debtorName: settings.fileLocationId || '', debtorSort: settings.debitSortCode, debtorAccount: settings.debitAccountNumber, requestedExecutionDate: settings.paymentDate, creationDateTime: now.toISOString().slice(0, 19), messageId };
      const sv = Core.ISO20022.validateIso20022Settings(isoSettings);
      if (!sv.valid) { showToast('Settings: ' + sv.errors[0], true); return; }
      contents = Core.ISO20022.buildPain001(isoSettings, batch);
      suggestedName = `iso20022-pain001-${stamp}.xml`; exportKind = 'xml';
    } else if (format === STANDARD18) {
      const s18 = { originatorSort: settings.debitSortCode, originatorAccount: settings.debitAccountNumber, originatorName: settings.fileLocationId || '' };
      const sv = Core.Standard18.validateStandard18Settings(s18);
      if (!sv.valid) { showToast('Settings: ' + sv.errors[0], true); return; }
      contents = Core.Standard18.buildStandard18File(s18, batch);
      suggestedName = `bacs-standard18-${stamp}.txt`;
    } else {
      const sv = S.validateSettings(settings, format);
      if (!sv.valid) { showToast('Settings: ' + sv.errors[0], true); return; }
      contents = S.buildOutput(format, { ...settings, creationDate: S.todayISO() }, batch);
      const seq = Number(settings.sequenceNumber);
      suggestedName = format === S.OUTPUT_FORMATS.MIXED ? `santander-mixed-${stamp}.txt` : `santander-bacs-${stamp}-seq${seq}.txt`;
    }

    const res = await window.api.exportFile({ suggestedName, contents, kind: exportKind });
    if (res && res.saved) {
      if (format === S.OUTPUT_FORMATS.BACS_IMPORT) updateSettings({ sequenceNumber: Math.min(Number(settings.sequenceNumber) + 1, 9999) });
      showToast('Exported & opened: ' + res.filePath);
    }
  };

  // ---- footer summary ----
  const results = batch.map((p) => validateRow(p, settings));
  const errorCount = results.filter((r) => r.errors.length).length;
  const warnCount = results.filter((r) => !r.errors.length && r.warnings.length).length;
  const hasRows = batch.length > 0;

  if (!available) {
    return (
      <div className="card coming-soon">
        <div className="cs-tile" style={{ background: bank.color }}>{bank.initial}</div>
        <div className="cs-body">
          <h2>{bank.name} — coming soon</h2>
          <p>{bank.note}</p>
          <p className="hint">This bank is on the roadmap. Pick an available bank on the Home screen to build a file now.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <SettingsCard />
      <div className="grid">
        <AddPaymentForm />
        <div className="card grow">
          <div className="card-head">
            <h2>Current batch <span className="hint">cells are editable — fix errors in place</span></h2>
            <div className="head-actions">
              <button className="btn ghost" onClick={onAddRow}>+ Add row</button>
              <button className="btn ghost" onClick={onImport}>Import…</button>
              <button className="btn ghost" onClick={onTemplate}>Template</button>
              <button className="btn ghost danger" onClick={onClear}>Clear</button>
            </div>
          </div>

          {!hasRows
            ? (
              <div className="empty">
                No payments yet. Add one on the left, click <strong>+ Add row</strong>,
                <strong> paste rows straight from Excel</strong>, or <strong>Import</strong> a CSV
                (grab the <strong>Template</strong> first).
              </div>
            )
            : <BatchGrid batch={batch} settings={settings} onCell={onCell} onRemove={onRemove} />}

          <div className="batch-footer">
            <div className="totals">
              <span><strong>{batch.length}</strong> payments</span>
              <span>Total <strong>£{S.formatAmount(S.totalAmount(batch))}</strong></span>
              <span className={'badge ' + (errorCount ? 'err' : warnCount ? 'warn' : 'ok')}>
                {errorCount ? `${errorCount} row${errorCount > 1 ? 's' : ''} with errors` : warnCount ? `${warnCount} to double-check` : (hasRows ? 'All valid' : '')}
              </span>
            </div>
            <div className="export-actions">
              <button className="btn ghost" onClick={onSave} disabled={!hasRows}>Save batch</button>
              <button className="btn primary" onClick={onExport} disabled={!hasRows || errorCount > 0}>{EXPORT_LABELS[settings.outputFormat] || 'Export file'}</button>
            </div>
          </div>
        </div>
      </div>

      <ColumnMapper analysis={analysis} settings={settings} onImport={(rows) => { setAnalysis(null); addImportedRows(rows); }} onClose={() => setAnalysis(null)} />
    </>
  );
}
