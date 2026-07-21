import { NextRequest, NextResponse } from 'next/server';
import { queryEvents, getMetrics } from '@/lib/analytics-server';

export const runtime = 'nodejs';
// 排错用，强制走 Node 运行时（不缓存）

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const hours = Math.min(168, Math.max(1, Number(sp.get('hours') ?? '24')));
  const name = sp.get('name') ?? undefined;
  const limit = Math.min(1000, Math.max(1, Number(sp.get('limit') ?? '100')));
  const metrics = sp.get('metrics') === '1';

  if (metrics) {
    const m = await getMetrics({ hours });
    return NextResponse.json(m);
  }

  const events = await queryEvents({ hours, name, limit });
  return NextResponse.json({ hours, name, count: events.length, events });
}
