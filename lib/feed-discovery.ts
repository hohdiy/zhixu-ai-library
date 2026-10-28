import { safeUrl } from './collector';
import type { FeedEntry } from './feed-types';

const UA = 'ZhixuLibrary/1.1 (personal research collector)';
const MAX = 2_000_000;
const clean = (text: string) => text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
export const normalizedArticleUrl = (input: string) => { const u = new URL(safeUrl(input)); u.pathname = u.pathname.replace(/\/$/, '') || '/'; return u.toString(); };
async function resource(input: string, maxBytes = MAX) {
  let url = safeUrl(input);
  for (let i = 0; i < 4; i++) {
    const r = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(18000), headers: { 'User-Agent': UA, Accept: 'application/json, application/rss+xml, application/atom+xml, text/html;q=0.9' } });
    if ([301,302,303,307,308].includes(r.status)) { const next = r.headers.get('location'); await r.body?.cancel(); if (!next) throw new Error('重定向缺少目标'); url = safeUrl(new URL(next, url).toString()); continue; }
    if (!r.ok) { await r.body?.cancel(); throw new Error('HTTP ' + r.status); }
    const reader = r.body?.getReader(); if (!reader) throw new Error('信源未返回正文');
    let bytes = 0; const chunks: Uint8Array[] = [];
    try { while (true) { const part = await reader.read(); if (part.done) break; bytes += part.value.length; if (bytes > maxBytes) throw new Error('信源页面过大'); chunks.push(part.value); } } finally { await reader.cancel().catch(() => {}); }
    const buffer = new Uint8Array(bytes); let offset = 0; for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length; }
    return { url, text: new TextDecoder().decode(buffer) };
  }
  throw new Error('信源重定向次数过多');
}
export type Candidate = { url: string; title: string; publishedAt?: string | null };
const patterns: Record<string, RegExp> = {
  openai: /^\/index\/[^/]+\/?$/, anthropic: /^\/(research|engineering|news)\/[^/]+\/?$/, deepmind: /^\/blog\/[^/]+\/?$/,
  nvidia: /^\/blog\/(?!tag\/|category\/|author\/|page\/)[^/]+\/?$/, 'microsoft-research': /^\/en-us\/research\/blog\/[^/]+\/?$/,
  qwen: /^\/(blog|blogs)\/[^/]+\/?$/, mistral: /^\/news\/[^/]+\/?$/, vllm: /^\/blog\/[^/]+\/?$/,
  langchain: /^\/blog\/[^/]+\/?$/, mcp: /^\/posts\/[^/]+\/?$/, sakana: /^\/(?!careers|company|about|contact|blog|research|rsi|fig|ja|fugu|namazu|marlin|chat)[a-zA-Z0-9][^/]+\/?$/,
  'physical-intelligence': /^\/blog\/[^/]+\/?$/, figure: /^\/news\/[^/]+\/?$/, 'hf-papers': /^\/papers\/\d{4}\.\d{4,5}$/,
  jiqizhixin: /^\/(articles|news)\/[^/]+\/?$/, worklab: /^\/en-us\/worklab\/(?!all-stories|leadership|culture|innovation|collaboration|performance|wellbeing|guides|about)[^/]+(?:\/[^/]+)?\/?$/,
};
export function parseFeed(xml: string, base: string): Candidate[] {
  const blocks = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) || [];
  return blocks.flatMap(block => {
    const tags = block.match(/<link\b[^>]*>/gi) || [];
    const alternate = tags.find(tag => /href=/i.test(tag) && !/rel=["']self["']/i.test(tag));
    const link = alternate?.match(/href=["']([^"']+)["']/i)?.[1] || block.match(/<link(?:\s[^>]*)?>([\s\S]*?)<\/link>/i)?.[1];
    if (!link) return [];
    try { return [{ url: safeUrl(new URL(clean(link), base).toString()), title: clean(block.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '') }]; } catch { return []; }
  });
}
export function parseIndex(html: string, base: string, feedId: string): Candidate[] {
  const home = new URL(base); const pattern = patterns[feedId];
  const content = html.replace(/<(nav|header|footer|aside)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  return [...content.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)].flatMap(match => {
    try {
      const u = new URL(match[1].replace(/&amp;/g, '&'), base);
      const heading = match[2].match(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/i)?.[1];
      const label = match[0].match(/\b(?:aria-label|title)=["']([^"']+)["']/i)?.[1];
      const title = clean(heading || label || match[2]).replace(/^post link to\s*/i, '');
      if (u.hostname !== home.hostname || !pattern?.test(u.pathname) || title.length < 10 || title.length > 600) return [];
      if (/^(view all|read more|learn more|查看全部|了解更多|Research|Engineering|News)$/i.test(title)) return [];
      if (feedId === 'hf-papers') return [{ url: 'https://arxiv.org/abs/' + u.pathname.split('/').at(-1), title }];
      return [{ url: safeUrl(u.toString()), title }];
    } catch { return []; }
  });
}
export async function discoverFeed(feed: FeedEntry): Promise<Candidate[]> {
  const home = new URL(feed.url);
  if (home.hostname === 'github.com') {
    const parts = home.pathname.split('/').filter(Boolean);
    let owner = parts[0], repo = parts[1];
    if (!repo) {
      const result = await resource(`https://api.github.com/orgs/${encodeURIComponent(owner)}/repos?sort=updated&per_page=3`);
      const repos = JSON.parse(result.text);
      if (!Array.isArray(repos)) throw new Error('项目列表格式异常');
      const selected = repos.find(r => !r.fork && !r.archived && typeof r.name === 'string');
      if (!selected) throw new Error('未发现公开研究项目'); repo = selected.name;
    }
    const result = await resource(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases?per_page=2`);
    const releases = JSON.parse(result.text);
    if (!Array.isArray(releases)) throw new Error('项目发布记录格式异常');
    const published = releases.filter(r => !r.draft && !r.prerelease && typeof r.html_url === 'string');
    if (published.length) return published.map(r => ({ url: safeUrl(r.html_url), title: r.name || r.tag_name }));
    const readme = JSON.parse((await resource(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/readme`)).text);
    if (typeof readme.html_url !== 'string') throw new Error('项目没有公开发布记录或说明文档');
    return [{ url: safeUrl(readme.html_url), title: owner + '/' + repo + ' 项目文档' }];
  }
  const preferred = feed.feedUrl || (['ahead-of-ai','import-ai'].includes(feed.id) ? new URL('/feed', feed.url).toString() : undefined);
  const result = await resource(preferred || feed.url, preferred ? 8_000_000 : MAX);
  let entries = /<(rss|feed)\b/i.test(result.text) ? parseFeed(result.text, result.url) : parseIndex(result.text, result.url, feed.id);
  if (!entries.length && !preferred) {
    const alternates = result.text.match(/<link\b[^>]*>/gi) || [];
    const tag = alternates.find(t => /application\/(rss\+xml|atom\+xml)/i.test(t));
    const href = tag?.match(/href=["']([^"']+)["']/i)?.[1];
    if (href) { const alt = await resource(new URL(href, result.url).toString(), 8_000_000); entries = parseFeed(alt.text, alt.url); }
  }
  const seen = new Set<string>();
  if (feed.id === 'simon-willison') entries = entries.filter(c => /\b(AI|LLM|model|agent|prompt|Claude|GPT|Gemini|Anthropic|OpenAI|inference|token|embedding|MCP|tool|eval|RAG|reasoning)\b/i.test(c.title));
  entries = entries.filter(c => { const key = normalizedArticleUrl(c.url); if (seen.has(key)) return false; seen.add(key); return true; });
  if (!entries.length) throw new Error('入口可访问，但未识别到可采集文章；需要研究助手核对动态页面');
  return entries.slice(0, 8);
}
