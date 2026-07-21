// 客户端埋点 SDK
// 用法：
//   import { track, identify } from '@/lib/analytics-client';
//   track('create_room_success', { roomId, smallBlind: 10 });
//
// 特性：
// - 批量（攒 5 条或 5 秒 flush 一次）
// - 失败熔断（连续失败 3 次 → 暂停 30 秒）
// - 离线缓存（localStorage，待联网重发）
// - pagehide 之前强制 flush
// - 匿名 sid（浏览器实例级，关闭 tab 即失效）

'use client';

const STORAGE_KEY = 'poker_analytics_queue_v1';
const SID_KEY = 'poker_sid';
const FLUSH_INTERVAL_MS = 5_000;
const FLUSH_BATCH_SIZE = 5;
const MAX_QUEUE = 200; // 防止 localStorage 爆炸
const COOLDOWN_MS = 30_000;
const FAIL_THRESHOLD = 3;

type QueueItem = {
  name: string;
  t: number;
  pid?: string;
  rid?: string;
  props?: Record<string, unknown>;
};

let sid: string | null = null;
let queue: QueueItem[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;
let consecutiveFails = 0;
let cooldownUntil = 0;
let initialized = false;

function getSid(): string {
  if (sid) return sid;
  if (typeof window === 'undefined') return 'ssr';
  try {
    let s = sessionStorage.getItem(SID_KEY);
    if (!s) {
      s = crypto.randomUUID();
      sessionStorage.setItem(SID_KEY, s);
    }
    sid = s;
  } catch {
    sid = 'no-storage';
  }
  return sid;
}

function loadPersisted(): QueueItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as QueueItem[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function persist(): void {
  if (typeof window === 'undefined') return;
  try {
    // 只保留最新 MAX_QUEUE 条
    const toStore = queue.slice(0, MAX_QUEUE);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
  } catch {
    // 满了就清掉，避免影响主流程
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }
}

async function doFlush(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (Date.now() < cooldownUntil) return;
  if (queue.length === 0) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

  const batch = queue.slice(0, FLUSH_BATCH_SIZE * 4);
  try {
    const res = await fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-analytics-sid': getSid() },
      body: JSON.stringify(batch),
      keepalive: true,
    });
    if (!res.ok) throw new Error('http ' + res.status);
    // 成功：移除已发送的
    queue.splice(0, batch.length);
    persist();
    consecutiveFails = 0;
  } catch {
    consecutiveFails++;
    if (consecutiveFails >= FAIL_THRESHOLD) {
      cooldownUntil = Date.now() + COOLDOWN_MS;
    }
  }
}

function ensureInit(): void {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;
  // 加载历史未发送事件
  queue = loadPersisted();
  // 定时 flush
  flushTimer = setInterval(() => {
    if (queue.length >= FLUSH_BATCH_SIZE) void doFlush();
  }, FLUSH_INTERVAL_MS);
  // 切后台/关 tab 前 flush
  const onHide = () => {
    void doFlush();
  };
  window.addEventListener('pagehide', onHide);
  window.addEventListener('beforeunload', onHide);
  window.addEventListener('online', () => {
    cooldownUntil = 0;
    void doFlush();
  });
}

export function track(name: string, props?: Record<string, unknown>, ctx?: { pid?: string; rid?: string }): void {
  if (typeof window === 'undefined') return;
  ensureInit();
  const item: QueueItem = {
    name,
    t: Date.now(),
    pid: ctx?.pid,
    rid: ctx?.rid,
    props,
  };
  queue.push(item);
  // 超出上限丢弃最老
  if (queue.length > MAX_QUEUE) {
    queue = queue.slice(queue.length - MAX_QUEUE);
  }
  if (queue.length >= FLUSH_BATCH_SIZE) {
    void doFlush();
  } else {
    persist(); // 立即落盘，防丢
  }
}

/** 设置当前玩家上下文（进入房间时调用一次） */
export function setContext(ctx: { pid?: string; rid?: string }): void {
  if (typeof window === 'undefined') return;
  ensureInit();
  (window as unknown as { __poker_analytics_ctx?: typeof ctx }).__poker_analytics_ctx = ctx;
}

function getCtx(): { pid?: string; rid?: string } | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { __poker_analytics_ctx?: { pid?: string; rid?: string } })
    .__poker_analytics_ctx;
}

/** 带当前上下文的便捷 track */
export function trackCtx(name: string, props?: Record<string, unknown>): void {
  track(name, props, getCtx());
}
