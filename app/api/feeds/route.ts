import { readFeedRegistry, mutateFeedRegistry } from '@/lib/feed-registry';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
export async function GET() { try { return Response.json(await readFeedRegistry(), { headers }); } catch { return Response.json({ error: '信源库暂时无法加载，请稍后重试' }, { status: 500, headers }); } }
export async function POST(req: Request) {
  try {
    const origin = req.headers.get('origin');
    if (origin && origin !== new URL(req.url).origin) return Response.json({ error: '请求来源无效' }, { status: 403, headers });
    const text = await req.text();
    if (text.length > 12000) return Response.json({ error: '请求过大' }, { status: 413, headers });
    return Response.json(await mutateFeedRegistry(JSON.parse(text)), { headers });
  } catch (e) { return Response.json({ error: e instanceof Error ? e.message : '操作失败' }, { status: 400, headers }); }
}
