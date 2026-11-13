import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '../../components/ui/Button.tsx';
import { sk } from '../../i18n/sk.ts';

const NOTE_MAX_LENGTH = 300;

interface FlagSheetProps {
  open: boolean;
  /** The note of the current flag, or null when the card is not flagged. */
  current: string | null;
  onSubmit: (note: string) => void;
  onRemove: () => void;
  onClose: () => void;
}

/** "Chyba": flag a card as wrong, with an optional note about what is wrong. */
export function FlagSheet({ open, current, onSubmit, onRemove, onClose }: FlagSheetProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [note, setNote] = useState(current ?? '');

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) {
      setNote(current ?? '');
      element.showModal();
    } else if (!open && element.open) {
      element.close();
    }
  }, [open, current]);

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onClose={onClose}
      className="m-auto mb-0 w-full max-w-xl rounded-t-3xl border border-line bg-raised p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] text-fg backdrop:bg-black/60"
    >
      <form
        method="dialog"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(note);
        }}
        className="flex flex-col gap-4"
      >
        <div className="flex flex-col gap-1">
          <h2 id={titleId} className="font-display text-xl font-bold">
            {sk.flag.title}
          </h2>
          <p className="text-sm text-pretty text-muted">{sk.flag.hint}</p>
        </div>
        <label className="flex flex-col gap-2">
          <span className="text-sm font-semibold">{sk.flag.noteLabel}</span>
          <textarea
            value={note}
            rows={3}
            maxLength={NOTE_MAX_LENGTH}
            onChange={(event) => {
              setNote(event.target.value);
            }}
            className="rounded-2xl border border-line bg-surface px-4 py-3"
          />
        </label>
        <div className="flex flex-wrap justify-end gap-2">
          {current !== null ? (
            <Button variant="quiet" className="mr-auto" onClick={onRemove}>
              {sk.flag.remove}
            </Button>
          ) : null}
          <Button variant="quiet" onClick={onClose}>
            {sk.flag.cancel}
          </Button>
          <Button type="submit">{sk.flag.submit}</Button>
        </div>
      </form>
    </dialog>
  );
}
