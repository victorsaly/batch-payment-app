/* renderer.js — all UI behaviour. Talks to the saved file only through
 * window.api (preload.js) and to the Bacs format logic through
 * window.Santander (santander.js). */

const S = window.Santander;

let data = { payees: [], batches: [], settings: {} };
let batch = [];                 // payments being built now
let editingPayeeId = null;

// File-level settings for the current run (mirrors the settings card inputs).
let settings = {
  selectedBank: 'santander',
  outputFormat: S.OUTPUT_FORMATS.BACS_IMPORT,
  paymentType: S.PAYMENT_TYPES.SINGLE,
  debitSortCode: '',
  debitAccountNumber: '',
  debtorIban: '',
  debtorBic: '',
  paymentDate: S.todayISO(),
  fileLocationId: '',
  sequenceNumber: 1
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

// ----------------------------------------------------------------- boot
async function init() {
  installErrorHandlers();
  data = await window.api.loadData();
  data.payees = data.payees || [];
  data.batches = data.batches || [];
  data.settings = data.settings || {};

  // Restore remembered settings; payment date always defaults to today.
  applyStoredSettings();

  writeSettingsToInputs();
  renderBankStrip();
  applyBankUI();
  updateBankIndicator();
  renderFormatSeg();
  applyFormatUI();
  initVersionAndUpdates();

  try {
    const st = await window.api.dataStatus();
    $('#storage-path').textContent = (st.encrypted ? '🔒 Encrypted & saved locally at: ' : '⚠️ Saved locally (unencrypted) at: ') + st.path;
    if (!st.encrypted) {
      const ds = $('#docs-storage');
      if (ds) ds.innerHTML = 'Your OS keychain wasn’t available, so data is stored locally <strong>without encryption</strong>. It still never leaves this computer.';
    }
  } catch (_) {}

  wireEvents();
  renderAll();

  // Save once on launch so any legacy plaintext file is migrated to the
  // encrypted store (and removed) right away, not just on the next change.
  await persist();

  // Hold the splash briefly for a smooth start, then reveal the app.
  setTimeout(hideSplash, 650);
}

function renderAll() {
  renderBatch();
  renderPayees();
  renderPayeePicker();
  renderHistory();
  renderHomeRecent();
  updateMultiNote();
}

async function persist() { await window.api.saveData(data); }

// Copy the remembered settings from the saved store into the live `settings`
// object (payment date always defaults to today, so it's deliberately omitted).
function applyStoredSettings() {
  const s = data.settings || {};
  settings.debitSortCode = s.debitSortCode || '';
  settings.debitAccountNumber = s.debitAccountNumber || '';
  settings.debtorIban = s.debtorIban || '';
  settings.debtorBic = s.debtorBic || '';
  settings.fileLocationId = s.fileLocationId || '';
  settings.sequenceNumber = s.sequenceNumber || 1;
  settings.paymentType = s.paymentType || S.PAYMENT_TYPES.SINGLE;
  settings.outputFormat = s.outputFormat || S.OUTPUT_FORMATS.BACS_IMPORT;
  settings.selectedBank = s.selectedBank || 'santander';
}

// ----------------------------------------------------------------- backup / restore
// A small promise-based password prompt (Electron has no window.prompt). When
// `confirm` is set the user must type the password twice (used for backup).
function askPassword({ title, help, confirm }) {
  return new Promise((resolve) => {
    const modal = $('#pw-modal');
    const input = $('#pw-input');
    const confirmInput = $('#pw-confirm');
    const err = $('#pw-error');
    $('#pw-title').textContent = title;
    $('#pw-help').textContent = help || '';
    $('#pw-confirm-wrap').classList.toggle('hidden', !confirm);
    input.value = '';
    confirmInput.value = '';
    err.textContent = '';
    modal.classList.remove('hidden');
    input.focus();

    const close = (value) => {
      modal.classList.add('hidden');
      $('#pw-ok').removeEventListener('click', onOk);
      $('#pw-cancel').removeEventListener('click', onCancel);
      input.removeEventListener('keydown', onKey);
      confirmInput.removeEventListener('keydown', onKey);
      resolve(value);
    };
    const onOk = () => {
      const pw = input.value;
      if (!pw) { err.textContent = 'Please enter a password.'; return; }
      if (confirm && pw !== confirmInput.value) { err.textContent = 'The two passwords don’t match.'; return; }
      close(pw);
    };
    const onCancel = () => close(null);
    const onKey = (e) => { if (e.key === 'Enter') onOk(); else if (e.key === 'Escape') onCancel(); };
    $('#pw-ok').addEventListener('click', onOk);
    $('#pw-cancel').addEventListener('click', onCancel);
    input.addEventListener('keydown', onKey);
    confirmInput.addEventListener('keydown', onKey);
  });
}

async function onBackupData() {
  const password = await askPassword({
    title: 'Encrypt your backup',
    help: 'Choose a password — you’ll need it to restore. It can’t be recovered if you forget it.',
    confirm: true
  });
  if (password === null) return;   // cancelled
  try {
    const r = await window.api.exportData(password);
    if (r && r.saved) toast(`Encrypted backup saved — ${r.counts.payees} payees, ${r.counts.batches} batches`);
  } catch (_) { toast('Could not save the backup', true); }
}

async function onRestoreData() {
  const ok = window.confirm(
    'Restoring will REPLACE your current payees, saved batches and settings with the '
    + 'contents of the backup file. This cannot be undone.\n\nContinue?');
  if (!ok) return;
  try {
    let r = await window.api.importData();   // first call: pick the file
    if (r && r.needPassword) {
      const password = await askPassword({ title: 'Restore backup', help: 'This backup is password-protected. Enter its password.' });
      if (password === null) return;
      r = await window.api.importData({ password, filePath: r.filePath });
    }
    if (!r || !r.restored) { if (r && r.error) toast(r.error, true); return; }
    data = r.data;
    data.payees = data.payees || [];
    data.batches = data.batches || [];
    data.settings = data.settings || {};
    applyStoredSettings();
    writeSettingsToInputs();
    renderBankStrip();
    applyBankUI();
    updateBankIndicator();
    renderFormatSeg();
    applyFormatUI();
    renderAll();
    toast(`Restored — ${r.counts.payees} payees, ${r.counts.batches} batches`);
  } catch (_) { toast('Could not restore from that file', true); }
}

function saveSettingsToData() {
  data.settings = {
    selectedBank: settings.selectedBank,
    outputFormat: settings.outputFormat,
    debitSortCode: settings.debitSortCode,
    debitAccountNumber: settings.debitAccountNumber,
    debtorIban: settings.debtorIban,
    debtorBic: settings.debtorBic,
    fileLocationId: settings.fileLocationId,
    sequenceNumber: settings.sequenceNumber,
    paymentType: settings.paymentType
  };
  persist();
}

const STANDARD18 = 'STANDARD18';
const ISO20022 = 'ISO20022';
const SEPA = 'SEPA';
const FORMAT_LABELS = {
  BACS_IMPORT: 'Bacs import (.txt)',
  MIXED: 'Mixed payments (.txt)',
  STANDARD18: 'Standard 18 (.txt)',
  ISO20022: 'UK domestic (.xml)',
  SEPA: 'SEPA EUR (.xml)'
};
const EXPORT_LABELS = {
  BACS_IMPORT: 'Export Bacs file (.txt)',
  MIXED: 'Export Mixed file (.txt)',
  STANDARD18: 'Export Standard 18 (.txt)',
  ISO20022: 'Export ISO 20022 (.xml)',
  SEPA: 'Export SEPA (.xml)'
};

// Standard 18 and ISO 20022 have no MULTIBACS/reference rules of their own —
// validate their rows like the mixed format (name/sort/account/amount required,
// reference optional).
function validationFormat() {
  return (settings.outputFormat === STANDARD18 || settings.outputFormat === ISO20022)
    ? S.OUTPUT_FORMATS.MIXED : settings.outputFormat;
}

// Rebuild the format toggle from the selected bank's available formats.
function renderFormatSeg() {
  const seg = $('#format-seg');
  const bank = BankReg.get(settings.selectedBank) || BankReg.get('santander');
  const formats = (bank.formats && bank.formats.length) ? bank.formats : ['BACS_IMPORT'];
  if (!formats.includes(settings.outputFormat)) settings.outputFormat = formats[0];
  seg.innerHTML = '';
  formats.forEach((f) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'seg-btn' + (f === settings.outputFormat ? ' active' : '');
    b.dataset.format = f;
    b.textContent = FORMAT_LABELS[f] || f;
    b.addEventListener('click', () => {
      settings.outputFormat = f;
      saveSettingsToData();
      applyFormatUI();
      renderBatch();
    });
    seg.appendChild(b);
  });
}

