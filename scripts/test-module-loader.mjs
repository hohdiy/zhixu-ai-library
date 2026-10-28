import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
const require = createRequire(import.meta.url);
export async function testModules() {
  const root = path.resolve(new URL('..', import.meta.url).pathname);
  const temporary = path.join(root, '.sites-runtime', 'research-test-' + process.pid);
  await fs.mkdir(temporary, { recursive: true });
  const cache = new Map();
  async function build(relative) {
    const file = path.resolve(root, relative);
    if (cache.has(file)) return cache.get(file);
    const target = path.join(temporary, path.relative(root, file).replace(/\.(ts|tsx)$/, '.mjs'));
    const url = pathToFileURL(target).href; cache.set(file, url);
    let code = ts.transpileModule(await fs.readFile(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
    code = code.replace(/import \{ env \} from ['"]cloudflare:workers['"];?/, 'const env = globalThis.__researchTestEnv;');
    for (const match of [...code.matchAll(/import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"];?/g)]) {
      const specifier = match[2];
      if (specifier.startsWith('@/') || specifier.startsWith('.')) {
        let location = specifier.startsWith('@/') ? path.join(root, specifier.slice(2)) : path.resolve(path.dirname(file), specifier);
        if (location.endsWith('.json')) { code = code.replace(match[0], 'const ' + match[1] + ' = ' + await fs.readFile(location, 'utf8') + ';'); continue; }
        let found;
        for (const suffix of ['', '.ts', '.mjs', '/index.ts']) { try { if ((await fs.stat(location + suffix)).isFile()) { found = location + suffix; break; } } catch {} }
        if (!found) throw new Error('Missing test dependency: ' + specifier);
        const dependency = await build(path.relative(root, found));
        code = code.replace(match[0], match[0].replace(specifier, dependency));
      } else if (specifier !== 'cloudflare:workers') code = code.replace(match[0], match[0].replace(specifier, pathToFileURL(require.resolve(specifier)).href));
    }
    await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, code);
    return url;
  }
  return { load: async relative => import(await build(relative)), cleanup: () => fs.rm(temporary, { recursive: true, force: true }) };
}
