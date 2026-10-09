import { detect, type Finding } from './detect';

type Action = 'blur' | 'dummy' | 'redact' | 'restore';
type Target = { kind: 'text'; element: HTMLElement } | { kind: 'image'; element: HTMLImageElement } | { kind: 'selection'; range: Range } | { kind: 'field'; element: HTMLInputElement | HTMLTextAreaElement };
const originalText = new WeakMap<HTMLElement, DocumentFragment>();
const originalImages = new WeakMap<HTMLImageElement, { src: string; srcset: string; alt: string; filter: string }>();
let currentTarget: Target | null = null;
let pendingSelection: Range | null = null;
let pendingImage: HTMLImageElement | null = null;
let scanTimer = 0;
let fieldTimer = 0;
let aiScanned = false;
let aiError = '';
let aiSettingsTimer = 0;

const style = document.createElement('style');
style.textContent = `
  .pl-finding { cursor:pointer!important; border-radius:3px!important; box-decoration-break:clone!important; -webkit-box-decoration-break:clone!important; }
  .pl-finding.pl-high { background:#ffb4b4!important; color:#391113!important; box-shadow:0 0 0 1px #d94242!important; }
  .pl-finding.pl-medium { background:#ffe9a0!important; color:#4a3600!important; box-shadow:0 0 0 1px #d69a08!important; }
  .pl-finding.pl-blur { filter:blur(5px)!important; user-select:none!important; }
  .pl-finding.pl-blur:hover { filter:blur(5px)!important; }
  .pl-finding.pl-masked { background:#191d27!important; color:white!important; padding:0 3px!important; }
`;
(document.head || document.documentElement).append(style);

const host = document.createElement('div');
host.setAttribute('data-privacy-lens-ui', '');
host.style.cssText = 'position:fixed;z-index:2147483647;inset:0;pointer-events:none';
document.documentElement.append(host);
const shadow = host.attachShadow({ mode: 'closed' });
const uiStyle = document.createElement('style');
uiStyle.textContent = `
  *{box-sizing:border-box} .panel{position:fixed;display:none;min-width:210px;max-width:300px;background:#151a27;color:#fff;border:1px solid #424a62;border-radius:10px;box-shadow:0 12px 35px #0006;padding:10px;font:13px system-ui;pointer-events:auto}
  .panel.show{display:block}.title{font-weight:700;margin:0 0 7px}.buttons{display:flex;flex-wrap:wrap;gap:6px}button{background:#30394e;color:white;border:1px solid #63708d;border-radius:6px;padding:6px 8px;cursor:pointer;font:12px system-ui}button:hover{background:#425373}.notice{position:fixed;display:none;max-width:310px;background:#fff4d7;color:#493300;border:1px solid #d49400;border-radius:8px;box-shadow:0 9px 25px #0004;padding:9px 11px;font:12px system-ui;pointer-events:none}.notice.show{display:block}
`;
shadow.append(uiStyle);
const panel = document.createElement('div');
panel.className = 'panel';
panel.setAttribute('role', 'dialog');
panel.setAttribute('aria-label', 'Privacy Lens actions');
const title = document.createElement('div'); title.className = 'title';
const buttons = document.createElement('div'); buttons.className = 'buttons';
panel.append(title, buttons);
shadow.append(panel);
const notice = document.createElement('div'); notice.className = 'notice'; notice.setAttribute('role', 'status'); shadow.append(notice);
let noticeTimeout = 0;

function showNotice(message: string, rect: DOMRect) {
  notice.textContent = message;
  notice.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - 320))}px`;
  notice.style.top = `${Math.max(8, Math.min(rect.bottom + 6, innerHeight - 85))}px`;
  notice.classList.add('show');
  clearTimeout(noticeTimeout);
  noticeTimeout = window.setTimeout(() => notice.classList.remove('show'), 6500);
}

function showMenu(target: Target, rect: DOMRect, label: string) {
  currentTarget = target;
  title.textContent = label;
  buttons.replaceChildren();
  const actions: Action[] = target.kind === 'selection' || target.kind === 'field' ? ['blur', 'dummy', 'redact'] : ['blur', 'dummy', 'redact', 'restore'];
  for (const action of actions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = action === 'dummy' ? 'Dummy text' : action[0].toUpperCase() + action.slice(1);
    button.addEventListener('click', () => { if (currentTarget) applyAction(currentTarget, action); hideMenu(); });
    buttons.append(button);
  }
  panel.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - 315))}px`;
  panel.style.top = `${Math.max(8, Math.min(rect.bottom + 8, innerHeight - 90))}px`;
  panel.classList.add('show');
}
function hideMenu() { panel.classList.remove('show'); currentTarget = null; }

function createFinding(finding: Pick<Finding, 'type' | 'severity'>, text: string): HTMLElement {
  const span = document.createElement('span');
  span.className = `pl-finding pl-${finding.severity}`;
  span.setAttribute('data-pl-type', finding.type);
  span.title = `${finding.severity === 'high' ? 'Confidential' : 'Personal'}: ${finding.type} · click for actions`;
  span.textContent = text;
  const fragment = document.createDocumentFragment(); fragment.append(document.createTextNode(text));
  originalText.set(span, fragment);
  return span;
}