// Show only the settings each format needs (via data-fmt), relabel Export.
function applyFormatUI() {
  const fmt = settings.outputFormat;
  $$('[data-fmt]').forEach((el) => {
    const fmts = el.getAttribute('data-fmt').split(/\s+/);
    el.classList.toggle('hidden', !fmts.includes(fmt));
  });
  $$('#format-seg .seg-btn').forEach((b) => b.classList.toggle('active', b.dataset.format === fmt));
  $('#export-btn').textContent = EXPORT_LABELS[fmt] || 'Export file (.txt)';
  applyColumnVisibility();
  updateMultiNote();
}

// Show the grid columns each format uses: SEPA → IBAN/BIC; others → sort/account
// (RTI only for the Santander Bacs import format).
function applyColumnVisibility() {
  const fmt = settings.outputFormat;
  const isSepa = fmt === SEPA;
  $$('.col-bacs').forEach((el) => el.classList.toggle('hidden', isSepa));
  $$('.col-sepa').forEach((el) => el.classList.toggle('hidden', !isSepa));
  $$('.rti-col').forEach((el) => el.classList.toggle('hidden', fmt !== S.OUTPUT_FORMATS.BACS_IMPORT));
}

// ----------------------------------------------------------------- navigation
function goToView(view) {
  $$('.tab').forEach((x) => x.classList.toggle('active', x.dataset.view === view));
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + view));
  if (view === 'home') renderHomeRecent();
  document.querySelector('main').scrollTop = 0;
}

function hideSplash() {
  const s = $('#splash');
  if (!s) return;
  s.classList.add('hide');
  setTimeout(() => { s.style.display = 'none'; }, 500);
}

// ----------------------------------------------------------------- bank picker
const BankReg = window.Banks;

function buildBankTile(b) {
  const soon = b.status !== 'available';
  const tile = document.createElement('button');
  tile.type = 'button';
  tile.className = 'bank-tile' + (b.id === settings.selectedBank ? ' active' : '') + (soon ? ' soon' : '');
  tile.dataset.bank = b.id;
  const statusText = b.beta ? 'Beta' : (soon ? 'Coming soon' : 'Available');
  tile.innerHTML = `
    <span class="bank-badge" style="background-color:${b.color}">${esc(b.initial)}</span>
    <span class="bank-meta">
      <span class="bank-name">${esc(b.name)}</span>
      <span class="bank-status${b.beta ? ' beta' : ''}">${statusText}</span>
    </span>`;
  tile.addEventListener('click', () => onSelectBank(b.id));
  return tile;
}

// Render the bank tiles into the Available / Coming-soon groups, filtered by the
// search box.
function renderBankStrip() {
  const avail = $('#home-bank-available');
  const soon = $('#home-bank-soon');
  if (!avail || !soon) return;
  const term = ($('#bank-search') ? $('#bank-search').value : '').trim().toLowerCase();
  avail.innerHTML = '';
  soon.innerHTML = '';
  let nAvail = 0, nSoon = 0;
  BankReg.BANKS.forEach((b) => {
    if (term && b.name.toLowerCase().indexOf(term) === -1) return;
    if (b.status === 'available') { avail.appendChild(buildBankTile(b)); nAvail++; }
    else { soon.appendChild(buildBankTile(b)); nSoon++; }
  });
  const grpA = $('#grp-available'), grpS = $('#grp-soon'), none = $('#bank-noresult');
  if (grpA) grpA.classList.toggle('hidden', nAvail === 0);
  if (grpS) grpS.classList.toggle('hidden', nSoon === 0);
  if (none) none.classList.toggle('hidden', nAvail + nSoon > 0);
}

