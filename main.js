const { app, BrowserWindow, ipcMain, dialog, shell, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const crypto = require('crypto');
const { autoUpdater } = require('electron-updater');

// Where to look for new releases (the GitHub repo backing this app).
const REPO = { owner: 'victorsaly', repo: 'batch-payment-app' };

// Persistent data lives inside the OS user-data folder. Nothing is sent
// anywhere — this is a fully local, offline app.
//   batchpayment-data.enc  -> encrypted (OS keychain via safeStorage), preferred
//   batchpayment-data.json -> legacy plaintext, migrated then deleted on save
const ENC_FILE = () => path.join(app.getPath('userData'), 'batchpayment-data.enc');
const PLAIN_FILE = () => path.join(app.getPath('userData'), 'batchpayment-data.json');

const DEFAULT_DATA = { payees: [], batches: [], settings: {} };

// safeStorage is only usable after the app is ready; cache availability once.
function encryptionAvailable() {
  try { return safeStorage.isEncryptionAvailable(); } catch (_) { return false; }
}

function loadData() {
  // 1) Preferred: encrypted file.
  try {
    if (fs.existsSync(ENC_FILE()) && encryptionAvailable()) {
      const buf = fs.readFileSync(ENC_FILE());
      const json = safeStorage.decryptString(buf);
      return { ...DEFAULT_DATA, ...JSON.parse(json) };
    }
  } catch (err) {
    console.error('Could not read encrypted data:', err.message);
  }
  // 2) Legacy plaintext (older versions). Loaded so a re-save migrates it.
  try {
    if (fs.existsSync(PLAIN_FILE())) {
      return { ...DEFAULT_DATA, ...JSON.parse(fs.readFileSync(PLAIN_FILE(), 'utf8')) };
    }
  } catch (_) {}
  // 3) Nothing yet.
  return { ...DEFAULT_DATA };
}

function saveData(data) {
  const safe = { ...DEFAULT_DATA, ...data };
  const json = JSON.stringify(safe, null, 2);

  if (encryptionAvailable()) {
    const buf = safeStorage.encryptString(json);
    fs.writeFileSync(ENC_FILE(), buf);
    // Remove any stale plaintext file once encrypted data exists.
    try { if (fs.existsSync(PLAIN_FILE())) fs.unlinkSync(PLAIN_FILE()); } catch (_) {}
    return { saved: true, encrypted: true };
  }

  // Fallback (e.g. Linux with no keyring): keep working, but in plaintext.
  fs.writeFileSync(PLAIN_FILE(), json, 'utf8');
  return { saved: true, encrypted: false };
}

// ---- Local error log (no telemetry; stays on this machine) ----
const ERROR_LOG = () => path.join(app.getPath('userData'), 'paybatch-errors.log');

function genErrorCode() {
  // Short, human-quotable reference, e.g. ERR-7K3F9.
  let s = '';
  for (let i = 0; i < 5; i++) s += 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)];
  return 'ERR-' + s;
}

function logError(info) {
  const entry = {
    code: genErrorCode(),
    time: new Date().toISOString(),
    version: app.getVersion(),
    platform: `${process.platform} ${process.arch}`,
    context: (info && info.context) || 'app',
    message: (info && info.message) || 'Unknown error',
    stack: (info && info.stack) || ''
  };
  try { fs.appendFileSync(ERROR_LOG(), JSON.stringify(entry) + '\n', 'utf8'); } catch (_) {}
  return { code: entry.code, time: entry.time };
}

function readErrors(limit) {
  try {
    const lines = fs.readFileSync(ERROR_LOG(), 'utf8').split('\n').filter(Boolean);
    const parsed = [];
    for (const l of lines) { try { parsed.push(JSON.parse(l)); } catch (_) {} }
    return parsed.slice(-(limit || 50)).reverse();
  } catch (_) { return []; }
}

ipcMain.handle('error:log', (_evt, info) => logError(info));
ipcMain.handle('error:list', () => readErrors(50));
ipcMain.handle('error:reveal', () => {
  try {
    if (!fs.existsSync(ERROR_LOG())) fs.writeFileSync(ERROR_LOG(), '', 'utf8');
    shell.showItemInFolder(ERROR_LOG());
  } catch (_) {}
  return true;
});
ipcMain.handle('error:clear', () => {
  try { fs.writeFileSync(ERROR_LOG(), '', 'utf8'); } catch (_) {}
  return true;
});

// Log uncaught errors from the main process too.
process.on('uncaughtException', (err) => logError({ context: 'main', message: String(err && err.message || err), stack: err && err.stack }));

