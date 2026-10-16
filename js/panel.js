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

      // 弹道数必须和 player.shootVolley 的算法一致（含 frontLanes / mirror / 散射）
      const lanes = (P && P.volleyCount)
        ? P.volleyCount(S)
        : 2 + (S.extraBullets || 0) + (S.sideGun || 0) * 2 + (S.rearGun || 0);

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
        if (S.dotBossPct > 0) {
          const boss = G.boss && G.boss.state.boss;
          const rate = boss && G.upgrades ? G.upgrades.dotBossRate(boss) : S.dotBossPct;
          out.push({ label: 'Boss 侵蚀', value: (boss ? '' : '≤') + (rate * 100).toFixed(2) + '%/s' });
        }
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
     * 根据当前画面高度算出版面：先压行高，再截断尾部行；
     * 屏幕实在太矮就整体上移，再不行就干脆不画。
     * @returns {{rows:Array, rowH:number, h:number, all:number,
     *            hidden:number, y:number, visible:boolean}}
     */
    layout() {
      const all = this.rows();
      const H = G.H || 800;

      /* 下边界要同时满足三件事：
         ① 不压到底部经验条（H-68）
         ② 不占超过半屏（H*0.62）
         ③ 不盖住玩家的默认站位（H - max(84, H*0.15)）
         矮屏时 ③ 才是真正的约束 —— H-84 比 H-68 更靠上，
         只按 ①② 算的话面板会正好压在玩家身上。 */
      const playerY = H - Math.max(84, H * 0.15);
      const bottomLimit = Math.min(H - 68, H * 0.62, playerY - 6);

      // Y 是固定的面板顶边。屏幕很矮时 bottomLimit - Y 会不够用，
      // 这时先把面板整体上移（不越过顶栏），而不是硬挤下去压住玩家。
      let y = Y;
      const minY = 36;
      const minNeed = PAD * 2 + 4 * MIN_ROW_H;    // 至少显示 4 行的最小高度
      let avail = bottomLimit - y;

      if (avail < minNeed) {
        y = Math.max(minY, bottomLimit - minNeed);
        avail = bottomLimit - y;
      }

      // 连"1 行 + 内边距"都放不下：直接不画，好过糊在屏幕中间
      if (avail < PAD * 2 + MIN_ROW_H || avail <= 0) {
        return {
          rows: [], rowH: MIN_ROW_H, h: 0,
          all: all.length, hidden: all.length, y, visible: false,
        };
      }

      let rowH = ROW_H;
      let rows = all;

      // ① 行高不变时放不下 → 等比压扁
      if (PAD * 2 + all.length * rowH > avail) {
        rowH = Math.max(MIN_ROW_H, (avail - PAD * 2) / all.length);
      }

      // ② 压到底限还是放不下 → 按重要度截断尾部
      const maxRows = Math.floor((avail - PAD * 2) / rowH);
      let hidden = 0;
      if (all.length > maxRows && maxRows >= 1) {
        rows = all.slice(0, maxRows);
        hidden = all.length - rows.length;
      }

      const h = PAD * 2 + rows.length * rowH;
      return { rows, rowH, h, all: all.length, hidden, y, visible: true };
    },

    /** 面板总高度（含内边距） */
    height() {
      return this.layout().h;
    },

    draw() {
      if (G.state === 'menu') return;

      const L = this.layout();
      if (!L.visible) return;          // 屏幕太矮，宁可不画

      const ctx = G.ctx;
      const X0 = X;
      const Y0 = L.y;
      const rows = L.rows;
      const rowH = L.rowH;
      const h = L.h;

      ctx.save();

      // 背板
      ctx.beginPath();
      ctx.rect(X0, Y0, W, h);
      ctx.fillStyle = 'rgba(7,14,28,0.55)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(120,190,255,0.22)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // 左侧装饰色条
      ctx.fillStyle = 'rgba(110,231,168,0.75)';
      ctx.fillRect(X0, Y0, 3, h);

      // 字随行高一起缩，压扁时也读得清
      const fs = rowH >= 15 ? 11 : rowH >= 13 ? 10 : 9;
      ctx.font = '600 ' + fs + 'px "Segoe UI", "Microsoft YaHei", sans-serif';
      ctx.textBaseline = 'middle';

      for (let i = 0; i < rows.length; i++) {
        const ry = Y0 + PAD + i * rowH + rowH / 2;

        ctx.textAlign = 'left';
        ctx.fillStyle = '#7fa8cc';
        ctx.fillText(rows[i].label, X0 + 10, ry);

        ctx.textAlign = 'right';
        ctx.fillStyle = '#dcefff';
        ctx.fillText(rows[i].value, X0 + W - 9, ry);
      }

      // 被截断时给个提示，免得玩家以为数值消失了
      if (L.hidden > 0) {
        ctx.textAlign = 'right';
        ctx.fillStyle = '#5d7fa3';
        ctx.font = '600 ' + Math.max(7, fs - 2) + 'px "Segoe UI", "Microsoft YaHei", sans-serif';
        ctx.fillText('+' + L.hidden + ' 项（屏幕偏小）', X0 + W - 9, Y0 + h - PAD / 2 - 1);
      }

      ctx.restore();
    },
  };

  G.log && G.log('[星际突袭] 战斗面板就绪');
})();
