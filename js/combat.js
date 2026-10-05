/* ============================================================
   星际突袭 · 战斗判定  js/combat.js
   ------------------------------------------------------------
   每帧处理四类碰撞：
     ① 我方子弹 × 敌机        → 扣血 / 击杀 / 加分
     ② 敌方子弹 × 玩家        → 扣命 / 破盾
     ③ 敌机机身 × 玩家        → 同归于尽
     ④ Boss  × 玩家 / 子弹    → 交给 boss.js 实现

   另外负责「伤害可视化」：
     · 飘字：按敌机聚合，每 0.34 秒弹一次，避免弹幕流糊屏
     · 秒伤：0.25 秒结算一次并做平滑，供面板显示
   ------------------------------------------------------------
   对外接口：
     Game.combat.update(dt)
     Game.combat.state.dps   当前秒伤
     Game.combat.reset()
   ============================================================ */
'use strict';

(function () {
  const G = (window.Game = window.Game || {});

  const dmgAcc = new Map();   // key -> { x, y, sum, crit, t }
  const state = { dps: 0, accum: 0, timer: 0 };

  /** 圆形碰撞检测 */
  function overlap(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const rr = a.r + b.r;
    return dx * dx + dy * dy <= rr * rr;
  }

  /** 记录一次命中：用于飘字与秒伤统计 */
  function recordDamage(x, y, amount, isCrit, key) {
    state.accum += amount;

    const rec = dmgAcc.get(key);
    if (rec) {
      rec.sum += amount;
      rec.crit = rec.crit || isCrit;
      rec.x = x;
      rec.y = y;
    } else {
      dmgAcc.set(key, { x, y, sum: amount, crit: isCrit, t: 0.34 });
    }
  }

  /** 聚合到时间就弹出一次飘字 */
  function flushDamage(dt) {
    dmgAcc.forEach((rec, key) => {
      rec.t -= dt;
      if (rec.t > 0) return;

      if (G.particles && G.particles.text) {
        G.particles.text(
          rec.x,
          rec.y - 18,
          String(Math.round(rec.sum)),
          rec.crit ? '#ffd166' : '#eaf6ff',
          rec.crit ? 17 : 13
        );
      }
      dmgAcc.delete(key);
    });
  }

  /** 秒伤：每 0.25 秒结算一次并做指数平滑 */
  function updateDps(dt) {
    state.timer -= dt;
    if (state.timer > 0) return;

    const inst = state.accum / 0.25;
    state.dps += (inst - state.dps) * 0.5;
    state.accum = 0;
    state.timer = 0.25;
  }

  /** 等离子弹溅射：对目标以外的敌人造成范围伤害 */
  function splash(uid, x, y, radius, dmg) {
    const E = G.enemies;
    if (!E) return;

    for (let j = E.list.length - 1; j >= 0; j--) {
      const en = E.list[j];
      if (en.uid === uid) continue;
      if (Math.hypot(en.x - x, en.y - y) <= radius + en.r) {
        E.damage(j, dmg, { depth: 1 });
      }
    }
  }

  /** 子弹附加特效：溅射 / 霜冻 / 电弧 / 剧毒 */
  function bulletEffects(e, S, x, y) {
    if (S.splash > 0) {
      const r = 34 + 12 * S.splash;
      if (G.particles) G.particles.ring(x, y, '#c98cff', 6, 300);
      splash(e.uid, x, y, r, 0.45 * S.splash);
    }

    if (S.frost > 0) {
      e.frostT = 4;
      e.frostMul = Math.max(0.2, 1 - 0.18 * S.frost);
      if (G.particles && Math.random() < 0.4) {
        G.particles.spark(x, y, '#9fe8ff');
      }
    }

    if (S.arc > 0 && G.upgrades && G.upgrades.chainLightning) {
      G.upgrades.chainLightning(x, y, 1, 1, 0.4 * S.arc);
    }

    if (S.venom > 0) {
      e.venomT = Math.min(6, e.venomT + 3);
      e.venomDps = (e.venomDps || 0) + 0.22 * S.venom;
      if (G.particles && Math.random() < 0.4) {
        G.particles.spark(x, y, '#9ae66e');
      }
    }
  }

  G.combat = {
    state,

    /** 供 boss.js 等模块上报伤害（飘字 + 秒伤统计） */
    record(x, y, amount, isCrit, key) {
      recordDamage(x, y, amount, isCrit, key || 'misc');
    },

    reset() {
      dmgAcc.clear();
      state.dps = 0;
      state.accum = 0;
      state.timer = 0;
    },

    update(dt) {
      dt = dt || 0.016;

      const B = G.bullets;
      const P = G.player;
      const E = G.enemies;
      const enemies = E ? E.list : null;
      const S = G.stats || {};

      /* ---------- ① 我方子弹 × 敌机 ---------- */
      if (B && enemies) {
        for (let i = B.friendly.length - 1; i >= 0; i--) {
          const b = B.friendly[i];
          let consumed = false;

          for (let j = enemies.length - 1; j >= 0; j--) {
            const e = enemies[j];
            if (!overlap(b, e)) continue;

            // 穿透弹：同一颗子弹不重复命中同一个敌人
            if (b.hits && b.hits.indexOf(e.uid) !== -1) continue;

            // 伤害 = 子弹基础伤害 × 增益倍率 + 命中积累 × 暴击
            let dmg = b.damage || 1;
            if (G.upgrades && G.upgrades.damageMultiplier) {
              dmg *= G.upgrades.damageMultiplier(e);
            }
            if (G.upgrades && G.upgrades.hitBonus) {
              dmg += G.upgrades.hitBonus();
            }

            const isCrit = S.critChance > 0 && Math.random() < S.critChance;
            if (isCrit) dmg *= (S.critMul || 2);

            if (G.particles && G.particles.spark) {
              G.particles.spark(b.x, b.y, isCrit ? '#ffd166' : e.color);
            }

            recordDamage(e.x, e.y, dmg, isCrit, 'e' + e.uid);
            E.damage(j, dmg, { depth: 0 });

            // 命中积累：每一次命中都算数
            if (G.upgrades && G.upgrades.addHit) G.upgrades.addHit(1);

            // 子弹附加特效（溅射/霜冻/电弧/剧毒）
            bulletEffects(e, S, b.x, b.y);

            if (b.pierce > 0) {
              b.pierce--;
              if (!b.hits) b.hits = [];
              b.hits.push(e.uid);
            } else {
              consumed = true;
            }
            break;
          }

          // 没打到小怪，试试 Boss
          if (!consumed && G.boss && G.boss.tryHit && G.boss.tryHit(b)) {
            consumed = true;
          }

          if (consumed) B.friendly.splice(i, 1);
        }
      }

      /* ---------- ② ③ ④ ---------- */
      if (P && P.alive) {
        if (B) {
          for (let i = B.hostile.length - 1; i >= 0; i--) {
            const b = B.hostile[i];
            if (!overlap(b, P)) continue;

            B.hostile.splice(i, 1);
            P.hit();

            if (G.state !== 'playing') break;
          }
        }

        if (G.state === 'playing' && enemies) {
          for (let j = enemies.length - 1; j >= 0; j--) {
            const e = enemies[j];
            if (!overlap(e, P)) continue;

            E.damage(j, 9999, { depth: 0 });
            P.hit();

            if (G.state !== 'playing') break;
          }
        }

        if (G.state === 'playing' && G.boss && G.boss.collidePlayer) {
          G.boss.collidePlayer(P);
        }
      }

      /* ---------- 伤害可视化 ---------- */
      flushDamage(dt);
      updateDps(dt);
    },
  };

  console.log('[星际突袭] 战斗判定就绪');
})();
