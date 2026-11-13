import { useId } from 'react';
import { sk } from '../../i18n/sk.ts';

interface GoalPickerProps {
  goals: readonly number[];
  value: number;
  onChange: (goal: number) => void;
}

function copyFor(goal: number): { title: string; note: string } {
  return goal in sk.goals
    ? sk.goals[goal as keyof typeof sk.goals]
    : { title: String(goal), note: '' };
}

/** The daily goal: how many cards make a day "done". */
export function GoalPicker({ goals, value, onChange }: GoalPickerProps) {
  const name = useId();
  return (
    <div role="radiogroup" className="flex flex-col gap-3">
      {goals.map((goal) => {
        const { title, note } = copyFor(goal);
        const checked = goal === value;
        return (
          <label
            key={goal}
            className={`flex min-h-16 cursor-pointer items-center gap-4 rounded-2xl border px-4 py-3 ${
              checked ? 'border-accent bg-surface' : 'border-line'
            }`}
          >
            <input
              type="radio"
              name={name}
              checked={checked}
              onChange={() => {
                onChange(goal);
              }}
              className="size-5 shrink-0 accent-(--kv-accent)"
            />
            <span className="flex flex-col">
              <span className="font-display text-lg font-bold">{title}</span>
              <span className="text-sm text-muted">{note}</span>
            </span>
          </label>
        );
      })}
    </div>
  );
}
