import {
  CSSStyleSheet as CSSStyleSheetShim,
  CustomElementRegistry as CustomElementRegistryShim,
  customElements as customElementsShim,
  Document as DocumentShim,
  document as documentShim,
  Element as ElementShim,
  EventTarget as EventTargetShim,
  HTMLElement as HTMLElementShim,
  MutationObserver as MutationObserverShim,
  ShadowRoot as ShadowRootShim,
} from '@lit-labs/ssr-dom-shim';

const globals = globalThis as typeof globalThis & Record<string, unknown>;

function installIfMissing(name: string, value: unknown) {
  if (globals[name] === undefined) globals[name] = value;
}

installIfMissing('EventTarget', EventTargetShim);
installIfMissing('Element', ElementShim);
installIfMissing('HTMLElement', HTMLElementShim);
installIfMissing('Document', DocumentShim);
installIfMissing('document', documentShim);
installIfMissing('CSSStyleSheet', CSSStyleSheetShim);
installIfMissing('ShadowRoot', ShadowRootShim);
installIfMissing('CustomElementRegistry', CustomElementRegistryShim);
installIfMissing('customElements', customElementsShim);
installIfMissing('MutationObserver', MutationObserverShim);
installIfMissing('window', globalThis);
