# TekaSend — Product Requirements Document (PRD)

**Tagline:** *Teka muna. Check bago send.*  
**Product Type:** Local-AI-Powered Chrome Extension (Manifest V3)  
**Target:** Hackathon MVP (AppBuildersPH 2026 — Local AI Track)  
**Core Principle:** Detect, explain, repair, and protect confidential data locally on-device before users submit it to online AI models or web services.

---

## 1. Product Overview

TekaSend is a zero-trust, privacy-preserving Chrome extension that intercepts sensitive information—such as API keys, authentication tokens, passwords, and Personally Identifiable Information (PII)—before it is sent across the internet to AI chatbots, search engines, and web forms.

By pairing an on-device neural transformer (`Shield-82M` via ONNX Runtime Web WASM) with sub-millisecond deterministic regex engines, TekaSend delivers real-time, zero-latency protection without transmitting user data to any external cloud server or remote API.

---

## 2. Problem Statement

With the rapid adoption of AI chatbots (ChatGPT, Claude, Gemini, DeepSeek, Cursor, Copilot), developers and professionals frequently paste logs, configuration files, source code, and customer records containing:
- **High-Risk Secrets:** OpenAI/Anthropic/AWS/GitHub API keys, private keys, database credentials, passwords, auth tokens.
- **Personally Identifiable Information (PII):** Full names, corporate email addresses, phone numbers, physical addresses, government IDs, and payment card numbers.

### The Cloud Privacy Paradox
Relying on cloud-based privacy scanners requires users to transmit their plaintext secrets to a third-party server, introducing secondary breach risks, compliance violations (GDPR, DPA), and network latency. TekaSend solves this by keeping all detection, reasoning, and sanitization 100% on the user's local machine.

---

## 3. Target Users

- **Software Developers & Engineers:** Pasting terminal outputs, environment variables, API configs, and code snippets into AI chat assistants.
- **Business Professionals & Students:** Drafting sensitive communications, entering personal details into public web forms, and interacting with generative AI.
- **Enterprise Workers:** Preventing accidental data leaks and maintaining internal compliance during web browsing and screen-sharing sessions.

---

## 4. Product Goals

1. **Sub-Millisecond Pre-Flight Detection:** Intercept sensitive data in active inputs and textareas in real-time as users type.
2. **Contextual Risk Reasoning:** Explain to the user *why* specific detected information is dangerous to share.
3. **1-Click Smart Privacy Repairs:** Provide format-preserving semantic placeholders and synthetic dummy text substitutions.
4. **Referential Consistency:** Ensure repeated occurrences of the same secret reuse the same identifier, while distinct entities receive sequential numbering (e.g. `[EMAIL_ADDRESS_1]`, `[EMAIL_ADDRESS_2]`).
5. **Zero-Trust Visual Page Masking:** Allow users to protect on-screen sensitive text via Blurs, Interactive Particle Spoilers, or Dummy values.
6. **100% Local Execution:** Operate completely offline with zero telemetry, zero cloud inference, and zero user account requirements.

---

## 5. Core Features

### F1. Data Awareness Notice & In-Field Indicator
- **Real-Time In-Field Shield:** An unobtrusive status shield rendered inside prompt boxes and inputs dynamically reflecting risk severity (Safe, Warning, Critical).
- **Sensitive Word Highlighting:** Non-intrusive, color-coded highlights rendered over sensitive words without altering input focus.
- **Contextual Risk Reasoning:** Educational guidance breaking down why masking is necessary and recommending concrete mitigation actions.

### F2. Smart Privacy Repair (1-Click Sanitization)
- **Semantic Placeholders:** Replaces secrets with safe category tokens (e.g., `[API_KEY]`, `[EMAIL_ADDRESS]`, `[PASSWORD]`).
- **Synthetic Dummy Scrambling:** Replaces sensitive strings with format-preserving dummy text.
- **Global & Individual Actions:** Supports both individual token repairs and one-click bulk sanitization (`Alt+P` for placeholders, `Alt+S` for scramble).

