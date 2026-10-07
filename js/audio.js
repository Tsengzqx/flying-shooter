/* ============================================================
   星际突袭 · 音效引擎  js/audio.js
   ------------------------------------------------------------
   全部音效由 WebAudio 现场合成，不依赖任何音频文件：
     tone()   振荡器音（可滑音）
     noise()  噪声脉冲（可扫频滤波）—— 爆炸/撞击
   浏览器要求用户手势后才能出声，所以 startGame() 里会调 unlock()。
   ------------------------------------------------------------
   对外接口（其它模块已经在调用）：
     Game.audio.unlock() / .shoot() / .enemyShoot() / .hit()
     Game.audio.explode(scale) / .shieldHit() / .pickup()
     Game.audio.levelUp() / .gameOver() / .bossWarn() / .bossDie()
     Game.audio.pause() / .resume() / .toggleMute()
   ============================================================ */
'use strict';

(function () {
  const G = (window.Game = window.Game || {});

  const VOLUME = 0.34;

  let ctx = null;
  let master = null;
  let muted = false;
  const lastAt = {};          // 同名音效的节流时间戳

  function ensure() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;

    try {
      ctx = new AC();

      master = ctx.createGain();
      master.gain.value = VOLUME;

      // 简单限幅，避免密集音效叠加爆音
      try {
        const comp = ctx.createDynamicsCompressor();
        if (comp.threshold) comp.threshold.value = -14;
        if (comp.ratio) comp.ratio.value = 8;
        if (comp.attack) comp.attack.value = 0.003;
        if (comp.release) comp.release.value = 0.18;
        master.connect(comp);
        comp.connect(ctx.destination);
      } catch (e) {
        master.connect(ctx.destination);
      }

      return true;
    } catch (e) {
      ctx = null;
      return false;
    }
  }

  /** 同一个音效在 ms 毫秒内只响一次（防止连发时糊成一片） */
  function throttle(key, ms) {
    const t = (typeof performance !== 'undefined' && performance.now)
      ? performance.now()
      : Date.now();
    if (lastAt[key] && t - lastAt[key] < ms) return false;
    lastAt[key] = t;
    return true;
  }

  /* ---------------- 基础音源 ---------------- */
  function tone(opt) {
    if (muted || !ctx) return;
    try {
      const t = ctx.currentTime + (opt.delay || 0);
      const dur = opt.dur || 0.12;

      const o = ctx.createOscillator();
      const g = ctx.createGain();

      o.type = opt.type || 'square';
      o.frequency.setValueAtTime(opt.freq, t);
      if (opt.to) {
        o.frequency.exponentialRampToValueAtTime(Math.max(20, opt.to), t + dur);
      }

      const vol = opt.vol == null ? 0.2 : opt.vol;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + (opt.attack || 0.005));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

      o.connect(g);
      g.connect(master);
      o.start(t);
      o.stop(t + dur + 0.03);
    } catch (e) { /* 音频异常不应影响游戏 */ }
  }

  function noise(opt) {
    if (muted || !ctx) return;
    try {
      const t = ctx.currentTime + (opt.delay || 0);
      const dur = opt.dur || 0.25;
      const len = Math.max(1, Math.floor(ctx.sampleRate * dur));

      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      const pw = opt.pow || 1.6;
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, pw);
      }

      const src = ctx.createBufferSource();
      src.buffer = buf;

      const f = ctx.createBiquadFilter();
      f.type = opt.filter || 'lowpass';
      f.frequency.setValueAtTime(opt.from || 1600, t);
      f.frequency.exponentialRampToValueAtTime(Math.max(40, opt.to || 120), t + dur);

      const g = ctx.createGain();
      g.gain.setValueAtTime(opt.vol == null ? 0.3 : opt.vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

      src.connect(f);
      f.connect(g);
      g.connect(master);
      src.start(t);
      src.stop(t + dur + 0.02);
    } catch (e) { /* 同上 */ }
  }

  /* ---------------- 对外接口 ---------------- */
  G.audio = {
    get muted() { return muted; },
    get ready() { return !!ctx; },

    /** 用户手势后调用，创建/恢复音频上下文 */
    unlock() {
      if (!ensure()) return;
      try {
        if (ctx.state === 'suspended') {
          const p = ctx.resume();
          if (p && p.catch) p.catch(() => {});
        }
      } catch (e) { /* 忽略 */ }
    },

    setMuted(v) { muted = !!v; },

    toggleMute() {
      muted = !muted;
      if (G.toast) G.toast(muted ? '🔇 音效已关闭' : '🔊 音效已开启');
      if (!muted) this.pickup();
      return muted;
    },

    /** 暂停时把音量压低（而不是直接掐断，回来时有反馈） */
    pause() { if (master) master.gain.value = VOLUME * 0.18; },
    resume() { if (master) master.gain.value = VOLUME; },

    /* ---- 射击 ---- */
    shoot() {
      if (!throttle('shoot', 45)) return;
      const f = 830 + Math.random() * 130;
      tone({ freq: f, to: 265, dur: 0.07, type: 'square', vol: 0.10 });
      tone({ freq: f * 2, to: 640, dur: 0.045, type: 'sawtooth', vol: 0.032 });
    },

    enemyShoot() {
      if (!throttle('enemyShoot', 70)) return;
      tone({ freq: 310, to: 150, dur: 0.11, type: 'triangle', vol: 0.085 });
    },

    /* ---- 命中 ---- */
    hit() {
      if (!throttle('hit', 35)) return;
      noise({ dur: 0.05, vol: 0.10, from: 2600, to: 900, pow: 2.4 });
    },

    bossHit() {
      if (!throttle('bossHit', 40)) return;
      noise({ dur: 0.09, vol: 0.13, from: 2000, to: 380, pow: 1.9 });
      tone({ freq: 180, to: 120, dur: 0.07, type: 'square', vol: 0.05 });
    },

    shieldHit() {
      tone({ freq: 880, to: 1560, dur: 0.16, type: 'sine', vol: 0.16 });
      tone({ freq: 1320, to: 2240, dur: 0.13, type: 'sine', vol: 0.09, delay: 0.03 });
    },

    /* ---- 爆炸 ---- */
    explode(scale) {
      scale = scale || 1;
      if (!throttle('explode', 55)) return;
      const d = 0.36 * scale;
      noise({ dur: d, vol: 0.24 * Math.min(1.4, scale), from: 1500, to: 80, pow: 1.7 });
      tone({ freq: 155 * scale, to: 38, dur: d * 0.95, type: 'sawtooth', vol: 0.13 });
    },

    bossDie() {
      noise({ dur: 1.3, vol: 0.32, from: 1900, to: 55, pow: 1.3 });
      tone({ freq: 210, to: 28, dur: 1.1, type: 'sawtooth', vol: 0.2 });
      for (let i = 0; i < 5; i++) {
        noise({ dur: 0.42, vol: 0.17, from: 1200, to: 90, delay: 0.16 + i * 0.17 });
      }
    },

    /* ---- 提示音 ---- */
    pickup() {
      tone({ freq: 660, to: 990, dur: 0.10, type: 'sine', vol: 0.18 });
      tone({ freq: 990, to: 1480, dur: 0.12, type: 'sine', vol: 0.13, delay: 0.08 });
    },

    levelUp() {
      [523, 659, 784, 1046].forEach((f, i) => {
        tone({ freq: f, dur: 0.17, type: 'triangle', vol: 0.13, delay: i * 0.07 });
      });
    },

    gameOver() {
      [440, 349, 262, 196].forEach((f, i) => {
        tone({ freq: f, to: f * 0.78, dur: 0.36, type: 'sawtooth', vol: 0.15, delay: i * 0.17 });
      });
    },

    /** Boss 登场警报 */
    bossWarn() {
      tone({ freq: 112, to: 88, dur: 0.52, type: 'sawtooth', vol: 0.17 });
      tone({ freq: 168, to: 128, dur: 0.5, type: 'square', vol: 0.07, delay: 0.24 });
      tone({ freq: 112, to: 88, dur: 0.52, type: 'sawtooth', vol: 0.17, delay: 0.52 });
    },
  };

  /* ---------------- M 键静音 ---------------- */
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyM' || e.repeat) return;
    G.audio.unlock();
    G.audio.toggleMute();
  });

  G.log('[星际突袭] 音效引擎就绪（WebAudio 合成）');
})();
