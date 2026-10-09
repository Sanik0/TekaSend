import assert from "node:assert/strict";
import { test, after } from "node:test";
import { build } from "esbuild";
import { unlink } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const tempFile = resolve("tests", ".temp-ai-subsystem.mjs");

await build({
  entryPoints: ["src/ai/index.ts"],
  bundle: true,
  format: "esm",
  outfile: tempFile,
  platform: "node",
  external: ["@huggingface/transformers"],
});

const {
  DeterministicRuleMatcher,
  ContextAnalyzer,
  RiskAnalyzer,
  AiClassifier,
  HybridScanner,
  PrivacyReplacer,
  LocalRepairVerifier,
} = await import(pathToFileURL(tempFile).href);

after(async () => {
  try {
    await unlink(tempFile);
  } catch {}
});

test("DeterministicRuleMatcher detects API keys, emails, passwords, phones, and street addresses accurately", () => {
  const matcher = new DeterministicRuleMatcher();
  const text =
    "Here is my key: sk-proj-1234567890abcdef123456, email test@example.com, phone 09171234567, and address 123 Oak Street";
  const findings = matcher.match(text);

  assert.equal(findings.length, 4);
  assert.equal(findings[0].category, "api_key");
  assert.equal(findings[0].severity, "critical");
  assert.equal(findings[1].category, "email");
  assert.equal(findings[2].category, "phone");
  assert.equal(findings[3].category, "address");
  assert.equal(findings[3].rawText, "123 Oak Street");
});

test("RiskAnalyzer provides tailored explanations and actions for API keys and credentials", () => {
  const riskAnalyzer = new RiskAnalyzer();
  const openAiRisk = riskAnalyzer.analyzeRisk(
    "api_key",
    "sk-proj-test12345678901234567890",
    "critical",
  );
  assert.ok(openAiRisk.explanation.includes("OpenAI"));
  assert.equal(openAiRisk.impactLevel, "critical");

  const pwRisk = riskAnalyzer.analyzeRisk(
    "password",
    "secretpass123",
    "critical",
  );
  assert.ok(pwRisk.explanation.includes("Plain-text passwords"));
});

test("ContextAnalyzer recognizes dummy/tutorial placeholders and detects structured containers", () => {
  const contextAnalyzer = new ContextAnalyzer();
  const fullText = '{"api_key": "user@example.com"}';

  // Evaluate email token
  const assessment = contextAnalyzer.evaluateContext(fullText, 13, 29, "email");
  assert.equal(assessment.isLikelyDummyOrSample, true);
  assert.equal(assessment.detectedContainerFormat, "json");
});

test("PrivacyReplacer cleanly replaces findings with semantic placeholders without index drift", () => {
  const matcher = new DeterministicRuleMatcher();
  const replacer = new PrivacyReplacer();

  const originalText =
    "Connect with sk-proj-1234567890abcdef123456 at user@example.com.";
  const findings = matcher.match(originalText);

  const repairResult = replacer.replace(
    originalText,
    findings,
    [],
    "semantic_placeholder",
  );

  // Since there is only 1 API key and 1 email, output clean unnumbered placeholders
  assert.equal(
    repairResult.sanitizedText,
    "Connect with [API_KEY] at [EMAIL_ADDRESS].",
  );
  assert.equal(repairResult.replacementsCount, 2);
});

test("LocalRepairVerifier passes when all secrets are removed and catches remaining leaks", () => {
  const matcher = new DeterministicRuleMatcher();
  const verifier = new LocalRepairVerifier();

  const originalText = "Secret key sk-proj-1234567890abcdef123456 leaked!";
  const findings = matcher.match(originalText);

  // Clean repaired text
  const cleanText = "Secret key [API_KEY] leaked!";
  const cleanVerification = verifier.verify(cleanText, findings);
  assert.equal(cleanVerification.isClean, true);
  assert.equal(cleanVerification.leakedFindings.length, 0);

  // Leaked text
  const leakedText = "Secret key sk-proj-1234567890abcdef123456 still here!";
  const dirtyVerification = verifier.verify(leakedText, findings);
  assert.equal(dirtyVerification.isClean, false);
  assert.equal(dirtyVerification.leakedFindings.length, 1);
});

