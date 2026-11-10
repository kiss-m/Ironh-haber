const LEVELS = [0, 1, 2, 3];

/**
 * Decoration: discrete energy levels with one quantum that jumps up a level at a time. A quantum
 * is the smallest step there is, which is what a card is meant to be.
 */
export function EnergyLevels() {
  return (
    <div aria-hidden="true" className="relative h-[3.75rem] [--kv-level-gap:1.25rem]">
      {LEVELS.map((level) => (
        <span
          key={level}
          className="absolute inset-x-0 h-px bg-linear-to-r from-line via-line to-transparent"
          style={{ bottom: `calc(var(--kv-level-gap) * ${level})` }}
        />
      ))}
      <span className="absolute bottom-0 left-[14%] size-3 translate-y-1/2 animate-quantum rounded-full bg-accent shadow-[0_0_1.25rem_0.3rem] shadow-accent/35" />
    </div>
  );
}
