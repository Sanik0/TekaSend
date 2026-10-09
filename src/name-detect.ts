export type NameMatch = { start: number; end: number; text: string };

const word = String.raw`\p{Lu}[\p{L}\p{M}]+(?:[’'-]\p{Lu}[\p{L}\p{M}]+)*`;
const joiningWord = String.raw`(?:de|del|dela|da|di|dos|des|van|von|la|le)`;
const fullName = String.raw`${word}(?:[ \t]+(?:${joiningWord}[ \t]+)?${word}){1,3}`;
const fullNamePattern = new RegExp(String.raw`(?<![\p{L}\p{M}@])${fullName}(?![\p{L}\p{M}])`, 'gu');
const nameLabelPattern = /\b(?:my[ \t]+name[ \t]+is|(?:full[ \t]+|first[ \t]+|last[ \t]+)?name[ \t]*(?::|=|is)|contact[ \t]+person[ \t]*(?::|=|is)|patient[ \t]*(?::|=|is)|customer[ \t]*(?::|=|is)|recipient[ \t]*(?::|=|is)|dear[ \t]+|(?:mr|mrs|ms|dr|prof)\.[ \t]+)[ \t]*/gi;
const nameAfterLabelPattern = new RegExp(String.raw`^${word}(?:[ \t]+(?:${joiningWord}[ \t]+)?${word}){0,3}(?![\p{L}\p{M}])`, 'u');

const nonPersonStarts = new Set([
  'This', 'That', 'These', 'Those', 'The', 'Our', 'Your', 'Contact', 'Sample',
  'Example', 'Visible', 'Synthetic', 'Personal', 'Credit', 'Private', 'Secret',
  'Email', 'Phone', 'Test', 'New', 'User', 'Local', 'Full', 'First', 'Last',
  'Default', 'Hide', 'Linked', 'Demo', 'TekaSend', 'Dear', 'Mr', 'Mrs', 'Ms',
  'Dr', 'Prof'
]);
const nonPersonEnds = new Set([
  'Street', 'Road', 'Avenue', 'Boulevard', 'City', 'State', 'County', 'University',
  'Company', 'Bank', 'Department', 'Team', 'Information', 'Number', 'Address',
  'Token', 'Key', 'Password', 'Page', 'Name', 'Text', 'Data', 'Settings', 'Account',
  'Card', 'Devices', 'System', 'Mode', 'Effect'
]);

function looksLikePerson(text: string): boolean {
  const parts = text.split(/[ \t]+/);
  return !nonPersonStarts.has(parts[0]) && !nonPersonEnds.has(parts[parts.length - 1]);
}

/** Finds likely personal names without treating every capitalized word as a name. */
export function findNames(text: string): NameMatch[] {
  const matches: NameMatch[] = [];
  for (const match of text.matchAll(fullNamePattern)) {
    if (match.index === undefined || !looksLikePerson(match[0])) continue;
    matches.push({ start: match.index, end: match.index + match[0].length, text: match[0] });
  }
  for (const match of text.matchAll(nameLabelPattern)) {
    if (match.index === undefined) continue;
    const start = match.index + match[0].length;
    const name = nameAfterLabelPattern.exec(text.slice(start))?.[0];
    if (!name || !looksLikePerson(name)) continue;
    matches.push({ start, end: start + name.length, text: name });
  }
  matches.sort((a, b) => a.start - b.start || b.end - a.end);
  const unique: NameMatch[] = [];
  for (const match of matches) {
    if (unique.every(previous => match.start >= previous.end)) unique.push(match);
  }
  return unique;
}