function onSelectBank(id) {
  settings.selectedBank = id;
  $$('.bank-strip .bank-tile').forEach((t) => t.classList.toggle('active', t.dataset.bank === id));
  applyBankUI();
  updateBankIndicator();
  renderFormatSeg();
  applyFormatUI();
  saveSettingsToData();   // after format may have been reset to the bank's default
  renderBatch();
}

// Compact "selected bank" chip shown on the Build screen (Change ▸ goes Home).
function updateBankIndicator() {
  const bank = BankReg.get(settings.selectedBank) || BankReg.get('santander');
  const badge = $('#chip-badge'), name = $('#chip-name');
  if (badge) { badge.textContent = bank.initial; badge.style.background = bank.color; }
  if (name) name.textContent = bank.name;
}

// ----------------------------------------------------------------- paste from Excel
// When the user copies a block of cells in Excel/Sheets and pastes (Cmd/Ctrl+V),
// the clipboard holds tab-separated rows. Detect that and load it into the batch.
function onPasteIntoBatch(e) {
  if (!$('#view-batch').classList.contains('active')) return;       // only on Build screen
  if (!BankReg.isAvailable(settings.selectedBank)) return;          // not while "coming soon"

  const text = (e.clipboardData || window.clipboardData || {}).getData
    ? (e.clipboardData || window.clipboardData).getData('text') : '';
  if (!text) return;

  // A single value (no tabs, single line) is a normal field paste — leave it.
  const isTabular = text.indexOf('\t') !== -1 || /\n.*\S/.test(text.trim());
  if (!isTabular) return;

  const rows = S.importPayments(text);
  if (!rows.length) return;

  e.preventDefault();
  batch = batch.concat(rows);
  renderBatch();
  toast(`Pasted ${rows.length} payment${rows.length > 1 ? 's' : ''} from the clipboard — review highlighted rows`);
}

// Quick "your data" summary on the home screen.
function renderHomeRecent() {
  const el = $('#home-recent');
  if (!el) return;
  let html = '<h3>Your data</h3>';
  html += `<div class="recent-row"><span>Saved payees</span><strong>${data.payees.length}</strong></div>`;
  html += `<div class="recent-row"><span>Saved batches</span><strong>${data.batches.length}</strong></div>`;
  const recent = data.batches.slice(0, 3);
  if (recent.length) {
    html += '<h3>Recent batches</h3>';
    recent.forEach((b) => {
      html += `<div class="recent-row"><span>${esc(new Date(b.savedAt).toLocaleDateString())} · ${b.payments.length} payment${b.payments.length === 1 ? '' : 's'}</span><strong>£${esc(S.formatAmount(b.total))}</strong></div>`;
    });
  } else {
    html += '<p class="recent-empty">No saved batches yet — your past runs will show here.</p>';
  }
  el.innerHTML = html;
}

// Show the working area only for an available bank; otherwise a "coming soon" card.
function applyBankUI() {
  const bank = BankReg.get(settings.selectedBank) || BankReg.get('santander');
  const available = bank.status === 'available';
  $('#bank-workspace').classList.toggle('hidden', !available);
  $('#coming-soon').classList.toggle('hidden', available);
  if (!available) {
    $('#cs-tile').textContent = bank.initial;
    $('#cs-tile').style.background = bank.color;
    $('#cs-title').textContent = `${bank.name} — coming soon`;
    $('#coming-soon-text').textContent = bank.note;
  }
}

// ----------------------------------------------------------------- version / updates
async function initVersionAndUpdates() {
  try {
    const v = await window.api.appVersion();
    const el = $('#app-version');
    if (el) el.textContent = 'v' + v;
    const fv = $('#footer-version');
    if (fv) fv.textContent = 'PayBatch v' + v;
  } catch (_) {}

  // In a packaged build electron-updater drives the banner (real in-app
  // download + install). In dev it isn't available, so fall back to the
  // lightweight GitHub-API check whose Download button opens the browser.
  try { autoUpdateMode = await window.api.updateSupported(); } catch (_) { autoUpdateMode = false; }
  if (autoUpdateMode) window.api.onUpdateEvent(handleUpdateEvent);
  else checkForUpdates(false);
}

let autoUpdateMode = false;
let manualCheckPending = false;

// GitHub-API fallback (dev / unpackaged): banner Download opens the browser.
async function checkForUpdates(manual) {
  let res;
  try { res = await window.api.checkUpdate(); } catch (_) { res = { ok: false }; }

  if (res && res.available) {
    $('#update-text').textContent = `PayBatch ${res.latest} is available (you have ${res.current}).`;
    $('#update-banner').dataset.url = res.url || '';
    $('#update-download').dataset.action = 'open';
    $('#update-download').textContent = 'Download';
    $('#update-banner').classList.remove('hidden');
  } else if (manual) {
    if (res && res.ok) toast('You’re on the latest version');
    else toast('Could not check for updates right now', true);
  }
}

// electron-updater event handler (packaged builds).
function handleUpdateEvent(p) {
  const banner = $('#update-banner');
  const text = $('#update-text');
  const dl = $('#update-download');
  if (p.type === 'available') {
    text.textContent = `PayBatch ${p.version} is available.`;
    dl.textContent = 'Download'; dl.dataset.action = 'download'; dl.disabled = false;
    banner.classList.remove('hidden');
  } else if (p.type === 'progress') {
    text.textContent = `Downloading update… ${p.percent}%`;
    dl.disabled = true;
    banner.classList.remove('hidden');
  } else if (p.type === 'downloaded') {
    text.textContent = `Update ${p.version} is ready to install.`;
    dl.textContent = 'Restart & install'; dl.dataset.action = 'install'; dl.disabled = false;
    banner.classList.remove('hidden');
  } else if (p.type === 'none') {
    if (manualCheckPending) { toast('You’re on the latest version'); manualCheckPending = false; }
  } else if (p.type === 'error') {
    if (manualCheckPending) { toast('Could not check for updates right now', true); manualCheckPending = false; }
  }
}

// ----------------------------------------------------------------- changelog
async function openChangelog() {
  const body = $('#changelog-body');
  body.innerHTML = 'Loading…';
  $('#changelog-modal').classList.remove('hidden');
  let md;
  try { md = await window.api.changelog(); } catch (_) { md = '# Changelog\n\nUnavailable.'; }
  body.innerHTML = renderMarkdown(md);
}

