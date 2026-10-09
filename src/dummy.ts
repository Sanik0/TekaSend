const lower = 'abcdefghijklmnopqrstuvwxyz';
const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const digits = '0123456789';
const symbols = '*#%&';
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

function differentCharacter(pool: string, original: string, seed: number): string {
  const originalIndex = pool.indexOf(original);
  let index = Math.abs(seed) % (originalIndex < 0 ? pool.length : pool.length - 1);
  if (originalIndex >= 0 && index >= originalIndex) index++;
  return pool[index];
}

/**
 * Fast 32-bit FNV-1a hash function for deterministic scrambling.
 */
function hashString(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Mulberry32 simple fast deterministic PRNG from seed.
 */
function mulberry32(seed: number): () => number {
  let s = seed;
  return function(): number {
    let t = (s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0);
  };
}

/**
 * Creates format-preserving deterministic dummy text.
 * When the same string is supplied, it always produces the identical scrambled output
 * to ensure narrative continuity and referential consistency.
 */
export function createDummyText(source: string): string {
  const characters = Array.from(segmenter.segment(source), part => part.segment);
  const seed = hashString(source);
  const rng = mulberry32(seed);

  return characters.map((character, index) => {
    const randomValue = (rng() + index * 31 + 7) >>> 0;
    if (/^\s+$/u.test(character)) return character;
    if (/^[a-z]$/u.test(character)) return differentCharacter(lower, character, randomValue);
    if (/^[A-Z]$/u.test(character)) return differentCharacter(upper, character, randomValue);
    if (/^[0-9]$/u.test(character)) return differentCharacter(digits, character, randomValue);
    if (character.length === 1 && '@._+:/-'.includes(character)) return character;
    return differentCharacter(symbols, character, randomValue);
  }).join('');
}
