const lower = 'abcdefghijklmnopqrstuvwxyz';
const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const digits = '0123456789';
const symbols = '*#%&';
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

function differentCharacter(pool: string, original: string, random: number): string {
  const originalIndex = pool.indexOf(original);
  let index = random % (originalIndex < 0 ? pool.length : pool.length - 1);
  if (originalIndex >= 0 && index >= originalIndex) index++;
  return pool[index];
}

export function createDummyText(source: string): string {
  const characters = Array.from(segmenter.segment(source), part => part.segment);
  const random = new Uint32Array(Math.max(1, Math.min(characters.length, 16384)));
  crypto.getRandomValues(random);
  return characters.map((character, index) => {
    if (index > 0 && index % random.length === 0) crypto.getRandomValues(random);
    const value = random[index % random.length];
    if (/^\s+$/u.test(character)) return character;
    if (/^[a-z]$/u.test(character)) return differentCharacter(lower, character, value);
    if (/^[A-Z]$/u.test(character)) return differentCharacter(upper, character, value);
    if (/^[0-9]$/u.test(character)) return differentCharacter(digits, character, value);
    if (character.length === 1 && '@._+:/-'.includes(character)) return character;
    return differentCharacter(symbols, character, value);
  }).join('');
}
