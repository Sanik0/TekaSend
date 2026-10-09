/**
 * Extension Message Protocol & Types
 *
 * Defines strictly-typed request and response contracts for communication
 * between content scripts, popup UI, and background service worker.
 */

import {
  FindingCategory,
  RepairDirective,
  RepairResult,
  RepairStrategyType,
  ScanOptions,
  ScanResult,
  SensitiveFinding,
  VerificationResult,
  ModelStatus
} from '../../ai/types.js';

/**
 * Message kind identifiers for discriminated union matching.
 */
export type MessageKind =
  | 'HYBRID_SCAN_REQUEST'
  | 'HYBRID_SCAN_RESPONSE'
  | 'SMART_REPAIR_REQUEST'
  | 'SMART_REPAIR_RESPONSE'
  | 'VERIFY_REPAIR_REQUEST'
  | 'VERIFY_REPAIR_RESPONSE'
  | 'MODEL_STATUS_REQUEST'
  | 'MODEL_STATUS_RESPONSE';

export interface HybridScanRequest {
  readonly kind: 'HYBRID_SCAN_REQUEST';
  readonly text: string;
  readonly options?: ScanOptions;
}

export interface HybridScanResponse {
  readonly kind: 'HYBRID_SCAN_RESPONSE';
  readonly ok: boolean;
  readonly result?: ScanResult;
  readonly errorMessage?: string;
}

export interface SmartRepairRequest {
  readonly kind: 'SMART_REPAIR_REQUEST';
  readonly originalText: string;
  readonly findings: readonly SensitiveFinding[];
  readonly directives?: readonly RepairDirective[];
  readonly defaultStrategy?: RepairStrategyType;
}

export interface SmartRepairResponse {
  readonly kind: 'SMART_REPAIR_RESPONSE';
  readonly ok: boolean;
  readonly result?: RepairResult;
  readonly errorMessage?: string;
}

export interface VerifyRepairRequest {
  readonly kind: 'VERIFY_REPAIR_REQUEST';
  readonly proposedSanitizedText: string;
  readonly originalFindings: readonly SensitiveFinding[];
}

export interface VerifyRepairResponse {
  readonly kind: 'VERIFY_REPAIR_RESPONSE';
  readonly ok: boolean;
  readonly result?: VerificationResult;
  readonly errorMessage?: string;
}

export interface ModelStatusRequest {
  readonly kind: 'MODEL_STATUS_REQUEST';
}

export interface ModelStatusResponse {
  readonly kind: 'MODEL_STATUS_RESPONSE';
  readonly ok: boolean;
  readonly status: ModelStatus;
}

export type ExtensionRequestMessage =
  | HybridScanRequest
  | SmartRepairRequest
  | VerifyRepairRequest
  | ModelStatusRequest;

export type ExtensionResponseMessage =
  | HybridScanResponse
  | SmartRepairResponse
  | VerifyRepairResponse
  | ModelStatusResponse;
