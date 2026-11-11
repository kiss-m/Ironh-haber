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
    label: 'Feed kariet',
    loading: 'Miešam karty…',
    next: 'Ďalšia karta',
    goal: (seen: number, goal: number) => `Dnes ${seen} z ${goal} kariet`,
    goalMet: 'Denný cieľ je splnený',
    level: (level: number) => `Úroveň ${level}`,
    due: (count: number) => `Opakovania: ${count}`,
    xp: (xp: number) => `+${xp} XP`,
    levelUp: 'Nová úroveň',
    levelUpClose: 'Pokračovať',
  },

  checkpoint: {
    kicker: (batch: number) => `Zastávka ${batch}`,
    title: 'Desať kariet je za tebou.',
    goalTitle: 'Denný cieľ je splnený.',
    goalBody: 'Na dnes je hotovo. Všetko ďalšie je bonus.',
    xp: 'Skúsenosti',
    newCards: 'Nové karty',
    accuracy: 'Správne odpovede',
    accuracyValue: (correct: number, answers: number) => `${correct} z ${answers}`,
    today: 'Dnes',
    todayValue: (seen: number, goal: number) => `${seen} z ${goal}`,
    learned: 'V tejto desiatke pribudlo',
    continue: 'Pokračovať',
    stop: 'Na dnes stačí',
  },

  end: {
    title: 'To je nateraz všetko.',
    capBody: 'Dnešná dávka nových kariet je vyčerpaná a nič nečaká na opakovanie.',
    emptyBody: 'Vo vybraných kategóriách už nie sú nové karty a nič nečaká na opakovanie.',
    summary: 'Pozrieť dnešok',
  },

  done: {
    title: 'Na dnes stačí.',
    body: 'Mozog si karty usporiada, kým robíš niečo iné. Zajtra na ne nadviažeš.',
    cards: 'Karty',
    newCards: 'Z toho nové',
    accuracy: 'Správne odpovede',
    xp: 'Skúsenosti',
    minutes: 'Minúty namiesto scrollovania',
    tomorrow: (count: number) =>
      count === 0
        ? 'Zajtra nečaká žiadne opakovanie.'
        : count === 1
          ? 'Zajtra čaká 1 opakovanie.'
          : count < 5
            ? `Zajtra čakajú ${count} opakovania.`
            : `Zajtra čaká ${count} opakovaní.`,
    back: 'Späť do feedu',
    empty: 'Dnes ešte nič.',
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

  cards: {
    type: {
      concept: 'Koncept',
      formula: 'Vzorec',
      example: 'Z praxe',
      did_you_know: 'Vedel si?',
      myth: 'Mýtus vs. realita',
      quiz: 'Kvíz',
      numeric: 'Výpočet',
      vocab: 'Slovíčko',
    },
    /** Why a card is in the feed, when it is not simply the next new card. */
    source: {
      due: 'Opakovanie',
      recent: 'Opakovanie',
      repeat: 'Ešte raz',
      serendipity: 'Niečo iné',
    },
    simple: 'Jednoduchšie',
    willReturn: 'Karta sa o chvíľu vráti.',
    termEn: 'EN',
    termDe: 'DE',
    legend: 'Veličiny',
    example: 'Príklad',
    answerCorrect: 'Správne',
    answerWrong: 'Nesprávne',
    myth: {
      prompt: 'Pravda, alebo mýtus?',
      isTrue: 'Pravda',
      isMyth: 'Mýtus',
      verdictTrue: 'Je to pravda.',
      verdictMyth: 'Je to mýtus.',
    },
    flashcard: {
      reveal: 'Ukázať odpoveď',
      answer: 'Odpoveď',
      prompt: 'Ako to išlo?',
      again: 'Nevedel',
      hard: 'Ťažké',
      good: 'Vedel',
      easy: 'Ľahké',
    },
    showFullCard: 'Celá karta',
    hideFullCard: 'Skryť kartu',
    loading: 'Načítavam kartu…',
    missing: 'Táto karta už nie je k dispozícii.',
  },

  actions: {
    label: 'Akcie ku karte',
    like: 'Viac takého',
    bookmark: 'Uložiť',
    known: 'Už viem',
    notUnderstood: 'Nerozumiem',
    flag: 'Chyba',
  },

  flag: {
    title: 'Nahlásiť chybu',
    hint: 'Karta sa označí, aby sa dala pri najbližšej úprave obsahu opraviť.',
    noteLabel: 'Čo nesedí? (nepovinné)',
    submit: 'Nahlásiť',
    cancel: 'Zrušiť',
    remove: 'Zrušiť nahlásenie',
  },

  start: {
    loading: 'Pripravujem karty…',
    errorTitle: 'Karty sa nepodarilo načítať.',
    errorBody:
      'Pri prvom spustení treba pripojenie na internet. Potom už Kvant funguje aj bez neho.',
    retry: 'Skúsiť znova',
  },

  onboarding: {
    step: (current: number, total: number) => `Krok ${current} z ${total}`,
    next: 'Ďalej',
    back: 'Späť',
    finish: 'Začať',
    name: {
      title: 'Ako sa bude volať tvoja postava?',
      hint: 'Rastie s každou kartou, ktorú prečítaš. Meno sa dá neskôr zmeniť.',
      label: 'Meno postavy',
      missing: 'Postava potrebuje meno.',
    },
    categories: {
      title: 'Čo sa chceš učiť?',
      hint: 'Feed bude miešať karty z kategórií, ktoré vyberieš.',
      missing: 'Vyber aspoň jednu kategóriu.',
    },
    weights: {
      title: 'Čomu dáš viac priestoru?',
      hint: 'Posuvník určuje, ako často sa kategória vo feede objaví.',
    },
    goal: {
      title: 'Koľko kariet denne?',
      hint: 'Po splnení cieľa je na dnes hotovo. Všetko navyše je bonus.',
    },
  },

  /** How often a category shows up, as a word for the weight slider. */
  weight: (weight: number) => (weight <= 30 ? 'občas' : weight <= 60 ? 'bežne' : 'často'),

  goals: {
    10: { title: '10 kariet', note: 'Krátko, asi 5 minút' },
    20: { title: '20 kariet', note: 'Akurát, asi 10 minút' },
    40: { title: '40 kariet', note: 'Naplno, asi 20 minút' },
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
