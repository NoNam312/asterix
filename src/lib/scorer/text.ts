// Text helpers for the quest scorer: normalising, stemming and typo-tolerant matching.
// No app imports, so scripts/train-scorer.mjs can run this file directly in Node.

const STOPWORDS = new Set([
  "of", "and", "the", "to", "for", "in", "on", "a", "an", "with", "at", "my", "some", "about", "from", "up",
]);

/** Words the stemmer would otherwise merge with something else ("stats" vs "state"). */
const IRREGULAR: Record<string, string> = { stats: "stats", stat: "stats", news: "news", physics: "physics" };

/** Crude English stemmer: enough to treat lecture/lectures, revise/revising, study/studies alike. */
export function stem(word: string) {
  let w = word;
  if (/^\d/.test(w)) return w;
  if (IRREGULAR[w]) return IRREGULAR[w];
  if (w.length > 4 && w.endsWith("ies")) w = `${w.slice(0, -3)}y`;
  else if (w.length > 5 && w.endsWith("zzes")) w = w.slice(0, -3);
  else if (w.length > 4 && /(sses|xes|ches|shes)$/.test(w)) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith("s") && !/(ss|us|is)$/.test(w)) w = w.slice(0, -1);
  if (w.length > 5 && w.endsWith("ing")) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith("ed")) w = w.slice(0, -2);
  if (w.length > 4 && w.endsWith("e")) w = w.slice(0, -1);
  return w;
}

/** Lowercase words with punctuation removed (codes like COMP30026 stay one token). */
export function words(text: string) {
  return text
    .toLowerCase()
    .replace(/['’]/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export type Tokens = {
  /** Stems of every word, e.g. "catch up with friends" -> catch, up, with, friend */
  all: string[];
  /** Stems without filler words, e.g. "read a novel" -> read, novel */
  content: string[];
  /** Original lowercase words (for codes and numbers) */
  raw: string[];
};

export function tokenize(text: string): Tokens {
  const raw = words(text);
  return {
    raw,
    all: raw.map(stem),
    content: raw.filter((w) => !STOPWORDS.has(w)).map(stem),
  };
}

/** A phrase prepared for matching: its stems, and whether it relies on filler words. */
export type Phrase = { text: string; stems: string[]; usesStopwords: boolean };

export function phrase(text: string): Phrase {
  const raw = words(text);
  return { text, stems: raw.map(stem), usesStopwords: raw.some((w) => STOPWORDS.has(w)) };
}

/** Edit distance allowing one swap of neighbouring letters (so "lecutre" ≈ "lecture"). */
export function editDistance(a: string, b: string) {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

/** Every stem that appears in the scorer's word lists (see registerVocabulary). */
const vocabulary = new Set<string>();

/** Known words are never treated as typos of other words ("automation" is not "automaton"). */
export function registerVocabulary(stems: Iterable<string>) {
  for (const s of stems) vocabulary.add(s);
}

/** Same stem, or a one-letter typo of a longer word (first letter must match). */
export function stemMatches(token: string, target: string) {
  if (token === target) return true;
  return (
    !vocabulary.has(token) &&
    target.length >= 6 &&
    token[0] === target[0] &&
    Math.abs(token.length - target.length) <= 1 &&
    editDistance(token, target) <= 1
  );
}

/** Does the text contain this phrase (as consecutive words)? */
export function matchPhrase(tokens: Tokens, p: Phrase) {
  const list = p.usesStopwords ? tokens.all : tokens.content;
  if (!p.stems.length || p.stems.length > list.length) return false;
  for (let i = 0; i + p.stems.length <= list.length; i++) {
    if (p.stems.every((s, k) => stemMatches(list[i + k], s))) return true;
  }
  return false;
}
