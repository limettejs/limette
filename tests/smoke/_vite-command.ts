import { exampleRoot } from './_paths.ts';

type StreamOption = 'inherit' | 'null' | 'piped';

type ViteCommandOptions = {
  stdout?: StreamOption;
  stderr?: StreamOption;
};

const npmCommand = Deno.build.os === 'windows' ? 'npm.cmd' : 'npm';

export function viteCommand(
  args: string[],
  options: ViteCommandOptions = {},
) {
  return new Deno.Command(npmCommand, {
    args: ['exec', 'vite', '--', ...args],
    cwd: exampleRoot,
    stdout: options.stdout ?? 'null',
    stderr: options.stderr ?? 'piped',
  });
}
