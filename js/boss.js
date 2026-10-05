/* ============================================================
   星际突袭 · Boss 战  js/boss.js
   ------------------------------------------------------------
   每 5 关（第 5/10/15… 关）由 enemies.js 调 start(level) 触发。
   三个阶段（按剩余血量切换）：
     一阶段  > 60%   瞄准扇形弹 + 环形弹
     二阶段  > 28%   追加顶部弹雨，射速加快
     三阶段  <= 28%  追加旋转螺旋弹幕，并定期召唤小怪
   ------------------------------------------------------------
   对外接口：
     Game.boss.start(level) / .reset() / .active()
     Game.boss.update(dt) / .draw() / .drawUI()
     Game.boss.tryHit(bullet)          供 combat.js 调用
     Game.boss.collidePlayer(player)   供 combat.js 调用
     Game.boss.areaDamage(x, y, r, dmg) 供 upgrades.js 的爆裂弹调用
   ============================================================ */
'use strict';

(function () {
  const G = (window.Game = window.Game || {});

  const state = { boss: null };

  const NAMES = ['钢铁蜂巢', '虚空掠夺者', '熔核巨舰', '深空仲裁者', '终焉之影'];
  const ENTER_Y = 112;

  /* ============================================================
     生成
     ============================================================ */
  function start(level) {
    // 基础曲线：前 10 关温和，之后连续指数增长
    const base = level <= 10
      ? 160 + level * 60
      : (160 + 10 * 60) * Math.pow(1.20, level - 10);

    // 再叠加"每 10 关一次"的整体台阶（与 enemies.js 共用同一套规则）
    const tier = (G.enemies && G.enemies.tierMul) ? G.enemies.tierMul(level) : 1;
    const hp = Math.round(base * tier);

    state.boss = {
      level,
      name: NAMES[Math.floor(level / 5 - 1) % NAMES.length] || '深空要塞',
      x: G.W / 2,
      y: -96,
      r: 52,
      hp,
      maxHp: hp,
      t: 0,
      phase: 1,
      entering: true,
      patternIdx: -1,
      fireCd: 1.4,
      spiralT: 0,
      spiralTick: 0,
      spiralA: 0,
      minionCd: 5,
      hitFlash: 0,
      dead: false,
      deathT: 0,
      sway: Math.random() * 6.28,
    };

    if (G.audio && G.audio.bossWarn) G.audio.bossWarn();
    if (G.shake) G.shake.add(9);
  }

  function active() {
    return !!state.boss;
  }

  /** 是否正处于"已被击破、正在放爆炸演出"的阶段 */
  function dying() {
    return !!state.boss && state.boss.dead;
  }

  /* ============================================================
     弹幕
     ============================================================ */
  function aimed(bs, count, spread, speed) {
    const B = G.bullets;
    const P = G.player;
    if (!B || !P) return;

    for (let i = 0; i < count; i++) {
      const off = (i - (count - 1) / 2) * spread;
      const v = B.aim(bs.x, bs.y + 22, P.x, P.y, speed, off);
      B.spawnEnemy(bs.x, bs.y + 22, v.vx, v.vy, { r: 6 });
    }
    if (G.audio) G.audio.enemyShoot();
  }

  function radial(bs, count, speed, offset) {
    const B = G.bullets;
    if (!B) return;

    for (let i = 0; i < count; i++) {
      const a = offset + (i * Math.PI * 2) / count;
      B.spawnEnemy(bs.x, bs.y, Math.cos(a) * speed, Math.sin(a) * speed, { r: 5.5 });
    }
    if (G.audio) G.audio.enemyShoot();
  }

  function rain(bs, count, speed) {
    const B = G.bullets;
    if (!B) return;

    for (let i = 0; i < count; i++) {
      const x = bs.x + (i - (count - 1) / 2) * 46;
      const a = Math.PI / 2 + (Math.random() - 0.5) * 0.55;
      B.spawnEnemy(x, bs.y + 34, Math.cos(a) * speed * 0.55, Math.sin(a) * speed, { r: 5.5 });
    }
    if (G.audio) G.audio.enemyShoot();
  }

  function firePattern(bs) {
    const ratio = bs.hp / bs.maxHp;
    const pools = ratio > 0.6
      ? ['spread', 'radial']
      : ratio > 0.28
        ? ['spread', 'radial', 'rain']
        : ['rain', 'spiral', 'radial', 'spread'];

    bs.patternIdx = (bs.patternIdx + 1) % pools.length;
    const name = pools[bs.patternIdx];
    const sp = 190 + bs.phase * 26;

    if (name === 'spread') {
      aimed(bs, 3 + bs.phase, 0.22, sp);
      bs.fireCd = 1.55 - bs.phase * 0.22;
    } else if (name === 'radial') {
      radial(bs, 10 + bs.phase * 4, sp * 0.85, bs.t);
      bs.fireCd = 1.75 - bs.phase * 0.22;
    } else if (name === 'rain') {
      rain(bs, 7 + bs.phase, sp * 0.9);
      bs.fireCd = 1.35 - bs.phase * 0.18;
    } else {
      // 螺旋：接下来 1.5~2.2 秒持续吐弹
      bs.spiralT = 1.5 + bs.phase * 0.25;
      bs.spiralTick = 0;
      bs.spiralA = bs.t;
      bs.fireCd = 2.5;
    }
  }

  /* ============================================================
     伤害与死亡
     ============================================================ */
  function applyDamage(bs, baseDmg, x, y) {
    const S = G.stats || {};

    let dmg = baseDmg || 1;
    if (G.upgrades && G.upgrades.damageMultiplier) {
      dmg *= G.upgrades.damageMultiplier(bs);
    }
    if (G.upgrades && G.upgrades.hitBonus) {
      dmg += G.upgrades.hitBonus();
    }

    const isCrit = S.critChance > 0 && Math.random() < S.critChance;
    if (isCrit) dmg *= (S.critMul || 2);

    bs.hp -= dmg;
    bs.hitFlash = 1;

    // 命中积累
    if (G.upgrades && G.upgrades.addHit) G.upgrades.addHit(1);

    // 伤害飘字与秒伤统计
    if (G.combat && G.combat.record) G.combat.record(x, y, dmg, isCrit, 'boss');

    if (G.particles) {
      G.particles.spark(x, y, isCrit ? '#ffd166' : '#ff9a3a');
      if (isCrit) G.particles.text(x, y - 12, '暴击 ' + dmg.toFixed(1), '#ffd166', 15);
    }
    if (G.audio) {
      if (isCrit) G.audio.hit();
      else G.audio.bossHit();
    }

    if (bs.hp <= 0 && !bs.dead) kill(bs);
  }

  function kill(bs) {
    bs.dead = true;
    bs.deathT = 1.15;
    bs.hp = 0;

    const S = G.stats || {};
    const mul = (G.upgrades && G.upgrades.scoreMultiplier)
      ? G.upgrades.scoreMultiplier()
      : (S.scoreMul || 1);

    G.score += Math.round((3000 + bs.level * 600) * mul);
    G.hud.invalidate();

    // Boss 经验
    if (G.progress && G.progress.addXp) G.progress.addXp(60 + bs.level * 5);

    if (G.audio) G.audio.bossDie();
    if (G.shake) G.shake.add(22);
    if (G.particles) {
      G.particles.burst(bs.x, bs.y, { color: '#ffd166', count: 50, speed: 420 });
      G.particles.text(bs.x, bs.y - 46, 'BOSS 击破 !', '#ffd166', 26);
    }

    // 掉落三个补给
    if (G.powerups && G.powerups.spawn) {
      const types = ['spread', 'rapid', 'shield'];
      for (let i = 0; i < 3; i++) {
        G.powerups.spawn(types[i], bs.x + (i - 1) * 48, bs.y);
      }
    }
  }

  /* ============================================================
     逐帧更新
     ============================================================ */
  function update(dt) {
    const bs = state.boss;
    if (!bs) return;

    bs.t += dt;
    if (bs.hitFlash > 0) bs.hitFlash = Math.max(0, bs.hitFlash - dt * 5);

    /* ---- 死亡爆炸演出 ---- */
    if (bs.dead) {
      bs.deathT -= dt;

      if (Math.random() < dt * 22) {
        const ox = (Math.random() - 0.5) * 130;
        const oy = (Math.random() - 0.5) * 86;
        const colors = ['#ffd166', '#ff8a3a', '#ff5c7a'];
        if (G.particles) {
          G.particles.burst(bs.x + ox, bs.y + oy, {
            color: colors[(Math.random() * colors.length) | 0],
            count: 20,
            speed: 330,
          });
        }
      }

      if (bs.deathT <= 0) {
        if (G.particles) {
          G.particles.burst(bs.x, bs.y, { color: '#fff3c4', count: 70, speed: 540 });
          G.particles.ring(bs.x, bs.y, '#ffd166', 22, 720);
        }
        if (G.shake) G.shake.add(24);
        state.boss = null;
      }
      return;
    }

    /* ---- 入场 ---- */
    if (bs.entering) {
      bs.y += 64 * dt;
      if (bs.y >= ENTER_Y) {
        bs.y = ENTER_Y;
        bs.entering = false;
      }
      return;
    }

    /* ---- 左右游走 ---- */
    const range = Math.max(50, G.W / 2 - 96);
    bs.x = G.W / 2 + Math.sin(bs.t * (0.45 + bs.phase * 0.13) + bs.sway) * range;
    bs.y = ENTER_Y + Math.sin(bs.t * 1.3) * 8;

    /* ---- 阶段切换 ---- */
    const ratio = bs.hp / bs.maxHp;
    const ph = ratio > 0.6 ? 1 : ratio > 0.28 ? 2 : 3;

    if (ph !== bs.phase) {
      bs.phase = ph;
      if (G.particles) G.particles.ring(bs.x, bs.y, '#ff9a3a', 26, 520);
      if (G.shake) G.shake.add(9);
      if (G.audio) G.audio.bossWarn();
    }

    /* ---- 螺旋弹幕（持续型） ---- */
    if (bs.spiralT > 0) {
      bs.spiralT -= dt;
      bs.spiralTick -= dt;

      if (bs.spiralTick <= 0) {
        bs.spiralTick = 0.075;
        const n = bs.phase >= 3 ? 3 : 2;
        const sp = 185 + bs.phase * 24;

        for (let k = 0; k < n; k++) {
          const a = bs.spiralA + (k * Math.PI * 2) / n;
          G.bullets.spawnEnemy(bs.x, bs.y, Math.cos(a) * sp, Math.sin(a) * sp, { r: 5.5 });
        }
        bs.spiralA += 0.34;
      }
      return;
    }

    /* ---- 三阶段召唤小怪 ---- */
    if (bs.phase >= 3) {
      bs.minionCd -= dt;
      if (bs.minionCd <= 0) {
        bs.minionCd = 7;
        if (G.enemies) {
          G.enemies.spawn('scout', bs.x - 78);
          G.enemies.spawn('scout', bs.x + 78);
          const l = G.enemies.list;
          for (let i = Math.max(0, l.length - 2); i < l.length; i++) {
            l[i].y = bs.y + 24;      // 让它们从 Boss 身侧飞出来
          }
        }
      }
    }

    /* ---- 常规弹幕 ---- */
    bs.fireCd -= dt;
    if (bs.fireCd <= 0) firePattern(bs);
  }

  /* ============================================================
     碰撞接口
     ============================================================ */
  function tryHit(b) {
    const bs = state.boss;
    if (!bs || bs.dead) return false;

    const dx = b.x - bs.x;
    const dy = b.y - bs.y;
    const rr = b.r + bs.r;
    if (dx * dx + dy * dy > rr * rr) return false;

    applyDamage(bs, b.damage, b.x, b.y);
    return true;
  }

  function collidePlayer(P) {
    const bs = state.boss;
    if (!bs || bs.dead || !P || !P.alive) return;

    const dx = P.x - bs.x;
    const dy = P.y - bs.y;
    const rr = P.r + bs.r * 0.78;
    if (dx * dx + dy * dy <= rr * rr) P.hit();
  }

  function areaDamage(x, y, radius, dmg) {
    const bs = state.boss;
    if (!bs || bs.dead) return;
    if (Math.hypot(bs.x - x, bs.y - y) <= radius + bs.r) {
      bs.hp -= dmg;
      bs.hitFlash = 1;
      if (bs.hp <= 0) kill(bs);
    }
  }

  /* ============================================================
     绘制
     ============================================================ */
  function draw() {
    const bs = state.boss;
    if (!bs) return;

    const ctx = G.ctx;
    const coreColor = bs.phase === 1 ? '#66e0ff' : bs.phase === 2 ? '#ffd166' : '#ff5c7a';

    ctx.save();
    ctx.translate(bs.x, bs.y);

    // 死亡时整体闪烁
    if (bs.dead) ctx.globalAlpha = 0.45 + 0.55 * Math.abs(Math.sin(bs.t * 24));

    // ---- 两侧吊舱 ----
    ctx.fillStyle = '#3a2038';
    ctx.strokeStyle = '#8a4a6a';
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.moveTo(-74, -12);
    ctx.lineTo(-42, -28);
    ctx.lineTo(-42, 22);
    ctx.lineTo(-74, 16);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(74, -12);
    ctx.lineTo(42, -28);
    ctx.lineTo(42, 22);
    ctx.lineTo(74, 16);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 吊舱炮口
    ctx.fillStyle = coreColor;
    ctx.globalAlpha *= 0.85;
    ctx.fillRect(-66, 8, 8, 12);
    ctx.fillRect(58, 8, 8, 12);
    ctx.globalAlpha = bs.dead ? (0.45 + 0.55 * Math.abs(Math.sin(bs.t * 24))) : 1;

    // ---- 主舰体 ----
    const g = ctx.createLinearGradient(0, -46, 0, 48);
    g.addColorStop(0, '#6a3055');
    g.addColorStop(0.5, '#2c1632');
    g.addColorStop(1, '#150a1c');
    ctx.fillStyle = g;
    ctx.strokeStyle = '#c06a95';
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.moveTo(0, 50);
    ctx.lineTo(-34, 28);
    ctx.lineTo(-48, -8);
    ctx.lineTo(-22, -42);
    ctx.lineTo(22, -42);
    ctx.lineTo(48, -8);
    ctx.lineTo(34, 28);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 装甲纹路
    ctx.strokeStyle = 'rgba(255,180,220,0.22)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-30, -2);
    ctx.lineTo(30, -2);
    ctx.moveTo(-22, 16);
    ctx.lineTo(22, 16);
    ctx.stroke();

    // ---- 能量核心 ----
    const pulse = 0.62 + 0.38 * Math.sin(bs.t * 5);
    const cg = ctx.createRadialGradient(0, 2, 0, 0, 2, 30);
    cg.addColorStop(0, coreColor);
    cg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.arc(0, 2, 30 * pulse, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha *= 0.9;
    ctx.beginPath();
    ctx.arc(0, 2, 8 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = bs.dead ? (0.45 + 0.55 * Math.abs(Math.sin(bs.t * 24))) : 1;

    // ---- 残血冒烟 ----
    if (!bs.dead && bs.hp / bs.maxHp < 0.4 && Math.random() < 0.35) {
      if (G.particles) {
        G.particles.spark(bs.x + (Math.random() - 0.5) * 90, bs.y + (Math.random() - 0.5) * 50, '#7a5a6a');
      }
    }

    // ---- 受击白闪 ----
    if (bs.hitFlash > 0) {
      ctx.globalAlpha = bs.hitFlash * 0.5;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, bs.r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  /** 顶部血条（不参与屏幕震动） */
  function drawUI() {
    const bs = state.boss;
    if (!bs || bs.dead) return;

    const ctx = G.ctx;
    const w = Math.min(440, G.W - 70);
    const x = (G.W - w) / 2;
    const y = 90;
    const ratio = Math.max(0, bs.hp / bs.maxHp);

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';

    // 标题
    ctx.font = '700 12px "Segoe UI", "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#ffc2d8';
    ctx.shadowColor = 'rgba(255,90,130,0.85)';
    ctx.shadowBlur = 12;
    ctx.fillText('BOSS · ' + bs.name + '　' + Math.ceil(bs.hp) + ' / ' + bs.maxHp, G.W / 2, y - 7);
    ctx.shadowBlur = 0;

    // 槽
    ctx.fillStyle = 'rgba(8,6,18,0.8)';
    ctx.fillRect(x - 2, y, w + 4, 14);

    // 血量
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, '#ff5c7a');
    g.addColorStop(1, '#ffb03a');
    ctx.fillStyle = g;
    ctx.fillRect(x, y + 2, w * ratio, 10);

    // 阶段刻度（60% / 28%）
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    [0.6, 0.28].forEach((m) => {
      const mx = x + w * m;
      ctx.beginPath();
      ctx.moveTo(mx, y + 1);
      ctx.lineTo(mx, y + 13);
      ctx.stroke();
    });

    // 边框
    ctx.strokeStyle = 'rgba(255,140,180,0.65)';
    ctx.strokeRect(x - 2.5, y - 0.5, w + 5, 15);

    ctx.restore();
  }

  function reset() {
    state.boss = null;
  }

  G.boss = {
    state,
    start,
    reset,
    active,
    dying,
    update,
    draw,
    drawUI,
    tryHit,
    collidePlayer,
    areaDamage,
  };

  console.log('[星际突袭] Boss 系统就绪');
})();
