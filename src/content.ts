import { detect, type Finding } from './detect';
import { createDummyText } from './dummy';
import { RiskAnalyzer } from './ai/reasoning/risk-analyzer.js';
import type { FindingCategory } from './ai/types.js';
import { SpoilerRenderer } from './spoiler.js';
import { DEFAULT_EFFECT, isEffect, type Effect } from './shared/effects.js';

type Action = Effect | 'restore';
type DetectionCategory = 'apiKey' | 'password' | 'personal' | 'financial';
type DisplayFinding = Finding & { category?: FindingCategory };
type Target = { kind: 'text'; element: HTMLElement };

const originalText = new WeakMap<HTMLElement, DocumentFragment>();

const riskAnalyzer = new RiskAnalyzer();

let scanTimer = 0;
let fieldTimer = 0;
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

document.addEventListener('paste', event => {
  const field = event.target;
  if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) return;
  const value = event.clipboardData?.getData('text/plain') || '';
  if (!value) return;
  const matches = detect(value, finding => categoryEnabled(finding.type));
  if (matches.length) showNotice(`Sensitive paste: ${[...new Set(matches.map(item => item.type))].join(', ')}. Review before submitting.`, field.getBoundingClientRect());
  void analyzeWithAi(value.slice(0, 5000)).then(({ findings, provider }) => {
    const visible = findings.filter(item => categoryEnabled(item.type, item.category));
    if (visible.length) showNotice(`${provider === 'cloud' ? 'Cloud fallback' : 'Local AI'} also found: ${[...new Set(visible.map(item => item.type))].join(', ')}. Review before submitting.`, field.getBoundingClientRect());
  });
}, true);

document.addEventListener('input', event => {
  const field = event.target;
  if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) return;
  clearTimeout(fieldTimer);
  fieldTimer = window.setTimeout(() => {
    if (field instanceof HTMLInputElement && field.type === 'password' && enabledCategories.password) {
      showNotice('Password field: keep this value private.', field.getBoundingClientRect());
      return;
    }
    const matches = detect(field.value, finding => categoryEnabled(finding.type));
    if (matches.length) showNotice(`Sensitive field: ${[...new Set(matches.map(item => item.type))].join(', ')}.`, field.getBoundingClientRect());
  }, 250);
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
