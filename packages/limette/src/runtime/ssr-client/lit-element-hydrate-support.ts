/**
 * Install Lit's official hydration hook before LitElement is evaluated.
 *
 * This module intentionally has no Lit imports of its own. The generated
 * client entry imports it before the Limette integration and island modules.
 */
import '@lit-labs/ssr-client/lit-element-hydrate-support.js';
