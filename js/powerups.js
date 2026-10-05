/* ============================================================
   星际突袭 · 掉落道具  js/powerups.js
   ------------------------------------------------------------
   击毁敌机有概率掉落临时增益（与 Roguelike 永久增益互补）：
     S  三向散射   持续 8 秒
     R  高速连发   持续 8 秒
     D  能量护盾   抵挡一次伤害
     +  维修包     回复 1 点生命
   ------------------------------------------------------------
   受"补给掉落 / 磁力吸附"等增益影响（读 Game.stats）。
   ------------------------------------------------------------
   对外接口：
     Game.powerups.maybeDrop(x, y, enemyType)
     Game.powerups.spawn(type, x, y)
     Game.powerups.reset() / .update(dt) / .draw()
   ============================================================ */
'use strict';

(function () {
  const G = (window.Game = window.Game || {});

  const list = [];

  /** 道具流的计数来源：累计拾取了多少件道具 */
  const state = { collected: 0, resonance: 0 };

  // 各敌机的掉落概率（基础值调低，靠"补给协议/补给风暴"堆回来）
  const DROP_BASE = { scout: 0.022, zigzag: 0.04, gunship: 0.12, escort: 0.5, boss: 0.6 };

  const TYPES = {
    spread: { icon: 'S', color: '#7fe6ff', label: '三向散射' },
    rapid:  { icon: 'R', color: '#ffd166', label: '高速连发' },
    shield: { icon: 'D', color: '#7bffd0', label: '能量护盾' },
    heal:   { icon: '+', color: '#ff8fb0', label: '维修包' },
  };

  const FALL = 88;

  /** 道具共鸣可触发的随机效果 */
  const RESONANCE = ['spread', 'rapid', 'shield', 'heal', 'bomb'];

  /**
   * 道具共鸣：拾取时额外触发一次随机增益
   * 注意是直接调用底层函数，不会再次进入 apply()，因此不会递归
   */
  function triggerResonance(x, y) {
    const S = G.stats || {};
    const P = G.player;
    const kind = RESONANCE[(Math.random() * RESONANCE.length) | 0];

    state.resonance++;
    if (kind === 'heal') {
      if (G.heal) G.heal(1);
    } else if (kind === 'bomb') {
      if (G.upgrades) {
        G.upgrades.clearBulletsAround(x, y, 130, 6);
        G.upgrades.blastAround(x, y, 130, 1.6);
      }
    } else if (P && P.addPower) {
      P.addPower(kind, S.itemDurationMul || 1, S.itemQuality || 0);
    }

    if (G.particles) {
      G.particles.ring(x, y, '#ffd166', 8, 400);
      G.particles.text(x, y - 28, '🔔 共鸣', '#ffd166', 14);
    }
  }

  /** 圆角矩形（不依赖 ctx.roundRect，兼容旧浏览器与测试桩） */
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function pickType() {
    const r = Math.random() * 100;
    if (r < 30) return 'spread';
    if (r < 60) return 'rapid';
    if (r < 85) return 'shield';
    return 'heal';
  }

  G.powerups = {
    list,
    state,

    reset() {
      list.length = 0;
      state.collected = 0;
      state.resonance = 0;
    },

    /**
     * 敌机被击毁时调用
     * @param {string} enemyType scout / zigzag / gunship / boss
     */
    maybeDrop(x, y, enemyType) {
      const S = G.stats || {};
      const base = DROP_BASE[enemyType] || 0.06;
      const chance = base + (S.dropRate || 0);

      if (Math.random() >= chance) return;

      const n = 1 + (S.doubleDrop > 0 && Math.random() < S.doubleDrop ? 1 : 0);
      for (let i = 0; i < n; i++) {
        this.spawn(pickType(), x + (i ? (Math.random() - 0.5) * 34 : 0), y);
      }
    },

    spawn(type, x, y) {
      const def = TYPES[type] || TYPES.spread;
      list.push({
        type,
        x,
        y,
        r: 15,
        vy: FALL,
        t: Math.random() * 6,
        baseX: x,
        life: 16,          // 16 秒后自动消失
        def,
      });
    },

    update(dt) {
      const P = G.player;
      const S = G.stats || {};
      const magnetR = 80 + (S.magnet || 0);

      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i];
        p.t += dt;
        p.life -= dt;

        if (p.life <= 0 || p.y > G.H + 40) {
          list.splice(i, 1);
          continue;
        }

        // 磁力吸附
        if (P && P.alive) {
          const dx = P.x - p.x;
          const dy = P.y - p.y;
          const d = Math.hypot(dx, dy);

          if (d < magnetR || (S.magnet > 0 && d < magnetR * 2)) {
            const pull = Math.min(560, 260 + (S.magnet || 0) * 6) * dt;
            p.x += (dx / (d || 1)) * pull;
            p.y += (dy / (d || 1)) * pull;
          } else {
            p.y += p.vy * dt;
            p.x = p.baseX + Math.sin(p.t * 1.6) * 14;
          }

          // 拾取
          if (d < p.r + 16) {
            list.splice(i, 1);
            this.apply(p.type, p.x, p.y);
            continue;
          }
        } else {
          p.y += p.vy * dt;
        }
      }
    },

    /** 拾取结算 */
    apply(type, x, y) {
      const P = G.player;
      const S = G.stats || {};

      // 道具流计数：装备强化的伤害就是靠这个叠起来的
      state.collected++;

      if (type === 'heal') {
        if (G.heal && G.heal(1)) {
          if (G.particles) G.particles.text(x, y - 10, '+1 生命', '#ff8fb0', 15);
        } else {
          G.score += 200;
          if (G.particles) G.particles.text(x, y - 10, '+200', '#ff8fb0', 15);
        }
        G.hud.invalidate();
      } else if (P && P.addPower) {
        P.addPower(type, S.itemDurationMul || 1, S.itemQuality || 0);
        if (G.particles) G.particles.text(x, y - 10, TYPES[type].label, TYPES[type].color, 15);
      }

      // 战地维修：概率回血
      if (S.itemRepair > 0 && Math.random() < S.itemRepair) {
        if (G.heal && G.heal(1) && G.particles) {
          G.particles.text(x, y - 26, '🔧 +1 生命', '#7bffd0', 15);
        }
      }

      // 冲击拾取：清弹 + 范围伤害
      if (S.itemBomb > 0 && G.upgrades) {
        const r = 90 + 30 * S.itemBomb;
        G.upgrades.clearBulletsAround(x, y, r, 3 + S.itemBomb);
        G.upgrades.blastAround(x, y, r, 1.2 * S.itemBomb);
        if (G.particles) G.particles.ring(x, y, '#ffd166', 10, 420);
        if (G.audio && G.audio.explode) G.audio.explode(0.5);
      }

      // 道具共鸣：每层 55% 概率额外再触发一次随机增益
      if (S.itemResonance > 0) {
        for (let k = 0; k < S.itemResonance; k++) {
          if (Math.random() < 0.55) triggerResonance(x, y);
        }
      }

      // 点金之手：拾取额外得分
      if (S.itemMidas > 0) {
        const bonus = 300 * S.itemMidas;
        G.score += bonus;
        if (G.particles) G.particles.text(x, y - 42, '+' + bonus, '#ffd166', 14);
        G.hud.invalidate();
      }

      // 金色 · 点石成金：每拾取 1 件永久提升射速
      if (G.upgrades && G.upgrades.addAlchemy) G.upgrades.addAlchemy(1);

      if (G.particles) {
        G.particles.burst(x, y, { color: TYPES[type].color, count: 16, speed: 220 });
      }
      if (G.audio && G.audio.pickup) G.audio.pickup();

      // 道具数变化会影响"装备强化"的伤害加成
      if (G.upgrades && G.upgrades.recalc) G.upgrades.recalc();
    },

    draw() {
      const ctx = G.ctx;

      for (const p of list) {
        const pulse = 0.6 + 0.4 * Math.sin(p.t * 6);
        const blink = p.life < 4 && Math.floor(p.life * 8) % 2 === 0;

        ctx.save();
        ctx.translate(p.x, p.y);
        if (blink) ctx.globalAlpha = 0.35;

        // 光晕
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 26);
        g.addColorStop(0, p.def.color + '88');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, 26, 0, Math.PI * 2);
        ctx.fill();

        // 胶囊
        ctx.fillStyle = 'rgba(6,18,34,0.92)';
        ctx.strokeStyle = p.def.color;
        ctx.lineWidth = 2;
        roundRect(ctx, -13, -13, 26, 26, 7);
        ctx.fill();
        ctx.stroke();

        // 内圈呼吸
        ctx.globalAlpha *= 0.35 + 0.35 * pulse;
        ctx.strokeStyle = p.def.color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(0, 0, 10 + pulse * 2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = blink ? 0.35 : 1;

        // 图标
        ctx.fillStyle = p.def.color;
        ctx.font = '700 16px "Segoe UI", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(p.def.icon, 0, 1);

        ctx.restore();
      }
    },
  };

  console.log('[星际突袭] 掉落道具就绪');
})();
