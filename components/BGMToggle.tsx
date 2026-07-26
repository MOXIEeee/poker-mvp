'use client';

import { useEffect, useState } from 'react';
import { Music, Music2 } from 'lucide-react';
import { getBGM } from '@/lib/bgm';

/**
 * BGM 切换按钮 — 放 SoundToggle 旁边
 * 状态持久化在 localStorage 'poker_bgm_enabled'
 */
export function BGMToggle() {
  const [enabled, setEnabled] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setEnabled(getBGM().isEnabled());
  }, []);

  const onToggle = () => {
    const next = getBGM().toggle();
    setEnabled(next);
  };

  if (!mounted) return null;

  return (
    <button
      onClick={onToggle}
      aria-label={enabled ? '关闭背景音乐' : '开启背景音乐'}
      className="fixed bottom-4 right-16 z-50 w-11 h-11 rounded-full bg-slate-800/80 hover:bg-slate-700 backdrop-blur border border-slate-600 text-slate-100 flex items-center justify-center transition-colors shadow-lg"
    >
      {enabled ? (
        <Music size={18} className="text-emerald-400" />
      ) : (
        <Music2 size={18} className="text-slate-400" />
      )}
    </button>
  );
}
