/**
 * TekaSend Content Script — In-Page UI & Privacy Guardian
 *
 * Implements:
 * - PRD F1: In-page DOM scanning and input field monitoring
 * - PRD F2: Smart Privacy Repair (Semantic Placeholders, Synthetic Dummies, Solid Redaction)
 * - PRD F3: Local Repair Pre-flight Verification Notice
 * - PRD F4: Visual Privacy Guardian (Element blur and SVG solid redaction)
 */

import {
  DeterministicRuleMatcher,
  PrivacyReplacer,
  LocalRepairVerifier,
  SensitiveFinding,
  RepairStrategyType
} from './ai/index.js';

type Action = 'blur' | 'placeholder' | 'dummy' | 'redact' | 'restore';
type Target =
  | { kind: 'text'; element: HTMLElement }
  | { kind: 'image'; element: HTMLImageElement }
  | { kind: 'selection'; range: Range }
  | { kind: 'field'; element: HTMLInputElement | HTMLTextAreaElement };

const ruleMatcher = new DeterministicRuleMatcher();
const privacyReplacer = new PrivacyReplacer();
const repairVerifier = new LocalRepairVerifier();

const originalTextMap = new WeakMap<HTMLElement, DocumentFragment>();
const originalImagesMap = new WeakMap<HTMLImageElement, { src: string; srcset: string; alt: string; filter: string }>();

let currentTarget: Target | null = null;
let pendingSelection: Range | null = null;
let pendingImage: HTMLImageElement | null = null;
let scanTimer = 0;
let fieldTimer = 0;
let noticeTimeout = 0;

// Inject in-page styles for findings and action panel
const styleElement = document.createElement('style');
styleElement.textContent = `
  .pl-finding { cursor:pointer!important; border-radius:3px!important; box-decoration-break:clone!important; -webkit-box-decoration-break:clone!important; }
  .pl-finding.pl-critical, .pl-finding.pl-high { background:#ffb4b4!important; color:#391113!important; box-shadow:0 0 0 1px #d94242!important; }
  .pl-finding.pl-medium { background:#ffe9a0!important; color:#4a3600!important; box-shadow:0 0 0 1px #d69a08!important; }
  .pl-finding.pl-low { background:#dce9f2!important; color:#15283b!important; box-shadow:0 0 0 1px #5a8ab5!important; }
  .pl-finding.pl-blur { filter:blur(5px)!important; user-select:none!important; }
  .pl-finding.pl-blur:hover { filter:blur(5px)!important; }
  .pl-finding.pl-masked { background:#191d27!important; color:white!important; padding:0 3px!important; }
`;
(document.head || document.documentElement).append(styleElement);

// Create shadow DOM host for isolated UI overlays
const host = document.createElement('div');
host.setAttribute('data-privacy-lens-ui', '');
host.style.cssText = 'position:fixed;z-index:2147483647;inset:0;pointer-events:none';
document.documentElement.append(host);
const shadow = host.attachShadow({ mode: 'closed' });

const uiStyle = document.createElement('style');
uiStyle.textContent = `
  * { box-sizing: border-box; }
  .panel {
    position: fixed;
    display: none;
    min-width: 240px;
    max-width: 320px;
    background: #151a27;
    color: #ffffff;
    border: 1px solid #424a62;
    border-radius: 10px;
    box-shadow: 0 12px 35px rgba(0, 0, 0, 0.4);
    padding: 12px;
    font: 13px system-ui, -apple-system, sans-serif;
    pointer-events: auto;
  }
  .panel.show { display: block; }
  .title { font-weight: 700; margin: 0 0 8px; font-size: 13px; }
  .buttons { display: flex; flex-wrap: wrap; gap: 6px; }
  button {
    background: #30394e;
    color: #ffffff;
    border: 1px solid #63708d;
    border-radius: 6px;
    padding: 6px 10px;
    cursor: pointer;
    font: 12px system-ui, -apple-system, sans-serif;
    transition: background 0.15s ease;
  }
  button:hover { background: #425373; }
  .notice {
    position: fixed;
    display: none;
    max-width: 340px;
    background: #fff4d7;
    color: #493300;
    border: 1px solid #d49400;
    border-radius: 8px;
    box-shadow: 0 9px 25px rgba(0, 0, 0, 0.25);
    padding: 9px 12px;
    font: 12px system-ui, -apple-system, sans-serif;
    pointer-events: none;
    line-height: 1.4;
  }
  .notice.show { display: block; }
  .notice.notice-verified {
    background: #e6f7ec;
    color: #0e4f24;
    border-color: #2da44e;
  }
`;
shadow.append(uiStyle);

