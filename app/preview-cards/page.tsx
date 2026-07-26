'use client';

import { useState } from 'react';
import { Card } from '@/components/Card';
import { RotateCw, Sparkles } from 'lucide-react';

export default function PreviewCardsPage() {
  const [dealKey, setDealKey] = useState(0);

  return (
    <div className="min-h-screen bg-slate-100 p-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold mb-2">四色扑克牌 + 动画预览</h1>
            <p className="text-slate-500 text-sm">
              Scheme C · ♠ #0f172a · ♥ #e11d48 · ♣ #10b981 · ♦ #3b82f6
            </p>
          </div>
          <button
            onClick={() => setDealKey(k => k + 1)}
            className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <RotateCw size={16} />
            重新发牌
          </button>
        </div>

        <section className="bg-white rounded-2xl p-6 shadow-sm mb-6">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
            <Sparkles size={14} />
            lg 尺寸 — 四个 A
          </h2>
          <div key={dealKey} className="flex gap-3 items-end">
            <Card card={{ rank: 'A', suit: '♠' }} size="lg" />
            <Card card={{ rank: 'A', suit: '♥' }} size="lg" />
            <Card card={{ rank: 'A', suit: '♣' }} size="lg" />
            <Card card={{ rank: 'A', suit: '♦' }} size="lg" />
          </div>
        </section>

        <section className="bg-white rounded-2xl p-6 shadow-sm mb-6">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">md 尺寸 — 一手牌</h2>
          <div key={dealKey + 100} className="flex gap-2 items-end">
            <Card card={{ rank: 'K', suit: '♠' }} size="md" />
            <Card card={{ rank: 'Q', suit: '♥' }} size="md" />
            <Card card={{ rank: 'J', suit: '♣' }} size="md" />
            <Card card={{ rank: 'T', suit: '♦' }} size="md" />
            <Card card={{ rank: '9', suit: '♠' }} size="md" />
            <Card card={{ rank: '7', suit: '♥' }} size="md" />
            <Card card={{ rank: '2', suit: '♣' }} size="md" />
          </div>
        </section>

        <section className="bg-white rounded-2xl p-6 shadow-sm mb-6">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">sm 尺寸 — 公牌</h2>
          <div key={dealKey + 200} className="flex gap-1 items-end">
            <Card card={{ rank: 'A', suit: '♠' }} size="sm" />
            <Card card={{ rank: 'K', suit: '♠' }} size="sm" />
            <Card card={{ rank: 'Q', suit: '♠' }} size="sm" />
            <Card card={{ rank: 'J', suit: '♠' }} size="sm" />
            <Card card={{ rank: 'T', suit: '♠' }} size="sm" />
          </div>
        </section>

        <section className="bg-white rounded-2xl p-6 shadow-sm mb-6">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">牌背</h2>
          <div key={dealKey + 300} className="flex gap-2 items-end">
            <Card size="md" faceDown />
            <Card size="md" faceDown />
            <Card size="md" faceDown />
          </div>
        </section>

        <section className="bg-white rounded-2xl p-6 shadow-sm mb-6">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
            高亮态(玩家轮到自己)— 注意 boxShadow 脉冲
          </h2>
          <div className="flex gap-2 items-end">
            <Card card={{ rank: 'A', suit: '♠' }} size="md" highlight />
            <Card card={{ rank: 'K', suit: '♥' }} size="md" highlight />
            <Card card={{ rank: '7', suit: '♣' }} size="md" highlight />
          </div>
        </section>
      </div>
    </div>
  );
}
