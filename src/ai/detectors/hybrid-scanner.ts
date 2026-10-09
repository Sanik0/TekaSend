/**
 * Hybrid Sensitive Scanner (PRD F1 - Data Awareness Notice)
 *
 * Combines high-precision deterministic regex rules with on-device AI contextual classification.
 * Features:
 * - Contextual reasoning: Analyzes surrounding tokens to boost confidence and filter dummies.
 * - Risk & impact assessment: Generates human-readable risk explanations and actionable advice.
 * - Priority conflict resolution: Exact regex matches take precedence over AI token guesses.
 * - Non-overlapping span merging: Resolves overlapping character ranges safely.
 * - Performance monitoring: Tracks total scan latency in milliseconds.
 */

import { DeterministicRuleMatcher } from './regex-rules.js';
import { AiClassifier } from './ai-classifier.js';
import { ContextAnalyzer } from './context-analyzer.js';
import { RiskAnalyzer } from '../reasoning/risk-analyzer.js';
import { ProgressCallback } from '../engine/pipeline.js';
import {
  ScanOptions,
  ScanResult,
  SensitiveFinding
} from '../types.js';

export class HybridScanner {
  private readonly regexMatcher: DeterministicRuleMatcher;
  private readonly aiClassifier: AiClassifier;
  private readonly contextAnalyzer: ContextAnalyzer;
  private readonly riskAnalyzer: RiskAnalyzer;

  public constructor(
    regexMatcher?: DeterministicRuleMatcher,
    aiClassifier?: AiClassifier,
    contextAnalyzer?: ContextAnalyzer,
    riskAnalyzer?: RiskAnalyzer
  ) {
    this.regexMatcher = regexMatcher ?? new DeterministicRuleMatcher();
    this.aiClassifier = aiClassifier ?? new AiClassifier();
    this.contextAnalyzer = contextAnalyzer ?? new ContextAnalyzer();
    this.riskAnalyzer = riskAnalyzer ?? new RiskAnalyzer();
  }

  /**
   * Scans input text using deterministic rules and optional on-device AI classification.
   *
   * @param text - The raw user input text to scan.
   * @param options - Configuration options for the scan.
   * @param onProgress - Optional callback to track AI model download progress.
   * @returns Comprehensive ScanResult containing all detected non-overlapping findings.
   */
  public async scan(
    text: string,
    options: ScanOptions = {},
    onProgress?: ProgressCallback
  ): Promise<ScanResult> {
    const startTimeMs: number = Date.now();

    if (!text || typeof text !== 'string') {
      return {
        hasSensitiveData: false,
        findings: [],
        inferenceTimeMs: 0,
        engineUsed: 'hybrid_scanner'
      };
    }

    // 1. Run ultra-fast deterministic regex scan
    const regexFindings: SensitiveFinding[] = this.regexMatcher.match(text);

    // 2. Conditionally run on-device AI classifier
    let aiFindings: SensitiveFinding[] = [];
    const enableAi: boolean = options.enableAi ?? true;

    if (enableAi) {
      const threshold: number = options.confidenceThreshold ?? 0.60;
      aiFindings = await this.aiClassifier.classify(text, threshold, onProgress);
    }

    // 3. Merge and deduplicate findings (Regex takes priority over AI)
    const mergedFindings: SensitiveFinding[] = this.mergeSpans(regexFindings, aiFindings, text);

    // 4. Enrich findings with contextual evaluation and risk reasoning (PRD F1)
    const enrichedFindings: SensitiveFinding[] = this.enrichFindings(mergedFindings, text);

    // 5. Filter by enabled categories if requested
    const filteredFindings = (options.enabledCategories && options.enabledCategories.length > 0)
      ? enrichedFindings.filter(f => options.enabledCategories!.includes(f.category))
      : enrichedFindings;

    const inferenceTimeMs: number = Date.now() - startTimeMs;

    return {
      hasSensitiveData: filteredFindings.length > 0,
      findings: filteredFindings,
      inferenceTimeMs,
      engineUsed: enableAi ? 'hybrid_regex_shield82m' : 'deterministic_regex'
    };
  }

  /**
   * Enriches findings with contextual semantic clues, calibrated confidence, and risk explanations.
   */
  private enrichFindings(
    findings: readonly SensitiveFinding[],
    fullText: string
  ): SensitiveFinding[] {
    return findings.map(finding => {
      // Run context evaluation
      const context = this.contextAnalyzer.evaluateContext(
        fullText,
        finding.start,
        finding.end,
        finding.category
      );

      // Adjust confidence based on context clues
      const adjustedConfidence = Math.max(
        0.1,
        Math.min(1.0, Number((finding.confidence + context.confidenceAdjustment).toFixed(4)))
      );

      // Run risk reasoning
      const risk = this.riskAnalyzer.analyzeRisk(
        finding.category,
        finding.rawText,
        finding.severity
      );

      return {
        ...finding,
        confidence: adjustedConfidence,
        severity: risk.impactLevel,
        riskExplanation: risk.explanation,
        recommendedAction: risk.recommendedAction
      };
    });
  }

  /**
   * Merges deterministic and AI findings, resolving overlapping spans with priority to deterministic rules.
   */
  private mergeSpans(
    regexFindings: readonly SensitiveFinding[],
    aiFindings: readonly SensitiveFinding[],
    _sourceText: string
  ): SensitiveFinding[] {
    const allFindings: SensitiveFinding[] = [...regexFindings, ...aiFindings];

    const sorted = allFindings.sort((a, b) => {
      if (a.start !== b.start) {
        return a.start - b.start;
      }
      if (a.source !== b.source) {
        return a.source === 'regex_rule' ? -1 : 1;
      }
      return b.end - a.end;
    });

    const nonOverlapping: SensitiveFinding[] = [];
    let lastCoveredEnd: number = -1;

    for (const finding of sorted) {
      if (finding.start >= lastCoveredEnd) {
        nonOverlapping.push(finding);
        lastCoveredEnd = finding.end;
      }
    }

    return nonOverlapping;
  }
}
