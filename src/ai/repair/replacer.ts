/**
 * Privacy Replacer Engine (PRD F2 - Smart Privacy Repair)
 *
 * Replaces detected sensitive strings with user-approved placeholders or dummy values.
 * Features:
 * - Non-overlapping index slicing (replaces back-to-front to preserve exact offsets).
 * - Consistent entity replacement (identical sensitive strings map to identical replacements).
 * - Context preservation (leaves untouched surrounding markdown, code, and whitespace).
 */

import {
  RepairDirective,
  RepairResult,
  RepairStrategyType,
  SensitiveFinding
} from '../types.js';
import { PrivacyReplacementStrategies } from './strategies.js';

export class PrivacyReplacer {
  private readonly strategyEngine: PrivacyReplacementStrategies;

  public constructor() {
    this.strategyEngine = new PrivacyReplacementStrategies();
  }

  /**
   * Applies privacy replacements to the input text based on findings and user directives.
   *
   * @param originalText - The raw source text.
   * @param findings - All detected sensitive findings.
   * @param directives - User-specified or default replacement directives per finding.
   * @param defaultStrategy - Default strategy to use if not explicitly specified.
   * @returns Clean RepairResult containing sanitized text and replacement statistics.
   */
  public replace(
    originalText: string,
    findings: readonly SensitiveFinding[],
    directives: readonly RepairDirective[] = [],
    defaultStrategy: RepairStrategyType = 'semantic_placeholder'
  ): RepairResult {
    if (!originalText || findings.length === 0) {
      return {
        sanitizedText: originalText,
        replacementsCount: 0,
        replacementMap: new Map()
      };
    }

    // Build directive lookup map by finding ID
    const directiveMap = new Map<string, RepairDirective>();
    for (const directive of directives) {
      directiveMap.set(directive.findingId, directive);
    }

    // Sort findings descending by start index (back-to-front replacement prevents index drift)
    const sortedFindings = [...findings].sort((a, b) => b.start - a.start);

    // Consistency map: ensure repeated raw occurrences receive the exact same replacement
    const rawToReplacementMap = new Map<string, string>();

    let resultText: string = originalText;
    let appliedCount: number = 0;

    for (const finding of sortedFindings) {
      // Validate offsets against current bounds
      if (finding.start < 0 || finding.end > originalText.length || finding.start >= finding.end) {
        continue;
      }

      let replacement: string;

      if (rawToReplacementMap.has(finding.rawText)) {
        replacement = rawToReplacementMap.get(finding.rawText)!;
      } else {
        const directive = directiveMap.get(finding.id);
        const strategy = directive?.strategy ?? defaultStrategy;
        replacement = this.strategyEngine.generateReplacement(
          finding,
          strategy,
          directive?.customValue
        );
        rawToReplacementMap.set(finding.rawText, replacement);
      }

      // Splice the replacement in place of the sensitive substring
      const before: string = resultText.slice(0, finding.start);
      const after: string = resultText.slice(finding.end);
      resultText = before + replacement + after;
      appliedCount += 1;
    }

    return {
      sanitizedText: resultText,
      replacementsCount: appliedCount,
      replacementMap: rawToReplacementMap
    };
  }
}
