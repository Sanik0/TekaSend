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
  SensitiveFinding,
} from '../types.js';
import { findNames } from '../../name-detect.js';

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
      category: "api_key",
      label: "API Key",
      severity: "critical",
      regex:
        /\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{22,}|AKIA[0-9A-Z]{16})\b/g,
      defaultReplacement: "YOUR_API_KEY",
    },
    // RSA / EC / OpenSSH Private Keys
    {
      category: "private_key",
      label: "Private Key",
      severity: "critical",
      regex:
        /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g,
      defaultReplacement:
        "-----BEGIN PRIVATE KEY-----\n[REDACTED_PRIVATE_KEY]\n-----END PRIVATE KEY-----",
    },
    // Inline Passwords & Credentials
    {
      category: "password",
      label: "Password / Secret",
      severity: "critical",
      regex:
        /\b(?:password|passwd|pwd|secret_key|client_secret)\s*[:=]\s*["']?([^\s"';,<>]{4,})["']?/gi,
      defaultReplacement: "YOUR_PASSWORD",
    },
    // Bearer / JWT Tokens
    {
      category: "bearer_token",
      label: "Bearer / Auth Token",
      severity: "critical",
      regex:
        /\bBearer\s+(?:ey[A-Za-z0-9_-]+\.[A-Za-z0-9._-]+\.[A-Za-z0-9._-]+|[A-Za-z0-9._~+/-]{20,}={0,2})\b/gi,
      defaultReplacement: "Bearer YOUR_AUTH_TOKEN",
    },
    // Standard Credit Card Numbers (Luhn-format candidate)
    {
      category: "credit_card",
      label: "Credit Card Number",
      severity: "critical",
      regex:
        /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|3(?:0[0-5]|[68][0-9])[0-9]{11}|6(?:011|5[0-9]{2})[0-9]{12})\b/g,
      defaultReplacement: "4000-1234-5678-9010",
    },
    // Standard Email Addresses
    {
      category: "email",
      label: "Email Address",
      severity: "medium",
      regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
      defaultReplacement: "user@example.com",
    },
    // Philippine & International Phone Numbers
    {
      category: "phone",
      label: "Phone Number",
      severity: "medium",
      regex: /(?:\+?63[\s-]?)?0?9\d{2}[\s-]?\d{3}[\s-]?\d{4}\b/g,
      defaultReplacement: "0917-000-0000",
    },
    // Standard Street Addresses (Number + Street Name + Suffix)
    {
      category: "address",
      label: "Street Address",
      severity: "medium",
      regex:
        /\b\d{1,6}[A-Za-z]?\s+(?:[A-Za-z0-9.-]+\s+){1,4}(?:Street|St\.?|Avenue|Ave\.?|Boulevard|Blvd\.?|Road|Rd\.?|Drive|Dr\.?|Lane|Ln\.?|Way|Court|Ct\.?|Circle|Cir\.?|Highway|Hwy\.?|Place|Pl\.?|Square|Sq\.?|Parkway|Pkwy\.?|Terrace|Ter\.?|Trail|Trl\.?|Broadway)\b/gi,
      defaultReplacement: "123 Demo St., Sample City",
    },
    // IPv4 Addresses
    {
      category: "ip_address",
      label: "IP Address",
      severity: "low",
      regex:
        /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g,
      defaultReplacement: "192.168.1.1",
    },
  ];

  /**
   * Scans the input text and returns all deterministic findings.
   *
   * @param text - Source string to evaluate.
   * @returns Array of detected sensitive findings with zero-based character offsets.
   */
  public match(text: string): SensitiveFinding[] {
    if (!text || typeof text !== "string") {
      return [];
    }

    const matchedFindings: SensitiveFinding[] = [];

    for (const rule of this.rules) {
      // Reset stateful regex index before matching
      rule.regex.lastIndex = 0;

      for (const match of text.matchAll(rule.regex)) {
        if (match.index === undefined) {
          continue;
        }

        const targetValue = match[1] ?? match[0];
        if (!targetValue) {
          continue;
        }

        // Skip intentional placeholders, scrambled dummies, and masked tokens
        if (this.isSafePlaceholderOrDummy(targetValue, rule.category)) {
          continue;
        }

        const offset = match[1] ? match[0].indexOf(match[1]) : 0;
        const startIndex: number = match.index + offset;
        const endIndex: number = startIndex + targetValue.length;
        const findingId: string = `rule_${rule.category}_${startIndex}_${endIndex}`;

        matchedFindings.push({
          id: findingId,
          label: rule.label,
          category: rule.category,
          rawText: targetValue,
          start: startIndex,
          end: endIndex,
          severity: rule.severity,
          source: "regex_rule",
          confidence: 1.0,
          suggestedReplacement: rule.defaultReplacement,
        });
      }
    }

    for (const name of findNames(text)) {
      matchedFindings.push({
        id: `rule_person_name_${name.start}_${name.end}`,
        label: 'Personal Name',
        category: 'person_name',
        rawText: name.text,
        start: name.start,
        end: name.end,
        severity: 'medium',
        source: 'regex_rule',
        confidence: 0.8,
        suggestedReplacement: '[PERSON_NAME]'
      });
    }

    return this.deduplicateAndSort(matchedFindings);
  }

  /**
   * Evaluates if a matched token is an intentional placeholder, dummy, or safe test string.
   */
  private isSafePlaceholderOrDummy(
    rawText: string,
    category: FindingCategory,
  ): boolean {
    const trimmed = rawText.trim();
    const lower = trimmed.toLowerCase();
    const upper = trimmed.toUpperCase();

    // Ignore literal generic dictionary label words
    const genericLabels = new Set([
      "password", "passwords", "passwd", "pwd",
      "name", "names", "fullname", "firstname", "lastname", "surname",
      "api_key", "apikey", "api key", "secret_key", "client_secret",
      "secret", "secrets", "token", "tokens", "auth_token",
      "bearer", "bearer_token", "email", "email_address",
      "phone", "phone_number", "ssn", "credit_card", "username"
    ]);
    if (genericLabels.has(lower)) {
      return true;
    }

    // Universal placeholder / dummy / masked markers
    if (
      upper.includes("YOUR_") ||
      upper.includes("REDACTED") ||
      upper.includes("DEMO_") ||
      upper.includes("DEMOTEST") ||
      upper.includes("SAMPLE_") ||
      upper.includes("XXXX") ||
      rawText.includes("••••") ||
      rawText.includes("****") ||
      rawText.includes("[") ||
      rawText.includes("]")
    ) {
      return true;
    }

    if (category === "api_key") {
      if (
        upper.includes("DEMO") ||
        upper.includes("TEST") ||
        upper.includes("SAMPLE") ||
        rawText.includes("00000000") ||
        rawText.includes("xxxxxxxx")
      ) {
        return true;
      }
    }

    if (category === "email") {
      const lower = rawText.toLowerCase();
      if (
        lower.endsWith("@masked-test-domain.net") ||
        lower.endsWith("@test.local") ||
        lower.endsWith("@invalid") ||
        lower.includes("dummy") ||
        lower.includes("placeholder")
      ) {
        return true;
      }
    }

    if (category === "phone") {
      if (
        rawText.includes("000-") ||
        rawText.includes("000-0000") ||
        rawText.includes("0000-0000") ||
        rawText.includes("XXX") ||
        rawText.includes("00000000")
      ) {
        return true;
      }
    }

    if (category === "password") {
      if (
        rawText.includes("dummy_password") ||
        rawText.includes("ExampleSecretPass") ||
        rawText.includes("YOUR_PASSWORD") ||
        upper.includes("EXAMPLE") ||
        upper.includes("DEMO") ||
        upper.includes("TEST") ||
        upper.includes("SAMPLE") ||
        upper.includes("DUMMY") ||
        upper.includes("PLACEHOLDER")
      ) {
        return true;
      }
    }

    if (category === "credit_card") {
      if (
        rawText.includes("XXXX") ||
        rawText.includes("0000-0000") ||
        rawText.includes("4000-0000-0000-")
      ) {
        return true;
      }
    }

    if (category === "ip_address") {
      if (
        rawText.startsWith("192.0.2.") ||
        rawText.startsWith("198.51.100.") ||
        rawText.startsWith("203.0.113.")
      ) {
        return true;
      }
    }

    return false;
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
