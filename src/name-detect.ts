export type NameMatch = { start: number; end: number; text: string };

// Capitalization alone is weak evidence: inbox subjects and buttons use title case too.
const word = String.raw`\p{Lu}[\p{Ll}\p{M}]+(?:[’'-]\p{Lu}[\p{Ll}\p{M}]+)*`;
const joiningWord = String.raw`(?:de|del|dela|da|di|dos|des|van|von|la|le)`;
const fullName = String.raw`${word}(?:[ \t]+(?:${joiningWord}[ \t]+)?${word}){1,3}`;
const fullNamePattern = new RegExp(String.raw`(?<![\p{L}\p{M}@])${fullName}(?![\p{L}\p{M}])`, 'gu');
const nameLabelPattern = /\b(?:my[ \t]+name[ \t]+is|(?:full[ \t]+|first[ \t]+|last[ \t]+)?name[ \t]*(?::|=|is)|contact[ \t]+person[ \t]*(?::|=|is)|patient[ \t]*(?::|=|is)|recipient[ \t]*(?::|=|is)|dear[ \t]+|(?:mr|mrs|ms|dr|prof)\.[ \t]+)[ \t]*/gi;
const explicitBeforePattern = /\b(?:my\s+name\s+is|(?:full\s+|first\s+|last\s+)?name\s*(?::|=|is)|contact\s+person\s*(?::|=|is)|patient\s*(?::|=|is)|recipient\s*(?::|=|is)|dear\s+|(?:mr|mrs|ms|dr|prof)\.\s+)\s*$/i;
const nameAfterLabelPattern = new RegExp(String.raw`^${word}(?:[ \t]+(?:${joiningWord}[ \t]+)?${word}){0,3}(?![\p{L}\p{M}])`, 'u');
const nameShapePattern = new RegExp(String.raw`^${word}(?:[ \t]+(?:${joiningWord}[ \t]+)?${word}){0,3}$`, 'u');
const contextBeforePattern = /\b(?:met|emailed|called|contacted|introduced|interviewed|greeted|with|from|by|to)\s+$/i;
const contextAfterPattern = /^\s+(?:met|said|wrote|replied|called|emailed|joined|spoke|reacted|posted)\b/i;

// Common navigation, promotion, title, and organization words. An uncertain
// candidate stays visible, even when that means missing a real name.
const nonPersonWords = new Set([
  'about', 'account', 'action', 'address', 'all', 'app', 'application', 'bank',
  'button', 'campus', 'card', 'city', 'company', 'contact', 'customer', 'data',
  'demo', 'department', 'devices', 'digest', 'email', 'example', 'feature',
  'first', 'full', 'google', 'hide', 'information', 'in', 'key', 'labs', 'last',
  'lead', 'linked', 'local', 'login', 'mode', 'name', 'new', 'news', 'number',
  'open', 'page', 'password', 'personal', 'premium', 'private', 'product',
  'profile', 'quora', 'road', 'sample', 'secret', 'settings', 'sign', 'signin',
  'state', 'street', 'subscribe', 'system', 'team', 'test', 'text', 'this',
  'token', 'try', 'university', 'user', 'visible', 'your'
]);
const particles = new Set(['de', 'del', 'dela', 'da', 'di', 'dos', 'des', 'van', 'von', 'la', 'le']);

export function hasPersonContext(source: string, start: number, end: number): boolean {
  const before = source.slice(Math.max(0, start - 40), start);
  const after = source.slice(end, Math.min(source.length, end + 24));
  return explicitBeforePattern.test(before)
    || contextBeforePattern.test(before)
    || contextAfterPattern.test(after);
}

/** Rejects title-case UI phrases even when a model calls them a person. */
export function isPlausiblePersonName(name: string, source: string, start: number): boolean {
  const trimmed = name.trim();
  if (!nameShapePattern.test(trimmed)) return false;
  const words = trimmed.split(/[ \t]+/);
  if (words.some(part => !particles.has(part) && nonPersonWords.has(part.toLocaleLowerCase()))) return false;
  return words.length > 1 || hasPersonContext(source, start, start + trimmed.length);
}

/** Finds names only with a person label or clear person-related sentence context. */
export function findNames(text: string): NameMatch[] {
  const matches: NameMatch[] = [];
  for (const match of text.matchAll(fullNamePattern)) {
    if (match.index === undefined || !isPlausiblePersonName(match[0], text, match.index)) continue;
    const end = match.index + match[0].length;
    const previous = matches[matches.length - 1];
    const coordinatedName = previous && text.slice(previous.end, match.index) === ' and ';
    if (hasPersonContext(text, match.index, end) || coordinatedName) {
      matches.push({ start: match.index, end, text: match[0] });
    }
  }
  nameLabelPattern.lastIndex = 0;
  for (const match of text.matchAll(nameLabelPattern)) {
    if (match.index === undefined) continue;
    const start = match.index + match[0].length;
    const name = nameAfterLabelPattern.exec(text.slice(start))?.[0];
    if (!name || !isPlausiblePersonName(name, text, start)) continue;
    matches.push({ start, end: start + name.length, text: name });
  }
  matches.sort((a, b) => a.start - b.start || b.end - a.end);
  const unique: NameMatch[] = [];
  for (const match of matches) {
    if (unique.every(previous => match.start >= previous.end)) unique.push(match);
  }
  return unique;
}
