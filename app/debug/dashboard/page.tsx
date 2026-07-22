'use client';

import { useEffect, useState, useCallback } from 'react';

type Metrics = {
  hours: number;
  total: number;
  uniqueSessions: number;
  uniquePlayers: number;
  uniqueRooms: number;
  byEvent: Array<{ name: string; count: number; uniqueSessions: number; uniquePlayers: number }>;
  funnel: {
    steps: Array<{
      name: string;
      label: string;
      count: number;
      conversionFromPrev: number | null;
      conversionFromTop: number;
    }>;
  };
  topFails: Array<{ name: string; count: number }>;
  hourly: Array<{ hour: string; total: number; hands: number; fails: number }>;
  actionDist: Array<{ action: string; count: number; pct: number }>;
  roomConfig: {
    byMaxPlayers: Array<{ value: number; count: number }>;
    byBlinds: Array<{ label: string; count: number }>;
    byStartingChips: Array<{ label: string; count: number }>;
  };
  health: {
    pusherConnected: number;
    pusherDisconnected: number;
    pusherReconnected: number;
    apiErrors: number;
    apiAvgLatencyMs: number | null;
  };
  retention: {
    avgSessionMs: number | null;
    avgHandsPlayed: number | null;
    leaveReasons: Array<{ reason: string; count: number }>;
  };
  range: { fromMs: number; toMs: number };
};

const RANGES = [
  { label: '1 小时', hours: 1 },
  { label: '24 小时', hours: 24 },
  { label: '7 天', hours: 168 },
];

const ACTION_LABEL: Record<string, string> = {
  fold: '弃牌',
  check: '看牌',
  call: '跟注',
  raise: '加注',
  allin: '全押',
};

