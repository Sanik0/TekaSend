import { detect, type Finding } from './detect';
import { createDummyText } from './dummy';
import { RiskAnalyzer } from './ai/reasoning/risk-analyzer.js';
import type { FindingCategory } from './ai/types.js';
import { SpoilerRenderer } from './spoiler.js';
import { DEFAULT_EFFECT, isEffect, type Effect } from './shared/effects.js';
import { DeterministicRuleMatcher } from './ai/detectors/regex-rules.js';
import { PrivacyReplacer } from './ai/repair/replacer.js';
import type { SensitiveFinding, RepairStrategyType } from './ai/types.js';
import { InputObserver, type FieldChangeEvent } from './content/observer/input-observer.js';
import { InputIndicatorOverlay, type ProtectedItem } from './content/overlay/input-indicator.js';
import { InputHighlighter } from './content/overlay/input-highlighter.js';

type Action = Effect | 'restore';
type DetectionCategory = 'apiKey' | 'password' | 'personal' | 'financial';
type DisplayFinding = Finding & { category?: FindingCategory };
type Target = { kind: 'text'; element: HTMLElement };

const originalText = new WeakMap<HTMLElement, DocumentFragment>();
// Session storage for protected items per input field
const elementProtectedMap = new WeakMap<HTMLElement, ProtectedItem[]>();

function getProtectedItems(element: HTMLElement): ProtectedItem[] {
  return elementProtectedMap.get(element) || [];
}

function setProtectedItems(element: HTMLElement, items: ProtectedItem[]): void {
  elementProtectedMap.set(element, items);
}

function addOrUpdateProtectedItem(element: HTMLElement, item: ProtectedItem): void {
  const current = getProtectedItems(element).filter(
    (p) => p.id !== item.id && p.originalRawText !== item.originalRawText
  );
  current.push(item);
  elementProtectedMap.set(element, current);
}

function removeProtectedItem(element: HTMLElement, itemId: string): void {
  const current = getProtectedItems(element).filter((p) => p.id !== itemId);
  elementProtectedMap.set(element, current);
}

const ruleMatcher = new DeterministicRuleMatcher();
const privacyReplacer = new PrivacyReplacer();


const riskAnalyzer = new RiskAnalyzer();

let scanTimer = 0;
let aiScanned = false;
let aiError = '';
let aiSettingsTimer = 0;
let selectedEffect: Effect = DEFAULT_EFFECT;
let hideByDefault = false;
let showHoverTooltip = true;
const categoryKeys: DetectionCategory[] = ['apiKey', 'password', 'personal', 'financial'];
const storageCategoryKey = (category: DetectionCategory): string => `enable${category[0].toUpperCase()}${category.slice(1)}`;
const enabledCategories: Record<DetectionCategory, boolean> = {
  apiKey: true,
  password: true,
  personal: true,
  financial: true
};

function detectionCategory(type: string, modelCategory?: FindingCategory): DetectionCategory {
  if (modelCategory) {
    if (modelCategory === 'api_key' || modelCategory === 'private_key' || modelCategory === 'bearer_token') return 'apiKey';
    if (modelCategory === 'password') return 'password';
    if (modelCategory === 'credit_card' || modelCategory === 'ssn') return 'financial';
    return 'personal';
  }
  const label = type.toLowerCase();
  if (/credit|card|ssn|financial|tax|government|bank account/.test(label)) return 'financial';
  if (/api|token|private key|bearer|auth key|secret key/.test(label)) return 'apiKey';
  if (/password|passwd|pwd|credential|secret/.test(label)) return 'password';
  return 'personal';
}

function categoryEnabled(type: string, modelCategory?: FindingCategory): boolean {
  return enabledCategories[detectionCategory(type, modelCategory)];
}

const style = document.createElement('style');
style.textContent = `
  .pl-finding { cursor:pointer!important; border:none!important; border-radius:0!important; box-shadow:none!important; box-decoration-break:clone!important; -webkit-box-decoration-break:clone!important; }
  .pl-finding.pl-high { background:#ffd8dc!important; color:#4a1b24!important; }
  .pl-finding.pl-medium { background:#fff0b8!important; color:#514000!important; }
  .pl-finding.pl-spoiler {
    background-color:#f9f9fa!important;
    background-image:none!important;
  }
  .pl-finding.pl-spoiler, .pl-finding.pl-spoiler * {
    color:transparent!important;
    -webkit-text-fill-color:transparent!important;
    text-shadow:none!important;
    text-decoration-color:transparent!important;
  }
  .pl-finding.pl-spoiler { filter:none!important; user-select:none!important; }
  .pl-finding.pl-spoiler * { background-color:transparent!important; background-image:none!important; }
  .pl-finding.pl-blur { background:transparent!important; color:inherit!important; filter:blur(5px)!important; user-select:none!important; }
  .pl-finding.pl-blur .pl-finding { background:transparent!important; }
  .pl-finding.pl-masked { background:#191d27!important; color:white!important; padding:0 3px!important; }
  .pl-finding.pl-dummy { background:transparent!important; color:inherit!important; padding:0!important; }
`;
(document.head || document.documentElement).append(style);

