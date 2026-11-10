import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'quiet';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const VARIANT: Record<Variant, string> = {
  primary: 'bg-accent text-on-accent',
  quiet: 'text-muted',
};

/** A text button with a touch target of at least 48 px. */
export function Button({ variant = 'primary', className = '', ...props }: ButtonProps) {
  return (
    <button
      type="button"
      className={`inline-flex min-h-12 items-center justify-center rounded-xl px-4 text-sm font-semibold transition-transform active:scale-95 ${VARIANT[variant]} ${className}`}
      {...props}
    />
  );
}