function createWindow() {
  const win = new BrowserWindow({
    width: 1180,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    title: 'PayBatch',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.removeMenu();

  // Dev: load the Vite dev server (HMR). Packaged: load the static built
  // renderer. The strict, network-free CSP lives in the built index.html only
  // (Vite's dev server needs ws + eval for HMR); see vite.config.js.
  if (app.isPackaged) {
    win.loadFile(path.join(__dirname, 'src', 'renderer-dist', 'index.html'));
  } else {
    win.loadURL(process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173');
    win.webContents.openDevTools({ mode: 'detach' });
  }

  win.webContents.once('did-finish-load', () => setupAutoUpdater(win));
}

// ---- Auto-update (electron-updater) ----
// Only runs in a packaged build; in dev there's nothing to update and the
// renderer falls back to the lightweight GitHub-API check. We never download
// without consent (autoDownload = false): the renderer shows a banner, the user
// clicks Download, then Restart & install. Update feed + signatures come from
// the GitHub Releases published by electron-builder (latest*.yml + blockmaps).
let updaterReady = false;
function setupAutoUpdater(win) {
  if (!app.isPackaged || updaterReady) return;
  updaterReady = true;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  const send = (type, data) => {
    try { if (win && !win.isDestroyed()) win.webContents.send('update:event', { type, ...data }); } catch (_) {}
  };
  autoUpdater.on('update-available', (info) => send('available', { version: info.version }));
  autoUpdater.on('update-not-available', () => send('none', {}));
  autoUpdater.on('download-progress', (p) => send('progress', { percent: Math.round(p.percent || 0) }));
  autoUpdater.on('update-downloaded', (info) => send('downloaded', { version: info.version }));
  autoUpdater.on('error', (err) => send('error', { message: String((err && err.message) || err) }));
  autoUpdater.checkForUpdates().catch((err) =>
    logError({ context: 'autoUpdater', message: String((err && err.message) || err) }));
}

ipcMain.handle('update:supported', () => app.isPackaged);
ipcMain.handle('update:check', () => { if (app.isPackaged) autoUpdater.checkForUpdates().catch(() => {}); return app.isPackaged; });
ipcMain.handle('update:download', () => { autoUpdater.downloadUpdate().catch(() => {}); return true; });
ipcMain.handle('update:install', () => { autoUpdater.quitAndInstall(); return true; });

// ---- IPC: storage ----
ipcMain.handle('data:load', () => loadData());
ipcMain.handle('data:save', (_evt, data) => saveData(data));
ipcMain.handle('data:status', () => ({
  encrypted: encryptionAvailable(),
  path: encryptionAvailable() ? ENC_FILE() : PLAIN_FILE()
}));

// ---- IPC: save a generated file via a Save dialog, then open it ----
// opts: { suggestedName, contents, kind: 'bacs' | 'mixed' | 'template', openAfter }
ipcMain.handle('file:export', async (_evt, opts) => {
  const { suggestedName, contents, kind, openAfter } = opts || {};
  let filters;
  if (kind === 'template') {
    filters = [{ name: 'CSV file', extensions: ['csv'] }, { name: 'All files', extensions: ['*'] }];
  } else if (kind === 'xml') {
    filters = [{ name: 'XML file', extensions: ['xml'] }, { name: 'All files', extensions: ['*'] }];
  } else {
    filters = [{ name: 'Payment file', extensions: ['txt'] }, { name: 'All files', extensions: ['*'] }];
  }

  const { canceled, filePath } = await dialog.showSaveDialog({
    title: kind === 'template' ? 'Save import template' : 'Export payment file',
    defaultPath: suggestedName || 'export.txt',
    filters
  });
  if (canceled || !filePath) return { saved: false };

  fs.writeFileSync(filePath, contents, 'utf8');

  // Open the file in the OS default app so the user sees the result immediately.
  if (openAfter !== false) {
    try { await shell.openPath(filePath); } catch (_) {}
  }
  return { saved: true, filePath };
});

// ---- IPC: reveal a file in Finder/Explorer ----
ipcMain.handle('file:reveal', (_evt, filePath) => {
  if (filePath) shell.showItemInFolder(filePath);
  return true;
});

// ---- IPC: open an external link in the user's default browser ----
ipcMain.handle('shell:open-external', (_evt, url) => {
  if (/^https?:\/\//.test(url || '')) shell.openExternal(url);
  return true;
});

// ---- IPC: app version + bundled changelog ----
ipcMain.handle('app:version', () => app.getVersion());

ipcMain.handle('app:changelog', () => {
  try { return fs.readFileSync(path.join(__dirname, 'CHANGELOG.md'), 'utf8'); }
  catch (_) { return '# Changelog\n\nNo changelog found.'; }
});

// ---- IPC: check GitHub for a newer release ----
// Runs in the main process so the renderer keeps its strict, network-free CSP.
function semverGt(a, b) {
  const pa = String(a).replace(/^v/, '').split('.').map(Number);
  const pb = String(b).replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return true;
    if ((pa[i] || 0) < (pb[i] || 0)) return false;
  }
  return false;
}

function fetchLatestRelease() {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.github.com',
      path: `/repos/${REPO.owner}/${REPO.repo}/releases/latest`,
      method: 'GET',
      headers: { 'User-Agent': 'PayBatch', 'Accept': 'application/vnd.github+json' },
      timeout: 6000
    }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode));
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end();
  });
}

