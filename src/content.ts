import { detect, type Finding } from './detect';

type Action = 'blur' | 'dummy' | 'redact' | 'restore' | 'removeHighlight';
type Target = { kind: 'text'; element: HTMLElement } | { kind: 'image'; element: HTMLImageElement } | { kind: 'selection'; range: Range } | { kind: 'field'; element: HTMLInputElement | HTMLTextAreaElement };
const originalText = new WeakMap<HTMLElement, DocumentFragment>();
const ignoredText = new WeakSet<Text>();
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
  .pl-finding { cursor:pointer!important; border:none!important; border-radius:0!important; box-shadow:none!important; box-decoration-break:clone!important; -webkit-box-decoration-break:clone!important; }
  .pl-finding.pl-high { background:#ffd8dc!important; color:#4a1b24!important; }
  .pl-finding.pl-medium { background:#fff0b8!important; color:#514000!important; }
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
  * { box-sizing:border-box; }
  .bubble { position:fixed; width:min(310px, calc(100vw - 16px)); padding:19px 21px 20px; background:#3d3a48; color:#f8f7fb; border-radius:17px; box-shadow:0 10px 26px #24212e3d; font:13px/1.55 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; visibility:hidden; opacity:0; transform:translateY(var(--enter-y, 6px)) scale(.98); transition:opacity 160ms ease,transform 220ms cubic-bezier(.2,.8,.2,1),visibility 0s linear 220ms; pointer-events:none; }
  .bubble.below { --enter-y:-6px; }
  .bubble.show { visibility:visible; opacity:1; transform:translateY(0) scale(1); transition-delay:0s; }
  .bubble::after { content:""; position:absolute; left:var(--pointer-x, 50%); bottom:-10px; transform:translateX(-50%); border-left:10px solid transparent; border-right:10px solid transparent; border-top:11px solid #3d3a48; }
  .bubble.below::after { top:-10px; bottom:auto; border-top:0; border-bottom:11px solid #3d3a48; }
  .brand { display:flex; align-items:center; gap:8px; margin-bottom:6px; color:#fff; font-size:13px; font-weight:700; }
  .brand-icon { display:grid; place-items:center; width:19px; height:19px; border:2px solid #a9a5ff; border-radius:50%; color:#b8b4ff; font-size:12px; font-weight:750; line-height:1; }
  .copy { color:#dedbe6; overflow-wrap:anywhere; }
  .panel.show { pointer-events:auto; }
  .buttons { display:flex; flex-wrap:wrap; gap:7px; margin-top:14px; }
  button { background:#555160; color:#fff; border:1px solid #706b7b; border-radius:7px; padding:7px 10px; cursor:pointer; font:12px system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; transition:background-color 160ms ease,transform 160ms ease; }
  button:hover,button:focus-visible { background:#696473; transform:translateY(-1px); outline:2px solid #a9a5ff; outline-offset:1px; }
  .notice { pointer-events:none; }
  .hint { width:min(230px, calc(100vw - 16px)); padding:11px 13px 12px; border-radius:12px; font-size:11px; line-height:1.4; }
  .hint .brand { font-size:11px; gap:6px; margin-bottom:4px; }
  .hint .brand-icon { width:15px; height:15px; border-width:1.5px; font-size:10px; }
  @media (prefers-reduced-motion:reduce) { .bubble,button { transition:none; } }
`;
shadow.append(uiStyle);
const panel = document.createElement('div');
panel.className = 'bubble panel';
panel.setAttribute('role', 'dialog');
panel.setAttribute('aria-label', 'TekaSend actions');
const panelBrand = document.createElement('div'); panelBrand.className = 'brand';
const panelIcon = document.createElement('span'); panelIcon.className = 'brand-icon'; panelIcon.textContent = 'i';
panelBrand.append(panelIcon, document.createTextNode('TekaSend'));
const title = document.createElement('div'); title.className = 'copy';
const buttons = document.createElement('div'); buttons.className = 'buttons';
panel.append(panelBrand, title, buttons);
shadow.append(panel);
const notice = document.createElement('div'); notice.className = 'bubble notice'; notice.setAttribute('role', 'status');
const noticeBrand = panelBrand.cloneNode(true);
const noticeCopy = document.createElement('div'); noticeCopy.className = 'copy';
notice.append(noticeBrand, noticeCopy); shadow.append(notice);
const hint = document.createElement('div'); hint.className = 'bubble hint'; hint.setAttribute('role', 'tooltip');
const hintCopy = document.createElement('div'); hintCopy.className = 'copy';
hint.append(panelBrand.cloneNode(true), hintCopy); shadow.append(hint);
let activeHintFinding: HTMLElement | null = null;
let noticeTimeout = 0;

function placeBubble(element: HTMLElement, rect: DOMRect) {
  element.classList.add('show');
  const width = element.offsetWidth;
  const height = element.offsetHeight;
  const center = rect.left + rect.width / 2;
  const left = Math.max(8, Math.min(center - width / 2, innerWidth - width - 8));
  const above = rect.top - height - 18 >= 8 || rect.bottom + height + 18 > innerHeight - 8;
  const top = above ? Math.max(8, rect.top - height - 18) : Math.max(8, Math.min(rect.bottom + 18, innerHeight - height - 8));
  element.classList.toggle('below', !above);
  element.style.left = `${left}px`;
  element.style.top = `${top}px`;
  element.style.setProperty('--pointer-x', `${Math.max(22, Math.min(width - 22, center - left))}px`);
}

function showNotice(message: string, rect: DOMRect) {
  noticeCopy.textContent = message;
  placeBubble(notice, rect);
  clearTimeout(noticeTimeout);
  noticeTimeout = window.setTimeout(() => notice.classList.remove('show'), 6500);
}

function showMenu(target: Target, rect: DOMRect, label: string) {
  currentTarget = target;
  activeHintFinding = null;
  hint.classList.remove('show');
  title.textContent = label.replace(/ · click for actions$/, '');
  buttons.replaceChildren();
  const actions: Action[] = target.kind === 'selection' || target.kind === 'field'
    ? ['blur', 'dummy', 'redact']
    : target.kind === 'text' && !target.element.classList.contains('pl-manual')
      ? ['blur', 'dummy', 'redact', 'removeHighlight']
      : ['blur', 'dummy', 'redact', 'restore'];
  for (const action of actions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = action === 'dummy' ? 'Dummy text' : action === 'removeHighlight' ? 'Remove highlight' : action[0].toUpperCase() + action.slice(1);
    button.addEventListener('click', () => { if (currentTarget) applyAction(currentTarget, action); hideMenu(); });
    buttons.append(button);
  }
  placeBubble(panel, rect);
}
function hideMenu() { panel.classList.remove('show'); currentTarget = null; }

function findingLabel(element: HTMLElement) {
  if (element.classList.contains('pl-manual')) return 'Manually masked text';
  const level = element.classList.contains('pl-medium') ? 'Personal information' : 'Confidential information';
  return `${level}: ${element.getAttribute('data-pl-type') || 'text'}`;
}

function createFinding(finding: Pick<Finding, 'type' | 'severity'>, text: string): HTMLElement {
  const span = document.createElement('span');
  span.className = `pl-finding pl-${finding.severity}`;
  span.setAttribute('data-pl-type', finding.type);
  span.textContent = text;
  const fragment = document.createDocumentFragment(); fragment.append(document.createTextNode(text));
  originalText.set(span, fragment);
  return span;
}

function eligible(node: Text): boolean {
  const parent = node.parentElement;
  return !!parent && !ignoredText.has(node) && !!node.nodeValue?.trim() && !parent.closest('script,style,noscript,textarea,input,select,option,code,pre,[contenteditable],.pl-finding,[data-privacy-lens-ui]') && getComputedStyle(parent).display !== 'none';
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
    element = document.createElement('span'); element.className = 'pl-finding pl-manual'; element.setAttribute('data-pl-type', 'Manual selection');
    const original = range.extractContents(); originalText.set(element, original.cloneNode(true) as DocumentFragment); element.append(original); range.insertNode(element);
    pendingSelection = null;
    getSelection()?.removeAllRanges();
  } else element = target.element;
  const original = originalText.get(element);
  if (action === 'removeHighlight') {
    if (original) {
      const restored = original.cloneNode(true) as DocumentFragment;
      const walker = document.createTreeWalker(restored, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) ignoredText.add(walker.currentNode as Text);
      element.replaceWith(restored);
    }
    return;
  }
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
  if (finding instanceof HTMLElement) { event.preventDefault(); event.stopPropagation(); hint.classList.remove('show'); showMenu({ kind: 'text', element: finding }, finding.getBoundingClientRect(), findingLabel(finding)); return; }
  if (target instanceof HTMLImageElement) { event.preventDefault(); event.stopPropagation(); pendingImage = target; showMenu({ kind: 'image', element: target }, target.getBoundingClientRect(), 'Image actions'); return; }
  hideMenu();
}, true);

function updateFindingHint(event: PointerEvent) {
  const finding = event.target instanceof Element ? event.target.closest('.pl-finding') : null;
  if (!(finding instanceof HTMLElement)) {
    if (activeHintFinding) { activeHintFinding = null; hint.classList.remove('show'); }
    return;
  }
  if (panel.classList.contains('show')) return;
  if (finding === activeHintFinding && hint.classList.contains('show')) return;
  activeHintFinding = finding;
  hintCopy.textContent = finding.classList.contains('pl-manual') ? 'Manually masked text. Click for actions.' : `${finding.getAttribute('data-pl-type') || 'Sensitive text'} detected. Click for actions.`;
  placeBubble(hint, finding.getBoundingClientRect());
}

document.addEventListener('pointerover', updateFindingHint, true);
document.addEventListener('pointermove', updateFindingHint, true);

function pointInsideSelection(range: Range, x: number, y: number) {
  return Array.from(range.getClientRects()).some(rect => x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom);
}

document.addEventListener('pointermove', event => {
  if (!pendingSelection || panel.classList.contains('show') || !pendingSelection.commonAncestorContainer.isConnected) return;
  if (pointInsideSelection(pendingSelection, event.clientX, event.clientY)) {
    showMenu({ kind: 'selection', range: pendingSelection.cloneRange() }, pendingSelection.getBoundingClientRect(), 'Selected text');
  }
}, true);

document.addEventListener('pointerdown', event => {
  if (event.target instanceof Element && event.target.closest('[data-privacy-lens-ui]')) return;
  if (pendingSelection && !pointInsideSelection(pendingSelection, event.clientX, event.clientY)) pendingSelection = null;
}, true);

document.addEventListener('pointerout', event => {
  const finding = event.target instanceof Element ? event.target.closest('.pl-finding') : null;
  if (finding && (!(event.relatedTarget instanceof Node) || !finding.contains(event.relatedTarget))) {
    activeHintFinding = null;
    hint.classList.remove('show');
  }
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
  if (!selection || selection.isCollapsed || !selection.rangeCount || !selection.toString().trim()) { pendingSelection = null; return; }
  const range = selection.getRangeAt(0).cloneRange();
  if (range.commonAncestorContainer.parentElement?.closest('[data-privacy-lens-ui]')) return;
  pendingSelection = range.cloneRange();
  hideMenu();
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
    if (!response.ok) { aiError = response.error || 'AI request failed.'; console.warn('TekaSend:', aiError); return []; }
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
