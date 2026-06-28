import { useEffect, useState } from 'react';
import { useApp } from '../store.jsx';
import PasswordModal from '../components/PasswordModal.jsx';

export default function Help({ onChangelog, onErrorLog }) {
  const { replaceData, showToast } = useApp();
  const [version, setVersion] = useState('—');
  const [encrypted, setEncrypted] = useState(true);
  const [pwModal, setPwModal] = useState({ open: false, mode: null, filePath: null });

  useEffect(() => {
    (async () => {
      try { setVersion('v' + await window.api.appVersion()); } catch (_) { /* ignore */ }
      try { const st = await window.api.dataStatus(); setEncrypted(!!st.encrypted); } catch (_) { /* ignore */ }
    })();
  }, []);

  const onBackup = () => setPwModal({ open: true, mode: 'backup', filePath: null });

  const onRestore = async () => {
    const ok = window.confirm(
      'Restoring will REPLACE your current payees, saved batches and settings with the '
      + 'contents of the backup file. This cannot be undone.\n\nContinue?');
    if (!ok) return;
    try {
      const r = await window.api.importData();
      if (r && r.needPassword) { setPwModal({ open: true, mode: 'restore', filePath: r.filePath }); return; }
      if (!r || !r.restored) { if (r && r.error) showToast(r.error, true); return; }
      replaceData(r.data);
      showToast(`Restored — ${r.counts.payees} payees, ${r.counts.batches} batches`);
    } catch (_) { showToast('Could not restore from that file', true); }
  };

  const onPwSubmit = async (password) => {
    const { mode, filePath } = pwModal;
    setPwModal({ open: false, mode: null, filePath: null });
    if (mode === 'backup') {
      try {
        const r = await window.api.exportData(password);
        if (r && r.saved) showToast(`Encrypted backup saved — ${r.counts.payees} payees, ${r.counts.batches} batches`);
      } catch (_) { showToast('Could not save the backup', true); }
    } else if (mode === 'restore') {
      try {
        const r = await window.api.importData({ password, filePath });
        if (!r || !r.restored) { if (r && r.error) showToast(r.error, true); return; }
        replaceData(r.data);
        showToast(`Restored — ${r.counts.payees} payees, ${r.counts.batches} batches`);
      } catch (_) { showToast('Could not restore from that file', true); }
    }
  };

  const checkUpdates = async () => {
    showToast('Checking for updates…');
    try {
      if (await window.api.updateSupported()) { window.api.checkForUpdatesAuto(); return; }
      const res = await window.api.checkUpdate();
      if (res && res.available) showToast(`PayBatch ${res.latest} is available`);
      else if (res && res.ok) showToast('You’re on the latest version');
      else showToast('Could not check for updates right now', true);
    } catch (_) { showToast('Could not check for updates right now', true); }
  };

  return (
    <div className="card docs">
      <h2>How to use PayBatch</h2>
      <p>PayBatch builds the bulk-payment import file your bank expects, so you can skip
        the manual spreadsheet. It supports <strong>Santander Connect</strong>, Bacs
        Standard 18, ISO 20022 and SEPA, with more banks planned.</p>

      <h3>1. Choose your output format</h3>
      <p>At the top of <strong>Build batch</strong>, pick the format your bank expects:</p>
      <ul>
        <li><strong>Bacs import (.txt)</strong> — Santander Connect's official Bacs
          payment import file. Needs your debit account, a payment date, and a file
          sequence number. Choose <em>Single (BACS)</em> for one or more independent
          payments, or <em>Multiple (MULTIBACS)</em> when every payment shares one
          debit account and date (reference then becomes mandatory).</li>
        <li><strong>Mixed payments (.txt)</strong> — the wide 85-column layout. Only a
          payment date and the beneficiary rows are needed.</li>
      </ul>

      <h3>2. Add payments</h3>
      <ul>
        <li>Use the <strong>Add a payment</strong> form on the left, or pick a
          <strong> saved payee</strong> to auto-fill it.</li>
        <li>Click <strong>+ Add row</strong> to type straight into the table.</li>
        <li><strong>Paste straight from Excel</strong> — select your cells, copy, then
          press <strong>Cmd/Ctrl + V</strong> on the Build batch screen.</li>
        <li>Click <strong>Import…</strong> to load a CSV. Click <strong>Template</strong>
          first to get a correctly-formatted file to fill in.</li>
      </ul>

      <h3>3. Fix any errors inline</h3>
      <p>Every cell in the table is editable. Invalid cells are outlined in
        <span className="docs-err"> red</span> with the reason shown underneath; cells that
        will be auto-adjusted are flagged in <span className="docs-warn"> amber</span>. The
        <strong> Export</strong> button stays disabled until every row is valid.</p>

      <h3>4. Export</h3>
      <p>Click <strong>Export</strong>, choose where to save, and the file opens
        automatically so you can eyeball it before uploading to your bank.</p>

      <h3>Validation rules</h3>
      <table className="docs-table">
        <thead><tr><th>Field</th><th>Rule</th></tr></thead>
        <tbody>
          <tr><td>Beneficiary name</td><td>Required. Bacs: uppercased, max 35 (first 18 reach Bacs). Allowed: A–Z 0–9 . - / &amp; space.</td></tr>
          <tr><td>Sort code</td><td>Exactly 6 digits (dashes/spaces are ignored).</td></tr>
          <tr><td>Account number</td><td>Exactly 8 digits.</td></tr>
          <tr><td>Amount</td><td>Greater than 0, pounds &amp; pence (e.g. 150.50).</td></tr>
          <tr><td>Reference</td><td>Max 18 chars. Mandatory for MULTIBACS; optional otherwise.</td></tr>
          <tr><td>RTI reference</td><td>Bacs only, optional. Starts with “/”, e.g. /123.</td></tr>
        </tbody>
      </table>

      <h3>Your data is encrypted</h3>
      <p>{encrypted
        ? 'Payees, saved batches and settings are stored only on this computer, encrypted with your operating-system keychain. Nothing is ever sent over the internet.'
        : 'Your OS keychain wasn’t available, so data is stored locally without encryption. It still never leaves this computer.'}</p>

      <h3>Back up &amp; restore</h3>
      <p>The encrypted store is locked to this computer. Save a <strong>backup file</strong>
        to move your data or keep a safe copy. The backup is <strong>encrypted with a
        password you choose</strong> (AES-256) — keep the password safe, as it can’t be
        recovered.</p>
      <div className="form-actions">
        <button className="btn ghost" onClick={onBackup}>Back up my data…</button>
        <button className="btn ghost" onClick={onRestore}>Restore from backup…</button>
      </div>

      <h3>Important</h3>
      <p>Always do one small <strong>test upload</strong> to confirm a format is accepted
        before relying on it for a full payment run.</p>

      <h3>Disclaimer</h3>
      <p>This is an independent tool and is <strong>not affiliated with, endorsed by, or
        supported by</strong> any bank. It is provided “as is”, without warranty of any kind.
        You are responsible for checking that every beneficiary, sort code, account number,
        amount and reference is correct before submitting a payment file to your bank.</p>

      <h3>FAQ</h3>
      <div className="faq">
        <details>
          <summary>My bank rejected the file — what now?</summary>
          <p>First, always do one small <strong>test upload</strong> before a full run.
            Double-check you picked the right <strong>output format</strong> for your channel.</p>
        </details>
        <details>
          <summary>Why is the Export button greyed out?</summary>
          <p>There's at least one invalid row. Look for cells outlined in
            <span className="docs-err"> red</span> and fix them — Export enables once every row is valid.</p>
        </details>
        <details>
          <summary>What's the amber "modulus check" warning on an account?</summary>
          <p>PayBatch runs the official UK bank <strong>modulus check</strong> (VocaLink /
            Pay.UK). An <span className="docs-warn">amber</span> warning means that
            combination can't be a real account — almost always a <strong>typo</strong>.
            It's a warning, not a block.</p>
        </details>
        <details>
          <summary>Can I paste from Excel or Google Sheets?</summary>
          <p>Yes. Select the cells, copy, then press <strong>Cmd/Ctrl + V</strong> on the
            Build batch screen. Columns are detected automatically.</p>
        </details>
        <details>
          <summary>Can I pay in euros (SEPA)?</summary>
          <p>Yes. Choose the <strong>ISO 20022</strong> bank, then the <strong>SEPA EUR</strong>
            format. The grid switches to <strong>IBAN / BIC</strong> columns. The file is
            SEPA <code>pain.001.001.03</code>.</p>
        </details>
        <details>
          <summary>Is my data sent anywhere?</summary>
          <p>No. Everything stays on this computer and is <strong>encrypted</strong>.
            PayBatch makes no network requests except an optional check for app updates.</p>
        </details>
      </div>

      <h3>Report a problem</h3>
      <p>If something goes wrong, PayBatch records a local error with a short
        <strong> reference code</strong> you can quote when asking for help.</p>
      <p>
        <button className="link" onClick={onErrorLog}>View error log</button> ·{' '}
        <button className="link" onClick={() => window.api.revealErrorLog()}>Open log file</button>
      </p>

      <h3>Version</h3>
      <p>You're running PayBatch <strong>{version}</strong>.{' '}
        <button className="link" onClick={onChangelog}>View changelog</button> ·{' '}
        <button className="link" onClick={checkUpdates}>Check for updates</button>
      </p>
      <p className="credit">Created by <strong>Victor Saly</strong>. Free &amp; open source —{' '}
        <button className="link" onClick={() => window.api.openExternal('https://github.com/victorsaly/batch-payment-app')}>view the source on GitHub</button>.</p>

      <PasswordModal
        open={pwModal.open}
        title={pwModal.mode === 'backup' ? 'Encrypt your backup' : 'Restore backup'}
        help={pwModal.mode === 'backup'
          ? 'Choose a password — you’ll need it to restore. It can’t be recovered if you forget it.'
          : 'This backup is password-protected. Enter its password.'}
        confirm={pwModal.mode === 'backup'}
        onSubmit={onPwSubmit}
        onCancel={() => setPwModal({ open: false, mode: null, filePath: null })}
      />
    </div>
  );
}