const host = document.createElement('div');
host.setAttribute('data-privacy-lens-ui', '');
host.style.cssText = 'position:fixed;z-index:2147483647;inset:0;pointer-events:none';
document.documentElement.append(host);
const shadow = host.attachShadow({ mode: 'closed' });

const uiStyle = document.createElement('style');
uiStyle.textContent = `
  * { box-sizing:border-box; }
  .spoiler-canvas { position:fixed; inset:0; width:100vw; height:100vh; pointer-events:none; z-index:0; }
  .bubble { position:fixed; z-index:1; width:min(320px, calc(100vw - 16px)); padding:19px 21px 20px; background:#3d3a48; color:#f8f7fb; border-radius:17px; box-shadow:0 10px 26px #24212e3d; font:13px/1.55 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; visibility:hidden; opacity:0; transform:translateY(var(--enter-y, 6px)) scale(.98); transition:opacity 160ms ease,transform 220ms cubic-bezier(.2,.8,.2,1),visibility 0s linear 220ms; pointer-events:none; }
  .bubble.below { --enter-y:-6px; }
  .bubble.show { visibility:visible; opacity:1; transform:translateY(0) scale(1); transition-delay:0s; }
  .bubble::after { content:""; position:absolute; left:var(--pointer-x, 50%); bottom:-10px; transform:translateX(-50%); border-left:10px solid transparent; border-right:10px solid transparent; border-top:11px solid #3d3a48; }
  .bubble.below::after { top:-10px; bottom:auto; border-top:0; border-bottom:11px solid #3d3a48; }
  .brand { display:flex; align-items:center; gap:8px; margin-bottom:6px; color:#fff; font-size:13px; font-weight:700; }
  .brand-icon { display:grid; place-items:center; width:19px; height:19px; border:2px solid #a9a5ff; border-radius:50%; color:#b8b4ff; font-size:12px; font-weight:750; line-height:1; }
  .copy { color:#dedbe6; overflow-wrap:anywhere; }
  .notice { pointer-events:none; }
  .hint { width:min(260px, calc(100vw - 16px)); padding:11px 13px 12px; border-radius:12px; font-size:11px; line-height:1.4; }
  .hint .brand { font-size:11px; gap:6px; margin-bottom:4px; }
  .hint .brand-icon { width:15px; height:15px; border-width:1.5px; font-size:10px; }
  @media (prefers-reduced-motion:reduce) { .bubble { transition:none; } }
`;
shadow.append(uiStyle);
const spoiler = new SpoilerRenderer(shadow);

const brand = document.createElement('div');
brand.className = 'brand';
const brandIcon = document.createElement('span');
brandIcon.className = 'brand-icon';
brandIcon.textContent = 'i';
brand.append(brandIcon, document.createTextNode('TekaSend'));
const notice = document.createElement('div');
notice.className = 'bubble notice';
notice.setAttribute('role', 'status');
const noticeBrand = brand.cloneNode(true);
const noticeCopy = document.createElement('div');
noticeCopy.className = 'copy';
notice.append(noticeBrand, noticeCopy);
shadow.append(notice);

const hint = document.createElement('div');
hint.className = 'bubble hint';
hint.setAttribute('role', 'tooltip');
const hintCopy = document.createElement('div');
hintCopy.className = 'copy';
hint.append(brand.cloneNode(true), hintCopy);
shadow.append(hint);

