import { fileURLToPath } from 'node:url';

const exampleRootUrl = new URL('../../examples/', import.meta.url);
const repositoryRootUrl = new URL('../../', import.meta.url);

export const exampleRoot = fileURLToPath(exampleRootUrl);
export const repositoryRoot = fileURLToPath(repositoryRootUrl);

export function loadExampleFile(path: string) {
  const normalized = path.replace(/^\.\//, '');
  return import(new URL(normalized, exampleRootUrl).href);
}