test("HybridScanner combines deterministic regex and enriches findings with risk reasoning", async () => {
  const scanner = new HybridScanner();
  const text =
    "Check out this AWS key AKIA1234567890ABCDEF and email dev@company.com";

  const result = await scanner.scan(text, { enableAi: false });
  assert.equal(result.hasSensitiveData, true);
  assert.equal(result.findings.length, 2);
  assert.equal(result.findings[0].category, "api_key");
  assert.ok(result.findings[0].riskExplanation?.includes("AWS"));
  assert.ok(result.findings[0].recommendedAction?.length > 0);
});

test("Smart Privacy Repair supports one-click placeholder, scramble, and redact on input values", () => {
  const matcher = new DeterministicRuleMatcher();
  const replacer = new PrivacyReplacer();
  const verifier = new LocalRepairVerifier();

  const inputText =
    "Testing with password = SecretPass123! and phone 09175550123";
  const findings = matcher.match(inputText);

  // Strategy 1: Placeholder (clean unnumbered for single entity of each type)
  const placeholderRepair = replacer.replace(
    inputText,
    findings,
    [],
    "semantic_placeholder",
  );
  assert.equal(placeholderRepair.replacementsCount, 2);
  assert.ok(verifier.verify(placeholderRepair.sanitizedText, findings).isClean);

  // Strategy 2: Scramble / Dummy
  const dummyRepair = replacer.replace(
    inputText,
    findings,
    [],
    "synthetic_dummy",
  );
  assert.equal(dummyRepair.replacementsCount, 2);
  assert.ok(verifier.verify(dummyRepair.sanitizedText, findings).isClean);

  // Strategy 3: Redact
  const redactRepair = replacer.replace(
    inputText,
    findings,
    [],
    "solid_redact",
  );
  assert.equal(redactRepair.replacementsCount, 2);
  assert.ok(verifier.verify(redactRepair.sanitizedText, findings).isClean);
});

test("Repaired placeholders and scrambled dummies do not re-trigger false positive findings in rule matcher", () => {
  const matcher = new DeterministicRuleMatcher();
  const replacer = new PrivacyReplacer();

  const originalInput =
    "My OpenAI API key is sk-proj-1234567890abcdef123456 and email is contact@mycompany.org";
  const initialFindings = matcher.match(originalInput);
  assert.equal(initialFindings.length, 2);

  // 1. Placeholder repair (clean unnumbered for single entities)
  const placeholderResult = replacer.replace(
    originalInput,
    initialFindings,
    [],
    "semantic_placeholder",
  );
  assert.equal(
    placeholderResult.sanitizedText,
    "My OpenAI API key is [API_KEY] and email is [EMAIL_ADDRESS]",
  );
  const afterPlaceholderFindings = matcher.match(
    placeholderResult.sanitizedText,
  );
  assert.equal(
    afterPlaceholderFindings.length,
    0,
    "Placeholder output must be 100% clean of sensitive findings",
  );

  // 2. Scramble / Dummy repair
  const scrambleResult = replacer.replace(
    originalInput,
    initialFindings,
    [],
    "synthetic_dummy",
  );
  assert.ok(scrambleResult.sanitizedText.includes("sk-proj-DEMO_KEY_"));
  assert.ok(
    scrambleResult.sanitizedText.includes("user_demo@masked-test-domain.net"),
  );
  const afterScrambleFindings = matcher.match(scrambleResult.sanitizedText);
  assert.equal(
    afterScrambleFindings.length,
    0,
    "Scrambled dummy output must not trigger false positive detector alerts",
  );
});

test("Real-time scanning accurately categorizes Critical vs Medium risk across multi-paragraph prompts", () => {
  const matcher = new DeterministicRuleMatcher();

  const multiParagraphPrompt = `
First paragraph with some context for the LLM.
Here is an email address: sarah.connor@cyberdyne.systems

Second paragraph with sensitive authentication:
sk-proj-9876543210fedcba9876543210fedcba

Third paragraph with another confidential detail:
password = "SuperSecretDbPassword2026!"
And phone number: 09181234567
  `.trim();

  const findings = matcher.match(multiParagraphPrompt);

  assert.equal(findings.length, 4);

  // Check critical vs medium classification
  const criticalFindings = findings.filter((f) => f.severity === "critical");
  const mediumFindings = findings.filter((f) => f.severity === "medium");

  assert.equal(
    criticalFindings.length,
    2,
    "API key and password must be categorized as critical severity",
  );
  assert.equal(
    mediumFindings.length,
    2,
    "Email and phone must be categorized as medium severity",
  );

  // Verify critical findings are the API key and password
  assert.ok(criticalFindings.some((f) => f.category === "api_key"));
  assert.ok(criticalFindings.some((f) => f.category === "password"));

  // Verify medium findings are email and phone
  assert.ok(mediumFindings.some((f) => f.category === "email"));
  assert.ok(mediumFindings.some((f) => f.category === "phone"));
});

