/* ============================================================
   星际突袭 · Boss 战  js/boss.js
   ------------------------------------------------------------
   每 10 关（第 10/20/30… 关）由 enemies.js 调 start(level) 触发。

   一共 6 种 Boss，按关卡轮换；第 60 关之后回到第一个，但会
   带上"第 N 形态"的强化标记并且血量继续抬升。

   每个 Boss 有独立的：
     · 外形（各自的绘制函数）
     · 配色（hull / plate / edge / core）
     · 弹幕池（三个阶段各一套）
     · 机制特点（瞬移 / 隐形 / 弹墙 / 旋臂 …）

   三个阶段（按剩余血量切换）：
      一阶段  > 60%
      二阶段  > 28%
      三阶段  <= 28%   额外召唤小怪 + 最终弹幕池
   ------------------------------------------------------------
   对外接口：
     Game.boss.start(level)  返回 Boss 名字（给 banner 用）
     Game.boss.reset() / .active() / .dying()
     Game.boss.update(dt) / .draw() / .drawUI()
     Game.boss.tryHit(bullet)          供 combat.js 调用
     Game.boss.collidePlayer(player)   供 combat.js 调用
     Game.boss.areaDamage(x, y, r, dmg) 供 upgrades.js 的爆裂弹调用
     Game.boss.ROSTER / .defAt(level)   供测试与面板查询
   ============================================================ */
'use strict';