function applyFieldRepair(
  element: HTMLElement,
  finding: SensitiveFinding,
  strategy: RepairStrategyType,
): void {
  const currentText = inputObserver.extractFieldText(element);
  if (!currentText) return;

  // 1. Get all currently detected findings across the full input text
  const allCurrentFindings = ruleMatcher.match(currentText);
  // 2. Get existing protected items for this element
  const protectedList = getProtectedItems(element);

  // 3. Find all occurrences matching finding.rawText so all instances of the same entity are sanitized consistently
  const targetOccurrences = allCurrentFindings.filter(
    (f) => f.rawText === finding.rawText,
  );
  const targetFindings =
    targetOccurrences.length > 0 ? targetOccurrences : [finding];

  // 4. Run replacer with full context of active findings & existing protected items
  const repair = privacyReplacer.replace(
    currentText,
    targetFindings,
    targetFindings.map((f) => ({ findingId: f.id, strategy })),
    strategy,
    protectedList,
    allCurrentFindings,
  );

  const sanitizedText = repair.sanitizedText;
  inputObserver.setFieldText(element, sanitizedText);

  // 5. Get the actual assigned replacement token from the replacementMap
  const replacementToken =
    repair.replacementMap.get(finding.rawText) ||
    privacyReplacer.generateReplacement(finding, strategy, 0);

  const assignedEntityIndex =
    repair.rawToEntityIndexMap?.get(finding.rawText) ?? 1;

  addOrUpdateProtectedItem(element, {
    id: finding.id,
    category: finding.category,
    label: finding.label,
    originalRawText: finding.rawText,
    currentToken: replacementToken,
    currentStrategy: strategy,
    entityIndex: assignedEntityIndex,
  });

  // Also update any other protected items that were upgraded (e.g. from [EMAIL_ADDRESS] to [EMAIL_ADDRESS_1])
  for (const item of protectedList) {
    if (repair.replacementMap.has(item.originalRawText)) {
      const updatedToken = repair.replacementMap.get(item.originalRawText)!;
      const updatedIdx =
        repair.rawToEntityIndexMap?.get(item.originalRawText) ??
        item.entityIndex;
      addOrUpdateProtectedItem(element, {
        ...item,
        currentToken: updatedToken,
        entityIndex: updatedIdx,
      });
    }
  }

  // 6. Instant re-scan updated text and update in-field indicator and highlights
  const newFindings = ruleMatcher.match(sanitizedText);
  const bounds = element.getBoundingClientRect();
  const updatedProtectedList = getProtectedItems(element);
  inputIndicator.update(element, newFindings, bounds, updatedProtectedList);
  inputHighlighter.update(element, newFindings);
}

// Initialize In-Field Sensitive Word Highlighter (Light iOS-Style Tint & Micro-Tooltip)
const inputHighlighter = new InputHighlighter(
  shadow,
  (element, finding, strategy) => {
    applyFieldRepair(element, finding, strategy);
  },
);

