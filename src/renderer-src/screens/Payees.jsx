import { useState } from 'react';
import { useApp } from '../store.jsx';
import { onlyDigits } from '../lib/payments.js';
import PayeeModal from '../components/PayeeModal.jsx';

export default function Payees() {
  const { Core, data, deletePayee } = useApp();
  const S = Core.Santander;
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const payees = data.payees.slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  const openNew = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (p) => { setEditing(p); setModalOpen(true); };
  const remove = (p) => { if (confirm('Delete this payee?')) deletePayee(p.id); };

  return (
    <div className="card">
      <div className="card-head">
        <h2>Saved payees</h2>
        <button className="btn primary" onClick={openNew}>+ New payee</button>
      </div>

      {payees.length === 0
        ? <div className="empty">No saved payees yet.</div>
        : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Name</th><th>Sort code</th><th>Account</th><th>Default reference</th><th></th></tr>
              </thead>
              <tbody>
                {payees.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td>{S.formatSortCode(p.sortCode)}</td>
                    <td>{onlyDigits(p.accountNumber)}</td>
                    <td>{p.reference || ''}</td>
                    <td>
                      <button className="link" onClick={() => openEdit(p)}>edit</button>
                      <button className="link" onClick={() => remove(p)}>delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      <PayeeModal open={modalOpen} payee={editing} onOpenChange={setModalOpen} />
    </div>
  );
}
