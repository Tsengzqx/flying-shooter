/* ============================================================
   星际突袭 · 战斗面板  js/panel.js
   ------------------------------------------------------------
   把关键数值可视化，位置固定在左上角、Boss 血条下方，
   刻意避开屏幕底部的等级/经验条，互不遮挡：

       伤害 / 暴击率 / 暴击伤害 / 攻速 / 弹道 / 秒伤 / 命中…

   所有数据都从 Game.stats、Game.combat、Game.progress 现算，
   不缓存任何东西，所以永远和实际战斗一致。
   ============================================================ */
'use strict';

(function () {
  const G = (window.Game = window.Game || {});

  // 布局常量（改这里就能调整面板位置/大小）
  const X = 10;
  const Y = 118;        // Boss 血条在 y≈90~104，这里从 118 开始，不重叠
  const W = 154;
  const ROW_H = 16;
  const PAD = 8;

  G.panel = {
    X, Y, W, ROW_H,

    /** 当前面板数据（也是测试读取的接口） */
    rows() {
      const S = G.stats || {};
      const P = G.player;
      const out = [];

      const cd = (P && P.effectiveCd) ? P.effectiveCd() : 0.155;
      const hitBonus = (G.upgrades && G.upgrades.hitBonus) ? G.upgrades.hitBonus() : 0;
      const dps = (G.combat && G.combat.state) ? G.combat.state.dps : 0;

      const lanes = 2 + (S.extraBullets || 0) +
        (S.sideGun || 0) * 2 +
        (S.rearGun || 0);

      out.push({ label: '伤害', value: (S.damage + hitBonus).toFixed(1) });
      out.push({ label: '暴击率', value: Math.round((S.critChance || 0) * 100) + '%' });
      out.push({ label: '暴击伤害', value: Math.round((S.critMul || 1) * 100) + '%' });
      out.push({ label: '攻速', value: (1 / cd).toFixed(1) + '/s' });
      out.push({ label: '弹道', value: '×' + lanes });
      out.push({ label: '秒伤', value: String(Math.round(dps)) });

      if (S.hitDamage > 0 && G.upgrades) {
        out.push({ label: '累计命中', value: String(G.upgrades.state.hits) });
        out.push({ label: '命中加成', value: '+' + hitBonus.toFixed(1) });
      }

      return out;
    },

    /** 面板总高度（含内边距） */
    height() {
      return PAD * 2 + this.rows().length * ROW_H;
    },

    draw() {
      if (G.state === 'menu') return;

      const ctx = G.ctx;
      const rows = this.rows();
      const h = PAD * 2 + rows.length * ROW_H;

      ctx.save();

      // 背板
      ctx.beginPath();
      ctx.rect(X, Y, W, h);
      ctx.fillStyle = 'rgba(7,14,28,0.55)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(120,190,255,0.22)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // 左侧装饰色条
      ctx.fillStyle = 'rgba(110,231,168,0.75)';
      ctx.fillRect(X, Y, 3, h);

      ctx.font = '600 11px "Segoe UI", "Microsoft YaHei", sans-serif';
      ctx.textBaseline = 'middle';

      for (let i = 0; i < rows.length; i++) {
        const ry = Y + PAD + i * ROW_H + ROW_H / 2;

        ctx.textAlign = 'left';
        ctx.fillStyle = '#7fa8cc';
        ctx.fillText(rows[i].label, X + 10, ry);

        ctx.textAlign = 'right';
        ctx.fillStyle = '#dcefff';
        ctx.fillText(rows[i].value, X + W - 9, ry);
      }

      ctx.restore();
    },
  };

  console.log('[星际突袭] 战斗面板就绪');
})();
