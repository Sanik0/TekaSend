#   

> **"Teka muna. Check bago send."** *(Hold on. Check before sending.)*  
> **AppBuildersPH Hackathon 2026 — Local AI Track Submission**  
> *A 100% on-device, zero-trust privacy guardian that intercepts confidential secrets, credentials, and personal data before they leak into cloud AI chatbots and web applications.*

---

## 📋 Hackathon Submission Overview

| Field | Details |
|---|---|
| **Project Name** | **TekaSend** *(From Filipino "Teka muna" [Hold on / Wait a second] + "Send")* |
| **Tagline** | *Teka muna. Check bago send.* |
| **Track** | Local AI (Privacy-Preserving Edge AI) |
| **Team Structure** | Team |
| **GitHub Repository** | [https://github.com/Sanik0/TekaSend](https://github.com/Sanik0/TekaSend) |
| **Core AI Execution** | 100% On-Device Local Inference (Zero Cloud AI API dependency) |

---

## 💡 Problem Statement

As AI chatbots and developer web tools (ChatGPT, Claude, Gemini, DeepSeek, Cursor, GitHub) become daily workflows, users constantly copy-paste code snippets, configs, logs, and messages containing:
- **API Keys & Credentials:** OpenAI (`sk-proj-`), GitHub (`ghp_`), AWS (`AKIA`), database connection strings, passwords.
- **Personally Identifiable Information (PII):** Full names, corporate emails, Philippine contact numbers (`0917...`), physical addresses, SSN/IDs, and financial cards.

### The Cloud Privacy Paradox:
When users rely on cloud-based privacy scanners, **they are forced to send their most sensitive plaintext secrets to another cloud server**, introducing secondary data breaches, compliance violations (GDPR/DPA), network latency, and recurring API costs.

---

## 🛡️ Brief Description & Solution

Inspired by the everyday Filipino expression *"Teka muna"* (wait a minute / hold on), **TekaSend** puts the *"Teka muna. Check bago send"* mindset into practice as an intelligent pre-flight privacy guard. 

It is an ultra-fast, zero-trust Chrome extension (Manifest V3) that provides **real-time data sanitization** directly inside input fields, textareas, and prompt boxes:

1. **Instant In-Field Highlight & Indicator:** Detects sensitive data with sub-millisecond deterministic rules and neural contextual classification.
2. **Data Awareness Notice (Why mask?):** Contextually educates users on the specific risk and impact of each detected entity.
3. **Smart 1-Click Privacy Repairs:**
   - **Semantic Placeholders:** Replaces secrets with format-safe tokens (e.g., `[API_KEY]`, `[EMAIL_ADDRESS]`, `[PASSWORD]`). Distinct entities receive sequential identifiers (`[EMAIL_ADDRESS_1]`, `[EMAIL_ADDRESS_2]`) while repeated mentions preserve referential integrity.
   - **Synthetic Dummy Scrambling:** Replaces values with realistic dummy text matching the exact format and structure.
4. **Passive Webpage Masking:** Protects on-screen text with interactive Blurs, Placeholders, or animated Canvas particle Spoilers.
5. **Two-Way Protection Manager & Undo:** Seamlessly switch between Placeholder and Scramble strategies, restore originals, or undo with `Ctrl+Z` / `Alt+P` / `Alt+S`.

---

## ⚡ Why Does This Product Benefit From Running AI Locally?

1. **Zero-Trust Privacy Guarantee:** Your secrets and confidential documents **never leave your device**. No cloud server or third-party ever receives or logs your plaintext input.
2. **Zero Network Latency (<1ms deterministic scan, fast neural inference):** Instant feedback as you type without waiting for external API round-trips.
3. **Complete Offline Resilience:** Functions seamlessly in air-gapped environments, on airplanes, or during internet disruptions.
4. **Zero Cloud Infrastructure & Token Costs:** Completely free to run with zero recurring API billing or compute quotas.

---

## 🛠️ Tools & Technologies

- **Architecture:** Chrome Manifest V3 Extension (Content Scripts, Background Service Worker, Offscreen Document, Shadow DOM).
- **Core Languages & Frameworks:** TypeScript, Vanilla CSS (Design Tokens), HTML5.
- **Runtime & Inference:** [ONNX Runtime Web](https://onnxruntime.ai/) (`ort-wasm-simd-threaded.wasm`) running in an isolated Chrome Offscreen Worker.
- **Build System:** `esbuild`, Node.js 20+, native Web APIs.
- **Testing:** Node.js native test runner (`node --test`), automated smoke test suite, TypeScript compiler verification (`tsc --noEmit`).

---

## 🧠 Models Used

| Model | Size | Architecture | Execution Mode | Purpose |
|---|---|---|---|---|
| **[Shield-82M](https://huggingface.co/onnx-community/Shield-82M-ONNX)** | ~82 MB (Quantized) | ONNX Transformer | On-Device WASM SIMD (Offscreen Document) | Contextual PII classification, ambiguous named-entity recognition, and sensitive category identification |
| **Deterministic Rule Engine** | Native Regex / Heuristics | Zero-memory AST/Regex Matcher | Synchronous In-Memory (<0.1ms) | Instant deterministic detection for API keys, AWS tokens, JWTs, emails, phone numbers, cards, and passwords |

---

## 🎨 Assets & UI Components

- **iOS-Inspired Design System:** Clean, native Apple Settings aesthetic (`public/popup.css`, `src/content/overlay/input-theme.ts`) with custom glassmorphism, responsive light/dark modes, and refined typography.
- **Vector Brand Assets:** High-resolution icons and vector shields (`public/icons/tekasend-logo-*.png`, inline SVG icons).
- **Canvas Spoiler Particle Shaders:** Custom multiline canvas particle spoiler rendering with smooth physics and reduced-motion accessibility support.
- **Interactive Live Demo Sandbox:** Full local test environment (`serve-demo.mjs`) simulating modern AI chatbot prompt interfaces.

---

## 🔍 Disclosures

- **What runs locally:** **100% of all AI inference, regex detection, token replacements, and UI rendering execute locally on the user's machine.**
- **What requires internet:** A one-time model download during initial setup (`npm run model:download`).
- **APIs & Cloud Services:** None. Zero external cloud AI APIs used.
- **AI Development Tools:** AI-assisted pair programming and code review (Antigravity IDE / Gemini).

---

## 🚀 Getting Started & Local Setup

### Prerequisites
- **Node.js 20+** installed
- **Google Chrome** (or Chromium-based browser)

### 1. Installation & Build

In your terminal / PowerShell:

```bash
# Clone repository
git clone https://github.com/Sanik0/TekaSend.git
cd TekaSend

# Install dependencies
npm install

# Download the Shield-82M quantized local model (one-time download into .local-model/)
npm run model:download

# Build the extension package into dist/
npm run build
```

### 2. Load into Chrome

1. Open Chrome and navigate to `chrome://extensions`.
2. Enable **Developer mode** in the top-right corner.
3. Click **Load unpacked** and select the `dist/` directory inside this project.
4. *(Recommended)* Under TekaSend's **Details**, set **Site access** to **On all sites** and enable **Allow access to file URLs** for local testing.

### 3. Run Live Interactive Demo

```bash
npm run demo
```

Open [http://127.0.0.1:8000/](http://127.0.0.1:8000/) in Chrome.
- Type or paste an API key (e.g. `sk-proj-1234567890abcdef...`) or email into the prompt box.
- Notice the inline TekaSend shield icon and the non-intrusive highlighted tokens.
- Click the shield or press `Alt+P` / `Alt+S` to test instant 1-click repairs!

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Alt + P` / `Option + P` | Instantly replace all detected secrets with Semantic Placeholders |
| `Alt + S` / `Option + S` | Instantly scramble all detected secrets with Synthetic Dummies |
| `Ctrl + Z` / `Cmd + Z` | Undo the last privacy repair and restore original field state |

---

## 🧪 Testing & Verification

```bash
# Run comprehensive test suite (32 unit & integration tests)
npm test

# Run end-to-end smoke verification pipeline
npm run smoke

# TypeScript type check
npm run typecheck
```

---

## 📄 License

MIT License. Developed for the **AppBuildersPH Hackathon 2026**.
