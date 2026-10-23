import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';
const transpile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const topics='data:text/javascript;base64,'+Buffer.from(transpile(await fs.readFile(new URL('../lib/topics.ts',import.meta.url),'utf8'))).toString('base64');
const code=transpile(await fs.readFile(new URL('../lib/collector.ts',import.meta.url),'utf8')).replace("'./topics'",JSON.stringify(topics));
const {safeUrl,classify,collect}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
assert.equal(safeUrl('https://anthropic.com/news?q=a&utm_source=test#fragment'),'https://anthropic.com/news?q=a');
for(const value of ['http://foo.com','https://127.0.0.1/a','https://[::1]/','https://localhost/a','https://a.internal/','https://user:pass@a.com/','https://a.com:8443/']) assert.throws(()=>safeUrl(value));
assert.ok(classify('recursive self-improving agents').includes('rsi'));
assert.ok(classify('Embodied robots use a world model').includes('embodied'));
assert.deepEqual(classify('a recipe for bread'),[]);
const original=globalThis.fetch;
try{
 globalThis.fetch=async()=>new Response('<html><head><title>Agent &amp; Robotics</title><meta name="author" content="Research Team"><meta property="article:published_time" content="2025-05-30"><meta name="description" content="An agent with tool use"></head><body><nav>ignore navigation</nav><article><p>Verified article body.</p><script>dangerous()</script></article></body></html>',{headers:{'Content-Type':'text/html'}});
 const result=await collect('https://www.anthropic.com/news/test');
 assert.equal(result.title,'Agent & Robotics');assert.equal(result.author,'Research Team');assert.equal(result.company,'Anthropic');assert.equal(result.publishedAt.slice(0,10),'2025-05-30');assert.ok(result.body.includes('Verified article body'));assert.ok(!result.body.includes('dangerous'));assert.ok(!result.body.includes('ignore navigation'));
 globalThis.fetch=async()=>new Response('',{status:302,headers:{location:'http://127.0.0.1/'}});
 await assert.rejects(()=>collect('https://www.anthropic.com/test'),/公开访问/);
 globalThis.fetch=async()=>new Response('pdf',{headers:{'Content-Type':'application/pdf'}});
 await assert.rejects(()=>collect('https://arxiv.org/pdf/test'),/PDF/);
 globalThis.fetch=async()=>new Response('',{status:403});
 await assert.rejects(()=>collect('https://a.com/'),/403/);
 console.log('PASS: URL validation, tracker stripping, topic matching, extraction, source metadata, redirect rejection, PDF and restricted-source handling');
}finally{globalThis.fetch=original;}
