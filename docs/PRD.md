# TekaSend — Product Requirements Document (PRD)

_Tagline:_ Teka muna. Check bago send.

_Product type:_ Local-AI-powered Chrome extension  
_Target:_ Hackathon MVP  
_Primary principle:_ Detect, explain, repair, and protect sensitive information locally before users share it.

## 1. Product Overview

TekaSend is a privacy-focused Chrome extension that helps users prevent accidental disclosure of sensitive information when interacting with websites, AI chatbots, online forms, and visual content.

It combines local AI classification, deterministic detection rules, context-aware text repair, user-selected visual redaction, and pre-sharing verification.

TekaSend does not require user accounts, a backend server, or cloud AI inference for its core functionality.

## 2. Problem Statement

Users frequently paste API keys, credentials, personal information, and confidential text into online tools without realizing the risks. They may also expose private information in screenshots, website components, or screen-sharing sessions.

Existing warnings may identify potential risks without providing a convenient way to repair the content.

TekaSend addresses this problem by helping users understand the risk, correct the content, and review the result before sharing.

## 3. Target Users

- Developers sharing code with AI chatbots.
- Students and professionals using online forms and AI tools.
- Employees sharing screenshots, dashboards, or confidential business information.

## 4. Product Goals

1. Detect supported sensitive information before submission.
2. Explain why the detected information may be risky.
3. Help users replace sensitive values while preserving useful context.
4. Let users select website elements and image regions for visual protection.
5. Verify proposed text repairs locally before user approval.
6. Demonstrate genuine on-device AI inference without cloud AI APIs.

## 5. Core Features

### F1. Data Awareness Notice

Detect potentially sensitive content in supported text fields before submission.

Detection uses:

- Deterministic rules for recognizable credentials, API keys, email addresses, phone numbers, and other supported patterns.
- An on-device AI classifier for contextual assessment of potentially confidential text.

The warning identifies the suspected category, explains the potential risk, and offers appropriate next steps.

Detection is advisory and is not guaranteed to identify every sensitive value.

### F2. Smart Privacy Repair

Offer user-approved replacements for detected sensitive values.

Supported repair strategies:

- _Semantic placeholders:_ For example, replace an actual API key with YOUR_API_KEY.
- _Clearly labeled dummy values:_ Use obvious test values where appropriate, ensuring they cannot be mistaken for working credentials or genuine personal information.
- _Consistent placeholders:_ Use the same placeholder for repeated references to the same detected entity where supported.

The extension must preview changes and preserve surrounding content wherever possible.

### F3. Local Repair Verification

Before the user sends the repaired text, verify the proposed output.

The verification process checks:

- Whether the exact detected sensitive values have been removed from the proposed outgoing text.
- Whether the intended replacements were applied correctly.
- Whether the surrounding content has been preserved sufficiently for review.
- Whether additional detected sensitive values remain.

Use deterministic checks for exact-value removal and replacement integrity. AI may assist with contextual assessment but must not be the sole authority for declaring content safe.

Display the verification result and its limitations. Never claim that an entire message is safe solely because the targeted values were removed.

### F4. Visual Privacy Guardian

Let users protect sensitive visual information before sharing.

Supported actions:

- Select supported website elements, such as visible text blocks, images, or profile pictures.
- Manually select rectangular regions within an image.
- Apply blur or solid redaction.
- Preview and confirm the result before sharing or exporting a sanitized image.

Use solid redaction for high-risk information such as credentials and account numbers.

For exported images, apply redaction to the actual output pixels rather than relying on a reversible overlay. Do not claim that visual masking removes the underlying information from the original website or from screenshots already captured.

### F5. User-Controlled Protection

Let users choose which supported detection categories to enable and which visual elements or regions to protect.

Users must be able to review, edit, approve, or cancel proposed changes.

TekaSend must never silently replace content or submit a modified message without explicit user approval.

## 6. Primary User Workflows

### Text protection

