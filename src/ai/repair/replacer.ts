/**
 * Privacy Replacer Engine (PRD F2 - Smart Privacy Repair)
 *
 * Replaces detected sensitive strings with user-approved placeholders or dummy values.
 * Features:
 * - Non-overlapping index slicing (replaces back-to-front to preserve exact offsets).
 * - Context-aware entity indexing (assigns sequential variables e.g. [EMAIL_ADDRESS_1], [EMAIL_ADDRESS_2]).
 * - Entity-consistent replacement (identical sensitive strings map to identical replacements).
 * - Cross-repair continuity (preserves variable numbering even when repairing items one-by-one).
 */

import {
  FindingCategory,
  RepairDirective,
  RepairResult,
  RepairStrategyType,
  SensitiveFinding
} from '../types.js';
import { PrivacyReplacementStrategies } from './strategies.js';

export interface ExistingEntityInfo {
  readonly id?: string;
  readonly category: string;
  readonly rawText?: string;
  readonly originalRawText?: string;
  readonly label?: string;
  readonly currentToken?: string;
  readonly currentStrategy?: RepairStrategyType;
  readonly entityIndex?: number;
}

export class PrivacyReplacer {
  private readonly strategyEngine: PrivacyReplacementStrategies;

  public constructor() {
    this.strategyEngine = new PrivacyReplacementStrategies();
  }

  /**
   * Directly generates a replacement string for a single finding with optional index.
   */
  public generateReplacement(
    finding: SensitiveFinding,
    strategy: RepairStrategyType,
    entityIndex: number = 0,
    customValue?: string
  ): string {
    return this.strategyEngine.generateReplacement(finding, strategy, entityIndex, customValue);
  }

