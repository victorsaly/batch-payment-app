import { memo, useMemo } from 'react';
import { validateRow, SEPA } from '../lib/payments.js';
import * as Core from '../core.js';

const S = Core.Santander;

// Editable columns in display order. `col` is the visibility group per format.
const CELLS = [
  { field: 'name', cls: '' },
  { field: 'sortCode', cls: 'mono', col: 'bacs' },
  { field: 'accountNumber', cls: 'mono', col: 'bacs' },
  { field: 'iban', cls: 'mono', col: 'sepa' },
  { field: 'bic', cls: 'mono', col: 'sepa' },
  { field: 'amount', cls: 'num' },
  { field: 'reference', cls: '' },
  { field: 'rti', cls: 'mono', col: 'rti' }
];

function visibleCells(outputFormat) {
  const isSepa = outputFormat === SEPA;
  return CELLS.filter((c) => {
    if (c.col === 'bacs') return !isSepa;
    if (c.col === 'sepa') return isSepa;
    if (c.col === 'rti') return outputFormat === S.OUTPUT_FORMATS.BACS_IMPORT;
    return true;
  });
}

/* One row. Memoized so it only re-renders when its own row object or the
 * settings change — typing in row N never re-renders row M, which (together
 * with controlled inputs whose value is set verbatim) keeps the caret put. */
const Row = memo(function Row({ row, index, cells, settings, onCell, onRemove }) {
  const { fieldErrors, fieldWarnings, errors, warnings } = validateRow(row, settings);
  return (
    <tr className={errors.length ? 'has-error' : ''}>
      <td className="idx-cell">{index + 1}</td>
      {cells.map((c) => {
        const err = fieldErrors[c.field];
        const warn = !err && fieldWarnings[c.field];
        return (
          <td key={c.field}>
            <input
              className={'cell-input ' + c.cls + (err ? ' invalid' : warn ? ' warn' : '')}
              value={row[c.field] == null ? '' : row[c.field]}
              onChange={(e) => onCell(row._id, c.field, e.target.value)}
            />
            <div className={'field-msg ' + (err ? 'err' : warn ? 'warn' : '')}>{err || warn || ''}</div>
          </td>
        );
      })}
      <td className="status-cell">
        {errors.length
          ? <span className="badge err">{errors.length} error{errors.length > 1 ? 's' : ''}</span>
          : warnings.length
            ? <span className="badge warn">check</span>
            : <span className="badge ok">OK</span>}
      </td>
      <td><button className="link" onClick={() => onRemove(row._id)}>remove</button></td>
    </tr>
  );
});

export default function BatchGrid({ batch, settings, onCell, onRemove }) {
  // Stable `cells` reference unless the format changes — otherwise a new array
  // each render would pass through to every Row and defeat React.memo.
  const cells = useMemo(() => visibleCells(settings.outputFormat), [settings.outputFormat]);
  return (
    <div className="table-wrap">
      <table className="editable">
        <thead>
          <tr>
            <th>#</th>
            {cells.map((c) => <th key={c.field} className={c.cls === 'num' ? 'num' : ''}>{HEADERS[c.field]}</th>)}
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {batch.map((row, i) => (
            <Row key={row._id} row={row} index={i} cells={cells} settings={settings} onCell={onCell} onRemove={onRemove} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

const HEADERS = {
  name: 'Name', sortCode: 'Sort code', accountNumber: 'Account',
  iban: 'IBAN', bic: 'BIC', amount: 'Amount', reference: 'Reference', rti: 'RTI'
};
