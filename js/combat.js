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
  const state = { dps: 0, accum: 0, dotAccum: 0, timer: 0, ringT: 0 };

  /**
   * 圆形 / 扫掠碰撞检测
   *
   * 子弹带 prevX/prevY 时，用「上一帧位置 → 当前帧位置」的线段与目标圆求最近点；
   * 否则退回普通圆形重叠。轨道弹二级能到 3040px/s，16ms 一帧跨 48.6px，
   * 只检查终点会从敌人一侧跳到另一侧、整颗穿过去。
   */
  function overlap(a, b) {
    if (!a || !b) return false;

    const rr = (a.r || 0) + (b.r || 0);
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    if (dx * dx + dy * dy <= rr * rr) return true;

    if (!Number.isFinite(a.prevX) || !Number.isFinite(a.prevY)) return false;

    const sx = a.prevX;
    const sy = a.prevY;
    const vx = a.x - sx;
    const vy = a.y - sy;
    const len2 = vx * vx + vy * vy;
    if (len2 <= 1e-9) return false;

    const t = Math.max(0, Math.min(1,
      ((b.x - sx) * vx + (b.y - sy) * vy) / len2));
    const cx = sx + vx * t;
    const cy = sy + vy * t;
    const qx = cx - b.x;
    const qy = cy - b.y;
    return qx * qx + qy * qy <= rr * rr;
  }

  /** 记录一次命中：用于飘字与秒伤统计 */
  function recordDamage(x, y, amount, isCrit, key, type) {
    // 核心过载是 Boss 的自毁，不是玩家输出；要显示飘字，但不能把左上角
    // 「秒伤」抬成天文数字。其余类型都计入玩家 DPS。
    if (type !== 'overload') state.accum += amount;
    if (type === 'dot') state.dotAccum += amount;

    const rec = dmgAcc.get(key);
    if (rec) {
      rec.sum += amount;
      rec.crit = rec.crit || isCrit;
      rec.x = x;
      rec.y = y;
    } else {
      dmgAcc.set(key, { x, y, sum: amount, crit: isCrit, type: type || 'bullet', t: 0.34 });
    }
  }

  /** 聚合到时间就弹出一次飘字 */
  function flushDamage(dt) {
    dmgAcc.forEach((rec, key) => {
      rec.t -= dt;
      if (rec.t > 0) return;

      if (G.particles && G.particles.text) {
        // 伤害类型各有各的颜色，让玩家一眼看出这一下是什么打出来的
        const type = rec.type;
        const dot = type === 'dot';
        const over = type === 'overload';
        const color = dot ? (rec.crit ? '#d8ff8a' : '#9ae66e')
          : over ? (rec.crit ? '#ffc09a' : '#ff8a5c')
            : (rec.crit ? '#ffd166' : '#eaf6ff');
        const size = dot ? (rec.crit ? 16 : 12)
          : over ? 11
            : (rec.crit ? 17 : 13);

        G.particles.text(
          rec.x,
          rec.y - 18,
          (dot ? '☣' : over ? '⏱' : '') + String(Math.round(rec.sum)),
          color,
          size
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

  /**
   * 等离子弹溅射：对目标以外的敌人造成范围伤害
   *
   * ⚠️ 和 upgrades.areaDamage 一样，必须**先快照、再结算**：
   *    E.damage() 会把敌人从列表里移除，而击杀会触发爆裂弹的 onKill，
   *    一次连环爆炸能让列表在中途缩短好几格，用下标继续遍历就会
   *    读到 undefined 崩在 en.uid 上。
   */
  function splash(uid, x, y, radius, dmg) {
    const E = G.enemies;
    if (!E) return;

    const hit = [];
    for (let j = 0; j < E.list.length; j++) {
      const en = E.list[j];
      if (!en) continue;
      if (en.uid === uid) continue;
      if (Math.hypot(en.x - x, en.y - y) <= radius + en.r) hit.push(en);
    }

    for (let k = 0; k < hit.length; k++) {
      const en = hit[k];
      if (en.alive === false || en.hp <= 0) continue;
      const idx = E.list.indexOf(en);
      if (idx !== -1) {
        if (G.combat && G.combat.record) {
          G.combat.record(en.x, en.y, dmg, false, 'plasma' + en.uid, 'secondary');
        }
        E.damage(idx, dmg, { depth: 1 });
      }
    }
  }

  /**
   * 子弹附加特效：溅射 / 霜冻 / 电弧
   * @param {boolean} isBoss Boss 不吃霜冻减速，但等离子会炸到身边小怪、电弧会跳向小怪
   */
  function bulletEffects(e, S, x, y, isBoss) {
    if (!e) return;

    if (S.splash > 0) {
      const r = 34 + 12 * S.splash;
      // 溅射光环节流：避免高射速下满屏紫圈盖住弹幕
      if (G.particles && state.ringT <= 0) {
        G.particles.ring(x, y, '#c98cff', 5, 240);
        state.ringT = 0.18;
      }
      // Boss 没有 uid：不排除任何小怪；普通敌机排除刚刚被直击的主目标
      splash(isBoss ? null : e.uid, x, y, r, 0.45 * S.splash);
    }

    // Boss 保持霜冻免疫（它的运动/阶段逻辑和普通敌机完全不同）
    if (S.frost > 0 && !isBoss) {
      e.frostT = 4;
      e.frostMul = Math.max(0.2, 1 - 0.18 * S.frost);
      if (G.particles && Math.random() < 0.4) {
        G.particles.spark(x, y, '#9fe8ff');
      }
    }

    if (S.arc > 0 && G.upgrades && G.upgrades.chainLightning) {
      G.upgrades.chainLightning(x, y, 1, 1, 0.4 * S.arc,
        isBoss ? null : e.uid);
    }
  }

  G.combat = {
    state,

    /** 供 boss.js 等模块上报伤害（飘字 + 秒伤统计）
     *  @param {string} [type] 'dot' 表示持续伤害，飘字用绿色且加 ☣ 前缀 */
    record(x, y, amount, isCrit, key, type) {
      recordDamage(x, y, amount, isCrit, key || 'misc', type);
    },

    reset() {
      dmgAcc.clear();
      state.dps = 0;
      state.accum = 0;
      state.dotAccum = 0;
      state.timer = 0;
      state.ringT = 0;
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
          if (!b) { B.friendly.splice(i, 1); continue; }
          let consumed = false;

          for (let j = enemies.length - 1; j >= 0; j--) {
            const e = enemies[j];
            if (!e) continue;  // 连环击杀会递归缩短列表，旧下标可能已越界
            if (!overlap(b, e)) continue;

            // 穿透弹：同一颗子弹不重复命中同一个敌人
            if (b.hits && b.hits.indexOf(e.uid) !== -1) continue;

            // 伤害 = 子弹基础伤害 × 增益倍率 + 命中积累 × 暴击
            let dmg = b.damage || 1;
            if (G.upgrades && G.upgrades.damageMultiplier) {
              dmg *= G.upgrades.damageMultiplier(e);
            }
            // 命中积累：僚机子弹自带 bonus（本体的 25%），其余用本体的
            if (b.bonus != null) {
              dmg += b.bonus;
            } else if (G.upgrades && G.upgrades.hitBonus) {
              dmg += G.upgrades.hitBonus();
            }

            // 暴击率：子弹自带就用子弹的（僚机半继承），否则用本体的
            const critChance = (b.critChance === undefined || b.critChance === null)
              ? (S.critChance || 0)
              : b.critChance;
            const isCrit = critChance > 0 && Math.random() < critChance;
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

          // 没打到小怪，试试 Boss；直击成功后同样派发等离子 / 电弧附加效果
          if (!consumed && G.boss && G.boss.tryHit && G.boss.tryHit(b)) {
            const bossTarget = G.boss.state && G.boss.state.boss;
            bulletEffects(bossTarget || {}, S, b.x, b.y, true);
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
            if (!b) { B.hostile.splice(i, 1); continue; }
            if (!overlap(b, P)) continue;

            B.hostile.splice(i, 1);
            P.hit();

            if (G.state !== 'playing') break;
          }
        }

        if (G.state === 'playing' && enemies) {
          // 先快照撞到玩家的敌机，再逐个重查位置。
          // E.damage() 的 onKill 可能递归炸掉别的敌人并 splice 列表；
          // 直接拿数字下标继续循环会越界或重复处理移位后的对象。
          const bodyHits = [];
          for (let j = 0; j < enemies.length; j++) {
            const e = enemies[j];
            if (e && overlap(e, P)) bodyHits.push(e);
          }

          for (let k = 0; k < bodyHits.length; k++) {
            const e = bodyHits[k];
            if (e.alive === false) continue;
            const idx = enemies.indexOf(e);
            if (idx === -1) continue;

            E.damage(idx, 9999, { depth: 0 });
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
      if (state.ringT > 0) state.ringT -= dt;
    },
  };

  G.log('[星际突袭] 战斗判定就绪');
})();
