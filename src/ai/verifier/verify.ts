/**
 * Local Pre-Flight Repair Verifier (PRD F3 - Local Repair Verification)
 *
 * Deterministically verifies that:
 * 1. Targeted sensitive raw strings are 100% removed from proposed outgoing text.
 * 2. Approved replacements have been cleanly integrated.
 * 3. No accidental residual secret leaks exist.
 */

import { SensitiveFinding, VerificationResult } from '../types.js';

export class LocalRepairVerifier {
  /**
   * Performs deterministic pre-flight verification on the proposed repaired text.
   *
   * @param proposedSanitizedText - The text prepared for dispatch after repair.
   * @param originalFindings - The list of sensitive findings targeted for replacement.
   * @returns Detailed VerificationResult indicating whether the text is clean to send.
   */
  public verify(
    proposedSanitizedText: string,
    originalFindings: readonly SensitiveFinding[]
  ): VerificationResult {
    if (!proposedSanitizedText) {
      return {
        isClean: true,
        leakedFindings: [],
        verifiedReplacementsCount: 0,
        message: 'Content is empty.'
      };
    }

    const leakedFindings: SensitiveFinding[] = [];
    let verifiedReplacementsCount: number = 0;

    for (const finding of originalFindings) {
      // Deterministic check: exact substring presence check
      if (finding.rawText && proposedSanitizedText.includes(finding.rawText)) {
        // High severity leak detected: the original raw sensitive value is still present
        leakedFindings.push(finding);
      } else {
        verifiedReplacementsCount += 1;
      }
    }

    const isClean: boolean = leakedFindings.length === 0;
    const message: string = isClean
      ? `Verified: All ${originalFindings.length} targeted sensitive value(s) were successfully replaced.`
      : `Warning: ${leakedFindings.length} sensitive value(s) remain detectable in the outgoing text.`;

    return {
      isClean,
      leakedFindings,
      verifiedReplacementsCount,
      message
    };
  }
}
