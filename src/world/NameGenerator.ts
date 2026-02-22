// Alien language name generator.
// Uses syllable patterns seeded from genome to produce consistent-sounding names.

const ONSETS = [
  '', 'z', 'k', 'th', 'x', 'qu', 'v', 'n', 'r', 'gl', 'sh', 'kr',
  'tr', 'pl', 'br', 'dr', 'sk', 'fl', 'gr', 'st', 'pr', 'bl',
  'zh', 'ch', 'wr', 'kl', 'thr', 'scr', 'spl',
];

const VOWELS = [
  'a', 'e', 'i', 'o', 'u', 'ai', 'ou', 'ei', 'aa', 'uu',
  'ae', 'oa', 'ie', 'eo', 'ia', 'uo',
];

const CODAS = [
  '', 'n', 'r', 'k', 'th', 'x', 'l', 's', 'sh', 'z', 'm', 'ng',
  'rk', 'lk', 'nt', 'nd', 'mp', 'nk', 'rl', 'rn',
];

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function pickFrom<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

function syllable(rng: () => number): string {
  return pickFrom(ONSETS, rng) + pickFrom(VOWELS, rng) + pickFrom(CODAS, rng);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Generate a species name from a seed (deterministic) */
export function speciesName(seed: number): string {
  const rng = seededRandom(seed);
  const syllables = 2 + Math.floor(rng() * 2); // 2-3 syllables
  let name = '';
  for (let i = 0; i < syllables; i++) name += syllable(rng);
  return capitalize(name);
}

/** Generate an individual creature name */
export function creatureName(seed: number): string {
  const rng = seededRandom(seed);
  const syllables = 1 + Math.floor(rng() * 2); // 1-2 syllables
  let name = '';
  for (let i = 0; i < syllables; i++) name += syllable(rng);
  return capitalize(name);
}

/** Generate an alien word (for speech) */
export function alienWord(seed: number): string {
  const rng = seededRandom(seed);
  const syllables = 1 + Math.floor(rng() * 2);
  let word = '';
  for (let i = 0; i < syllables; i++) word += syllable(rng);
  return word;
}
