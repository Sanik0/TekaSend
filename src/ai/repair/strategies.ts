/**
 * Privacy Replacement Strategies (PRD F2 - Smart Privacy Repair)
 *
 * Implements strategy generators for:
 * 1. Semantic Placeholders: Explicit uppercase token tags (e.g. YOUR_API_KEY, [EMAIL])
 * 2. Synthetic Test Dummies: Realistic but obvious fake test values
 * 3. Solid Redaction Masks: Unicode solid block characters
 */

import { FindingCategory, RepairStrategyType, SensitiveFinding } from '../types.js';

export class PrivacyReplacementStrategies {
  /**
   * Generates a replacement string according to the requested strategy and finding category.
   *
   * @param finding - The sensitive finding to replace.
   * @param strategy - The selected repair strategy.
   * @param customValue - Optional user-defined value when strategy is 'custom'.
   * @returns The generated replacement string.
   */
  public generateReplacement(
    finding: SensitiveFinding,
    strategy: RepairStrategyType,
    customValue?: string
  ): string {
    switch (strategy) {
      case 'semantic_placeholder':
        return this.getSemanticPlaceholder(finding.category);

      case 'synthetic_dummy':
        return this.getSyntheticDummy(finding.category);

      case 'solid_redact':
        return this.getSolidRedactMask(finding.rawText.length);

      case 'custom':
        return (typeof customValue === 'string' && customValue.trim().length > 0)
          ? customValue.trim()
          : this.getSemanticPlaceholder(finding.category);

      default:
        return this.getSemanticPlaceholder(finding.category);
    }
  }

  /**
   * Returns a clear, semantic uppercase placeholder label.
   */
  private getSemanticPlaceholder(category: FindingCategory): string {
    switch (category) {
      case 'api_key':
        return 'YOUR_API_KEY';
      case 'private_key':
        return 'YOUR_PRIVATE_KEY';
      case 'password':
        return 'YOUR_PASSWORD';
      case 'bearer_token':
        return 'YOUR_AUTH_TOKEN';
      case 'credit_card':
        return '[CREDIT_CARD_NUMBER]';
      case 'ssn':
        return '[SSN_NUMBER]';
      case 'email':
        return '[EMAIL_ADDRESS]';
      case 'phone':
        return '[PHONE_NUMBER]';
      case 'person_name':
        return '[PERSON_NAME]';
      case 'address':
        return '[STREET_ADDRESS]';
      case 'ip_address':
        return '[IP_ADDRESS]';
      case 'custom_sensitive':
      default:
        return '[REDACTED_SENSITIVE_DATA]';
    }
  }

  /**
   * Returns a synthetic, clearly fake test dummy value.
   */
  private getSyntheticDummy(category: FindingCategory): string {
    switch (category) {
      case 'api_key':
        return 'sk-proj-DEMOTESTKEY00000000000000000000';
      case 'private_key':
        return '-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC6DEMO\n-----END PRIVATE KEY-----';
      case 'password':
        return 'ExampleSecretPass123!';
      case 'bearer_token':
        return 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.demo_test_signature';
      case 'credit_card':
        return '4000-1234-5678-9010';
      case 'ssn':
        return '000-00-0000';
      case 'email':
        return 'user@example.com';
      case 'phone':
        return '0917-000-0000';
      case 'person_name':
        return 'Juan Dela Cruz';
      case 'address':
        return '123 Test St., Sample City';
      case 'ip_address':
        return '192.168.1.1';
      case 'custom_sensitive':
      default:
        return 'sample_placeholder_value';
    }
  }

  /**
   * Returns a solid block redaction mask matching the target character length.
   */
  private getSolidRedactMask(length: number): string {
    const maskLength: number = Math.max(4, Math.min(length, 32));
    return '█'.repeat(maskLength);
  }
}
