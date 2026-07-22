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
    if (!redis) return;
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
  if (!redis) return [];
  const now = Date.now();
  const startMs = now - hours * 3600_000;
  // 拉可能跨天的所有 key（今天 + 起始那一天）
  // 注意：必须包含「今天」，因为可能只是几个小时前的数据
  const keys: string[] = [DAY_KEY(new Date(now)), DAY_KEY(new Date(startMs))];
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
 * 聚合：每个事件名的次数 + 独立 session/player/room 数 + 漏斗 + 趋势 + 操作分布。
 * MVP 看大盘用，PM 直接打开 dashboard 页面就是这些数据。
 */
export async function getMetrics(opts: { hours?: number } = {}): Promise<{
  hours: number;
  total: number;
  // 平台大盘
  uniqueSessions: number;
  uniquePlayers: number;
  uniqueRooms: number;
  // 事件 Top
  byEvent: Array<{ name: string; count: number; uniqueSessions: number; uniquePlayers: number }>;
  // 漏斗 + 转化率
  funnel: {
    steps: Array<{ name: string; label: string; count: number; conversionFromPrev: number | null; conversionFromTop: number | null }>;
  };
  // 失败 Top
  topFails: Array<{ name: string; count: number }>;
  // 24h 趋势（按小时分桶，buckets 数 = min(hours, 24)）
  hourly: Array<{ hour: string; total: number; hands: number; fails: number }>;
  // 玩家操作分布（fold / check / call / raise / allin）
  actionDist: Array<{ action: string; count: number; pct: number }>;
  // 房间配置分布
  roomConfig: {
    byMaxPlayers: Array<{ value: number; count: number }>;
    byBlinds: Array<{ label: string; count: number }>;
    byStartingChips: Array<{ label: string; count: number }>;
  };
  // 健康度
  health: {
    pusherConnected: number;
    pusherDisconnected: number;
    pusherReconnected: number;
    apiErrors: number;
    apiAvgLatencyMs: number | null;
  };
  // 留存
  retention: {
    avgSessionMs: number | null;
    avgHandsPlayed: number | null;
    leaveReasons: Array<{ reason: string; count: number }>;
  };
  // 时间窗
  range: { fromMs: number; toMs: number };
}> {
  const { hours = 24 } = opts;
  const now = Date.now();
  const startMs = now - hours * 3600_000;
  // 24h 趋势用 24 个桶，>24h 缩到 24 个桶
  const BUCKETS = Math.min(hours, 24);
  const BUCKET_MS = (hours * 3600_000) / BUCKETS;
  const events = await queryEvents({ hours, limit: 10_000 });
  const total = events.length;

  // 全局独立数
  const allSids = new Set<string>();
  const allPids = new Set<string>();
  const allRids = new Set<string>();
  for (const ev of events) {
    if (ev.sid) allSids.add(ev.sid);
    if (ev.pid) allPids.add(ev.pid);
    if (ev.rid) allRids.add(ev.rid);
  }

  // 事件 Top
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

  // 漏斗 + 转化率
  const top = get('home_view') || 1; // 防 0 除
  const funnelSteps: Array<{ name: string; label: string; count: number }> = [
    { name: 'home_view', label: '访问首页', count: get('home_view') },
    { name: 'create_room_success', label: '创建房间', count: get('create_room_success') },
    { name: 'join_room_success', label: '加入房间', count: get('join_room_success') },
    { name: 'start_hand', label: '开始一手', count: get('start_hand') },
    { name: 'hand_complete', label: '完成一手', count: get('hand_complete') },
  ];
  const funnelStepsWithRate = funnelSteps.map((s, i) => {
    const prev = i > 0 ? funnelSteps[i - 1].count : null;
    return {
      ...s,
      conversionFromPrev: prev && prev > 0 ? +(s.count / prev * 100).toFixed(1) : null,
      conversionFromTop: +(s.count / top * 100).toFixed(1),
    };
  });

  // 失败 Top
  const topFails = byEvent
    .filter((e) => e.name.endsWith('_fail') || e.name.endsWith('_error'))
    .map(({ name, count }) => ({ name, count }))
    .slice(0, 5);

  // 24h 趋势（按桶聚合）
  const buckets = Array.from({ length: BUCKETS }, (_, i) => {
    const bStart = startMs + i * BUCKET_MS;
    const bEnd = bStart + BUCKET_MS;
    const d = new Date(bStart);
    const hour = `${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')} ${String(d.getUTCHours()).padStart(2, '0')}:00`;
    return { hour, total: 0, hands: 0, fails: 0 };
  });
  for (const ev of events) {
    if (ev.t < startMs) continue;
    const idx = Math.min(BUCKETS - 1, Math.floor((ev.t - startMs) / BUCKET_MS));
    buckets[idx].total++;
    if (ev.name === 'start_hand' || ev.name === 'hand_complete') buckets[idx].hands++;
    if (ev.name.endsWith('_fail') || ev.name.endsWith('_error')) buckets[idx].fails++;
  }

  // 玩家操作分布
  const actionCounts = new Map<string, number>();
  for (const ev of events) {
    if (ev.name === 'player_action') {
      const a = String(ev.props?.action ?? 'unknown');
      actionCounts.set(a, (actionCounts.get(a) ?? 0) + 1);
    }
  }
  const actionTotal = Array.from(actionCounts.values()).reduce((a, b) => a + b, 0) || 1;
  const actionDist = Array.from(actionCounts.entries())
    .map(([action, count]) => ({ action, count, pct: +(count / actionTotal * 100).toFixed(1) }))
    .sort((a, b) => b.count - a.count);

  // 房间配置分布
  const maxPlayersCounts = new Map<number, number>();
  const blindsCounts = new Map<string, number>();
  const startingChipsCounts = new Map<string, number>();
  for (const ev of events) {
    if (ev.name === 'create_room_success') {
      const mp = Number(ev.props?.max_players ?? 0);
      if (mp) maxPlayersCounts.set(mp, (maxPlayersCounts.get(mp) ?? 0) + 1);
      const sb = Number(ev.props?.small_blind ?? 0);
      const bb = Number(ev.props?.big_blind ?? 0);
      if (sb && bb) {
        const k = `${sb}/${bb}`;
        blindsCounts.set(k, (blindsCounts.get(k) ?? 0) + 1);
      }
      const sc = Number(ev.props?.starting_chips ?? 0);
      if (sc) {
        // 分桶：<500 / <1k / <2k / <5k / >=5k
        let bucket = '>=5000';
        if (sc < 500) bucket = '<500';
        else if (sc < 1000) bucket = '500-999';
        else if (sc < 2000) bucket = '1k-1999';
        else if (sc < 5000) bucket = '2k-4999';
        startingChipsCounts.set(bucket, (startingChipsCounts.get(bucket) ?? 0) + 1);
      }
    }
  }
  const byMaxPlayers = Array.from(maxPlayersCounts.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => a.value - b.value);
  const byBlinds = Array.from(blindsCounts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
  const byStartingChips = ['<500', '500-999', '1k-1999', '2k-4999', '>=5000']
    .map((label) => ({ label, count: startingChipsCounts.get(label) ?? 0 }))
    .filter((x) => x.count > 0);

  // 健康度
  let apiLatencySum = 0;
  let apiLatencyN = 0;
  for (const ev of events) {
    if (ev.name === 'api_latency') {
      const v = Number(ev.props?.latency_ms ?? 0);
      if (v > 0) {
        apiLatencySum += v;
        apiLatencyN++;
      }
    }
  }
  const health = {
    pusherConnected: get('pusher_connected'),
    pusherDisconnected: get('pusher_disconnected'),
    pusherReconnected: get('pusher_reconnected'),
    apiErrors: get('api_error') + get('player_action_fail') + get('start_hand_fail') + get('reconnect_fail') + get('chat_send_fail'),
    apiAvgLatencyMs: apiLatencyN > 0 ? Math.round(apiLatencySum / apiLatencyN) : null,
  };

  // 留存
  let sessionSum = 0;
  let sessionN = 0;
  let handsSum = 0;
  let handsN = 0;
  const leaveReasons = new Map<string, number>();
  for (const ev of events) {
    if (ev.name === 'session_end' || ev.name === 'page_hidden' || ev.name === 'leave_room') {
      const v = Number(ev.props?.session_duration_ms ?? 0);
      if (v > 0) {
        sessionSum += v;
        sessionN++;
      }
      const h = Number(ev.props?.hands_played ?? 0);
      if (h > 0) {
        handsSum += h;
        handsN++;
      }
      if (ev.name === 'leave_room') {
        const r = String(ev.props?.reason ?? 'unknown');
        leaveReasons.set(r, (leaveReasons.get(r) ?? 0) + 1);
      }
    }
  }
  const retention = {
    avgSessionMs: sessionN > 0 ? Math.round(sessionSum / sessionN) : null,
    avgHandsPlayed: handsN > 0 ? +(handsSum / handsN).toFixed(1) : null,
    leaveReasons: Array.from(leaveReasons.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count),
  };

  return {
    hours,
    total,
    uniqueSessions: allSids.size,
    uniquePlayers: allPids.size,
    uniqueRooms: allRids.size,
    byEvent,
    funnel: { steps: funnelStepsWithRate },
    topFails,
    hourly: buckets,
    actionDist,
    roomConfig: { byMaxPlayers, byBlinds, byStartingChips },
    health,
    retention,
    range: { fromMs: startMs, toMs: now },
  };
}
