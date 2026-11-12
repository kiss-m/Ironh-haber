import type * as KatexModule from 'katex';
import { useEffect, useMemo, useState } from 'react';

type Katex = typeof KatexModule;

let katex: Katex | null = null;
let loading: Promise<Katex> | null = null;

/** Loads KaTeX and its stylesheet the first time a formula is shown, and never again. */
function loadKatex(): Promise<Katex> {
  loading ??= Promise.all([import('katex'), import('katex/dist/katex.min.css')]).then(
    ([module]) => {
      katex = module;
      return module;
    },
  );
  return loading;
}

interface FormulaProps {
  latex: string;
  /** A formula on its own line, larger and centred. Otherwise it flows with the text. */
  display?: boolean;
}

/**
 * Typesets LaTeX with KaTeX. The library is a separate chunk, so the feed does not pay for it
 * until the first formula card. Until it arrives the source text is shown.
 */
export function Formula({ latex, display = false }: FormulaProps) {
  const [ready, setReady] = useState(katex !== null);

  useEffect(() => {
    if (ready) return;
    let cancelled = false;
    void loadKatex().then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [ready]);

  const html = useMemo(
    () =>
      ready && katex
        ? katex.renderToString(latex, { displayMode: display, throwOnError: false })
        : null,
    [ready, latex, display],
  );

  if (html === null) {
    return <code className={display ? 'block text-center' : undefined}>{latex}</code>;
  }
  // KaTeX builds this markup from the card's own LaTeX, with its default `trust: false`.
  // `kv-formula` trims the margins of KaTeX's display style (src/styles/index.css).
  return (
    <span
      className={display ? 'kv-formula block' : undefined}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
