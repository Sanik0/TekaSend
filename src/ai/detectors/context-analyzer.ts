/**
 * Contextual Semantic & False-Positive Analyzer
 *
 * Examines surrounding text tokens and syntactic structure to:
 * 1. Filter out obvious tutorial/dummy examples (e.g., example.com, YOUR_KEY)
 * 2. Boost detection confidence when surrounded by semantic labels (e.g., "password:", "auth_token:")
 * 3. Identify syntactic container context (JSON, YAML, SQL, URL, Shell)
 */

import { FindingCategory } from '../types.js';

export interface ContextualAssessment {
  readonly isLikelyDummyOrSample: boolean;
  readonly confidenceAdjustment: number;
  readonly detectedContainerFormat: 'json' | 'yaml' | 'url' | 'sql' | 'plain';
  readonly contextualClues: readonly string[];
}

export class ContextAnalyzer {
  private readonly knownSampleValues: readonly RegExp[] = [
    /\b(?:test|example|sample|demo|foo|bar|dummy|placeholder|your_key|fake)\b/i,
    /@example\.(?:com|org|net)\b/i,
    /@(?:domain|email|test|sample)\.com\b/i,
    /\b(?:00000000|12345678|09170000000|4000123456789010)\b/,
    /\bYOUR_[A-Z_]+\b/
  ];

  private readonly semanticKeywordMap: ReadonlyMap<FindingCategory, readonly RegExp[]> = new Map([
    ['api_key', [/\b(?:api[_-]?key|access[_-]?token|client[_-]?secret|auth[_-]?key)\b/i]],
    ['password', [/\b(?:password|passwd|pwd|passcode|secret)\b/i]],
    ['bearer_token', [/\b(?:bearer|jwt|authorization|token)\b/i]],
    ['email', [/\b(?:email|mail|contact|to|from|recipient)\b/i]],
    ['phone', [/\b(?:phone|mobile|cell|tel|telephone|call)\b/i]],
    ['credit_card', [/\b(?:card|cc|credit[_-]?card|pan|cvv|expiry)\b/i]],
    ['ssn', [/\b(?:ssn|social[_-]?security|tin|gov[_-]?id)\b/i]]
  ]);

  /**
   * Assesses the surrounding context around a target substring.
   *
   * @param fullText - The entire input text.
   * @param startIndex - Start character offset of the target match.
   * @param endIndex - End character offset of the target match.
   * @param category - The suspected category of the finding.
   * @returns ContextualAssessment containing dummy checks and container format.
   */
  public evaluateContext(
    fullText: string,
    startIndex: number,
    endIndex: number,
    category: FindingCategory
  ): ContextualAssessment {
    const rawSubstring = fullText.slice(startIndex, endIndex);

    // 1. Check if the matched substring is an obvious dummy/sample
    const isSample = this.isSampleValue(rawSubstring);

    // 2. Extract surrounding text window (up to 40 chars before and after)
    const windowStart = Math.max(0, startIndex - 40);
    const windowEnd = Math.min(fullText.length, endIndex + 40);
    const prefix = fullText.slice(windowStart, startIndex);
    const suffix = fullText.slice(endIndex, windowEnd);
    const contextWindow = `${prefix} ${suffix}`;

    // 3. Detect container format (JSON, YAML, SQL, URL, plain)
    const containerFormat = this.detectContainerFormat(prefix, suffix);

    // 4. Check for reinforcing semantic keywords in the prefix
    const clues: string[] = [];
    let confidenceAdjustment = 0;

    const keywords = this.semanticKeywordMap.get(category) ?? [];
    for (const keyword of keywords) {
      if (keyword.test(contextWindow)) {
        clues.push(`Reinforced by contextual keyword match: ${keyword.source}`);
        confidenceAdjustment += 0.15;
      }
    }

    if (isSample) {
      clues.push('Identified as an existing sample/tutorial placeholder');
      confidenceAdjustment -= 0.40;
    }

    return {
      isLikelyDummyOrSample: isSample,
      confidenceAdjustment,
      detectedContainerFormat: containerFormat,
      contextualClues: clues
    };
  }

  /**
   * Checks whether a given string matches known dummy or placeholder heuristics.
   */
  private isSampleValue(text: string): boolean {
    for (const pattern of this.knownSampleValues) {
      if (pattern.test(text)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Detects whether the token is embedded in structured code syntax.
   */
  private detectContainerFormat(prefix: string, suffix: string): 'json' | 'yaml' | 'url' | 'sql' | 'plain' {
    const trimmedPrefix = prefix.trimEnd();
    const trimmedSuffix = suffix.trimStart();

    // JSON pattern: "key": "value"
    if (/"\s*:\s*"$/.test(trimmedPrefix) && /^"/.test(trimmedSuffix)) {
      return 'json';
    }

    // YAML pattern: key: value
    if (/:\s+$/.test(trimmedPrefix)) {
      return 'yaml';
    }

    // URL parameter: ?token=value or &key=value
    if (/[?&][A-Za-z0-9_-]+=\s*$/.test(trimmedPrefix)) {
      return 'url';
    }

    // SQL pattern: = 'value'
    if (/=\s*'$/.test(trimmedPrefix) && /^'/.test(trimmedSuffix)) {
      return 'sql';
    }

    return 'plain';
  }
}
