import { Check } from 'lucide-react';

/* Horizontal timeline stepper. `current` is a 0-based index; steps before it
 * render as done (check), the current one is highlighted, the rest upcoming.
 * onStep(i) is called when a reachable step is clicked (i <= current allowed). */
export default function Stepper({ steps, current, onStep }) {
  return (
    <ol className="stepper">
      {steps.map((s, i) => {
        const done = i < current;
        const on = i === current;
        const reachable = i <= current;
        return (
          <li key={s.label} className={'stepper-item' + (done ? ' done' : on ? ' on' : '')}>
            <button
              type="button"
              className="stepper-node"
              onClick={() => reachable && onStep && onStep(i)}
              disabled={!reachable}
              aria-current={on ? 'step' : undefined}
            >
              {done ? <Check size={16} /> : i + 1}
            </button>
            <span className="stepper-label">{s.label}</span>
            {s.sub && <span className="stepper-sub">{s.sub}</span>}
          </li>
        );
      })}
    </ol>
  );
}
