import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const wranglerRequire = createRequire(require.resolve('wrangler/package.json'));
const { Miniflare } = await import(pathToFileURL(wranglerRequire.resolve('miniflare')).href);
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const topicsCode = compile(await fs.readFile(new URL('../lib/topics.ts', import.meta.url), 'utf8'));
const { TOPICS } = await import('data:text/javascript;base64,' + Buffer.from(topicsCode).toString('base64'));
const collector = compile(await fs.readFile(new URL('../lib/collector.ts', import.meta.url), 'utf8'))
  .replace(/import \{ TOPICS \} from ['"]\.\/topics['"];?/, 'const TOPICS = ' + JSON.stringify(TOPICS) + ';');
const script = collector + `
export default { async fetch(request, env) {
  try { return Response.json(await collect(new URL(request.url).searchParams.get('url'), {readerApiKey: env.JINA_API_KEY, bilibiliApiUrl: env.BILIBILI_MCP_API_URL, bilibiliApiToken: env.BILIBILI_MCP_API_TOKEN})); }
  catch (error) { return Response.json({error:error.message},{status:400}); }
}};`;
const config = { modules: true, script, compatibilityDate: '2026-05-15', compatibilityFlags: ['nodejs_compat'] };
const bvid = 'BV1234567890';
const short = 'https://b23.tv/workerdTest';
const canonical = `https://www.bilibili.com/video/${bvid}/`;
const api = `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`;
const reader = 'https://r.jina.ai/' + api;
const metadata = { code: 0, data: { bvid, title: 'Agent 运行时测试', owner: { name: '测试UP主' }, pubdate: 1710000000, desc: '公开视频简介' } };
let mode = 'direct';
let requests = [];
const fixtureRuntime = new Miniflare({ ...config, bindings: {JINA_API_KEY:'test-runtime-reader-key'}, outboundService: async request => {
  requests.push(request.url);
  if (request.url === short) return new Response(null, { status: 302, headers: { location: canonical } });
  if (request.url === api) {
    assert.equal(request.headers.get('Authorization'), null);
    if (mode === 'api-redirect') return new Response(null, { status: 302, headers: { location: 'https://unexpected.com/' } });
    if (mode !== 'direct') return new Response('unavailable', { status: 503 });
    return Response.json(metadata);
  }
  if (request.url === reader) {
    assert.equal(request.headers.get('Authorization'), 'Bearer test-runtime-reader-key');
    if (mode === 'reader-redirect') return new Response(null, { status: 302, headers: { location: 'https://unexpected.com/' } });
    return Response.json({ data: { url: api, content: JSON.stringify(metadata) } });
  }
  throw new Error('Unexpected outbound request: ' + request.url);
} });
try {
  for (const scenario of ['direct', 'fallback', 'api-redirect', 'reader-redirect']) {
    mode = scenario; requests = [];
    const response = await fixtureRuntime.dispatchFetch('http://worker.test/?url=' + encodeURIComponent(short));
    const result = await response.json();
    if (scenario === 'direct' || scenario === 'fallback') {
      assert.equal(response.status, 200, JSON.stringify(result));
      assert.equal(result.title, metadata.data.title);
      assert.equal(result.author, metadata.data.owner.name);
      assert.match(result.body, /未读取音视频或字幕/);
      assert.equal(requests.length, scenario === 'direct' ? 2 : 3);
    } else {
      assert.equal(response.status, 400);
      assert.match(result.error, /HTTP 302/);
      assert.ok(!requests.includes('https://unexpected.com/'));
    }
  }
  console.log('PASS: real workerd direct, short-link, reader fallback, and explicit redirect rejection');
} finally { await fixtureRuntime.dispose(); }
const serviceBase = 'https://bili-collector.valid-domain.com';
let serviceRedirect = false;
const serviceRuntime = new Miniflare({ ...config, bindings: { BILIBILI_MCP_API_URL: serviceBase, BILIBILI_MCP_API_TOKEN: 'fake-service-key' }, outboundService: async request => {
  if (request.url === short) {
    assert.equal(request.headers.get('Authorization'), null);
    return new Response(null, { status: 302, headers: { location: canonical } });
  }
  assert.equal(request.headers.get('Authorization'), 'Bearer fake-service-key');
  if (request.url === serviceBase + '/api/video/info/' + bvid) {
    if (serviceRedirect) return new Response(null, { status: 302, headers: { location: 'https://unexpected.com/' } });
    return Response.json(metadata.data);
  }
  assert.equal(request.url, serviceBase + '/api/video/subtitle/' + bvid + '?format=raw');
  return Response.json({ bvid, subtitle: [{ from: 0, to: 2.5, content: 'Agent 字幕运行时测试' }] });
} });
try {
  const response = await serviceRuntime.dispatchFetch('http://worker.test/?url=' + encodeURIComponent(short));
  const result = await response.json();
  assert.equal(response.status, 200, JSON.stringify(result));
  assert.match(result.body, /Agent 字幕运行时测试/); assert.match(result.body, /bilibili-mcp/);
  assert.ok(!JSON.stringify(result).includes('fake-service-key'));
  serviceRedirect = true;
  const rejected = await serviceRuntime.dispatchFetch('http://worker.test/?url=' + encodeURIComponent(short));
  assert.equal(rejected.status, 400); assert.match((await rejected.json()).error, /HTTP 302/);
  console.log('PASS: real workerd bilibili-mcp metadata, subtitles, secret isolation and redirect rejection');
} finally { await serviceRuntime.dispose(); }
if (process.argv[2] === '--live') {
  const live = new Miniflare(config);
  try {
    for (const url of process.argv.slice(3)) {
      const response = await live.dispatchFetch('http://worker.test/?url=' + encodeURIComponent(url));
      const source = await response.json();
      assert.equal(response.status, 200, JSON.stringify(source));
      assert.ok(source.title && source.author && source.publishedAt);
      console.log(JSON.stringify({ runtime: 'workerd', live: true, title: source.title, author: source.author, publishedAt: source.publishedAt, viaReader: source.body.includes('经 Jina Reader') }));
    }
  } finally { await live.dispose(); }
}
