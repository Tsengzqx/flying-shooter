/* ============================================================
   星际突袭 · 子弹系统  js/bullets.js
   ------------------------------------------------------------
   同时管理两方子弹：
     friendly = true   我方（按 style 呈现不同外观）
     friendly = false  敌方（橙红色，各方向）

   我方弹道风格（由 upgrades 的 bulletStyle 决定）：
     normal  青蓝光弹        laser  细长高亮激光
     heavy   橙白重型弹      plasma 紫白能量球（溅射）
     frost   冰蓝霜冻弹      venom  翠绿剧毒弹
     rail    白热轨道弹（极细、超长拖尾）

   波动弹：相位由「世界时间 + 出场横坐标」决定，
   所以同一轮里各弹道会形成连续的蛇形波，不同轮次也不会同相。
   ============================================================ */
'use strict';

(function () {
  const G = (window.Game = window.Game || {});

  const friendly = [];
  const hostile = [];

  const OFF = 60;

  /**
   * 子弹半径下限。
   * 微型弹 / 激光 / 轨道弹叠起来会把体积压到几乎看不见，
   * 所以判定半径和绘制尺寸都不允许低于这个值。
   */
  const MIN_R = 2.6;
  const MIN_LINE = 1.8;

  /* ---------------- 工具 ---------------- */
  function strokeLine(b, core, glow, width) {
    const ctx = G.ctx;
    const tx = b.x - b.vx * 0.014;
    const ty = b.y - b.vy * 0.014;

    ctx.strokeStyle = glow;
    ctx.lineWidth = Math.max(MIN_LINE * 2.2, width * 3);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(tx, ty);
    ctx.stroke();

    ctx.strokeStyle = core;
    ctx.lineWidth = Math.max(MIN_LINE, width);
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(tx, ty);
    ctx.stroke();
  }

  function line(b, color, width, len) {
    const ctx = G.ctx;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(MIN_LINE, width);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - b.vx * len, b.y - b.vy * len);
    ctx.stroke();
  }

  function orb(b, color, glow, radius) {
    const ctx = G.ctx;
    const r = Math.max(MIN_R, radius);
    const pulse = 0.9 + 0.1 * Math.sin(b.t * 16);

    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(b.x, b.y, r * 2.2 * pulse, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(b.x, b.y, r * pulse, 0, Math.PI * 2);
    ctx.fill();
  }

  /** 单发我方子弹的绘制（按风格区分） */
  function drawFriendly(b) {
    const style = b.style || 'normal';

    switch (style) {
      case 'heavy':
        line(b, 'rgba(255,180,90,0.4)', b.r * 1.2, 0.016);
        orb(b, '#fff0c8', 'rgba(255,170,60,0.35)', b.r * 1.35);
        break;

      case 'plasma':
        line(b, 'rgba(190,110,255,0.35)', b.r * 1.1, 0.016);
        orb(b, '#f0d5ff', 'rgba(190,110,255,0.45)', b.r * 1.5);
        break;

      case 'frost':
        line(b, 'rgba(120,230,255,0.35)', b.r * 1.0, 0.016);
        orb(b, '#e6ffff', 'rgba(120,230,255,0.45)', b.r * 1.3);
        break;

      case 'venom':
        line(b, 'rgba(120,230,80,0.35)', b.r * 1.0, 0.016);
        orb(b, '#e6ffb0', 'rgba(120,230,80,0.45)', b.r * 1.35);
        break;

      case 'rail':
        line(b, 'rgba(180,240,255,0.55)', b.r * 3.2, 0.05);
        line(b, '#ffffff', Math.max(MIN_LINE, b.r * 0.9), 0.05);
        break;

      case 'laser':
        line(b, 'rgba(150,240,255,0.5)', b.r * 2.8, 0.02);
        line(b, '#ffffff', Math.max(MIN_LINE, b.r * 0.75), 0.02);
        break;

      default:
        strokeLine(b, '#eafcff', 'rgba(90,210,255,0.35)', Math.max(MIN_R, b.r) * 0.9);
    }
  }

  /* ---------------- 更新 ---------------- */
  function updateList(list, dt) {
    const homingTargets = G.enemies ? G.enemies.list : null;

    for (let i = list.length - 1; i >= 0; i--) {
      const b = list[i];

      /* ---- 追踪弹头 ---- */
      if (b.homing > 0 && homingTargets && homingTargets.length) {
        let best = null;
        let bestD = Infinity;
        for (const e of homingTargets) {
          const d = (e.x - b.x) * (e.x - b.x) + (e.y - b.y) * (e.y - b.y);
          if (d < bestD) { bestD = d; best = e; }
        }
        if (best) {
          const desired = Math.atan2(best.y - b.y, best.x - b.x);
          let cur = Math.atan2(b.vy, b.vx);
          let diff = desired - cur;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;

          const maxTurn = b.homing * 3.4 * dt;
          cur += Math.max(-maxTurn, Math.min(maxTurn, diff));

          const sp = Math.hypot(b.vx, b.vy) || 1;
          b.vx = Math.cos(cur) * sp;
          b.vy = Math.sin(cur) * sp;
        }
      }

      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.t += dt;

      /* ---- 波动弹 ----
         用「世界时间 + 出场横坐标」算相位，再把相位差增量加到位置上：
         · 同一条弹道会左右摆动
         · 同一轮里不同横坐标的弹道相位不同 → 形成连续蛇形波
         · 不同轮次因为世界时间在变，也不会重合成同一个波形          */
      if (b.waveAmp > 0) {
        const target = Math.sin(G.time * b.waveFreq + b.ox * 0.055) * b.waveAmp;
        b.x += target - b.wavePrev;
        b.wavePrev = target;
      }

      /* ---- 弹跳弹 ---- */
      if (b.ricochet > 0 && b.bounces < 12) {
        if (b.x < b.r) {
          b.x = b.r;
          b.vx = Math.abs(b.vx);
          b.bounces++;
        } else if (b.x > G.W - b.r) {
          b.x = G.W - b.r;
          b.vx = -Math.abs(b.vx);
          b.bounces++;
        }
      }

      if (b.y < -OFF || b.y > G.H + OFF || b.x < -OFF || b.x > G.W + OFF) {
        list.splice(i, 1);
      }
    }
  }

  /* ---------------- 对外接口 ---------------- */
  G.bullets = {
    friendly,
    hostile,
    MIN_R,
    MIN_LINE,

    reset() {
      friendly.length = 0;
      hostile.length = 0;
    },

    update(dt) {
      updateList(friendly, dt);
      updateList(hostile, dt);
    },

    draw() {
      const ctx = G.ctx;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';

      // 弹幕流叠起来子弹会非常多，超过阈值就统一画成细线保帧率
      const many = friendly.length > 140;

      for (const b of friendly) {
        if (many) {
          ctx.strokeStyle = '#eafcff';
          ctx.lineWidth = Math.max(MIN_LINE, b.r * 0.9);
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(b.x, b.y);
          ctx.lineTo(b.x - b.vx * 0.006, b.y - b.vy * 0.006);
          ctx.stroke();
        } else {
          drawFriendly(b);
        }
      }

      // ---- 敌方：橙红色圆弹 ----
      for (const b of hostile) {
        const pulse = 0.85 + 0.15 * Math.sin(b.t * 18);

        ctx.fillStyle = 'rgba(255,90,80,0.28)';
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r * 2.6 * pulse, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ff6b5a';
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r * pulse, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#fff2c4';
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r * 0.45, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    },

    /**
     * 我方子弹
     * @param {object} [opt] { r, damage, pierce, homing, wave, ricochet, style }
     */
    spawnPlayer(x, y, vx, vy, opt) {
      opt = opt || {};

      const b = {
        x, y, vx, vy,
        ox: x,
        // 判定半径同样设下限：太小的子弹不仅看不见，也更难打中
        r: Math.max(MIN_R, opt.r || 4),
        damage: opt.damage || 1,
        pierce: opt.pierce || 0,
        homing: opt.homing || 0,
        ricochet: opt.ricochet || 0,
        style: opt.style || 'normal',
        waveAmp: 0,
        waveFreq: 0,
        wavePrev: 0,
        bounces: 0,
        hits: null,
        t: 0,
      };

      if (opt.wave > 0) {
        b.waveAmp = 10 + opt.wave * 13;              // 摆动幅度（像素）
        b.waveFreq = 5.5 + opt.wave * 0.8;           // 摆动频率
        b.wavePrev = Math.sin((G.time || 0) * b.waveFreq + x * 0.055) * b.waveAmp;
      }

      friendly.push(b);
    },

    /** 敌方子弹 */
    spawnEnemy(x, y, vx, vy, opt) {
      opt = opt || {};
      hostile.push({
        x, y, vx, vy,
        r: opt.r || 5,
        damage: opt.damage || 1,
        t: 0,
      });
    },

    /** 计算从 (fx,fy) 指向 (tx,ty) 的速度分量 */
    aim(fx, fy, tx, ty, speed, offsetRad) {
      const a = Math.atan2(ty - fy, tx - fx) + (offsetRad || 0);
      return { vx: Math.cos(a) * speed, vy: Math.sin(a) * speed };
    },
  };

  console.log('[星际突袭] 子弹系统就绪');
})();
