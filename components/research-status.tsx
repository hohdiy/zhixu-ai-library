'use client';
import { useEffect, useState } from 'react';
import { Check, Clock, RefreshCw, TriangleAlert } from 'lucide-react';
type CheckResult = { feedId: string; status: string; checkedAt: string | null; error: string; sourceIds: string[] };
type State = { enabled: boolean; activeCount: number; activeFeedIds: string[]; latest: null | { id: string; startedAt: string; finishedAt: string | null; status: string; checks: CheckResult[]; counts: { checked: number; feeds: number; newArticles: number; ready: number; blocked: number; unread: number; failedFeeds: number } } };
export default function ResearchStatus() {
  const [state, setState] = useState<State | null>(null); const [error, setError] = useState(''); const [expanded, setExpanded] = useState(false);
  async function load() { try { const response = await fetch('/api/automation', { cache: 'no-store' }); if (!response.ok) throw new Error('自动采集状态暂时无法读取'); setState(await response.json() as State); setError(''); } catch (e) { setError(e instanceof Error ? e.message : '读取失败'); } }
  useEffect(() => { load(); }, []);
  if (error) return <div className="research-status"><TriangleAlert size={16}/><span>{error}</span><button onClick={load}>重试</button></div>;
  if (!state) return null;
  const run = state.latest;
  const labels: Record<string, string> = { pending: '待检查', checking: '检查中', collected: '已收录', no_update: '无新增', failed: '读取受限' };
  return <section className="research-status" aria-label="自动采集运行状态"><div className="research-status-heading"><Clock size={18}/><div><b>{state.enabled ? `自动采集已开启 · ${state.activeCount} 个核心信源` : '自动采集尚未启用'}</b><p>{state.enabled ? '每天北京时间 08:30 启动采集 → 新文章精读 → 站内简报。受限来源保留原因并在下轮重试。' : '关注清单已保存，需启用并配置云端任务后执行。'}</p></div><button className="icon-button" aria-label="刷新自动采集状态" onClick={load}><RefreshCw size={14}/></button></div>
    {run ? <><div className="research-run-summary"><span className={run.status === 'completed' ? 'research-ok' : ''}>{run.status === 'completed' ? <Check size={13}/> : <TriangleAlert size={13}/>} {run.status === 'running' ? '本轮进行中' : run.status === 'completed' ? '本轮完成' : '本轮部分完成'}</span><span>{new Date(run.startedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}</span><span>检查 {run.counts.checked}/{run.counts.feeds}</span><span>新增 {run.counts.newArticles}</span><span>已精读 {run.counts.ready}</span><span>受限 {run.counts.blocked + run.counts.failedFeeds}</span><button onClick={() => setExpanded(!expanded)}>{expanded ? '收起记录' : '查看逐站记录'}</button></div>{expanded && <div className="research-checks">{run.checks.map(c => <div key={c.feedId}><b>{c.feedId}</b><span>{labels[c.status] || c.status} · {c.sourceIds.length} 条新增</span>{c.error && <p>{c.error}</p>}</div>)}</div>}</> : <p className="research-not-run">尚无运行记录；任务启用不等于已经执行。</p>}
  </section>;
}
