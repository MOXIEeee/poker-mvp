'use client';

import { useState } from 'react';
import type { Room, PlayerState, PlayerAction } from '@/types/poker';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

interface Props {
  room: Room;
  me: PlayerState;
  onAction: (action: PlayerAction, amount?: number) => void;
}

export function ActionPanel({ room, me, onAction }: Props) {
  const callAmount = room.currentBet - me.currentBet;
  const canCheck = callAmount === 0;
  const canCall = callAmount > 0 && me.chips > 0;
  const minRaise = room.minRaise;
  const maxRaise = me.chips;

  const [raiseAmount, setRaiseAmount] = useState(minRaise);

  const quickAmounts = [
    { label: '×2', value: Math.min(callAmount * 2 + me.currentBet, me.chips) },
    { label: '½ 池', value: Math.min(Math.floor(room.pot / 2) + room.currentBet, me.chips) },
    { label: '全池', value: Math.min(room.pot + room.currentBet, me.chips) },
    { label: '全押', value: me.chips },
  ];

  return (
    <div className="bg-slate-900/70 backdrop-blur-xl rounded-2xl p-3 sm:p-4 border border-white/5 shadow-2xl">
      <div className="flex items-center justify-between mb-3 text-xs sm:text-sm">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
          <span className="text-slate-300">轮到 <span className="text-yellow-400 font-bold">你</span> 行动</span>
          <span className="text-slate-500">·</span>
          <span className="text-slate-400">当前注 <span className="text-white font-medium">${room.currentBet}</span></span>
        </div>
        <div className="text-slate-400">
          我的筹码: <span className="text-yellow-300 font-bold">${me.chips.toLocaleString()}</span>
        </div>
      </div>

      {/* 加注滑块 */}
      {!canCheck || me.chips > minRaise ? (
        <div className="flex items-center gap-2 sm:gap-3 mb-3 bg-slate-800/50 rounded-lg p-2 sm:p-3">
          <span className="text-xs text-slate-400 shrink-0">加注额</span>
          <input
            type="range"
            min={minRaise}
            max={Math.max(minRaise, maxRaise)}
            value={raiseAmount}
            onChange={e => setRaiseAmount(Number(e.target.value))}
            className="flex-1 accent-yellow-400"
          />
          <span className="bg-slate-900 px-2 sm:px-3 py-1 rounded text-yellow-300 font-bold text-sm sm:text-base w-20 sm:w-24 text-center">
            $ {raiseAmount}
          </span>
          <div className="hidden sm:flex gap-1">
            {quickAmounts.map(q => (
              <button
                key={q.label}
                onClick={() => setRaiseAmount(q.value)}
                className="px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-xs"
                type="button"
              >
                {q.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* 操作按钮 */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3">
        <Button
          variant="secondary"
          onClick={() => onAction('fold')}
          className="py-3 sm:py-3.5"
        >
          弃牌
          <div className="text-[9px] sm:text-[10px] font-normal opacity-60 mt-0.5">FOLD</div>
        </Button>

        <Button
          variant="secondary"
          onClick={() => onAction('check')}
          disabled={!canCheck}
          className="py-3 sm:py-3.5"
        >
          过牌
          <div className="text-[9px] sm:text-[10px] font-normal opacity-60 mt-0.5">CHECK</div>
        </Button>

        <Button
          variant="primary"
          onClick={() => onAction('call')}
          disabled={!canCall}
          className="py-3 sm:py-3.5"
        >
          跟注 ${callAmount}
          <div className="text-[9px] sm:text-[10px] font-normal opacity-80 mt-0.5">CALL</div>
        </Button>

        <Button
          onClick={() => onAction('raise', raiseAmount)}
          disabled={raiseAmount < minRaise || raiseAmount > maxRaise}
          className="py-3 sm:py-3.5 bg-emerald-600 hover:bg-emerald-500"
        >
          加注 ${raiseAmount}
          <div className="text-[9px] sm:text-[10px] font-normal opacity-80 mt-0.5">RAISE</div>
        </Button>

        <Button
          variant="danger"
          onClick={() => onAction('all_in')}
          disabled={me.chips === 0}
          className="col-span-2 sm:col-span-1 py-3 sm:py-3.5"
        >
          全押 ${me.chips}
          <div className="text-[9px] sm:text-[10px] font-normal opacity-80 mt-0.5">ALL-IN</div>
        </Button>
      </div>
    </div>
  );
}