// Tiny markdown renderer — headings, bullet lists, bold, and links. Enough for
// a Keep-a-Changelog file; everything is escaped first so it's injection-safe.
function renderMarkdown(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  let html = '', inList = false;
  const closeList = () => { if (inList) { html += '</ul>'; inList = false; } };
  for (const raw of lines) {
    const line = esc(raw);
    if (/^#\s+/.test(line)) { closeList(); continue; }              // skip the top H1 title
    if (/^##\s+/.test(line)) { closeList(); html += `<h3>${inline(line.replace(/^##\s+/, ''))}</h3>`; }
    else if (/^###\s+/.test(line)) { closeList(); html += `<h4>${inline(line.replace(/^###\s+/, ''))}</h4>`; }
    else if (/^[-*]\s+/.test(line)) { if (!inList) { html += '<ul>'; inList = true; } html += `<li>${inline(line.replace(/^[-*]\s+/, ''))}</li>`; }
    else if (line.trim() === '') { closeList(); }
    else { closeList(); html += `<p>${inline(line)}</p>`; }
  }
  closeList();
  return html || '<p>No changelog yet.</p>';
  function inline(s) {
    return s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/`(.+?)`/g, '<code>$1</code>');
  }
}

// ----------------------------------------------------------------- settings card
function writeSettingsToInputs() {
  $('#s-debit-sort').value = settings.debitSortCode;
  $('#s-debit-account').value = settings.debitAccountNumber;
  $('#s-debtor-iban').value = settings.debtorIban;
  $('#s-debtor-bic').value = settings.debtorBic;
  $('#s-payment-date').value = settings.paymentDate;
  $('#s-seq').value = settings.sequenceNumber;
  $('#s-location').value = settings.fileLocationId;
  $$('#ptype-seg .seg-btn').forEach((b) => b.classList.toggle('active', b.dataset.ptype === settings.paymentType));
}

function readSettingsFromInputs() {
  settings.debitSortCode = $('#s-debit-sort').value;
  settings.debitAccountNumber = $('#s-debit-account').value;
  settings.debtorIban = $('#s-debtor-iban').value;
  settings.debtorBic = $('#s-debtor-bic').value;
  settings.paymentDate = $('#s-payment-date').value;
  settings.sequenceNumber = $('#s-seq').value;
  settings.fileLocationId = $('#s-location').value;
}

function updateMultiNote() {
  const note = $('#multi-note');
  if (settings.outputFormat === SEPA) {
    note.innerHTML = '<strong>SEPA credit transfer (pain.001.001.03):</strong> euro payments to IBANs across the EU/EEA. BIC is optional (IBAN-only). Each bank uses its own SEPA profile — <strong>do a test upload before relying on it.</strong>';
  } else if (settings.outputFormat === ISO20022) {
    note.innerHTML = '<strong>ISO 20022 (pain.001):</strong> modern XML credit transfers from your account. <strong>UK domestic GBP only for now.</strong> Each bank uses its own profile — <strong>do a test upload before relying on it.</strong>';
  } else if (settings.outputFormat === STANDARD18) {
    note.textContent = 'Standard 18: fixed-width Bacs credit records using your account as the originator. Some banks also require tape-label records — check your bank’s upload guidance.';
  } else if (settings.outputFormat === S.OUTPUT_FORMATS.MIXED) {
    note.textContent = 'Mixed payments: one row per payment, no header/trailer. Only a payment date and the beneficiary rows are needed. Do a test upload to confirm acceptance.';
  } else if (settings.paymentType === S.PAYMENT_TYPES.MULTIPLE) {
    note.textContent = 'Multiple (MULTIBACS): all payments use this one debit account and payment date, and every payment needs a reference.';
  } else {
    note.textContent = 'Single (BACS): one debit account; reference is optional per payment.';
  }
}

// ----------------------------------------------------------------- events
// ----------------------------------------------------------------- error tracking
function installErrorHandlers() {
  window.addEventListener('error', (e) =>
    handleAppError('renderer', e.error || { message: e.message, stack: `${e.filename}:${e.lineno}` }));
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason;
    handleAppError('promise', r instanceof Error ? r : { message: String(r), stack: '' });
  });
}

let lastErrorShownAt = 0;
async function handleAppError(context, err) {
  const message = err && err.message ? err.message : String(err);
  const stack = (err && err.stack) || '';
  let code = 'ERR-LOCAL';
  try { const r = await window.api.logError({ context, message, stack }); if (r && r.code) code = r.code; } catch (_) {}
  const now = Date.now();
  if (now - lastErrorShownAt < 500) return;   // don't stack modals on error storms
  lastErrorShownAt = now;
  showErrorModal(code, message);
}

function showErrorModal(code, message) {
  $('#error-modal-code').textContent = code;
  $('#error-modal-msg').textContent = message || 'An unexpected error occurred.';
  $('#error-modal').classList.remove('hidden');
}

async function openErrorLog() {
  const body = $('#errorlog-body');
  body.innerHTML = 'Loading…';
  $('#errorlog-modal').classList.remove('hidden');
  let list = [];
  try { list = await window.api.listErrors(); } catch (_) {}
  if (!list.length) { body.innerHTML = '<p class="recent-empty">No errors recorded. 🎉</p>'; return; }
  body.innerHTML = list.map((e) => `
    <div class="errlog-item">
      <div class="errlog-top"><code>${esc(e.code)}</code><span>${esc(new Date(e.time).toLocaleString())}</span></div>
      <div class="errlog-msg">${esc(e.message)}</div>
      <div class="errlog-meta">${esc(e.context)} · v${esc(e.version)} · ${esc(e.platform)}</div>
    </div>`).join('');
}

async function copyText(t) {
  try { await navigator.clipboard.writeText(t); return true; }
  catch (_) {
    try {
      const ta = document.createElement('textarea');
      ta.value = t; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); ta.remove(); return true;
    } catch (_) { return false; }
  }
}

