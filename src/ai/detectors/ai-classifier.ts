/**
 * On-Device AI Token Classifier (Shield-82M-ONNX)
 *
 * Runs contextual entity recognition and PII classification on-device.
 * Satisfies PRD F1 (Data Awareness Notice: on-device AI classifier).
 */

import { ModelPipelineManager, ProgressCallback } from '../engine/pipeline.js';
import {
  FindingCategory,
  FindingSeverity,
  SensitiveFinding
} from '../types.js';

interface RawTokenOutput {
  readonly entity_group?: string;
  readonly entity?: string;
  readonly score: number;
  readonly word: string;
  readonly start?: number;
  readonly end?: number;
}

export class AiClassifier {
  private readonly pipelineManager: ModelPipelineManager;

  public constructor(pipelineManager?: ModelPipelineManager) {
    this.pipelineManager = pipelineManager ?? ModelPipelineManager.getInstance();
  }

  /**
   * Classifies sensitive contextual entities in the given text using on-device inference.
   *
   * @param text - The raw user input text to scan.
   * @param confidenceThreshold - Minimum confidence score (0.0 - 1.0) to accept a finding (default: 0.60).
   * @param onProgress - Optional callback for tracking initial model download.
   * @returns Array of detected sensitive findings.
   */
  public async classify(
    text: string,
    confidenceThreshold: number = 0.60,
    onProgress?: ProgressCallback
  ): Promise<SensitiveFinding[]> {
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return [];
    }

    try {
      const pipeline = await this.pipelineManager.getPipeline(onProgress);
      // Run token classification with entity grouping
      const rawResults = (await pipeline(text, {
        ignore_labels: ['O'],
        aggregation_strategy: 'simple'
      })) as RawTokenOutput[] | RawTokenOutput;

      const tokenArray: RawTokenOutput[] = Array.isArray(rawResults)
        ? rawResults
        : [rawResults];

      return this.transformTokensToFindings(tokenArray, text, confidenceThreshold);
    } catch (error) {
      // Gracefully handle model loading / runtime errors without throwing
      // The hybrid scanner will still provide deterministic regex protection
      console.warn('[AiClassifier] On-device classification bypassed or unavailable:', error);
      return [];
    }
  }

  /**
   * Transforms raw model token outputs into standardized SensitiveFinding instances.
   */
  private transformTokensToFindings(
    tokens: readonly RawTokenOutput[],
    sourceText: string,
    threshold: number
  ): SensitiveFinding[] {
    const findings: SensitiveFinding[] = [];

    for (const token of tokens) {
      if (!token || typeof token.score !== 'number' || token.score < threshold) {
        continue;
      }

      const entityTag: string = (token.entity_group || token.entity || '').toUpperCase();
      if (!entityTag || entityTag === 'O') {
        continue;
      }

      const { category, severity, label, defaultReplacement } = this.mapEntityToMetadata(entityTag);

      // Resolve character start and end bounds
      let startIndex: number = token.start ?? -1;
      let endIndex: number = token.end ?? -1;
      let matchedText: string = token.word;

      if (startIndex >= 0 && endIndex > startIndex && endIndex <= sourceText.length) {
        matchedText = sourceText.slice(startIndex, endIndex);
      } else if (matchedText && sourceText.includes(matchedText)) {
        startIndex = sourceText.indexOf(matchedText);
        endIndex = startIndex + matchedText.length;
      } else {
        continue;
      }

      // Ignore trivial 1-2 character false-positive tokens
      if (matchedText.trim().length < 3) {
        continue;
      }

      findings.push({
        id: `ai_${category}_${startIndex}_${endIndex}`,
        label,
        category,
        rawText: matchedText,
        start: startIndex,
        end: endIndex,
        severity,
        source: 'ai_model',
        confidence: Number(token.score.toFixed(4)),
        suggestedReplacement: defaultReplacement
      });
    }

    return findings;
  }

  /**
   * Maps Shield-82M entity labels to TekaSend categories, severities, and placeholders.
   */
  private mapEntityToMetadata(tag: string): {
    category: FindingCategory;
    severity: FindingSeverity;
    label: string;
    defaultReplacement: string;
  } {
    if (tag.includes('EMAIL')) {
      return { category: 'email', severity: 'medium', label: 'Email Address', defaultReplacement: '[EMAIL_ADDRESS]' };
    }
    if (tag.includes('PHONE')) {
      return { category: 'phone', severity: 'medium', label: 'Phone Number', defaultReplacement: '[PHONE_NUMBER]' };
    }
    if (tag.includes('SSN') || tag.includes('GOV') || tag.includes('TAX')) {
      return { category: 'ssn', severity: 'critical', label: 'Government ID / SSN', defaultReplacement: '[SSN_NUMBER]' };
    }
    if (tag.includes('CARD') || tag.includes('CREDIT') || tag.includes('BANK')) {
      return { category: 'credit_card', severity: 'critical', label: 'Payment Card / Account', defaultReplacement: '[CARD_NUMBER]' };
    }
    if (tag.includes('PER') || tag.includes('NAME')) {
      return { category: 'person_name', severity: 'medium', label: 'Personal Name', defaultReplacement: '[PERSON_NAME]' };
    }
    if (tag.includes('LOC') || tag.includes('STREET') || tag.includes('CITY') || tag.includes('ADDRESS')) {
      return { category: 'address', severity: 'low', label: 'Location / Address', defaultReplacement: '[STREET_ADDRESS]' };
    }
    if (tag.includes('IP') || tag.includes('HOST')) {
      return { category: 'ip_address', severity: 'low', label: 'IP Address / Host', defaultReplacement: '[IP_ADDRESS]' };
    }
    if (tag.includes('PASS') || tag.includes('KEY') || tag.includes('SECRET')) {
      return { category: 'password', severity: 'critical', label: 'Credential / Secret', defaultReplacement: 'YOUR_SECRET' };
    }

    return { category: 'custom_sensitive', severity: 'medium', label: 'Sensitive Info', defaultReplacement: '[REDACTED]' };
  }
}
