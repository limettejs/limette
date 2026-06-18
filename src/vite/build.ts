export interface BuildViteClientOptions {
  root?: string;
  outDir?: string;
  base?: string;
  configFile?: string;
  mode?: string;
  viteSpecifier?: string;
}

export async function buildViteClient(
  options: BuildViteClientOptions = {},
) {
  const root = options.root ?? Deno.cwd();
  const args = [
    'run',
    '-A',
    options.viteSpecifier ?? 'npm:vite@^8.0.0',
    '--config',
    options.configFile ?? 'vite.config.ts',
    'build',
  ];

  if (options.outDir) {
    args.push('--outDir', options.outDir);
  }

  if (options.base) {
    args.push('--base', options.base);
  }

  if (options.mode) {
    args.push('--mode', options.mode);
  }

  const command = new Deno.Command(Deno.execPath(), {
    args,
    cwd: root,
    stdout: 'inherit',
    stderr: 'piped',
  });
  const output = await command.output();

  if (!output.success) {
    throw new Error(new TextDecoder().decode(output.stderr));
  }
}
