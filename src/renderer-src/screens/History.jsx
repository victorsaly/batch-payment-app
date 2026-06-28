import { useApp } from '../store.jsx';

export default function History() {
  const { Core, data, setBatch, updateSettings, navigate, deleteBatch, showToast } = useApp();
  const S = Core.Santander;
  const batches = data.batches;

  const load = (b) => {
    setBatch(b.payments.map((p) => ({ ...p })));
    if (b.settings) updateSettings({ ...b.settings, paymentDate: S.todayISO() });
    navigate('batch');
    showToast('Batch loaded — check the payment date, then re-export');
  };

  const remove = (b) => { if (confirm('Delete this saved batch?')) deleteBatch(b.id); };

  return (
    <div className="card">
      <h2>Saved batches</h2>
      {batches.length === 0
        ? <div className="empty">No saved batches yet.</div>
        : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Saved</th><th>Payments</th><th className="num">Total</th><th></th></tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.id}>
                    <td>{new Date(b.savedAt).toLocaleString()}</td>
                    <td>{b.payments.length} <span className="hint">{b.paymentType || ''}</span></td>
                    <td className="num">£{S.formatAmount(b.total)}</td>
                    <td>
                      <button className="link" onClick={() => load(b)}>load</button>
                      <button className="link" onClick={() => remove(b)}>delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </div>
  );
}
