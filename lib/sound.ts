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

    const vol = options.volume ?? 0.18;
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

  /** 发牌 — 粉噪音 + 带通滤波(中频段),模拟纸牌"沙"地轻轻落下 */
  private synthDeal(ctx: AudioContext, now: number, vol: number) {
    const duration = 0.09;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    // 粉噪音近似 (Voss-McCartney 算法简化版)
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + white * 0.0990460;
      b1 = 0.96300 * b1 + white * 0.2965164;
      b2 = 0.57000 * b2 + white * 1.0526913;
      const t = i / ctx.sampleRate;
      const env = Math.exp(-t / (duration * 0.35));
      data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.11 * env;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;

    // 带通滤波,只让 800-2500Hz 中频过(纸摩擦声)
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1500;
    filter.Q.value = 0.7;

    const gain = ctx.createGain();
    gain.gain.value = vol * 0.7;

    source.connect(filter).connect(gain).connect(ctx.destination);
    source.start(now);
  }

  /** 翻牌 — sine 振荡器 600→180Hz 频率下滑 + ADSR,木琴"咚"的质感 */
  private synthFlip(ctx: AudioContext, now: number, vol: number) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(620, now);
    osc.frequency.exponentialRampToValueAtTime(180, now + 0.08);

    const gain = ctx.createGain();
    // ADSR 包络:Attack 5ms / Decay 95ms
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(vol * 0.6, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  /** 点击 — triangle 800Hz,30ms 柔和 tick */
  private synthClick(ctx: AudioContext, now: number, vol: number) {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 800;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol * 0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.04);
  }

  /** 弃牌 — 粉噪音 + 低通滤波,牌"飘"走的轻柔感 */
  private synthFold(ctx: AudioContext, now: number, vol: number) {
    const duration = 0.25;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + white * 0.0990460;
      b1 = 0.96300 * b1 + white * 0.2965164;
      b2 = 0.57000 * b2 + white * 1.0526913;
      const t = i / ctx.sampleRate;
      const env = Math.exp(-t / (duration * 0.6));
      data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.11 * env;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 600;

    const gain = ctx.createGain();
    gain.gain.value = vol * 0.55;

    source.connect(filter).connect(gain).connect(ctx.destination);
    source.start(now);
  }

  /** 特殊牌型 — sine 三音 + 轻微 vibrato,像远处铃声 */
  private synthChime(ctx: AudioContext, now: number, vol: number) {
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      // 轻微 vibrato(±3Hz, 5Hz 速率),增加"活"感
      const vibrato = ctx.createOscillator();
      vibrato.frequency.value = 5;
      const vibratoGain = ctx.createGain();
      vibratoGain.gain.value = 3;
      vibrato.connect(vibratoGain).connect(osc.frequency);

      const gain = ctx.createGain();
      const t0 = now + i * 0.08;
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(vol * 0.22, t0 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.7);

      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.75);
      vibrato.start(t0);
      vibrato.stop(t0 + 0.75);
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
