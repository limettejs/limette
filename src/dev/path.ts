import { join, isAbsolute, dirname, toFileUrl } from "@std/path";

let tailwindcss: string | undefined = undefined;

export async function resolvePath(
  inputPath: string,
  basePath: string
): Promise<string> {
  // Step 1: Load `deno.json` and read the imports field
  const config = JSON.parse(
    await Deno.readTextFile(join(Deno.cwd(), "deno.json"))
  );
  const imports: Record<string, string> = config.imports || {};

  // Step 2: Replace with what's in the imports object
  for (const [key, value] of Object.entries(imports)) {
    if (inputPath.startsWith(key)) {
      inputPath = inputPath.replace(key, value);
    }
  }

  // Step 3: Check for special specifiers and return early if matched
  const specialSpecifiers = [
    "npm:",
    "https:",
    "http:",
    "jsr:",
    "file:",
    "data:",
  ];
  if (specialSpecifiers.some((specifier) => inputPath.startsWith(specifier))) {
    return inputPath; // Return the specifier as is
  }

  // Step 4: If it's still a relative path, resolve it to an absolute path
  if (!isAbsolute(inputPath)) {
    const baseDir = dirname(basePath);
    inputPath = toFileUrl(join(baseDir, inputPath)).href;
  }

  // Step 5: Return the resolved absolute path
  return inputPath;
}

export async function getTailwind() {
  if (tailwindcss) return tailwindcss;

  const config = JSON.parse(
    await Deno.readTextFile(join(Deno.cwd(), "deno.json"))
  );

  const imports: Record<string, string> = config.imports || {};

  tailwindcss = imports["@tailwindcss/cli"] ?? imports["tailwindcss"]; // For version 3.x

  return tailwindcss;
}
