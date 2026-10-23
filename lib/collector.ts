import { TOPICS } from './topics';

const USER_AGENT = 'ZhixuLibrary/1.0 (personal research collector)';
const REDIRECTS = [301, 302, 303, 307, 308];
const MAX_BYTES = 2_000_000;

type BilibiliVideo = { canonicalUrl: string; bvid?: string; aid?: string; page: number };

export function bilibiliVideo(input: string): BilibiliVideo | null {
  const url = new URL(input);
  if (!['bilibili.com', 'www.bilibili.com', 'm.bilibili.com'].includes(url.hostname.toLowerCase())) return null;
  const match = url.pathname.match(/^\/video\/(BV[0-9A-Za-z]{10}|av[0-9]{1,20})\/?$/i);
  if (!match) return null;
  const id = match[1].slice(0, 2).toLowerCase() === 'bv' ? 'BV' + match[1].slice(2) : 'av' + match[1].slice(2);
  const requested = url.searchParams.get('p') || '1';
  const page = /^[1-9][0-9]{0,3}$/.test(requested) ? Number(requested) : 1;
  return {
    canonicalUrl: `https://www.bilibili.com/video/${id}/${page > 1 ? '?p=' + page : ''}`,
    ...(id.startsWith('BV') ? { bvid: id } : { aid: id.slice(2) }),
    page,
  };
}

export function safeUrl(input: string) {
  const url = new URL(input);
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !host.includes('.') || host.includes(':') || /^\d+(\.\d+)*$/.test(host) || /(^|\.)(localhost|local|internal|test|invalid|example)$/.test(host) || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new Error('请使用可公开访问的 HTTPS 网页链接');
  }
  const video = bilibiliVideo(url.toString());
  if (video) return video.canonicalUrl;
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) {
    if (key.startsWith('utm_') || ['fbclid', 'gclid'].includes(key)) url.searchParams.delete(key);
  }
  return url.toString();
}

function decode(s: string) {
  return s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Math.min(Number(n), 0x10ffff))).replace(/&#x([a-f0-9]+);/gi, (_, n) => String.fromCodePoint(Math.min(parseInt(n, 16), 0x10ffff))).replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

export function classify(text: string) {
  const rules: Record<string, RegExp> = {
    model: /\b(llm|foundation model|language model|pretrain|multimodal|gpt|gemini|claude)\b|基础模型|大模型|多模态/gi,
    reasoning: /\b(reasoning|inference|chain.of.thought|test.time|vllm|sglang)\b|推理|思维链/gi,
    agent: /\b(agent|tool.use|tool.call|mcp|memory|multi.agent)\b|智能体|工具调用/gi,
    rsi: /recursive|self.improv|self.evol|automated research|自我改进|自动科研|递归/gi,
    embodied: /robot|embodied|world model|action model|具身|机器人|世界模型/gi,
    workforce: /digital employee|workforce|workflow|enterprise|数字员工|工作流|企业|岗位/gi,
  };
  return TOPICS.map(t => ({ id: t.id, n: (text.match(rules[t.id]) || []).length }))
    .sort((a, b) => b.n - a.n).filter(x => x.n > 0).slice(0, 3).map(x => x.id);
}

async function readText(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('来源没有返回正文');
  let size = 0;
  let text = '';
  const decoder = new TextDecoder();
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.length;
      if (size > MAX_BYTES) throw new Error('来源页面过大，已保存链接供研读');
      text += decoder.decode(chunk.value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    await reader.cancel().catch(() => {});
  }
}

function topicFields(text: string) {
  const topics = classify(text);
  return { topic: topics[0] || 'unclassified', topics: JSON.stringify(topics) };
}

async function readBilibiliViaReader(apiUrl: string) {
  // Only the fixed public API URL and validated video ID go to the reader.
  // Never forward share parameters, visitor identity, cookies or Site credentials.
  let response: Response;
  try {
    response = await fetch('https://r.jina.ai/' + apiUrl, {
      redirect: 'error', signal: AbortSignal.timeout(25000),
      headers: { Accept: 'application/json', DNT: '1' },
    });
  } catch {
    throw new Error('B站元信息直接读取和公开读取服务均连接失败或超时，已保留链接，可稍后重试');
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`B站公开读取服务暂时不可用（HTTP ${response.status}），已保留链接，可稍后重试`);
  }
  try {
    const envelope = JSON.parse(await readText(response));
    const page = envelope?.data ?? envelope;
    if (page?.url !== apiUrl || typeof page?.content !== 'string') {
      throw new Error('B站公开读取结果的来源不匹配，已保留链接供核对');
    }
    return JSON.parse(page.content);
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error('B站公开读取服务返回异常，已保留链接，可稍后重试');
    throw error;
  }
}

async function readBilibiliMetadata(apiUrl: string) {
  let response: Response;
  try {
    response = await fetch(apiUrl, {
      redirect: 'error', signal: AbortSignal.timeout(16000),
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    });
  } catch {
    return { result: await readBilibiliViaReader(apiUrl), viaReader: true };
  }
  if (!response.ok) {
    await response.body?.cancel();
    if (response.status === 412 || response.status >= 500) {
      return { result: await readBilibiliViaReader(apiUrl), viaReader: true };
    }
    // Do not retry permission or rate-limit responses through another service.
    throw new Error(`B站公开视频信息暂时读取受限（HTTP ${response.status}），已保留链接，可稍后重试`);
  }
  try {
    return { result: JSON.parse(await readText(response)), viaReader: false };
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error('B站公开视频信息返回异常，已保留链接，可稍后重试');
    throw error;
  }
}

