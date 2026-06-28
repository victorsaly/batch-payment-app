import { useEffect, useState } from 'react';
import Modal from './Modal.jsx';
import { renderMarkdown } from '../lib/markdown.js';

export default function ChangelogModal({ open, onOpenChange }) {
  const [html, setHtml] = useState('Loading…');

  useEffect(() => {
    if (!open) return;
    setHtml('Loading…');
    (async () => {
      let md;
      try { md = await window.api.changelog(); } catch (_) { md = '# Changelog\n\nUnavailable.'; }
      setHtml(renderMarkdown(md));
    })();
  }, [open]);

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="What's new in PayBatch" hideTitle wide>
      <div className="card-head">
        <h3>What's new in PayBatch</h3>
        <button className="btn ghost tiny" onClick={() => onOpenChange(false)}>Close</button>
      </div>
      <div className="changelog-body" dangerouslySetInnerHTML={{ __html: html }} />
    </Modal>
  );
}