function wireEvents() {
  $$('.tab').forEach((t) => t.addEventListener('click', () => goToView(t.dataset.view)));
  $('#brand-home').addEventListener('click', () => goToView('home'));
  $('#bank-indicator').addEventListener('click', () => goToView('home'));
  $('#bank-search').addEventListener('input', renderBankStrip);

  // Paste straight from Excel/Sheets — drop tabular clipboard data into the batch.
  document.addEventListener('paste', onPasteIntoBatch);

  // Home landing CTAs
  $('#home-new').addEventListener('click', () => {
    goToView('batch');
    if (BankReg.isAvailable(settings.selectedBank) && batch.length === 0) onAddRow();
  });
  $('#home-import').addEventListener('click', () => { goToView('batch'); if (BankReg.isAvailable(settings.selectedBank)) onImport(); });
  $('#home-template').addEventListener('click', onDownloadTemplate);

  // Settings inputs: keep state + persistence in sync, re-validate batch.
  ['s-debit-sort', 's-debit-account', 's-debtor-iban', 's-debtor-bic', 's-payment-date', 's-seq', 's-location'].forEach((id) =>
    $('#' + id).addEventListener('input', () => {
      readSettingsFromInputs();
      saveSettingsToData();
      renderBatch();
    })
  );

  // (#format-seg buttons are rendered + wired in renderFormatSeg)

  $$('#ptype-seg .seg-btn').forEach((b) =>
    b.addEventListener('click', () => {
      settings.paymentType = b.dataset.ptype;
      $$('#ptype-seg .seg-btn').forEach((x) => x.classList.toggle('active', x === b));
      saveSettingsToData();
      updateMultiNote();
      renderBatch();
    })
  );

  $('#payment-form').addEventListener('submit', onAddPayment);
  $('#clear-form').addEventListener('click', clearForm);
  $('#payee-picker').addEventListener('change', onPickPayee);

  $('#import-btn').addEventListener('click', onImport);
  $('#export-btn').addEventListener('click', onExport);
  $('#clear-batch').addEventListener('click', onClearBatch);
  $('#save-batch').addEventListener('click', onSaveBatch);
  $('#add-row').addEventListener('click', onAddRow);
  $('#template-btn').addEventListener('click', onDownloadTemplate);

  // Live inline editing: one delegated handler for every cell input.
  const tbody = $('#batch-table tbody');
  tbody.addEventListener('input', onCellInput);
  tbody.addEventListener('click', (e) => {
    const rm = e.target.closest('[data-remove]');
    if (rm) { batch.splice(Number(rm.dataset.remove), 1); renderBatch(); }
  });

  $('#add-payee').addEventListener('click', () => openPayeeModal(null));
  $('#modal-save').addEventListener('click', onSavePayee);
  $('#modal-cancel').addEventListener('click', closeModal);

  // Update banner — the Download button's job depends on the update mode/stage.
  $('#update-download').addEventListener('click', () => {
    const action = $('#update-download').dataset.action;
    if (action === 'download') window.api.downloadUpdate();
    else if (action === 'install') window.api.installUpdate();
    else { const url = $('#update-banner').dataset.url; if (url) window.api.openExternal(url); }
  });
  $('#update-whatsnew').addEventListener('click', openChangelog);
  $('#update-dismiss').addEventListener('click', () => $('#update-banner').classList.add('hidden'));

  // Changelog + version
  $('#open-changelog').addEventListener('click', openChangelog);
  $('#footer-version').addEventListener('click', openChangelog);
  $('#author-link').addEventListener('click', () => window.api.openExternal('https://github.com/victorsaly'));
  $('#help-repo-link').addEventListener('click', () => window.api.openExternal('https://github.com/victorsaly/batch-payment-app'));

  // Error tracking UI
  $('#error-close').addEventListener('click', () => $('#error-modal').classList.add('hidden'));
  $('#error-copy').addEventListener('click', async () => {
    await copyText($('#error-modal-code').textContent); toast('Reference code copied');
  });
  $('#error-viewlog').addEventListener('click', () => { $('#error-modal').classList.add('hidden'); openErrorLog(); });
  $('#open-errorlog').addEventListener('click', openErrorLog);
  $('#reveal-errorlog').addEventListener('click', () => window.api.revealErrorLog());
  $('#errorlog-close').addEventListener('click', () => $('#errorlog-modal').classList.add('hidden'));
  $('#errorlog-reveal').addEventListener('click', () => window.api.revealErrorLog());
  $('#errorlog-clear').addEventListener('click', async () => { await window.api.clearErrors(); openErrorLog(); toast('Error log cleared'); });
  $('#backup-data').addEventListener('click', onBackupData);
  $('#restore-data').addEventListener('click', onRestoreData);
  $('#map-import').addEventListener('click', applyColumnMapping);
  $('#map-cancel').addEventListener('click', () => { $('#map-modal').classList.add('hidden'); mapState = null; });
  $('#map-close').addEventListener('click', () => { $('#map-modal').classList.add('hidden'); mapState = null; });
  $('#changelog-close').addEventListener('click', () => $('#changelog-modal').classList.add('hidden'));
  $('#check-updates').addEventListener('click', () => {
    if (autoUpdateMode) { manualCheckPending = true; window.api.checkForUpdatesAuto(); }
    else checkForUpdates(true);
    toast('Checking for updates…');
  });
}

// ----------------------------------------------------------------- add payment
function onAddPayment(e) {
  e.preventDefault();
  const p = {
    name: $('#f-name').value,
    sortCode: $('#f-sort').value,
    accountNumber: $('#f-account').value,
    iban: $('#f-iban').value,
    bic: $('#f-bic').value,
    amount: $('#f-amount').value,
    reference: $('#f-reference').value,
    rti: $('#f-rti').value
  };

  const { errors } = validateRow(p);
  if (errors.length) { toast('Fix before adding: ' + errors[0], true); return; }

  batch.push(p);

  if ($('#f-save-payee').checked) {
    upsertPayee({
      id: 'py_' + Date.now(),
      name: p.name.trim(), sortCode: p.sortCode,
      accountNumber: p.accountNumber, reference: p.reference
    });
  }

  clearForm();
  renderBatch();
  toast('Payment added');
}

function clearForm() {
  ['f-name', 'f-sort', 'f-account', 'f-iban', 'f-bic', 'f-amount', 'f-reference', 'f-rti'].forEach((id) => ($('#' + id).value = ''));
  $('#f-save-payee').checked = false;
  $('#payee-picker').value = '';
}

function onPickPayee() {
  const payee = data.payees.find((p) => p.id === $('#payee-picker').value);
  if (!payee) return;
  $('#f-name').value = payee.name || '';
  $('#f-sort').value = payee.sortCode || '';
  $('#f-account').value = payee.accountNumber || '';
  $('#f-reference').value = payee.reference || '';
  $('#f-amount').focus();
}

