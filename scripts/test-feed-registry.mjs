import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const uri = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const topics = uri(compile(await fs.readFile(new URL('../lib/topics.ts', import.meta.url), 'utf8')));
const collector = uri(compile(await fs.readFile(new URL('../lib/collector.ts', import.meta.url), 'utf8')).replace("'./topics'", JSON.stringify(topics)));
const kinds = uri(compile(await fs.readFile(new URL('../lib/feed-types.ts', import.meta.url), 'utf8')));
const curated = JSON.parse(await fs.readFile(new URL('../data/feed-registry.json', import.meta.url), 'utf8'));
assert.equal(curated.length, 38);
assert.equal(new Set(curated.map(f => f.id)).size, curated.length);
assert.equal(new Set(curated.map(f => f.url.replace(/\/$/, ''))).size, curated.length);
const { safeUrl } = await import(collector);
const topicIds = new Set(['model','reasoning','agent','rsi','embodied','workforce']);
for (const entry of curated) {
  assert.ok(entry.name && entry.reason && entry.note && entry.verifiedAt === '2026-10-23');
  assert.ok(entry.topics.length && entry.topics.every(t => topicIds.has(t)));
  assert.ok(['checked','limited'].includes(entry.verification)); safeUrl(entry.url);
  if (entry.feedUrl) safeUrl(entry.feedUrl);
}
for (const id of topicIds) assert.ok(curated.some(f => f.following && f.topics.includes(id)));
const sqlite = new DatabaseSync(':memory:');
sqlite.exec(await fs.readFile(new URL('../drizzle/0001_dark_mindworm.sql', import.meta.url), 'utf8'));
globalThis.__feedTestDb = { prepare(sql) {
  let args = [];
  const statement = { bind(...values) { args = values; return statement; }, async all() { return { results: sqlite.prepare(sql).all(...args) }; }, async run() { return sqlite.prepare(sql).run(...args); } };
  return statement;
} };
const source = compile(await fs.readFile(new URL('../lib/feed-registry.ts', import.meta.url), 'utf8'))
  .replace(/import \{ env \} from ['"]cloudflare:workers['"];?/, 'const env = { DB: globalThis.__feedTestDb };')
  .replace(/import curated from ['"]@\/data\/feed-registry.json['"];?/, 'const curated = ' + JSON.stringify(curated) + ';')
  .replace(/['"]zod['"]/, JSON.stringify(pathToFileURL(require.resolve('zod')).href))
  .replace("'./collector'", JSON.stringify(collector)).replace("'./feed-types'", JSON.stringify(kinds));
const registryUri = uri(source);
const { readFeedRegistry, mutateFeedRegistry } = await import(registryUri);
let library = await readFeedRegistry();
assert.equal(library.feeds.length, 38); assert.equal(library.followingCount, 26);
await mutateFeedRegistry({ action: 'follow', id: 'openai', following: false });
await mutateFeedRegistry({ action: 'follow', id: 'openai', following: false });
assert.equal((await readFeedRegistry()).feeds.find(f => f.id === 'openai').following, false);
assert.equal(sqlite.prepare('select count(*) n from feed_registry').get().n, 1);
await mutateFeedRegistry({ action: 'follow', id: 'openai', following: true });
await assert.rejects(() => mutateFeedRegistry({ action: 'follow', id: 'unknown', following: true }), /不存在/);
await assert.rejects(() => mutateFeedRegistry({ action: 'remove', id: 'openai' }), /精选信源/);
await assert.rejects(() => mutateFeedRegistry({ action: 'follow', id: 'openai', following: 'yes' }));
const custom = { action: 'add', name: '自定义研究入口', url: 'https://research.valid-domain.com/blog?utm_source=tracking', kind: 'official', language: 'zh', topics: ['rsi'], reason: '自动科研研究' };
const added = await mutateFeedRegistry(custom);
library = await readFeedRegistry();
const entry = library.feeds.find(f => f.id === added.id);
assert.equal(entry.url, 'https://research.valid-domain.com/blog'); assert.equal(entry.custom, true); assert.equal(entry.following, true); assert.equal(entry.verification, 'unverified');
await assert.rejects(() => mutateFeedRegistry({ ...custom, url: entry.url + '/' }), /已在库中/);
for (const url of ['http://research.valid-domain.com/', 'https://127.0.0.1/', 'https://localhost/', 'https://user:password@research.valid-domain.com/']) await assert.rejects(() => mutateFeedRegistry({ ...custom, url }));
await mutateFeedRegistry({ action: 'follow', id: added.id, following: false });
assert.equal((await readFeedRegistry()).feeds.find(f => f.id === added.id).following, false);
await mutateFeedRegistry({ action: 'remove', id: added.id });
assert.equal((await readFeedRegistry()).feeds.length, 38);
const routeSource = compile(await fs.readFile(new URL('../app/api/feeds/route.ts', import.meta.url), 'utf8')).replace("'@/lib/feed-registry'", JSON.stringify(registryUri));
const { GET, POST } = await import(uri(routeSource));
assert.equal((await GET()).status, 200);
const crossOrigin = await POST(new Request('https://site.valid-domain.com/api/feeds', { method: 'POST', headers: { Origin: 'https://other.valid-domain.com' }, body: JSON.stringify({ action: 'follow', id: 'openai', following: false }) }));
assert.equal(crossOrigin.status, 403); assert.equal((await readFeedRegistry()).feeds.find(f => f.id === 'openai').following, true);
assert.equal((await POST(new Request('https://site.valid-domain.com/api/feeds', { method: 'POST', body: 'x'.repeat(12001) }))).status, 413);
assert.equal((await POST(new Request('https://site.valid-domain.com/api/feeds', { method: 'POST', body: 'bad-json' }))).status, 400);
sqlite.close(); delete globalThis.__feedTestDb;
console.log('PASS: 38 curated feeds, six-topic coverage, real SQLite migration, persistent/idempotent preferences, custom CRUD, URL validation and API origin/body/error boundaries');
