import { useId } from 'react';

interface ToggleProps {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

/** An on/off setting: its name, a line about what it does, and a switch. */
export function Toggle({ label, hint, checked, onChange }: ToggleProps) {
  const labelId = useId();
  const hintId = useId();
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex min-w-0 flex-col">
        <span id={labelId} className="font-semibold">
          {label}
        </span>
        {hint ? (
          <span id={hintId} className="text-sm text-pretty text-muted">
            {hint}
          </span>
        ) : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        aria-describedby={hint ? hintId : undefined}
        onClick={() => {
          onChange(!checked);
        }}
        className={`flex h-12 w-14 shrink-0 items-center rounded-full border-2 px-1 transition-colors ${
          checked ? 'justify-end border-accent bg-accent' : 'justify-start border-line bg-surface'
        }`}
      >
        <span className={`size-6 rounded-full ${checked ? 'bg-on-accent' : 'bg-muted'}`} />
      </button>
    </div>
  );
}
