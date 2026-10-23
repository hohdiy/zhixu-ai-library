import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';
const transpile = s => ts.transpileModule(s, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const topics = 'data:text/javascript;base64,' + Buffer.from(transpile(await fs.readFile(new URL('../lib/topics.ts', import.meta.url), 'utf8'))).toString('base64');
const code = transpile(await fs.readFile(new URL('../lib/collector.ts', import.meta.url), 'utf8')).replace("'./topics'", JSON.stringify(topics));
const { collect } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
const bvid = 'BV1234567890';
const canonical = `https://www.bilibili.com/video/${bvid}/`;
const base = 'https://bili-collector.valid-domain.com/prefix';
const info = { bvid, aid: 170001, title: 'Agent 进展', owner: { name: '测试UP主' }, pubdate: 1710000000, desc: '视频简介', pages: [{ page: 1 }, { page: 2, part: '第二分P' }] };
const subtitle = { bvid, subtitle: [{ from: 0.5, to: 3, content: '数字员工的工作流进展。' }] };
const options = { bilibiliApiUrl: base + '/', bilibiliApiToken: 'fake-service-key', readerApiKey: 'fake-reader-key' };
const json = value => Response.json(value);
const original = globalThis.fetch;
let calls = [];
let cases = 0;
function fixture(metadata = info, subtitles = subtitle) {
  calls = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input); calls.push(url);
    assert.equal(init.redirect, 'manual');
    if (url === 'https://b23.tv/testMcp') {
      assert.equal(init.headers.Authorization, undefined);
      return new Response(null, { status: 302, headers: { location: canonical + '?share_session_id=private' } });
    }
    assert.equal(init.headers.Authorization, 'Bearer fake-service-key');
    assert.ok(!JSON.stringify(init).includes('fake-reader-key'));
    if (url === base + '/api/video/info/' + bvid) return metadata instanceof Response ? metadata : json(metadata);
    assert.equal(url, base + '/api/video/subtitle/' + bvid + '?format=raw');
    return subtitles instanceof Response ? subtitles : json(subtitles);
  };
}
try {
  fixture();
  const result = await collect('https://b23.tv/testMcp', options);
  assert.equal(result.title, info.title); assert.equal(result.author, info.owner.name);
  assert.equal(result.publishedAt, new Date(info.pubdate * 1000).toISOString());
  assert.equal(result.company, ''); assert.match(result.body, /L-Chris\/bilibili-mcp/);
  assert.match(result.body, /0.50–3.00秒/); assert.match(result.body, /数字员工的工作流/);
  assert.match(result.summary, /AI生成，待研读/); assert.ok(JSON.parse(result.topics).includes('workforce'));
  assert.ok(!JSON.stringify(result).includes('private')); assert.ok(!JSON.stringify(result).includes('fake-service-key'));
  assert.equal(calls.length, 3); cases++;
  fixture();
  const part = await collect(canonical + '?p=2', options);
  assert.match(part.title, /P2/); assert.match(part.body, /仅支持第一分P/);
  assert.ok(!part.body.includes('数字员工的工作流')); assert.equal(calls.length, 1); cases++;
  for (const bad of [{ bvid, subtitle: '没有找到AI生成的中文字幕' }, { bvid: 'BV0000000000', subtitle: subtitle.subtitle }, { bvid, subtitle: [] }, { bvid, subtitle: [{ from: -1, to: 2, content: '错误' }] }, { bvid, subtitle: [{ from: 5, to: 2, content: '错误' }] }, new Response('internal details with secret', { status: 500 })]) {
    fixture(info, bad);
    const partial = await collect(canonical, options);
    assert.match(partial.body, /字幕暂未获取成功/); assert.match(partial.body, /未读取音视频或字幕/);
    assert.ok(!partial.body.includes('internal details')); assert.match(partial.summary, /未转写视频/); cases++;
  }
  for (const bad of [{ ...info, bvid: 'BV0000000000' }, { error: 'private server details' }, new Response(null, { status: 302, headers: { location: 'https://unexpected.com/' } }), new Response('secret', { status: 401 })]) {
    fixture(bad);
    await assert.rejects(() => collect(canonical, options), /不匹配|缺少有效标题|HTTP 302|HTTP 401/);
    assert.equal(calls.length, 1); cases++;
  }
  for (const invalid of ['http://collector.valid-domain.com', 'https://localhost/', 'https://127.0.0.1/', 'https://secret@collector.valid-domain.com/', base + '?token=secret']) {
    fixture();
    await assert.rejects(() => collect(canonical, { ...options, bilibiliApiUrl: invalid })); assert.equal(calls.length, 0); cases++;
  }
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), 'https://api.bilibili.com/x/web-interface/view?aid=170001');
    assert.equal(init.headers.Authorization, undefined); return json({ code: 0, data: info });
  };
  assert.equal((await collect('https://www.bilibili.com/video/av170001/', options)).title, info.title); cases++;
  console.log(`PASS: ${cases} bilibili-mcp REST integration cases`);
} finally { globalThis.fetch = original; }