const panel = document.createElement('div');
panel.className = 'panel';
panel.setAttribute('role', 'dialog');
panel.setAttribute('aria-label', 'TekaSend actions');
const title = document.createElement('div');
title.className = 'title';
const buttonsContainer = document.createElement('div');
buttonsContainer.className = 'buttons';
panel.append(title, buttonsContainer);
shadow.append(panel);

const notice = document.createElement('div');
notice.className = 'notice';
notice.setAttribute('role', 'status');
shadow.append(notice);

function showNotice(message: string, rect: DOMRect, isVerified = false): void {
  notice.textContent = message;
  if (isVerified) {
    notice.classList.add('notice-verified');
  } else {
    notice.classList.remove('notice-verified');
  }
  notice.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 350))}px`;
  notice.style.top = `${Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - 85))}px`;
  notice.classList.add('show');
  clearTimeout(noticeTimeout);
  noticeTimeout = window.setTimeout(() => notice.classList.remove('show'), 6500);
}

function showMenu(target: Target, rect: DOMRect, label: string): void {
  currentTarget = target;
  title.textContent = label;
  buttonsContainer.replaceChildren();

  const isFieldOrSelection = target.kind === 'selection' || target.kind === 'field';
  const actions: Action[] = isFieldOrSelection
    ? ['placeholder', 'dummy', 'redact', 'blur']
    : ['placeholder', 'dummy', 'redact', 'blur', 'restore'];

  for (const action of actions) {
    const button = document.createElement('button');
    button.type = 'button';
    let buttonLabel = '';
    switch (action) {
      case 'placeholder': buttonLabel = 'Placeholder'; break;
      case 'dummy': buttonLabel = 'Dummy Text'; break;
      case 'redact': buttonLabel = 'Solid Redact'; break;
      case 'blur': buttonLabel = 'Blur'; break;
      case 'restore': buttonLabel = 'Restore'; break;
    }
    button.textContent = buttonLabel;
    button.addEventListener('click', () => {
      if (currentTarget) {
        applyAction(currentTarget, action);
      }
      hideMenu();
    });
    buttonsContainer.append(button);
  }

  panel.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 325))}px`;
  panel.style.top = `${Math.max(8, Math.min(rect.bottom + 8, window.innerHeight - 100))}px`;
  panel.classList.add('show');
}

function hideMenu(): void {
  panel.classList.remove('show');
  currentTarget = null;
}

function createFindingElement(finding: SensitiveFinding, text: string): HTMLElement {
  const span = document.createElement('span');
  span.className = `pl-finding pl-${finding.severity}`;
  span.setAttribute('data-pl-type', finding.label);
  span.title = `TekaSend: ${finding.label} (${finding.severity}) - Click for actions`;
  span.textContent = text;
  const fragment = document.createDocumentFragment();
  fragment.append(document.createTextNode(text));
  originalTextMap.set(span, fragment);
  return span;
}

function eligible(node: Text): boolean {
  const parent = node.parentElement;
  return (
    !!parent &&
    !!node.nodeValue?.trim() &&
    !parent.closest('script,style,noscript,textarea,input,select,option,code,pre,[contenteditable],.pl-finding,[data-privacy-lens-ui]') &&
    getComputedStyle(parent).display !== 'none'
  );
}

function wrapNode(node: Text, findings: readonly SensitiveFinding[]): void {
  const value = node.nodeValue || '';
  if (!findings.length || !node.parentNode) return;

  const fragment = document.createDocumentFragment();
  let offset = 0;

  for (const item of findings) {
    if (item.start < offset || item.end > value.length) continue;
    if (item.start > offset) {
      fragment.append(document.createTextNode(value.slice(offset, item.start)));
    }
    fragment.append(createFindingElement(item, value.slice(item.start, item.end)));
    offset = item.end;
  }

  if (offset < value.length) {
    fragment.append(document.createTextNode(value.slice(offset)));
  }

  node.replaceWith(fragment);
}

