/**
 * What Kvant teaches: six domains, one per character attribute, and the categories inside them
 * (docs/SPEC.md section 4).
 *
 *   T  Technika  engineering and technology
 *   R  Riadenie  production and management
 *   B  Biznis    money and business
 *   M  Myseľ     body and mind
 *   W  Rozhľad   world and general knowledge
 *   J  Jazyky    languages
 *
 * The Slovak attribute names shown in the app live in src/i18n/sk.ts. Category names are content,
 * so they live here and must match `category.name` in the category's pack.
 */

export const ATTRIBUTE_CODES = ['T', 'R', 'B', 'M', 'W', 'J'] as const;

export type AttributeCode = (typeof ATTRIBUTE_CODES)[number];

export interface CategoryDef {
  /** Also the pack id and the file name: content/packs/<id>.json. */
  id: string;
  /** Slovak display name. */
  name: string;
  attribute: AttributeCode;
  /** Starter categories get content in Phase 2. The rest stay hidden until a pack exists. */
  starter: boolean;
}

export const CATEGORIES: readonly CategoryDef[] = [
  // T: Technika
  { id: 'matematika', name: 'Matematika pre inžinierov', attribute: 'T', starter: true },
  { id: 'fyzika-mechanika', name: 'Fyzika a mechanika', attribute: 'T', starter: true },
  { id: 'robotika', name: 'Robotika', attribute: 'T', starter: true },
  { id: 'automatizacia-plc', name: 'Automatizácia a PLC', attribute: 'T', starter: true },
  { id: 'digitalne-dvojca', name: 'Digitálne dvojča a simulácia', attribute: 'T', starter: true },
  { id: 'vyrobne-stroje', name: 'Výrobné stroje a systémy', attribute: 'T', starter: true },
  { id: 'hydraulika-pneumatika', name: 'Hydraulika a pneumatika', attribute: 'T', starter: false },
  {
    id: 'elektrotechnika-pohony',
    name: 'Elektrotechnika a pohony',
    attribute: 'T',
    starter: false,
  },
  { id: 'materialy-technologie', name: 'Materiály a technológie', attribute: 'T', starter: false },
  { id: 'programovanie-data-ai', name: 'Programovanie, dáta a AI', attribute: 'T', starter: false },
  { id: 'kyberbezpecnost', name: 'Kyberbezpečnosť', attribute: 'T', starter: false },

  // R: Riadenie
  { id: 'lean-kvalita', name: 'Štíhla výroba a kvalita', attribute: 'R', starter: true },
  { id: 'projektovy-manazment', name: 'Projektový manažment', attribute: 'R', starter: true },
  { id: 'komunikacia-vedenie', name: 'Komunikácia a vedenie ľudí', attribute: 'R', starter: false },

  // B: Biznis
  { id: 'peniaze-podnikanie', name: 'Peniaze a podnikanie', attribute: 'B', starter: true },
  { id: 'marketing-predaj', name: 'Marketing a predaj', attribute: 'B', starter: false },
  { id: 'pravo-dane', name: 'Právo a dane v praxi', attribute: 'B', starter: false },
  { id: 'ekonomia', name: 'Ekonómia', attribute: 'B', starter: false },

  // M: Myseľ
  { id: 'psychologia-mozog', name: 'Psychológia a mozog', attribute: 'M', starter: true },
  { id: 'vyziva-trening', name: 'Výživa a tréning', attribute: 'M', starter: false },
  { id: 'zdravie-prva-pomoc', name: 'Zdravie a prvá pomoc', attribute: 'M', starter: false },

  // W: Rozhľad
  { id: 'ako-veci-funguju', name: 'Ako veci fungujú', attribute: 'W', starter: true },
  { id: 'dejiny-techniky', name: 'Dejiny techniky a sveta', attribute: 'W', starter: false },
  { id: 'vesmir-priroda', name: 'Vesmír a príroda', attribute: 'W', starter: false },
  { id: 'veda-o-jedle', name: 'Veda o jedle', attribute: 'W', starter: false },
  { id: 'geografia-geopolitika', name: 'Geografia a geopolitika', attribute: 'W', starter: false },
  { id: 'filozofia-logika', name: 'Filozofia a logika', attribute: 'W', starter: false },
  { id: 'umenie-dizajn', name: 'Umenie, hudba a dizajn', attribute: 'W', starter: false },

  // J: Jazyky
  { id: 'nemcina', name: 'Nemčina', attribute: 'J', starter: true },
  { id: 'technicka-anglictina', name: 'Technická angličtina', attribute: 'J', starter: false },
];

const CATEGORY_BY_ID: ReadonlyMap<string, CategoryDef> = new Map(
  CATEGORIES.map((category) => [category.id, category]),
);

export function findCategory(id: string): CategoryDef | undefined {
  return CATEGORY_BY_ID.get(id);
}

export const STARTER_CATEGORIES: readonly CategoryDef[] = CATEGORIES.filter(
  (category) => category.starter,
);
