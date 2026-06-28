import { useState } from 'react';
import { Plus, Download, LayoutGrid, Lock, WifiOff, ShieldCheck, ArrowRight, ArrowLeft, Check } from 'lucide-react';
import { useApp } from '../store.jsx';
import { emptyPayment } from '../lib/payments.js';
import Stepper from '../components/Stepper.jsx';

const STEPS = [
  { label: 'Choose your bank' },
  { label: 'Start your batch' },
  { label: 'Build & export' }
];

const FMT_LABEL = { BACS_IMPORT: 'Bacs', MIXED: 'Mixed', STANDARD18: 'Std 18', ISO20022: 'ISO 20022', SEPA: 'SEPA' };

function BankRow({ bank, active, onSelect }) {
  const soon = bank.status !== 'available';
  return (
    <tr className={'bank-row' + (active ? ' active' : '') + (soon ? ' soon' : '')} onClick={() => onSelect(bank.id)}>
      <td className="bank-cell">
        <span className="bank-badge sm" style={{ backgroundColor: bank.color }}>{bank.initial}</span>
        <span className="bank-name">{bank.name}</span>
      </td>
      <td className="bank-formats">
        {bank.formats && bank.formats.length
          ? bank.formats.map((f) => <span className="fmt-chip" key={f}>{FMT_LABEL[f] || f}</span>)
          : <span className="hint">—</span>}
      </td>
      <td className="bank-status-cell">{bank.beta ? 'Beta' : (soon ? 'Coming soon' : 'Available')}</td>
      <td className="bank-check">{active && <Check size={16} />}</td>
    </tr>
  );
}

export default function Home() {
  const { Core, data, settings, updateSettings, navigate, setBatch, setIntent, showToast, batch } = useApp();
  const S = Core.Santander;
  const [step, setStep] = useState(1);
  const [term, setTerm] = useState('');

  const banks = Core.Banks.BANKS;
  const t = term.trim().toLowerCase();
  const match = (b) => !t || b.name.toLowerCase().includes(t);
  const availBanks = banks.filter((b) => b.status === 'available' && b.kind === 'bank' && match(b));
  const availFormats = banks.filter((b) => b.status === 'available' && b.kind === 'format' && match(b));
  const soon = banks.filter((b) => b.status !== 'available' && match(b));
  const totalShown = availBanks.length + availFormats.length + soon.length;

  const bank = Core.Banks.get(settings.selectedBank) || Core.Banks.get('santander');
  const bankAvailable = Core.Banks.isAvailable(settings.selectedBank);

  const selectBank = (id) => {
    const b = Core.Banks.get(id) || Core.Banks.get('santander');
    const formats = (b.formats && b.formats.length) ? b.formats : ['BACS_IMPORT'];
    const outputFormat = formats.includes(settings.outputFormat) ? settings.outputFormat : formats[0];
    updateSettings({ selectedBank: id, outputFormat });
  };

  const onNewBatch = () => {
    if (bankAvailable && batch.length === 0) setBatch([emptyPayment()]);
    navigate('batch');
  };
  const onImport = () => { setIntent('import'); navigate('batch'); };
  const onTemplate = async () => {
    const res = await window.api.exportFile({ suggestedName: 'batch-payment-template.csv', contents: S.buildTemplate(), kind: 'template' });
    if (res && res.saved) showToast('Template saved & opened — fill it in, then Import');
  };

  return (
    <div className="wizard">
      <div className="wizard-head">
        <span className="home-eyebrow">Bulk payments, without the spreadsheet</span>
        <h1>Welcome to PayBatch</h1>
        <div className="home-trust" title="Your data never leaves this computer">
          <span><Lock className="icon" size={14} /> Encrypted</span>
          <span><WifiOff className="icon" size={14} /> Works fully offline</span>
          <span><ShieldCheck className="icon" size={14} /> Never shared online</span>
        </div>
      </div>

      <Stepper steps={STEPS} current={step - 1} onStep={(i) => setStep(i + 1)} />

      {step === 1 && (
        <div className="wizard-body">
          <input className="bank-search" type="search" placeholder="Search banks & formats…" autoComplete="off"
            value={term} onChange={(e) => setTerm(e.target.value)} />
          <p className="bank-legend">
            Pick your <strong>bank</strong> for its own expected file layout, or a{' '}
            <strong>cross-bank format</strong> (Bacs Standard&nbsp;18, ISO&nbsp;20022) if your bank accepts a standard file.
          </p>
          <div className="bank-scroll wizard-scroll bank-list">
            {totalShown === 0
              ? <p className="bank-noresult">Nothing matches your search.</p>
              : (
                <table className="bank-table">
                  <tbody>
                    {availBanks.length > 0 && <tr className="bank-group-row"><td colSpan={4}>Banks</td></tr>}
                    {availBanks.map((b) => <BankRow key={b.id} bank={b} active={b.id === settings.selectedBank} onSelect={selectBank} />)}
                    {availFormats.length > 0 && <tr className="bank-group-row"><td colSpan={4}>Cross-bank formats</td></tr>}
                    {availFormats.map((b) => <BankRow key={b.id} bank={b} active={b.id === settings.selectedBank} onSelect={selectBank} />)}
                    {soon.length > 0 && <tr className="bank-group-row"><td colSpan={4}>Coming soon</td></tr>}
                    {soon.map((b) => <BankRow key={b.id} bank={b} active={b.id === settings.selectedBank} onSelect={selectBank} />)}
                  </tbody>
                </table>
              )}
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="wizard-body wizard-body-center">
          <div className="wizard-bankpick">
            <span className="chip-badge" style={{ background: bank.color }}>{bank.initial}</span>
            <div>
              <strong>{bank.name}</strong>
              <span className="hint"> · {bankAvailable ? 'ready to build' : 'coming soon'}</span>
            </div>
            <button className="link" onClick={() => setStep(1)}>Change</button>
          </div>
          <div className="home-actions">
            <button className="home-card" onClick={onNewBatch}>
              <span className="home-card-icon"><Plus size={21} /></span>
              <span className="home-card-title">New batch</span>
              <span className="home-card-sub">Add payments in a grid or one at a time</span>
            </button>
            <button className="home-card" onClick={onImport}>
              <span className="home-card-icon"><Download size={21} /></span>
              <span className="home-card-title">Import a file</span>
              <span className="home-card-sub">Load an Excel / CSV export</span>
            </button>
            <button className="home-card" onClick={onTemplate}>
              <span className="home-card-icon"><LayoutGrid size={21} /></span>
              <span className="home-card-title">Get the template</span>
              <span className="home-card-sub">A ready-to-fill CSV to start from</span>
            </button>
          </div>
          {data.batches.length > 0 && (
            <p className="wizard-recent">
              {data.payees.length} saved payee{data.payees.length === 1 ? '' : 's'} · {data.batches.length} saved batch{data.batches.length === 1 ? '' : 'es'} —{' '}
              <button className="link" onClick={() => navigate('history')}>view history</button>
            </p>
          )}
        </div>
      )}

      <div className="wizard-nav">
        {step === 2
          ? <button className="btn ghost" onClick={() => setStep(1)}><ArrowLeft size={16} /> Back</button>
          : <span />}
        {step === 1 && (
          <button className="btn primary" onClick={() => setStep(2)}>
            Continue with {bank.name} <ArrowRight size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