// ----------------------------------------------------------------- render batch
// The fields rendered as editable cells, in column order.
// `col` is the column-group class on the <td>, shown/hidden per format.
const CELLS = [
  { field: 'name', cls: '' },
  { field: 'sortCode', cls: 'mono', col: 'col-bacs' },
  { field: 'accountNumber', cls: 'mono', col: 'col-bacs' },
  { field: 'iban', cls: 'mono', col: 'col-sepa' },
  { field: 'bic', cls: 'mono', col: 'col-sepa' },
  { field: 'amount', cls: 'num' },
  { field: 'reference', cls: '' },
  { field: 'rti', cls: 'mono', col: 'rti-col' }
];

function cellHtml(p, i, c) {
  const val = esc(p[c.field] == null ? '' : p[c.field]);
  return `<td class="${c.col || ''}">
    <input class="cell-input ${c.cls}" data-index="${i}" data-field="${c.field}" value="${val}" />
    <div class="field-msg" data-field="${c.field}"></div>
  </td>`;
}

// Full (re)build of the table. Used on structural changes (add/remove/import/
// format switch). Per-keystroke edits use updateRow() instead, to keep focus.
function renderBatch() {
  const tbody = $('#batch-table tbody');
  tbody.innerHTML = '';
  const hasRows = batch.length > 0;
  $('#batch-empty').classList.toggle('hidden', hasRows);
  $('#batch-table-wrap').classList.toggle('hidden', !hasRows);

  batch.forEach((p, i) => {
    const tr = document.createElement('tr');
    tr.dataset.index = i;
    tr.innerHTML = `
      <td class="idx-cell">${i + 1}</td>
      ${CELLS.map((c) => cellHtml(p, i, c)).join('')}
      <td class="status-cell"></td>
      <td><button class="link" data-remove="${i}">remove</button></td>`;
    tbody.appendChild(tr);
    updateRow(i);
  });

  applyColumnVisibility();
  updateFooter();
}

// Validate a row and augment it with a UK modulus check — an amber warning (not
// a blocking error) when a 6-digit sort code + 8-digit account fail the check.
function validateRow(p) {
  if (settings.outputFormat === SEPA) return window.Sepa.validateSepaPayment(p);
  const r = S.validatePayment(p, settings.paymentType, validationFormat());
  const sort = onlyDigits(p.sortCode);
  const acct = onlyDigits(p.accountNumber);
  if (window.Modulus && sort.length === 6 && acct.length === 8
    && !r.fieldErrors.accountNumber && !r.fieldWarnings.accountNumber) {
    const m = window.Modulus.check(sort, acct);
    if (m.checked && !m.valid) {
      r.fieldWarnings.accountNumber = 'Sort code / account fails the bank modulus check — likely a typo';
      r.warnings = Object.values(r.fieldWarnings);
    }
  }
  return r;
}

// Re-validate ONE row and update its visuals only (never touches input values,
// so the caret stays put while typing).
function updateRow(i) {
  const tr = $(`#batch-table tbody tr[data-index="${i}"]`);
  if (!tr) return;
  const { fieldErrors, fieldWarnings, errors, warnings } = validateRow(batch[i]);

  CELLS.forEach((c) => {
    const input = tr.querySelector(`input[data-field="${c.field}"]`);
    const msg = tr.querySelector(`.field-msg[data-field="${c.field}"]`);
    if (!input) return;
    const err = fieldErrors[c.field];
    const warn = fieldWarnings[c.field];
    input.classList.toggle('invalid', !!err);
    input.classList.toggle('warn', !err && !!warn);
    msg.textContent = err || warn || '';
    msg.className = 'field-msg ' + (err ? 'err' : warn ? 'warn' : '');
  });

  tr.classList.toggle('has-error', errors.length > 0);
  const status = tr.querySelector('.status-cell');
  if (errors.length) status.innerHTML = `<span class="badge err">${errors.length} error${errors.length > 1 ? 's' : ''}</span>`;
  else if (warnings.length) status.innerHTML = `<span class="badge warn">check</span>`;
  else status.innerHTML = `<span class="badge ok">OK</span>`;
}

// Live edit: write the value into the model and re-validate just that row.
function onCellInput(e) {
  const input = e.target.closest('.cell-input');
  if (!input) return;
  const i = Number(input.dataset.index);
  if (!batch[i]) return;
  batch[i][input.dataset.field] = input.value;
  updateRow(i);
  updateFooter();
}

// Totals + summary badge + enable/disable export.
function updateFooter() {
  const hasRows = batch.length > 0;
  const results = batch.map(validateRow);
  const errorCount = results.filter((r) => r.errors.length).length;
  const warnCount = results.filter((r) => !r.errors.length && r.warnings.length).length;

  $('#count').textContent = batch.length;
  $('#total').textContent = '£' + S.formatAmount(S.totalAmount(batch));

  const summary = $('#error-summary');
  if (errorCount) { summary.className = 'badge err'; summary.textContent = `${errorCount} row${errorCount > 1 ? 's' : ''} with errors`; }
  else if (warnCount) { summary.className = 'badge warn'; summary.textContent = `${warnCount} to double-check`; }
  else { summary.className = 'badge ok'; summary.textContent = hasRows ? 'All valid' : ''; }

  $('#export-btn').disabled = !hasRows || errorCount > 0;
  $('#save-batch').disabled = !hasRows;
}

// Add a blank row and focus its name cell for quick keyboard entry.
function onAddRow() {
  batch.push({ name: '', sortCode: '', accountNumber: '', iban: '', bic: '', amount: '', reference: '', rti: '' });
  renderBatch();
  const last = $(`#batch-table tbody tr[data-index="${batch.length - 1}"] input[data-field="name"]`);
  if (last) last.focus();
}

// Show a spinner on a button while an async action runs, then restore it.
async function withBusy(btn, fn) {
  if (!btn) return fn();
  const wasDisabled = btn.disabled;
  btn.classList.add('busy');
  btn.disabled = true;
  try { return await fn(); }
  finally { btn.classList.remove('busy'); btn.disabled = wasDisabled; }
}

