import { env } from 'cloudflare:workers';
import { z } from 'zod';
import curated from '@/data/feed-registry.json';
import { safeUrl } from './collector';
import { FEED_KINDS, type FeedEntry } from './feed-types';

const entrySchema = z.object({
  name: z.string().trim().min(1).max(100), url: z.string().max(2000).transform(safeUrl),
  kind: z.enum(['official','project','community','newsletter','media']),
  topics: z.array(z.enum(['model','reasoning','agent','rsi','embodied','workforce'])).min(1).max(6),
  language: z.enum(['zh','en','multi']), reason: z.string().trim().max(500).default('用户添加的研究信源'),
});
type Stored = { id: string; following: string; entry: string; updated_at: string };
function database() { if (!env.DB) throw new Error('资料库暂不可用'); return env.DB; }
export async function readFeedRegistry() {
  const result = await database().prepare('SELECT id, following, entry, updated_at FROM feed_registry').all<Stored>();
  const overrides = new Map(result.results.map(row => [row.id, row]));
  const feeds: FeedEntry[] = (curated as FeedEntry[]).map(feed => ({ ...feed, following: overrides.has(feed.id) ? overrides.get(feed.id)!.following === '1' : feed.following }));
  for (const row of result.results) {
    if (!row.entry || curated.some(f => f.id === row.id)) continue;
    try { const entry = entrySchema.parse(JSON.parse(row.entry)); feeds.push({ ...entry, id: row.id, priority: 'extended', cadence: 'weekly', verifiedAt: null, verification: 'unverified', note: '用户添加，尚未核对入口及内容质量', following: row.following === '1', custom: true }); } catch { /* Ignore malformed custom rows; never trust persisted JSON as instructions. */ }
  }
  return { feeds, followingCount: feeds.filter(f => f.following).length, verifiedAt: '2026-10-23', policy: '按领域代表性、公开产出和研究价值精选；核心/拓展为编辑优先级，不是实时热度排名。频率为巡检建议，非每个信源独立运行的采集任务。', kinds: FEED_KINDS };
}
export async function mutateFeedRegistry(input: unknown) {
  const action = z.object({ action: z.enum(['follow','add','remove']) }).passthrough().parse(input);
  const db = database();
  if (action.action === 'add') {
    const entry = entrySchema.parse(action);
    const existing = await readFeedRegistry();
    const canonical = (url: string) => url.replace(/\/$/, '');
    if (existing.feeds.some(f => canonical(f.url) === canonical(entry.url))) throw new Error('该信源已在库中');
    const id = 'custom-' + crypto.randomUUID();
    await db.prepare('INSERT INTO feed_registry (id, following, entry, updated_at) VALUES (?, ?, ?, ?)').bind(id, '1', JSON.stringify(entry), new Date().toISOString()).run();
    return { id, following: true };
  }
  const id = z.string().max(150).parse(action.id);
  const found = (await readFeedRegistry()).feeds.find(f => f.id === id);
  if (!found) throw new Error('信源不存在');
  if (action.action === 'remove') {
    if (!found.custom) throw new Error('精选信源可暂停关注；仅自定义信源可删除');
    await db.prepare('DELETE FROM feed_registry WHERE id = ?').bind(id).run();
    return { id, removed: true };
  }
  const following = z.boolean().parse(action.following);
  await db.prepare('INSERT INTO feed_registry (id, following, entry, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET following = excluded.following, updated_at = excluded.updated_at').bind(id, following ? '1' : '0', '', new Date().toISOString()).run();
  return { id, following };
}
