'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export function CreateRoomForm() {
  const router = useRouter();
  const [nickname, setNickname] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [smallBlind, setSmallBlind] = useState(10);
  const [bigBlind, setBigBlind] = useState(20);
  const [startingChips, setStartingChips] = useState(1000);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nickname,
          maxPlayers,
          smallBlind,
          bigBlind,
          startingChips,
          password: password || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error);
        setLoading(false);
        return;
      }
      // 存到 sessionStorage
      sessionStorage.setItem(`poker_${data.roomId}`, data.playerId);
      sessionStorage.setItem(`poker_nick_${data.roomId}`, nickname);
      router.push(`/room/${data.roomId}`);
    } catch (err) {
      setError('网络错误');
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1.5">你的昵称</label>
        <Input
          value={nickname}
          onChange={e => setNickname(e.target.value)}
          placeholder="比如 Mike"
          maxLength={12}
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">玩家数</label>
          <select
            value={maxPlayers}
            onChange={e => setMaxPlayers(Number(e.target.value))}
            className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-white focus:border-yellow-500/50 focus:outline-none"
          >
            {[2, 3, 4, 5, 6].map(n => (
              <option key={n} value={n}>{n} 人</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">初始筹码</label>
          <Input
            type="number"
            value={startingChips}
            onChange={e => setStartingChips(Number(e.target.value))}
            min={100}
            step={100}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">小盲</label>
          <Input
            type="number"
            value={smallBlind}
            onChange={e => setSmallBlind(Number(e.target.value))}
            min={1}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">大盲</label>
          <Input
            type="number"
            value={bigBlind}
            onChange={e => setBigBlind(Number(e.target.value))}
            min={2}
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1.5">
          房间密码 <span className="text-slate-500 text-xs">（可选）</span>
        </label>
        <Input
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="不填则无密码"
          maxLength={20}
        />
      </div>

      {error && (
        <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      <Button type="submit" disabled={loading || !nickname.trim()} className="w-full">
        {loading ? '创建中...' : '🎲 创建房间'}
      </Button>
    </form>
  );
}
