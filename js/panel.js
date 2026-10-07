/* ============================================================
   星际突袭 · 战斗面板  js/panel.js
   ------------------------------------------------------------
   把关键数值可视化，位置固定在左上角、Boss 血条下方，
   刻意避开屏幕底部的等级/经验条与玩家的活动区域：

        伤害 / 暴击率 / 暴击伤害 / 攻速 / 弹道 / 秒伤 / 命中…

   **自适应**：小窗口（横屏手机等）下面板会先等比压扁行高，
   还是放不下就按"重要性从低到高"截断尾部几行，
   保证它永远不会盖住底部经验条、也不会压到玩家的默认站位。
   ============================================================ */
'use strict';

(function () {
  const G = (window.Game = window.Game || {});

  // 布局常量（改这里就能调整面板位置/大小）
  const X = 10;
  const Y = 118;        // Boss 血条在 y≈90~104，这里从 118 开始，不重叠
  const W = 154;
  const ROW_H = 16;     // 基准行高（放得下时用它）
  const MIN_ROW_H = 11; // 压扁的下限，再小就看不清了
  const PAD = 8;

  G.panel = {
    X, Y, W, ROW_H,

    /** 当前面板数据（也是测试读取的接口）
     *  顺序 = 重要性：越靠前越不会被小窗口截掉 */
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

      /* ---- 核心 6 行：永远显示 ---- */
      out.push({ label: '伤害', value: (S.damage + hitBonus).toFixed(1) });
      out.push({ label: '暴击率', value: Math.round((S.critChance || 0) * 100) + '%' });
      out.push({ label: '暴击伤害', value: Math.round((S.critMul || 1) * 100) + '%' });
      out.push({ label: '攻速', value: (1 / cd).toFixed(1) + '/s' });
      out.push({ label: '弹道', value: '×' + lanes });
      out.push({ label: '秒伤', value: String(Math.round(dps)) });

      /* ---- 击破奖励：拿过 Boss 之后才显示 ---- */
      if (S.bossKills > 0) {
        out.push({ label: '击破奖励', value: '×' + (S.breakBonus || 1).toFixed(0) });
      }

      if (S.hitDamage > 0 && G.upgrades) {
        out.push({ label: '累计命中', value: String(G.upgrades.state.hits) });
        out.push({ label: '命中加成', value: '+' + hitBonus.toFixed(1) });
      }

      // 舰队流：有僚机时才显示
      if ((S.drones || 0) > 0) {
        out.push({ label: '僚机', value: '×' + S.drones });
      }

      // 辐射流（持续伤害）：拿到辐射源才显示
      if (S.dotActive) {
        out.push({ label: '持续伤害', value: (S.dotPerStack || 0).toFixed(2) + '/层' });
        out.push({ label: '每次叠层', value: '×' + (S.dotPerHit || 0) });
        out.push({ label: '层数上限', value: String(S.dotMax || 0) });
        if (S.dotCritChance > 0 || S.dotCritMul > 1.5) {
          out.push({
            label: 'DOT 暴击',
            value: Math.round((S.dotCritChance || 0) * 100) + '% / ' +
              Math.round((S.dotCritMul || 1) * 100) + '%',
          });
        }
      }

      return out;
    },

    /**
     * 根据当前画面高度算出版面：先压行高，再截断尾部行。
     * @returns {{rows:Array, rowH:number, h:number, clipped:number, hidden:number}}
     */
    layout() {
      const all = this.rows();
      const H = G.H || 800;

      // 可用高度：上不越 Boss 血条，下不压到底部经验条，也不占超过半屏
      const bottomLimit = Math.min(H - 68, H * 0.62);
      const limit = Math.max(60, bottomLimit - Y);

      let rowH = ROW_H;
      let rows = all;

      // ① 行高不变时放不下 → 等比压扁
      if (PAD * 2 + all.length * rowH > limit) {
        rowH = Math.max(MIN_ROW_H, (limit - PAD * 2) / all.length);
      }

      // ② 压到底限还是放不下 → 按重要度截断尾部
      const maxRows = Math.floor((limit - PAD * 2) / rowH);
      let hidden = 0;
      if (all.length > maxRows && maxRows >= 4) {
        rows = all.slice(0, maxRows);
        hidden = all.length - rows.length;
      }

      const h = PAD * 2 + rows.length * rowH;
      return { rows, rowH, h, all: all.length, hidden };
    },

    /** 面板总高度（含内边距） */
    height() {
      return this.layout().h;
    },

    draw() {
      if (G.state === 'menu') return;

      const ctx = G.ctx;
      const L = this.layout();
      const rows = L.rows;
      const rowH = L.rowH;
      const h = L.h;

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

      // 字随行高一起缩，压扁时也读得清
      const fs = rowH >= 15 ? 11 : rowH >= 13 ? 10 : 9;
      ctx.font = '600 ' + fs + 'px "Segoe UI", "Microsoft YaHei", sans-serif';
      ctx.textBaseline = 'middle';

      for (let i = 0; i < rows.length; i++) {
        const ry = Y + PAD + i * rowH + rowH / 2;

        ctx.textAlign = 'left';
        ctx.fillStyle = '#7fa8cc';
        ctx.fillText(rows[i].label, X + 10, ry);

        ctx.textAlign = 'right';
        ctx.fillStyle = '#dcefff';
        ctx.fillText(rows[i].value, X + W - 9, ry);
      }

      // 被截断时给个提示，免得玩家以为数值消失了
      if (L.hidden > 0) {
        ctx.textAlign = 'right';
        ctx.fillStyle = '#5d7fa3';
        ctx.font = '600 ' + Math.max(7, fs - 2) + 'px "Segoe UI", "Microsoft YaHei", sans-serif';
        ctx.fillText('+' + L.hidden + ' 项（屏幕偏小）', X + W - 9, Y + h - PAD / 2 - 1);
      }

      ctx.restore();
    },
  };

  G.log && G.log('[星际突袭] 战斗面板就绪');
})();
