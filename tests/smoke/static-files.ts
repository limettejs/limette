import { join } from 'node:path';
import { staticDirectoryHandler as denoStaticDirectoryHandler } from '../../src/adapters/deno-static-files.ts';
import { staticDirectoryHandler as nodeStaticDirectoryHandler } from '../../src/adapters/node-static-files.ts';

type StaticHandler = ReturnType<typeof nodeStaticDirectoryHandler>;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const temporaryRoot = await Deno.makeTempDir({ prefix: 'limette-static-' });
const staticRoot = join(temporaryRoot, 'public');
const secretPath = join(temporaryRoot, 'secret.txt');

async function verifyStaticHandler(name: string, handler: StaticHandler) {
  const asset = await handler(
    new Request('http://localhost/assets/app.js'),
  );
  assert(asset?.status === 200, `${name} did not serve an existing asset.`);
  assert(
    await asset.text() === 'console.log("static");',
    `${name} returned the wrong asset content.`,
  );
  assert(
    asset.headers.get('content-type') ===
      'application/javascript; charset=utf-8',
    `${name} returned the wrong JavaScript content type.`,
  );

  const head = await handler(
    new Request('http://localhost/assets/app.js', { method: 'HEAD' }),
  );
  assert(
    head?.status === 200 && await head.text() === '',
    `${name} did not preserve HEAD behavior.`,
  );
  assert(
    head.headers.get('content-type') ===
      'application/javascript; charset=utf-8',
    `${name} omitted the HEAD content type.`,
  );

  assert(
    await handler(new Request('http://localhost/assets/missing.js')) ===
      undefined,
    `${name} did not fall through for a missing file.`,
  );
  assert(
    await handler(new Request('http://localhost/assets/directory/')) ===
      undefined,
    `${name} served a directory as a file.`,
  );
  assert(
    await handler(new Request('http://localhost/outside/app.js')) ===
      undefined,
    `${name} handled a request outside its configured base.`,
  );

  const methodResponse = await handler(
    new Request('http://localhost/assets/app.js', { method: 'POST' }),
  );
  assert(
    methodResponse?.status === 405,
    `${name} did not reject a non-static method.`,
  );

  for (
    const pathname of [
      '/assets/../secret.txt',
      '/assets/%2e%2e/secret.txt',
      '/assets/..%2fsecret.txt',
      '/assets/foo/%2e%2e%2f%2e%2e%2fsecret.txt',
      '/assets/..%5csecret.txt',
      '/assets/%00secret.txt',
      '/assets/secret-link.txt',
    ]
  ) {
    const response = await handler(new Request(`http://localhost${pathname}`));
    assert(
      !response || await response.clone().text() !== 'secret',
      `${name} escaped the static root for ${pathname}.`,
    );
  }
}

try {
  await Deno.mkdir(staticRoot);
  await Deno.writeTextFile(
    join(staticRoot, 'app.js'),
    'console.log("static");',
  );
  await Deno.writeTextFile(secretPath, 'secret');
  await Deno.mkdir(join(staticRoot, 'directory'));
  await Deno.symlink(secretPath, join(staticRoot, 'secret-link.txt'));

  await verifyStaticHandler(
    'Node static adapter',
    nodeStaticDirectoryHandler({ root: staticRoot, base: '/assets/' }),
  );
  await verifyStaticHandler(
    'Deno static adapter',
    denoStaticDirectoryHandler({ root: staticRoot, base: '/assets/' }),
  );
} finally {
  await Deno.remove(temporaryRoot, { recursive: true });
}
