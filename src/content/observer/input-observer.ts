/**
 * TekaSend Content Subsystem — Input Field Observer
 *
 * Monitors user typing, pasting, and focus events across AI chatbot prompts,
 * textareas, input fields, and contenteditable elements.
 * Adheres strictly to PRD F1 and gemini.md architecture standards.
 */

export interface FieldChangeEvent {
  readonly element: HTMLElement;
  readonly text: string;
  readonly bounds: DOMRect;
  readonly isPassword: boolean;
}

export type FieldChangeCallback = (event: FieldChangeEvent) => void;
export type FieldBlurCallback = () => void;

export class InputObserver {
  private activeElement: HTMLElement | null = null;
  private debounceTimer = 0;
  private readonly onFieldChange: FieldChangeCallback;
  private readonly onFieldBlur: FieldBlurCallback;

  public constructor(onFieldChange: FieldChangeCallback, onFieldBlur: FieldBlurCallback) {
    this.onFieldChange = onFieldChange;
    this.onFieldBlur = onFieldBlur;
    this.attachListeners();
  }

  /**
   * Binds global capture-phase event listeners for seamless chatbot prompt observation.
   */
  private attachListeners(): void {
    document.addEventListener('focusin', (event: FocusEvent) => this.handleFocus(event), true);
    document.addEventListener('input', (event: Event) => this.handleInput(event), true);
    document.addEventListener('keyup', (event: KeyboardEvent) => this.handleInput(event), true);
    document.addEventListener('paste', (event: ClipboardEvent) => this.handlePaste(event), true);
    document.addEventListener('cut', (event: ClipboardEvent) => this.handlePaste(event), true);
    document.addEventListener('change', (event: Event) => this.handleInput(event), true);
    document.addEventListener('focusout', (event: FocusEvent) => this.handleBlur(event), true);
    document.addEventListener('scroll', () => this.handleScroll(), { capture: true, passive: true });
  }

  /**
   * Handles focus event on supported inputs, ignoring password fields.
   */
  private handleFocus(event: FocusEvent): void {
    const target = this.resolveEligibleField(event.target);
    if (target) {
      this.activeElement = target;
      this.triggerUpdate(target);
    }
  }

  /**
   * Handles user keystroke input with ultra-low latency for instant real-time scanning.
   */
  private handleInput(event: Event): void {
    const target = this.resolveEligibleField(event.target);
    if (target) {
      this.activeElement = target;
      clearTimeout(this.debounceTimer);
      // 16ms (~1 frame) for instant real-time updates without input lag
      this.debounceTimer = window.setTimeout(() => {
        this.triggerUpdate(target);
      }, 16);
    }
  }

  /**
   * Handles paste event for instant sensitive data inspection.
   */
  private handlePaste(event: ClipboardEvent): void {
    const target = this.resolveEligibleField(event.target);
    if (target) {
      this.activeElement = target;
      window.setTimeout(() => {
        this.triggerUpdate(target);
      }, 10);
    }
  }

  /**
   * Handles scroll event inside textareas or scrollable containers.
   */
  private handleScroll(): void {
    if (this.activeElement && this.activeElement.isConnected) {
      this.triggerUpdate(this.activeElement);
    }
  }

  /**
   * Handles blur event when user navigates away from the active input.
   */
  private handleBlur(event: FocusEvent): void {
    const target = this.resolveEligibleField(event.target);
    if (target && target === this.activeElement) {
      window.setTimeout(() => {
        const active = document.activeElement;
        if (
          !this.activeElement ||
          !this.activeElement.isConnected ||
          (active && active !== this.activeElement && !this.activeElement.contains(active) && active !== document.body)
        ) {
          if (document.activeElement !== this.activeElement) {
            this.activeElement = null;
            this.onFieldBlur();
          }
        }
      }, 250);
    }
  }

  /**
   * Extracts text and triggers the change callback.
   */
  private triggerUpdate(element: HTMLElement): void {
    if (!element.isConnected) {
      this.activeElement = null;
      this.onFieldBlur();
      return;
    }

    const text = this.extractFieldText(element);
    const bounds = element.getBoundingClientRect();
    const isPassword = element instanceof HTMLInputElement && element.type.toLowerCase() === 'password';

    this.onFieldChange({
      element,
      text,
      bounds,
      isPassword
    });
  }

