import { ATTRIBUTE_CODES } from '../../../shared/taxonomy.ts';
import { ATTRIBUTE_SWATCH } from '../../components/ui/attributes.ts';
import { CategoryIcon } from '../../components/ui/CategoryIcon.tsx';
import type { CategoryRow } from '../../data/types.ts';
import { sk } from '../../i18n/sk.ts';

interface CategoryPickerProps {
  categories: readonly CategoryRow[];
  selected: readonly string[];
  onChange: (selected: string[]) => void;
}

/** Categories to learn from, grouped by the attribute they train. */
export function CategoryPicker({ categories, selected, onChange }: CategoryPickerProps) {
  const groups = ATTRIBUTE_CODES.map((code) => ({
    code,
    items: categories.filter((category) => category.attribute === code),
  })).filter((group) => group.items.length > 0);

  function toggle(id: string, checked: boolean): void {
    const next = checked ? [...selected, id] : selected.filter((other) => other !== id);
    // Keep the order of the list, not the order of the taps.
    onChange(categories.map((category) => category.id).filter((other) => next.includes(other)));
  }

  return (
    <div className="flex flex-col gap-5">
      {groups.map(({ code, items }) => (
        // A fieldset is as wide as its longest word unless told otherwise.
        <fieldset key={code} className="flex min-w-0 flex-col gap-2">
          <legend className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-widest text-muted uppercase">
            <span
              aria-hidden="true"
              className={`size-2.5 rounded-full ${ATTRIBUTE_SWATCH[code]}`}
            />
            {sk.attributes[code]}
          </legend>
          {items.map((category) => {
            const checked = selected.includes(category.id);
            return (
              <label
                key={category.id}
                className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 ${
                  checked ? 'border-accent bg-surface' : 'border-line'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(event) => {
                    toggle(category.id, event.target.checked);
                  }}
                  className="size-5 shrink-0 accent-(--kv-accent)"
                />
                <span className="flex min-w-0 flex-col wrap-anywhere">
                  <span className="flex items-center gap-2 font-semibold">
                    <span style={{ color: category.color }}>
                      <CategoryIcon name={category.icon} className="size-5" />
                    </span>
                    {category.name}
                  </span>
                  <span className="text-sm text-pretty text-muted">{category.description}</span>
                </span>
              </label>
            );
          })}
        </fieldset>
      ))}
    </div>
  );
}