function scanPage(): void {
  if (!document.body) return;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const candidates: Text[] = [];

  while (walker.nextNode() && candidates.length < 3500) {
    const node = walker.currentNode as Text;
    if (eligible(node)) {
      candidates.push(node);
    }
  }

  for (const node of candidates) {
    const text = node.nodeValue || '';
    const findings = ruleMatcher.match(text);
    wrapNode(node, findings);
  }
}

const observer = new MutationObserver(() => {
  clearTimeout(scanTimer);
  scanTimer = window.setTimeout(() => {
    observer.disconnect();
    scanPage();
    if (document.body) {
      observer.observe(document.body, { childList: true, characterData: true, subtree: true });
    }
  }, 250);
});

scanPage();
if (document.body) {
  observer.observe(document.body, { childList: true, characterData: true, subtree: true });
}

function applyAction(target: Target, action: Action): void {
  if (target.kind === 'image') {
    handleImageAction(target.element, action);
    return;
  }

  if (target.kind === 'field') {
    handleFieldAction(target.element, action);
    return;
  }

  handleTextAction(target, action);
}

function handleImageAction(img: HTMLImageElement, action: Action): void {
  if (!originalImagesMap.has(img)) {
    originalImagesMap.set(img, {
      src: img.getAttribute('src') || '',
      srcset: img.getAttribute('srcset') || '',
      alt: img.alt,
      filter: img.style.filter
    });
  }

  const old = originalImagesMap.get(img)!;

  if (action === 'restore') {
    img.setAttribute('src', old.src);
    if (old.srcset) img.setAttribute('srcset', old.srcset);
    else img.removeAttribute('srcset');
    img.alt = old.alt;
    img.style.filter = old.filter;
    return;
  }

  if (action === 'blur') {
    img.style.filter = 'blur(14px)';
    return;
  }

  const label = action === 'redact' ? 'REDACTED IMAGE' : 'Sample image';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="360"><rect width="100%" height="100%" fill="${action === 'redact' ? '#151a27' : '#dce9f2'}"/><text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" fill="${action === 'redact' ? 'white' : '#28445c'}" font-family="Arial" font-size="27">${label}</text></svg>`;
  img.removeAttribute('srcset');
  img.src = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  img.alt = label;
  img.style.filter = old.filter;
}

function handleFieldAction(field: HTMLInputElement | HTMLTextAreaElement, action: Action): void {
  if (action === 'blur') {
    field.style.filter = 'blur(5px)';
    showNotice('Blur applies to the whole field. Click the field to edit it.', field.getBoundingClientRect());
    return;
  }

  const start = field.selectionStart ?? 0;
  const end = field.selectionEnd ?? field.value.length;
  const selectedText = field.value.slice(start, end) || field.value;

  // Scan selected text
  const findings = ruleMatcher.match(selectedText);
  const strategy: RepairStrategyType = action === 'placeholder'
    ? 'semantic_placeholder'
    : action === 'dummy'
    ? 'synthetic_dummy'
    : 'solid_redact';

  const repair = privacyReplacer.replace(selectedText, findings, [], strategy);
  
  if (start !== end) {
    field.setRangeText(repair.sanitizedText, start, end, 'end');
  } else {
    field.value = repair.sanitizedText;
  }

  field.dispatchEvent(new Event('input', { bubbles: true }));

  // Run pre-flight verification (PRD F3)
  const verification = repairVerifier.verify(repair.sanitizedText, findings);
  showNotice(
    verification.isClean
      ? `Verified: Replaced sensitive data with ${strategy === 'semantic_placeholder' ? 'placeholder' : 'dummy value'}. Ready to send.`
      : `Warning: Some sensitive data may still remain.`,
    field.getBoundingClientRect(),
    verification.isClean
  );
}