async function collectBilibili(video: BilibiliVideo) {
  const query = new URLSearchParams(video.bvid ? { bvid: video.bvid } : { aid: video.aid! });
  const { result, viaReader } = await readBilibiliMetadata('https://api.bilibili.com/x/web-interface/view?' + query);
  if (result?.code !== 0) {
    const code = typeof result?.code === 'number' ? result.code : '未知';
    throw new Error(`B站视频不可公开读取（${code}），可能已删除或需要权限，已保留链接`);
  }
  const data = result.data;
  if (!data || typeof data.title !== 'string' || !data.title.trim()) {
    throw new Error('B站视频信息缺少有效标题，已保留链接，可稍后重试');
  }
  if ((video.bvid && data.bvid !== video.bvid) || (video.aid && String(data.aid) !== video.aid)) {
    throw new Error('B站元信息的视频标识不匹配，已保留链接供核对');
  }
  const part = Array.isArray(data.pages) ? data.pages.find((p: any) => p.page === video.page) : undefined;
  if (video.page > 1 && !part) throw new Error('B站视频中未找到指定分P，已保留链接，请检查 p 参数');
  const partTitle = video.page > 1 && typeof part?.part === 'string' ? ` · P${video.page} ${part.part}` : '';
  const title = (data.title.trim() + partTitle).slice(0, 350);
  const author = typeof data.owner?.name === 'string' ? data.owner.name.slice(0, 300) : '';
  const description = typeof data.desc === 'string' ? data.desc.trim().slice(0, 35000) : '';
  const published = typeof data.pubdate === 'number' && data.pubdate > 0 ? new Date(data.pubdate * 1000) : null;
  const publishedAt = published && Number.isFinite(published.getTime()) ? published.toISOString() : null;
  const duration = typeof part?.duration === 'number' ? part.duration : data.duration;
  const summary = description
    ? 'B站视频简介（未转写视频）：' + description.slice(0, 600)
    : `B站视频${author ? '，UP主：' + author : ''}。该视频未提供简介，尚未读取音视频或字幕，待进一步研读。`;
  const body = [
    '来源类型：B站公开视频元信息',
    '元信息读取路径：' + (viaReader ? 'B站公开接口，经 Jina Reader 读取' : 'B站公开接口直接读取'),
    '内容边界：仅采集标题、UP主、发布日期及简介；未读取音视频或字幕，不能据此确认视频内的论据或结论。',
    '视频页：' + video.canonicalUrl,
    '标题：' + title,
    'UP主：' + (author || '未知'),
    '发布日期：' + (publishedAt || '未知'),
    ...(typeof duration === 'number' && duration > 0 ? ['时长：' + duration + ' 秒'] : []),
    '简介：' + (description || '该视频未提供简介。'),
  ].join('\n');
  return { title, summary, body, author, company: '', publishedAt, ...topicFields(title + ' ' + description) };
}

export async function collect(input: string) {
  let url = safeUrl(input);
  let response: Response | undefined;
  for (let redirects = 0; redirects <= 4; redirects++) {
    const video = bilibiliVideo(url);
    if (video) return collectBilibili(video);
    response = await fetch(url, {
      redirect: 'manual', signal: AbortSignal.timeout(16000),
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml,text/plain' },
    });
    if (!REDIRECTS.includes(response.status)) break;
    const location = response.headers.get('location');
    await response.body?.cancel();
    if (!location) throw new Error('来源重定向缺少目标');
    if (redirects === 4) throw new Error('来源重定向次数过多，已保留链接供稍后重试');
    url = safeUrl(new URL(location, url).toString());
  }
  if (!response?.ok) throw new Error(`原站暂时无法读取（${response?.status || '超时'}），已保留链接供稍后重试`);
  const type = response.headers.get('content-type') || '';
  if (!/text\/html|text\/plain|application\/xhtml/.test(type)) throw new Error('已保存链接；此来源需要研读工具提取（例如 PDF）');
  const html = await readText(response);
  const meta = (name: string) => {
    for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
      const attrs: Record<string, string> = {};
      for (const match of tag.matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g)) attrs[match[1].toLowerCase()] = decode(match[2]);
      if (attrs.name === name || attrs.property === name) return attrs.content || '';
    }
    return '';
  };
  const title = (meta('og:title') || decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || new URL(url).hostname)).trim().slice(0, 350);
  const plain = decode(html.replace(/<(script|style|nav|header|footer|noscript|svg)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ').replace(/<\/(p|div|h[1-6]|article|section|li)>/gi, '\n').replace(/<[^>]+>/g, ' ')).replace(/[ \t]+/g, ' ').replace(/\n\s*\n/g, '\n').trim().slice(0, 45000);
  const summary = (meta('description') || meta('og:description') || plain.slice(0, 300)).slice(0, 650);
  const published = meta('article:published_time') || meta('date') || meta('citation_publication_date');
  const date = published && Number.isFinite(Date.parse(published)) ? new Date(published).toISOString() : null;
  const host = new URL(url).hostname.replace(/^www\./, '');
  const companies: Record<string, string> = { 'openai.com': 'OpenAI', 'anthropic.com': 'Anthropic', 'deepmind.google': 'Google DeepMind', 'blog.google': 'Google', 'ai.meta.com': 'Meta', 'huggingface.co': 'Hugging Face', 'nvidia.com': 'NVIDIA', 'deepseek.com': 'DeepSeek' };
  const company = Object.entries(companies).find(([domain]) => host === domain || host.endsWith('.' + domain))?.[1] || '';
  return { title, summary, body: plain, author: meta('author') || meta('citation_author'), company, publishedAt: date, ...topicFields(title + ' ' + summary + ' ' + plain.slice(0, 12000)) };
}
