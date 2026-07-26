'use client';

/**
 * Web Audio API 程序化音效 — 零外部资源
 *
 * 5 个核心音效:
 *   deal  — 发牌(短促纸牌滑动声,白噪音 + 高通滤波)
 *   flip  — 翻牌(啪嗒,oscillator 快速降频)
 *   click — 按钮点击(轻脆 tick)
 *   fold  — 弃牌(推走感,白噪音 + 低通滤波)
 *   chime — 特殊牌型达成(三和弦渐入)
 *
 * 用法:
 *   import { getSound } from '@/lib/sound';
 *   getSound().play('deal');
 *
 * 全局开关:
 *   getSound().setEnabled(false);  // 静音
 *   持久化到 localStorage 'poker_sound_enabled'
 */

export type SoundType = 'deal' | 'flip' | 'click' | 'fold' | 'chime';

const STORAGE_KEY = 'poker_sound_enabled';

class SoundManager {
  private ctx: AudioContext | null = null;
  private enabled: boolean;

  constructor() {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY);
      this.enabled = stored === null ? true : stored === 'true';
    } else {
      this.enabled = true;
    }
  }

  private ensureCtx(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, String(enabled));
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  toggle(): boolean {
    this.setEnabled(!this.enabled);
    return this.enabled;
  }

  play(type: SoundType, options: { volume?: number; delay?: number } = {}) {
    if (!this.enabled) return;
    const ctx = this.ensureCtx();
    if (!ctx) return;

    const vol = options.volume ?? 0.25;
    const delay = options.delay ?? 0;

    if (delay > 0) {
      setTimeout(() => this.playImmediate(ctx, type, vol), delay * 1000);
    } else {
      this.playImmediate(ctx, type, vol);
    }
  }

  private playImmediate(ctx: AudioContext, type: SoundType, vol: number) {
    const now = ctx.currentTime;
    switch (type) {
      case 'deal':
        this.synthDeal(ctx, now, vol);
        break;
      case 'flip':
        this.synthFlip(ctx, now, vol);
        break;
      case 'click':
        this.synthClick(ctx, now, vol);
        break;
      case 'fold':
        this.synthFold(ctx, now, vol);
        break;
      case 'chime':
        this.synthChime(ctx, now, vol);
        break;
    }
  }

  /** 发牌 — 白噪音 + 高通 + 短衰减 ≈ 纸牌滑过桌面 */
  private synthDeal(ctx: AudioContext, now: number, vol: number) {
    const duration = 0.12;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const t = i / ctx.sampleRate;
      data[i] = (Math.random() * 2 - 1) * Math.exp(-t / (duration * 0.4));
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 1800;

    const gain = ctx.createGain();
    gain.gain.value = vol * 0.6;

    source.connect(filter).connect(gain).connect(ctx.destination);
    source.start(now);
  }

  /** 翻牌 — 短促 square 振荡器 800→200Hz 频率下滑,模拟"啪嗒" */
  private synthFlip(ctx: AudioContext, now: number, vol: number) {
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(900, now);
    osc.frequency.exponentialRampToValueAtTime(180, now + 0.06);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol * 0.8, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  /** 点击 — 短 sine tick */
  private synthClick(ctx: AudioContext, now: number, vol: number) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 1400;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol * 0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.05);
  }

  /** 弃牌 — 白噪音 + 低通,推走感 */
  private synthFold(ctx: AudioContext, now: number, vol: number) {
    const duration = 0.22;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const t = i / ctx.sampleRate;
      data[i] = (Math.random() * 2 - 1) * Math.exp(-t / (duration * 0.5));
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1200;

    const gain = ctx.createGain();
    gain.gain.value = vol * 0.5;

    source.connect(filter).connect(gain).connect(ctx.destination);
    source.start(now);
  }

  /** 特殊牌型 — C5/E5/G5 三和弦 sine 渐入 */
  private synthChime(ctx: AudioContext, now: number, vol: number) {
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;

      const gain = ctx.createGain();
      const t0 = now + i * 0.06;
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(vol * 0.35, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.6);

      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.65);
    });
  }
}

let instance: SoundManager | null = null;

export function getSound(): SoundManager {
  if (!instance) {
    instance = new SoundManager();
  }
  return instance;
}
