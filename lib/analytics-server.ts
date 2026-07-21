// 服务端埋点：把事件写入 Upstash（按天分 key，自动过期）
// 调用方：API route / 客户端 SDK POST /api/events

import { getRedis, IS_REDIS } from './game';

const DAY_KEY = (date: Date = new Date()) => {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `events:${y}-${m}-${d}`;
};

const RETENTION_DAYS = 15;
const MAX_EVENTS_PER_DAY = 50_000; // 防止爆炸，MVP 阶段够用

export type AnalyticsEvent = {
  // 事件名（snake_case）
  name: string;
  // 事件时间（毫秒）
  t: number;
  // 匿名 session id（浏览器实例级，重启会变）
  sid?: string;
  // 玩家 id（可选）
  pid?: string;
  // 房间 id（可选）
  rid?: string;
  // 事件属性（业务字段，不超过 1KB）
  props?: Record<string, unknown>;
  // 服务端补充
  server?: {
    ua?: string; // user agent（不存 IP）
    env?: 'dev' | 'prod';
  };
};

const MAX_PROPS_BYTES = 1024;

/**
 * 记录一条事件。失败不抛错（埋点不能阻塞主流程）。
 */
export async function track(event: Omit<AnalyticsEvent, 't' | 'server'>): Promise<void> {
  if (!IS_REDIS) {
    // 本地开发无 Redis：直接打到 console，方便看
    console.log('[analytics]', event.name, event.props ?? {});
    return;
  }
  try {
    const redis = getRedis();
    const full: AnalyticsEvent = {
      ...event,
      t: Date.now(),
      server: { env: process.env.NODE_ENV === 'production' ? 'prod' : 'dev' },
    };
    // props 太大就截断
    if (full.props && JSON.stringify(full.props).length > MAX_PROPS_BYTES) {
      full.props = { _truncated: true };
    }
    const key = DAY_KEY();
    const member = JSON.stringify(full);
    const pipe = redis.pipeline();
    pipe.lpush(key, member);
    pipe.ltrim(key, 0, MAX_EVENTS_PER_DAY - 1);
    pipe.expire(key, RETENTION_DAYS * 86400);
    await pipe.exec();
  } catch (err) {
    // 埋点失败绝不能影响主流程
    console.error('[analytics] track failed:', err);
  }
}

/**
 * 查询最近 N 小时事件。开发/排错用。
 */
export async function queryEvents(opts: {
  hours?: number;
  name?: string;
  limit?: number;
} = {}): Promise<AnalyticsEvent[]> {
  if (!IS_REDIS) return [];
  const { hours = 24, name, limit = 200 } = opts;
  const redis = getRedis();
  const now = Date.now();
  const startMs = now - hours * 3600_000;
  // 拉可能跨天的所有 key（今天 + 昨天）
  const keys: string[] = [];
  for (let i = 0; i < 2; i++) {
    const d = new Date(startMs - i * 86400_000);
    keys.push(DAY_KEY(d));
  }
  const uniqKeys = Array.from(new Set(keys));
  const results: AnalyticsEvent[] = [];
  for (const k of uniqKeys) {
    const raw = (await redis.lrange(k, 0, 999)) as unknown[];
    for (const item of raw) {
      let ev: AnalyticsEvent | null = null;
      if (item && typeof item === 'object') {
        // upstash client 自动 JSON parse 过了
        ev = item as AnalyticsEvent;
      } else if (typeof item === 'string') {
        try {
          ev = JSON.parse(item) as AnalyticsEvent;
        } catch {
          // skip malformed
        }
      }
      if (!ev) continue;
      if (ev.t < startMs) continue;
      if (name && ev.name !== name) continue;
      results.push(ev);
    }
  }
  results.sort((a, b) => b.t - a.t);
  return results.slice(0, limit);
}

/**
 * 简单聚合：每个事件名的次数 + 独立 session 数。MVP 看大盘用。
 */
export async function getMetrics(opts: { hours?: number } = {}): Promise<{
  hours: number;
  total: number;
  byEvent: Array<{ name: string; count: number; uniqueSessions: number; uniquePlayers: number }>;
  funnel: {
    homeViews: number;
    createdRooms: number;
    joinedRooms: number;
    startedHands: number;
    completedHands: number;
  };
  topFails: Array<{ name: string; count: number }>;
}> {
  const { hours = 24 } = opts;
  const events = await queryEvents({ hours, limit: 5000 });
  const total = events.length;

  const byEventMap = new Map<string, { count: number; sids: Set<string>; pids: Set<string> }>();
  for (const ev of events) {
    const entry = byEventMap.get(ev.name) ?? { count: 0, sids: new Set(), pids: new Set() };
    entry.count++;
    if (ev.sid) entry.sids.add(ev.sid);
    if (ev.pid) entry.pids.add(ev.pid);
    byEventMap.set(ev.name, entry);
  }
  const byEvent = Array.from(byEventMap.entries())
    .map(([name, v]) => ({
      name,
      count: v.count,
      uniqueSessions: v.sids.size,
      uniquePlayers: v.pids.size,
    }))
    .sort((a, b) => b.count - a.count);

  const get = (n: string) => byEventMap.get(n)?.count ?? 0;
  const funnel = {
    homeViews: get('home_view'),
    createdRooms: get('create_room_success'),
    joinedRooms: get('join_room_success'),
    startedHands: get('start_hand'),
    completedHands: get('hand_complete'),
  };

  const topFails = byEvent
    .filter((e) => e.name.endsWith('_fail') || e.name.endsWith('_error'))
    .map(({ name, count }) => ({ name, count }))
    .slice(0, 5);

  return { hours, total, byEvent, funnel, topFails };
}
