/**
 * TekaSend AI Subsystem — Core Type Definitions & Data Contracts
 *
 * Defines strictly-typed interfaces and DTOs for:
 * - PRD F1: Data Awareness Notice (Finding categories, severities, offsets)
 * - PRD F2: Smart Privacy Repair (Strategies, placeholders, replacements)
 * - PRD F3: Local Repair Verification (Integrity checks, zero-leak verification)
 * - Engine & Model Lifecycle (Status, download progress, worker communication)
 */

/**
 * Finding severity classification level.
 * - 'critical': Passwords, private keys, authentication tokens, credit cards.
 * - 'high': API keys, SSN, government IDs.
 * - 'medium': Personal phone numbers, personal email addresses.
 * - 'low': Generic contextual entities (city, organization names).
 */
export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low';

/**
 * Supported detection finding categories across deterministic regex and AI classification.
 */
export type FindingCategory =
  | 'api_key'
  | 'private_key'
  | 'password'
  | 'bearer_token'
  | 'email'
  | 'phone'
  | 'credit_card'
  | 'ssn'
  | 'person_name'
  | 'address'
  | 'ip_address'
  | 'custom_sensitive';

/**
 * Origin of the detected finding.
 * - 'regex_rule': Exact deterministic pattern match (high precision).
 * - 'ai_model': Contextual machine-learning token classification (e.g., Shield-82M).
 */
export type FindingSource = 'regex_rule' | 'ai_model';

/**
 * A discrete sensitive entity detected within the input text.
 */
export interface SensitiveFinding {
  /** Unique deterministic identifier for this finding instance */
  readonly id: string;
  /** Human-readable category label (e.g., 'API key', 'Email', 'Phone number') */
  readonly label: string;
  /** Standardized category identifier */
  readonly category: FindingCategory;
  /** Exact raw sensitive substring found in the original text */
  readonly rawText: string;
  /** Zero-based character start index in the source text */
  readonly start: number;
  /** Zero-based character end index in the source text */
  readonly end: number;
  /** Severity level for UI badge color and user alert priority */
  readonly severity: FindingSeverity;
  /** Detection engine origin */
  readonly source: FindingSource;
  /** Confidence score between 0.0 and 1.0 (1.0 for deterministic rules) */
  readonly confidence: number;
  /** Default recommended replacement string (e.g., 'YOUR_API_KEY') */
  readonly suggestedReplacement: string;
  /** Contextual explanation of why this finding is sensitive or risky (PRD F1) */
  readonly riskExplanation?: string;
  /** Actionable recommendation for the user (PRD F1) */
  readonly recommendedAction?: string;
}

/**
 * Options to configure a scan operation.
 */
export interface ScanOptions {
  /** Whether to run on-device AI classification in addition to regex rules */
  readonly enableAi?: boolean;
  /** Minimum confidence threshold for AI detections (default: 0.6) */
  readonly confidenceThreshold?: number;
  /** Specific categories to include (if omitted, all enabled) */
  readonly enabledCategories?: readonly FindingCategory[];
}

/**
 * Result of scanning an input text string.
 */
export interface ScanResult {
  /** True if one or more sensitive findings were detected */
  readonly hasSensitiveData: boolean;
  /** Sorted, non-overlapping list of detected sensitive findings */
  readonly findings: readonly SensitiveFinding[];
  /** Execution duration in milliseconds */
  readonly inferenceTimeMs: number;
  /** Name/identifier of the model or engine that performed the scan */
  readonly engineUsed: string;
}

/**
 * Supported privacy replacement strategies (PRD F2).
 * - 'semantic_placeholder': Replace with clear label like YOUR_API_KEY or [EMAIL].
 * - 'synthetic_dummy': Replace with believable but clearly fake dummy test values.
 * - 'solid_redact': Replace with solid mask characters (e.g., '████████').
 * - 'custom': User-defined custom replacement string.
 */
export type RepairStrategyType =
  | 'semantic_placeholder'
  | 'synthetic_dummy'
  | 'solid_redact'
  | 'custom';

/**
 * Specification for repairing a single detected finding.
 */
export interface RepairDirective {
  /** ID of the sensitive finding being replaced */
  readonly findingId: string;
  /** Selected repair strategy */
  readonly strategy: RepairStrategyType;
  /** Custom replacement value if strategy is 'custom' */
  readonly customValue?: string;
}

/**
 * Result of applying privacy replacements to an input text (PRD F2).
 */
export interface RepairResult {
  /** The sanitized output text with replacements applied */
  readonly sanitizedText: string;
  /** Number of successful replacements applied */
  readonly replacementsCount: number;
  /** Mapping of original raw substrings to their applied replacements */
  readonly replacementMap: ReadonlyMap<string, string>;
}

/**
 * Local pre-flight verification output (PRD F3).
 */
export interface VerificationResult {
  /** True if zero detected raw sensitive values remain in the outgoing text */
  readonly isClean: boolean;
  /** List of any sensitive values that accidentally leaked into the output */
  readonly leakedFindings: readonly SensitiveFinding[];
  /** Total replacements successfully verified in the output text */
  readonly verifiedReplacementsCount: number;
  /** Verification message or warnings for user display */
  readonly message: string;
}

/**
 * Lifecycle state of the on-device AI model.
 */
export type ModelLifecycleState = 'unloaded' | 'downloading' | 'ready' | 'error';

/**
 * Status object describing on-device model availability.
 */
export interface ModelStatus {
  /** Current lifecycle state */
  readonly state: ModelLifecycleState;
  /** Download or initialization progress percentage (0 - 100) */
  readonly progress: number;
  /** Error message if state is 'error' */
  readonly errorMessage?: string;
  /** Active model identifier */
  readonly modelId: string;
}

/**
 * Progress callback payload emitted during model download/loading.
 */
export interface ModelProgressPayload {
  readonly status: string;
  readonly progress?: number;
  readonly loaded?: number;
  readonly total?: number;
  readonly file?: string;
}
