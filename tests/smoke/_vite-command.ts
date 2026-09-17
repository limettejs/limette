import { exampleRoot } from './_paths.ts';

type StreamOption = 'inherit' | 'null' | 'piped';

type ViteCommandOptions = {
  stdout?: StreamOption;
  stderr?: StreamOption;
  cwd?: string;
};

const npmCommand = Deno.build.os === 'windows' ? 'npm.cmd' : 'npm';

export function viteCommand(
  args: string[],
  options: ViteCommandOptions = {},
) {
  return new Deno.Command(npmCommand, {
    args: ['--prefix', exampleRoot, 'exec', 'vite', '--', ...args],
    cwd: options.cwd ?? exampleRoot,
    stdout: options.stdout ?? 'null',
    stderr: options.stderr ?? 'piped',
  });
}
