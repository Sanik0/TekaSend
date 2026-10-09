import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { build } from 'esbuild';
import { unlink } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const tempFile = resolve('tests', '.temp-ai-subsystem.mjs');

await build({
  entryPoints: ['src/ai/index.ts'],
  bundle: true,
  format: 'esm',
  outfile: tempFile,
  platform: 'node',
  external: ['@huggingface/transformers']
});

const {
  DeterministicRuleMatcher,
  ContextAnalyzer,
  RiskAnalyzer,
  AiClassifier,
  HybridScanner,
  PrivacyReplacer,
  LocalRepairVerifier
} = await import(pathToFileURL(tempFile).href);

after(async () => {
  try {
    await unlink(tempFile);
  } catch {}
});

test('DeterministicRuleMatcher detects API keys, emails, passwords, and phones accurately', () => {
  const matcher = new DeterministicRuleMatcher();
  const text = 'Here is my key: sk-proj-1234567890abcdef123456 and email test@example.com with phone 09171234567';
  const findings = matcher.match(text);

  assert.equal(findings.length, 3);
  assert.equal(findings[0].category, 'api_key');
  assert.equal(findings[0].severity, 'critical');
  assert.equal(findings[1].category, 'email');
  assert.equal(findings[2].category, 'phone');
});

test('RiskAnalyzer provides tailored explanations and actions for API keys and credentials', () => {
  const riskAnalyzer = new RiskAnalyzer();
  const openAiRisk = riskAnalyzer.analyzeRisk('api_key', 'sk-proj-test12345678901234567890', 'critical');
  assert.ok(openAiRisk.explanation.includes('OpenAI'));
  assert.equal(openAiRisk.impactLevel, 'critical');

  const pwRisk = riskAnalyzer.analyzeRisk('password', 'secretpass123', 'critical');
  assert.ok(pwRisk.explanation.includes('Plain-text passwords'));
});

test('ContextAnalyzer recognizes dummy/tutorial placeholders and detects structured containers', () => {
  const contextAnalyzer = new ContextAnalyzer();
  const fullText = '{"api_key": "user@example.com"}';
  
  // Evaluate email token
  const assessment = contextAnalyzer.evaluateContext(fullText, 13, 29, 'email');
  assert.equal(assessment.isLikelyDummyOrSample, true);
  assert.equal(assessment.detectedContainerFormat, 'json');
});

test('PrivacyReplacer cleanly replaces findings with semantic placeholders without index drift', () => {
  const matcher = new DeterministicRuleMatcher();
  const replacer = new PrivacyReplacer();

  const originalText = 'Connect with sk-proj-1234567890abcdef123456 at user@example.com.';
  const findings = matcher.match(originalText);

  const repairResult = replacer.replace(originalText, findings, [], 'semantic_placeholder');

  assert.equal(
    repairResult.sanitizedText,
    'Connect with YOUR_API_KEY at [EMAIL_ADDRESS].'
  );
  assert.equal(repairResult.replacementsCount, 2);
});

test('LocalRepairVerifier passes when all secrets are removed and catches remaining leaks', () => {
  const matcher = new DeterministicRuleMatcher();
  const verifier = new LocalRepairVerifier();

  const originalText = 'Secret key sk-proj-1234567890abcdef123456 leaked!';
  const findings = matcher.match(originalText);

  // Clean repaired text
  const cleanText = 'Secret key YOUR_API_KEY leaked!';
  const cleanVerification = verifier.verify(cleanText, findings);
  assert.equal(cleanVerification.isClean, true);
  assert.equal(cleanVerification.leakedFindings.length, 0);

  // Leaked text
  const leakedText = 'Secret key sk-proj-1234567890abcdef123456 still here!';
  const dirtyVerification = verifier.verify(leakedText, findings);
  assert.equal(dirtyVerification.isClean, false);
  assert.equal(dirtyVerification.leakedFindings.length, 1);
});

test('HybridScanner combines deterministic regex and enriches findings with risk reasoning', async () => {
  const scanner = new HybridScanner();
  const text = 'Check out this AWS key AKIA1234567890ABCDEF and email dev@company.com';
  
  const result = await scanner.scan(text, { enableAi: false });
  assert.equal(result.hasSensitiveData, true);
  assert.equal(result.findings.length, 2);
  assert.equal(result.findings[0].category, 'api_key');
  assert.ok(result.findings[0].riskExplanation?.includes('AWS'));
  assert.ok(result.findings[0].recommendedAction?.length > 0);
});

test('HybridScanner reports a model load failure instead of claiming an AI scan succeeded', async () => {
  const manager = { getPipeline: async () => { throw new Error('Model files are missing'); } };
  const scanner = new HybridScanner(undefined, new AiClassifier(manager));
  await assert.rejects(scanner.scan('Contact alex@example.com'), /Model files are missing/);
});

test('local model joins adjacent first and last name tokens into one finding', async () => {
  const manager = { getPipeline: async () => async () => [
    { entity_group: 'FIRSTNAME', score: 0.96, word: 'Olivia', start: 0, end: 6 },
    { entity_group: 'LASTNAME', score: 0.93, word: 'Chen', start: 7, end: 11 }
  ] };
  const findings = await new AiClassifier(manager).classify('Olivia Chen');
  assert.equal(findings.length, 1);
  assert.equal(findings[0].rawText, 'Olivia Chen');
  assert.equal(findings[0].category, 'person_name');
});

test('hybrid scanner reports a full name as personal information without the model', async () => {
  const result = await new HybridScanner().scan('Patient: Olivia Chen', { enableAi: false });
  const name = result.findings.find(item => item.category === 'person_name');
  assert.equal(name?.rawText, 'Olivia Chen');
  assert.equal(name?.severity, 'medium');
});
