/**
 * AI Risk & Impact Reasoning Engine (PRD F1 - Data Awareness Notice)
 *
 * Evaluates detected sensitive entities and provides contextual explanations
 * of why the data is risky to share, along with actionable recommendations.
 */

import { FindingCategory, FindingSeverity } from '../types.js';

export interface RiskAnalysis {
  readonly explanation: string;
  readonly recommendedAction: string;
  readonly impactLevel: FindingSeverity;
}

export class RiskAnalyzer {
  /**
   * Generates a contextual risk explanation and recommended action for a given finding.
   *
   * @param category - The category of the detected finding.
   * @param rawText - The matched substring.
   * @param severity - The baseline severity level.
   * @returns Structured RiskAnalysis with explanation, action, and impact level.
   */
  public analyzeRisk(
    category: FindingCategory,
    rawText: string,
    severity: FindingSeverity
  ): RiskAnalysis {
    switch (category) {
      case 'api_key':
        return this.analyzeApiKey(rawText);

      case 'private_key':
        return {
          explanation: 'Exposing a private cryptographic key compromises asymmetric encryption and server authentication, allowing unauthorized actors to decrypt secure traffic or impersonate your identity.',
          recommendedAction: 'Replace with a generic placeholder and rotate this key immediately if already published.',
          impactLevel: 'critical'
        };

      case 'password':
        return {
          explanation: 'Plain-text passwords or client secrets grant direct access to databases, accounts, or services, creating an immediate credential stuffing and account takeover risk.',
          recommendedAction: 'Replace with an environment variable reference or dummy secret.',
          impactLevel: 'critical'
        };

      case 'bearer_token':
        return {
          explanation: 'Bearer and JWT authentication tokens grant active session privileges without requiring secondary credentials until they expire.',
          recommendedAction: 'Sanitize the token or use a revoked test token before sharing request logs.',
          impactLevel: 'critical'
        };

      case 'credit_card':
        return {
          explanation: 'Exposing payment card account numbers violates PCI-DSS compliance standards and exposes cardholders to fraudulent transactions.',
          recommendedAction: 'Replace with standard masked digits or a synthetic test card number.',
          impactLevel: 'critical'
        };

      case 'ssn':
        return {
          explanation: 'Government identification and Social Security numbers are non-revocable identifiers commonly exploited for identity theft and financial fraud.',
          recommendedAction: 'Completely redact or substitute with a synthetic test ID.',
          impactLevel: 'critical'
        };

      case 'email':
        return {
          explanation: 'Personal and corporate email addresses in public prompts can be harvested for spam, phishing campaigns, and targeted social engineering.',
          recommendedAction: 'Replace with a generic domain example like user@example.com.',
          impactLevel: severity
        };

      case 'phone':
        return {
          explanation: 'Direct phone numbers expose personal contact routes and enable unsolicited SMS spam, SIM-swap attacks, and vishing.',
          recommendedAction: 'Replace with a clearly synthetic test number.',
          impactLevel: severity
        };

      case 'person_name':
        return {
          explanation: 'Personal names in AI prompts can lead to unintended profiling, privacy violations under GDPR/DPA, or de-anonymization of confidential case studies.',
          recommendedAction: 'Replace with a pseudonym or role title.',
          impactLevel: 'medium'
        };

      case 'address':
        return {
          explanation: 'Physical addresses reveal geolocation data, office locations, or residence information.',
          recommendedAction: 'Generalize the location or replace with a sample address.',
          impactLevel: 'low'
        };

      case 'ip_address':
        return {
          explanation: 'Internal or public IP addresses map internal network topology and potential attack surfaces.',
          recommendedAction: 'Replace with standard loopback (127.0.0.1) or RFC 5737 documentation ranges.',
          impactLevel: 'low'
        };

      case 'custom_sensitive':
      default:
        return {
          explanation: 'This text matches sensitive data heuristics and may contain confidential information.',
          recommendedAction: 'Review before submitting or apply a solid redaction mask.',
          impactLevel: severity
        };
    }
  }

  /**
   * Refines risk analysis specifically for API keys based on provider prefix.
   */
  private analyzeApiKey(rawText: string): RiskAnalysis {
    if (rawText.startsWith('sk-proj-') || rawText.startsWith('sk-')) {
      return {
        explanation: 'OpenAI API keys allow direct consumption of AI compute quota, potentially incurring billing charges and unauthorized model access.',
        recommendedAction: 'Replace with YOUR_OPENAI_API_KEY and verify that your API key is restricted in the dashboard.',
        impactLevel: 'critical'
      };
    }

    if (rawText.startsWith('ghp_') || rawText.startsWith('github_pat_')) {
      return {
        explanation: 'GitHub Personal Access Tokens grant repository read/write access and organization control.',
        recommendedAction: 'Replace with YOUR_GITHUB_TOKEN and ensure the token has minimal required scopes.',
        impactLevel: 'critical'
      };
    }

    if (rawText.startsWith('AKIA')) {
      return {
        explanation: 'AWS Access Key IDs grant programmatic access to cloud infrastructure and storage buckets.',
        recommendedAction: 'Replace with YOUR_AWS_ACCESS_KEY_ID and check IAM policies.',
        impactLevel: 'critical'
      };
    }

    return {
      explanation: 'API keys grant programmatic access to online services, potentially leading to unauthorized data access and usage fees.',
      recommendedAction: 'Replace with a semantic placeholder like YOUR_API_KEY.',
      impactLevel: 'high'
    };
  }
}
