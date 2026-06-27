/* renderer.js — all UI behaviour. Talks to the saved file only through
 * window.api (preload.js) and to the Bacs format logic through
 * window.Santander (santander.js). */

const S = window.Santander;

let data = { payees: [], batches: [], settings: {} };
let batch = [];                 // payments being built now
let editingPayeeId = null;

// File-level settings for the current run (mirrors the settings card inputs).
let settings = {
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

  writeSettingsToInputs();
  applyFormatUI();

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
}

function renderAll() {
  renderBatch();
  renderPayees();
  renderPayeePicker();
  renderHistory();
  updateMultiNote();
}

async function persist() { await window.api.saveData(data); }

function saveSettingsToData() {
  data.settings = {
    outputFormat: settings.outputFormat,
    debitSortCode: settings.debitSortCode,
    debitAccountNumber: settings.debitAccountNumber,
    fileLocationId: settings.fileLocationId,
    sequenceNumber: settings.sequenceNumber,
    paymentType: settings.paymentType
  };
  persist();
}

// Show/hide the Bacs-only settings and relabel controls for the chosen format.
function applyFormatUI() {
  const isMixed = settings.outputFormat === S.OUTPUT_FORMATS.MIXED;
  $$('.bacs-only').forEach((el) => el.classList.toggle('hidden', isMixed));
  $$('#format-seg .seg-btn').forEach((b) =>
    b.classList.toggle('active', b.dataset.format === settings.outputFormat));
  $('#export-btn').textContent = isMixed ? 'Export Mixed file (.txt)' : 'Export Bacs file (.txt)';
  applyRtiVisibility();
  updateMultiNote();
}

// RTI only applies to the Bacs format — hide that column for Mixed.
function applyRtiVisibility() {
  const hide = settings.outputFormat === S.OUTPUT_FORMATS.MIXED;
  $$('.rti-col').forEach((el) => el.classList.toggle('hidden', hide));
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
  if (settings.outputFormat === S.OUTPUT_FORMATS.MIXED) {
    note.textContent = 'Mixed payments: one row per payment, no header/trailer. Only a payment date and the beneficiary rows are needed. Do a test upload to confirm acceptance.';
  } else if (settings.paymentType === S.PAYMENT_TYPES.MULTIPLE) {
    note.textContent = 'Multiple (MULTIBACS): all payments use this one debit account and payment date, and every payment needs a reference.';
  } else {
    note.textContent = 'Single (BACS): one debit account; reference is optional per payment.';
  }
}

// ----------------------------------------------------------------- events
function wireEvents() {
  $$('.tab').forEach((t) =>
    t.addEventListener('click', () => {
      $$('.tab').forEach((x) => x.classList.remove('active'));
      $$('.view').forEach((v) => v.classList.remove('active'));
      t.classList.add('active');
      $('#view-' + t.dataset.view).classList.add('active');
    })
  );

  // Settings inputs: keep state + persistence in sync, re-validate batch.
  ['s-debit-sort', 's-debit-account', 's-payment-date', 's-seq', 's-location'].forEach((id) =>
    $('#' + id).addEventListener('input', () => {
      readSettingsFromInputs();
      saveSettingsToData();
      renderBatch();
    })
  );

  $$('#format-seg .seg-btn').forEach((b) =>
    b.addEventListener('click', () => {
      settings.outputFormat = b.dataset.format;
      applyFormatUI();
      saveSettingsToData();
      renderBatch();
    })
  );

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

  const { errors } = S.validatePayment(p, settings.paymentType, settings.outputFormat);
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
  const { fieldErrors, fieldWarnings, errors, warnings } = S.validatePayment(batch[i], settings.paymentType, settings.outputFormat);

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
  const results = S.validateBatch(batch, settings.paymentType, settings.outputFormat);
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

async function onDownloadTemplate() {
  const res = await window.api.exportFile({
    suggestedName: 'batch-payment-template.csv',
    contents: S.buildTemplate(),
    kind: 'template'
  });
  if (res && res.saved) toast('Template saved & opened — fill it in, then Import');
}

// ----------------------------------------------------------------- import / export
async function onImport() {
  const res = await window.api.importFile();
  if (!res || !res.imported) return;
  try {
    const rows = S.importPayments(res.contents);
    if (!rows.length) { toast('No payment rows found in that file', true); return; }
    batch = batch.concat(rows);
    renderBatch();
    toast(`Imported ${rows.length} payment${rows.length > 1 ? 's' : ''} — review highlighted rows`);
  } catch (err) { toast('Could not read that file', true); }
}

async function onExport() {
  readSettingsFromInputs();
  const format = settings.outputFormat;
  const isMixed = format === S.OUTPUT_FORMATS.MIXED;

  const sv = S.validateSettings(settings, format);
  if (!sv.valid) { toast('Settings: ' + sv.errors[0], true); return; }

  if (!batch.length) { toast('Add at least one payment first', true); return; }
  const problems = S.validateBatch(batch, settings.paymentType, format).filter((r) => r.errors.length);
  if (problems.length) { toast('Fix the highlighted errors first', true); return; }

  const fileSettings = { ...settings, creationDate: S.todayISO() };
  const contents = S.buildOutput(format, fileSettings, batch);
  const stamp = S.toDDMMYYYY(S.todayISO());
  const seq = Number(settings.sequenceNumber);
  const suggestedName = isMixed
    ? `santander-mixed-${stamp}.txt`
    : `santander-bacs-${stamp}-seq${seq}.txt`;

  const res = await window.api.exportFile({ suggestedName, contents });
  if (res && res.saved) {
    if (!isMixed) {
      // Bacs files carry a unique sequence number — advance it for next time.
      settings.sequenceNumber = Math.min(seq + 1, 9999);
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
        updateMultiNote();
      }
      $$('.tab').forEach((x) => x.classList.remove('active'));
      $$('.view').forEach((v) => v.classList.remove('active'));
      document.querySelector('.tab[data-view="batch"]').classList.add('active');
      $('#view-batch').classList.add('active');
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