ipcMain.handle('app:check-update', async () => {
  const current = app.getVersion();
  try {
    const rel = await fetchLatestRelease();
    const latest = (rel.tag_name || rel.name || '').replace(/^v/, '');
    if (!latest) return { ok: true, available: false, current };
    return {
      ok: true,
      available: semverGt(latest, current),
      current,
      latest,
      url: rel.html_url || `https://github.com/${REPO.owner}/${REPO.repo}/releases/latest`,
      notes: rel.body || ''
    };
  } catch (err) {
    // Private repo (needs auth), offline, or rate-limited — fail quietly.
    return { ok: false, available: false, current, error: String(err.message || err) };
  }
});

// ---- IPC: import/read a file the user already has ----
ipcMain.handle('file:import', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Import beneficiaries (CSV / Excel export) or a payment file',
    properties: ['openFile'],
    filters: [{ name: 'CSV or text file', extensions: ['csv', 'txt'] }]
  });
  if (canceled || !filePaths || !filePaths[0]) return { imported: false };
  const contents = fs.readFileSync(filePaths[0], 'utf8');
  return { imported: true, filePath: filePaths[0], contents };
});

// ---- IPC: back up / restore the local store ----
// A backup is a snapshot the user explicitly saves somewhere of their choosing,
// so it survives a machine move / OS-keychain reset (the on-disk store is
// encrypted to *this* machine and can't be moved). To avoid leaving payee bank
// details readable on disk, a backup is encrypted with a USER-CHOSEN PASSWORD —
// AES-256-GCM with a scrypt-derived key — which keeps it both unreadable and
// portable (any machine can restore it with the password). Older plain-JSON
// backups are still accepted on restore for backward compatibility.
function encryptBackup(jsonString, password) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(password, salt, 32);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(jsonString, 'utf8'), cipher.final()]);
  return {
    _app: 'PayBatch', _type: 'backup', _format: 'aes-256-gcm', _kdf: 'scrypt',
    _version: app.getVersion(), _exportedAt: new Date().toISOString(),
    salt: salt.toString('base64'), iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'), ciphertext: ct.toString('base64')
  };
}

function decryptBackup(obj, password) {
  const key = crypto.scryptSync(password, Buffer.from(obj.salt, 'base64'), 32);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(obj.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(obj.tag, 'base64'));
  const out = Buffer.concat([decipher.update(Buffer.from(obj.ciphertext, 'base64')), decipher.final()]);
  return JSON.parse(out.toString('utf8'));
}

ipcMain.handle('data:export', async (_evt, password) => {
  const data = loadData();
  const d = new Date().toISOString().slice(0, 10);
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Back up PayBatch data',
    defaultPath: `paybatch-backup-${d}.paybatch`,
    filters: [{ name: 'PayBatch backup', extensions: ['paybatch', 'json'] }, { name: 'All files', extensions: ['*'] }]
  });
  if (canceled || !filePath) return { saved: false };

  let payload;
  if (password) {
    payload = encryptBackup(JSON.stringify(data), password);
  } else {
    // No password → fall back to a clearly-labelled plain snapshot.
    payload = { _app: 'PayBatch', _type: 'backup', _format: 'plain', _version: app.getVersion(), _exportedAt: new Date().toISOString(), data };
  }
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
  return { saved: true, filePath, encrypted: !!password, counts: { payees: data.payees.length, batches: data.batches.length } };
});

// opts: { password, filePath }. On the first call filePath is omitted, so we
// show the Open dialog. If the chosen backup is encrypted we return its path so
// the renderer can re-call with the password WITHOUT re-opening the dialog.
ipcMain.handle('data:import', async (_evt, opts) => {
  const { password, filePath } = opts || {};
  let chosen = filePath;
  if (!chosen) {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Restore PayBatch data from a backup',
      properties: ['openFile'],
      filters: [{ name: 'PayBatch backup', extensions: ['paybatch', 'json'] }, { name: 'All files', extensions: ['*'] }]
    });
    if (canceled || !filePaths || !filePaths[0]) return { restored: false };
    chosen = filePaths[0];
  }

  let parsed;
  try { parsed = JSON.parse(fs.readFileSync(chosen, 'utf8')); }
  catch (_) { return { restored: false, error: 'That file isn’t a PayBatch backup.' }; }

  let incoming;
  if (parsed && parsed._format === 'aes-256-gcm') {
    if (!password) return { restored: false, needPassword: true, filePath: chosen };
    try { incoming = decryptBackup(parsed, password); }
    catch (_) { return { restored: false, badPassword: true, error: 'Wrong password, or the backup is corrupt.' }; }
  } else {
    // Plain backup ({ data: {...} }) or a bare data object.
    incoming = parsed && parsed.data && typeof parsed.data === 'object' ? parsed.data : parsed;
  }

  if (!incoming || typeof incoming !== 'object'
    || !Array.isArray(incoming.payees) || !Array.isArray(incoming.batches)) {
    return { restored: false, error: 'That file isn’t a PayBatch backup.' };
  }

  const clean = {
    payees: incoming.payees,
    batches: incoming.batches,
    settings: (incoming.settings && typeof incoming.settings === 'object') ? incoming.settings : {}
  };
  saveData(clean);
  return { restored: true, data: { ...DEFAULT_DATA, ...clean }, counts: { payees: clean.payees.length, batches: clean.batches.length } };
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
