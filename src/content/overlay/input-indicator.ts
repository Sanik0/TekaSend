/**
 * TekaSend Content Subsystem — In-Field Privacy Indicator & Data Awareness Notice
 *
 * Renders an inline indicator icon at the trailing end inside AI chatbot text inputs and forms.
 * When confidential data or a security threat is detected, displays a compact, sleek iOS-style
 * notice card with one-click smart privacy repairs (Placeholder & Scramble).
 *
 * Multi-Item Scalability:
 * - Compact Summary Header with breakdown chips.
 * - Global One-Click Bulk Actions ("Replace All with Placeholders", "Scramble All", "Restore All").
 * - Max-Height Scrollable Feed (capped at 240px with ultra-slim iOS scrollbar) preventing screen overlap.
 * - Interactive Protection Manager for switching strategies and two-way undo/restore.
 *
 * Conforms to PRD F1 (Data Awareness Notice), PRD F2 (Smart Privacy Repair),
 * PRD F3 (Local Pre-Flight Verification), and gemini.md architecture standards.
 */

import {
  SensitiveFinding,
  RepairStrategyType,
  FindingCategory
} from '../../ai/types.js';
import { RiskAnalyzer } from '../../ai/reasoning/risk-analyzer.js';

export interface ProtectedItem {
  readonly id: string;
  readonly category: FindingCategory;
  readonly label: string;
  readonly originalRawText: string;
  readonly currentToken: string;
  readonly currentStrategy: RepairStrategyType;
  readonly entityIndex?: number;
}

export interface IndicatorActions {
  readonly onApplyRepair: (element: HTMLElement, finding: SensitiveFinding, strategy: RepairStrategyType) => void;
  readonly onApplyRepairAll: (element: HTMLElement, strategy: RepairStrategyType) => void;
  readonly onSwitchStrategy: (element: HTMLElement, item: ProtectedItem, newStrategy: RepairStrategyType) => void;
  readonly onSwitchAllStrategies?: (element: HTMLElement, newStrategy: RepairStrategyType) => void;
  readonly onRestoreOriginal: (element: HTMLElement, item: ProtectedItem) => void;
  readonly onRestoreAll?: (element: HTMLElement) => void;
}

export class InputIndicatorOverlay {
  private readonly shadow: ShadowRoot;
  private readonly riskAnalyzer = new RiskAnalyzer();

  // DOM Elements
  private readonly wrapper: HTMLElement;
  private readonly iconButton: HTMLButtonElement;
  private readonly noticeCard: HTMLElement;
  private readonly noticeReasonList: HTMLElement;

  private currentFindings: readonly SensitiveFinding[] = [];
  private currentProtectedItems: readonly ProtectedItem[] = [];
  private activeElement: HTMLElement | null = null;
  private targetElement: HTMLElement | null = null;
  private isCardVisible = false;
  private actions?: IndicatorActions;
  private resizeObserver: ResizeObserver | null = null;

  public constructor(shadowRoot: ShadowRoot, actions?: IndicatorActions) {
    this.shadow = shadowRoot;
    this.actions = actions;

    const elements = this.buildDomElements();
    this.wrapper = elements.wrapper;
    this.iconButton = elements.iconButton;
    this.noticeCard = elements.noticeCard;
    this.noticeReasonList = elements.noticeReasonList;

    this.shadow.append(this.wrapper);
    this.injectStyles();
    this.attachEventListeners();
    this.initResizeObserver();
  }

  /**
   * Updates indicator with current finding state, protected items, and repositions it inside the field.
   */
  public update(
    element: HTMLElement,
    findings: readonly SensitiveFinding[],
    bounds: DOMRect,
    protectedItems: readonly ProtectedItem[] = []
  ): void {
    if (this.activeElement !== element && this.resizeObserver) {
      if (this.activeElement) {
        this.resizeObserver.unobserve(this.activeElement);
      }
      this.resizeObserver.observe(element);
    }

    this.activeElement = element;
    this.targetElement = element;
    this.currentFindings = findings;
    this.currentProtectedItems = protectedItems;
    this.renderState(findings, protectedItems);
    this.positionInsideField(bounds);
    this.show();
  }

