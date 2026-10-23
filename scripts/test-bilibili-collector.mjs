import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';
const transpile = s => ts.transpileModule(s, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const topics = 'data:text/javascript;base64,' + Buffer.from(transpile(await fs.readFile(new URL('../lib/topics.ts', import.meta.url), 'utf8'))).toString('base64');
const code = transpile(await fs.readFile(new URL('../lib/collector.ts', import.meta.url), 'utf8')).replace("'./topics'", JSON.stringify(topics));
const { safeUrl, bilibiliVideo, collect } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
const bvid = 'BV1234567890';
const canonical = `https://www.bilibili.com/video/${bvid}/`;
const sample = { code: 0, data: { title: '具身 Agent 与大模型的新进展', bvid, aid: 170001, pubdate: 1710000000, owner: { name: '测试UP主' }, desc: '本期介绍机器人与 Agent 的进展。', duration: 180, pages: [{ page: 1, part: '概览', duration: 120 }, { page: 2, part: '工具调用', duration: 60 }] } };
const json = data => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
const original = globalThis.fetch;
let cases = 0;
try {
  assert.equal(safeUrl(`https://m.bilibili.com/video/${bvid}?share_source=COPY&share_session_id=private&p=2#reply`), canonical + '?p=2');
  assert.equal(safeUrl('https://www.bilibili.com/video/av170001?spm_id_from=share'), 'https://www.bilibili.com/video/av170001/');
  assert.equal(bilibiliVideo('https://bilibili.com.evil.tld/video/' + bvid), null);
  assert.equal(bilibiliVideo('https://www.bilibili.com/opus/123'), null);
  assert.throws(() => safeUrl('http://www.bilibili.com/video/' + bvid));
  cases += 5;
  const requests = [];
  globalThis.fetch = async (input, options) => {
    const url = String(input); requests.push({ url, options });
    if (url === 'https://b23.tv/testVideo') return new Response(null, { status: 302, headers: { location: canonical + '?share_session_id=private&p=1' } });
    assert.equal(url, 'https://api.bilibili.com/x/web-interface/view?bvid=' + bvid);
    assert.equal(options.redirect, 'manual');
    assert.equal(options.headers.Cookie, undefined);
    return json(sample);
  };
  const short = await collect('https://b23.tv/testVideo');
  assert.equal(short.title, sample.data.title);
  assert.equal(short.author, '测试UP主');
  assert.equal(short.company, '');
  assert.equal(short.publishedAt, new Date(sample.data.pubdate * 1000).toISOString());
  assert.match(short.summary, /未转写视频/);
  assert.match(short.body, /未读取音视频或字幕/);
  assert.ok(short.body.includes(canonical));
  assert.ok(!short.body.includes('private'));
  assert.ok(JSON.parse(short.topics).includes('agent'));
  assert.equal(requests.length, 2);
  cases++;
  requests.length = 0;
  const direct = await collect(canonical + '?share_source=COPY');
  assert.equal(direct.title, short.title);
  assert.equal(requests.length, 1);
  cases++;
  globalThis.fetch = async input => { assert.ok(String(input).endsWith('aid=170001')); return json(sample); };
  assert.equal((await collect('https://www.bilibili.com/video/av170001/')).title, sample.data.title);
  cases++;
  globalThis.fetch = async () => json(sample);
  const part = await collect(canonical + '?p=2');
  assert.match(part.title, /P2 工具调用/);
  assert.ok(part.body.includes(canonical + '?p=2'));
  assert.match(part.body, /时长：60 秒/);
  await assert.rejects(() => collect(canonical + '?p=3'), /分P/);
  cases += 2;
  globalThis.fetch = async () => json({ code: 0, data: { title: '无简介视频', bvid, owner: {}, pubdate: 0, desc: '' } });
  const noDescription = await collect(canonical);
  assert.match(noDescription.summary, /未提供简介/);
  assert.equal(noDescription.publishedAt, null);
  assert.equal(noDescription.author, '');
  cases++;
  for (const apiCode of [-404, -403, -352]) {
    globalThis.fetch = async () => json({ code: apiCode, message: 'unavailable' });
    await assert.rejects(() => collect(canonical), /不可公开读取/);
    cases++;
  }
  globalThis.fetch = async () => new Response('blocked', { status: 412 });
  await assert.rejects(() => collect(canonical), /HTTP 412/); cases++;
  globalThis.fetch = async () => new Response('<html>invalid json</html>');
  await assert.rejects(() => collect(canonical), /返回异常/); cases++;
  globalThis.fetch = async () => json({ code: 0, data: {} });
  await assert.rejects(() => collect(canonical), /有效标题/); cases++;
  globalThis.fetch = async () => { throw new Error('connection reset'); };
  await assert.rejects(() => collect(canonical), /连接失败或超时/); cases++;
  globalThis.fetch = async () => new Response('x'.repeat(2_000_001));
  await assert.rejects(() => collect(canonical), /来源页面过大/); cases++;
  globalThis.fetch = async () => new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/' } });
  await assert.rejects(() => collect('https://b23.tv/invalidRedirect'), /公开访问/); cases++;
  let redirects = 0;
  globalThis.fetch = async () => { redirects++; return new Response(null, { status: 302, headers: { location: 'https://b23.tv/loop' } }); };
  await assert.rejects(() => collect('https://b23.tv/loop'), /重定向次数过多/);
  assert.equal(redirects, 5); cases++;
  const apiUrl = 'https://api.bilibili.com/x/web-interface/view?bvid=' + bvid;
  const readerUrl = 'https://r.jina.ai/' + apiUrl;
  const envelope = (source = apiUrl, payload = sample) => json({ data: { url: source, content: JSON.stringify(payload), publishedTime: '2020-01-01' } });
  for (const failure of ['network', 412, 503]) {
    const calls = [];
    globalThis.fetch = async (input, options) => {
      calls.push({ url: String(input), options });
      if (String(input) === apiUrl) {
        if (failure === 'network') throw new Error('ECONNRESET');
        return new Response('unavailable', { status: failure });
      }
      assert.equal(String(input), readerUrl);
      return envelope();
    };
    const recovered = await collect(canonical + '?share_session_id=private');
    assert.equal(recovered.title, sample.data.title);
    assert.equal(recovered.publishedAt, new Date(sample.data.pubdate * 1000).toISOString());
    assert.match(recovered.body, /经 Jina Reader/);
    assert.equal(calls.length, 2);
    assert.ok(!calls[1].url.includes('private'));
    assert.deepEqual(Object.keys(calls[1].options.headers).sort(), ['Accept', 'DNT']);
    cases++;
  }
  for (const denied of [401, 403, 429]) {
    let calls = 0;
    globalThis.fetch = async () => { calls++; return new Response('denied', { status: denied }); };
    await assert.rejects(() => collect(canonical), new RegExp('HTTP ' + denied));
    assert.equal(calls, 1);
    cases++;
  }
  let businessCalls = 0;
  globalThis.fetch = async () => { businessCalls++; return json({ code: -403 }); };
  await assert.rejects(() => collect(canonical), /不可公开读取/);
  assert.equal(businessCalls, 1); cases++;
  const fallbackResponse = respond => async input => {
    if (String(input) === apiUrl) throw new Error('ECONNRESET');
    return respond();
  };
  globalThis.fetch = fallbackResponse(() => envelope('https://unexpected.com/'));
  await assert.rejects(() => collect(canonical), /来源不匹配/); cases++;
  globalThis.fetch = fallbackResponse(() => envelope(apiUrl, { code: 0, data: { ...sample.data, bvid: 'BV0987654321' } }));
  await assert.rejects(() => collect(canonical), /视频标识不匹配/); cases++;
  globalThis.fetch = fallbackResponse(() => new Response('not JSON'));
  await assert.rejects(() => collect(canonical), /公开读取服务返回异常/); cases++;
  globalThis.fetch = fallbackResponse(() => json({ data: { url: apiUrl, content: 'not JSON' } }));
  await assert.rejects(() => collect(canonical), /公开读取服务返回异常/); cases++;
  globalThis.fetch = fallbackResponse(() => new Response('rate limited', { status: 429 }));
  await assert.rejects(() => collect(canonical), /HTTP 429/); cases++;
  globalThis.fetch = fallbackResponse(() => new Response('x'.repeat(2_000_001)));
  await assert.rejects(() => collect(canonical), /来源页面过大/); cases++;
  console.log(`PASS: ${cases} Bilibili cases (short/direct/mobile/av URLs, public metadata, parts, evidence boundaries, inaccessible videos, response limits and redirect validation)`);
} finally { globalThis.fetch = original; }

if (process.argv[2] === '--live') {
  for (const url of process.argv.slice(3)) {
    const source = await collect(url);
    assert.ok(source.title && source.author && source.publishedAt);
    assert.match(source.body, /未读取音视频或字幕/);
    console.log(JSON.stringify({ live: true, title: source.title, author: source.author, publishedAt: source.publishedAt, viaReader: source.body.includes('经 Jina Reader') }));
  }
}