// Initialize In-Field Privacy Indicator Overlay (PRD F1, F2, F3)
const inputIndicator = new InputIndicatorOverlay(shadow, {
  onApplyRepair: (element, finding, strategy) => {
    applyFieldRepair(element, finding, strategy);
  },
  onApplyRepairAll: (element, strategy) => {
    const currentText = inputObserver.extractFieldText(element);
    if (!currentText) return;

    const findings = ruleMatcher.match(currentText);
    const protectedList = getProtectedItems(element);
    const repair = privacyReplacer.replace(
      currentText,
      findings,
      [],
      strategy,
      protectedList,
      findings,
    );
    const sanitizedText = repair.sanitizedText;

    inputObserver.setFieldText(element, sanitizedText);

    for (const finding of findings) {
      const replacementToken =
        repair.replacementMap.get(finding.rawText) ||
        privacyReplacer.generateReplacement(finding, strategy, 0);

      const assignedEntityIndex =
        repair.rawToEntityIndexMap?.get(finding.rawText) ?? 1;

      addOrUpdateProtectedItem(element, {
        id: finding.id,
        category: finding.category,
        label: finding.label,
        originalRawText: finding.rawText,
        currentToken: replacementToken,
        currentStrategy: strategy,
        entityIndex: assignedEntityIndex,
      });
    }

    const newFindings = ruleMatcher.match(sanitizedText);
    const bounds = element.getBoundingClientRect();
    const updatedProtectedList = getProtectedItems(element);
    inputIndicator.update(element, newFindings, bounds, updatedProtectedList);
    inputHighlighter.update(element, newFindings);
  },
  onSwitchStrategy: (element, item, newStrategy) => {
    const currentText = inputObserver.extractFieldText(element);
    if (!currentText) return;

    const protectedList = getProtectedItems(element);
    const activeFindings = ruleMatcher.match(currentText);
    const distinctInCat = new Set<string>();
    for (const p of protectedList) {
      if (p.category === item.category) distinctInCat.add(p.originalRawText);
    }
    for (const f of activeFindings) {
      if (f.category === item.category) distinctInCat.add(f.rawText);
    }
    const totalDistinct = distinctInCat.size;
    const entityIndex = totalDistinct > 1 ? (item.entityIndex || 1) : 0;

    const dummyFinding = {
      id: item.id,
      label: item.label,
      category: item.category,
      rawText: item.originalRawText,
      start: 0,
      end: item.originalRawText.length,
      severity: "critical" as const,
      source: "regex_rule" as const,
      confidence: 1.0,
      suggestedReplacement: `YOUR_${item.category.toUpperCase()}`,
    };

    const newToken = privacyReplacer.generateReplacement(
      dummyFinding,
      newStrategy,
      entityIndex,
    );

    const updatedText = currentText.includes(item.currentToken)
      ? currentText.split(item.currentToken).join(newToken)
      : currentText;

    inputObserver.setFieldText(element, updatedText);

    addOrUpdateProtectedItem(element, {
      ...item,
      currentToken: newToken,
      currentStrategy: newStrategy,
      entityIndex: item.entityIndex ?? (totalDistinct > 1 ? entityIndex : 1),
    });

    const newFindings = ruleMatcher.match(updatedText);
    const bounds = element.getBoundingClientRect();
    const updatedList = getProtectedItems(element);
    inputIndicator.update(element, newFindings, bounds, updatedList);
    inputHighlighter.update(element, newFindings);
  },
  onRestoreOriginal: (element, item) => {
    const currentText = inputObserver.extractFieldText(element);
    if (!currentText) return;

    const restoredText = currentText.includes(item.currentToken)
      ? currentText.split(item.currentToken).join(item.originalRawText)
      : currentText;

    inputObserver.setFieldText(element, restoredText);
    removeProtectedItem(element, item.id);

    const newFindings = ruleMatcher.match(restoredText);
    const bounds = element.getBoundingClientRect();
    const protectedList = getProtectedItems(element);
    inputIndicator.update(element, newFindings, bounds, protectedList);
    inputHighlighter.update(element, newFindings);
  },
  onSwitchAllStrategies: (element, newStrategy) => {
    let currentText = inputObserver.extractFieldText(element);
    if (!currentText) return;

    const protectedList = getProtectedItems(element);
    const activeFindings = ruleMatcher.match(currentText);

    for (const item of protectedList) {
      const distinctInCat = new Set<string>();
      for (const p of protectedList) {
        if (p.category === item.category) distinctInCat.add(p.originalRawText);
      }
      for (const f of activeFindings) {
        if (f.category === item.category) distinctInCat.add(f.rawText);
      }
      const totalDistinct = distinctInCat.size;
      const entityIndex = totalDistinct > 1 ? (item.entityIndex || 1) : 0;

      const dummyFinding = {
        id: item.id,
        label: item.label,
        category: item.category,
        rawText: item.originalRawText,
        start: 0,
        end: item.originalRawText.length,
        severity: "critical" as const,
        source: "regex_rule" as const,
        confidence: 1.0,
        suggestedReplacement: `YOUR_${item.category.toUpperCase()}`,
      };

      const newToken = privacyReplacer.generateReplacement(
        dummyFinding,
        newStrategy,
        entityIndex,
      );

      if (currentText.includes(item.currentToken)) {
        currentText = currentText.split(item.currentToken).join(newToken);
      }

      addOrUpdateProtectedItem(element, {
        ...item,
        currentToken: newToken,
        currentStrategy: newStrategy,
        entityIndex: item.entityIndex ?? (totalDistinct > 1 ? entityIndex : 1),
      });
    }

    inputObserver.setFieldText(element, currentText);

    const newFindings = ruleMatcher.match(currentText);
    const bounds = element.getBoundingClientRect();
    const updatedList = getProtectedItems(element);
    inputIndicator.update(element, newFindings, bounds, updatedList);
    inputHighlighter.update(element, newFindings);
  },
  onRestoreAll: (element) => {
    let currentText = inputObserver.extractFieldText(element);
    if (!currentText) return;

    const protectedList = getProtectedItems(element);
    for (const item of protectedList) {
      if (currentText.includes(item.currentToken)) {
        currentText = currentText.split(item.currentToken).join(
          item.originalRawText,
        );
      }
    }

    setProtectedItems(element, []);
    inputObserver.setFieldText(element, currentText);

    const newFindings = ruleMatcher.match(currentText);
    const bounds = element.getBoundingClientRect();
    inputIndicator.update(element, newFindings, bounds, []);
    inputHighlighter.update(element, newFindings);
  },
});

// Initialize Input Field Observer for AI chatbot prompts and forms
const inputObserver = new InputObserver(
  (event: FieldChangeEvent) => {
    if (event.isPassword) {
      inputIndicator.hide();
      inputHighlighter.clear();
      return;
    }

    // Instant deterministic rule scan (<0.1ms)
    const findings = ruleMatcher.match(event.text);
    const activeProtected = getProtectedItems(event.element).filter((p) =>
      event.text.includes(p.currentToken),
    );
    setProtectedItems(event.element, activeProtected);

    inputIndicator.update(
      event.element,
      findings,
      event.bounds,
      activeProtected,
    );
    inputHighlighter.update(event.element, findings);
  },
  () => {
    // Only hide if the notice card is not currently open
    if (!inputIndicator.getIsCardVisible()) {
      inputIndicator.hide();
      inputHighlighter.clear();
    }
  },
);

/**
 * Instantly sanitizes all detected sensitive data in the active focused field via keyboard shortcut.
 */
