'use client';
import { useEffect, useState } from 'react';
import { Rss, Plus, ExternalLink, Check, Pause, Download, Search, X, Loader2, Trash2 } from 'lucide-react';
import ResearchStatus from './research-status';
import { TOPICS, topicName } from '@/lib/topics';
import { FEED_KINDS, type FeedEntry, type FeedKind } from '@/lib/feed-types';

export default function FeedRegistry({ search, onSearch }: { search: string; onSearch: (value: string) => void }) {
  const [feeds, setFeeds] = useState<FeedEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [topic, setTopic] = useState('all');
  const [kind, setKind] = useState('all');
  const [language, setLanguage] = useState('all');
  const [followingOnly, setFollowingOnly] = useState(false);
  const [busy, setBusy] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', url: '', kind: 'official' as FeedKind, language: 'zh', topics: ['agent'], reason: '' });
  const [notice, setNotice] = useState('');
  async function load() {
    setError('');
    try { const r = await fetch('/api/feeds', { cache: 'no-store' }); const data = await r.json() as { error?: string; feeds: FeedEntry[] }; if (!r.ok) throw new Error(data.error); setFeeds(data.feeds); }
    catch (e) { setError(e instanceof Error ? e.message : '信源库加载失败'); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);
  async function mutate(data: Record<string, unknown>, id: string) {
    setBusy(id); setError(''); setNotice('');
    try {
      const r = await fetch('/api/feeds', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      const value = await r.json() as { error?: string }; if (!r.ok) throw new Error(value.error || '保存失败');
      await load();
      if (data.action === 'add') { setShowAdd(false); setForm({ name: '', url: '', kind: 'official', language: 'zh', topics: ['agent'], reason: '' }); }
      setNotice('已保存到信源库');
    } catch (e) { setError(e instanceof Error ? e.message : '保存失败'); }
    finally { setBusy(''); }
  }
  const filtered = feeds.filter(feed => (topic === 'all' || feed.topics.includes(topic)) && (kind === 'all' || feed.kind === kind) && (language === 'all' || feed.language === language) && (!followingOnly || feed.following) && `${feed.name} ${feed.reason} ${feed.url} ${feed.topics.map(topicName).join(' ')}`.toLowerCase().includes(search.toLowerCase()));
  function exportFeeds() {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), feeds }, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'zhixu-feed-registry.json'; a.click(); URL.revokeObjectURL(url);
  }
  return <section className="feed-registry" aria-label="AI 信源库">
    <div className="feed-hero panel"><span className="feed-hero-icon"><Rss size={26}/></span><div><span className="eyebrow">FOLLOW THE SOURCE</span><h2>把值得追踪的声音，留在这里。</h2><p>从官方研究到工程实测，沿六条主线建立自己的 AI 观察清单。</p></div><div className="feed-totals"><b>{feeds.length}<small>个信源</small></b><b>{feeds.filter(f => f.following).length}<small>已关注</small></b></div></div>
    <div className="feed-policy"><span>精选依据：领域代表性 · 公开产出 · 研究价值</span><span>核心 / 拓展为编辑优先级，非实时热度排名</span></div>
    <div className="feed-controls"><label className="feed-search"><Search size={16}/><input aria-label="搜索信源" placeholder="搜索信源、团队、研究方向…" value={search} onChange={e => onSearch(e.target.value)}/></label><div className="feed-control-actions"><button className="button secondary" onClick={exportFeeds} disabled={!feeds.length}><Download size={14}/>导出清单</button><button className="button primary" onClick={() => { setShowAdd(true); setError(''); }}><Plus size={15}/>添加信源</button></div></div>
    <div className="filter-bar feed-topic-filter"><div className="filter-scroll">{[{ id: 'all', name: '全部主题' }, ...TOPICS].map(t => <button key={t.id} className={topic === t.id ? 'selected' : ''} onClick={() => setTopic(t.id)}>{t.name}</button>)}</div></div>
    <div className="feed-selects"><select aria-label="信源类型" value={kind} onChange={e => setKind(e.target.value)}><option value="all">全部类型</option>{Object.entries(FEED_KINDS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select><select aria-label="信源语言" value={language} onChange={e => setLanguage(e.target.value)}><option value="all">全部语言</option><option value="zh">中文</option><option value="en">英文</option><option value="multi">中英 / 多语言</option></select><label><input type="checkbox" checked={followingOnly} onChange={e => setFollowingOnly(e.target.checked)}/>只看已关注</label><span>{filtered.length} 个信源</span></div>
    <ResearchStatus/>
    <div className="feed-schedule-note"><Rss size={15}/><p>核心信源的实际自动采集状态见上方运行面板。卡片频率仍为研究建议；拓展信源不会随本次核心采集一并启用。</p></div>
    {error && <div className="error-banner" role="alert">{error}<button onClick={load}>重试加载</button></div>}
    {notice && <p className="feed-saved" role="status"><Check size={13}/>{notice}</p>}
    {loading ? <div className="feed-empty"><Loader2 className="spin" size={24}/>正在读取信源库…</div> : filtered.length ? <div className="feed-grid">{filtered.map(feed => <article className="feed-card panel" key={feed.id} data-feed-id={feed.id}>
      <div className="feed-card-top"><span className={'feed-monogram ' + feed.kind}>{feed.name.slice(0, 1)}</span><div><span className="tiny-label">{FEED_KINDS[feed.kind]} · {feed.language === 'zh' ? '中文' : feed.language === 'en' ? '英文' : '多语言'}</span><h3><a href={feed.url} target="_blank" rel="noreferrer">{feed.name}<ExternalLink size={13}/></a></h3></div><span className={'feed-priority ' + feed.priority}>{feed.custom ? '自定义' : feed.priority === 'core' ? '核心' : '拓展'}</span></div>
      <p className="feed-reason">{feed.reason}</p><div className="source-tags">{feed.topics.map(id => <button key={id} className="tag" onClick={() => setTopic(id)}>{topicName(id)}</button>)}</div>
      <p className="feed-caution">{feed.note}</p>
      <div className="feed-access"><span className={feed.verification === 'checked' ? 'feed-checked' : 'feed-limited'}>{feed.verification === 'checked' ? '入口已核对' : feed.verification === 'limited' ? '动态页面 / 读取受限' : '待核对'}{feed.verifiedAt ? ' · ' + feed.verifiedAt.slice(5).replace('-', '/') : ''}</span>{feed.feedUrl && <a href={feed.feedUrl} target="_blank" rel="noreferrer"><Rss size={11}/>RSS / Atom</a>}</div>
      <div className="feed-card-bottom"><span>建议{feed.cadence === 'daily' ? '每日' : '每周'}检查</span><div>{feed.custom && <button className="icon-button" aria-label={'删除信源 ' + feed.name} disabled={!!busy} onClick={() => { if (window.confirm('删除这个自定义信源？')) mutate({ action: 'remove', id: feed.id }, feed.id); }}><Trash2 size={13}/></button>}<button className={'feed-follow ' + (feed.following ? 'following' : '')} aria-label={(feed.following ? '暂停关注 ' : '关注 ') + feed.name} disabled={!!busy} onClick={() => mutate({ action: 'follow', id: feed.id, following: !feed.following }, feed.id)}>{busy === feed.id ? <Loader2 size={13} className="spin"/> : feed.following ? <Check size={13}/> : <Plus size={13}/>}<span>{feed.following ? '已关注' : '关注'}</span>{feed.following && <Pause size={10}/>}</button></div></div>
    </article>)}</div> : <div className="feed-empty"><Rss size={28}/><h3>没有匹配的信源</h3><p>试试其他关键词或筛选条件，也可以添加自己的信源。</p><button className="button secondary" onClick={() => { onSearch(''); setTopic('all'); setKind('all'); setLanguage('all'); setFollowingOnly(false); }}>清除筛选</button></div>}
    {showAdd && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget && !busy) setShowAdd(false); }}><form className="modal feed-form" role="dialog" aria-modal="true" aria-labelledby="feed-add-title" onSubmit={e => { e.preventDefault(); mutate({ action: 'add', ...form }, 'add'); }}><button type="button" className="close icon-button" aria-label="关闭添加信源" onClick={() => setShowAdd(false)} disabled={!!busy}><X size={20}/></button><span className="modal-icon"><Rss size={23}/></span><h2 id="feed-add-title">添加一个长期信源</h2><p>填写博客、团队主页、项目或资讯入口。单篇文章请使用“收录链接”。</p><label>信源名称<input required maxLength={100} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}/></label><label>HTTPS 入口<input required type="url" placeholder="https://…" maxLength={2000} value={form.url} onChange={e => setForm({ ...form, url: e.target.value })}/></label><div className="feed-form-columns"><label>信源类型<select value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value as FeedKind })}>{Object.entries(FEED_KINDS).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label><label>语言<select value={form.language} onChange={e => setForm({ ...form, language: e.target.value })}><option value="zh">中文</option><option value="en">英文</option><option value="multi">中英 / 多语言</option></select></label></div><fieldset><legend>研究主题（至少一项）</legend><div className="feed-form-topics">{TOPICS.map(t => <label key={t.id}><input type="checkbox" checked={form.topics.includes(t.id)} onChange={e => setForm({ ...form, topics: e.target.checked ? [...form.topics, t.id] : form.topics.filter(id => id !== t.id) })}/>{t.name}</label>)}</div></fieldset><label>关注理由<textarea maxLength={500} value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} placeholder="这个信源值得长期关注什么？"/></label>{error && <p className="feed-form-error" role="alert">{error}</p>}<button className="button primary full" disabled={!!busy || !form.topics.length}>{busy === 'add' ? <Loader2 className="spin" size={15}/> : <Plus size={15}/>}加入信源库</button></form></div>}
  </section>;
}