  /**
   * Applies privacy replacements to the input text based on findings and user directives.
   *
   * @param originalText - The raw source text.
   * @param findings - Sensitive findings to replace.
   * @param directives - User-specified or default replacement directives per finding.
   * @param defaultStrategy - Default strategy to use if not explicitly specified.
   * @param existingEntities - Previously protected entities to maintain global index continuity.
   * @param allContextFindings - All sensitive findings present across the whole document for global count/indexing.
   * @returns Clean RepairResult containing sanitized text, replacement statistics, and index mappings.
   */
  public replace(
    originalText: string,
    findings: readonly SensitiveFinding[],
    directives: readonly RepairDirective[] = [],
    defaultStrategy: RepairStrategyType = 'semantic_placeholder',
    existingEntities: readonly ExistingEntityInfo[] = [],
    allContextFindings: readonly SensitiveFinding[] = []
  ): RepairResult {
    if (!originalText || (findings.length === 0 && existingEntities.length === 0)) {
      return {
        sanitizedText: originalText,
        replacementsCount: 0,
        replacementMap: new Map(),
        rawToEntityIndexMap: new Map()
      };
    }

    // Build directive lookup map by finding ID
    const directiveMap = new Map<string, RepairDirective>();
    for (const directive of directives) {
      directiveMap.set(directive.findingId, directive);
    }

    // 1. Collect all distinct raw entities per category across existingEntities, allContextFindings, and findings
    const categoryEntitiesMap = new Map<string, string[]>();
    const rawToCategoryMap = new Map<string, string>();
    const rawToEntityIndexMap = new Map<string, number>();

    const registerEntity = (category: string, rawText: string, explicitIndex?: number) => {
      if (!categoryEntitiesMap.has(category)) {
        categoryEntitiesMap.set(category, []);
      }
      const list = categoryEntitiesMap.get(category)!;
      if (!list.includes(rawText)) {
        list.push(rawText);
        rawToCategoryMap.set(rawText, category);
      }
      if (explicitIndex !== undefined && explicitIndex > 0) {
        rawToEntityIndexMap.set(rawText, explicitIndex);
      }
    };

    // a) Register existing entities first (preserves previous session indices)
    for (const entity of existingEntities) {
      const raw = entity.rawText || entity.originalRawText;
      if (raw) {
        registerEntity(entity.category, raw, entity.entityIndex);
      }
    }

    // b) Register all context findings in chronological/document order
    const contextList = allContextFindings.length > 0 ? allContextFindings : findings;
    const ascendingContextFindings = [...contextList].sort((a, b) => a.start - b.start);
    for (const finding of ascendingContextFindings) {
      registerEntity(finding.category, finding.rawText);
    }

    // c) Ensure all target findings are registered
    const ascendingFindings = [...findings].sort((a, b) => a.start - b.start);
    for (const finding of ascendingFindings) {
      registerEntity(finding.category, finding.rawText);
    }

    // Compute sequential 1-based indices for any rawText without an explicit index
    for (const [, list] of categoryEntitiesMap.entries()) {
      let nextIdx = 1;
      for (const raw of list) {
        if (rawToEntityIndexMap.has(raw)) {
          nextIdx = Math.max(nextIdx, rawToEntityIndexMap.get(raw)! + 1);
        }
      }
      for (const raw of list) {
        if (!rawToEntityIndexMap.has(raw)) {
          rawToEntityIndexMap.set(raw, nextIdx++);
        }
      }
    }

    // 2. Sort target findings descending by start index (back-to-front replacement prevents offset drift)
    const sortedFindings = [...findings].sort((a, b) => b.start - a.start);

    // Consistency map: ensure repeated raw occurrences receive the exact same replacement
    const rawToReplacementMap = new Map<string, string>();

    let resultText: string = originalText;
    let appliedCount: number = 0;

    for (const finding of sortedFindings) {
      let replacement: string;

      if (rawToReplacementMap.has(finding.rawText)) {
        replacement = rawToReplacementMap.get(finding.rawText)!;
      } else {
        const directive = directiveMap.get(finding.id);
        const strategy = directive?.strategy ?? defaultStrategy;
        const totalDistinctForCategory = categoryEntitiesMap.get(finding.category)?.length || 1;
        // Only append numbering (_1, _2) if multiple distinct entities exist in this category
        const entityIndex = totalDistinctForCategory > 1
          ? (rawToEntityIndexMap.get(finding.rawText) || 1)
          : 0;

        replacement = this.strategyEngine.generateReplacement(
          finding,
          strategy,
          entityIndex,
          directive?.customValue
        );
        rawToReplacementMap.set(finding.rawText, replacement);
      }

      // Splice replacement in place of sensitive substring with fallback
      if (
        finding.start >= 0 &&
        finding.end <= resultText.length &&
        resultText.slice(finding.start, finding.end) === finding.rawText
      ) {
        const before: string = resultText.slice(0, finding.start);
        const after: string = resultText.slice(finding.end);
        resultText = before + replacement + after;
        appliedCount += 1;
      } else if (resultText.includes(finding.rawText)) {
        resultText = resultText.split(finding.rawText).join(replacement);
        appliedCount += 1;
      }
    }

    // 3. Upgrade previously unnumbered tokens if category grew from 1 entity to 2+ entities
    for (const entity of existingEntities) {
      const totalDistinctForCategory = categoryEntitiesMap.get(entity.category)?.length || 1;
      const raw = entity.rawText || entity.originalRawText;
      if (totalDistinctForCategory > 1 && entity.currentToken && raw) {
        const entityIndex = rawToEntityIndexMap.get(raw) || 1;
        const dummyFinding: SensitiveFinding = {
          id: entity.id || 'existing_entity',
          label: entity.label || entity.category,
          category: entity.category as FindingCategory,
          rawText: raw,
          start: 0,
          end: raw.length,
          severity: 'critical',
          source: 'regex_rule',
          confidence: 1.0,
          suggestedReplacement: `YOUR_${entity.category.toUpperCase()}`
        };

        const unnumberedToken = this.strategyEngine.generateReplacement(
          dummyFinding,
          entity.currentStrategy || defaultStrategy,
          0
        );
        const numberedToken = this.strategyEngine.generateReplacement(
          dummyFinding,
          entity.currentStrategy || defaultStrategy,
          entityIndex
        );

        if (
          unnumberedToken !== numberedToken &&
          entity.currentToken === unnumberedToken &&
          resultText.includes(unnumberedToken)
        ) {
          resultText = resultText.split(unnumberedToken).join(numberedToken);
          rawToReplacementMap.set(raw, numberedToken);
        }
      }
    }

    return {
      sanitizedText: resultText,
      replacementsCount: appliedCount,
      replacementMap: rawToReplacementMap,
      rawToEntityIndexMap
    };
  }
}
