'use client';

import { useEffect, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { getSound } from '@/lib/sound';

/**
 * 静音切换按钮 — 放右下角浮动
 * 状态持久化在 localStorage 'poker_sound_enabled'
 */
export function SoundToggle() {
  const [enabled, setEnabled] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setEnabled(getSound().isEnabled());
  }, []);

  const onToggle = () => {
    const next = getSound().toggle();
    setEnabled(next);
    // 切换时给个 click 反馈(开启时响一下)
    if (next) {
      getSound().play('click');
    }
  };

  // 避免 hydration 不一致(SSR 时不渲染)
  if (!mounted) return null;

  return (
    <button
      onClick={onToggle}
      aria-label={enabled ? '关闭音效' : '开启音效'}
      className="fixed bottom-4 right-4 z-50 w-11 h-11 rounded-full bg-slate-800/80 hover:bg-slate-700 backdrop-blur border border-slate-600 text-slate-100 flex items-center justify-center transition-colors shadow-lg"
    >
      {enabled ? <Volume2 size={18} /> : <VolumeX size={18} className="text-slate-400" />}
    </button>
  );
}
