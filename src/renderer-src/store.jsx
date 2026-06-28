/* Central app state — replaces the module-globals of the old renderer.js.
 * Holds the persisted store (payees/batches/settings), the live settings, the
 * working batch, the current view, theme and a toast channel. All persistence
 * goes through window.api (preload.js), exactly as before. */
import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import * as Core from './core.js';

const S = Core.Santander;

const AppCtx = createContext(null);
export function useApp() { return useContext(AppCtx); }

function defaultSettings() {
  return {
    selectedBank: 'santander',
    outputFormat: S.OUTPUT_FORMATS.BACS_IMPORT,
    paymentType: S.PAYMENT_TYPES.SINGLE,
    debitSortCode: '',
    debitAccountNumber: '',
    debtorIban: '',
    debtorBic: '',
    paymentDate: S.todayISO(),
    fileLocationId: '',
    sequenceNumber: 1,
    theme: 'system'
  };
}

// Copy the remembered settings out of the store (payment date always = today).
function pickStored(s) {
  return {
    debitSortCode: s.debitSortCode || '',
    debitAccountNumber: s.debitAccountNumber || '',
    debtorIban: s.debtorIban || '',
    debtorBic: s.debtorBic || '',
    fileLocationId: s.fileLocationId || '',
    sequenceNumber: s.sequenceNumber || 1,
    paymentType: s.paymentType || S.PAYMENT_TYPES.SINGLE,
    outputFormat: s.outputFormat || S.OUTPUT_FORMATS.BACS_IMPORT,
    selectedBank: s.selectedBank || 'santander',
    theme: s.theme || 'system'
  };
}

// The subset of `settings` that gets persisted into data.settings.
function serializeSettings(s) {
  return {
    selectedBank: s.selectedBank,
    outputFormat: s.outputFormat,
    debitSortCode: s.debitSortCode,
    debitAccountNumber: s.debitAccountNumber,
    debtorIban: s.debtorIban,
    debtorBic: s.debtorBic,
    fileLocationId: s.fileLocationId,
    sequenceNumber: s.sequenceNumber,
    paymentType: s.paymentType,
    theme: s.theme
  };
}

function applyTheme(theme) {
  const t = theme || 'system';
  if (t === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
}

export function AppProvider({ children }) {
  const [data, setData] = useState({ payees: [], batches: [], settings: {} });
  const [settings, setSettings] = useState(defaultSettings());
  const [batch, setBatchRaw] = useState([]);

  // Every batch row carries a stable `_id` so the editable grid can key rows by
  // identity (not array index) — this is what keeps the caret put while typing.
  const setBatch = useCallback((updater) => {
    setBatchRaw((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      return next.map((p) => (p._id ? p : { ...p, _id: 'r_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36) }));
    });
  }, []);
  const [view, setView] = useState('home');
  const [intent, setIntent] = useState(null); // cross-screen action, e.g. 'import'
  const [ready, setReady] = useState(false);
  const [toast, setToast] = useState({ msg: '', error: false, n: 0 });

  // Refs so persist() always sees the latest values without stale closures.
  const dataRef = useRef(data); dataRef.current = data;
  const settingsRef = useRef(settings); settingsRef.current = settings;

  // ---- boot ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let d;
      try { d = await window.api.loadData(); }
      catch (_) { d = { payees: [], batches: [], settings: {} }; }
      d.payees = d.payees || [];
      d.batches = d.batches || [];
      d.settings = d.settings || {};
      if (cancelled) return;
      setData(d);
      setSettings((s) => ({ ...s, ...pickStored(d.settings), paymentDate: S.todayISO() }));
      applyTheme(d.settings.theme || 'system');
      setReady(true);
      // Save once so a legacy plaintext store migrates to the encrypted one.
      try { window.api.saveData(d); } catch (_) { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // Persist current data + serialized settings. Always build a fresh object so
  // we never mutate the current state (or an object a caller passed in).
  const persist = useCallback((nextData) => {
    const merged = { ...(nextData || dataRef.current), settings: serializeSettings(settingsRef.current) };
    setData(merged);
    try { window.api.saveData(merged); } catch (_) { /* ignore */ }
  }, []);

  // Update live settings (and persist the remembered subset).
  const updateSettings = useCallback((partial) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      settingsRef.current = next;
      const merged = { ...dataRef.current, settings: serializeSettings(next) };
      try { window.api.saveData(merged); } catch (_) { /* ignore */ }
      setData(merged);
      return next;
    });
  }, []);

  const setTheme = useCallback((theme) => { applyTheme(theme); updateSettings({ theme }); }, [updateSettings]);

  const showToast = useCallback((msg, error = false) => {
    setToast((t) => ({ msg, error, n: t.n + 1 }));
  }, []);

  // ---- payees ----
  const upsertPayee = useCallback((payee) => {
    const payees = dataRef.current.payees.slice();
    const i = payees.findIndex((p) => p.id === payee.id);
    if (i >= 0) payees[i] = payee; else payees.push(payee);
    persist({ ...dataRef.current, payees });
  }, [persist]);

  const deletePayee = useCallback((id) => {
    persist({ ...dataRef.current, payees: dataRef.current.payees.filter((p) => p.id !== id) });
  }, [persist]);

  // ---- batches (history) ----
  const saveBatch = useCallback((entry) => {
    persist({ ...dataRef.current, batches: [entry, ...dataRef.current.batches] });
  }, [persist]);

  const deleteBatch = useCallback((id) => {
    persist({ ...dataRef.current, batches: dataRef.current.batches.filter((b) => b.id !== id) });
  }, [persist]);

  const navigate = useCallback((v) => { setView(v); const m = document.querySelector('main'); if (m) m.scrollTop = 0; }, []);

  const replaceData = useCallback((d) => {
    d.payees = d.payees || []; d.batches = d.batches || []; d.settings = d.settings || {};
    setData(d);
    setSettings((s) => ({ ...s, ...pickStored(d.settings), paymentDate: S.todayISO() }));
    applyTheme(d.settings.theme || 'system');
  }, []);

  const value = {
    Core,
    data, settings, batch, setBatch,
    view, navigate,
    intent, setIntent,
    ready, toast,
    updateSettings, setTheme, showToast,
    upsertPayee, deletePayee, saveBatch, deleteBatch,
    replaceData
  };

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
