import { join } from 'node:path';
import { exampleRoot, repositoryRoot } from './_paths.ts';

type StreamOption = 'inherit' | 'null' | 'piped';

type ViteCommandOptions = {
  stdout?: StreamOption;
  stderr?: StreamOption;
  cwd?: string;
};

const nodeCommand = Deno.build.os === 'windows' ? 'node.exe' : 'node';
const viteCli = join(repositoryRoot, 'node_modules/vite/bin/vite.js');

export function viteCommand(args: string[], options: ViteCommandOptions = {}) {
  return new Deno.Command(nodeCommand, {
    args: [viteCli, ...args],
    cwd: options.cwd ?? exampleRoot,
    stdout: options.stdout ?? 'null',
    stderr: options.stderr ?? 'piped',
  });
}
