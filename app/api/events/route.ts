import { NextRequest, NextResponse } from 'next/server';
import { track, type AnalyticsEvent } from '@/lib/analytics-server';

// 客户端批量上报：一请求最多 20 条
const MAX_BATCH = 20;
const MAX_PROPS_DEPTH = 3; // 防止循环引用

export const runtime = 'nodejs';

function sanitize(obj: unknown, depth = 0): Record<string, unknown> | undefined {
  if (depth > MAX_PROPS_DEPTH) return undefined;
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (v == null) continue;
    const t = typeof v;
    if (t === 'string' || t === 'number' || t === 'boolean') {
      if (typeof v === 'string' && v.length > 200) out[k] = v.slice(0, 200) + '…';
      else out[k] = v;
    } else if (Array.isArray(v)) {
      out[k] = v.slice(0, 20);
    } else if (t === 'object') {
      const sub = sanitize(v, depth + 1);
      if (sub) out[k] = sub;
    }
    // 其它类型（function / symbol / undefined）丢弃
  }
  return out;
}

function extractSid(req: NextRequest): string | undefined {
  // 优先从 header 拿
  return (
    req.headers.get('x-analytics-sid') ??
    req.cookies.get('poker_sid')?.value ??
    undefined
  );
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  // 支持单条或批量
  const items: unknown[] = Array.isArray(body)
    ? body
    : body && typeof body === 'object' && 'events' in (body as object) && Array.isArray((body as { events: unknown[] }).events)
    ? (body as { events: unknown[] }).events
    : [body];

  if (items.length === 0) {
    return NextResponse.json({ ok: true, accepted: 0 });
  }
  if (items.length > MAX_BATCH) {
    return NextResponse.json({ ok: false, error: 'batch_too_large' }, { status: 413 });
  }

  const sid = extractSid(req);
  const ua = req.headers.get('user-agent')?.slice(0, 200);

  let accepted = 0;
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const it = item as Partial<AnalyticsEvent>;
    if (typeof it.name !== 'string' || !it.name) continue;
    if (!/^[a-z][a-z0-9_]{0,49}$/.test(it.name)) continue; // 严格白名单格式
    if (it.pid !== undefined && typeof it.pid !== 'string') continue;
    if (it.rid !== undefined && typeof it.rid !== 'string') continue;

    await track({
      name: it.name,
      sid,
      pid: typeof it.pid === 'string' ? it.pid.slice(0, 64) : undefined,
      rid: typeof it.rid === 'string' ? it.rid.slice(0, 32) : undefined,
      props: sanitize(it.props),
    });
    accepted++;
  }

  return NextResponse.json({ ok: true, accepted });
}
