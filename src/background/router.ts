/**
 * Background AI Message Router
 *
 * Dispatches extension messaging requests to the on-device AI subsystem.
 * Encapsulates the HybridScanner, PrivacyReplacer, and LocalRepairVerifier.
 */

import {
  HybridScanner,
  PrivacyReplacer,
  LocalRepairVerifier,
  ModelPipelineManager
} from '../ai/index.js';
import {
  ExtensionRequestMessage,
  ExtensionResponseMessage,
  HybridScanResponse,
  SmartRepairResponse,
  VerifyRepairResponse,
  ModelStatusResponse
} from '../shared/types/messages.js';

export class BackgroundAiRouter {
  private readonly hybridScanner: HybridScanner;
  private readonly privacyReplacer: PrivacyReplacer;
  private readonly repairVerifier: LocalRepairVerifier;
  private readonly pipelineManager: ModelPipelineManager;

  public constructor(
    hybridScanner?: HybridScanner,
    privacyReplacer?: PrivacyReplacer,
    repairVerifier?: LocalRepairVerifier,
    pipelineManager?: ModelPipelineManager
  ) {
    this.hybridScanner = hybridScanner ?? new HybridScanner();
    this.privacyReplacer = privacyReplacer ?? new PrivacyReplacer();
    this.repairVerifier = repairVerifier ?? new LocalRepairVerifier();
    this.pipelineManager = pipelineManager ?? ModelPipelineManager.getInstance();
  }

  /**
   * Handles incoming extension messages and routes them to the appropriate subsystem.
   *
   * @param message - The raw incoming message.
   * @returns Typed response payload or null if the message is unhandled.
   */
  public async handleMessage(
    message: unknown
  ): Promise<ExtensionResponseMessage | null> {
    if (!this.isValidRequestMessage(message)) {
      return null;
    }

    switch (message.kind) {
      case 'HYBRID_SCAN_REQUEST':
        return this.handleHybridScan(message);

      case 'SMART_REPAIR_REQUEST':
        return this.handleSmartRepair(message);

      case 'VERIFY_REPAIR_REQUEST':
        return this.handleVerifyRepair(message);

      case 'MODEL_STATUS_REQUEST':
        return this.handleModelStatus();

      default:
        return null;
    }
  }

  /**
   * Handles hybrid scan requests by running deterministic regex and local AI inference.
   */
  private async handleHybridScan(
    request: Extract<ExtensionRequestMessage, { kind: 'HYBRID_SCAN_REQUEST' }>
  ): Promise<HybridScanResponse> {
    try {
      const result = await this.hybridScanner.scan(request.text, request.options);
      return {
        kind: 'HYBRID_SCAN_RESPONSE',
        ok: true,
        result
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Hybrid scan failed';
      return {
        kind: 'HYBRID_SCAN_RESPONSE',
        ok: false,
        errorMessage
      };
    }
  }

  /**
   * Handles privacy repair requests by replacing detected sensitive spans.
   */
  private handleSmartRepair(
    request: Extract<ExtensionRequestMessage, { kind: 'SMART_REPAIR_REQUEST' }>
  ): SmartRepairResponse {
    try {
      const result = this.privacyReplacer.replace(
        request.originalText,
        request.findings,
        request.directives,
        request.defaultStrategy
      );
      return {
        kind: 'SMART_REPAIR_RESPONSE',
        ok: true,
        result
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Smart repair failed';
      return {
        kind: 'SMART_REPAIR_RESPONSE',
        ok: false,
        errorMessage
      };
    }
  }

  /**
   * Handles pre-flight verification requests to ensure zero leakages.
   */
  private handleVerifyRepair(
    request: Extract<ExtensionRequestMessage, { kind: 'VERIFY_REPAIR_REQUEST' }>
  ): VerifyRepairResponse {
    try {
      const result = this.repairVerifier.verify(
        request.proposedSanitizedText,
        request.originalFindings
      );
      return {
        kind: 'VERIFY_REPAIR_RESPONSE',
        ok: true,
        result
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Repair verification failed';
      return {
        kind: 'VERIFY_REPAIR_RESPONSE',
        ok: false,
        errorMessage
      };
    }
  }

  /**
   * Returns current on-device AI model status.
   */
  private handleModelStatus(): ModelStatusResponse {
    return {
      kind: 'MODEL_STATUS_RESPONSE',
      ok: true,
      status: this.pipelineManager.getStatus()
    };
  }

  /**
   * Type guard to validate whether an object is a recognized ExtensionRequestMessage.
   */
  private isValidRequestMessage(message: unknown): message is ExtensionRequestMessage {
    if (!message || typeof message !== 'object') {
      return false;
    }
    const candidate = message as { kind?: unknown };
    return typeof candidate.kind === 'string' && [
      'HYBRID_SCAN_REQUEST',
      'SMART_REPAIR_REQUEST',
      'VERIFY_REPAIR_REQUEST',
      'MODEL_STATUS_REQUEST'
    ].includes(candidate.kind);
  }
}
