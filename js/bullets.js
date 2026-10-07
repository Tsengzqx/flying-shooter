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

    // 光晕收窄：以前是 2.2 倍半径实心，高弹幕量下会糊成一片紫雾
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(b.x, b.y, r * 1.5 * pulse, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(b.x, b.y, r * pulse, 0, Math.PI * 2);
    ctx.fill();
  }

  /**
   * 元素光晕（等离子 / 霜冻 / 剧毒）
   * 关键：元素只作为"套在弹体外面的光环"，不再替换弹体本身的外观。
   * 之前 等离子弹 会让所有子弹变成又粗又紫的圆球，看起来像 bug。
   */
  const ELEMENT = {
    plasma: { line: 'rgba(190,110,255,0.55)', glow: 'rgba(190,110,255,0.16)' },
    frost:  { line: 'rgba(120,230,255,0.55)', glow: 'rgba(120,230,255,0.16)' },
    venom:  { line: 'rgba(140,235,90,0.55)',  glow: 'rgba(140,235,90,0.16)'  },
    ember:  { line: 'rgba(255,150,60,0.55)',  glow: 'rgba(255,150,60,0.16)'  },
  };

  function elementAura(b, el, tier) {
    const e = ELEMENT[el];
    if (!e) return;

    const ctx = G.ctx;
    const r = Math.max(MIN_R, b.r);
    const ring = r * (1.7 + 0.55 * tier);

    ctx.fillStyle = e.glow;
    ctx.beginPath();
    ctx.arc(b.x, b.y, ring * 0.8, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = e.line;
    ctx.lineWidth = Math.max(MIN_LINE, r * 0.32);
    ctx.beginPath();
    ctx.arc(b.x, b.y, ring, 0, Math.PI * 2);
    ctx.stroke();
  }

  /** 单个子弹的"本体造型"（不含元素光晕） */
  function drawCore(b, core) {
    switch (core) {
      case 'heavy':
        line(b, 'rgba(255,180,90,0.4)', b.r * 1.2, 0.016);
        orb(b, '#fff0c8', 'rgba(255,170,60,0.35)', b.r * 1.1);
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

  /** 单发我方子弹的绘制：先铺元素光晕，再画弹体造型 */
  function drawFriendly(b) {
    const elems = b.elems;
    if (elems && elems.length) {
      // 多层元素时半径依次外扩，避免完全重叠看不出来
      for (let i = 0; i < elems.length; i++) elementAura(b, elems[i], i);
    }
    drawCore(b, b.style || 'normal');
  }

  /* ---------------- 更新 ---------------- */

  /** 角度差归一到 (-π, π] */
  function angleDiff(a, b) {
    let d = a - b;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  /** 目标是否还在子弹机首的锥形内 */
  function inCone(b, t, cur, cone) {
    return Math.abs(angleDiff(Math.atan2(t.y - b.y, t.x - b.x), cur)) <= cone;
  }

  /** 目标是否还活着 */
  function targetAlive(t) {
    return !!t && t.alive !== false && !t.dead && (t.hp === undefined || t.hp > 0);
  }

  /**
   * 追踪弹头：三条限制让它"帮得上忙"但不会变成磁铁
   *   ① 转向率低（1.15~1.95 rad/s）—— 飞完一屏只能转 66°~112°
   *   ② 只在机首 ±72° 锥形内索敌，**也只在锥形内保持锁定**
   *      → 身后的目标不追，冲过头了也不会掉头绕回来
   *   ③ 锁定后不再换目标；目标死亡或跑出锥形才重新索敌
   */
  function steerHoming(b, targets, dt) {
    const cone = b.homingCone == null ? 1.2566 : b.homingCone;
    const cur = Math.atan2(b.vy, b.vx);

    // 锁定还有效吗？
    let tgt = b.lock;
    if (tgt && (!targetAlive(tgt) || !inCone(b, tgt, cur, cone))) {
      tgt = null;
      b.lock = null;
    }

    // 重新索敌：锥形内最近的一个
    if (!tgt) {
      let bestD = Infinity;
      for (let k = 0; k < targets.length; k++) {
        const e = targets[k];
        if (!targetAlive(e)) continue;

        const dx = e.x - b.x;
        const dy = e.y - b.y;
        const d = dx * dx + dy * dy;
        if (d >= bestD) continue;
        if (!inCone(b, e, cur, cone)) continue;

        bestD = d;
        tgt = e;
      }
      b.lock = tgt;
    }

    if (!tgt) return;

    const turn = angleDiff(Math.atan2(tgt.y - b.y, tgt.x - b.x), cur);
    const maxTurn = b.homing * dt;
    const sp = Math.hypot(b.vx, b.vy) || 1;
    const a = cur + Math.max(-maxTurn, Math.min(maxTurn, turn));

    b.vx = Math.cos(a) * sp;
    b.vy = Math.sin(a) * sp;
  }

  function updateList(list, dt) {
    const homingTargets = G.enemies ? G.enemies.list : null;

    for (let i = list.length - 1; i >= 0; i--) {
      const b = list[i];
      if (!b) { list.splice(i, 1); continue; }   // 防御：清掉空槽，别让一帧异常把游戏打崩

      /* ---- 追踪弹头 ---- */
      if (b.homing > 0 && homingTargets && homingTargets.length) {
        steerHoming(b, homingTargets, dt);
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
     * @param {object} [opt] { r, damage, pierce, homing, homingCone, bonus, wave, ricochet, style, elems, critChance }
     *        style = 本体造型（normal/laser/heavy/rail）
     *        elems = 元素光晕列表（plasma/frost/venom），不再替换本体造型
     *        homing = 转向率（弧度/秒），homingCone = 索敌锥形半角
     *        bonus = 固定加伤（僚机继承的命中积累）；不传则用本体的命中积累
     *        critChance 传了就覆盖本体的暴击率（僚机用得到）
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
        homingCone: opt.homingCone,
        lock: null,                   // 当前锁定的目标（追踪用）
        bonus: opt.bonus,             // undefined = 用本体的命中积累
        ricochet: opt.ricochet || 0,
        critChance: opt.critChance,   // undefined = 用本体的暴击率
        style: opt.style || 'normal',
        elems: opt.elems && opt.elems.length ? opt.elems : null,
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

  G.log('[星际突袭] 子弹系统就绪');
})();
