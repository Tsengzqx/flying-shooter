/* ============================================================
   星际突袭 · 经验与等级  js/progress.js
   ------------------------------------------------------------
   强化的获取途径从"过关"改成了"升级"：
     击杀敌机 → 获得经验 → 经验满 → 等级 +1 → 弹出三选一强化

   · 经验需求随等级递增（xpFor）
   · 一次击杀可能连升多级，升级机会会排队（pending）
   · 等级本身也是"升级流"的核心资源：
       成长之力（每级 +伤害）
       熟练加速（每级 −射击间隔）
       强健体魄（每 3 级 +生命上限）
       战斗直觉（每 5 级 +暴击率）
   ------------------------------------------------------------
   对外接口：
     Game.progress.addXp(n)     击杀时调用（自动吃 xpMul 加成）
     Game.progress.update(dt) / .draw() / .reset()
     Game.progress.level        当前等级
     Game.progress.potentialMul()  潜能爆发的射速倍率
   ============================================================ */
'use strict';

(function () {
  const G = (window.Game = window.Game || {});

  const state = {
    level: 1,
    xp: 0,
    need: 9,
    total: 0,
    pending: 0,       // 还没用掉的升级次数
    flashT: 0,        // 升级闪光
    potentialT: 0,    // 潜能爆发剩余时间
  };

  /** 升到 level+1 所需的经验（受"经验压缩"增益削减） */
  function xpFor(level) {
    const base = 5 + level * 3 + Math.pow(level, 1.4);
    const S = G.stats || {};
    const cut = Math.min(0.72, 0.12 * (S.xpCostCut || 0));
    return Math.max(3, Math.round(base * (1 - cut)));
  }

  /** 升级瞬间的结算（可以被连升多次触发） */
  function onLevelUp() {
    const S = G.stats || {};
    const P = G.player;

    // 升级护盾
    if (S.shieldOnLevelUp > 0 && P && P.power) {
      P.power.shield = Math.max(P.power.shield, 7 * S.shieldOnLevelUp);
    }

    // 升级回复：层数越高越频繁（3/2/1 级一次）
    if (S.healOnLevelUp > 0) {
      const every = Math.max(1, 4 - S.healOnLevelUp);
      if (state.level % every === 0 && G.heal) G.heal(1);
    }

    // 潜能爆发
    if (S.potential > 0) state.potentialT = 6;

    // 等级会改变 成长之力 / 熟练加速 / 强健体魄 / 战斗直觉
    if (G.upgrades && G.upgrades.recalc) G.upgrades.recalc();

    if (G.particles && P) {
      G.particles.ring(P.x, P.y, '#8fffbf', 16, 470);
      G.particles.text(P.x, P.y - 48, 'LV ' + state.level, '#8fffbf', 20);
    }
    if (G.hud) G.hud.invalidate();
  }

  G.progress = {
    state,
    xpFor,

    get level() { return state.level; },

    reset() {
      state.level = 1;
      state.xp = 0;
      state.need = xpFor(1);
      state.total = 0;
      state.pending = 0;
      state.flashT = 0;
      state.potentialT = 0;
      if (G.upgrades && G.upgrades.recalc) G.upgrades.recalc();
    },

    /**
     * 获得经验（击杀敌机 / 击破 Boss 时调用）
     * @returns {number} 实际获得的经验（已计入 xpMul）
     */
    addXp(base) {
      if (G.state !== 'playing') return 0;

      const mul = (G.stats && G.stats.xpMul) || 1;
      const gain = Math.max(1, Math.round(base * mul));

      state.xp += gain;
      state.total += gain;

      let leveled = 0;
      while (state.xp >= state.need && leveled < 30) {
        state.xp -= state.need;
        state.level++;
        state.need = xpFor(state.level);
        leveled++;
      }

      if (leveled > 0) {
        state.pending += leveled;
        state.flashT = 1;
        for (let i = 0; i < leveled; i++) onLevelUp();

        if (G.audio && G.audio.levelUp) G.audio.levelUp();
        if (G.hud) G.hud.invalidate();
      }

      return gain;
    },

    /** 三选一选完后，消耗掉一次升级机会 */
    onChosen() {
      state.pending = Math.max(0, state.pending - 1);
    },

    /** 潜能爆发期间的射速倍率（越小越快，1 表示无效果） */
    potentialMul() {
      const S = G.stats || {};
      if (!S.potential || state.potentialT <= 0) return 1;
      return Math.max(0.3, 1 - 0.22 * S.potential);
    },

    update(dt) {
      if (state.flashT > 0) state.flashT = Math.max(0, state.flashT - dt * 1.6);
      if (state.potentialT > 0) state.potentialT = Math.max(0, state.potentialT - dt);

      // 有攒着的升级 → 弹出三选一
      // （Boss 正在放击破演出时先等一等，别把爆炸动画冻在半路）
      const bossDying = !!(G.boss && G.boss.dying && G.boss.dying());

      if (state.pending > 0 && G.state === 'playing' && !bossDying &&
          G.upgrades && G.upgrades.request) {
        G.upgrades.request(state.level);
      }
    },

    /** 屏幕底部的经验条 */
    draw() {
      const ctx = G.ctx;
      if (!ctx) return;

      const W = G.W;
      const H = G.H;
      const h = 7;
      const y = H - h - 3;
      const ratio = Math.max(0, Math.min(1, state.xp / state.need));

      ctx.save();

      // 槽
      ctx.fillStyle = 'rgba(8,14,28,0.82)';
      ctx.fillRect(0, y, W, h);

      // 进度
      const g = ctx.createLinearGradient(0, 0, W, 0);
      g.addColorStop(0, '#3ad1ff');
      g.addColorStop(0.55, '#8fffbf');
      g.addColorStop(1, '#ffd166');
      ctx.fillStyle = g;
      ctx.fillRect(0, y, W * ratio, h);

      // 升级闪光
      if (state.flashT > 0) {
        ctx.globalAlpha = Math.min(1, state.flashT);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, y, W, h);
        ctx.globalAlpha = 1;
      }

      // 潜能爆发时条顶发光
      if (state.potentialT > 0) {
        ctx.globalAlpha = 0.5 + 0.5 * Math.sin(G.time * 14);
        ctx.fillStyle = '#ffd166';
        ctx.fillRect(0, y - 3, W * ratio, 3);
        ctx.globalAlpha = 1;
      }

      ctx.font = '700 11px "Segoe UI", "Microsoft YaHei", sans-serif';
      ctx.textBaseline = 'bottom';

      ctx.textAlign = 'left';
      ctx.fillStyle = '#d6f2ff';
      ctx.fillText('LV ' + state.level, 8, y - 4);

      ctx.textAlign = 'right';
      ctx.fillStyle = '#7fa8cc';
      ctx.fillText(Math.floor(state.xp) + ' / ' + state.need + ' XP', W - 8, y - 4);

      if (state.pending > 0) {
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffd166';
        ctx.fillText('待选强化 ×' + state.pending, W / 2, y - 4);
      }

      ctx.restore();
    },
  };

  G.log('[星际突袭] 经验与等级系统就绪');
})();