  /**
   * Returns the currently focused and observed input element if valid.
   */
  public getActiveElement(): HTMLElement | null {
    if (this.activeElement && this.activeElement.isConnected) {
      return this.activeElement;
    }
    const currentActive = document.activeElement;
    if (currentActive instanceof HTMLElement) {
      return this.resolveEligibleField(currentActive);
    }
    return null;
  }

  /**
   * Safely extracts text value from input, textarea, or contenteditable.
   */
  public extractFieldText(element: HTMLElement): string {
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      return element.value;
    }
    if (element.isContentEditable || element.getAttribute('contenteditable') === 'true') {
      return element.innerText?.replace(/\r?\n$/g, '') || element.textContent || '';
    }
    return element.textContent || '';
  }

  public setFieldText(element: HTMLElement, sanitizedText: string): void {
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      try {
        element.focus();
      } catch {}

      let replacedViaExec = false;
      try {
        element.setSelectionRange(0, element.value.length);
        // execCommand preserves native browser Ctrl+Z / Cmd+Z Undo stack
        replacedViaExec = document.execCommand('insertText', false, sanitizedText);
      } catch {
        replacedViaExec = false;
      }

      if (!replacedViaExec || element.value !== sanitizedText) {
        // 1. Reset React 15/16+ ValueTracker internal state if present
        const reactTracker = (element as unknown as { _valueTracker?: { setValue(v: string): void } })._valueTracker;
        if (reactTracker) {
          reactTracker.setValue(sanitizedText + '_prev');
        }

        // 2. Call prototype setter to bypass any instance-level property overrides
        const prototype = element instanceof HTMLInputElement
          ? window.HTMLInputElement.prototype
          : window.HTMLTextAreaElement.prototype;
        const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

        if (prototypeValueSetter) {
          prototypeValueSetter.call(element, sanitizedText);
        } else {
          element.value = sanitizedText;
        }

        element.value = sanitizedText;

        // 3. Set selection and cursor position at end
        try {
          if (typeof element.setSelectionRange === 'function') {
            element.setSelectionRange(sanitizedText.length, sanitizedText.length);
          }
        } catch {}
      }

      // 4. Dispatch native React / DOM event sequence
      element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));

      try {
        element.dispatchEvent(new InputEvent('input', {
          bubbles: true,
          composed: true,
          inputType: 'insertReplacementText',
          data: sanitizedText
        }));
      } catch {}
    } else if (element.isContentEditable || element.getAttribute('contenteditable') === 'true') {
      try {
        element.focus();
      } catch {}

      let replaced = false;
      try {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(element);
        selection?.removeAllRanges();
        selection?.addRange(range);

        replaced = document.execCommand('insertText', false, sanitizedText);
      } catch {
        replaced = false;
      }

      if (!replaced) {
        element.innerText = sanitizedText;
        element.textContent = sanitizedText;
      }

      element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));

      try {
        element.dispatchEvent(new InputEvent('input', {
          bubbles: true,
          composed: true,
          inputType: 'insertReplacementText',
          data: sanitizedText
        }));
      } catch {}
    }
  }

  /**
   * Resolves the root editable element for an event target.
   * For rich text / contenteditable editors (e.g. ChatGPT, Claude, Lexical), resolves
   * to the root editable container rather than an isolated inner child paragraph.
   */
  public resolveEligibleField(target: EventTarget | null): HTMLElement | null {
    if (!target || !(target instanceof HTMLElement)) {
      return null;
    }

    if (target instanceof HTMLInputElement) {
      const type = target.type.toLowerCase();
      if (['password', 'hidden', 'submit', 'button', 'checkbox', 'radio', 'file'].includes(type)) {
        return null;
      }
      return target;
    }

    if (target instanceof HTMLTextAreaElement) {
      return target;
    }

    if (target.isContentEditable || target.getAttribute('contenteditable') === 'true') {
      const root = target.closest<HTMLElement>('[contenteditable="true"], [contenteditable=""]') || target;
      return root;
    }

    const parentEditable = target.closest<HTMLElement>('[contenteditable="true"], [contenteditable=""]');
    if (parentEditable) {
      return parentEditable;
    }

    return null;
  }

  /**
   * Determines if a DOM element is an eligible editable text container.
   * Explicitly excludes password fields to respect Section 4.1 security policy.
   */
  private isEligibleField(target: EventTarget | null): target is HTMLElement {
    return this.resolveEligibleField(target) !== null;
  }

  public getActiveField(): HTMLElement | null {
    return this.activeElement;
  }
}