const fmtNum = (n: number) => n.toLocaleString('en-US');
const fmtMs = (ms: number) => {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const min = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${min}m${s}s`;
};

function Sparkline({ data, max }: { data: number[]; max: number }) {
  const w = 100;
  const h = 28;
  const barW = w / data.length;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-7" preserveAspectRatio="none">
      {data.map((v, i) => {
        const hh = max > 0 ? (v / max) * (h - 2) : 0;
        return (
          <rect
            key={i}
            x={i * barW + 0.5}
            y={h - hh}
            width={Math.max(0.5, barW - 1)}
            height={hh}
            rx={0.5}
            fill="currentColor"
            opacity={v === 0 ? 0.2 : 0.7}
          />
        );
      })}
    </svg>
  );
}

export default function DashboardPage() {
  const [hours, setHours] = useState(24);
  const [data, setData] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const r = await fetch(`/api/debug/events?metrics=1&hours=${hours}`);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const json = (await r.json()) as Metrics;
      setData(json);
      setLastUpdate(new Date());
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [hours]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 30_000); // 30s 自动刷新
    return () => clearInterval(t);
  }, [load]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-yellow-300 to-amber-200 bg-clip-text text-transparent">
              📊 埋点大盘
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              {lastUpdate ? `最后更新 ${lastUpdate.toLocaleTimeString('zh-CN')}` : '加载中…'}
              {' · '}30 秒自动刷新
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {RANGES.map((r) => (
              <button
                key={r.hours}
                onClick={() => setHours(r.hours)}
                className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition ${
                  hours === r.hours
                    ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30'
                    : 'bg-slate-800 text-slate-400 border border-slate-700 hover:text-slate-200'
                }`}
              >
                {r.label}
              </button>
            ))}
            <button
              onClick={load}
              disabled={loading}
              className="px-3 py-1.5 rounded-lg text-sm whitespace-nowrap bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700 disabled:opacity-50"
            >
              {loading ? '刷新中…' : '↻ 刷新'}
            </button>
            <a
              href="/"
              className="px-3 py-1.5 rounded-lg text-sm whitespace-nowrap bg-slate-800 text-slate-400 border border-slate-700 hover:text-slate-200"
            >
              ← 回首页
            </a>
          </div>
        </header>

        {err && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-rose-300 text-sm">
            加载失败：{err}
          </div>
        )}

        {data && (
          <>
            {/* 核心数字 */}
            <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card label="总事件数" value={fmtNum(data.total)} sub={`过去 ${data.hours}h`} />
              <Card label="独立玩家" value={fmtNum(data.uniquePlayers)} sub="去重 playerId" accent="green" />
              <Card label="独立房间" value={fmtNum(data.uniqueRooms)} sub="去重 roomId" accent="blue" />
              <Card label="完成手数" value={fmtNum(data.funnel.steps[4].count)} sub="到摊牌/弃牌收尾" accent="yellow" />
            </section>

            {/* 漏斗 */}
            <Section title="🎯 核心漏斗" subtitle="每步转化率（上一步 → 当前 / 起点 → 当前）">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-400 border-b border-slate-800">
                      <th className="py-2 pr-4">步骤</th>
                      <th className="py-2 pr-4 text-right">次数</th>
                      <th className="py-2 pr-4 text-right">上一步转化</th>
                      <th className="py-2 pr-4 text-right">总转化</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.funnel.steps.map((s, i) => (
                      <tr key={s.name} className="border-b border-slate-800/50">
                        <td className="py-2 pr-4">
                          <span className="inline-flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-400 text-xs flex items-center justify-center">
                              {i + 1}
                            </span>
                            {s.label}
                            <code className="text-xs text-slate-500">{s.name}</code>
                          </span>
                        </td>
                        <td className="py-2 pr-4 text-right font-mono">{fmtNum(s.count)}</td>
                        <td className="py-2 pr-4 text-right font-mono">
                          {s.conversionFromPrev === null ? (
                            <span className="text-slate-600">—</span>
                          ) : (
                            <RateCell pct={s.conversionFromPrev} />
                          )}
                        </td>
                        <td className="py-2 pr-4 text-right font-mono">
                          <RateCell pct={s.conversionFromTop} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>

            {/* 趋势 + 操作分布 + 房间配置 — 三栏 */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* 24h 趋势 */}
              <Section title="📈 事件趋势" subtitle={`${data.hourly.length} 个时间桶`} className="lg:col-span-2">
                <div className="text-amber-300">
                  <Sparkline data={data.hourly.map((b) => b.total)} max={Math.max(1, ...data.hourly.map((b) => b.total))} />
                </div>
                <div className="flex justify-between text-[10px] text-slate-500 mt-1 font-mono">
                  <span>{data.hourly[0]?.hour}</span>
                  <span>{data.hourly[data.hourly.length - 1]?.hour}</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                  <Stat label="峰值桶事件数" value={fmtNum(Math.max(0, ...data.hourly.map((b) => b.total)))} />
                  <Stat label="峰值桶开始手数" value={fmtNum(Math.max(0, ...data.hourly.map((b) => b.hands)))} />
                  <Stat label="总失败数" value={fmtNum(data.hourly.reduce((a, b) => a + b.fails, 0))} />
                  <Stat label="平均每桶" value={fmtNum(Math.round(data.total / Math.max(1, data.hourly.length)))} />
                </div>
              </Section>

              {/* 操作分布 */}
              <Section title="🎲 玩家操作分布" subtitle="从 player_action 拆出">
                {data.actionDist.length === 0 ? (
                  <Empty />
                ) : (
                  <div className="space-y-2">
                    {data.actionDist.map((a) => (
                      <div key={a.action} className="text-sm">
                        <div className="flex justify-between mb-1">
                          <span>
                            {ACTION_LABEL[a.action] ?? a.action}
                            <code className="text-xs text-slate-500 ml-2">{a.action}</code>
                          </span>
                          <span className="font-mono text-slate-400">
                            {fmtNum(a.count)} · {a.pct}%
                          </span>
                        </div>
                        <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-yellow-500 to-amber-400"
                            style={{ width: `${a.pct}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Section>
            </div>

            {/* 房间配置 */}
            <Section title="🃏 房间配置分布" subtitle="create_room_success 时记录">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <MiniTable
                  title="玩家数"
                  rows={data.roomConfig.byMaxPlayers.map((r) => ({ k: `${r.value} 人`, v: r.count }))}
                  empty="无"
                />
                <MiniTable
                  title="盲注"
                  rows={data.roomConfig.byBlinds.map((r) => ({ k: r.label, v: r.count }))}
                  empty="无"
                />
                <MiniTable
                  title="起始筹码"
                  rows={data.roomConfig.byStartingChips.map((r) => ({ k: r.label, v: r.count }))}
                  empty="无"
                />
              </div>
            </Section>

            {/* 健康度 + 留存 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Section title="❤️ 健康度">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <Stat
                    label="Pusher 连接"
                    value={fmtNum(data.health.pusherConnected)}
                    sub={`断开 ${data.health.pusherDisconnected} · 重连 ${data.health.pusherReconnected}`}
                  />
                  <Stat
                    label="API 错误"
                    value={fmtNum(data.health.apiErrors)}
                    sub="所有 _fail / api_error 累计"
                    tone={data.health.apiErrors > 0 ? 'warn' : 'ok'}
                  />
                  <Stat
                    label="API 平均延迟"
                    value={data.health.apiAvgLatencyMs !== null ? `${data.health.apiAvgLatencyMs}ms` : '—'}
                    sub="来自 action 端点"
                  />
                  <Stat
                    label="失败率"
                    value={`${data.total > 0 ? ((data.health.apiErrors / data.total) * 100).toFixed(2) : '0.00'}%`}
                    sub="错误 / 总事件"
                  />
                </div>
              </Section>
              <Section title="📅 留存">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <Stat
                    label="平均局内时长"
                    value={data.retention.avgSessionMs !== null ? fmtMs(data.retention.avgSessionMs) : '—'}
                    sub="session_end / page_hidden"
                  />
                  <Stat
                    label="平均手数/人"
                    value={data.retention.avgHandsPlayed !== null ? String(data.retention.avgHandsPlayed) : '—'}
                    sub="离开时累计"
                  />
                  <div className="col-span-2">
                    <div className="text-xs text-slate-400 mb-1">离开原因</div>
                    {data.retention.leaveReasons.length === 0 ? (
                      <Empty />
                    ) : (
                      <table className="w-full text-sm">
                        <tbody>
                          {data.retention.leaveReasons.map((r) => (
                            <tr key={r.reason} className="border-b border-slate-800/50">
                              <td className="py-1">{r.reason}</td>
                              <td className="py-1 text-right font-mono text-slate-400">{fmtNum(r.count)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              </Section>
            </div>

            {/* 事件 Top 10 */}
            <Section title="📋 事件 Top 10" subtitle="按次数降序">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-400 border-b border-slate-800">
                      <th className="py-2 pr-4">事件</th>
                      <th className="py-2 pr-4 text-right">次数</th>
                      <th className="py-2 pr-4 text-right">独立 session</th>
                      <th className="py-2 pr-4 text-right">独立 player</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byEvent.slice(0, 10).map((e) => (
                      <tr key={e.name} className="border-b border-slate-800/50">
                        <td className="py-1.5 pr-4">
                          <code className="text-xs text-slate-300">{e.name}</code>
                        </td>
                        <td className="py-1.5 pr-4 text-right font-mono">{fmtNum(e.count)}</td>
                        <td className="py-1.5 pr-4 text-right font-mono text-slate-400">
                          {fmtNum(e.uniqueSessions)}
                        </td>
                        <td className="py-1.5 pr-4 text-right font-mono text-slate-400">
                          {fmtNum(e.uniquePlayers)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>

            {/* 失败 Top */}
            {data.topFails.length > 0 && (
              <Section title="⚠️ 失败事件 Top 5" subtitle="需要关注的异常">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-400 border-b border-slate-800">
                      <th className="py-2 pr-4">事件</th>
                      <th className="py-2 pr-4 text-right">次数</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topFails.map((f) => (
                      <tr key={f.name} className="border-b border-slate-800/50">
                        <td className="py-1.5 pr-4">
                          <code className="text-xs text-rose-300">{f.name}</code>
                        </td>
                        <td className="py-1.5 pr-4 text-right font-mono text-rose-300">{fmtNum(f.count)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Section>
            )}

            <footer className="text-center text-xs text-slate-500 pt-4">
              数据源: <code>/api/debug/events?metrics=1&hours={data.hours}</code>
              {' · '}每 30 秒自动刷新
            </footer>
          </>
        )}
      </div>
    </div>
  );
}

function Card({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: 'green' | 'blue' | 'yellow';
}) {
  const accentMap: Record<'green' | 'blue' | 'yellow', string> = {
    green: 'from-emerald-500/20 to-emerald-500/5 border-emerald-500/30',
    blue: 'from-sky-500/20 to-sky-500/5 border-sky-500/30',
    yellow: 'from-yellow-500/20 to-yellow-500/5 border-yellow-500/30',
  };
  const accentClass = accent ? accentMap[accent] : 'from-slate-700/30 to-slate-800/30 border-slate-700';
  return (
    <div
      className={`rounded-xl border bg-gradient-to-br p-4 ${accentClass}`}
    >
      <div className="text-xs text-slate-400 mb-1">{label}</div>
      <div className="text-2xl font-bold font-mono">{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-slate-800 bg-slate-900/40 backdrop-blur p-4 md:p-5 ${className ?? ''}`}
    >
      <div className="mb-3">
        <h2 className="text-base font-semibold text-slate-100">{title}</h2>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'ok' | 'warn';
}) {
  return (
    <div>
      <div className="text-xs text-slate-400">{label}</div>
      <div
        className={`text-lg font-mono ${
          tone === 'warn' ? 'text-rose-300' : tone === 'ok' ? 'text-emerald-300' : ''
        }`}
      >
        {value}
      </div>
      {sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function RateCell({ pct }: { pct: number }) {
  // >100% 表示测试数据或同一个 session 多次触发，正常场景不会出现
  if (pct > 100) {
    return <span className="text-slate-500">{pct.toFixed(0)}%</span>;
  }
  const tone = pct >= 50 ? 'text-emerald-300' : pct >= 20 ? 'text-amber-300' : 'text-rose-300';
  return <span className={tone}>{pct}%</span>;
}

function MiniTable({ title, rows, empty }: { title: string; rows: Array<{ k: string; v: number }>; empty: string }) {
  return (
    <div>
      <div className="text-xs text-slate-400 mb-2">{title}</div>
      {rows.length === 0 ? (
        <Empty />
      ) : (
        <table className="w-full text-sm">
          <tbody>
            {rows.map((r) => (
              <tr key={r.k} className="border-b border-slate-800/50">
                <td className="py-1">{r.k}</td>
                <td className="py-1 text-right font-mono text-slate-400">{fmtNum(r.v)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {rows.length === 0 && <div className="text-xs text-slate-500">{empty}</div>}
    </div>
  );
}

function Empty() {
  return <div className="text-xs text-slate-500 italic">暂无数据</div>;
}