function eligible(node: Text): boolean {
  const parent = node.parentElement;
  return !!parent && !!node.nodeValue?.trim() && !parent.closest('script,style,noscript,textarea,input,select,option,code,pre,[contenteditable],.pl-finding,[data-privacy-lens-ui]') && getComputedStyle(parent).display !== 'none';
}

function wrapNode(node: Text, findings: Finding[]): void {
  const value = node.nodeValue || '';
  if (!findings.length || !node.parentNode) return;
  const fragment = document.createDocumentFragment();
  let offset = 0;
  for (const item of findings) {
    if (item.start < offset || item.end > value.length) continue;
    if (item.start > offset) fragment.append(document.createTextNode(value.slice(offset, item.start)));
    fragment.append(createFinding(item, value.slice(item.start, item.end)));
    offset = item.end;
  }
  if (offset < value.length) fragment.append(document.createTextNode(value.slice(offset)));
  node.replaceWith(fragment);
}

function scanRules() {
  if (!document.body) return;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const candidates: Text[] = [];
  while (walker.nextNode() && candidates.length < 3500) {
    const node = walker.currentNode as Text;
    if (eligible(node)) candidates.push(node);
  }
  for (const node of candidates) wrapNode(node, detect(node.nodeValue || ''));
}

const observer = new MutationObserver(() => {
  clearTimeout(scanTimer);
  scanTimer = window.setTimeout(() => { observer.disconnect(); scanRules(); observer.observe(document.body, { childList: true, characterData: true, subtree: true }); }, 250);
});
scanRules();
if (document.body) observer.observe(document.body, { childList: true, characterData: true, subtree: true });

function applyAction(target: Target, action: Action) {
  if (target.kind === 'image') {
    const img = target.element;
    if (!originalImages.has(img)) originalImages.set(img, { src: img.getAttribute('src') || '', srcset: img.getAttribute('srcset') || '', alt: img.alt, filter: img.style.filter });
    const old = originalImages.get(img)!;
    if (action === 'restore') { img.setAttribute('src', old.src); if (old.srcset) img.setAttribute('srcset', old.srcset); else img.removeAttribute('srcset'); img.alt = old.alt; img.style.filter = old.filter; return; }
    if (action === 'blur') { img.style.filter = 'blur(14px)'; return; }
    const label = action === 'redact' ? 'REDACTED IMAGE' : 'Sample image';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="360"><rect width="100%" height="100%" fill="${action === 'redact' ? '#151a27' : '#dce9f2'}"/><text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" fill="${action === 'redact' ? 'white' : '#28445c'}" font-family="Arial" font-size="27">${label}</text></svg>`;
    img.removeAttribute('srcset'); img.src = `data:image/svg+xml,${encodeURIComponent(svg)}`; img.alt = label; img.style.filter = old.filter;
    return;
  }
  if (target.kind === 'field') {
    const field = target.element;
    if (action === 'blur') { field.style.filter = 'blur(5px)'; showNotice('Blur applies to the whole field. Click the field to edit it.', field.getBoundingClientRect()); return; }
    const start = field.selectionStart ?? 0, end = field.selectionEnd ?? field.value.length;
    const replacement = action === 'redact' ? '[REDACTED]' : 'example@example.com';
    field.setRangeText(replacement, start, end, 'end');
    field.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }
  let element: HTMLElement;
  if (target.kind === 'selection') {
    const range = target.range;
    if (range.collapsed || !range.commonAncestorContainer.isConnected) return;
    element = document.createElement('span'); element.className = 'pl-finding pl-high'; element.setAttribute('data-pl-type', 'Manual selection');
    const original = range.extractContents(); originalText.set(element, original.cloneNode(true) as DocumentFragment); element.append(original); range.insertNode(element);
    getSelection()?.removeAllRanges();
  } else element = target.element;
  const original = originalText.get(element);
  if (action === 'restore') { if (original) element.replaceWith(original.cloneNode(true)); return; }
  element.classList.remove('pl-blur', 'pl-masked');
  if (original) element.replaceChildren(original.cloneNode(true));
  if (action === 'blur') element.classList.add('pl-blur');
  else { element.classList.add('pl-masked'); element.textContent = action === 'redact' ? `[REDACTED: ${element.getAttribute('data-pl-type') || 'text'}]` : dummyFor(element.getAttribute('data-pl-type') || ''); }
}

function dummyFor(type: string) { return /email/i.test(type) ? 'user@example.com' : /phone/i.test(type) ? '0912 345 6789' : /password/i.test(type) ? 'example-password' : /image/i.test(type) ? '[Sample image]' : 'example-value'; }

