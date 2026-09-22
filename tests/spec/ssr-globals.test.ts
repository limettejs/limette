import { expect, it } from 'vitest';

it('installs SSR DOM primitives without replacing native web APIs', async () => {
  const nativeFetch = globalThis.fetch;
  const nativeBtoa = globalThis.btoa;
  const nativeAtob = globalThis.atob;

  await import('../../src/server/ssr.ts?ssr-globals-test');

  expect(globalThis.fetch).toBe(nativeFetch);
  expect(globalThis.btoa).toBe(nativeBtoa);
  expect(globalThis.atob).toBe(nativeAtob);
  expect(globalThis.HTMLElement).toBeTypeOf('function');
  expect(globalThis.customElements?.define).toBeTypeOf('function');
});
