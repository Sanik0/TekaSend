/**
 * Privacy Replacement Strategies (PRD F2 - Smart Privacy Repair)
 *
 * Implements strategy generators with Conditional Referential Consistency:
 * - Single Entity: Clean, unnumbered default placeholders (e.g. YOUR_API_KEY, [EMAIL_ADDRESS])
 * - Multiple Distinct Entities: Dynamically activates sequential variables (e.g. [EMAIL_ADDRESS_1], [EMAIL_ADDRESS_2])
 * - Preserves entity consistency so repeated values always share identical variables.
 */

import {
  FindingCategory,
  RepairStrategyType,
  SensitiveFinding,
} from "../types.js";

export class PrivacyReplacementStrategies {
  /**
   * Generates a replacement string according to the requested strategy, category, and entity index.
   *
   * @param finding - The sensitive finding to replace.
   * @param strategy - The selected repair strategy.
   * @param entityIndex - 0 for unnumbered default, or 1-based index (1, 2, ...) when multiple distinct entities exist.
   * @param customValue - Optional user-defined value when strategy is 'custom'.
   * @returns The generated replacement string.
   */
  public generateReplacement(
    finding: SensitiveFinding,
    strategy: RepairStrategyType,
    entityIndex: number = 0,
    customValue?: string,
  ): string {
    const idx = Math.max(0, entityIndex);

    switch (strategy) {
      case "semantic_placeholder":
        return this.getSemanticPlaceholder(finding.category, idx);

      case "synthetic_dummy":
        return this.getSyntheticDummy(finding.category, idx);

      case "solid_redact":
        return this.getSolidRedactMask(finding.rawText.length);

      case "custom":
        return typeof customValue === "string" && customValue.trim().length > 0
          ? customValue.trim()
          : this.getSemanticPlaceholder(finding.category, idx);

      default:
        return this.getSemanticPlaceholder(finding.category, idx);
    }
  }

  /**
   * Returns a clean semantic placeholder, only appending numbers when multiple distinct entities exist.
   */
  private getSemanticPlaceholder(
    category: FindingCategory,
    index: number,
  ): string {
    const idxSuffix = index > 0 ? `_${index}` : "";

    switch (category) {
      case "api_key":
        return `YOUR_API_KEY${idxSuffix}`;
      case "private_key":
        return `YOUR_PRIVATE_KEY${idxSuffix}`;
      case "password":
        return `YOUR_PASSWORD${idxSuffix}`;
      case "bearer_token":
        return `YOUR_AUTH_TOKEN${idxSuffix}`;
      case "credit_card":
        return index > 0
          ? `[CREDIT_CARD_NUMBER_${index}]`
          : "[CREDIT_CARD_NUMBER]";
      case "ssn":
        return index > 0 ? `[SSN_NUMBER_${index}]` : "[SSN_NUMBER]";
      case "email":
        return index > 0 ? `[EMAIL_ADDRESS_${index}]` : "[EMAIL_ADDRESS]";
      case "phone":
        return index > 0 ? `[PHONE_NUMBER_${index}]` : "[PHONE_NUMBER]";
      case "person_name":
        return index > 0 ? `[PERSON_NAME_${index}]` : "[PERSON_NAME]";
      case "address":
        return index > 0 ? `[STREET_ADDRESS_${index}]` : "[STREET_ADDRESS]";
      case "ip_address":
        return index > 0 ? `[IP_ADDRESS_${index}]` : "[IP_ADDRESS]";
      case "custom_sensitive":
      default:
        return index > 0
          ? `[REDACTED_SENSITIVE_DATA_${index}]`
          : "[REDACTED_SENSITIVE_DATA]";
    }
  }

  /**
   * Returns a synthetic fake dummy value, only indexing when multiple distinct entities exist.
   */
  private getSyntheticDummy(category: FindingCategory, index: number): string {
    if (index === 0) {
      switch (category) {
        case "api_key":
          return "sk-proj-DEMO_KEY_00000000000000000000";
        case "private_key":
          return "-----BEGIN PRIVATE KEY-----\n[DEMO_TEST_PRIVATE_KEY]\n-----END PRIVATE KEY-----";
        case "password":
          return "ExampleSecretPass123!";
        case "bearer_token":
          return "Bearer DEMO_TEST_TOKEN_000000000000";
        case "credit_card":
          return "4000-XXXX-XXXX-9010";
        case "ssn":
          return "000-XX-0000";
        case "email":
          return "user_demo@masked-test-domain.net";
        case "phone":
          return "0917-000-0000";
        case "person_name":
          return "Juan Dela Cruz";
        case "address":
          return "123 Demo St., Sample City";
        case "ip_address":
          return "192.0.2.1";
        case "custom_sensitive":
        default:
          return "SAMPLE_PLACEHOLDER_VALUE";
      }
    }

    switch (category) {
      case "api_key":
        return `sk-proj-DEMO_KEY_${index}_00000000000000000000`;
      case "private_key":
        return `-----BEGIN PRIVATE KEY-----\n[DEMO_TEST_PRIVATE_KEY_${index}]\n-----END PRIVATE KEY-----`;
      case "password":
        return `ExampleSecretPass${index}!`;
      case "bearer_token":
        return `Bearer DEMO_TEST_TOKEN_${index}_000000000000`;
      case "credit_card":
        return `4000-0000-0000-${String(index).padStart(4, "0")}`;
      case "ssn":
        return `000-00-${String(index).padStart(4, "0")}`;
      case "email":
        return `user_${index}_demo@masked-test-domain.net`;
      case "phone":
        return `0917-000-${String(index).padStart(4, "0")}`;
      case "person_name":
        return `Test Person ${index}`;
      case "address":
        return `${index} Demo St., Sample City`;
      case "ip_address":
        return `192.0.2.${Math.min(254, index)}`;
      case "custom_sensitive":
      default:
        return `SAMPLE_PLACEHOLDER_${index}`;
    }
  }

  /**
   * Returns a solid block redaction mask matching the target character length.
   */
  private getSolidRedactMask(length: number): string {
    const maskLength: number = Math.max(4, Math.min(length, 32));
    return "█".repeat(maskLength);
  }
}
