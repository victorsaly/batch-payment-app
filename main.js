const { app, BrowserWindow, ipcMain, dialog, shell, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');

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
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
}

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
  const filters = kind === 'template'
    ? [{ name: 'CSV file', extensions: ['csv'] }, { name: 'All files', extensions: ['*'] }]
    : [{ name: 'Payment file', extensions: ['txt'] }, { name: 'All files', extensions: ['*'] }];

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

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