### F3. Local Verification & Bi-Directional Protection Manager
- **Zero-Leak Validation:** Verifies locally that all targeted secret strings have been eliminated before form submission.
- **Strategy Switching:** Allows users to toggle between Placeholder and Scramble strategies on active protected items.
- **Two-Way Restore & Undo:** Instant `Ctrl+Z` / `Cmd+Z` support to revert repairs and restore original content.

### F4. Visual Webpage Privacy Guardian
- **Passive Text Masking:** Automatically or manually masks sensitive page elements using:
  - *Blur:* Soft CSS focus blur.
  - *Particle Spoiler:* Dynamic WebGL/Canvas particle animation that scatters on hover.
  - *Placeholder:* Structural token replacement.
  - *Dummy:* Character-count-preserving dummy values.

### F5. Native iOS Settings Interface & User Control
- **Preferences & Toggles:** Per-category detection toggles (API Keys, Passwords, Personal, Financial).
- **Auto-Masking Controls:** Configurable default masking effects and hover tooltip visibility.
- **Appearance Customization:** Clean iOS-styled popup with system, light, and dark mode support.

---

## 6. Scope & Roadmap

### MVP Scope (Delivered)
- Chrome Manifest V3 extension with isolated Content Scripts, Background Worker, and Offscreen Document.
- 100% on-device neural inference using `Shield-82M` (ONNX WASM SIMD).
- Deterministic regex matcher for credentials, tokens, PII, and Philippine mobile numbers.
- In-field indicator, word highlighter micro-tooltips, and Data Awareness Notice card.
- 1-click semantic placeholders and synthetic scrambling with referential consistency.
- Real-time pre-flight verification and `Ctrl+Z` undo stack.
- Passive DOM text masking (Blur, Spoiler particles, Dummy substitution).
- Complete offline functionality with zero external API dependencies.

### Future Roadmap (Post-Hackathon)
- **On-Device Computer Vision:** Local OCR and image redaction for bounding-box masking on photos and screenshots.
- **Custom Regular Expressions:** User-defined custom secret patterns and enterprise DLP rules.
- **Cross-Browser Support:** Firefox and Safari extension ports.

---

## 7. Technical Specifications

| Component | Technology | Responsibility |
|---|---|---|
| **Extension Core** | Chrome Manifest V3, TypeScript | Lifecycle management, content script injection, Shadow DOM isolation |
| **Neural Classifier** | ONNX Runtime Web (`ort-wasm-simd-threaded.wasm`), `Shield-82M` | On-device contextual PII and ambiguous entity classification |
| **Offscreen Runtime** | Chrome Offscreen Document | Multi-threaded WASM execution offloading compute from the main thread |
| **Deterministic Engine** | TypeScript Regex & Heuristics | Sub-millisecond secret detection (API keys, JWTs, AWS keys, passwords, PII) |
| **UI Design System** | Native CSS Design Tokens | Clean iOS Settings design, glassmorphism, responsive light/dark themes |
| **Canvas Shaders** | HTML5 Canvas / 2D Context | High-performance particle spoiler rendering |

---

## 8. Success & Evaluation Criteria

1. **Detection Accuracy & Speed:** Deterministic rules trigger in `<0.1ms`; local neural classification executes in `<50ms`.
2. **Zero-Leak Guarantee:** 100% of targeted sensitive values are eliminated upon one-click repair.
3. **Referential Integrity:** Distinct entities receive sequential variable tags (`[EMAIL_ADDRESS_1]`, `[EMAIL_ADDRESS_2]`) while repeated mentions preserve identical placeholders.
4. **Complete Data Privacy:** Zero network packets transmitted during scanning, repair, or verification.
5. **Seamless User Experience:** Clean, responsive iOS interface that stays out of the user's way until confidential data is detected.

---

## 9. Product Definition Summary

> **TekaSend is a 100% on-device, zero-trust Chrome extension that empowers users to detect, understand, and sanitize confidential data before it leaks into cloud AI models, without relying on external cloud APIs or user accounts.**
