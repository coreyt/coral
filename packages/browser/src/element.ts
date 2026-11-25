/** The `<coral-diagram>` custom element, created only when requested. */
import { CoralRenderError } from './errors.js';
import { adoptCoralSurface029, renderSurface } from './dom.js';
import type { CoralRenderOptions } from './render.js';

/** Presentation settings are separate from the exact authored source. */
export interface CoralDiagramElement extends HTMLElement {
  source: string;
  renderOptions: CoralRenderOptions | undefined;
}

const ownClasses = new WeakSet<CustomElementConstructor>();
let baseClass: CustomElementConstructor | undefined;

function copyRenderOptions(value: CoralRenderOptions | undefined): CoralRenderOptions | undefined {
  if (value && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)) {
    return { ...value };
  }
  // Preserve invalid shapes so the shared renderer reports its typed error.
  return value;
}

function createBase(): CustomElementConstructor {
  return class CoralDiagramElement extends HTMLElement {
    #source: string | undefined;
    #renderOptions: CoralRenderOptions | undefined;
    #started = false;

    get source(): string {
      return this.#source ?? this.textContent ?? '';
    }

    set source(value: string) {
      this.#source = String(value);
      if (this.#started) this.#render();
    }

    get renderOptions(): CoralRenderOptions | undefined {
      return copyRenderOptions(this.#renderOptions);
    }

    set renderOptions(value: CoralRenderOptions | undefined) {
      this.#renderOptions = copyRenderOptions(value);
      if (this.#started) this.#render();
    }

    connectedCallback(): void {
      // A `source` assigned before upgrade shadows the accessor; re-apply it.
      if (Object.hasOwn(this, 'source')) {
        const value = (this as { source?: unknown }).source;
        delete (this as { source?: unknown }).source;
        this.#source = String(value);
      }
      if (Object.hasOwn(this, 'renderOptions')) {
        const value = (this as { renderOptions?: CoralRenderOptions }).renderOptions;
        delete (this as { renderOptions?: CoralRenderOptions }).renderOptions;
        this.renderOptions = value;
      }
      if (this.#started) return;
      // Children are parsed after the start tag; wait for them.
      if (this.ownerDocument.readyState === 'loading') {
        this.ownerDocument.addEventListener('DOMContentLoaded', () => this.#start(), { once: true });
      } else {
        this.#start();
      }
    }

    #start(): void {
      if (this.#started || !this.isConnected) return;
      this.#started = true;
      this.#render();
    }

    #render(): void {
      const content = this.shadowRoot ?? adoptCoralSurface029(this.attachShadow({ mode: 'open' }), this);
      renderSurface({
        host: this,
        content,
        onRendered: (result) => this.dispatchEvent(new CustomEvent('coral-render', { detail: result })),
        onError: (error) => this.dispatchEvent(new CustomEvent('coral-error', { detail: error })),
      }, this.source, this.#renderOptions).catch(() => { /* reported through coral-error */ });
    }
  };
}

/** Register the Coral diagram element under `tagName`. Idempotent for this package's own classes. */
export function defineCustomElement(tagName = 'coral-diagram'): CustomElementConstructor {
  if (typeof customElements === 'undefined' || typeof HTMLElement === 'undefined') {
    throw new CoralRenderError('coral.browser.environment.unsupported', 'Custom elements need a browser DOM.');
  }
  const existing = customElements.get(tagName);
  if (existing) {
    if (ownClasses.has(existing)) return existing;
    throw new CoralRenderError('coral.browser.element.conflict', `<${tagName}> is already defined by another script.`);
  }
  baseClass ??= createBase();
  const ElementClass = class extends (baseClass as typeof HTMLElement) {};
  try {
    customElements.define(tagName, ElementClass);
  } catch (cause) {
    throw new CoralRenderError('coral.browser.element.conflict', `"${tagName}" is not a valid custom element name.`, [], { cause });
  }
  ownClasses.add(ElementClass);
  return ElementClass;
}
