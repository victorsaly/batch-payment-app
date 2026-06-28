import { useApp } from '../store.jsx';
import { FORMAT_LABELS, STANDARD18, ISO20022, SEPA } from '../lib/payments.js';

// Which settings fields each output format needs (mirrors the old data-fmt).
const FIELD_FORMATS = {
  debitSortCode: ['BACS_IMPORT', STANDARD18, ISO20022],
  debitAccountNumber: ['BACS_IMPORT', STANDARD18, ISO20022],
  debtorIban: [SEPA],
  debtorBic: [SEPA],
  paymentDate: ['BACS_IMPORT', 'MIXED', ISO20022, SEPA],
  sequenceNumber: ['BACS_IMPORT'],
  fileLocationId: ['BACS_IMPORT', STANDARD18, ISO20022, SEPA]
};

function multiNote(settings, S) {
  const f = settings.outputFormat;
  if (f === SEPA) return <><strong>SEPA credit transfer (pain.001.001.03):</strong> euro payments to IBANs across the EU/EEA. BIC is optional. Each bank uses its own SEPA profile — <strong>do a test upload before relying on it.</strong></>;
  if (f === ISO20022) return <><strong>ISO 20022 (pain.001):</strong> modern XML credit transfers. <strong>UK domestic GBP only for now.</strong> Each bank uses its own profile — <strong>do a test upload before relying on it.</strong></>;
  if (f === STANDARD18) return 'Standard 18: fixed-width Bacs credit records using your account as the originator. Some banks also require tape-label records — check your bank’s upload guidance.';
  if (f === S.OUTPUT_FORMATS.MIXED) return 'Mixed payments: one row per payment, no header/trailer. Only a payment date and the beneficiary rows are needed. Do a test upload to confirm acceptance.';
  if (settings.paymentType === S.PAYMENT_TYPES.MULTIPLE) return 'Multiple (MULTIBACS): all payments use this one debit account and payment date, and every payment needs a reference.';
  return 'Single (BACS): one debit account; reference is optional per payment.';
}

export default function SettingsCard() {
  const { Core, settings, updateSettings, navigate } = useApp();
  const S = Core.Santander;
  const bank = Core.Banks.get(settings.selectedBank) || Core.Banks.get('santander');
  const formats = (bank.formats && bank.formats.length) ? bank.formats : ['BACS_IMPORT'];
  const fmt = settings.outputFormat;
  const show = (field) => FIELD_FORMATS[field].includes(fmt);
  const set = (field) => (e) => updateSettings({ [field]: e.target.value });

  return (
    <div className="card settings-card">
      <div className="card-head">
        <div className="settings-title">
          <h2>Payment run settings</h2>
          <button type="button" className="bank-chip" title="Change bank" onClick={() => navigate('home')}>
            <span className="chip-badge" style={{ background: bank.color }}>{bank.initial}</span>
            <span>{bank.name}</span>
            <span className="chip-change">Change ▸</span>
          </button>
        </div>
        <div className="seg">
          {formats.map((f) => (
            <button key={f} type="button" className={'seg-btn' + (f === fmt ? ' active' : '')}
              onClick={() => updateSettings({ outputFormat: f })}>
              {FORMAT_LABELS[f] || f}
            </button>
          ))}
        </div>
      </div>

      {fmt === S.OUTPUT_FORMATS.BACS_IMPORT && (
        <div className="ptype-row">
          <span className="hint">Payment type</span>
          <div className="seg">
            <button type="button" className={'seg-btn' + (settings.paymentType === S.PAYMENT_TYPES.SINGLE ? ' active' : '')}
              onClick={() => updateSettings({ paymentType: S.PAYMENT_TYPES.SINGLE })}>Single (BACS)</button>
            <button type="button" className={'seg-btn' + (settings.paymentType === S.PAYMENT_TYPES.MULTIPLE ? ' active' : '')}
              onClick={() => updateSettings({ paymentType: S.PAYMENT_TYPES.MULTIPLE })}>Multiple (MULTIBACS)</button>
          </div>
        </div>
      )}

      <div className="settings-grid">
        {show('debitSortCode') && (
          <label>Debit sort code <span className="hint">your account</span>
            <input type="text" inputMode="numeric" placeholder="09-01-22" value={settings.debitSortCode} onChange={set('debitSortCode')} />
          </label>
        )}
        {show('debitAccountNumber') && (
          <label>Debit account number
            <input type="text" inputMode="numeric" placeholder="11223344" value={settings.debitAccountNumber} onChange={set('debitAccountNumber')} />
          </label>
        )}
        {show('debtorIban') && (
          <label>Your IBAN <span className="hint">the account you pay from</span>
            <input type="text" placeholder="DE89 3704 0044 0532 0130 00" value={settings.debtorIban} onChange={set('debtorIban')} />
          </label>
        )}
        {show('debtorBic') && (
          <label>Your BIC <span className="hint">optional</span>
            <input type="text" placeholder="DEUTDEFF" value={settings.debtorBic} onChange={set('debtorBic')} />
          </label>
        )}
        {show('paymentDate') && (
          <label>Payment date <span className="hint">ddmmyyyy</span>
            <input type="date" value={settings.paymentDate} onChange={set('paymentDate')} />
          </label>
        )}
        {show('sequenceNumber') && (
          <label>File sequence no. <span className="hint">1–9999, auto</span>
            <input type="number" min="1" max="9999" value={settings.sequenceNumber} onChange={set('sequenceNumber')} />
          </label>
        )}
        {show('fileLocationId') && (
          <label>Your name <span className="hint">originator / payer</span>
            <input type="text" placeholder="PAYMENT FILES" value={settings.fileLocationId} onChange={set('fileLocationId')} />
          </label>
        )}
      </div>
      <p className="settings-note">{multiNote(settings, S)}</p>
    </div>
  );
}