test("Protection re-transformation supports seamless switching between Placeholder, Scramble, and Restore", () => {
  const matcher = new DeterministicRuleMatcher();
  const replacer = new PrivacyReplacer();

  const originalSecret = "sk-proj-1234567890abcdef123456";
  const initialText = `Check my key ${originalSecret} in production.`;
  const initialFindings = matcher.match(initialText);

  assert.equal(initialFindings.length, 1);

  // 1. Initial repair: Placeholder (single entity -> clean unnumbered [API_KEY])
  const placeholderRepair = replacer.replace(
    initialText,
    initialFindings,
    [],
    "semantic_placeholder",
  );
  assert.equal(
    placeholderRepair.sanitizedText,
    "Check my key [API_KEY] in production.",
  );

  // 2. Switch strategy: Scramble
  const finding = initialFindings[0];
  const scrambleToken = replacer.replace(
    originalSecret,
    [{ ...finding, start: 0, end: originalSecret.length }],
    [],
    "synthetic_dummy",
  ).sanitizedText;
  const switchedToScramble = placeholderRepair.sanitizedText.replace(
    "[API_KEY]",
    scrambleToken,
  );
  assert.ok(switchedToScramble.includes("sk-proj-DEMO_KEY_"));

  // 3. Switch back to Placeholder
  const switchedBackToPlaceholder = switchedToScramble.replace(
    scrambleToken,
    "[API_KEY]",
  );
  assert.equal(
    switchedBackToPlaceholder,
    "Check my key [API_KEY] in production.",
  );

  // 4. Restore original
  const restoredText = switchedBackToPlaceholder.replace(
    "[API_KEY]",
    originalSecret,
  );
  assert.equal(restoredText, initialText);

  const restoredFindings = matcher.match(restoredText);
  assert.equal(restoredFindings.length, 1);
  assert.equal(restoredFindings[0].rawText, originalSecret);
});

test("Referential consistency ensures distinct entities get sequential variables and repeated mentions reuse variables", () => {
  const matcher = new DeterministicRuleMatcher();
  const replacer = new PrivacyReplacer();

  const narrativePrompt = `
User alice@company.com sent an invoice to bob@client.com.
Please write an email from alice@company.com to bob@client.com.
Also notify security at alerts@company.com.
  `.trim();

  const findings = matcher.match(narrativePrompt);
  assert.equal(findings.length, 5, "Must detect 5 email occurrences");

  // Test Semantic Placeholder Consistency:
  // alice@company.com -> [EMAIL_ADDRESS_1]
  // bob@client.com -> [EMAIL_ADDRESS_2]
  // alerts@company.com -> [EMAIL_ADDRESS_3]
  const placeholderResult = replacer.replace(
    narrativePrompt,
    findings,
    [],
    "semantic_placeholder",
  );
  assert.equal(
    placeholderResult.sanitizedText,
    `
User [EMAIL_ADDRESS_1] sent an invoice to [EMAIL_ADDRESS_2].
Please write an email from [EMAIL_ADDRESS_1] to [EMAIL_ADDRESS_2].
Also notify security at [EMAIL_ADDRESS_3].
    `.trim(),
  );

  // Test Synthetic Dummy (Scramble) Consistency:
  // alice@company.com -> user_1_demo@masked-test-domain.net
  // bob@client.com -> user_2_demo@masked-test-domain.net
  // alerts@company.com -> user_3_demo@masked-test-domain.net
  const scrambleResult = replacer.replace(
    narrativePrompt,
    findings,
    [],
    "synthetic_dummy",
  );
  assert.equal(
    scrambleResult.sanitizedText,
    `
User user_1_demo@masked-test-domain.net sent an invoice to user_2_demo@masked-test-domain.net.
Please write an email from user_1_demo@masked-test-domain.net to user_2_demo@masked-test-domain.net.
Also notify security at user_3_demo@masked-test-domain.net.
    `.trim(),
  );
});