1. The user types or pastes text into a supported website field.
2. TekaSend scans the supported content locally.
3. If a potential risk is detected, the extension displays a warning and explanation.
4. The user selects a suggested placeholder or dummy-value repair.
5. TekaSend previews the modified text and verifies the targeted replacement.
6. The user approves, edits, or cancels the proposed changes.
7. The user submits the approved content through the supported website workflow.

### Visual protection

1. The user selects a website element or image region.
2. The user chooses blur or solid redaction.
3. TekaSend previews the protected result.
4. The user confirms the change or cancels it.
5. The user shares the protected webpage or exports the sanitized image, as supported.

## 7. Local-AI and Privacy Requirements

- Run the text classifier on the user's device.
- Perform deterministic detection, repair, and verification locally.
- Do not send scanned text, images, or detection results to a remote AI service.
- Do not require a user account or application backend.
- Do not store raw sensitive content in logs or persistent storage.
- Request only the browser permissions necessary for supported functionality.
- Never inspect password-field contents.
- Clearly communicate unsupported websites, model limitations, and detection failures.
- Handle model-loading failures without silently treating content as safe.

Model weights may need to be downloaded initially. If the hackathon requires full offline installation, the model must be packaged locally or otherwise made available without a runtime network dependency. The core workflow must not rely on remote inference.

## 8. MVP Scope and Constraints

### In scope

- Chrome Manifest V3 extension.
- Supported text-field monitoring and pre-submission warnings.
- Rule-based detection for common sensitive patterns.
- A genuine on-device AI text classifier.
- Placeholder and dummy-value replacement.
- Local verification of targeted repairs.
- Manual website-element and image-region selection.
- Blur and solid redaction.
- Review and approval before changes are applied or content is shared.
- A repeatable live demonstration.

### Out of scope

- User accounts, subscriptions, and cloud dashboards.
- Cloud AI inference or remote content-scanning APIs.
- Automatic detection of every sensitive value, image, or website component.
- Universal compatibility with every website and custom editor.
- Training a large AI model from scratch.
- Automatic submission without user approval.
- Guaranteed protection against all information disclosure.

## 9. Technical Direction

- _Extension platform:_ Chrome Manifest V3.
- _Application code:_ JavaScript or TypeScript.
- _Interface:_ HTML, CSS, and JavaScript or TypeScript.
- _Pattern detection:_ Local regular expressions and validation rules.
- _AI inference:_ A compatible browser-based classifier, such as one implemented with Transformers.js, subject to testing.
- _Storage:_ Minimal local settings only.
- _Visual redaction:_ Browser DOM interaction and canvas-based image processing where appropriate.

The implementation must support a limited, tested set of websites and fields rather than promise universal coverage.

## 10. Success Criteria

The MVP is considered complete when the team can demonstrate:

1. A supported sensitive-text example triggering a warning.
2. Genuine local AI inference on the device.
3. Successful placeholder replacement with the surrounding content preserved.
4. Verification that targeted sensitive values no longer appear in the proposed outgoing text.
5. Successful manual selection and redaction of a visual region.
6. User approval before modified content is submitted or exported.
7. No transmission of scanned content to a remote AI service.
8. Reliable execution of the complete demonstration.

Evaluate the system using fictional test data, including both sensitive and harmless examples. Record detection precision, recall, false positives, repair success, and inference time where feasible.

## 11. Product Differentiation

TekaSend's intended contribution is a cohesive local-first privacy workflow that combines contextual detection, explainable warnings, context-preserving repair, targeted verification, and user-controlled visual protection.

Individual capabilities may already exist in competing products. Do not claim that the product is the first of its kind without evidence.

The team should demonstrate measurable quality, reliable implementation, and the practical benefits of keeping sensitive-content analysis on-device.

## 12. Final Product Definition

_TekaSend is a local-AI-powered Chrome extension that helps users detect, understand, repair, and visually protect sensitive information before sharing it online, without relying on cloud AI inference or requiring an account._

_Product principle:_ Teka muna. Check bago send.
