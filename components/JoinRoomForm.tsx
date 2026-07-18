'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export function JoinRoomForm() {
  const router = useRouter();
  const [roomId, setRoomId] = useState('');
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const formattedId = roomId.trim().toUpperCase().startsWith('POKER-')
        ? roomId.trim().toUpperCase()
        : `POKER-${roomId.trim().toUpperCase()}`;
      const res = await fetch(`/api/rooms/${formattedId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname, password: password || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error);
        setLoading(false);
        return;
      }
      sessionStorage.setItem(`poker_${formattedId}`, data.playerId);
      sessionStorage.setItem(`poker_nick_${formattedId}`, nickname);
      router.push(`/room/${formattedId}`);
    } catch (err) {
      setError('网络错误');
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1.5">房间号</label>
        <Input
          value={roomId}
          onChange={e => setRoomId(e.target.value)}
          placeholder="比如 A1B2 或 POKER-A1B2"
          maxLength={20}
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1.5">你的昵称</label>
        <Input
          value={nickname}
          onChange={e => setNickname(e.target.value)}
          placeholder="比如 Tom"
          maxLength={12}
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1.5">
          房间密码 <span className="text-slate-500 text-xs">（如果有）</span>
        </label>
        <Input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="留空则无密码"
          maxLength={20}
        />
      </div>

      {error && (
        <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      <Button type="submit" disabled={loading || !nickname.trim() || !roomId.trim()} className="w-full">
        {loading ? '加入中...' : '🚪 加入房间'}
      </Button>
    </form>
  );
}
