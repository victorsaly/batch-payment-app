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
  settings.debitSortCode = data.settings.debitSortCode || '';
  settings.debitAccountNumber = data.settings.debitAccountNumber || '';
  settings.fileLocationId = data.settings.fileLocationId || '';
  settings.sequenceNumber = data.settings.sequenceNumber || 1;
  settings.paymentType = data.settings.paymentType || S.PAYMENT_TYPES.SINGLE;
  settings.outputFormat = data.settings.outputFormat || S.OUTPUT_FORMATS.BACS_IMPORT;
  settings.selectedBank = data.settings.selectedBank || 'santander';

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

function saveSettingsToData() {
  data.settings = {
    selectedBank: settings.selectedBank,
    outputFormat: settings.outputFormat,
    debitSortCode: settings.debitSortCode,
    debitAccountNumber: settings.debitAccountNumber,
    fileLocationId: settings.fileLocationId,
    sequenceNumber: settings.sequenceNumber,
    paymentType: settings.paymentType
  };
  persist();
}

const STANDARD18 = 'STANDARD18';
const ISO20022 = 'ISO20022';
const FORMAT_LABELS = {
  BACS_IMPORT: 'Bacs import (.txt)',
  MIXED: 'Mixed payments (.txt)',
  STANDARD18: 'Standard 18 (.txt)',
  ISO20022: 'ISO 20022 (.xml)'
};
const EXPORT_LABELS = {
  BACS_IMPORT: 'Export Bacs file (.txt)',
  MIXED: 'Export Mixed file (.txt)',
  STANDARD18: 'Export Standard 18 (.txt)',
  ISO20022: 'Export ISO 20022 (.xml)'
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
  applyRtiVisibility();
  updateMultiNote();
}

