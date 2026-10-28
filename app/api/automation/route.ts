import { researchControl } from '@/lib/research-runner';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
export async function GET() { try { return Response.json(await researchControl({ action: 'status' }), { headers }); } catch { return Response.json({ error: '自动采集状态暂时不可用' }, { status: 500, headers }); } }
export async function POST(req: Request) {
  try {
    const origin = req.headers.get('origin');
    if (origin && origin !== new URL(req.url).origin) return Response.json({ error: '请求来源无效' }, { status: 403, headers });
    const body = await req.text(); if (body.length > 25000) return Response.json({ error: '请求过大' }, { status: 413, headers });
    return Response.json(await researchControl(JSON.parse(body)), { headers });
  } catch (e) { return Response.json({ error: e instanceof Error ? e.message : '自动采集操作失败' }, { status: 400, headers }); }
}
