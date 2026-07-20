'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { Room, PlayerAction, PlayerState } from '@/types/poker';
import { Card } from '@/components/Card';
import { ActionPanel } from '@/components/ActionPanel';
import { Lobby } from '@/components/Lobby';
import { Button } from '@/components/ui/Button';
import { Copy, LogOut, Crown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getRoomChannel } from '@/lib/pusher-client';

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = params.id as string;
  const [room, setRoom] = useState<Room | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<{ playerId: string; nickname: string; text: string; time: number }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const channelRef = useRef<ReturnType<typeof getRoomChannel>>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // 初始化：从 sessionStorage 取 playerId，尝试 reconnect
  useEffect(() => {
    const pid = sessionStorage.getItem(`poker_${roomId}`);
    if (!pid) {
      setError('未找到玩家身份，请回首页重新加入');
      return;
    }
    setPlayerId(pid);

    // 尝试重连
    fetch(`/api/rooms/${roomId}/reconnect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: pid }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.error) {
          // 重连失败（房间没了/服务器重启了/玩家被移除）
          sessionStorage.removeItem(`poker_${roomId}`);
          sessionStorage.removeItem(`poker_nick_${roomId}`);
          setError(`重连失败：${data.error}。请回首页重新加入。`);
        } else {
          setRoom(data.room);
        }
      })
      .catch(err => {
        console.error('Reconnect failed:', err);
        // 网络错误不重置 sessionStorage，下次刷新再试
      });
  }, [roomId]);

  // 心跳：每 10 秒发一次（用于服务端失联检测）
  useEffect(() => {
    if (!playerId) return;
    const send = () => {
      fetch(`/api/rooms/${roomId}/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId }),
      }).catch(() => {});
    };
    send(); // 立即发一次
    const interval = setInterval(send, 10_000);
    return () => clearInterval(interval);
  }, [roomId, playerId]);

  // 拉取一次房间初始状态（兜底）
  const fetchRoom = useCallback(async () => {
    try {
      const res = await fetch(`/api/rooms/${roomId}`);
      if (!res.ok) return;
      const data = await res.json();
      setRoom(data.room);
    } catch (err) {
      console.error(err);
    }
  }, [roomId]);

  // 订阅 Pusher 频道
  useEffect(() => {
    if (!playerId) return;
    fetchRoom();

    const channel = getRoomChannel(roomId);
    channelRef.current = channel;

    if (channel) {
      const onRoomUpdate = (data: { room: Room }) => {
        setRoom(data.room);
      };
      const onGameUpdate = (data: { room: Room }) => {
        setRoom(data.room);
      };
      const onChat = (msg: { playerId: string; nickname: string; text: string; time: number }) => {
        setChatMessages(prev => [...prev, msg]);
      };

      channel.bind('room-updated', onRoomUpdate);
      channel.bind('game-updated', onGameUpdate);
      channel.bind('pusher:subscription_succeeded', () => {
        console.log('[Pusher] Subscribed to room:', roomId);
      });
      channel.bind('chat-message', onChat);
    } else {
      // 兜底：Pusher 不可用时用轮询
      console.warn('[Pusher] unavailable, using polling fallback');
      const interval = setInterval(fetchRoom, 1500);
      return () => clearInterval(interval);
    }

    return () => {
      if (channel) {
        channel.unbind_all();
        // 注意：不要 unsubscribe，可能还有其他标签页
      }
    };
  }, [playerId, roomId, fetchRoom]);

  // 玩家行动
  const handleAction = async (action: PlayerAction, amount?: number) => {
    if (!playerId) return;
    const res = await fetch(`/api/rooms/${roomId}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId, action, amount }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || '操作失败');
    }
    // 不需要 fetchRoom，pusher 会推送更新
  };

  // 亮牌 / 弃牌 toggle（纯展示）
  const handleToggleReveal = async (reveal: boolean) => {
    if (!playerId) return;
    const res = await fetch(`/api/rooms/${roomId}/decide`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId, reveal }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || '操作失败');
    }
  };

  // 开始牌局
  const handleStart = async () => {
    if (!playerId) return;
    const res = await fetch(`/api/rooms/${roomId}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || '开始失败');
    }
  };

  // 复制房间号
  const handleCopy = () => {
    navigator.clipboard.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // 退出
  const handleLeave = () => {
    sessionStorage.removeItem(`poker_${roomId}`);
    sessionStorage.removeItem(`poker_nick_${roomId}`);
    router.push('/');
  };

  // 发送聊天（API → pusher 广播 → 其他客户端收到）
  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !playerId) return;
    const text = chatInput.trim();
    setChatInput('');
    const res = await fetch(`/api/rooms/${roomId}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId, text }),
    });
    if (!res.ok) {
      console.error('Chat send failed');
    }
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-slate-900/60 backdrop-blur-xl rounded-2xl border border-white/5 p-8 text-center max-w-md">
          <div className="text-5xl mb-4">😢</div>
          <h2 className="text-xl font-bold mb-2">{error}</h2>
          <Button onClick={() => router.push('/')} className="mt-4">
            返回首页
          </Button>
        </div>
      </div>
    );
  }

  if (!room || !playerId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-slate-400 flex items-center gap-3">
          <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
          加载中...
        </div>
      </div>
    );
  }

  const me = room.players.find(p => p.id === playerId);
  const isHost = room.hostId === playerId;
  const activePlayer = room.activePlayerIndex !== null ? room.players[room.activePlayerIndex] : null;
  const isMyTurn = activePlayer?.id === playerId;

  return (
    <div className="min-h-screen flex flex-col">
      {/* 顶部状态栏 */}
      <header className="sticky top-0 z-30 bg-slate-900/70 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-2.5 sm:py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <span className="text-xl sm:text-2xl">♠️</span>
            <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm min-w-0">
              <code className="bg-slate-800/80 px-2 py-0.5 rounded font-mono text-yellow-400 font-bold tracking-wider text-[11px] sm:text-sm">
                {roomId}
              </code>
              <button onClick={handleCopy} className="text-slate-500 hover:text-slate-300 shrink-0" title="复制">
                {copied ? '✓' : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
            {isHost && (
              <span className="text-yellow-400 text-xs flex items-center gap-1 shrink-0">
                <Crown className="w-3 h-3" /> 房主
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 sm:gap-4 text-xs sm:text-sm">
            <div className="text-slate-400 hidden md:flex items-center gap-1.5">
              <span>盲注</span>
              <span className="text-white font-medium">{room.settings.smallBlind}/{room.settings.bigBlind}</span>
            </div>
            <div className="text-slate-400 flex items-center gap-1.5">
              <span>👥</span>
              <span className="text-white font-bold">{room.players.length}/{room.settings.maxPlayers}</span>
            </div>
            <button onClick={handleLeave} className="text-red-400 hover:text-red-300 flex items-center gap-1">
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">退出</span>
            </button>
          </div>
        </div>

        {/* 牌局状态条 */}
        {room.status === 'playing' && (
          <div className="bg-slate-900/40 border-t border-white/5">
            <div className="max-w-7xl mx-auto px-3 sm:px-4 py-1.5 flex items-center justify-between text-xs">
              <div className="flex items-center gap-3 text-slate-400">
                <span>第 <span className="text-white font-bold">{room.handNumber}</span> 手</span>
                <span>·</span>
                <span className="text-yellow-300 font-medium">{stageName(room.stage)}</span>
              </div>
              {isMyTurn && (
                <div className="flex items-center gap-1.5 text-yellow-400 animate-pulse">
                  <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full" />
                  轮到你行动
                </div>
              )}
            </div>
          </div>
        )}
      </header>

      {/* 主体 */}
      <main className={cn(
        "flex-1 mx-auto w-full px-3 sm:px-4 py-4 sm:py-6 transition-all",
        chatOpen ? "max-w-7xl" : "max-w-[1500px]"
      )}>
        {room.status === 'waiting' ? (
          <Lobby
            room={room}
            isHost={isHost}
            me={me}
            onStart={handleStart}
            onCopyRoom={handleCopy}
          />
        ) : (
          <div className="space-y-4 sm:space-y-6">
            <PokerTable room={room} myPlayerId={playerId} />

            {room.status === 'ended' ? (
              <ResultPanel
                room={room}
                myPlayerId={playerId}
                isHost={isHost}
                onStart={handleStart}
                onToggleReveal={handleToggleReveal}
              />
            ) : isMyTurn && me ? (
              <ActionPanel
                room={room}
                me={me}
                onAction={handleAction}
              />
            ) : (
              <WaitingPanel activePlayer={activePlayer} />
            )}
          </div>
        )}
      </main>

      {/* 桌面端：固定右侧聊天面板 */}
      {(room.status === 'waiting' || room.status === 'playing') && chatOpen && (
        <aside className="hidden lg:flex fixed right-4 top-24 bottom-4 w-72 bg-slate-900/70 backdrop-blur-xl rounded-2xl border border-white/5 flex-col z-20">
          <div className="p-3 border-b border-white/5 flex items-center justify-between">
            <span className="font-semibold text-sm">💬 牌桌聊天</span>
            <button
              onClick={() => setChatOpen(false)}
              className="text-slate-500 hover:text-slate-200 text-xs flex items-center gap-1 px-2 py-1 rounded hover:bg-white/5"
              title="收起聊天"
            >
              收起 →
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2 text-sm">
            {chatMessages.length === 0 ? (
              <div className="text-slate-500 text-xs text-center py-4">还没有消息</div>
            ) : (
              chatMessages.map((m, i) => (
                <div key={i}>
                  <span className={cn(
                    'font-semibold',
                    m.playerId === playerId ? 'text-yellow-400' : 'text-blue-400'
                  )}>
                    {m.nickname}:
                  </span>{' '}
                  <span className="text-slate-300">{m.text}</span>
                </div>
              ))
            )}
            <div ref={chatEndRef} />
          </div>
          <form onSubmit={handleSendChat} className="p-3 border-t border-white/5 flex gap-2">
            <input
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              placeholder="说点什么..."
              maxLength={200}
              className="flex-1 bg-slate-800/80 rounded-lg px-3 py-2 text-sm border border-white/5 focus:border-yellow-500/50 focus:outline-none"
            />
            <button type="submit" className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-lg text-sm font-medium">发送</button>
          </form>
        </aside>
      )}

      {/* 桌面端：折叠的聊天按钮 */}
      {(room.status === 'waiting' || room.status === 'playing') && !chatOpen && (
        <button
          onClick={() => setChatOpen(true)}
          className="hidden lg:flex fixed right-4 top-24 bg-slate-900/80 backdrop-blur-xl hover:bg-slate-800 text-white px-3 py-2 rounded-xl border border-white/10 items-center gap-2 text-sm z-20 shadow-lg"
          title="打开聊天"
        >
          <span>💬</span>
          <span>打开聊天</span>
          {chatMessages.length > 0 && (
            <span className="bg-blue-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
              {chatMessages.length}
            </span>
          )}
        </button>
      )}

      {/* 手机端：浮动聊天按钮 + 弹出 modal */}
      {(room.status === 'waiting' || room.status === 'playing') && (
        <button
          onClick={() => setChatOpen(!chatOpen)}
          className="lg:hidden fixed bottom-4 right-4 z-30 bg-blue-600 hover:bg-blue-500 text-white w-12 h-12 rounded-full shadow-2xl flex items-center justify-center text-xl"
          title="聊天"
        >
          💬
          {chatMessages.length > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 font-bold">
              {chatMessages.length}
            </span>
          )}
        </button>
      )}

      {/* 手机端：聊天 modal */}
      {(room.status === 'waiting' || room.status === 'playing') && chatOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex items-end" onClick={() => setChatOpen(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <div
            className="relative w-full bg-slate-900 rounded-t-2xl border-t border-white/10 max-h-[70vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-3 border-b border-white/5 flex items-center justify-between">
              <span className="font-semibold text-sm">💬 牌桌聊天</span>
              <button
                onClick={() => setChatOpen(false)}
                className="text-slate-500 hover:text-slate-200 text-sm px-2 py-1 rounded hover:bg-white/5"
              >
                关闭 ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2 text-sm">
              {chatMessages.length === 0 ? (
                <div className="text-slate-500 text-xs text-center py-8">还没有消息</div>
              ) : (
                chatMessages.map((m, i) => (
                  <div key={i}>
                    <span className={cn(
                      'font-semibold',
                      m.playerId === playerId ? 'text-yellow-400' : 'text-blue-400'
                    )}>
                      {m.nickname}:
                    </span>{' '}
                    <span className="text-slate-300">{m.text}</span>
                  </div>
                ))
              )}
              <div ref={chatEndRef} />
            </div>
            <form onSubmit={handleSendChat} className="p-3 border-t border-white/5 flex gap-2">
              <input
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                placeholder="说点什么..."
                maxLength={200}
                className="flex-1 bg-slate-800/80 rounded-lg px-3 py-2.5 text-sm border border-white/5 focus:border-yellow-500/50 focus:outline-none"
                autoFocus
              />
              <button type="submit" className="bg-blue-600 hover:bg-blue-500 px-4 py-2.5 rounded-lg text-sm font-medium">发送</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function stageName(stage: string): string {
  const map: Record<string, string> = {
    preflop: '翻前下注',
    flop: '翻牌',
    turn: '转牌',
    river: '河牌',
    showdown: '摊牌',
    ended: '已结束',
  };
  return map[stage] || stage;
}

// 牌桌组件：手机用列表式布局，桌面用椭圆桌
function PokerTable({ room, myPlayerId }: { room: Room; myPlayerId: string }) {
  const totalSlots = room.settings.maxPlayers;
  const myIndex = room.players.findIndex(p => p.id === myPlayerId);
  const positions = getPlayerPositions(totalSlots, myIndex);

  const me = room.players.find(p => p.id === myPlayerId);
  const opponents = room.players.filter(p => p.id !== myPlayerId);

  return (
    <>
      {/* 手机版：列表式布局 */}
      <div className="md:hidden space-y-3">
        {/* 公共牌 + 底池 + 阶段 */}
        <div className="poker-table rounded-2xl border-4 border-amber-900/50 p-4 flex flex-col items-center gap-3 min-h-[160px] justify-center">
          <div className="flex items-center gap-2 bg-slate-900/40 backdrop-blur px-3 py-1 rounded-full border border-yellow-500/20">
            <div className="flex -space-x-1">
              <span className="w-3 h-3 rounded-full bg-gradient-to-br from-yellow-300 to-amber-600 border border-white/20" />
              <span className="w-3 h-3 rounded-full bg-gradient-to-br from-red-300 to-red-700 border border-white/20" />
              <span className="w-3 h-3 rounded-full bg-gradient-to-br from-emerald-300 to-emerald-700 border border-white/20" />
            </div>
            <span className="text-[10px] text-yellow-300/80">底池</span>
            <span className="text-base font-bold text-yellow-300">$ {room.pot}</span>
          </div>
          <div className="flex gap-1 justify-center min-h-[64px] items-center">
            {renderCommunityCards(room, 'sm')}
          </div>
          <div className="text-[9px] text-slate-400 tracking-widest">
            {stageName(room.stage).toUpperCase()}
          </div>
        </div>

        {/* 对手 (手机版：一排水平显示 3-6 个) */}
        {opponents.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
            {opponents.map((player) => (
              <MobilePlayerCard
                key={player.id}
                player={player}
                isActive={room.activePlayerIndex === room.players.findIndex(p => p.id === player.id)}
              />
            ))}
          </div>
        )}

        {/* 自己的牌 */}
        {me && <MyHandMobile player={me} isActive={room.activePlayerIndex === room.players.findIndex(p => p.id === me.id)} />}
      </div>

      {/* 桌面版：椭圆桌 + 4 角玩家 */}
      <div className="hidden md:block">
        <div className="poker-table relative rounded-[200px] aspect-[1.7/1] mx-auto max-w-5xl border-[10px] border-amber-900/50">
          <div className="absolute inset-4 rounded-[180px] border border-yellow-700/20 pointer-events-none" />

          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-3 w-full px-4">
            <div className="flex items-center gap-3 bg-slate-900/40 backdrop-blur px-4 py-1.5 rounded-full border border-yellow-500/20">
              <div className="flex -space-x-1">
                <span className="w-4 h-4 rounded-full bg-gradient-to-br from-yellow-300 to-amber-600 border border-white/20" />
                <span className="w-4 h-4 rounded-full bg-gradient-to-br from-red-300 to-red-700 border border-white/20" />
                <span className="w-4 h-4 rounded-full bg-gradient-to-br from-emerald-300 to-emerald-700 border border-white/20" />
              </div>
              <span className="text-xs text-yellow-300/80">底池</span>
              <span className="text-xl font-bold text-yellow-300">$ {room.pot}</span>
            </div>
            <div className="flex gap-2">
              {renderCommunityCards(room, 'md')}
            </div>
            <div className="text-[10px] text-slate-400 tracking-widest">
              {stageName(room.stage).toUpperCase()}
            </div>
          </div>

          {room.players.map((player, idx) => {
            const pos = positions[idx];
            if (!pos) return null;
            const isActive = room.activePlayerIndex === idx;
            const isMe = player.id === myPlayerId;
            return (
              <div
                key={player.id}
                className={cn(
                  'absolute flex flex-col items-center gap-1.5 transition-all',
                  pos.className
                )}
              >
                {player.isDealer && (
                  <div className="absolute -top-3 -left-3 bg-white text-slate-900 rounded-full w-7 h-7 flex items-center justify-center text-xs font-bold shadow-lg z-10">D</div>
                )}
                {player.isSmallBlind && (
                  <div className="absolute -top-3 -right-3 bg-yellow-500 text-slate-900 rounded-full w-7 h-7 flex items-center justify-center text-xs font-bold shadow-lg z-10">SB</div>
                )}
                {player.isBigBlind && (
                  <div className="absolute -top-3 -right-3 bg-orange-500 text-white rounded-full w-7 h-7 flex items-center justify-center text-xs font-bold shadow-lg z-10">BB</div>
                )}

                <div className="flex gap-1.5">
                  {isMe ? (
                    <>
                      <Card card={player.holeCards[0]} size="lg" highlight={isActive} />
                      <Card card={player.holeCards[1]} size="lg" highlight={isActive} />
                    </>
                  ) : player.revealed ? (
                    <>
                      <Card card={player.holeCards[0]} size="md" />
                      <Card card={player.holeCards[1]} size="md" />
                    </>
                  ) : (
                    <>
                      <Card faceDown size="md" />
                      <Card faceDown size="md" />
                    </>
                  )}
                </div>

                <div className={cn(
                  'rounded-full px-3 py-1 text-xs flex items-center gap-2 border border-white/10',
                  isActive
                    ? 'bg-yellow-400 text-slate-900 font-bold animate-pulse'
                    : isMe
                    ? 'bg-blue-500/20 text-blue-300 font-bold'
                    : player.folded
                    ? 'bg-slate-900/60 text-slate-500 line-through opacity-60'
                    : 'bg-slate-900/85 text-white'
                )}>
                  {isActive && <span>★</span>}
                  <span className="font-medium">{isMe ? `${player.nickname}(我)` : player.nickname}</span>
                  <span className={cn('font-bold', isActive ? 'text-slate-900' : 'text-yellow-400')}>
                    ${player.chips.toLocaleString()}
                  </span>
                  {player.lastAction && !isActive && (
                    <span className="text-[10px] text-slate-400">
                      {actionLabel(player.lastAction, player.lastActionAmount)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          {Array.from({ length: totalSlots - room.players.length }).map((_, i) => {
            const slotIndex = room.players.length + i;
            const pos = positions[slotIndex];
            if (!pos) return null;
            return (
              <div
                key={`empty-${i}`}
                className={cn(
                  'absolute flex items-center justify-center',
                  pos.className
                )}
              >
                <div className="border-2 border-dashed border-white/10 rounded-full px-3 py-1.5 text-xs text-slate-500">
                  等待加入
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

// 手机版：单个对手卡片（横向一排）
function MobilePlayerCard({ player, isActive }: { player: PlayerState; isActive: boolean }) {
  return (
    <div className={cn(
      'flex-shrink-0 flex flex-col items-center gap-1 px-2 py-2 rounded-xl border min-w-[80px]',
      isActive
        ? 'bg-yellow-400/15 border-yellow-400 animate-pulse'
        : player.folded
        ? 'bg-slate-900/40 border-white/5 opacity-50'
        : 'bg-slate-900/70 border-white/10'
    )}>
      {player.isDealer && <span className="text-[9px] text-white bg-slate-700 rounded-full w-4 h-4 flex items-center justify-center font-bold">D</span>}
      {player.isSmallBlind && <span className="text-[9px] text-slate-900 bg-yellow-500 rounded-full w-4 h-4 flex items-center justify-center font-bold">SB</span>}
      {player.isBigBlind && <span className="text-[9px] text-white bg-orange-500 rounded-full w-4 h-4 flex items-center justify-center font-bold">BB</span>}
      <div className="flex gap-0.5">
        {player.revealed ? (
          <>
            <Card card={player.holeCards[0]} size="sm" />
            <Card card={player.holeCards[1]} size="sm" />
          </>
        ) : (
          <>
            <Card faceDown size="sm" />
            <Card faceDown size="sm" />
          </>
        )}
      </div>
      <div className="text-[10px] font-medium truncate max-w-[80px]">{player.nickname}</div>
      <div className="text-[10px] text-yellow-400 font-bold">${player.chips.toLocaleString()}</div>
      {player.lastAction && !isActive && !player.folded && (
        <div className="text-[9px] text-slate-500">{actionLabel(player.lastAction, player.lastActionAmount)}</div>
      )}
      {player.folded && <div className="text-[9px] text-slate-500 line-through">弃牌</div>}
    </div>
  );
}

// 手机版：自己的手牌（下方大显示）
function MyHandMobile({ player, isActive }: { player: PlayerState; isActive: boolean }) {
  return (
    <div className={cn(
      'poker-table rounded-2xl border-4 p-3 flex items-center justify-center gap-3 min-h-[100px]',
      isActive ? 'border-yellow-400 shadow-lg shadow-yellow-500/20' : 'border-amber-900/50'
    )}>
      <div className="flex flex-col items-start gap-1 flex-1">
        <div className="flex items-center gap-1.5">
          {player.isDealer && <span className="text-[9px] text-white bg-slate-700 rounded-full w-4 h-4 flex items-center justify-center font-bold">D</span>}
          {player.isSmallBlind && <span className="text-[9px] text-slate-900 bg-yellow-500 rounded-full w-4 h-4 flex items-center justify-center font-bold">SB</span>}
          {player.isBigBlind && <span className="text-[9px] text-white bg-orange-500 rounded-full w-4 h-4 flex items-center justify-center font-bold">BB</span>}
          <span className="text-sm font-bold">你</span>
        </div>
        <div className="text-xs text-yellow-400 font-bold">${player.chips.toLocaleString()}</div>
        {isActive && <div className="text-[10px] text-yellow-300 animate-pulse">★ 你的回合</div>}
        {player.lastAction && !isActive && (
          <div className="text-[10px] text-slate-400">{actionLabel(player.lastAction, player.lastActionAmount)}</div>
        )}
      </div>
      <div className="flex gap-2">
        <Card card={player.holeCards[0]} size="md" highlight={isActive} />
        <Card card={player.holeCards[1]} size="md" highlight={isActive} />
      </div>
    </div>
  );
}

function renderCommunityCards(room: Room, size: 'sm' | 'md' = 'md') {
  const allSlots = 5;
  const cards = room.communityCards;
  const stageOrder: Record<string, number> = {
    preflop: 0,
    flop: 3,
    turn: 4,
    river: 5,
    showdown: 5,
    ended: 5,
  };
  const visibleCount = stageOrder[room.stage] ?? 0;
  const placeholderSize = size === 'sm' ? 'w-9 h-12' : 'w-12 h-16 sm:w-14 sm:h-20';

  return Array.from({ length: allSlots }).map((_, i) => {
    if (i < visibleCount && cards[i]) {
      return <Card key={i} card={cards[i]} size={size} />;
    }
    if (i < visibleCount) {
      return <Card key={i} faceDown size={size} />;
    }
    return <div key={i} className={cn(placeholderSize, 'rounded-md border-2 border-dashed border-white/20')} />;
  });
}


function getPlayerPositions(totalSlots: number, myIndex: number) {
  const allClasses: Record<number, string[]> = {
    2: [
      'bottom-3 sm:bottom-6 left-1/2 -translate-x-1/2',
      'top-3 sm:top-6 left-1/2 -translate-x-1/2',
    ],
    3: [
      'bottom-3 sm:bottom-6 left-1/2 -translate-x-1/2',
      'top-3 sm:top-6 left-[20%] -translate-x-1/2',
      'top-3 sm:top-6 right-[20%] translate-x-1/2',
    ],
    4: [
      'bottom-3 sm:bottom-6 left-1/2 -translate-x-1/2',
      'top-3 sm:top-6 left-[28%] -translate-x-1/2',
      'top-3 sm:top-6 right-[28%] translate-x-1/2',
      'bottom-3 sm:bottom-6 left-1/2 translate-x-[160%] sm:translate-x-[200%]',
    ],
    5: [
      'bottom-3 sm:bottom-6 left-1/2 -translate-x-1/2',
      'top-3 sm:top-6 left-[15%] -translate-x-1/2',
      'top-3 sm:top-6 left-1/2 -translate-x-1/2',
      'top-3 sm:top-6 right-[15%] translate-x-1/2',
      'bottom-3 sm:bottom-6 right-[15%] translate-x-1/2',
    ],
    6: [
      'bottom-3 sm:bottom-6 left-1/2 -translate-x-1/2',
      'bottom-3 sm:bottom-6 left-[20%] -translate-x-1/2',
      'top-3 sm:top-6 left-[20%] -translate-x-1/2',
      'top-3 sm:top-6 left-1/2 -translate-x-1/2',
      'top-3 sm:top-6 right-[20%] translate-x-1/2',
      'bottom-3 sm:bottom-6 right-[20%] translate-x-1/2',
    ],
  };

  const classes = allClasses[totalSlots] || allClasses[4];
  if (myIndex === 0) return classes.map(c => ({ className: c }));

  const reordered: typeof classes = [];
  for (let i = 0; i < totalSlots; i++) {
    const realIdx = (myIndex + i) % totalSlots;
    reordered[realIdx] = classes[i];
  }
  return reordered.map(c => ({ className: c }));
}

function actionLabel(action: PlayerAction, amount?: number): string {
  if (action === 'fold') return '弃';
  if (action === 'check') return '过';
  if (action === 'call') return `跟${amount || ''}`;
  if (action === 'raise') return `+${amount || ''}`;
  if (action === 'all_in') return '全押';
  return '';
}

function WaitingPanel({ activePlayer }: { activePlayer: { nickname: string } | null }) {
  return (
    <div className="bg-slate-900/70 backdrop-blur-xl rounded-2xl p-6 border border-white/5 text-center">
      <div className="inline-flex items-center gap-2 text-slate-300">
        <div className="flex gap-1">
          <span className="w-2 h-2 bg-yellow-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-2 h-2 bg-yellow-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-2 h-2 bg-yellow-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
        等待 <span className="text-yellow-400 font-bold mx-1">{activePlayer?.nickname || '...'}</span> 行动
      </div>
    </div>
  );
}

function ResultPanel({
  room,
  myPlayerId,
  isHost,
  onStart,
  onToggleReveal,
}: {
  room: Room;
  myPlayerId: string;
  isHost: boolean;
  onStart: () => void;
  onToggleReveal: (reveal: boolean) => void;
}) {
  const winners = room.lastWinners || [];
  const sidePots = room.sidePots || [];
  const hasMultiplePots = sidePots.length > 1;
  const winnerIds = new Set(winners.map(w => w.playerId));
  const me = room.players.find(p => p.id === myPlayerId);
  const nonFoldedPlayers = room.players.filter(p => !p.folded);

  return (
    <div className="bg-slate-900/70 backdrop-blur-xl rounded-2xl p-6 border border-white/5 space-y-4">
      <div className="text-center space-y-2">
        <div className="text-2xl">🏆</div>
        <h3 className="text-xl font-bold">本手结束</h3>
      </div>

      {/* 边池明细 */}
      {hasMultiplePots && (
        <div className="max-w-2xl mx-auto">
          <div className="text-xs text-slate-400 mb-2 text-center">分池明细</div>
          <div className="space-y-1.5">
            {sidePots.map((pot, i) => {
              const eligible = pot.eligiblePlayerIds
                .map(id => room.players.find(p => p.id === id)?.nickname)
                .filter(Boolean);
              const isMain = i === 0;
              return (
                <div key={i} className="bg-slate-800/50 border border-white/5 rounded-lg px-3 py-2 text-sm flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-yellow-300">
                      {isMain ? '主池' : `边池 ${i}`}
                    </span>
                    <span className="text-slate-500 text-xs ml-2">
                      ({eligible.join(' / ')} 有资格)
                    </span>
                  </div>
                  <span className="text-yellow-300 font-bold">${pot.amount}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 赢家列表 */}
      <div className="text-center space-y-3">
        {winners.map((w, i) => {
          const player = room.players.find(p => p.id === w.playerId);
          if (!player) return null;
          return (
            <div key={i} className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 inline-block min-w-[300px]">
              <div className="text-yellow-300 font-bold text-lg">
                {player.nickname} 赢了 +${w.amountWon}
              </div>
              <div className="text-sm text-slate-400 mt-1">{w.hand.description}</div>
              {player.revealed && player.holeCards.length === 2 && (
                <div className="flex items-center justify-center gap-1.5 mt-2">
                  <Card card={player.holeCards[0]} size="sm" />
                  <Card card={player.holeCards[1]} size="sm" />
                </div>
              )}
              {hasMultiplePots && w.potsWon.length > 1 && (
                <div className="text-xs text-slate-500 mt-2 flex items-center justify-center gap-1 flex-wrap">
                  来自：
                  {w.potsWon.map((pw, j) => (
                    <span key={j} className="bg-slate-700/50 px-1.5 py-0.5 rounded">
                      {pw.potIndex === 0 ? '主池' : `边池 ${pw.potIndex}`} +${pw.amount}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 非弃牌玩家列表：可选择亮牌 / 弃牌（纯展示，不影响结算） */}
      <div className="max-w-3xl mx-auto pt-3 border-t border-white/5">
        <div className="text-xs text-slate-400 mb-2 text-center">玩家底牌（点击自己的牌切换亮 / 藏）</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
          {nonFoldedPlayers.map(p => {
            const isMe = p.id === myPlayerId;
            const isWinner = winnerIds.has(p.id);
            return (
              <div
                key={p.id}
                className={cn(
                  'rounded-lg p-2.5 border flex flex-col gap-2',
                  isWinner
                    ? 'bg-yellow-500/10 border-yellow-500/30'
                    : 'bg-slate-800/40 border-white/5'
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-sm">
                    <span className={cn(
                      'font-semibold',
                      isWinner ? 'text-yellow-300' : 'text-slate-200'
                    )}>
                      {p.nickname}
                    </span>
                    {isMe && <span className="text-xs text-blue-400">(你)</span>}
                    {isWinner && <span className="text-xs text-yellow-400">🏆</span>}
                  </div>
                  <div className="flex gap-1">
                    {p.revealed ? (
                      <button
                        onClick={() => isMe && onToggleReveal(false)}
                        disabled={!isMe}
                        className={cn(
                          'text-xs px-2 py-0.5 rounded',
                          isMe
                            ? 'bg-slate-700 hover:bg-slate-600 text-slate-200 cursor-pointer'
                            : 'bg-yellow-500/20 text-yellow-300 cursor-default'
                        )}
                        title={isMe ? '点击隐藏底牌' : '已亮牌'}
                      >
                        👁️ 亮
                      </button>
                    ) : (
                      <button
                        onClick={() => isMe && onToggleReveal(true)}
                        disabled={!isMe}
                        className={cn(
                          'text-xs px-2 py-0.5 rounded',
                          isMe
                            ? 'bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-bold cursor-pointer'
                            : p.mucked
                            ? 'bg-slate-700/50 text-slate-500 cursor-default'
                            : 'bg-slate-700/50 text-slate-400 cursor-default'
                        )}
                        title={isMe ? '点击亮出底牌' : (p.mucked ? '已弃牌隐藏' : '未亮牌')}
                      >
                        {p.mucked ? '🗑️ 藏' : '🂠 藏'}
                      </button>
                    )}
                  </div>
                </div>
                {p.revealed && p.holeCards.length === 2 ? (
                  <div className="flex items-center justify-center gap-1">
                    <Card card={p.holeCards[0]} size="sm" />
                    <Card card={p.holeCards[1]} size="sm" />
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-1">
                    <Card faceDown size="sm" />
                    <Card faceDown size="sm" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {me && !me.folded && !me.revealed && !me.mucked && (
          <p className="text-xs text-slate-500 text-center mt-2">
            💡 点击上方的「🂠 藏」按钮可亮出你的底牌给大家看
          </p>
        )}
      </div>

      <div className="text-center">
        {isHost && (
          <Button onClick={onStart} size="lg">
            🎲 再来一手
          </Button>
        )}
        {!isHost && (
          <div className="text-slate-400 text-sm">等待房主开始下一手...</div>
        )}
      </div>
    </div>
  );
}