// RTI only applies to the Santander Bacs import format.
function applyRtiVisibility() {
  const show = settings.outputFormat === S.OUTPUT_FORMATS.BACS_IMPORT;
  $$('.rti-col').forEach((el) => el.classList.toggle('hidden', !show));
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

// Renders the bank tiles into every .bank-strip (home + build screen) so they
// stay in sync.
function renderBankStrip() {
  $$('.bank-strip').forEach((strip) => {
    strip.innerHTML = '';
    BankReg.BANKS.forEach((b) => {
      const soon = b.status !== 'available';
      const tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'bank-tile' + (b.id === settings.selectedBank ? ' active' : '') + (soon ? ' soon' : '');
      tile.dataset.bank = b.id;
      const statusText = b.beta ? 'Beta' : (soon ? 'Coming soon' : 'Available');
      tile.innerHTML = `
        <span class="bank-badge" style="background:${b.color}">${esc(b.initial)}</span>
        <span class="bank-meta">
          <span class="bank-name">${esc(b.name)}</span>
          <span class="bank-status${b.beta ? ' beta' : ''}">${statusText}</span>
        </span>`;
      tile.addEventListener('click', () => onSelectBank(b.id));
      strip.appendChild(tile);
    });
  });
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
  checkForUpdates(false);
}

async function checkForUpdates(manual) {
  let res;
  try { res = await window.api.checkUpdate(); } catch (_) { res = { ok: false }; }

  if (res && res.available) {
    $('#update-text').textContent = `PayBatch ${res.latest} is available (you have ${res.current}).`;
    $('#update-banner').dataset.url = res.url || '';
    $('#update-banner').classList.remove('hidden');
  } else if (manual) {
    if (res && res.ok) toast('You’re on the latest version');
    else toast('Could not check for updates right now', true);
  }
}

// ----------------------------------------------------------------- changelog
async function openChangelog() {
  const body = $('#changelog-body');
  body.innerHTML = 'Loading…';
  $('#changelog-modal').classList.remove('hidden');
  let md = '';
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
  $('#s-payment-date').value = settings.paymentDate;
  $('#s-seq').value = settings.sequenceNumber;
  $('#s-location').value = settings.fileLocationId;
  $$('#ptype-seg .seg-btn').forEach((b) => b.classList.toggle('active', b.dataset.ptype === settings.paymentType));
}

function readSettingsFromInputs() {
  settings.debitSortCode = $('#s-debit-sort').value;
  settings.debitAccountNumber = $('#s-debit-account').value;
  settings.paymentDate = $('#s-payment-date').value;
  settings.sequenceNumber = $('#s-seq').value;
  settings.fileLocationId = $('#s-location').value;
}

function updateMultiNote() {
  const note = $('#multi-note');
  if (settings.outputFormat === ISO20022) {
    note.innerHTML = '<strong>ISO 20022 (pain.001):</strong> modern XML credit transfers from your account. <strong>UK domestic GBP only for now</strong> (SEPA/international coming). Each bank uses its own profile — <strong>do a test upload before relying on it.</strong>';
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
  ['s-debit-sort', 's-debit-account', 's-payment-date', 's-seq', 's-location'].forEach((id) =>
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

  // Update banner
  $('#update-download').addEventListener('click', () => {
    const url = $('#update-banner').dataset.url;
    if (url) window.api.openExternal(url);
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
  $('#changelog-close').addEventListener('click', () => $('#changelog-modal').classList.add('hidden'));
  $('#check-updates').addEventListener('click', () => { checkForUpdates(true); toast('Checking for updates…'); });
}

// ----------------------------------------------------------------- add payment
function onAddPayment(e) {
  e.preventDefault();
  const p = {
    name: $('#f-name').value,
    sortCode: $('#f-sort').value,
    accountNumber: $('#f-account').value,
    amount: $('#f-amount').value,
    reference: $('#f-reference').value,
    rti: $('#f-rti').value
  };

  const { errors } = S.validatePayment(p, settings.paymentType, validationFormat());
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
  ['f-name', 'f-sort', 'f-account', 'f-amount', 'f-reference', 'f-rti'].forEach((id) => ($('#' + id).value = ''));
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
const CELLS = [
  { field: 'name', cls: '' },
  { field: 'sortCode', cls: 'mono' },
  { field: 'accountNumber', cls: 'mono' },
  { field: 'amount', cls: 'num' },
  { field: 'reference', cls: '' },
  { field: 'rti', cls: 'mono rti-col' }
];

function cellHtml(p, i, c) {
  const val = esc(p[c.field] == null ? '' : p[c.field]);
  return `<td class="${c.cls.includes('rti-col') ? 'rti-col' : ''}">
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

  applyRtiVisibility();
  updateFooter();
}

// Re-validate ONE row and update its visuals only (never touches input values,
// so the caret stays put while typing).
function updateRow(i) {
  const tr = $(`#batch-table tbody tr[data-index="${i}"]`);
  if (!tr) return;
  const { fieldErrors, fieldWarnings, errors, warnings } = S.validatePayment(batch[i], settings.paymentType, validationFormat());

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
  const results = S.validateBatch(batch, settings.paymentType, validationFormat());
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
  batch.push({ name: '', sortCode: '', accountNumber: '', amount: '', reference: '', rti: '' });
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
    const rows = S.importPayments(res.contents);
    if (!rows.length) { toast('No payment rows found in that file', true); return; }
    batch = batch.concat(rows);
    renderBatch();
    toast(`Imported ${rows.length} payment${rows.length > 1 ? 's' : ''} — review highlighted rows`);
  } catch (_err) { toast('Could not read that file', true); }
}

async function onExport() {
  readSettingsFromInputs();
  const format = settings.outputFormat;
  const stamp = S.toDDMMYYYY(S.todayISO());

  if (!batch.length) { toast('Add at least one payment first', true); return; }
  const problems = S.validateBatch(batch, settings.paymentType, validationFormat()).filter((r) => r.errors.length);
  if (problems.length) { toast('Fix the highlighted errors first', true); return; }

  let contents, suggestedName, exportKind;

  if (format === ISO20022) {
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