test("One-by-one repair maintains global numbering and referential consistency across distinct entities", () => {
  const matcher = new DeterministicRuleMatcher();
  const replacer = new PrivacyReplacer();

  const text =
    "Contact alice@company.com or bob@company.com. Then message alice@company.com again.";
  const initialFindings = matcher.match(text);
  assert.equal(initialFindings.length, 3); // 2 alice, 1 bob

  // Step 1: Replace alice@company.com one-by-one with Placeholder
  const aliceFindings = initialFindings.filter(
    (f) => f.rawText === "alice@company.com",
  );
  const step1 = replacer.replace(
    text,
    aliceFindings,
    [],
    "semantic_placeholder",
    [],
    initialFindings, // pass all context findings
  );

  assert.equal(
    step1.sanitizedText,
    "Contact [EMAIL_ADDRESS_1] or bob@company.com. Then message [EMAIL_ADDRESS_1] again.",
  );

  // Step 2: Replace bob@company.com one-by-one with Placeholder
  const intermediateFindings = matcher.match(step1.sanitizedText);
  const bobFindings = intermediateFindings.filter(
    (f) => f.rawText === "bob@company.com",
  );
  const existingEntities = [
    {
      category: "email",
      rawText: "alice@company.com",
      currentToken: "[EMAIL_ADDRESS_1]",
      entityIndex: 1,
      currentStrategy: "semantic_placeholder",
    },
  ];

  const step2 = replacer.replace(
    step1.sanitizedText,
    bobFindings,
    [],
    "semantic_placeholder",
    existingEntities,
    intermediateFindings,
  );

  assert.equal(
    step2.sanitizedText,
    "Contact [EMAIL_ADDRESS_1] or [EMAIL_ADDRESS_2]. Then message [EMAIL_ADDRESS_1] again.",
  );
});

test("Single entity with multiple mentions stays clean unnumbered", () => {
  const matcher = new DeterministicRuleMatcher();
  const replacer = new PrivacyReplacer();

  const text = "Send email to team@company.com or write to team@company.com.";
  const findings = matcher.match(text);
  assert.equal(findings.length, 2);

  const result = replacer.replace(text, findings, [], "semantic_placeholder");
  assert.equal(
    result.sanitizedText,
    "Send email to [EMAIL_ADDRESS] or write to [EMAIL_ADDRESS].",
  );
});

test("Entity upgrade promotes unnumbered placeholder to _1 when a second distinct entity is introduced", () => {
  const matcher = new DeterministicRuleMatcher();
  const replacer = new PrivacyReplacer();

  // Initially only alice existed -> was replaced as [EMAIL_ADDRESS]
  const textWithBob =
    "Contact [EMAIL_ADDRESS] and new teammate dev@company.com.";
  const findings = matcher.match(textWithBob);
  assert.equal(findings.length, 1); // only dev@company.com is detected

  const existingEntities = [
    {
      category: "email",
      rawText: "alice@company.com",
      currentToken: "[EMAIL_ADDRESS]",
      entityIndex: 1,
      currentStrategy: "semantic_placeholder",
    },
  ];

  const result = replacer.replace(
    textWithBob,
    findings,
    [],
    "semantic_placeholder",
    existingEntities,
    findings,
  );

  assert.equal(
    result.sanitizedText,
    "Contact [EMAIL_ADDRESS_1] and new teammate [EMAIL_ADDRESS_2].",
  );
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

test('local model joins compound name tokens with particles into one finding', async () => {
  const manager = { getPipeline: async () => async () => [
    { entity_group: 'FIRSTNAME', score: 0.95, word: 'Juan', start: 0, end: 4 },
    { entity_group: 'LASTNAME', score: 0.92, word: 'Cruz', start: 10, end: 14 }
  ] };
  const findings = await new AiClassifier(manager).classify('Juan dela Cruz');
  assert.equal(findings.length, 1);
  assert.equal(findings[0].rawText, 'Juan dela Cruz');
  assert.equal(findings[0].category, 'person_name');
});

test('HybridScanner strictly excludes capitalized UI text while preserving personal names', async () => {
  const scanner = new HybridScanner();
  const text = 'Click Submit Button on Next Step. Meeting with Dr. Michael Brown and Maria dela Cruz regarding the Privacy Policy.';
  const result = await scanner.scan(text, { enableAi: false });
  const nameTexts = result.findings.filter(f => f.category === 'person_name').map(f => f.rawText);
  assert.deepEqual(nameTexts, ['Michael Brown', 'Maria dela Cruz']);
});