function sanitizeActiveField(
  strategy: RepairStrategyType = "semantic_placeholder",
): boolean {
  const activeElement = inputObserver.getActiveElement();
  if (!activeElement || !activeElement.isConnected) return false;

  const currentText = inputObserver.extractFieldText(activeElement);
  if (!currentText) return false;

  const findings = ruleMatcher.match(currentText);
  const protectedList = getProtectedItems(activeElement);

  if (findings.length === 0 && protectedList.length === 0) {
    return false;
  }

  if (findings.length === 0 && protectedList.length > 0) {
    // Switch existing protected items to the selected strategy
    for (const item of protectedList) {
      if (item.currentStrategy !== strategy) {
        const distinctInCat = new Set<string>();
        for (const p of protectedList) {
          if (p.category === item.category) distinctInCat.add(p.originalRawText);
        }
        const totalDistinct = distinctInCat.size;
        const entityIndex = totalDistinct > 1 ? (item.entityIndex || 1) : 0;

        const dummyFinding: SensitiveFinding = {
          id: item.id,
          label: item.label,
          category: item.category,
          rawText: item.originalRawText,
          start: 0,
          end: item.originalRawText.length,
          severity: "critical",
          source: "regex_rule",
          confidence: 1.0,
          suggestedReplacement: `YOUR_${item.category.toUpperCase()}`,
        };

        const newToken = privacyReplacer.generateReplacement(
          dummyFinding,
          strategy,
          entityIndex,
        );
        const liveText = inputObserver.extractFieldText(activeElement);
        if (liveText.includes(item.currentToken)) {
          const updatedText = liveText.split(item.currentToken).join(newToken);
          inputObserver.setFieldText(activeElement, updatedText);
        }

        addOrUpdateProtectedItem(activeElement, {
          ...item,
          currentToken: newToken,
          currentStrategy: strategy,
          entityIndex: item.entityIndex ?? (totalDistinct > 1 ? entityIndex : 1),
        });
      }
    }

    const updatedText = inputObserver.extractFieldText(activeElement);
    const newFindings = ruleMatcher.match(updatedText);
    const bounds = activeElement.getBoundingClientRect();
    const updatedList = getProtectedItems(activeElement);
    inputIndicator.update(activeElement, newFindings, bounds, updatedList);
    inputHighlighter.update(activeElement, newFindings);
    return true;
  }

  // Replace all active findings with the requested strategy
  const repair = privacyReplacer.replace(
    currentText,
    findings,
    [],
    strategy,
    protectedList,
    findings,
  );
  const sanitizedText = repair.sanitizedText;
  inputObserver.setFieldText(activeElement, sanitizedText);

  for (const finding of findings) {
    const replacementToken =
      repair.replacementMap.get(finding.rawText) ||
      privacyReplacer.generateReplacement(finding, strategy, 0);

    const assignedEntityIndex =
      repair.rawToEntityIndexMap?.get(finding.rawText) ?? 1;

    addOrUpdateProtectedItem(activeElement, {
      id: finding.id,
      category: finding.category,
      label: finding.label,
      originalRawText: finding.rawText,
      currentToken: replacementToken,
      currentStrategy: strategy,
      entityIndex: assignedEntityIndex,
    });
  }

  const newFindings = ruleMatcher.match(sanitizedText);
  const bounds = activeElement.getBoundingClientRect();
  const updatedProtectedList = getProtectedItems(activeElement);
  inputIndicator.update(activeElement, newFindings, bounds, updatedProtectedList);
  inputHighlighter.update(activeElement, newFindings);
  return true;
}

// Global Keyboard Shortcut: Alt + P / Option + P or Cmd/Ctrl + Shift + P to sanitize active field
document.addEventListener(
  "keydown",
  (event: KeyboardEvent) => {
    const isAltP =
      event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      (event.key === "p" || event.key === "P" || event.code === "KeyP");
    const isCmdShiftP =
      (event.metaKey || event.ctrlKey) &&
      event.shiftKey &&
      (event.key === "p" || event.key === "P" || event.code === "KeyP");
    const isAltS =
      event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      (event.key === "s" || event.key === "S" || event.code === "KeyS");

    if (isAltP || isCmdShiftP) {
      const handled = sanitizeActiveField("semantic_placeholder");
      if (handled) {
        event.preventDefault();
        event.stopPropagation();
      }
    } else if (isAltS) {
      const handled = sanitizeActiveField("synthetic_dummy");
      if (handled) {
        event.preventDefault();
        event.stopPropagation();
      }
    }
  },
  true,
);

let activeHintFinding: HTMLElement | null = null;
let noticeTimeout = 0;

function placeBubble(element: HTMLElement, rect: DOMRect): void {
  element.classList.add('show');
  const width = element.offsetWidth;
  const height = element.offsetHeight;
  const center = rect.left + rect.width / 2;
  const left = Math.max(8, Math.min(center - width / 2, window.innerWidth - width - 8));
  const above = rect.top - height - 18 >= 8 || rect.bottom + height + 18 > window.innerHeight - 8;
  const top = above ? Math.max(8, rect.top - height - 18) : Math.max(8, Math.min(rect.bottom + 18, window.innerHeight - height - 8));
  element.classList.toggle('below', !above);
  element.style.left = `${left}px`;
  element.style.top = `${top}px`;
  element.style.setProperty('--pointer-x', `${Math.max(22, Math.min(width - 22, center - left))}px`);
}

