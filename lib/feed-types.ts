export const FEED_KINDS = { official: '官方研究与发布', project: '开源项目', community: '论文与社区', newsletter: '作者与通讯', media: '中文资讯' } as const;
export type FeedKind = keyof typeof FEED_KINDS;
export type FeedEntry = {
  id: string; name: string; url: string; kind: FeedKind; topics: string[];
  language: 'zh' | 'en' | 'multi'; priority: 'core' | 'extended'; cadence: 'daily' | 'weekly';
  reason: string; note: string; verifiedAt: string | null; verification: 'checked' | 'limited' | 'unverified';
  feedUrl?: string; following: boolean; custom?: boolean;
};
