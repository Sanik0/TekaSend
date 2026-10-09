import { findNames } from './name-detect.js';

export type Severity = 'high' | 'medium';
export type Finding = { start: number; end: number; text: string; type: string; severity: Severity };

const patterns: { type: string; severity: Severity; regex: RegExp }[] = [
  { type: 'API key', severity: 'high', regex: /\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16})\b/g },
  { type: 'Private key', severity: 'high', regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
  { type: 'Password', severity: 'high', regex: /\b(?:password|passwd|pwd)\s*[:=]\s*["']?([^\s"';,<>]{4,})["']?/gi },
  { type: 'Bearer token', severity: 'high', regex: /\bBearer\s+[A-Za-z0-9._~+/-]{16,}={0,2}\b/gi },
  { type: 'Email', severity: 'medium', regex: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi },
  { type: 'Phone', severity: 'medium', regex: /(?:\+?63[\s-]?)?0?9\d{2}[\s-]?\d{3}[\s-]?\d{4}\b/g }
];

export function detect(text: string, include: (finding: Finding) => boolean = () => true): Finding[] {
  const found: Finding[] = [];
  for (const { type, severity, regex } of patterns) {
    regex.lastIndex = 0;
    for (const match of text.matchAll(regex)) {
      const start = match.index;
      const value = match[0];
      if (!value || start === undefined) continue;
      const finding = { start, end: start + value.length, text: value, type, severity };
      if (include(finding)) found.push(finding);
    }
  }
  for (const name of findNames(text)) {
    const finding = { ...name, type: 'Personal name', severity: 'medium' as const };
    if (include(finding)) found.push(finding);
  }
  found.sort((a, b) => a.start - b.start || b.end - a.end || (a.severity === 'high' ? -1 : 1));
  const result: Finding[] = [];
  let previousEnd = -1;
  for (const item of found) {
    if (item.start >= previousEnd) { result.push(item); previousEnd = item.end; }
  }
  return result;
}
