import { z } from 'zod';
import { addSource } from './library';
import { readFeedRegistry } from './feed-registry';
import { discoverFeed, normalizedArticleUrl, type Candidate } from './feed-discovery';
import { configureResearch, readResearchRun, readResearchState, recordReadingFailure, researchDb, researchQueue, startResearch, shanghaiDate } from './research-state';

function belongs(url: string, feed: { id: string; url: string }) {
  const u = new URL(normalizedArticleUrl(url)); const origin = new URL(feed.url);
  if (feed.id === 'hf-papers' && u.hostname === 'arxiv.org' && /^\/abs\/\d{4}\.\d+/.test(u.pathname)) return true;
  if (u.hostname.replace(/^www\./, '') !== origin.hostname.replace(/^www\./, '')) return false;
  if (normalizedArticleUrl(url) === normalizedArticleUrl(feed.url)) return false;
  return origin.hostname === 'github.com' ? u.pathname.startsWith(origin.pathname.replace(/\/$/, '') + '/') : u.pathname.length > 1;
}
async function saveCandidates(runId: string, feedId: string, candidates: Candidate[], note = '') {
  const db = researchDb();
  const feed = (await readFeedRegistry()).feeds.find(f => f.id === feedId);
  if (!feed) throw new Error('信源不存在');
  const valid = candidates.filter(c => belongs(c.url, feed));
  if (!valid.length && candidates.length) throw new Error('发现的链接不属于此信源文章范围');
  const existing = await db.prepare('SELECT url FROM sources').all<{ url: string }>();
  const known = new Set(existing.results.map(row => normalizedArticleUrl(row.url)));
  const fresh = valid.filter(c => !known.has(normalizedArticleUrl(c.url))).slice(0, 1);
  const sourceIds: string[] = [];
  for (const candidate of fresh) {
    const result = await addSource({ url: candidate.url, feedId, runId, topic: feed.topics[0] });
    if (!result.duplicate) sourceIds.push(result.source.id);
  }
  await db.prepare('UPDATE research_checks SET status=?,checked_at=?,candidates=?,source_ids=?,error=? WHERE id=?').bind(sourceIds.length ? 'collected' : 'no_update', new Date().toISOString(), JSON.stringify(valid.slice(0, 8)), JSON.stringify(sourceIds), note, runId + ':' + feedId).run();
  return { feedId, status: sourceIds.length ? 'collected' : 'no_update', discovered: valid.length, newSourceIds: sourceIds };
}
export async function checkResearchFeed(input: unknown) {
  const a = z.object({ runId: z.string().uuid(), feedId: z.string().max(100) }).parse(input);
  const run = await readResearchRun(a.runId);
  if (run.status !== 'running') return { feedId: a.feedId, skipped: true, reason: '运行已结束' };
  if (!run.feedIds.includes(a.feedId)) throw new Error('信源不在本轮范围');
  const db = researchDb(); const key = a.runId + ':' + a.feedId;
  const now = new Date().toISOString(); const expired = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const lease = await db.prepare("UPDATE research_checks SET status='checking',checked_at=? WHERE id=? AND (status='pending' OR (status='checking' AND checked_at<?))").bind(now, key, expired).run();
  if (!lease.meta.changes) return { feedId: a.feedId, skipped: true, result: run.checks.find(c => c.feedId === a.feedId) };
  try {
    const feed = (await readFeedRegistry()).feeds.find(f => f.id === a.feedId);
    if (!feed) throw new Error('信源不存在');
    if (!feed.following) throw new Error('此信源已暂停关注');
    return await saveCandidates(a.runId, a.feedId, await discoverFeed(feed));
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 1000) : '读取失败';
    await db.prepare("UPDATE research_checks SET status='failed',checked_at=?,error=? WHERE id=?").bind(new Date().toISOString(), message, key).run();
    return { feedId: a.feedId, status: 'failed', error: message };
  }
}
export async function supplementResearchFeed(input: unknown) {
  const a = z.object({ runId: z.string().uuid(), feedId: z.string().max(100), evidenceUrl: z.string().url(), note: z.string().min(10).max(1500), articles: z.array(z.object({ url: z.string().url(), title: z.string().max(500) })).max(8) }).parse(input);
  const run = await readResearchRun(a.runId);
  if (run.status !== 'running' || !run.feedIds.includes(a.feedId)) throw new Error('运行或信源范围不匹配');
  normalizedArticleUrl(a.evidenceUrl);
  const feed = (await readFeedRegistry()).feeds.find(f => f.id === a.feedId)!;
  if (new URL(a.evidenceUrl).hostname.replace(/^www\./,'') !== new URL(feed.url).hostname.replace(/^www\./,'')) throw new Error('检索证据必须指向该信源');
  const previous = run.checks.find(c => c.feedId === a.feedId);
  return saveCandidates(a.runId, a.feedId, a.articles, '研究助手补充核对：' + a.note + '；证据入口：' + a.evidenceUrl + (previous?.error ? '；此前读取错误：' + previous.error : ''));
}
export async function finishResearch(input: unknown) {
  const a = z.object({ runId: z.string().uuid() }).parse(input);
  const run = await readResearchRun(a.runId); const db = researchDb();
  if (run.status !== 'running') return run;
  if (run.counts.checked !== run.counts.feeds) throw new Error('还有信源尚未检查，不能结束本轮');
  if (run.counts.unread) throw new Error('还有新增文章尚未精读或记录失败原因');
  let brief = await db.prepare('SELECT id,source_ids,body FROM briefs WHERE id=?').bind(run.briefId).first<any>();
  if (!brief) {
    if (run.counts.ready) throw new Error('请先按本轮 briefId 保存有来源的精读简报');
    const failures = run.checks.filter(c => c.status === 'failed');
    const body = `本轮检查 ${run.counts.checked}/${run.counts.feeds} 个核心信源，新增 ${run.counts.newArticles} 条资料，完成精读 0 条。\n\n${run.counts.blocked ? '新增来源未能完成读取，未生成未经核实的事实或洞察。' : '本轮没有可加入简报的新文章。'}\n\n读取受限信源：\n` + (failures.map(c => `${c.feedId}：${c.error}`).join('\n') || '无') + '\n\n这是巡检状态简报，不将来源访问失败视为已完成研读。';
    await db.prepare("INSERT OR IGNORE INTO briefs (id,title,body,source_ids,created_at,kind) VALUES (?,?,?,?,?,'digest')").bind(run.briefId, 'AI 每日巡检简报 · ' + shanghaiDate(), body, '[]', new Date().toISOString()).run();
    brief = { id: run.briefId, source_ids: '[]', body };
  }
  const ids: string[] = JSON.parse(brief.source_ids);
  for (const id of ids) {
    const source = await db.prepare('SELECT status FROM sources WHERE id=?').bind(id).first<{ status: string }>();
    if (source?.status !== 'ready') throw new Error('精读简报不能引用尚未研读的文章');
  }
  const readySources = await db.prepare("SELECT id FROM sources WHERE research_run_id=? AND status='ready'").bind(a.runId).all<{ id: string }>();
  if (readySources.results.some(s => !ids.includes(s.id))) throw new Error('简报必须引用本轮全部已研读资料');
  if (!brief.body.includes('【本轮采集记录】')) {
    const footer = `\n\n【本轮采集记录】\n检查 ${run.counts.checked}/${run.counts.feeds} 个信源；新增 ${run.counts.newArticles} 条；已精读 ${run.counts.ready} 条；读取或精读受限 ${run.counts.blocked} 条。\n` + run.checks.filter(c => c.status === 'failed').map(c => `${c.feedId}：${c.error}`).join('\n');
    await db.prepare('UPDATE briefs SET body=? WHERE id=?').bind(brief.body + footer.slice(0, 6000), run.briefId).run();
  }
  const partial = run.counts.failedFeeds > 0 || run.counts.blocked > 0;
  await db.prepare('UPDATE research_runs SET status=?,finished_at=?,error=? WHERE id=?').bind(partial ? 'partial' : 'completed', new Date().toISOString(), partial ? '部分信源读取或文章精读受限，详见检查记录' : '', a.runId).run();
  return readResearchRun(a.runId);
}
export async function researchControl(input: unknown) {
  const a = z.object({ action: z.enum(['status','configure','start','check','queue','reading_failure','supplement','finish']) }).passthrough().parse(input);
  if (a.action === 'status') return a.runId ? readResearchRun(z.string().uuid().parse(a.runId)) : readResearchState();
  if (a.action === 'configure') return configureResearch(a);
  if (a.action === 'start') return startResearch(a);
  if (a.action === 'check') return checkResearchFeed(a);
  if (a.action === 'queue') return researchQueue(a);
  if (a.action === 'reading_failure') return recordReadingFailure(a);
  if (a.action === 'supplement') return supplementResearchFeed(a);
  return finishResearch(a);
}