function showNotice(message: string, rect: DOMRect): void {
  noticeCopy.textContent = message;
  placeBubble(notice, rect);
  clearTimeout(noticeTimeout);
  noticeTimeout = window.setTimeout(() => notice.classList.remove('show'), 6500);
}

function isTextAltered(element: HTMLElement): boolean {
  return ['pl-blur', 'pl-spoiler', 'pl-masked', 'pl-dummy'].some(name => element.classList.contains(name));
}

function applyAutomaticMask(element: HTMLElement): void {
  if (!element.isConnected || isTextAltered(element)) return;
  applyAction({ kind: 'text', element }, selectedEffect);
  element.setAttribute('data-pl-auto-mask', '');
}

function syncAutomaticMasking(effectChanged = false, maskUnaltered = true): void {
  for (const element of Array.from(document.querySelectorAll<HTMLElement>('.pl-finding'))) {
    const autoMasked = element.hasAttribute('data-pl-auto-mask');
    if (!hideByDefault) {
      if (autoMasked) applyAction({ kind: 'text', element }, 'restore');
    } else if (autoMasked && effectChanged) {
      applyAction({ kind: 'text', element }, selectedEffect);
    } else if (!autoMasked && maskUnaltered) {
      applyAutomaticMask(element);
    }
  }
}

function effectLabel(effect: Effect): string {
  switch (effect) {
    case 'blur': return 'blur';
    case 'dummy': return 'replace values';
    case 'placeholder': return 'insert a placeholder';
    case 'spoiler': return 'show the particle spoiler';
  }
}

function createFinding(finding: Pick<DisplayFinding, 'type' | 'severity' | 'category'>, text: string): HTMLElement {
  const span = document.createElement('span');
  span.className = `pl-finding pl-${finding.severity}`;
  span.setAttribute('data-pl-type', finding.type);
  span.setAttribute('data-pl-category', detectionCategory(finding.type, finding.category));
  span.textContent = text;
  const fragment = document.createDocumentFragment();
  fragment.append(document.createTextNode(text));
  originalText.set(span, fragment);
  return span;
}

function eligible(node: Text): boolean {
  const parent = node.parentElement;
  return (
    !!parent &&
    !!node.nodeValue?.trim() &&
    !parent.closest('script,style,noscript,textarea,input,select,option,[contenteditable],.pl-finding,[data-privacy-lens-ui]') &&
    getComputedStyle(parent).display !== 'none'
  );
}

function wrapNode(node: Text, findings: DisplayFinding[]): void {
  const value = node.nodeValue || '';
  if (!findings.length || !node.parentNode) return;
  const fragment = document.createDocumentFragment();
  const newHighlights: HTMLElement[] = [];
  let offset = 0;
  for (const item of findings) {
    if (item.start < offset || item.end > value.length) continue;
    if (item.start > offset) fragment.append(document.createTextNode(value.slice(offset, item.start)));
    const highlight = createFinding(item, value.slice(item.start, item.end));
    fragment.append(highlight);
    newHighlights.push(highlight);
    offset = item.end;
  }
  if (offset < value.length) fragment.append(document.createTextNode(value.slice(offset)));
  node.replaceWith(fragment);
  if (hideByDefault) {
    for (const highlight of newHighlights) applyAutomaticMask(highlight);
  }
}

function scanRules(root: Node = document.body ?? document.documentElement): void {
  if (!root?.isConnected) return;
  const candidates: Text[] = [];
  if (root instanceof Text) {
    candidates.push(root);
  } else {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) candidates.push(walker.currentNode as Text);
  }
  for (const node of candidates) {
    if (!node.isConnected || !eligible(node)) continue;
    wrapNode(node, detect(node.nodeValue || '', finding => categoryEnabled(finding.type)));
  }
}

const changedRoots = new Set<Node>();
const observer = new MutationObserver(records => {
  for (const record of records) {
    if (record.type === 'characterData') changedRoots.add(record.target);
    for (const node of Array.from(record.addedNodes)) changedRoots.add(node);
  }
  if (!changedRoots.size) return;
  clearTimeout(scanTimer);
  scanTimer = window.setTimeout(() => {
    observer.disconnect();
    for (const root of changedRoots) scanRules(root);
    changedRoots.clear();
    if (document.documentElement) {
      observer.observe(document.documentElement, { childList: true, characterData: true, subtree: true });
    }
  }, 250);
});

