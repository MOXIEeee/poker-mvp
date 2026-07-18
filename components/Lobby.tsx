'use client';

import type { Room, PlayerState } from '@/types/poker';
import { Button } from '@/components/ui/Button';
import { Copy, Crown, User, Check } from 'lucide-react';
import { useState } from 'react';

interface Props {
  room: Room;
  isHost: boolean;
  me: PlayerState | undefined;
  onStart: () => void;
  onCopyRoom: () => void;
}

export function Lobby({ room, isHost, me, onStart, onCopyRoom }: Props) {
  const [copied, setCopied] = useState(false);
  const canStart = room.players.length >= 2;

  const handleCopy = () => {
    onCopyRoom();
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* 房间信息卡片 */}
      <div className="bg-slate-900/70 backdrop-blur-xl rounded-2xl border border-white/5 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">等待玩家加入</h2>
          <div className="text-sm text-slate-400">
            玩家: <span className="text-white font-bold">{room.players.length}/{room.settings.maxPlayers}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4 text-sm">
          <Info label="小盲" value={`$${room.settings.smallBlind}`} />
          <Info label="大盲" value={`$${room.settings.bigBlind}`} />
          <Info label="初始筹码" value={`$${room.settings.startingChips}`} />
          <Info label="密码" value={room.settings.password ? '已设置' : '无'} />
          <Info label="房间号" value={room.id} mono />
          <Info label="状态" value="等待中" />
        </div>

        <button
          onClick={handleCopy}
          className="w-full bg-slate-800/50 hover:bg-slate-800 border border-white/10 rounded-lg px-3 py-2.5 text-sm flex items-center justify-center gap-2 transition"
        >
          {copied ? (
            <>
              <Check className="w-4 h-4 text-green-400" />
              <span className="text-green-400">已复制</span>
            </>
          ) : (
            <>
              <Copy className="w-4 h-4 text-slate-400" />
              <span className="text-slate-300">复制房间号 + 密码，发给朋友</span>
            </>
          )}
        </button>
      </div>

      {/* 玩家列表 */}
      <div className="bg-slate-900/70 backdrop-blur-xl rounded-2xl border border-white/5 p-6">
        <h3 className="text-sm font-semibold text-slate-400 mb-3">已加入的玩家</h3>
        <div className="space-y-2">
          {room.players.map((player) => (
            <div
              key={player.id}
              className="flex items-center justify-between bg-slate-800/50 rounded-lg px-3 py-2.5"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-sm font-bold">
                  {player.nickname.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="font-medium flex items-center gap-2">
                    {player.nickname}
                    {player.id === me?.id && (
                      <span className="text-xs text-blue-400">（你）</span>
                    )}
                  </div>
                  <div className="text-xs text-slate-400">${player.chips.toLocaleString()}</div>
                </div>
              </div>
              {room.hostId === player.id && (
                <Crown className="w-4 h-4 text-yellow-400" />
              )}
            </div>
          ))}
          {Array.from({ length: room.settings.maxPlayers - room.players.length }).map((_, i) => (
            <div
              key={`empty-${i}`}
              className="flex items-center gap-3 border-2 border-dashed border-white/10 rounded-lg px-3 py-2.5 text-slate-500 text-sm"
            >
              <div className="w-8 h-8 rounded-full border-2 border-dashed border-white/20" />
              等待玩家加入...
            </div>
          ))}
        </div>
      </div>

      {/* 开始按钮 */}
      {isHost ? (
        <Button
          onClick={onStart}
          disabled={!canStart}
          size="lg"
          className="w-full"
        >
          {canStart ? '🎲 开始牌局' : `至少需要 2 名玩家（当前 ${room.players.length}）`}
        </Button>
      ) : (
        <div className="text-center text-slate-400 text-sm py-3">
          等待房主开始牌局...
        </div>
      )}
    </div>
  );
}

function Info({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="bg-slate-800/30 rounded-lg px-3 py-2">
      <div className="text-xs text-slate-500 mb-0.5">{label}</div>
      <div className={mono ? 'font-mono text-yellow-400 font-bold' : 'text-white font-medium'}>{value}</div>
    </div>
  );
}
