import * as Dialog from '@radix-ui/react-dialog';

/* Accessible modal built on Radix Dialog, styled with our existing tokens.
 * `title` is required for a11y; pass `hideTitle` to keep it screen-reader only
 * when the header is rendered manually inside `children`. */
export default function Modal({ open, onOpenChange, title, hideTitle, wide, children }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content className={'modal' + (wide ? ' modal-wide' : '')} aria-describedby={undefined}>
          {hideTitle
            ? <Dialog.Title className="sr-only">{title}</Dialog.Title>
            : <Dialog.Title asChild><h3>{title}</h3></Dialog.Title>}
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