(function () {
  const G = (window.Game = window.Game || {});

  const state = { boss: null };

  const ENTER_Y = 112;
  const ENTER_SPD = 100;                // 入场速度（px/s），约 2 秒到位
  const PHASE_MARKS = [0.6, 0.28];      // 二 / 三阶段的血量阈值

  /* ============================================================
     一、Boss 花名册
     ------------------------------------------------------------
     phases 是三个阶段各自的弹幕池，每次开火按顺序取下一个（循环）。
     弹幕类型见下面的"弹幕内核"。
     ============================================================ */
  const ROSTER = [
    {
      id: 'hive',
      name: '钢铁蜂巢',
      code: 'IRON HIVE',
      title: '铺天盖地的蜂群母舰',
      hpMul: 1.00,
      r: 52,
      speed: 170,          // 敌弹基准速度
      cdMul: 1.00,
      twist: 'swarm',      // 三阶段小怪来得更勤
      pal: {
        hull: '#3a2a12', hull2: '#1a1206',
        plate: '#7a5a1e', edge: '#ffc46b',
        core: '#ffb03a', accent: '#ffe6a8',
        glow: '255,176,58',
      },
      phases: [
        ['swarm', 'radial'],
        ['swarm', 'radial', 'wall'],
        ['swarm', 'wall', 'spiral'],
      ],
      draw: drawHive,
    },
    {
      id: 'reaver',
      name: '虚空掠夺者',
      code: 'VOID REAVER',
      title: '会瞬移的镰翼掠食者',
      hpMul: 1.15,
      r: 48,
      speed: 185,
      cdMul: 0.95,
      twist: 'blink',      // 每轮齐射后瞬移到另一侧
      pal: {
        hull: '#2a1038', hull2: '#120620',
        plate: '#5a2a7a', edge: '#c98cff',
        core: '#b06aff', accent: '#e6ccff',
        glow: '176,106,255',
      },
      phases: [
        ['spread', 'cross'],
        ['spread', 'cross', 'rain'],
        ['cross', 'rain', 'spiral'],
      ],
      draw: drawReaver,
    },
    {
      id: 'dread',
      name: '熔核巨舰',
      code: 'MOLTEN DREAD',
      title: '把整片天空烧成墙',
      hpMul: 1.30,
      r: 58,
      speed: 200,
      cdMul: 0.90,
      twist: 'none',
      pal: {
        hull: '#3a1414', hull2: '#180606',
        plate: '#7a2a1e', edge: '#ff8a5c',
        core: '#ff5c3a', accent: '#ffd0b0',
        glow: '255,110,70',
      },
      phases: [
        ['wall', 'rain'],
        ['wall', 'rain', 'radial'],
        ['wall', 'rain', 'nova', 'spiral'],
      ],
      draw: drawDread,
    },
    {
      id: 'arbiter',
      name: '深空仲裁者',
      code: 'ARBITER',
      title: '双环反向旋转的审判者',
      hpMul: 1.45,
      r: 50,
      speed: 215,
      cdMul: 0.86,
      twist: 'spin',       // 旋臂转速加倍
      pal: {
        hull: '#0e2a34', hull2: '#041218',
        plate: '#1e5a6a', edge: '#8fe9ff',
        core: '#5ce0ff', accent: '#d6f8ff',
        glow: '120,225,255',
      },
      phases: [
        ['cross', 'radial'],
        ['cross', 'nova', 'radial'],
        ['cross', 'nova', 'spiral'],
      ],
      draw: drawArbiter,
    },
    {
      id: 'endwalker',
      name: '终焉之影',
      code: 'ENDWALKER',
      title: '会隐形的虚空幽灵',
      hpMul: 1.60,
      r: 50,
      speed: 230,
      cdMul: 0.82,
      twist: 'cloak',      // 三阶段周期性隐身并加速
      pal: {
        hull: '#140a1e', hull2: '#070310',
        plate: '#3a1a4a', edge: '#a06ad0',
        core: '#7a3aa0', accent: '#d9b8ff',
        glow: '150,90,220',
      },
      phases: [
        ['nova', 'spread'],
        ['nova', 'rain', 'spread'],
        ['nova', 'spiral', 'rain', 'cross'],
      ],
      draw: drawEndwalker,
    },
    {
      id: 'devourer',
      name: '噬星者',
      code: 'STAR DEVOURER',
      title: '把弹幕当成呼吸',
      hpMul: 1.80,
      r: 60,
      speed: 245,
      cdMul: 0.78,
      twist: 'none',
      pal: {
        hull: '#2e1a06', hull2: '#120a02',
        plate: '#8a5a10', edge: '#ffd166',
        core: '#ff7a2a', accent: '#fff0c0',
        glow: '255,200,90',
      },
      phases: [
        ['swarm', 'nova'],
        ['swarm', 'nova', 'wall'],
        ['swarm', 'nova', 'spiral', 'wall', 'cross'],
      ],
      draw: drawDevourer,
    },
  ];

  /** 第 level 关用哪个 Boss（第 60 关之后回到第一个，但带强化标记） */
  function defAt(level) {
    const idx = Math.max(0, Math.floor(level / 10) - 1);
    const def = ROSTER[idx % ROSTER.length];
    const cycle = Math.floor(idx / ROSTER.length);
    return { def, cycle, idx };
  }

  /* ============================================================
     二、弹幕内核
     ------------------------------------------------------------
     全部只用 spawnEnemy 实现，不引入新的危险物类型，
     所以碰撞 / 清弹 / 点防 / 反射这些既有系统都自动适用。
     ============================================================ */
  const B = () => G.bullets;

  /** 瞄准扇形：朝玩家打 count 发 */
  function aimed(bs, count, spread, speed) {
    const bullets = B();
    const P = G.player;
    if (!bullets || !P) return;

    for (let i = 0; i < count; i++) {
      const off = (i - (count - 1) / 2) * spread;
      const v = bullets.aim(bs.x, bs.y + 22, P.x, P.y, speed, off);
      bullets.spawnEnemy(bs.x, bs.y + 22, v.vx, v.vy, { r: 6 });
    }
    if (G.audio) G.audio.enemyShoot();
  }

  /** 蜂群：窄角、多发、略快 —— 密度压制 */
  function swarm(bs, count, speed) {
    const bullets = B();
    const P = G.player;
    if (!bullets || !P) return;

    for (let i = 0; i < count; i++) {
      const off = (i - (count - 1) / 2) * 0.11 + (Math.random() - 0.5) * 0.05;
      const v = bullets.aim(bs.x, bs.y + 18, P.x, P.y, speed * (0.92 + Math.random() * 0.16), off);
      bullets.spawnEnemy(bs.x, bs.y + 18, v.vx, v.vy, { r: 5 });
    }
    if (G.audio) G.audio.enemyShoot();
  }

  /** 环形：向四周撒一圈 */
  function radial(bs, count, speed, offset) {
    const bullets = B();
    if (!bullets) return;

    for (let i = 0; i < count; i++) {
      const a = offset + (i * Math.PI * 2) / count;
      bullets.spawnEnemy(bs.x, bs.y, Math.cos(a) * speed, Math.sin(a) * speed, { r: 5.5 });
    }
    if (G.audio) G.audio.enemyShoot();
  }

  /** 十字旋臂：4 条臂，每次齐射整体转一个固定角度 → 形成旋转的十字 */
  function cross(bs, arms, speed) {
    const bullets = B();
    if (!bullets) return;

    const step = (bs.armA || 0);
    for (let i = 0; i < arms; i++) {
      const a = step + (i * Math.PI * 2) / arms;
      bullets.spawnEnemy(bs.x, bs.y, Math.cos(a) * speed, Math.sin(a) * speed, { r: 5.5 });
    }
    bs.armA = step + (bs.spinFast ? 0.62 : 0.34);
    if (G.audio) G.audio.enemyShoot();
  }

  /** 弹雨：顶部往下砸一片，落点随机偏斜 */
  function rain(bs, count, speed) {
    const bullets = B();
    if (!bullets) return;

    for (let i = 0; i < count; i++) {
      const x = bs.x + (i - (count - 1) / 2) * 46;
      const a = Math.PI / 2 + (Math.random() - 0.5) * 0.55;
      bullets.spawnEnemy(x, bs.y + 34, Math.cos(a) * speed * 0.55, Math.sin(a) * speed, { r: 5.5 });
    }
    if (G.audio) G.audio.enemyShoot();
  }

  /** 弹墙：整屏横向铺满，只留一个能钻过去的缺口 */
  function wall(bs, speed) {
    const bullets = B();
    if (!bullets) return;

    const cols = 13;
    const gapAt = 1 + Math.floor(Math.random() * (cols - 2));
    const stepX = G.W / cols;

    for (let i = 0; i < cols; i++) {
      if (Math.abs(i - gapAt) <= 1) continue;      // 留 3 格宽的缺口
      const x = stepX * (i + 0.5);
      const a = Math.PI / 2 + (Math.random() - 0.5) * 0.10;
      bullets.spawnEnemy(x, bs.y + 30, Math.cos(a) * speed * 0.35, Math.sin(a) * speed, { r: 6 });
    }
    if (G.audio) G.audio.enemyShoot();
  }

  /** 新星：两圈带缺口的扩散环 —— 必须去找缺口躲 */
  function nova(bs, speed) {
    const bullets = B();
    if (!bullets) return;

    for (let ring = 0; ring < 2; ring++) {
      const n = 14 + ring * 6;
      const gapA = Math.random() * Math.PI * 2;
      const gapW = 0.55;
      const sp = speed * (1 - ring * 0.14);

      for (let i = 0; i < n; i++) {
        const a = (i * Math.PI * 2) / n;
        let d = a - gapA;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        if (Math.abs(d) < gapW) continue;          // 缺口
        bullets.spawnEnemy(bs.x, bs.y, Math.cos(a) * sp, Math.sin(a) * sp, { r: 5.5 });
      }
    }
    if (G.audio) G.audio.enemyShoot();
  }

  /** 派发一次弹幕（bs.phase 决定强度） */
  function fireKernel(bs, kind) {
    const sp = bs.def.speed + bs.phase * 24;
    const ph = bs.phase;

    switch (kind) {
      case 'swarm':
        swarm(bs, 5 + ph * 2, sp * 1.05);
        break;
      case 'spread':
        aimed(bs, 3 + ph, 0.22, sp);
        break;
      case 'radial':
        radial(bs, 10 + ph * 4, sp * 0.85, bs.t);
        break;
      case 'cross':
        cross(bs, ph >= 3 ? 6 : 4, sp * 0.95);
        break;
      case 'rain':
        rain(bs, 7 + ph, sp * 0.9);
        break;
      case 'wall':
        wall(bs, sp * 0.80);
        break;
      case 'nova':
        nova(bs, sp * 0.78);
        break;
      default:
        aimed(bs, 3 + ph, 0.22, sp);
    }
  }

  /** 从当前阶段的弹幕池里取下一个 */
  function firePattern(bs) {
    const pool = bs.def.phases[Math.min(bs.phase, 3) - 1];
    bs.patternIdx = (bs.patternIdx + 1) % pool.length;
    const kind = pool[bs.patternIdx];

    // 螺旋是"持续型"，单独处理
    if (kind === 'spiral') {
      bs.spiralT = 1.4 + bs.phase * 0.3;
      bs.spiralTick = 0;
      bs.spiralA = bs.t;
      bs.fireCd = 2.4 * bs.def.cdMul;
      return;
    }

    fireKernel(bs, kind);

    const cost = {
      swarm: 1.15, spread: 1.35, radial: 1.55,
      cross: 1.20, rain: 1.15, wall: 1.60, nova: 1.55,
    }[kind] || 1.4;

    bs.fireCd = Math.max(0.45, (cost - bs.phase * 0.18) * bs.def.cdMul);

    // 掠夺者：打完就瞬移到另一侧
    if (bs.def.twist === 'blink') blink(bs);
  }

  /** 瞬移（虚空掠夺者） */
  function blink(bs) {
    const side = bs.x < G.W / 2 ? 1 : -1;
    const range = Math.max(60, G.W / 2 - 96);
    bs.x = G.W / 2 + side * range * (0.55 + Math.random() * 0.45);
    bs.sway = Math.random() * 6.28;

    if (G.particles) {
      G.particles.burst(bs.x, bs.y, { color: bs.def.pal.edge, count: 16, speed: 260 });
      G.particles.ring(bs.x, bs.y, bs.def.pal.edge, 14, 320);
    }
  }

  /* ============================================================
     三、生成
     ============================================================ */
  function start(level) {
    // 基础曲线：前 10 关温和，之后连续指数增长
    const base = level <= 10
      ? 160 + level * 60
      : (160 + 10 * 60) * Math.pow(1.20, level - 10);

    // 再叠加"每 10 关一次"的整体台阶（与 enemies.js 共用同一套规则）
    const tier = (G.enemies && G.enemies.tierMul) ? G.enemies.tierMul(level) : 1;

    const pick = defAt(level);
    const def = pick.def;

    // 第 60 关之后轮回到第一个 Boss，但每轮回血量 ×1.45
    const cycleMul = Math.pow(1.45, pick.cycle);
    const hp = Math.max(1, Math.round(base * tier * def.hpMul * cycleMul));

    state.boss = {
      level,
      def,
      name: def.name + (pick.cycle > 0 ? ' · 第' + (pick.cycle + 1) + '形态' : ''),
      code: def.code,
      x: G.W / 2,
      y: -(def.r + 44),
      r: def.r,
      hp,
      maxHp: hp,
      t: 0,
      phase: 1,
      entering: true,
      patternIdx: -1,
      fireCd: 1.5,
      spiralT: 0,
      spiralTick: 0,
      spiralA: 0,
      armA: 0,
      spinFast: def.twist === 'spin',
      minionCd: 4.5,
      cloakT: 3.2,
      cloaked: false,
      alpha: 1,
      hitFlash: 0,
      dotStacks: 0,      // 辐射流：持续伤害层数（辐射/剧毒/燃烧合流）
      dotT: 0,
      dotTick: 0,
      dead: false,
      deathT: 0,
      sway: Math.random() * 6.28,
    };

    if (G.audio && G.audio.bossWarn) G.audio.bossWarn();
    if (G.shake) G.shake.add(9);

    return state.boss.name;
  }

  function active() {
    return !!state.boss;
  }

  /** 是否正处于"已被击破、正在放爆炸演出"的阶段 */
  function dying() {
    return !!state.boss && state.boss.dead;
  }

  /* ============================================================
     四、伤害与死亡
     ============================================================ */
  function applyDamage(bs, baseDmg, x, y, critOverride) {
    const S = G.stats || {};

    let dmg = baseDmg || 1;
    if (G.upgrades && G.upgrades.damageMultiplier) {
      dmg *= G.upgrades.damageMultiplier(bs);
    }
    if (G.upgrades && G.upgrades.hitBonus) {
      dmg += G.upgrades.hitBonus();
    }

    // 暴击率：子弹自带就用子弹的（僚机半继承），否则用本体的
    const critChance = (critOverride === undefined || critOverride === null)
      ? (S.critChance || 0)
      : critOverride;
    const isCrit = critChance > 0 && Math.random() < critChance;
    if (isCrit) dmg *= (S.critMul || 2);

    bs.hp -= dmg;
    bs.hitFlash = 1;

    // 持续伤害：Boss 也被常规子弹命中叠层（和杂兵同一套公式）
    if (G.upgrades && G.upgrades.applyDot) {
      G.upgrades.applyDot(bs, S.dotPerHit || 0);
    }

    // 命中积累
    if (G.upgrades && G.upgrades.addHit) G.upgrades.addHit(1);

    // 伤害飘字与秒伤统计
    if (G.combat && G.combat.record) G.combat.record(x, y, dmg, isCrit, 'boss');

    if (G.particles) {
      G.particles.spark(x, y, isCrit ? '#ffd166' : bs.def.pal.edge);
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
    bs.deathT = 1.35;
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
      G.particles.burst(bs.x, bs.y, { color: bs.def.pal.core, count: 50, speed: 420 });
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
     五、逐帧更新
     ============================================================ */
  function update(dt) {
    const bs = state.boss;
    if (!bs) return;

    bs.t += dt;
    if (bs.hitFlash > 0) bs.hitFlash = Math.max(0, bs.hitFlash - dt * 5);

    /* ---- 死亡爆炸演出 ---- */
    if (bs.dead) {
      bs.deathT -= dt;

      if (Math.random() < dt * 26) {
        const ox = (Math.random() - 0.5) * 140;
        const oy = (Math.random() - 0.5) * 92;
        const colors = [bs.def.pal.core, bs.def.pal.edge, '#ffd166'];
        if (G.particles) {
          G.particles.burst(bs.x + ox, bs.y + oy, {
            color: colors[(Math.random() * colors.length) | 0],
            count: 22,
            speed: 340,
          });
        }
      }

      if (bs.deathT <= 0) {
        if (G.particles) {
          G.particles.burst(bs.x, bs.y, { color: '#fff3c4', count: 70, speed: 540 });
          G.particles.ring(bs.x, bs.y, bs.def.pal.edge, 22, 720);
        }
        if (G.shake) G.shake.add(24);
        state.boss = null;
      }
      return;
    }

    /* ---- 入场 ---- */
    if (bs.entering) {
      bs.y += ENTER_SPD * dt;
      if (bs.y >= ENTER_Y) {
        bs.y = ENTER_Y;
        bs.entering = false;
      }
      return;
    }

    /* ---- 左右游走 ---- */
    const range = Math.max(50, G.W / 2 - 96);
    const swayRate = bs.def.twist === 'blink' ? 0.62 : 0.45;
    bs.x = G.W / 2 + Math.sin(bs.t * (swayRate + bs.phase * 0.13) + bs.sway) * range;
    bs.y = ENTER_Y + Math.sin(bs.t * 1.3) * 8;

    /* ---- 终焉之影：三阶段周期性隐身 ---- */
    if (bs.def.twist === 'cloak' && bs.phase >= 3) {
      bs.cloakT -= dt;
      if (bs.cloakT <= 0) {
        bs.cloaked = !bs.cloaked;
        bs.cloakT = bs.cloaked ? 1.5 : 3.4;
        if (G.particles) {
          G.particles.ring(bs.x, bs.y, bs.def.pal.edge, 18, 420);
        }
      }
    } else {
      bs.cloaked = false;
    }
    bs.alpha = bs.cloaked
      ? 0.20 + 0.10 * Math.sin(bs.t * 14)
      : 1;

    /* ---- 辐射流：Boss 同样吃持续伤害 ----
       DOT 是一条独立伤害通道，必须能打 Boss，否则面对 Boss 时整个流派等于失效。 */
    if (bs.dotStacks > 0 && G.upgrades && G.upgrades.tickDot) {
      const R = G.upgrades.tickDot(bs, dt);

      if (bs.hp > 0 && R.dmg > 0) {
        bs.hitFlash = Math.max(bs.hitFlash, 0.35);
        if (G.combat && G.combat.record) {
          G.combat.record(bs.x, bs.y - 30, R.dmg, R.crit, 'dotboss', 'dot');
        }
      }

      if (R.burst) {
        if (G.particles) {
          G.particles.sweep(bs.x, bs.y, R.burst.radius, '#b6ff6e', 0.45, 3);
          G.particles.burst(bs.x, bs.y, { color: '#9ae66e', count: 22, speed: 320 });
        }
        if (G.upgrades.blastAround) {
          G.upgrades.blastAround(bs.x, bs.y, R.burst.radius, R.burst.dmg,
            { dot: true, flash: true });
        }
      }

      if (bs.hp <= 0 && !bs.dead) {
        kill(bs);
        return;
      }
    }

    /* ---- 阶段切换 ---- */
    const ratio = bs.hp / bs.maxHp;
    const nextPhase = ratio > PHASE_MARKS[0] ? 1 : ratio > PHASE_MARKS[1] ? 2 : 3;

    if (nextPhase !== bs.phase) {
      bs.phase = nextPhase;
      if (G.particles) {
        G.particles.ring(bs.x, bs.y, bs.def.pal.core, 26, 520);
        G.particles.text(bs.x, bs.y - bs.r - 30, '阶段 ' + nextPhase, bs.def.pal.accent, 15);
      }
      if (G.shake) G.shake.add(9);
      if (G.audio) G.audio.bossWarn();
    }

    /* ---- 三阶段召唤小怪 ---- */
    if (bs.phase >= 3) {
      bs.minionCd -= dt;
      if (bs.minionCd <= 0) {
        // 蜂巢召得最勤
        bs.minionCd = bs.def.twist === 'swarm' ? 4.5 : 7;
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

    /* ---- 螺旋弹幕（持续型，优先于常规弹幕） ---- */
    if (bs.spiralT > 0) {
      bs.spiralT -= dt;
      bs.spiralTick -= dt;

      if (bs.spiralTick <= 0) {
        bs.spiralTick = 0.075;
        const n = bs.phase >= 3 ? 3 : 2;
        const sp = bs.def.speed + bs.phase * 24;

        for (let k = 0; k < n; k++) {
          const a = bs.spiralA + (k * Math.PI * 2) / n;
          if (G.bullets) {
            G.bullets.spawnEnemy(bs.x, bs.y, Math.cos(a) * sp, Math.sin(a) * sp, { r: 5.5 });
          }
        }
        bs.spiralA += bs.spinFast ? 0.50 : 0.34;
      }
      return;
    }

    /* ---- 常规弹幕 ---- */
    bs.fireCd -= dt;
    if (bs.fireCd <= 0) firePattern(bs);
  }

  /* ============================================================
     六、碰撞接口
     ============================================================ */
  function tryHit(b) {
    const bs = state.boss;
    if (!bs || bs.dead) return false;

    const dx = b.x - bs.x;
    const dy = b.y - bs.y;
    const rr = b.r + bs.r;
    if (dx * dx + dy * dy > rr * rr) return false;

    applyDamage(bs, b.damage, b.x, b.y, b.critChance);
    return true;
  }

  function collidePlayer(P) {
    const bs = state.boss;
    if (!bs || bs.dead || !P || !P.alive) return;
    if (bs.cloaked) return;                  // 隐身时不撞机，给玩家喘息

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
     七、绘制
     ------------------------------------------------------------
     所有外形都画在"半径 52 的名义坐标系"里，再按 bs.r/52 统一缩放，
     这样每个外形的比例都不会被尺寸改动带歪。
     ============================================================ */
  function hexPath(ctx, cx, cy, R, rot) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (rot || 0) + (i * Math.PI) / 3;
      const x = cx + Math.cos(a) * R;
      const y = cy + Math.sin(a) * R;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  function poly(ctx, pts) {
    ctx.beginPath();
    for (let i = 0; i < pts.length; i += 2) {
      if (i === 0) ctx.moveTo(pts[0], pts[1]);
      else ctx.lineTo(pts[i], pts[i + 1]);
    }
    ctx.closePath();
  }

  /** 通用的"核心光球" */
  function coreGlow(ctx, x, y, R, color, pulse) {
    const cg = ctx.createRadialGradient(x, y, 0, x, y, R);
    cg.addColorStop(0, color);
    cg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.arc(x, y, R * pulse, 0, Math.PI * 2);
    ctx.fill();
  }

  /* ---- ① 钢铁蜂巢：六边形母舰 + 六个侧舱 + 蜂窝格 ---- */
  function drawHive(ctx, bs, pal, core) {
    // 六个侧舱
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 3;
      const px = Math.cos(a) * 56;
      const py = Math.sin(a) * 44;
      hexPath(ctx, px, py, 17, a);
      ctx.fillStyle = pal.hull;
      ctx.fill();
      ctx.strokeStyle = pal.plate;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // 主壳
    hexPath(ctx, 0, 0, 46, Math.PI / 6);
    const g = ctx.createLinearGradient(0, -46, 0, 46);
    g.addColorStop(0, pal.plate);
    g.addColorStop(0.55, pal.hull);
    g.addColorStop(1, pal.hull2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = pal.edge;
    ctx.lineWidth = 2.4;
    ctx.stroke();

    // 蜂窝格
    ctx.strokeStyle = 'rgba(255,220,150,0.30)';
    ctx.lineWidth = 1.2;
    for (let r = 0; r < 2; r++) {
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3 + r * 0.52;
        hexPath(ctx, Math.cos(a) * (18 + r * 15), Math.sin(a) * (16 + r * 13), 9, a);
        ctx.stroke();
      }
    }

    const pulse = 0.62 + 0.38 * Math.sin(bs.t * 5);
    coreGlow(ctx, 0, 0, 32, core, pulse);
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha *= 0.9;
    ctx.beginPath();
    ctx.arc(0, 0, 9 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha /= 0.9;
  }

  /* ---- ② 虚空掠夺者：细长机身 + 前掠镰刀翼 ---- */
  function drawReaver(ctx, bs, pal, core) {
    const flap = Math.sin(bs.t * 3.2) * 5;

    // 镰刀双翼
    ctx.fillStyle = pal.hull2;
    ctx.strokeStyle = pal.plate;
    ctx.lineWidth = 2;
    poly(ctx, [-12, -4, -74, -32 + flap, -84, -6 + flap, -26, 20]);
    ctx.fill();
    ctx.stroke();
    poly(ctx, [12, -4, 74, -32 + flap, 84, -6 + flap, 26, 20]);
    ctx.fill();
    ctx.stroke();

    // 翼刃
    ctx.strokeStyle = pal.edge;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(-16, -2);
    ctx.lineTo(-76, -30 + flap);
    ctx.moveTo(16, -2);
    ctx.lineTo(76, -30 + flap);
    ctx.stroke();

    // 中央机身
    const g = ctx.createLinearGradient(0, -48, 0, 52);
    g.addColorStop(0, pal.plate);
    g.addColorStop(0.6, pal.hull);
    g.addColorStop(1, pal.hull2);
    ctx.fillStyle = g;
    poly(ctx, [0, 54, -15, 12, -11, -30, 0, -48, 11, -30, 15, 12]);
    ctx.fill();
    ctx.strokeStyle = pal.edge;
    ctx.lineWidth = 2;
    ctx.stroke();

    // 头部双眼
    const blink = 0.5 + 0.5 * Math.sin(bs.t * 6);
    ctx.fillStyle = pal.accent;
    ctx.globalAlpha *= 0.55 + 0.45 * blink;
    ctx.beginPath();
    ctx.arc(-7, -30, 3.4, 0, Math.PI * 2);
    ctx.arc(7, -30, 3.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha /= (0.55 + 0.45 * blink);

    coreGlow(ctx, 0, 4, 26, core, 0.6 + 0.4 * Math.sin(bs.t * 7));
  }

  /* ---- ③ 熔核巨舰：宽体战列舰 + 三座炮塔 + 熔岩槽 ---- */
  function drawDread(ctx, bs, pal, core) {
    // 主舰体（宽）
    const g = ctx.createLinearGradient(0, -34, 0, 40);
    g.addColorStop(0, pal.plate);
    g.addColorStop(0.5, pal.hull);
    g.addColorStop(1, pal.hull2);
    ctx.fillStyle = g;
    poly(ctx, [-92, -20, 92, -20, 74, 30, 40, 42, -40, 42, -74, 30]);
    ctx.fill();
    ctx.strokeStyle = pal.edge;
    ctx.lineWidth = 2.4;
    ctx.stroke();

    // 装甲分段线
    ctx.strokeStyle = 'rgba(255,180,140,0.22)';
    ctx.lineWidth = 1.3;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 30, -18);
      ctx.lineTo(i * 26, 40);
      ctx.stroke();
    }

    // 三座炮塔
    [-52, 0, 52].forEach((tx, i) => {
      ctx.fillStyle = pal.hull2;
      ctx.strokeStyle = pal.plate;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(tx, 4 - (i === 1 ? 10 : 0), 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = pal.edge;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(tx, 4 - (i === 1 ? 10 : 0));
      ctx.lineTo(tx, 30);
      ctx.stroke();
    });

    // 熔岩槽：随血量变亮
    const heat = 1 - bs.hp / bs.maxHp;
    const pulse = 0.55 + 0.45 * Math.sin(bs.t * (4 + heat * 6));
    ctx.fillStyle = pal.core;
    ctx.globalAlpha *= 0.35 + 0.5 * heat;
    ctx.fillRect(-70, -14, 140, 7 * pulse);
    ctx.globalAlpha /= (0.35 + 0.5 * heat);

    coreGlow(ctx, 0, 6, 40, core, pulse);
  }

  /* ---- ④ 深空仲裁者：菱形本体 + 双反向旋转环 ---- */
  function drawArbiter(ctx, bs, pal, core) {
    // 外环
    ctx.save();
    ctx.rotate(bs.t * 0.9);
    ctx.strokeStyle = pal.plate;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(0, 0, 66, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = pal.edge;
    ctx.lineWidth = 2.2;
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      ctx.beginPath();
      ctx.arc(0, 0, 66, a, a + 0.9);
      ctx.stroke();
    }
    ctx.restore();

    // 内环（反向）
    ctx.save();
    ctx.rotate(-bs.t * 1.5);
    ctx.strokeStyle = pal.edge;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 46, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = pal.accent;
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 46, Math.sin(a) * 46);
      ctx.lineTo(Math.cos(a) * 58, Math.sin(a) * 58);
      ctx.stroke();
    }
    ctx.restore();

    // 菱形本体
    const g = ctx.createLinearGradient(0, -44, 0, 44);
    g.addColorStop(0, pal.plate);
    g.addColorStop(0.5, pal.hull);
    g.addColorStop(1, pal.hull2);
    ctx.fillStyle = g;
    poly(ctx, [0, -44, 30, 0, 0, 44, -30, 0]);
    ctx.fill();
    ctx.strokeStyle = pal.edge;
    ctx.lineWidth = 2.4;
    ctx.stroke();

    // 审判之眼
    const pulse = 0.6 + 0.4 * Math.sin(bs.t * 5.5);
    coreGlow(ctx, 0, 0, 30, core, pulse);
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha *= 0.92;
    poly(ctx, [0, -12 * pulse, 7 * pulse, 0, 0, 12 * pulse, -7 * pulse, 0]);
    ctx.fill();
    ctx.globalAlpha /= 0.92;
  }

  /* ---- ⑤ 终焉之影：尖刺幽灵 + 中空躯干 + 飘尾 ---- */
  function drawEndwalker(ctx, bs, pal, core) {
    const breathe = 1 + 0.05 * Math.sin(bs.t * 2.4);

    // 飘尾
    ctx.strokeStyle = pal.plate;
    ctx.lineWidth = 3;
    for (let i = -2; i <= 2; i++) {
      const w = Math.sin(bs.t * 3 + i) * 8;
      ctx.beginPath();
      ctx.moveTo(i * 12, 26);
      ctx.quadraticCurveTo(i * 16 + w, 48, i * 10 + w * 1.6, 72);
      ctx.stroke();
    }

    // 尖刺轮廓
    ctx.save();
    ctx.scale(breathe, breathe);
    const g = ctx.createLinearGradient(0, -58, 0, 40);
    g.addColorStop(0, pal.plate);
    g.addColorStop(0.45, pal.hull);
    g.addColorStop(1, pal.hull2);
    ctx.fillStyle = g;
    poly(ctx, [
      0, -60,
      15, -22, 36, -32,
      24, 8, 40, 40,
      0, 24,
      -40, 40, -24, 8,
      -36, -32, -15, -22,
    ]);
    ctx.fill();
    ctx.strokeStyle = pal.edge;
    ctx.lineWidth = 2.2;
    ctx.stroke();

    // 中空躯干（暗色掏空 + 边缘发光）
    ctx.fillStyle = '#05020a';
    ctx.beginPath();
    ctx.ellipse(0, -6, 15, 24, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = pal.accent;
    ctx.globalAlpha *= 0.6;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.globalAlpha /= 0.6;
    ctx.restore();

    // 核心：飘忽的鬼火
    const flick = 0.45 + 0.55 * Math.abs(Math.sin(bs.t * 4.3));
    coreGlow(ctx, 0, -6, 24, core, flick);
  }

  /* ---- ⑥ 噬星者：环形巨口 + 一圈牙齿 + 中心黑洞 ---- */
  function drawDevourer(ctx, bs, pal, core) {
    const teeth = 14;
    const ringR = 58;
    const spin = bs.t * 0.5;

    // 口环
    ctx.strokeStyle = pal.plate;
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.arc(0, 0, ringR, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = pal.edge;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(0, 0, ringR, 0, Math.PI * 2);
    ctx.stroke();

    // 牙齿：呼吸式伸缩
    const bite = 0.5 + 0.5 * Math.sin(bs.t * 2.6);
    for (let i = 0; i < teeth; i++) {
      const a = spin + (i * Math.PI * 2) / teeth;
      const inner = ringR - 16 - bite * 12;
      const tipX = Math.cos(a) * inner;
      const tipY = Math.sin(a) * inner;
      const b1 = a - 0.13;
      const b2 = a + 0.13;
      poly(ctx, [
        Math.cos(b1) * ringR, Math.sin(b1) * ringR,
        tipX, tipY,
        Math.cos(b2) * ringR, Math.sin(b2) * ringR,
      ]);
      ctx.fillStyle = pal.accent;
      ctx.globalAlpha *= 0.85;
      ctx.fill();
      ctx.globalAlpha /= 0.85;
    }

    // 反向内环
    ctx.save();
    ctx.rotate(-bs.t * 0.85);
    ctx.strokeStyle = 'rgba(255,220,150,0.35)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      ctx.beginPath();
      ctx.arc(0, 0, 34, a, a + 0.55);
      ctx.stroke();
    }
    ctx.restore();

    // 中心黑洞 + 外溢光
    ctx.fillStyle = '#080400';
    ctx.beginPath();
    ctx.arc(0, 0, 24, 0, Math.PI * 2);
    ctx.fill();

    const pulse = 0.6 + 0.4 * Math.sin(bs.t * 3.4);
    coreGlow(ctx, 0, 0, 40, core, pulse);
    ctx.fillStyle = '#080400';
    ctx.beginPath();
    ctx.arc(0, 0, 13, 0, Math.PI * 2);
    ctx.fill();
  }

  const DRAW = {
    hive: drawHive,
    reaver: drawReaver,
    dread: drawDread,
    arbiter: drawArbiter,
    endwalker: drawEndwalker,
    devourer: drawDevourer,
  };

  function draw() {
    const bs = state.boss;
    if (!bs) return;

    const ctx = G.ctx;
    const pal = bs.def.pal;
    // 核心颜色随阶段推进：本色 → 琥珀 → 赤红
    const core = bs.phase === 1 ? pal.core : bs.phase === 2 ? '#ffd166' : '#ff5c7a';

    ctx.save();
    ctx.translate(bs.x, bs.y);
    ctx.scale(bs.r / 52, bs.r / 52);

    // 死亡闪烁 / 隐身透明度
    const vis = bs.alpha == null ? 1 : bs.alpha;
    const base = bs.dead ? 0.45 + 0.55 * Math.abs(Math.sin(bs.t * 24)) : vis;
    ctx.globalAlpha = base;

    // 底层辉光
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = base * 0.5;
    coreGlow(ctx, 0, 0, 96, pal.core, 0.9 + 0.1 * Math.sin(bs.t * 2));
    ctx.restore();

    (DRAW[bs.def.id] || drawHive)(ctx, bs, pal, core);

    // ---- 残血冒烟 ----
    if (!bs.dead && bs.hp / bs.maxHp < 0.4 && Math.random() < 0.35) {
      if (G.particles) {
        G.particles.spark(
          bs.x + (Math.random() - 0.5) * 96,
          bs.y + (Math.random() - 0.5) * 54,
          pal.plate
        );
      }
    }

    // ---- 辐射流：绿色衰变光环 + 层数 ----
    if (!bs.dead && bs.dotStacks > 0) {
      const S = G.stats || {};
      const k = S.dotMax > 0 ? Math.min(1, bs.dotStacks / S.dotMax) : 0;

      ctx.globalAlpha = base * (0.18 + 0.4 * k);
      ctx.fillStyle = '#9ae66e';
      ctx.beginPath();
      ctx.arc(0, 0, bs.r + 6 + 16 * k, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = base * 0.75;
      ctx.strokeStyle = '#c8ff9a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, bs.r + 4 + 16 * k, 0, Math.PI * 2);
      ctx.stroke();

      ctx.globalAlpha = base;
      ctx.fillStyle = '#e6ffcf';
      ctx.font = '700 14px "Segoe UI", "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('☣' + bs.dotStacks, 0, -bs.r - 20);
    }

    // ---- 受击白闪 ----
    if (bs.hitFlash > 0) {
      ctx.globalAlpha = base * bs.hitFlash * 0.5;
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
    const pal = bs.def.pal;
    const w = Math.min(440, G.W - 70);
    const x = (G.W - w) / 2;
    const y = 90;
    const ratio = Math.max(0, bs.hp / bs.maxHp);

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';

    // 标题：中文名 + 代号
    ctx.font = '700 12px "Segoe UI", "Microsoft YaHei", sans-serif';
    ctx.fillStyle = pal.accent;
    ctx.shadowColor = 'rgba(' + pal.glow + ',0.9)';
    ctx.shadowBlur = 12;
    ctx.fillText('BOSS · ' + bs.name, G.W / 2, y - 22);
    ctx.shadowBlur = 0;

    ctx.font = '600 9px "Segoe UI", sans-serif';
    ctx.fillStyle = 'rgba(' + pal.glow + ',0.75)';
    ctx.fillText(bs.code + '　·　' + bs.def.title, G.W / 2, y - 10);

    // 槽
    ctx.fillStyle = 'rgba(8,6,18,0.8)';
    ctx.fillRect(x - 2, y, w + 4, 14);

    // 血量
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, pal.core);
    g.addColorStop(0.6, pal.edge);
    g.addColorStop(1, '#ffb03a');
    ctx.fillStyle = g;
    ctx.fillRect(x, y + 2, w * ratio, 10);

    // 阶段刻度
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    PHASE_MARKS.forEach((m) => {
      const mx = x + w * m;
      ctx.beginPath();
      ctx.moveTo(mx, y + 1);
      ctx.lineTo(mx, y + 13);
      ctx.stroke();
    });

    // 阶段指示
    ctx.font = '700 10px "Segoe UI", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(' + pal.glow + ',0.95)';
    ctx.fillText(['', 'Ⅰ', 'Ⅱ', 'Ⅲ'][bs.phase] || '', x + w + 12, y + 12);

    // 数值
    ctx.textAlign = 'left';
    ctx.font = '600 9px "Segoe UI", sans-serif';
    ctx.fillStyle = 'rgba(230,240,255,0.7)';
    ctx.fillText(Math.ceil(bs.hp) + ' / ' + bs.maxHp, x, y + 24);

    // 边框
    ctx.textAlign = 'center';
    ctx.strokeStyle = 'rgba(' + pal.glow + ',0.7)';
    ctx.lineWidth = 1;
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

    // 供测试 / 面板查询
    ROSTER,
    defAt,
    PHASE_MARKS,
  };

  console.log('[星际突袭] Boss 系统就绪 · ' + ROSTER.length + ' 种 Boss（每 10 关一个）');
})();