  /**
   * Hides the in-field indicator and popover notice.
   */
  public hide(): void {
    this.wrapper.style.display = 'none';
    this.hideNoticeCard();
    if (this.activeElement && this.resizeObserver) {
      this.resizeObserver.unobserve(this.activeElement);
    }
    this.activeElement = null;
    this.targetElement = null;
  }

  public show(): void {
    this.wrapper.style.display = 'flex';
  }

  public getIsCardVisible(): boolean {
    return this.isCardVisible;
  }

  /**
   * Sets the action delegate for repair and strategy-switching requests.
   */
  public setActions(actions: IndicatorActions): void {
    this.actions = actions;
  }

  private initResizeObserver(): void {
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          if (entry.target === this.activeElement && this.activeElement.isConnected) {
            this.positionInsideField(this.activeElement.getBoundingClientRect());
          }
        }
      });
    }
  }

  /**
   * Positions the indicator icon at the inside-right edge of the text field, centered vertically.
   * Responds dynamically whether input is single line or multi-line.
   */
  private positionInsideField(bounds: DOMRect): void {
    if (bounds.width === 0 || bounds.height === 0 || bounds.bottom < 0 || bounds.top > window.innerHeight) {
      this.hide();
      return;
    }

    const iconSize = 24;

    // Single-line inputs: center vertically. Multiline textareas/prompt boxes: align 8px from top
    const verticalTop = bounds.height > 52
      ? bounds.top + 8
      : bounds.top + Math.max(0, Math.round((bounds.height - iconSize) / 2));

    const trailingRight = window.innerWidth - bounds.right + 8;

    this.wrapper.style.right = `${Math.max(6, trailingRight)}px`;
    this.wrapper.style.top = `${verticalTop}px`;

    // Keep the popover within the viewport when the field is narrow or left-aligned.
    const cardWidth = Math.min(320, window.innerWidth - 20);
    const wrapperRight = Math.max(6, trailingRight);
    const wrapperRightEdge = window.innerWidth - wrapperRight;
    const cardLeft = Math.max(10, Math.min(wrapperRightEdge - cardWidth, window.innerWidth - cardWidth - 10));
    this.noticeCard.style.right = `${wrapperRightEdge - cardLeft - cardWidth}px`;

    this.updateCardPlacement(bounds);
  }

  /**
   * Automatically positions the card above or below the field without cut-offs.
   */
  private updateCardPlacement(bounds: DOMRect): void {
    const spaceAbove = bounds.top;
    const spaceBelow = window.innerHeight - bounds.bottom;

    if (spaceAbove < 240 && spaceBelow >= 180) {
      this.noticeCard.classList.remove('place-above');
      this.noticeCard.classList.add('place-below');
    } else {
      this.noticeCard.classList.remove('place-below');
      this.noticeCard.classList.add('place-above');
    }
  }

  /**
   * Renders the indicator icon based on finding count, severity, and active protections.
   */
  private renderState(
    findings: readonly SensitiveFinding[],
    protectedItems: readonly ProtectedItem[]
  ): void {
    this.iconButton.classList.remove('state-safe', 'state-warning', 'state-critical');

    if (findings.length === 0) {
      this.iconButton.classList.add('state-safe');
      this.iconButton.innerHTML = this.getSafeShieldSvg();

      const tooltipText = protectedItems.length > 0
        ? `TekaSend: Protected (${protectedItems.length} item${protectedItems.length > 1 ? 's' : ''}). Press Alt+P to manage.`
        : 'TekaSend: No privacy risks detected. (Alt+P to scan)';

      this.iconButton.setAttribute('title', tooltipText);
      this.iconButton.setAttribute('aria-label', 'Privacy Protected - Click for options');
    } else {
      const hasCritical = findings.some(f => f.severity === 'critical');
      this.iconButton.classList.add(hasCritical ? 'state-critical' : 'state-warning');
      this.iconButton.innerHTML = this.getWarningShieldSvg(findings.length);
      this.iconButton.setAttribute(
        'title',
        `TekaSend: ${findings.length} security threat${findings.length > 1 ? 's' : ''} detected. Click or press Alt+P to sanitize.`
      );
      this.iconButton.setAttribute('aria-label', `${findings.length} security threats detected`);
    }

    this.renderDataAwarenessNotice(findings, protectedItems);
  }

  /**
   * Renders the interactive Data Awareness Notice card.
   * Handles both threat resolution AND post-repair protection management with compact scrollable view.
   */
  private renderDataAwarenessNotice(
    findings: readonly SensitiveFinding[],
    protectedItems: readonly ProtectedItem[]
  ): void {
    this.noticeReasonList.innerHTML = '';

    // ─────────────────────────────────────────────────────────────
    // CASE 1: Unresolved Threats Detected
    // ─────────────────────────────────────────────────────────────
    if (findings.length > 0) {
      const criticalCount = findings.filter(f => f.severity === 'critical').length;
      const highCount = findings.filter(f => f.severity === 'high').length;
      const mediumCount = findings.filter(f => f.severity === 'medium').length;

      // Summary Header
      const headerRow = document.createElement('div');
      headerRow.className = 'ts-threats-summary-header';
      headerRow.innerHTML = `
        <div class="ts-summary-title-row">
          <span class="ts-summary-title">${findings.length} Threat${findings.length > 1 ? 's' : ''} Detected</span>
          <div class="ts-summary-chips">
            ${criticalCount > 0 ? `<span class="ts-chip critical">${criticalCount} Critical</span>` : ''}
            ${highCount > 0 ? `<span class="ts-chip high">${highCount} High</span>` : ''}
            ${mediumCount > 0 ? `<span class="ts-chip medium">${mediumCount} Medium</span>` : ''}
          </div>
        </div>
      `;
      this.noticeReasonList.append(headerRow);

      // Global One-Click Bulk Actions Bar (for 2+ items)
      if (findings.length > 1) {
        const bulkActionRow = document.createElement('div');
        bulkActionRow.className = 'ts-bulk-actions-bar';
        bulkActionRow.innerHTML = `
          <button type="button" class="ts-bulk-btn primary" id="tsBulkPlaceholders">
            Replace All (Alt+P)
          </button>
          <button type="button" class="ts-bulk-btn secondary" id="tsBulkScramble">
            Scramble All (Alt+S)
          </button>
        `;

        const bulkPlaceholders = bulkActionRow.querySelector('#tsBulkPlaceholders');
        bulkPlaceholders?.addEventListener('click', (e: Event) => {
          e.stopPropagation();
          e.preventDefault();
          const target = this.targetElement || this.activeElement;
          if (target && this.actions) {
            this.actions.onApplyRepairAll(target, 'semantic_placeholder');
          }
        });

        const bulkScramble = bulkActionRow.querySelector('#tsBulkScramble');
        bulkScramble?.addEventListener('click', (e: Event) => {
          e.stopPropagation();
          e.preventDefault();
          const target = this.targetElement || this.activeElement;
          if (target && this.actions) {
            this.actions.onApplyRepairAll(target, 'synthetic_dummy');
          }
        });

        this.noticeReasonList.append(bulkActionRow);
      }

      // Max-Height Scrollable Item List
      const scrollList = document.createElement('div');
      scrollList.className = 'ts-scrollable-items-feed';

      // Group findings by unique rawText to prevent redundant cards
      const uniqueFindingsMap = new Map<string, { finding: SensitiveFinding; count: number }>();
      for (const finding of findings) {
        if (!uniqueFindingsMap.has(finding.rawText)) {
          uniqueFindingsMap.set(finding.rawText, { finding, count: 1 });
        } else {
          uniqueFindingsMap.get(finding.rawText)!.count += 1;
        }
      }

      for (const { finding, count } of uniqueFindingsMap.values()) {
        const risk = this.riskAnalyzer.analyzeRisk(finding.category, finding.rawText, finding.severity);
        const item = document.createElement('div');
        item.className = 'ts-notice-item';

        const maskedPreview = this.maskSecret(finding.rawText);
        const countBadge = count > 1 ? `<span class="ts-count-pill">${count}x</span>` : '';

        item.innerHTML = `
          <div class="ts-item-header">
            <div class="ts-item-tag-group">
              <span class="ts-category-tag ${finding.severity}">${this.getCategoryLabel(finding.category)}</span>
              <span class="ts-code-preview">${maskedPreview}</span>
              ${countBadge}
            </div>
            <span class="ts-severity-badge ${finding.severity}">${finding.severity.toUpperCase()}</span>
          </div>
          <div class="ts-item-reason">${risk.explanation}</div>
          <div class="ts-item-actions">
            <button type="button" class="ts-repair-btn primary" data-strategy="semantic_placeholder">Placeholder</button>
            <button type="button" class="ts-repair-btn" data-strategy="synthetic_dummy">Scramble</button>
          </div>
        `;

        item.querySelectorAll<HTMLButtonElement>('.ts-repair-btn').forEach(btn => {
          btn.addEventListener('pointerdown', (e: PointerEvent) => e.stopPropagation());
          btn.addEventListener('mousedown', (e: MouseEvent) => {
            e.stopPropagation();
            e.preventDefault();
          });
          btn.addEventListener('click', (e: MouseEvent) => {
            e.stopPropagation();
            e.preventDefault();
            const strategy = btn.getAttribute('data-strategy') as RepairStrategyType;
            const target = this.targetElement || this.activeElement;
            if (strategy && target && this.actions) {
              this.actions.onApplyRepair(target, finding, strategy);
            }
          });
        });

        scrollList.append(item);
      }

      this.noticeReasonList.append(scrollList);
      return;
    }

    // ─────────────────────────────────────────────────────────────
    // CASE 2: Protected Items Available for Strategy Switching
    // ─────────────────────────────────────────────────────────────
    if (protectedItems.length > 0) {
      const headerRow = document.createElement('div');
      headerRow.className = 'ts-protected-status-header';
      headerRow.innerHTML = `
        <div class="ts-status-indicator">
          <span class="ts-status-dot"></span>
          <span class="ts-status-title">Protection Active (${protectedItems.length})</span>
        </div>
      `;
      this.noticeReasonList.append(headerRow);

      // Global Actions for Protected State (when 2+ items)
      if (protectedItems.length > 1) {
        const bulkActionRow = document.createElement('div');
        bulkActionRow.className = 'ts-bulk-actions-bar';
        bulkActionRow.innerHTML = `
          <button type="button" class="ts-bulk-btn primary" id="tsSwitchAllBtn" style="flex: 1;">
            Switch All to Scramble (Alt+S)
          </button>
        `;

        const switchAllBtn = bulkActionRow.querySelector('#tsSwitchAllBtn');
        const allPlaceholders = protectedItems.every(p => p.currentStrategy === 'semantic_placeholder');
        if (!allPlaceholders) {
          switchAllBtn!.textContent = 'Switch All to Placeholders (Alt+P)';
        }

        switchAllBtn?.addEventListener('click', (e: Event) => {
          e.stopPropagation();
          e.preventDefault();
          const target = this.targetElement || this.activeElement;
          const nextStrategy = allPlaceholders ? 'synthetic_dummy' : 'semantic_placeholder';
          if (target && this.actions?.onSwitchAllStrategies) {
            this.actions.onSwitchAllStrategies(target, nextStrategy);
          }
        });

        this.noticeReasonList.append(bulkActionRow);
      }

      // Max-Height Scrollable Feed
      const scrollList = document.createElement('div');
      scrollList.className = 'ts-scrollable-items-feed';

      for (const item of protectedItems) {
        const row = document.createElement('div');
        row.className = 'ts-protected-item-card';

        const isPlaceholder = item.currentStrategy === 'semantic_placeholder';
        const targetStrategy = isPlaceholder ? 'synthetic_dummy' : 'semantic_placeholder';
        const switchLabel = isPlaceholder ? 'Scramble' : 'Placeholder';

        row.innerHTML = `
          <div class="ts-protected-item-top">
            <div class="ts-protected-left">
              <span class="ts-category-tag safe">${this.getCategoryLabel(item.category)}</span>
              <span class="ts-protected-token">${this.escapeHtml(item.currentToken)}</span>
            </div>
            <span class="ts-mode-tag">${isPlaceholder ? 'Placeholder' : 'Scrambled'}</span>
          </div>
          <div class="ts-protected-actions">
            <button type="button" class="ts-switch-btn" data-action="switch">${switchLabel}</button>
          </div>
        `;

        const switchBtn = row.querySelector<HTMLButtonElement>('.ts-switch-btn');
        switchBtn?.addEventListener('click', (e: Event) => {
          e.stopPropagation();
          e.preventDefault();
          const target = this.targetElement || this.activeElement;
          if (target && this.actions) {
            this.actions.onSwitchStrategy(target, item, targetStrategy);
          }
        });

        scrollList.append(row);
      }

      this.noticeReasonList.append(scrollList);
      return;
    }

    // ─────────────────────────────────────────────────────────────
    // CASE 3: Clean State (No Threats, No Modifications)
    // ─────────────────────────────────────────────────────────────
    const cleanBox = document.createElement('div');
    cleanBox.className = 'ts-clean-status-box';
    cleanBox.innerHTML = `
      <div class="ts-clean-icon">✓</div>
      <div class="ts-clean-text">
        <strong>Privacy Shield Active</strong>
        <span>No confidential data detected in this input.</span>
      </div>
    `;
    this.noticeReasonList.append(cleanBox);
  }

  private toggleNoticeCard(): void {
    if (this.isCardVisible) {
      this.hideNoticeCard();
    } else {
      this.showNoticeCard();
    }
  }

  private showNoticeCard(): void {
    this.isCardVisible = true;
    const target = this.targetElement || this.activeElement;
    if (target) {
      this.updateCardPlacement(target.getBoundingClientRect());
    }
    this.noticeCard.classList.add('visible');
  }

  private hideNoticeCard(): void {
    this.isCardVisible = false;
    this.noticeCard.classList.remove('visible');
  }

  private attachEventListeners(): void {
    this.iconButton.addEventListener('pointerdown', (event: PointerEvent) => {
      event.stopPropagation();
    });

    this.iconButton.addEventListener('mousedown', (event: MouseEvent) => {
      event.stopPropagation();
      event.preventDefault();
    });

    this.iconButton.addEventListener('click', (event: MouseEvent) => {
      event.stopPropagation();
      event.preventDefault();
      this.toggleNoticeCard();
    });

    this.noticeCard.addEventListener('pointerdown', (event: PointerEvent) => {
      event.stopPropagation();
    });

    this.noticeCard.addEventListener('mousedown', (event: MouseEvent) => {
      event.stopPropagation();
      event.preventDefault();
    });

    this.noticeCard.addEventListener('click', (event: MouseEvent) => {
      event.stopPropagation();
    });

    document.addEventListener('click', (event: MouseEvent) => {
      if (this.isCardVisible && !this.wrapper.contains(event.target as Node)) {
        this.hideNoticeCard();
      }
    });

    window.addEventListener('scroll', () => {
      if (this.activeElement) {
        this.positionInsideField(this.activeElement.getBoundingClientRect());
      }
    }, { passive: true });

    window.addEventListener('resize', () => {
      if (this.activeElement) {
        this.positionInsideField(this.activeElement.getBoundingClientRect());
      }
    }, { passive: true });
  }

  private buildDomElements() {
    const wrapper = document.createElement('div');
    wrapper.className = 'ts-infield-guardian-wrapper';

    const iconButton = document.createElement('button');
    iconButton.type = 'button';
    iconButton.className = 'ts-infield-icon-btn state-safe';

    const noticeCard = document.createElement('div');
    noticeCard.className = 'ts-data-awareness-card place-above';

    const cardHeader = document.createElement('div');
    cardHeader.className = 'ts-card-header';
    cardHeader.innerHTML = `
      <div class="ts-card-brand">
        <span class="ts-brand-logo">TekaSend</span>
        <span class="ts-local-ai-tag">On-Device</span>
      </div>
      <button type="button" class="ts-dismiss-btn" id="tsDismissNotice">✕</button>
    `;

    cardHeader.querySelector('#tsDismissNotice')?.addEventListener('click', (e: Event) => {
      e.stopPropagation();
      e.preventDefault();
      this.hideNoticeCard();
    });

    const noticeReasonList = document.createElement('div');
    noticeReasonList.className = 'ts-card-reasons-list';

    noticeCard.append(cardHeader, noticeReasonList);
    wrapper.append(iconButton, noticeCard);

    return {
      wrapper,
      iconButton,
      noticeCard,
      noticeReasonList
    };
  }

  private injectStyles(): void {
    const style = document.createElement('style');
    style.textContent = `
      .ts-infield-guardian-wrapper {
        position: fixed;
        z-index: 2147483647;
        display: none;
        width: 24px !important;
        height: 24px !important;
        min-width: 24px !important;
        min-height: 24px !important;
        max-width: 24px !important;
        max-height: 24px !important;
        flex-shrink: 0 !important;
        box-sizing: border-box !important;
        align-items: center;
        justify-content: center;
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", "Segoe UI", sans-serif;
        font-size: 12px;
        line-height: 1.4;
        pointer-events: auto !important;
        overflow: visible;
      }

      /* ── Minimalist Dynamic iOS In-Field Icon ── */
      .ts-infield-icon-btn {
        width: 24px !important;
        height: 24px !important;
        min-width: 24px !important;
        min-height: 24px !important;
        max-width: 24px !important;
        max-height: 24px !important;
        flex-shrink: 0 !important;
        box-sizing: border-box !important;
        border-radius: 50%;
        border: none;
        background: transparent;
        cursor: pointer !important;
        pointer-events: auto !important;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        margin: 0;
        outline: none;
        box-shadow: none !important;
        animation: none !important;
        transition: opacity 0.15s ease, transform 0.15s ease;
      }

      .ts-infield-icon-btn svg {
        width: 14px !important;
        height: 14px !important;
        flex-shrink: 0 !important;
      }

      .ts-infield-icon-btn:hover {
        opacity: 0.88;
        transform: scale(1.08);
      }

      .ts-infield-icon-btn:active {
        transform: scale(0.94);
        opacity: 0.75;
      }

      /* Safe State — Clean Minimalist iOS Green */
      .ts-infield-icon-btn.state-safe {
        background: rgba(52, 199, 89, 0.14);
        color: #34c759;
      }

      /* Warning State — Flat Solid iOS Amber */
      .ts-infield-icon-btn.state-warning {
        background: #ff9500;
        color: #ffffff;
      }

      /* Critical State — Flat Solid iOS Red */
      .ts-infield-icon-btn.state-critical {
        background: #ff3b30;
        color: #ffffff;
      }

      /* ── Compact iOS Popover Card ─────────────────────── */
      .ts-data-awareness-card {
        position: absolute;
        right: 0;
        width: 320px;
        max-height: 380px;
        background: rgba(255, 255, 255, 0.98);
        border: 1px solid rgba(60, 60, 67, 0.14);
        border-radius: 14px;
        box-shadow: 0 8px 28px rgba(0, 0, 0, 0.12);
        backdrop-filter: blur(24px);
        -webkit-backdrop-filter: blur(24px);
        padding: 11px 13px;
        display: none;
        flex-direction: column;
        gap: 8px;
        color: #1c1c1e;
        z-index: 2147483647;
        pointer-events: auto !important;
        box-sizing: border-box;
        overflow: hidden;
      }

      .ts-data-awareness-card.place-above {
        bottom: calc(100% + 8px);
        top: auto;
      }

      .ts-data-awareness-card.place-below {
        top: calc(100% + 8px);
        bottom: auto;
      }

      .ts-data-awareness-card.visible {
        display: flex;
      }

      .ts-card-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding-bottom: 5px;
        border-bottom: 1px solid rgba(60, 60, 67, 0.08);
      }

      .ts-card-brand {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .ts-brand-logo {
        font-weight: 700;
        font-size: 12.5px;
        color: #1c1c1e;
        letter-spacing: -0.2px;
      }

      .ts-local-ai-tag {
        font-size: 9.5px;
        font-weight: 600;
        padding: 1px 6px;
        border-radius: 9999px;
        background: rgba(52, 199, 89, 0.12);
        color: #248a3d;
      }

      .ts-dismiss-btn {
        background: transparent;
        border: none;
        font-size: 11px;
        color: #8e8e93;
        cursor: pointer;
        padding: 0 2px;
        line-height: 1;
      }

      .ts-dismiss-btn:hover {
        color: #1c1c1e;
      }

      .ts-card-reasons-list {
        display: flex;
        flex-direction: column;
        gap: 6px;
        overflow: hidden;
      }

      /* ── Threats Summary Header & Chips ── */
      .ts-threats-summary-header {
        padding: 1px 0 2px;
      }

      .ts-summary-title-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .ts-summary-title {
        font-weight: 700;
        font-size: 11.5px;
        color: #1c1c1e;
      }

      .ts-summary-chips {
        display: flex;
        gap: 4px;
      }

      .ts-chip {
        font-size: 8.5px;
        font-weight: 700;
        padding: 1px 5px;
        border-radius: 9999px;
        letter-spacing: 0.2px;
      }

      .ts-chip.critical {
        background: rgba(255, 59, 48, 0.14);
        color: #d70015;
      }

      .ts-chip.high {
        background: rgba(255, 149, 0, 0.14);
        color: #c93400;
      }

      .ts-chip.medium {
        background: rgba(255, 204, 0, 0.18);
        color: #8a6d00;
      }

      /* ── Global One-Click Bulk Actions Bar ── */
      .ts-bulk-actions-bar {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 5px;
        margin-bottom: 2px;
      }

      .ts-bulk-btn {
        padding: 5px 6px;
        font-size: 10px;
        font-weight: 600;
        border-radius: 6px;
        cursor: pointer;
        text-align: center;
        transition: opacity 0.12s ease;
      }

      .ts-bulk-btn.primary {
        background: #5856d6;
        color: #ffffff;
        border: none;
      }

      .ts-bulk-btn.primary:hover {
        opacity: 0.92;
      }

      .ts-bulk-btn.secondary {
        background: #f2f2f7;
        color: #1c1c1e;
        border: 1px solid rgba(60, 60, 67, 0.14);
      }

      .ts-bulk-btn.secondary:hover {
        background: #e5e5ea;
      }

      /* ── Max-Height Scrollable Feed ── */
      .ts-scrollable-items-feed {
        display: flex;
        flex-direction: column;
        gap: 5px;
        max-height: 220px;
        overflow-y: auto;
        overflow-x: hidden;
        padding-right: 2px;
        scrollbar-width: thin;
        scrollbar-color: rgba(60, 60, 67, 0.25) transparent;
      }

      .ts-scrollable-items-feed::-webkit-scrollbar {
        width: 4px;
      }

      .ts-scrollable-items-feed::-webkit-scrollbar-track {
        background: transparent;
      }

      .ts-scrollable-items-feed::-webkit-scrollbar-thumb {
        background: rgba(60, 60, 67, 0.22);
        border-radius: 9999px;
      }

      .ts-scrollable-items-feed::-webkit-scrollbar-thumb:hover {
        background: rgba(60, 60, 67, 0.40);
      }

      /* ── Compact Individual Threat Item ── */
      .ts-notice-item {
        background: rgba(120, 120, 128, 0.05);
        border: 1px solid rgba(60, 60, 67, 0.08);
        border-radius: 8px;
        padding: 6px 8px;
        display: flex;
        flex-direction: column;
        gap: 3px;
      }

      .ts-item-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .ts-item-tag-group {
        display: flex;
        align-items: center;
        gap: 5px;
        overflow: hidden;
      }

      .ts-category-tag {
        font-weight: 600;
        font-size: 10.5px;
        white-space: nowrap;
      }

      .ts-category-tag.safe {
        color: #248a3d;
      }

      .ts-severity-badge {
        font-size: 8px;
        font-weight: 700;
        padding: 1px 4px;
        border-radius: 3px;
        letter-spacing: 0.2px;
        flex-shrink: 0;
      }

      .ts-severity-badge.critical {
        background: rgba(255, 59, 48, 0.14);
        color: #d70015;
      }

      .ts-severity-badge.high {
        background: rgba(255, 149, 0, 0.14);
        color: #c93400;
      }

      .ts-severity-badge.medium {
        background: rgba(255, 204, 0, 0.18);
        color: #8a6d00;
      }

      .ts-code-preview {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 10px;
        background: rgba(0, 0, 0, 0.05);
        padding: 1px 4px;
        border-radius: 3px;
        color: #c41e3a;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 130px;
      }

      .ts-count-pill {
        font-size: 8.5px;
        font-weight: 700;
        background: rgba(0, 122, 255, 0.12);
        color: #007aff;
        padding: 1px 4px;
        border-radius: 4px;
      }

      .ts-item-reason {
        font-size: 10px;
        color: #636366;
        line-height: 1.25;
      }

      .ts-item-actions {
        display: flex;
        gap: 4px;
        margin-top: 1px;
      }

      .ts-repair-btn {
        flex: 1;
        background: #ffffff;
        border: 1px solid rgba(60, 60, 67, 0.16);
        border-radius: 5px;
        padding: 4px 6px;
        font-size: 10px;
        font-weight: 500;
        color: #1c1c1e;
        cursor: pointer;
        text-align: center;
        transition: background 0.12s ease;
      }

      .ts-repair-btn.primary {
        background: #5856d6;
        color: #ffffff;
        border: none;
        font-weight: 600;
      }

      .ts-repair-btn.primary:hover {
        opacity: 0.92;
      }

      .ts-repair-btn:hover:not(.primary) {
        background: #f2f2f7;
        color: #5856d6;
        border-color: #5856d6;
      }

      /* ── Protected Items Manager View ── */
      .ts-protected-status-header {
        padding: 1px 0 2px;
      }

      .ts-status-indicator {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .ts-status-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: #34c759;
      }

      .ts-status-title {
        font-weight: 700;
        font-size: 11.5px;
        color: #1c1c1e;
      }

      .ts-protected-item-card {
        background: rgba(52, 199, 89, 0.06);
        border: 1px solid rgba(52, 199, 89, 0.20);
        border-radius: 7px;
        padding: 6px 7px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
      }

      .ts-protected-left {
        display: flex;
        flex-direction: column;
        gap: 1px;
        overflow: hidden;
      }

      .ts-mode-tag {
        font-size: 8.5px;
        font-weight: 600;
        background: rgba(60, 60, 67, 0.08);
        padding: 1px 4px;
        border-radius: 3px;
        color: #3a3a3c;
        align-self: flex-start;
      }

      .ts-protected-token {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 10px;
        color: #198754;
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 140px;
      }

      .ts-protected-actions {
        display: flex;
        gap: 4px;
        flex-shrink: 0;
      }

      .ts-switch-btn {
        background: #5856d6;
        color: #ffffff;
        border: none;
        border-radius: 6px;
        padding: 4px 8px;
        font-size: 10px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.14s ease;
      }

      .ts-switch-btn:hover {
        opacity: 0.90;
        transform: translateY(-0.5px);
      }

      /* Clean State Box */
      .ts-clean-status-box {
        display: flex;
        align-items: center;
        gap: 8px;
        background: rgba(52, 199, 89, 0.08);
        border: 1px solid rgba(52, 199, 89, 0.18);
        border-radius: 8px;
        padding: 10px 10px;
      }

      .ts-clean-icon {
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background: #34c759;
        color: #ffffff;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        font-weight: 700;
        flex-shrink: 0;
      }

      .ts-clean-text {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .ts-clean-text strong {
        font-size: 11.5px;
        color: #1c1c1e;
      }

      .ts-clean-text span {
        font-size: 10px;
        color: #636366;
      }
    `;
    this.shadow.append(style);
  }

  // ── Clean iOS SVG Icons ───────────────────────────────────────

  private getSafeShieldSvg(): string {
    return `
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M8 1.5L2 4.2V8C2 11.3 4.6 14.4 8 15.2C11.4 14.4 14 11.3 14 8V4.2L8 1.5Z" stroke="#34c759" stroke-width="1.5" stroke-linejoin="round"/>
        <path d="M5.5 8L7.2 9.7L10.5 6.3" stroke="#34c759" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;
  }

  private getWarningShieldSvg(count: number): string {
    return `
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M8 1.5L2 4.2V8C2 11.3 4.6 14.4 8 15.2C11.4 14.4 14 11.3 14 8V4.2L8 1.5Z" fill="currentColor"/>
        <text x="8" y="10.8" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="8.5" font-weight="700" fill="#ffffff" text-anchor="middle">${count}</text>
      </svg>
    `;
  }

  private getCategoryLabel(cat: FindingCategory): string {
    switch (cat) {
      case 'api_key': return 'API Key / Secret';
      case 'private_key': return 'Private Key';
      case 'password': return 'Password';
      case 'bearer_token': return 'Auth Token';
      case 'credit_card': return 'Payment Card';
      case 'ssn': return 'SSN / ID';
      case 'email': return 'Email Address';
      case 'phone': return 'Phone Number';
      case 'person_name': return 'Personal Identifier';
      case 'address': return 'Location';
      case 'ip_address': return 'IP Address';
      default: return 'Confidential Data';
    }
  }

  private maskSecret(raw: string): string {
    if (raw.length <= 6) return '••••••';
    return `${raw.slice(0, 4)}••••${raw.slice(-3)}`;
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
