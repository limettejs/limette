function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const nativeFetch = globalThis.fetch;
const nativeBtoa = globalThis.btoa;
const nativeAtob = globalThis.atob;

await import(`../../src/server/ssr.ts?test=${crypto.randomUUID()}`);

assert(globalThis.fetch === nativeFetch, 'SSR replaced the native fetch.');
assert(globalThis.btoa === nativeBtoa, 'SSR replaced the native btoa.');
assert(globalThis.atob === nativeAtob, 'SSR replaced the native atob.');
assert(
  typeof globalThis.HTMLElement === 'function',
  'Missing SSR HTMLElement.',
);
assert(
  typeof globalThis.customElements?.define === 'function',
  'Missing SSR customElements registry.',
);
