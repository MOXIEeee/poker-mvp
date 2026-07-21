'use client';

import { useEffect, useState } from 'react';
import { CreateRoomForm } from '@/components/CreateRoomForm';
import { JoinRoomForm } from '@/components/JoinRoomForm';
import { cn } from '@/lib/utils';
import { Sparkles, Users } from 'lucide-react';
import { track, trackCtx } from '@/lib/analytics-client';

type Tab = 'create' | 'join';

export default function HomePage() {
  const [tab, setTab] = useState<Tab>('create');

  useEffect(() => {
    // 进入首页
    let hasHistory = false;
    try {
      hasHistory = !!localStorage.getItem('poker_visited_v1');
      localStorage.setItem('poker_visited_v1', '1');
    } catch {
      // ignore
    }
    track('home_view', { has_history: hasHistory, tab });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    track('tab_switch', { tab });
  }, [tab]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-yellow-400 to-amber-600 mb-4 shadow-2xl shadow-yellow-500/30">
            <span className="text-4xl">♠️</span>
          </div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-yellow-300 to-amber-200 bg-clip-text text-transparent">
            德州扑克
          </h1>
          <p className="text-slate-400 mt-2 text-sm">和朋友一起开一局 🎲</p>
        </div>

        {/* Tab 切换 */}
        <div className="bg-slate-900/60 backdrop-blur-xl rounded-2xl border border-white/5 shadow-2xl overflow-hidden">
          <div className="grid grid-cols-2 border-b border-white/5">
            <button
              onClick={() => setTab('create')}
              className={cn(
                'py-3 text-sm font-medium transition flex items-center justify-center gap-2',
                tab === 'create'
                  ? 'bg-yellow-500/10 text-yellow-300 border-b-2 border-yellow-400'
                  : 'text-slate-400 hover:text-slate-200'
              )}
            >
              <Sparkles className="w-4 h-4" />
              创建房间
            </button>
            <button
              onClick={() => setTab('join')}
              className={cn(
                'py-3 text-sm font-medium transition flex items-center justify-center gap-2',
                tab === 'join'
                  ? 'bg-yellow-500/10 text-yellow-300 border-b-2 border-yellow-400'
                  : 'text-slate-400 hover:text-slate-200'
              )}
            >
              <Users className="w-4 h-4" />
              加入房间
            </button>
          </div>

          <div className="p-6">
            {tab === 'create' ? <CreateRoomForm /> : <JoinRoomForm />}
          </div>
        </div>

        <p className="text-center text-xs text-slate-500 mt-6">
          MVP 版本 · 朋友间玩玩 · 全球节点实时同步
        </p>
      </div>
    </div>
  );
}