document.addEventListener('click', event => {
  const target = event.target;
  if (!(target instanceof Element) || target.closest('[data-privacy-lens-ui]')) return;
  const finding = target.closest('.pl-finding');
  if (finding instanceof HTMLElement) { event.preventDefault(); event.stopPropagation(); showMenu({ kind: 'text', element: finding }, finding.getBoundingClientRect(), finding.title || 'Sensitive text'); return; }
  if (target instanceof HTMLImageElement) { event.preventDefault(); event.stopPropagation(); pendingImage = target; showMenu({ kind: 'image', element: target }, target.getBoundingClientRect(), 'Image actions'); return; }
  hideMenu();
}, true);

document.addEventListener('contextmenu', event => {
  if (event.target instanceof HTMLImageElement) pendingImage = event.target;
  const selection = getSelection();
  if (selection && !selection.isCollapsed && selection.rangeCount) pendingSelection = selection.getRangeAt(0).cloneRange();
}, true);

document.addEventListener('mouseup', event => {
  if (event.button !== 0) return;
  const active = document.activeElement;
  if ((active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) && active.selectionStart !== active.selectionEnd) {
    showMenu({ kind: 'field', element: active }, active.getBoundingClientRect(), 'Selected field text'); return;
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
  const matches = detect(value);
  if (matches.length) showNotice(`Sensitive paste: ${[...new Set(matches.map(item => item.type))].join(', ')}. Review before submitting.`, field.getBoundingClientRect());
  void analyzeWithAi(value.slice(0, 5000)).then(ai => { if (ai.length) showNotice(`AI also found: ${[...new Set(ai.map(item => item.type))].join(', ')}. Review before submitting.`, field.getBoundingClientRect()); });
}, true);

document.addEventListener('input', event => {
  const field = event.target;
  if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) return;
  clearTimeout(fieldTimer);
  fieldTimer = window.setTimeout(() => {
    if (field instanceof HTMLInputElement && field.type === 'password') { showNotice('Password field: keep this value private.', field.getBoundingClientRect()); return; }
    const matches = detect(field.value);
    if (matches.length) showNotice(`Sensitive field: ${[...new Set(matches.map(item => item.type))].join(', ')}.`, field.getBoundingClientRect());
  }, 250);
}, true);

document.addEventListener('focusin', event => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) event.target.style.filter = '';
}, true);

async function analyzeWithAi(text: string): Promise<{ text: string; type: string; severity: 'high' | 'medium' }[]> {
  const settings = await chrome.storage.local.get(['aiEnabled', 'apiKey']);
  if (!settings.aiEnabled || !settings.apiKey) { aiError = 'Enable AI and save an API key first.'; return []; }
  try {
    const response = await chrome.runtime.sendMessage({ kind: 'AI_ANALYZE', text });
    if (!response.ok) { aiError = response.error || 'AI request failed.'; console.warn('Privacy Lens:', aiError); return []; }
    aiError = '';
    return response.findings || [];
  } catch { aiError = 'Could not reach the extension background worker.'; return []; }
}

async function scanAi(force = false): Promise<{ ok: boolean; error?: string }> {
  if (aiScanned && !force) return { ok: true };
  aiScanned = true;
  const settings = await chrome.storage.local.get(['aiEnabled', 'apiKey']);
  if (!settings.aiEnabled || !settings.apiKey) return { ok: false, error: 'Enable AI and save an API key first.' };
  if (!document.body) return { ok: false, error: 'This page has no content to scan.' };
  const text = (document.body.innerText || '').slice(0, 5000);
  const found = await analyzeWithAi(text);
  if (aiError) return { ok: false, error: aiError };
  if (!found.length) return { ok: true };
  observer.disconnect();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode() && nodes.length < 3500) { const node = walker.currentNode as Text; if (eligible(node)) nodes.push(node); }
  for (const node of nodes) {
    const value = node.nodeValue || '';
    const findings: Finding[] = [];
    for (const item of found) {
      let index = value.indexOf(item.text);
      while (index >= 0) { findings.push({ ...item, start: index, end: index + item.text.length }); index = value.indexOf(item.text, index + item.text.length); }
    }
    findings.sort((a, b) => a.start - b.start || b.end - a.end);
    const clean: Finding[] = []; let end = -1;
    for (const item of findings) if (item.start >= end) { clean.push(item); end = item.end; }
    wrapNode(node, clean);
  }
  observer.observe(document.body, { childList: true, characterData: true, subtree: true });
  return { ok: true };
}

chrome.runtime.onMessage.addListener((message: { kind?: string; action?: Action; source?: string }, _sender, respond) => {
  if (message.kind === 'ACTION' && message.action) {
    const target = message.source === 'image' && pendingImage ? { kind: 'image' as const, element: pendingImage } : pendingSelection ? { kind: 'selection' as const, range: pendingSelection } : null;
    if (target) applyAction(target, message.action);
    respond({ ok: !!target });
  }
  if (message.kind === 'SCAN_AI') { void scanAi(true).then(respond); return true; }
});
chrome.storage.onChanged.addListener(changes => {
  if (!changes.aiEnabled && !changes.apiKey) return;
  clearTimeout(aiSettingsTimer);
  aiSettingsTimer = window.setTimeout(() => void scanAi(true), 350);
});
window.setTimeout(() => void scanAi(), 1200);
