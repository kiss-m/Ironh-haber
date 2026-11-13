interface BrandMarkProps {
  className?: string;
}

/**
 * The Kvant glyph: a K whose upper arm launches a quantum. Same geometry as
 * assets/brand/icon.svg, drawn in theme colours.
 */
export function BrandMark({ className }: BrandMarkProps) {
  return (
    <svg viewBox="130 100 270 312" className={className} aria-hidden="true" focusable="false">
      <g fill="none" strokeLinecap="round" strokeWidth="54">
        <path d="M170 140v232" className="stroke-fg" />
        <path d="M234 256l106 106" className="stroke-fg" />
        <path d="M234 256l60-60" className="stroke-accent" />
      </g>
      <circle cx="352" cy="132" r="30" className="fill-accent" />
    </svg>
  );
}