function refreshHighlights(): void {
  observer.disconnect();
  for (const span of Array.from(document.querySelectorAll<HTMLElement>('.pl-finding'))) {
    const category = span.getAttribute('data-pl-category') as DetectionCategory | null;
    if (category && !enabledCategories[category]) {
      // Keep a mask the user applied, but remove automatically masked disabled findings.
      if (isTextAltered(span) && !span.hasAttribute('data-pl-auto-mask')) continue;
      spoiler.remove(span);
      const original = originalText.get(span);
      span.replaceWith(original?.cloneNode(true) ?? document.createTextNode(span.textContent || ''));
    }
  }
  hint.classList.remove('show');
  scanRules();
  // Reconcile spans already on the page as well as the ones scanRules just made.
  // This also handles an extension reload while the tab stays open.
  syncAutomaticMasking();
  if (document.documentElement) {
    observer.observe(document.documentElement, { childList: true, characterData: true, subtree: true });
  }
}

const settingsReady = chrome.storage.local.get([...categoryKeys.map(storageCategoryKey), 'defaultEffect', 'hideByDefault', 'showHoverTooltip'])
  .then(settings => {
    for (const category of categoryKeys) enabledCategories[category] = settings[storageCategoryKey(category)] !== false;
    if (isEffect(settings.defaultEffect)) selectedEffect = settings.defaultEffect;
    hideByDefault = settings.hideByDefault === true;
    showHoverTooltip = settings.showHoverTooltip !== false;
  })
  .catch(error => console.warn('TekaSend: Could not load detection settings:', error))
  .finally(refreshHighlights);

function applyAction(target: Target, action: Action): void {
  const element = target.element;

  const original = originalText.get(element);
  if (action === 'restore') {
    spoiler.remove(element);
    element.classList.remove('pl-blur', 'pl-spoiler', 'pl-masked', 'pl-dummy');
    element.removeAttribute('data-pl-auto-mask');
    if (original) element.replaceChildren(original.cloneNode(true));
    return;
  }
  const sourceText = original?.textContent ?? element.textContent ?? '';
  spoiler.remove(element);
  element.classList.remove('pl-blur', 'pl-spoiler', 'pl-masked', 'pl-dummy');
  if (original) element.replaceChildren(original.cloneNode(true));

  if (action === 'blur') {
    element.classList.add('pl-blur');
  } else if (action === 'spoiler') {
    element.classList.add('pl-spoiler');
    spoiler.add(element);
  } else if (action === 'placeholder') {
    element.classList.add('pl-masked');
    const type = element.getAttribute('data-pl-type') || 'text';
    element.textContent = `YOUR_${type.toUpperCase().replace(/\s+/g, '_')}`;
  } else if (action === 'dummy') {
    element.classList.add('pl-dummy');
    element.textContent = createDummyText(sourceText);
  }
}

document.addEventListener('click', event => {
  if (event.button !== 0) return;
  const target = event.target;
  if (!(target instanceof Element) || target.closest('[data-privacy-lens-ui]')) return;
  if (target instanceof HTMLImageElement) return;
  const finding = target.closest('.pl-finding');
  if (finding instanceof HTMLElement) {
    event.preventDefault();
    event.stopPropagation();
    hint.classList.remove('show');
    if (isTextAltered(finding)) {
      applyAction({ kind: 'text', element: finding }, 'restore');
    } else {
      void settingsReady.then(() => {
        if (finding.isConnected) applyAction({ kind: 'text', element: finding }, selectedEffect);
      });
    }
    return;
  }
  hint.classList.remove('show');
}, true);

function mapTypeToCategory(type: string): FindingCategory {
  const lower = type.toLowerCase();
  if (lower.includes('api')) return 'api_key';
  if (lower.includes('password') || lower.includes('secret')) return 'password';
  if (lower.includes('bearer') || lower.includes('token')) return 'bearer_token';
  if (lower.includes('private')) return 'private_key';
  if (lower.includes('email')) return 'email';
  if (lower.includes('phone')) return 'phone';
  if (lower.includes('name') && !lower.includes('username')) return 'person_name';
  return 'custom_sensitive';
}

function updateFindingHint(event: PointerEvent): void {
  if (!showHoverTooltip) {
    activeHintFinding = null;
    hint.classList.remove('show');
    return;
  }
  const finding = event.target instanceof Element ? event.target.closest('.pl-finding') : null;
  if (!(finding instanceof HTMLElement)) {
    if (activeHintFinding) {
      activeHintFinding = null;
      hint.classList.remove('show');
    }
    return;
  }
  if (finding === activeHintFinding && hint.classList.contains('show')) return;
  activeHintFinding = finding;

  const findingType = finding.getAttribute('data-pl-type') || 'Sensitive text';
  if (isTextAltered(finding)) {
    hintCopy.textContent = 'Click to restore.';
  } else {
    const category = mapTypeToCategory(findingType);
    const risk = riskAnalyzer.analyzeRisk(category, finding.textContent || '', 'medium');
    hintCopy.textContent = `${findingType}: ${risk.explanation} Click to ${effectLabel(selectedEffect)}.`;
  }
  placeBubble(hint, finding.getBoundingClientRect());
}

