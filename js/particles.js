/* ============================================================
   星际突袭 · 粒子特效  js/particles.js
   ------------------------------------------------------------
   四种粒子：
     dot   火花/碎屑（带阻尼衰减）
     ring  冲击波圆环
     text  飘字（伤害数字、提示）
     bolt  电弧（连锁闪电）
   ------------------------------------------------------------
   对外接口：
     Game.particles.burst(x, y, {color, count, speed, size})
     Game.particles.spark(x, y, color)
     Game.particles.ring(x, y, color, radius, speed)
     Game.particles.text(x, y, str, color, size)
     Game.particles.bolt(x1, y1, x2, y2, color)
     Game.particles.clear() / .update(dt) / .draw()
   ============================================================ */
'use strict';

(function () {
  const G = (window.Game = window.Game || {});

  const list = [];
  const MAX = 1000;          // 上限，防止极端情况下掉帧

  function push(p) {
    if (list.length >= MAX) list.shift();
    list.push(p);
  }

  G.particles = {
    list,

    clear() {
      list.length = 0;
    },

    /* ---------- 爆炸 ---------- */
    burst(x, y, opt) {
      opt = opt || {};
      const count = opt.count || 18;
      const speed = opt.speed || 260;
      const color = opt.color || '#ffcc66';
      const size = opt.size || 3;

      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = speed * (0.3 + Math.random() * 0.9);
        push({
          kind: 'dot',
          x, y,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v,
          life: 0.32 + Math.random() * 0.5,
          max: 0.82,
          color,
          r: size * (0.55 + Math.random() * 0.9),
          drag: 2.6,
        });
      }

      push({
        kind: 'ring',
        x, y,
        r: size * 1.6,
        vr: speed * 0.85,
        life: 0.3,
        max: 0.3,
        color,
        w: 3,
      });
    },

    /* ---------- 命中火花 ---------- */
    spark(x, y, color) {
      for (let i = 0; i < 5; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = 80 + Math.random() * 170;
        push({
          kind: 'dot',
          x, y,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v,
          life: 0.1 + Math.random() * 0.16,
          max: 0.26,
          color: color || '#ffe9a8',
          r: 1.5 + Math.random() * 1.9,
          drag: 4.5,
        });
      }
    },

    /* ---------- 冲击环 ---------- */
    ring(x, y, color, radius, speed) {
      push({
        kind: 'ring',
        x, y,
        r: radius || 10,
        vr: speed || 320,
        life: 0.36,
        max: 0.36,
        color: color || '#ffd166',
        w: 4,
      });
    },

    /**
     * 范围指示环：从中心平滑扩散到**精确的** toRadius 再消失。
     * 用来告诉玩家"刚才这一下清掉了多大范围"（点防系统等）。
     */
    sweep(x, y, toRadius, color, dur, width) {
      push({
        kind: 'sweep',
        x, y,
        r0: 6,
        r: 6,
        toR: toRadius,
        life: dur || 0.42,
        max: dur || 0.42,
        color: color || '#9ad8ff',
        w: width || 2.5,
      });
    },

    /* ---------- 飘字 ---------- */
    text(x, y, str, color, size) {
      push({
        kind: 'text',
        x, y,
        vx: 0,
        vy: -52,
        str: String(str),
        life: 0.85,
        max: 0.85,
        color: color || '#ffe9a8',
        size: size || 15,
      });
    },

    /* ---------- 电弧 ---------- */
    bolt(x1, y1, x2, y2, color) {
      push({
        kind: 'bolt',
        x: x1, y: y1,
        x2, y2,
        life: 0.16,
        max: 0.16,
        color: color || '#9ad8ff',
        seed: Math.random() * 1000,
      });
    },

    /* ---------- 更新 ---------- */
    update(dt) {
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i];
        p.life -= dt;
        if (p.life <= 0) {
          list.splice(i, 1);
          continue;
        }

        if (p.kind === 'ring') {
          p.r += p.vr * dt;
        } else if (p.kind === 'sweep') {
          // 从 r0 平滑扩散到精确的 toR，玩家能据此判断清弹范围
          const k = 1 - p.life / p.max;
          p.r = p.r0 + (p.toR - p.r0) * k;
        } else if (p.kind !== 'bolt') {
          const d = Math.max(0, 1 - (p.drag || 0) * dt);
          p.vx *= d;
          p.vy *= d;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
        }
      }
    },

    /* ---------- 绘制 ---------- */
    draw() {
      const ctx = G.ctx;
      if (!list.length) return;

      // 发光类粒子
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';

      for (const p of list) {
        const a = Math.max(0, p.life / p.max);

        if (p.kind === 'dot') {
          ctx.globalAlpha = a;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r * (0.35 + 0.65 * a), 0, Math.PI * 2);
          ctx.fill();
        } else if (p.kind === 'ring') {
          ctx.globalAlpha = a * 0.8;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = Math.max(0.5, p.w * a);
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.stroke();
        } else if (p.kind === 'sweep') {
          // 外圈（范围边界）+ 内层柔光，边界清清楚楚
          ctx.globalAlpha = a * 0.95;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.w;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.stroke();

          ctx.globalAlpha = a * 0.22;
          ctx.lineWidth = p.w * 4;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.stroke();
        } else if (p.kind === 'bolt') {
          // 用两段折线模拟闪电的不规则感
          ctx.globalAlpha = a;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          const mx = (p.x + p.x2) / 2 + Math.sin(p.seed) * 10;
          const my = (p.y + p.y2) / 2 + Math.cos(p.seed * 1.7) * 10;
          ctx.lineTo(mx, my);
          ctx.lineTo(p.x2, p.y2);
          ctx.stroke();
        }
      }

      ctx.restore();

      // 飘字用正常混合，保证清晰
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const p of list) {
        if (p.kind !== 'text') continue;
        const a = Math.max(0, p.life / p.max);
        ctx.globalAlpha = a;
        ctx.font = '700 ' + p.size + 'px "Segoe UI", "Microsoft YaHei", sans-serif';
        ctx.fillStyle = p.color;
        ctx.shadowColor = 'rgba(0,0,0,0.6)';
        ctx.shadowBlur = 4;
        ctx.fillText(p.str, p.x, p.y);
      }
      ctx.restore();
    },
  };

  console.log('[星际突袭] 粒子特效就绪');
})();
