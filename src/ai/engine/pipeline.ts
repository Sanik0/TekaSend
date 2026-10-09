/**
 * Local AI Pipeline Manager
 *
 * Manages the lifecycle, downloading, caching, and instantiation of on-device
 * ONNX models via @huggingface/transformers.
 * Satisfies PRD Section 7 (Local-AI & Privacy Requirements: 100% on-device).
 */

import { pipeline, env } from '@huggingface/transformers';
import { ModelLifecycleState, ModelProgressPayload, ModelStatus } from '../types.js';

// Configure transformers.js environment for browser extension compatibility
if (typeof window !== 'undefined' || typeof self !== 'undefined') {
  env.allowLocalModels = true;
}

export type ProgressCallback = (payload: ModelProgressPayload) => void;

// Type alias for token classification pipeline
export type TokenClassificationPipeline = Awaited<ReturnType<typeof pipeline<'token-classification'>>>;

export class ModelPipelineManager {
  private static instance: ModelPipelineManager | null = null;

  public static readonly DEFAULT_MODEL_ID = 'onnx-community/Shield-82M-ONNX';

  private readonly modelId: string;
  private pipelineInstance: TokenClassificationPipeline | null = null;
  private initializationPromise: Promise<TokenClassificationPipeline> | null = null;
  private currentState: ModelLifecycleState = 'unloaded';
  private currentProgress: number = 0;
  private lastErrorMessage: string | undefined = undefined;

  public constructor(modelId: string = ModelPipelineManager.DEFAULT_MODEL_ID) {
    this.modelId = modelId;
  }

  /**
   * Retrieves the singleton pipeline manager instance.
   */
  public static getInstance(modelId?: string): ModelPipelineManager {
    if (!ModelPipelineManager.instance) {
      ModelPipelineManager.instance = new ModelPipelineManager(modelId);
    }
    return ModelPipelineManager.instance;
  }

  /**
   * Returns current model lifecycle status and download progress.
   */
  public getStatus(): ModelStatus {
    return {
      state: this.currentState,
      progress: this.currentProgress,
      errorMessage: this.lastErrorMessage,
      modelId: this.modelId
    };
  }

  /**
   * Returns true if the model is initialized and ready for inference.
   */
  public isReady(): boolean {
    return this.currentState === 'ready' && this.pipelineInstance !== null;
  }

  /**
   * Loads and initializes the on-device token-classification pipeline.
   * Caches the loaded instance for subsequent calls.
   *
   * @param onProgress - Optional callback to track model download progress in the UI.
   * @returns Ready-to-use TokenClassificationPipeline.
   */
  public async getPipeline(onProgress?: ProgressCallback): Promise<TokenClassificationPipeline> {
    if (this.pipelineInstance) {
      return this.pipelineInstance;
    }

    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.currentState = 'downloading';
    this.currentProgress = 0;
    this.lastErrorMessage = undefined;

    this.initializationPromise = (async () => {
      try {
        const pipe = await pipeline('token-classification', this.modelId, {
          progress_callback: (progressData: unknown) => {
            const payload = progressData as ModelProgressPayload;
            if (typeof payload?.progress === 'number') {
              this.currentProgress = Math.round(payload.progress);
            }
            if (onProgress) {
              onProgress(payload);
            }
          }
        });

        this.pipelineInstance = pipe;
        this.currentState = 'ready';
        this.currentProgress = 100;
        return pipe;
      } catch (error) {
        this.currentState = 'error';
        this.lastErrorMessage = error instanceof Error ? error.message : 'Failed to load on-device AI model';
        this.initializationPromise = null;
        throw new Error(`[ModelPipelineManager] ${this.lastErrorMessage}`);
      }
    })();

    return this.initializationPromise;
  }

  /**
   * Disposes the cached model instance to free browser memory if needed.
   */
  public async dispose(): Promise<void> {
    if (this.pipelineInstance && typeof (this.pipelineInstance as { dispose?: () => Promise<void> }).dispose === 'function') {
      await (this.pipelineInstance as { dispose: () => Promise<void> }).dispose();
    }
    this.pipelineInstance = null;
    this.initializationPromise = null;
    this.currentState = 'unloaded';
    this.currentProgress = 0;
  }
}