async function onDownloadTemplate() {
  const res = await withBusy($('#template-btn'), () => window.api.exportFile({
    suggestedName: 'batch-payment-template.csv',
    contents: S.buildTemplate(),
    kind: 'template'
  }));
  if (res && res.saved) toast('Template saved & opened — fill it in, then Import');
}

// ----------------------------------------------------------------- import / export
async function onImport() {
  const res = await withBusy($('#import-btn'), () => window.api.importFile());
  if (!res || !res.imported) return;
  try {
    const analysis = S.analyzeImport(res.contents);
    // A file PayBatch produced itself maps unambiguously — import straight away.
    if (analysis.generated) {
      addImportedRows(analysis.payments);
      return;
    }
    if (!analysis.dataRows.length) { toast('No payment rows found in that file', true); return; }
    openColumnMapper(analysis);
  } catch (_err) { toast('Could not read that file', true); }
}

function addImportedRows(rows) {
  if (!rows || !rows.length) { toast('No payment rows found in that file', true); return; }
  batch = batch.concat(rows);
  renderBatch();
  toast(`Imported ${rows.length} payment${rows.length > 1 ? 's' : ''} — review highlighted rows`);
}

// Fields to map, by output format. SEPA needs IBAN/BIC; everything else uses
// sort code + account number.
function mapFieldDefs() {
  if (settings.outputFormat === SEPA) {
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

let mapState = null;   // { dataRows, headers }

function openColumnMapper(analysis) {
  mapState = { dataRows: analysis.dataRows, headers: analysis.headers };
  const defs = mapFieldDefs();
  const sugg = analysis.suggestion || {};

  const options = (selected) => '<option value="-1">— none —</option>' + analysis.headers
    .map((h, i) => `<option value="${i}"${i === selected ? ' selected' : ''}>${esc(h)}</option>`).join('');

  $('#map-fields').innerHTML = defs.map((d) => `
    <label class="map-field">
      <span>${esc(d.label)}${d.required ? ' *' : ''}</span>
      <select data-field="${d.key}">${options(sugg[d.key] == null ? -1 : sugg[d.key])}</select>
    </label>`).join('');

  // Small preview table so the user can see which column is which.
  const head = '<tr>' + analysis.headers.map((h) => `<th>${esc(h)}</th>`).join('') + '</tr>';
  const body = analysis.preview.map((r) =>
    '<tr>' + analysis.headers.map((_, i) => `<td>${esc(r[i] == null ? '' : r[i])}</td>`).join('') + '</tr>').join('');
  $('#map-preview').innerHTML = `<table class="preview-table">${head}${body}</table>`;

  $('#map-error').textContent = '';
  $('#map-modal').classList.remove('hidden');
}

function applyColumnMapping() {
  const defs = mapFieldDefs();
  const selects = $$('#map-fields select');
  const mapping = { name: -1, sort: -1, account: -1, amount: -1, reference: -1, iban: -1, bic: -1 };
  selects.forEach((s) => { mapping[s.dataset.field] = parseInt(s.value, 10); });

  const missing = defs.filter((d) => d.required && mapping[d.key] < 0).map((d) => d.label);
  if (missing.length) { $('#map-error').textContent = 'Please choose a column for: ' + missing.join(', '); return; }

  const rows = S.rowsToPayments(mapState.dataRows, mapping);
  $('#map-modal').classList.add('hidden');
  mapState = null;
  addImportedRows(rows);
}

async function onExport() {
  readSettingsFromInputs();
  const format = settings.outputFormat;
  const stamp = S.toDDMMYYYY(S.todayISO());

  if (!batch.length) { toast('Add at least one payment first', true); return; }
  const problems = batch.map(validateRow).filter((r) => r.errors.length);
  if (problems.length) { toast('Fix the highlighted errors first', true); return; }

  let contents, suggestedName, exportKind;

  if (format === SEPA) {
    const now = new Date();
    const sepaSettings = {
      debtorName: settings.fileLocationId || '',
      debtorIban: settings.debtorIban,
      debtorBic: settings.debtorBic,
      requestedExecutionDate: settings.paymentDate,
      creationDateTime: now.toISOString().slice(0, 19),
      messageId: ('PB' + now.toISOString().replace(/[^0-9]/g, '').slice(0, 14)
        + Math.random().toString(36).slice(2, 6).toUpperCase()).slice(0, 35)
    };
    const sv = window.Sepa.validateSepaSettings(sepaSettings);
    if (!sv.valid) { toast('Settings: ' + sv.errors[0], true); return; }
    contents = window.Sepa.buildSepaPain001(sepaSettings, batch);
    suggestedName = `sepa-pain001-${stamp}.xml`;
    exportKind = 'xml';
  } else if (format === ISO20022) {
    const now = new Date();
    const isoSettings = {
      debtorName: settings.fileLocationId || '',
      debtorSort: settings.debitSortCode,
      debtorAccount: settings.debitAccountNumber,
      requestedExecutionDate: settings.paymentDate,
      creationDateTime: now.toISOString().slice(0, 19),
      messageId: ('PB' + now.toISOString().replace(/[^0-9]/g, '').slice(0, 14)
        + Math.random().toString(36).slice(2, 6).toUpperCase()).slice(0, 35)
    };
    const sv = window.ISO20022.validateIso20022Settings(isoSettings);
    if (!sv.valid) { toast('Settings: ' + sv.errors[0], true); return; }
    contents = window.ISO20022.buildPain001(isoSettings, batch);
    suggestedName = `iso20022-pain001-${stamp}.xml`;
    exportKind = 'xml';
  } else if (format === STANDARD18) {
    const s18 = {
      originatorSort: settings.debitSortCode,
      originatorAccount: settings.debitAccountNumber,
      originatorName: settings.fileLocationId || ''
    };
    const sv = window.Standard18.validateStandard18Settings(s18);
    if (!sv.valid) { toast('Settings: ' + sv.errors[0], true); return; }
    contents = window.Standard18.buildStandard18File(s18, batch);
    suggestedName = `bacs-standard18-${stamp}.txt`;
  } else {
    const sv = S.validateSettings(settings, format);
    if (!sv.valid) { toast('Settings: ' + sv.errors[0], true); return; }
    const fileSettings = { ...settings, creationDate: S.todayISO() };
    contents = S.buildOutput(format, fileSettings, batch);
    const seq = Number(settings.sequenceNumber);
    suggestedName = format === S.OUTPUT_FORMATS.MIXED
      ? `santander-mixed-${stamp}.txt`
      : `santander-bacs-${stamp}-seq${seq}.txt`;
  }

  const res = await withBusy($('#export-btn'), () => window.api.exportFile({ suggestedName, contents, kind: exportKind }));
  if (res && res.saved) {
    if (format === S.OUTPUT_FORMATS.BACS_IMPORT) {
      // Bacs import files carry a unique sequence number — advance it.
      settings.sequenceNumber = Math.min(Number(settings.sequenceNumber) + 1, 9999);
      writeSettingsToInputs();
      saveSettingsToData();
    }
    toast('Exported & opened: ' + res.filePath);
  }
}

function onClearBatch() {
  if (!batch.length) return;
  if (!confirm('Clear all payments from the current batch?')) return;
  batch = [];
  renderBatch();
}

// ----------------------------------------------------------------- save / history
async function onSaveBatch() {
  if (!batch.length) return;
  readSettingsFromInputs();
  data.batches.unshift({
    id: 'b_' + Date.now(),
    savedAt: new Date().toISOString(),
    total: S.totalAmount(batch),
    paymentType: settings.paymentType,
    settings: { ...settings },
    payments: JSON.parse(JSON.stringify(batch))
  });
  await persist();
  renderHistory();
  toast('Batch saved to history');
}

function renderHistory() {
  const tbody = $('#history-table tbody');
  tbody.innerHTML = '';
  const has = data.batches.length > 0;
  $('#history-empty').classList.toggle('hidden', has);
  $('#history-table').classList.toggle('hidden', !has);

  data.batches.forEach((b) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${new Date(b.savedAt).toLocaleString()}</td>
      <td>${b.payments.length} <span class="hint">${esc(b.paymentType || '')}</span></td>
      <td class="num">£${S.formatAmount(b.total)}</td>
      <td>
        <button class="link" data-load="${b.id}">load</button>
        <button class="link" data-del="${b.id}">delete</button>
      </td>`;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('[data-load]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const b = data.batches.find((x) => x.id === btn.dataset.load);
      if (!b) return;
      batch = JSON.parse(JSON.stringify(b.payments));
      if (b.settings) {
        settings = { ...settings, ...b.settings, paymentDate: S.todayISO() };
        writeSettingsToInputs();
        applyBankUI();
        applyFormatUI();
      }
      goToView('batch');
      renderBatch();
      toast('Batch loaded — check the payment date, then re-export');
    })
  );

  tbody.querySelectorAll('[data-del]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this saved batch?')) return;
      data.batches = data.batches.filter((x) => x.id !== btn.dataset.del);
      await persist();
      renderHistory();
    })
  );
}

// ----------------------------------------------------------------- payees
function renderPayeePicker() {
  const sel = $('#payee-picker');
  sel.innerHTML = '<option value="">— choose a saved payee —</option>';
  data.payees.slice().sort((a, b) => (a.name || '').localeCompare(b.name || '')).forEach((p) => {
    const o = document.createElement('option');
    o.value = p.id;
    o.textContent = `${p.name} — ${S.formatSortCode(p.sortCode)} / ${onlyDigits(p.accountNumber)}`;
    sel.appendChild(o);
  });
}

function renderPayees() {
  const tbody = $('#payees-table tbody');
  tbody.innerHTML = '';
  const has = data.payees.length > 0;
  $('#payees-empty').classList.toggle('hidden', has);
  $('#payees-table').classList.toggle('hidden', !has);

  data.payees.slice().sort((a, b) => (a.name || '').localeCompare(b.name || '')).forEach((p) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${esc(p.name)}</td>
      <td>${esc(S.formatSortCode(p.sortCode))}</td>
      <td>${esc(onlyDigits(p.accountNumber))}</td>
      <td>${esc(p.reference || '')}</td>
      <td>
        <button class="link" data-edit="${p.id}">edit</button>
        <button class="link" data-del="${p.id}">delete</button>
      </td>`;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => openPayeeModal(b.dataset.edit)));
  tbody.querySelectorAll('[data-del]').forEach((b) =>
    b.addEventListener('click', async () => {
      if (!confirm('Delete this payee?')) return;
      data.payees = data.payees.filter((x) => x.id !== b.dataset.del);
      await persist();
      renderPayees();
      renderPayeePicker();
    })
  );
}

function openPayeeModal(id) {
  editingPayeeId = id;
  const payee = id ? data.payees.find((p) => p.id === id) : null;
  $('#modal-title').textContent = payee ? 'Edit payee' : 'New payee';
  $('#p-name').value = payee ? payee.name : '';
  $('#p-sort').value = payee ? payee.sortCode : '';
  $('#p-account').value = payee ? payee.accountNumber : '';
  $('#p-reference').value = payee ? payee.reference || '' : '';
  $('#modal').classList.remove('hidden');
  $('#p-name').focus();
}

function closeModal() { $('#modal').classList.add('hidden'); editingPayeeId = null; }

async function onSavePayee() {
  const name = $('#p-name').value.trim();
  const sortCode = $('#p-sort').value;
  const accountNumber = $('#p-account').value;
  const reference = $('#p-reference').value.trim();

  if (!name) { toast('Name is required', true); return; }
  if (onlyDigits(sortCode).length !== 6) { toast('Sort code must be 6 digits', true); return; }
  if (onlyDigits(accountNumber).length !== 8) { toast('Account number must be 8 digits', true); return; }

  upsertPayee({ id: editingPayeeId || 'py_' + Date.now(), name, sortCode, accountNumber, reference });
  await persist();
  closeModal();
  renderPayees();
  renderPayeePicker();
  toast('Payee saved');
}

function upsertPayee(payee) {
  const i = data.payees.findIndex((p) => p.id === payee.id);
  if (i >= 0) data.payees[i] = payee; else data.payees.push(payee);
  persist();
  renderPayeePicker();
  renderPayees();
}

// ----------------------------------------------------------------- helpers
function onlyDigits(s) { return String(s == null ? '' : s).replace(/\D/g, ''); }
function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

let toastTimer = null;
function toast(msg, isError) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast show' + (isError ? ' err' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = 'toast'), 3600);
}

init();