document.addEventListener('pointerover', updateFindingHint, true);
document.addEventListener('pointermove', updateFindingHint, true);

document.addEventListener('pointerout', event => {
  const finding = event.target instanceof Element ? event.target.closest('.pl-finding') : null;
  if (finding && (!(event.relatedTarget instanceof Node) || !finding.contains(event.relatedTarget))) {
    activeHintFinding = null;
    hint.classList.remove('show');
  }
}, true);

type AiFinding = { text: string; type: string; severity: 'high' | 'medium'; category?: FindingCategory };
type AiAnalysis = { findings: AiFinding[]; provider?: 'local' | 'cloud' };

async function analyzeWithAi(text: string): Promise<AiAnalysis> {
  try {
    const response = await chrome.runtime.sendMessage({ kind: 'AI_ANALYZE', text });
    if (!response.ok) {
      aiError = response.error || 'AI request failed.';
      console.warn('TekaSend:', aiError);
      return { findings: [] };
    }
    aiError = '';
    return { findings: response.findings || [], provider: response.provider };
  } catch {
    aiError = 'Could not reach the extension background worker.';
    return { findings: [] };
  }
}

async function scanAi(force = false): Promise<{ ok: boolean; error?: string; provider?: 'local' | 'cloud'; breakdown?: { apiKey: number; password: number; personal: number; financial: number; total: number } }> {
  await settingsReady;
  if (aiScanned && !force) return { ok: true };
  aiScanned = true;
  if (!document.body) return { ok: false, error: 'This page has no content to scan.' };
  const text = (document.body.innerText || '').slice(0, 5000);
  const { findings, provider } = await analyzeWithAi(text);
  if (aiError) return { ok: false, error: aiError };
  const found = findings.filter(item => categoryEnabled(item.type, item.category));

  const breakdown = {
    apiKey: 0,
    password: 0,
    personal: 0,
    financial: 0,
    total: found.length
  };

  for (const item of found) {
    const cat = detectionCategory(item.type, item.category);
    breakdown[cat]++;
  }

  if (!found.length) return { ok: true, breakdown, provider };
  observer.disconnect();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode() && nodes.length < 3500) {
    const node = walker.currentNode as Text;
    if (eligible(node)) nodes.push(node);
  }
  for (const node of nodes) {
    const value = node.nodeValue || '';
    const findings: DisplayFinding[] = [];
    for (const item of found) {
      let index = value.indexOf(item.text);
      while (index >= 0) {
        findings.push({ ...item, start: index, end: index + item.text.length });
        index = value.indexOf(item.text, index + item.text.length);
      }
    }
    findings.sort((a, b) => a.start - b.start || b.end - a.end);
    const clean: Finding[] = [];
    let end = -1;
    for (const item of findings) {
      if (item.start >= end) {
        clean.push(item);
        end = item.end;
      }
    }
    wrapNode(node, clean);
  }
  observer.observe(document.documentElement, { childList: true, characterData: true, subtree: true });
  return { ok: true, breakdown, provider };
}

chrome.runtime.onMessage.addListener((message: { kind?: string }, _sender, respond) => {
  if (message.kind === 'SCAN_AI') {
    void scanAi(true).then(respond);
    return true;
  }
});

chrome.storage.onChanged.addListener(changes => {
  if (changes.showHoverTooltip) {
    showHoverTooltip = changes.showHoverTooltip.newValue !== false;
    if (!showHoverTooltip) {
      activeHintFinding = null;
      hint.classList.remove('show');
    }
  }
  const effectChanged = !!changes.defaultEffect && isEffect(changes.defaultEffect.newValue);
  if (effectChanged) {
    selectedEffect = changes.defaultEffect.newValue;
    activeHintFinding = null;
    hint.classList.remove('show');
  }
  if (changes.hideByDefault) hideByDefault = changes.hideByDefault.newValue === true;
  const categoriesChanged = categoryKeys.some(category => storageCategoryKey(category) in changes);
  if (categoriesChanged) {
    for (const category of categoryKeys) {
      const change = changes[storageCategoryKey(category)];
      if (change) enabledCategories[category] = change.newValue !== false;
    }
    refreshHighlights();
  }
  if (changes.hideByDefault || (effectChanged && hideByDefault)) {
    syncAutomaticMasking(effectChanged, !!changes.hideByDefault);
  }
  if (!categoriesChanged && !changes.cloudEnabled && !changes.apiKey) return;
  clearTimeout(aiSettingsTimer);
  aiSettingsTimer = window.setTimeout(() => void scanAi(true), 350);
});

window.setTimeout(() => void scanAi(), 1200);
