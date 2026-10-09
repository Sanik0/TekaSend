/**
 * Deterministic Regex Rule Matcher
 *
 * Implements ultra-fast, high-precision pattern detection for known credential formats,
 * tokens, keys, and structured identifiers.
 * Satisfies PRD F1 (Data Awareness Notice - Deterministic rules).
 */

import {
  FindingCategory,
  FindingSeverity,
  SensitiveFinding
} from '../types.js';

interface PatternDefinition {
  readonly category: FindingCategory;
  readonly label: string;
  readonly severity: FindingSeverity;
  readonly regex: RegExp;
  readonly defaultReplacement: string;
}

export class DeterministicRuleMatcher {
  /**
   * Pre-compiled collection of deterministic patterns.
   * Marked private and readonly to preserve encapsulation.
   */
  private readonly rules: readonly PatternDefinition[] = [
    // OpenAI, GitHub, AWS API Keys
    {
      category: 'api_key',
      label: 'API Key',
      severity: 'critical',
      regex: /\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{22,}|AKIA[0-9A-Z]{16})\b/g,
      defaultReplacement: 'YOUR_API_KEY'
    },
    // RSA / EC / OpenSSH Private Keys
    {
      category: 'private_key',
      label: 'Private Key',
      severity: 'critical',
      regex: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g,
      defaultReplacement: '-----BEGIN PRIVATE KEY-----\n[REDACTED_PRIVATE_KEY]\n-----END PRIVATE KEY-----'
    },
    // Inline Passwords & Credentials
    {
      category: 'password',
      label: 'Password / Secret',
      severity: 'critical',
      regex: /\b(?:password|passwd|pwd|secret_key|client_secret)\s*[:=]\s*["']?([^\s"';,<>]{4,})["']?/gi,
      defaultReplacement: 'YOUR_PASSWORD'
    },
    // Bearer / JWT Tokens
    {
      category: 'bearer_token',
      label: 'Bearer / Auth Token',
      severity: 'critical',
      regex: /\bBearer\s+(?:ey[A-Za-z0-9_-]+\.[A-Za-z0-9._-]+\.[A-Za-z0-9._-]+|[A-Za-z0-9._~+/-]{20,}={0,2})\b/gi,
      defaultReplacement: 'Bearer YOUR_AUTH_TOKEN'
    },
    // Standard Credit Card Numbers (Luhn-format candidate)
    {
      category: 'credit_card',
      label: 'Credit Card Number',
      severity: 'critical',
      regex: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|3(?:0[0-5]|[68][0-9])[0-9]{11}|6(?:011|5[0-9]{2})[0-9]{12})\b/g,
      defaultReplacement: '4000-1234-5678-9010'
    },
    // Standard Email Addresses
    {
      category: 'email',
      label: 'Email Address',
      severity: 'medium',
      regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
      defaultReplacement: 'user@example.com'
    },
    // Philippine & International Phone Numbers
    {
      category: 'phone',
      label: 'Phone Number',
      severity: 'medium',
      regex: /(?:\+?63[\s-]?)?0?9\d{2}[\s-]?\d{3}[\s-]?\d{4}\b/g,
      defaultReplacement: '0917-000-0000'
    },
    // IPv4 Addresses
    {
      category: 'ip_address',
      label: 'IP Address',
      severity: 'low',
      regex: /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g,
      defaultReplacement: '192.168.1.1'
    }
  ];

  /**
   * Scans the input text and returns all deterministic findings.
   *
   * @param text - Source string to evaluate.
   * @returns Array of detected sensitive findings with zero-based character offsets.
   */
  public match(text: string): SensitiveFinding[] {
    if (!text || typeof text !== 'string') {
      return [];
    }

    const matchedFindings: SensitiveFinding[] = [];

    for (const rule of this.rules) {
      // Reset stateful regex index before matching
      rule.regex.lastIndex = 0;

      for (const match of text.matchAll(rule.regex)) {
        const rawMatchText: string = match[0];
        const startIndex: number | undefined = match.index;

        if (!rawMatchText || startIndex === undefined) {
          continue;
        }

        const endIndex: number = startIndex + rawMatchText.length;
        const findingId: string = `rule_${rule.category}_${startIndex}_${endIndex}`;

        matchedFindings.push({
          id: findingId,
          label: rule.label,
          category: rule.category,
          rawText: rawMatchText,
          start: startIndex,
          end: endIndex,
          severity: rule.severity,
          source: 'regex_rule',
          confidence: 1.0,
          suggestedReplacement: rule.defaultReplacement
        });
      }
    }

    return this.deduplicateAndSort(matchedFindings);
  }

  /**
   * Sorts findings by start position and eliminates overlapping spans,
   * preferring longer and higher-severity matches.
   */
  private deduplicateAndSort(findings: SensitiveFinding[]): SensitiveFinding[] {
    const sorted = [...findings].sort((a, b) => {
      if (a.start !== b.start) {
        return a.start - b.start;
      }
      return b.end - a.end; // Longer match first
    });

    const nonOverlapping: SensitiveFinding[] = [];
    let lastCoveredIndex = -1;

    for (const item of sorted) {
      if (item.start >= lastCoveredIndex) {
        nonOverlapping.push(item);
        lastCoveredIndex = item.end;
      }
    }

    return nonOverlapping;
  }
}