function handleTextAction(target: { kind: 'text'; element: HTMLElement } | { kind: 'selection'; range: Range }, action: Action): void {
  let element: HTMLElement;

  if (target.kind === 'selection') {
    const range = target.range;
    if (range.collapsed || !range.commonAncestorContainer.isConnected) return;
    element = document.createElement('span');
    element.className = 'pl-finding pl-high';
    element.setAttribute('data-pl-type', 'Manual selection');
    const original = range.extractContents();
    originalTextMap.set(element, original.cloneNode(true) as DocumentFragment);
    element.append(original);
    range.insertNode(element);
    getSelection()?.removeAllRanges();
  } else {
    element = target.element;
  }

  const original = originalTextMap.get(element);

  if (action === 'restore') {
    if (original) element.replaceWith(original.cloneNode(true));
    return;
  }

  element.classList.remove('pl-blur', 'pl-masked');
  if (original) element.replaceChildren(original.cloneNode(true));

  if (action === 'blur') {
    element.classList.add('pl-blur');
  } else {
    element.classList.add('pl-masked');
    const type = element.getAttribute('data-pl-type') || 'text';
    if (action === 'redact') {
      element.textContent = `[REDACTED: ${type}]`;
    } else if (action === 'placeholder') {
      element.textContent = `YOUR_${type.toUpperCase().replace(/\s+/g, '_')}`;
    } else {
      element.textContent = type.toLowerCase().includes('email') ? 'user@example.com' : '0917-000-0000';
    }
  }
}

// Event Listeners for DOM Interaction
document.addEventListener('click', event => {
  const target = event.target;
  if (!(target instanceof Element) || target.closest('[data-privacy-lens-ui]')) return;

  const finding = target.closest('.pl-finding');
  if (finding instanceof HTMLElement) {
    event.preventDefault();
    event.stopPropagation();
    showMenu({ kind: 'text', element: finding }, finding.getBoundingClientRect(), finding.title || 'Sensitive text');
    return;
  }

  if (target instanceof HTMLImageElement) {
    event.preventDefault();
    event.stopPropagation();
    pendingImage = target;
    showMenu({ kind: 'image', element: target }, target.getBoundingClientRect(), 'Image privacy options');
    return;
  }

  hideMenu();
}, true);

document.addEventListener('contextmenu', event => {
  if (event.target instanceof HTMLImageElement) pendingImage = event.target;
  const selection = getSelection();
  if (selection && !selection.isCollapsed && selection.rangeCount) {
    pendingSelection = selection.getRangeAt(0).cloneRange();
  }
}, true);

document.addEventListener('mouseup', event => {
  if (event.button !== 0) return;
  const active = document.activeElement;

  if ((active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) && active.selectionStart !== active.selectionEnd) {
    showMenu({ kind: 'field', element: active }, active.getBoundingClientRect(), 'Selected field text');
    return;
  }

  const selection = getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount || !selection.toString().trim()) return;

  const range = selection.getRangeAt(0).cloneRange();
  if (range.commonAncestorContainer.parentElement?.closest('[data-privacy-lens-ui]')) return;

  pendingSelection = range.cloneRange();
  showMenu({ kind: 'selection', range }, range.getBoundingClientRect(), 'Selected text');
});

document.addEventListener('paste', event => {
  const field = event.target;
  if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) return;

  const value = event.clipboardData?.getData('text/plain') || '';
  if (!value) return;

  const matches = ruleMatcher.match(value);
  if (matches.length > 0) {
    const categories = [...new Set(matches.map(item => item.label))].join(', ');
    showNotice(`Sensitive paste detected: ${categories}. Click field or selection to repair.`, field.getBoundingClientRect());
  }
}, true);

document.addEventListener('input', event => {
  const field = event.target;
  if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) return;

  clearTimeout(fieldTimer);
  fieldTimer = window.setTimeout(() => {
    if (field instanceof HTMLInputElement && field.type === 'password') {
      showNotice('Password field: keep this value confidential.', field.getBoundingClientRect());
      return;
    }
    const matches = ruleMatcher.match(field.value);
    if (matches.length > 0) {
      const categories = [...new Set(matches.map(item => item.label))].join(', ');
      showNotice(`Sensitive content detected in field: ${categories}.`, field.getBoundingClientRect());
    }
  }, 250);
}, true);

document.addEventListener('focusin', event => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
    event.target.style.filter = '';
  }
}, true);

chrome.runtime.onMessage.addListener((message: { kind?: string; action?: Action; source?: string }, _sender, respond) => {
  if (message.kind === 'ACTION' && message.action) {
    const target = message.source === 'image' && pendingImage
      ? { kind: 'image' as const, element: pendingImage }
      : pendingSelection
      ? { kind: 'selection' as const, range: pendingSelection }
      : null;

    if (target) {
      applyAction(target, message.action);
    }
    respond({ ok: !!target });
  }
});
