/**
 * TekaSend AI Subsystem — Public Facade API
 *
 * Exposes strictly-typed interfaces and modules for:
 * - On-device Transformers.js pipeline management (Shield-82M-ONNX)
 * - Deterministic detection & regex scanning
 * - Contextual semantic analysis & dummy filtering
 * - AI Risk reasoning & actionable recommendations
 * - Hybrid scanning & collision resolution
 * - Smart privacy repair & replacement strategies
 * - Local pre-flight repair verification
 */

export * from './types.js';
export { ModelPipelineManager, type ProgressCallback, type TokenClassificationPipeline } from './engine/pipeline.js';
export { DeterministicRuleMatcher } from './detectors/regex-rules.js';
export { ContextAnalyzer, type ContextualAssessment } from './detectors/context-analyzer.js';
export { RiskAnalyzer, type RiskAnalysis } from './reasoning/risk-analyzer.js';
export { AiClassifier } from './detectors/ai-classifier.js';
export { HybridScanner } from './detectors/hybrid-scanner.js';
export { PrivacyReplacementStrategies } from './repair/strategies.js';
export { PrivacyReplacer } from './repair/replacer.js';
export { LocalRepairVerifier } from './verifier/verify.js';
