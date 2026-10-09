/**
 * TekaSend Content Subsystem — In-Field Sensitive Word Highlighter & Micro-Tooltip
 *
 * Renders light, iOS-style non-intrusive highlight spans directly over detected
 * sensitive words inside input fields, textareas, and AI chatbot prompts.
 *
 * Features:
 * - Critical / High severity: Light iOS Red tint (rgba(255, 59, 48, 0.20))
 * - Medium / Low severity: Light iOS Yellow/Amber tint (rgba(255, 204, 0, 0.25))
 * - Direct Word Micro-Tooltip: Hovering or clicking on a highlighted word reveals
 *   a sleek iOS micro-pill popup for fast 1-click individual repairs ("Placeholder" & "Scramble").
 * - Real-time synchronization on typing, scrolling, resizing, and one-click repairs.
 * - Instantly removes highlights when sensitive data is replaced or resolved.
 */

import { SensitiveFinding, RepairStrategyType, FindingCategory } from '../../ai/types.js';

const STYLES_TO_COPY = [
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'letterSpacing',
  'lineHeight',
  'textTransform',
  'wordSpacing',
  'textIndent',
  'whiteSpace',
  'wordWrap',
  'wordBreak',
  'overflowWrap',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'boxSizing',
  'textAlign'
] as const;

export type WordRepairCallback = (
  element: HTMLElement,
  finding: SensitiveFinding,
  strategy: RepairStrategyType
) => void;

export class InputHighlighter {
  private readonly shadow: ShadowRoot;
  private readonly container: HTMLElement;
  private readonly mirror: HTMLElement;
  private readonly microTooltip: HTMLElement;
  private activeElement: HTMLElement | null = null;
  private currentFindings: readonly SensitiveFinding[] = [];
  private onApplyRepair?: WordRepairCallback;
  private activeHoverFinding: SensitiveFinding | null = null;
  private hideTooltipTimer = 0;
  private isTooltipPinned = false;
  private rafId = 0;

  public constructor(shadowRoot: ShadowRoot, onApplyRepair?: WordRepairCallback) {
    this.shadow = shadowRoot;
    this.onApplyRepair = onApplyRepair;

    // Overlay container for highlight boxes
    this.container = document.createElement('div');
    this.container.className = 'ts-infield-highlights-layer';
    this.shadow.append(this.container);

    // Hidden mirror element for measuring <input> and <textarea> coordinates
    this.mirror = document.createElement('div');
    this.mirror.className = 'ts-input-measurement-mirror';
    this.shadow.append(this.mirror);

    // Direct Word Micro-Tooltip (iOS-style micro pill)
    this.microTooltip = document.createElement('div');
    this.microTooltip.className = 'ts-word-micro-tooltip';
    this.shadow.append(this.microTooltip);

    this.injectStyles();
    this.attachGlobalListeners();
  }

  public setOnApplyRepair(callback: WordRepairCallback): void {
    this.onApplyRepair = callback;
  }

  /**
   * Updates in-field highlights for the target element and current findings.
   */
  public update(element: HTMLElement, findings: readonly SensitiveFinding[]): void {
    this.activeElement = element;
    this.currentFindings = findings;

    if (!element.isConnected || findings.length === 0) {
      this.clear();
      return;
    }

    this.render();
  }

  /**
   * Clears all active in-field highlights and hides micro-tooltip.
   */
  public clear(): void {
    this.container.innerHTML = '';
    this.currentFindings = [];
    this.activeElement = null;
    this.hideMicroTooltip();
  }

  /**
   * Re-computes and re-renders highlight positions (e.g. during scroll or resize).
   */
  public reposition(): void {
    if (!this.activeElement || this.currentFindings.length === 0) return;
    cancelAnimationFrame(this.rafId);
    this.rafId = requestAnimationFrame(() => {
      if (this.activeElement && this.currentFindings.length > 0) {
        this.render();
        this.hideMicroTooltip();
      }
    });
  }

