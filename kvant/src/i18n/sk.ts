/**
 * Every user-facing string of the app, in Slovak.
 *
 * Tone: calm and matter-of-fact, informal "ty", never guilt-tripping. Sentences that address the
 * reader avoid gendered past-tense forms where a neutral wording exists.
 *
 * Not in this file: the web manifest strings (vite.config.ts), the static fallback text in
 * index.html, and learning content, which lives in content packs.
 */
import type { AttributeCode } from '../../shared/taxonomy.ts';

const attributes: Record<AttributeCode, string> = {
  T: 'Technika',
  R: 'Riadenie',
  B: 'Biznis',
  M: 'Myseľ',
  W: 'Rozhľad',
  J: 'Jazyky',
};

const attributeDomains: Record<AttributeCode, string> = {
  T: 'Inžinierstvo a technológie',
  R: 'Výroba a manažment',
  B: 'Peniaze a podnikanie',
  M: 'Telo a myseľ',
  W: 'Svet a všeobecný prehľad',
  J: 'Cudzie jazyky',
};

export const sk = {
  app: {
    name: 'Kvant',
    tagline: 'Jedna karta, jedna myšlienka.',
  },

  nav: {
    label: 'Hlavná navigácia',
    feed: 'Feed',
    paths: 'Cesty',
    collection: 'Zbierka',
    character: 'Postava',
  },

  attributes,
  attributeDomains,

  common: {
    comingHeading: 'Čo tu bude',
    phase: (phase: number) => `Fáza ${phase}`,
  },

  feed: {
    kicker: 'Fáza 0 · základ',
    heading: 'Karty sú na ceste.',
    body: 'Kvant sa už dá nainštalovať a otvorí sa aj bez internetu. Karty, kvízy a opakovanie pribudnú v ďalšej fáze.',
  },

  paths: {
    title: 'Cesty',
    lead: 'Každá kategória dostane vlastnú cestu: mapu tém od základov po tie náročnejšie.',
    items: [
      'Kapitoly sa odomykajú postupne, ako pribúdajú videné karty.',
      'Každú kapitolu uzatvára boss: 10 otázok, na výhru treba aspoň 80 %.',
      'Cesty aj feed pracujú s tými istými kartami, pokrok je spoločný.',
    ],
  },

  collection: {
    title: 'Zbierka',
    lead: 'Karty, ktoré má pamäť naozaj zvládnuté, tu zostanú natrvalo.',
    items: [
      'Zvládnuté karty podľa vzácnosti, od bežných po legendárne.',
      'Záložky a vyhľadávanie.',
      'Prehľad, koľko je zvládnuté v každej kategórii.',
    ],
  },

  character: {
    title: 'Postava',
    lead: 'Postava rastie s každou kartou. Skúsenosti idú do úrovne aj do jedného zo šiestich atribútov.',
    attributesHeading: 'Atribúty',
    items: [
      'Úroveň, hodnosť a trieda podľa toho, čo sa učíš najviac.',
      'Ostrosť každého atribútu: ako dobre si pamätáš to, čo už vieš.',
      'Denné úlohy, úspechy a štatistiky.',
    ],
  },

  theme: {
    label: 'Motív',
    dark: 'Tmavý',
    light: 'Svetlý',
  },

  status: {
    heading: 'Stav aplikácie',
    version: 'Verzia',
    offline: 'Bez internetu',
    offlineReady: 'pripravené',
    offlinePending: 'pripravuje sa',
    offlineUnsupported: 'nedostupné',
    offlineDev: 'vypnuté pri vývoji',
    database: 'Databáza',
    databaseReady: 'pripravená',
    databaseOpening: 'otvára sa',
    databaseError: 'nedostupná',
    cards: 'Karty v databáze',
  },

  error: {
    title: 'Niečo sa pokazilo.',
    body: 'Túto obrazovku sa nepodarilo zobraziť. Tvoj pokrok je uložený v zariadení a ostáva v bezpečí.',
    reload: 'Načítať znova',
  },

  pwa: {
    updateTitle: 'Nová verzia',
    updateBody: 'Kvant má novú verziu.',
    reload: 'Obnoviť',
    later: 'Neskôr',
    offlineReady: 'Kvant je pripravený aj bez internetu.',
    close: 'Zavrieť',
  },
} as const;