  /**
   * Renders the highlight boxes based on element type.
   */
  private render(): void {
    const el = this.activeElement;
    if (!el || !el.isConnected || this.currentFindings.length === 0) {
      this.container.innerHTML = '';
      return;
    }

    const bounds = el.getBoundingClientRect();
    if (bounds.width === 0 || bounds.height === 0 || bounds.bottom < 0 || bounds.top > window.innerHeight) {
      this.container.innerHTML = '';
      return;
    }

    this.container.innerHTML = '';

    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      this.renderInputHighlights(el, bounds, this.currentFindings);
    } else if (el.isContentEditable || el.getAttribute('contenteditable') === 'true') {
      this.renderContentEditableHighlights(el, bounds, this.currentFindings);
    }
  }

  /**
   * Renders pixel-accurate highlights for <input> and <textarea> via style-mirrored DOM ranges.
   */
  private renderInputHighlights(
    input: HTMLInputElement | HTMLTextAreaElement,
    bounds: DOMRect,
    findings: readonly SensitiveFinding[]
  ): void {
    const text = input.value;
    if (!text) return;

    const computed = window.getComputedStyle(input);
    const isSingleLine = input instanceof HTMLInputElement;

    // Synchronize mirror styling with target field
    this.mirror.style.width = `${input.clientWidth}px`;
    this.mirror.style.height = `${input.clientHeight}px`;
    for (const prop of STYLES_TO_COPY) {
      (this.mirror.style as unknown as Record<string, string>)[prop] = computed[prop as keyof CSSStyleDeclaration] as string;
    }
    this.mirror.style.whiteSpace = isSingleLine ? 'pre' : 'pre-wrap';
    this.mirror.style.wordBreak = 'break-word';
    this.mirror.style.overflowWrap = 'break-word';

    // Populate mirror with segmented text
    this.mirror.innerHTML = '';
    let lastIndex = 0;
    const spanMap = new Map<SensitiveFinding, HTMLSpanElement[]>();

    for (const finding of findings) {
      if (finding.start < lastIndex || finding.start >= text.length) continue;

      if (finding.start > lastIndex) {
        this.mirror.append(document.createTextNode(text.slice(lastIndex, finding.start)));
      }

      const findingSpan = document.createElement('span');
      findingSpan.className = 'ts-mirror-target';
      findingSpan.textContent = text.slice(finding.start, Math.min(finding.end, text.length));
      this.mirror.append(findingSpan);

      spanMap.set(finding, [findingSpan]);
      lastIndex = Math.min(finding.end, text.length);
    }

    if (lastIndex < text.length) {
      this.mirror.append(document.createTextNode(text.slice(lastIndex)));
    }

    const mirrorRect = this.mirror.getBoundingClientRect();
    const scrollLeft = input.scrollLeft;
    const scrollTop = input.scrollTop;

    // Create highlight rectangles
    for (const [finding, spans] of spanMap.entries()) {
      for (const span of spans) {
        const clientRects = span.getClientRects();
        for (const rect of Array.from(clientRects)) {
          const relLeft = rect.left - mirrorRect.left - scrollLeft;
          const relTop = rect.top - mirrorRect.top - scrollTop;

          const screenLeft = bounds.left + relLeft;
          const screenTop = bounds.top + relTop;
          const width = rect.width;
          const height = rect.height;

          // Clip highlights inside the input bounds
          if (
            screenLeft + width < bounds.left ||
            screenLeft > bounds.right ||
            screenTop + height < bounds.top ||
            screenTop > bounds.bottom
          ) {
            continue;
          }

          const clippedLeft = Math.max(bounds.left + 2, screenLeft);
          const clippedRight = Math.min(bounds.right - 2, screenLeft + width);
          const clippedTop = Math.max(bounds.top + 2, screenTop);
          const clippedBottom = Math.min(bounds.bottom - 2, screenTop + height);

          if (clippedRight <= clippedLeft || clippedBottom <= clippedTop) {
            continue;
          }

          this.createHighlightBox(
            clippedLeft,
            clippedTop,
            clippedRight - clippedLeft,
            clippedBottom - clippedTop,
            finding
          );
        }
      }
    }
  }

  /**
   * Renders native DOM Range client-rect highlights for contenteditable chatbot prompt boxes.
   */
  private renderContentEditableHighlights(
    root: HTMLElement,
    bounds: DOMRect,
    findings: readonly SensitiveFinding[]
  ): void {
    const textNodes: { node: Text; start: number; end: number }[] = [];
    let currentOffset = 0;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let currentNode: Node | null;
    while ((currentNode = walker.nextNode())) {
      const textNode = currentNode as Text;
      const len = textNode.nodeValue?.length || 0;
      if (len > 0) {
        textNodes.push({
          node: textNode,
          start: currentOffset,
          end: currentOffset + len
        });
        currentOffset += len;
      }
    }

    for (const finding of findings) {
      const startNodeInfo = textNodes.find(tn => finding.start >= tn.start && finding.start < tn.end);
      const endNodeInfo = textNodes.find(tn => finding.end > tn.start && finding.end <= tn.end) || textNodes[textNodes.length - 1];

      if (!startNodeInfo || !endNodeInfo) continue;

      try {
        const range = document.createRange();
        range.setStart(startNodeInfo.node, finding.start - startNodeInfo.start);
        range.setEnd(endNodeInfo.node, Math.min(finding.end - endNodeInfo.start, endNodeInfo.node.nodeValue?.length || 0));

        const rects = range.getClientRects();
        for (const rect of Array.from(rects)) {
          if (rect.width <= 0 || rect.height <= 0) continue;

          if (
            rect.right < bounds.left ||
            rect.left > bounds.right ||
            rect.bottom < bounds.top ||
            rect.top > bounds.bottom
          ) {
            continue;
          }

          this.createHighlightBox(
            rect.left,
            rect.top,
            rect.width,
            rect.height,
            finding
          );
        }
      } catch {
        // Fallback gracefully on range boundary mismatch
      }
    }
  }

  /**
   * Creates an interactive, light iOS-style highlight rectangle in the overlay.
   */
  private createHighlightBox(
    left: number,
    top: number,
    width: number,
    height: number,
    finding: SensitiveFinding
  ): void {
    const box = document.createElement('div');
    const isCritical = finding.severity === 'critical' || finding.severity === 'high';

    box.className = `ts-infield-highlight ${isCritical ? 'ts-hl-critical' : 'ts-hl-medium'}`;
    box.style.left = `${left}px`;
    box.style.top = `${top}px`;
    box.style.width = `${width}px`;
    box.style.height = `${height}px`;

    // Prevent mousedown/pointerdown from blurring the active input element!
    box.addEventListener('pointerdown', (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
    });

    box.addEventListener('mousedown', (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
    });

    // Hover reveals the micro-tooltip with generous grace period
    box.addEventListener('mouseenter', () => {
      clearTimeout(this.hideTooltipTimer);
      const targetRect = new DOMRect(left, top, width, height);
      this.showMicroTooltip(finding, targetRect);
    });

    box.addEventListener('mouseleave', () => {
      this.scheduleHideMicroTooltip();
    });

    // Single Click: Pin the micro-tooltip open
    box.addEventListener('click', (e: MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      this.isTooltipPinned = true;
      const targetRect = new DOMRect(left, top, width, height);
      this.showMicroTooltip(finding, targetRect);

      // Keep focus in input
      if (this.activeElement && document.activeElement !== this.activeElement) {
        try {
          this.activeElement.focus();
        } catch {}
      }
    });

    // Double Click: Select the word in the input so user can edit/type
    box.addEventListener('dblclick', (e: MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      this.hideMicroTooltip();
      const el = this.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        try {
          el.focus();
          el.setSelectionRange(finding.start, finding.end);
        } catch {}
      }
    });

    this.container.append(box);
  }

  /**
   * Displays the sleek iOS Direct Word Micro-Tooltip right above the highlighted word.
   */
  private showMicroTooltip(finding: SensitiveFinding, rect: DOMRect): void {
    this.activeHoverFinding = finding;
    clearTimeout(this.hideTooltipTimer);

    const isCritical = finding.severity === 'critical' || finding.severity === 'high';
    const categoryLabel = this.getCategoryLabel(finding.category);

    this.microTooltip.innerHTML = `
      <span class="ts-micro-badge ${isCritical ? 'critical' : 'medium'}">${categoryLabel}</span>
      <button type="button" class="ts-micro-btn primary" id="tsMicroPlaceholder">Placeholder</button>
      <button type="button" class="ts-micro-btn secondary" id="tsMicroScramble">Scramble</button>
    `;

    const placeholderBtn = this.microTooltip.querySelector('#tsMicroPlaceholder');
    placeholderBtn?.addEventListener('pointerdown', (e: Event) => e.stopPropagation());
    placeholderBtn?.addEventListener('mousedown', (e: Event) => {
      e.stopPropagation();
      e.preventDefault();
    });
    placeholderBtn?.addEventListener('click', (e: Event) => {
      e.stopPropagation();
      e.preventDefault();
      const target = this.activeElement;
      this.hideMicroTooltip();
      if (target && this.onApplyRepair) {
        this.onApplyRepair(target, finding, 'semantic_placeholder');
      }
    });

    const scrambleBtn = this.microTooltip.querySelector('#tsMicroScramble');
    scrambleBtn?.addEventListener('pointerdown', (e: Event) => e.stopPropagation());
    scrambleBtn?.addEventListener('mousedown', (e: Event) => {
      e.stopPropagation();
      e.preventDefault();
    });
    scrambleBtn?.addEventListener('click', (e: Event) => {
      e.stopPropagation();
      e.preventDefault();
      const target = this.activeElement;
      this.hideMicroTooltip();
      if (target && this.onApplyRepair) {
        this.onApplyRepair(target, finding, 'synthetic_dummy');
      }
    });

    // Position micro-pill centrally above the word
    this.microTooltip.classList.add('show');
    const tooltipWidth = 195;
    const tooltipHeight = 32;

    const left = Math.max(
      8,
      Math.min(rect.left + (rect.width - tooltipWidth) / 2, window.innerWidth - tooltipWidth - 8)
    );

    const placeAbove = rect.top >= tooltipHeight + 8;
    const top = placeAbove
      ? rect.top - tooltipHeight - 6
      : rect.bottom + 6;

    this.microTooltip.classList.toggle('place-below', !placeAbove);
    this.microTooltip.style.left = `${left}px`;
    this.microTooltip.style.top = `${top}px`;
  }

  private scheduleHideMicroTooltip(): void {
    if (this.isTooltipPinned) return;
    clearTimeout(this.hideTooltipTimer);
    this.hideTooltipTimer = window.setTimeout(() => {
      this.hideMicroTooltip();
    }, 450);
  }

  private hideMicroTooltip(): void {
    this.microTooltip.classList.remove('show');
    this.activeHoverFinding = null;
    this.isTooltipPinned = false;
  }

  private attachGlobalListeners(): void {
    const repositionHandler = () => this.reposition();
    window.addEventListener('scroll', repositionHandler, { passive: true });
    window.addEventListener('resize', repositionHandler, { passive: true });
    document.addEventListener('scroll', repositionHandler, { capture: true, passive: true });

    this.microTooltip.addEventListener('mouseenter', () => {
      clearTimeout(this.hideTooltipTimer);
    });

    this.microTooltip.addEventListener('mouseleave', () => {
      this.scheduleHideMicroTooltip();
    });

    document.addEventListener('pointerdown', (e: PointerEvent) => {
      const target = e.target as Node;
      if (!this.microTooltip.contains(target) && !this.container.contains(target)) {
        this.hideMicroTooltip();
      }
    });

    document.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.hideMicroTooltip();
      }
    });
  }

  private injectStyles(): void {
    const style = document.createElement('style');
    style.textContent = `
      .ts-infield-highlights-layer {
        position: fixed;
        inset: 0;
        pointer-events: none !important;
        z-index: 2147483645;
        overflow: hidden;
      }

      /* ── Minimalist iOS Light Highlight Tint ── */
      .ts-infield-highlight {
        position: fixed;
        pointer-events: auto !important;
        cursor: pointer !important;
        border-radius: 3px;
        transition: background-color 0.12s ease, opacity 0.12s ease;
        mix-blend-mode: multiply;
      }

      .ts-infield-highlight:hover {
        filter: brightness(0.95);
      }

      /* Critical & High Risk: Light iOS Red */
      .ts-infield-highlight.ts-hl-critical {
        background: rgba(255, 59, 48, 0.20) !important;
        box-shadow: inset 0 0 0 1px rgba(255, 59, 48, 0.40), 0 1px 2px rgba(255, 59, 48, 0.15) !important;
      }

      /* Medium & Low Risk: Light iOS Yellow / Amber */
      .ts-infield-highlight.ts-hl-medium {
        background: rgba(255, 204, 0, 0.25) !important;
        box-shadow: inset 0 0 0 1px rgba(255, 204, 0, 0.50), 0 1px 2px rgba(255, 204, 0, 0.15) !important;
      }

      /* Measurement mirror (hidden offscreen) */
      .ts-input-measurement-mirror {
        position: fixed !important;
        top: -99999px !important;
        left: -99999px !important;
        visibility: hidden !important;
        pointer-events: none !important;
        opacity: 0 !important;
        overflow: hidden !important;
      }

      .ts-mirror-target {
        display: inline;
        box-decoration-break: clone;
        -webkit-box-decoration-break: clone;
      }

      /* ── In-Field Direct Word Micro-Tooltip ── */
      .ts-word-micro-tooltip {
        position: fixed;
        z-index: 2147483647;
        display: none;
        align-items: center;
        gap: 5px;
        background: rgba(255, 255, 255, 0.98);
        border: 1px solid rgba(60, 60, 67, 0.16);
        border-radius: 9px;
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.14), 0 2px 6px rgba(0, 0, 0, 0.08);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        padding: 4px 6px;
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", "Segoe UI", sans-serif;
        font-size: 11px;
        line-height: 1;
        pointer-events: auto !important;
        opacity: 0;
        transform: translateY(4px) scale(0.96);
        transition: opacity 0.12s ease, transform 0.12s ease;
        box-sizing: border-box;
      }

      .ts-word-micro-tooltip.show {
        display: flex;
        opacity: 1;
        transform: translateY(0) scale(1);
      }

      /* Hover buffer bridge preventing dead zones during mouse transit */
      .ts-word-micro-tooltip::before {
        content: "";
        position: absolute;
        inset: -12px -10px -12px -10px;
        pointer-events: auto;
        z-index: -1;
      }

      .ts-word-micro-tooltip::after {
        content: "";
        position: absolute;
        bottom: -5px;
        left: 50%;
        transform: translateX(-50%);
        border-left: 5px solid transparent;
        border-right: 5px solid transparent;
        border-top: 5px solid #ffffff;
      }

      .ts-word-micro-tooltip.place-below::after {
        top: -5px;
        bottom: auto;
        border-top: none;
        border-bottom: 5px solid #ffffff;
      }

      .ts-micro-badge {
        font-size: 9px;
        font-weight: 700;
        padding: 2px 5px;
        border-radius: 4px;
        letter-spacing: 0.2px;
        white-space: nowrap;
      }

      .ts-micro-badge.critical {
        background: rgba(255, 59, 48, 0.14);
        color: #d70015;
      }

      .ts-micro-badge.medium {
        background: rgba(255, 204, 0, 0.20);
        color: #8a6d00;
      }

      .ts-micro-btn {
        background: #5856d6;
        color: #ffffff;
        border: none;
        border-radius: 5px;
        padding: 4px 7px;
        font-size: 10px;
        font-weight: 600;
        cursor: pointer !important;
        display: flex;
        align-items: center;
        gap: 3px;
        transition: opacity 0.12s ease;
        white-space: nowrap;
      }

      .ts-micro-btn:hover {
        opacity: 0.90;
      }

      .ts-micro-btn.secondary {
        background: #f2f2f7;
        color: #1c1c1e;
        border: 1px solid rgba(60, 60, 67, 0.14);
      }

      .ts-micro-btn.secondary:hover {
        background: #e5e5ea;
      }
    `;
    this.shadow.append(style);
  }

  private getCategoryLabel(cat: FindingCategory): string {
    switch (cat) {
      case 'api_key': return 'API Key';
      case 'private_key': return 'Private Key';
      case 'password': return 'Password';
      case 'bearer_token': return 'Token';
      case 'credit_card': return 'Card';
      case 'ssn': return 'SSN';
      case 'email': return 'Email';
      case 'phone': return 'Phone';
      case 'person_name': return 'Name';
      case 'address': return 'Location';
      case 'ip_address': return 'IP';
      default: return 'Secret';
    }
  }
}
