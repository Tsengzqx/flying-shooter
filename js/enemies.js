/* ============================================================
   星际突袭 · 敌机与波次  js/enemies.js
   ------------------------------------------------------------
   普通敌机：
     scout    侦察机 · 直线俯冲，血少分低，偶尔点射
     zigzag   游走机 · 左右蛇形，会瞄准射击
     gunship  炮艇   · 移动慢、血厚，三向扇形弹幕
     diver    冲角机 · 悬停后锁定玩家高速俯冲
     weaver   织网者 · 横移布网，弹幕成排推进
     splitter 分裂体 · 击毁后裂成两只侦察机
   精英怪（★）：
     任意普通机有几率变异成精英，金色光环、血量 ×3.5、体型更大、
     多打一轮弹幕，分数 ×4、经验 ×3，必掉道具
   准 Boss：
     escort   护卫舰 · 第 6 关起出现，血厚、双段弹幕，难度介于小怪与 Boss 之间

   血量成长：随关卡线性放大（hpScale），越往后越硬
   波次规模：每关敌机数量随关卡增加，上限 36
   ------------------------------------------------------------
   对外接口：
     Game.enemies.list / .wave / .reset() / .update(dt) / .draw()
     Game.enemies.spawn(type, x, opts) / .damage(i, dmg, opts)
   ============================================================ */
'use strict';

(function () {
  const G = (window.Game = window.Game || {});

  const list = [];

  /* ---------------- 敌机属性表 ----------------
     r    = 碰撞半径（判定）
     art  = 绘制原始设计半径（算放大倍率，让外观与判定一致）
     xp   = 击毁后给玩家的经验
     ------------------------------------------------ */
  const TYPES = {
    scout:    { r: 16, hp: 1,  score: 100,  xp: 2,  art: 13, color: '#ff8a5c' },
    zigzag:   { r: 18, hp: 2,  score: 220,  xp: 4,  art: 15, color: '#c07dff' },
    gunship:  { r: 27, hp: 7,  score: 550,  xp: 9,  art: 23, color: '#ff5c7a' },
    diver:    { r: 17, hp: 3,  score: 320,  xp: 6,  art: 14, color: '#ffd166' },
    weaver:   { r: 20, hp: 4,  score: 380,  xp: 7,  art: 17, color: '#5ce1e6' },
    splitter: { r: 24, hp: 6,  score: 460,  xp: 8,  art: 20, color: '#9ae66e' },
    escort:   { r: 34, hp: 22, score: 1400, xp: 22, art: 28, color: '#ff9de2' },
  };

  const ELITE_HP = 3.5;      // 精英血量倍率
  const ELITE_R = 1.28;      // 精英体型倍率
  const ELITE_SCORE = 4;
  const ELITE_XP = 3;

  const EASY_UNTIL = 10;     // 前 10 关属于"简单期"
  const ELITE_FROM = 11;     // 精英怪从第 11 关才开始出现
  const TIER_STEP = 2.2;     // 每 10 关一次的指数台阶倍率
  const TIER_LEN = 10;

  /* ---------------- 波次状态 ---------------- */
  const wave = {
    level: 1,
    queue: [],
    gap: 0,
    banner: null,
  };

  /**
   * 关卡台阶：第 1~10 关 ×1，第 11~20 关 ×2.2，
   * 第 21~30 关 ×4.84，第 31~40 关 ×10.65 ……
   * —— 每 10 关整体血量指数级跳一次。
   */
  function tierMul(level) {
    return Math.pow(TIER_STEP, Math.floor((level - 1) / TIER_LEN));
  }

  /**
   * 小怪血量成长
   * 第 1~10 关：平缓线性（×1 → ×2.44），照顾新手
   * 第 11 关起：连续指数增长，并叠加"每 10 关"的台阶
   */
  function hpScale(level) {
    const base = level <= EASY_UNTIL
      ? 1 + (level - 1) * 0.16
      : (1 + (EASY_UNTIL - 1) * 0.16) * Math.pow(1.16, level - EASY_UNTIL);

    return base * tierMul(level);
  }

  /**
   * 每关敌机数量
   * 简单期缓慢增长，之后指数增长（有上限防止刷屏）
   */
  function waveCount(level) {
    if (level <= EASY_UNTIL) return Math.min(6 + level * 2, 22);
    const base = 6 + EASY_UNTIL * 2;                       // 26
    const n = base * Math.pow(1.12, level - EASY_UNTIL);
    return Math.min(Math.round(n), 60);
  }

  /* ---------------- 出怪组成 ---------------- */
  function pickType(level) {
    const table = [
      { type: 'scout',    w: 34 },
      { type: 'zigzag',   w: level >= 3 ? 22 : 0 },
      { type: 'gunship',  w: level >= 4 ? 15 : 0 },
      { type: 'diver',    w: level >= 5 ? 15 : 0 },
      { type: 'weaver',   w: level >= 6 ? 11 : 0 },
      { type: 'splitter', w: level >= 8 ? 13 : 0 },
      { type: 'escort',   w: level >= 12 ? 8 : 0 },
    ];

    let total = 0;
    for (const e of table) total += e.w;

    let r = Math.random() * total;
    for (const e of table) {
      r -= e.w;
      if (r <= 0) return e.type;
    }
    return 'scout';
  }

  /** 精英变异概率：前 10 关为 0，第 11 关起逐步提升 */
  function eliteChance(level) {
    if (level < ELITE_FROM) return 0;
    return Math.min(0.26, 0.06 + (level - ELITE_FROM) * 0.018);
  }

  function startWave(level) {
    wave.level = level;
    wave.queue.length = 0;
    wave.gap = 0;
    G.level = level;

    // 每 5 关一个 Boss（同时也会有护卫小怪一起出）
    if (level % 5 === 0 && G.boss && typeof G.boss.start === 'function') {
      wave.banner = { text: '第 ' + level + ' 关 · BOSS 来袭', t: 2.2 };
      G.boss.start(level);

      const minions = Math.min(5 + Math.floor(level / 2), 18);
      let mt = 3.0;
      for (let i = 0; i < minions; i++) {
        wave.queue.push({
          delay: mt,
          type: pickType(level),
          x: 42 + Math.random() * Math.max(1, G.W - 84),
        });
        mt += 1.3 + Math.random() * 0.9;
      }
      return;
    }

    wave.banner = { text: '第 ' + level + ' 关', t: 1.5 };

    // 数量随关卡增加；简单期间隔更宽松，之后越来越密
    const count = waveCount(level);
    const step = level <= EASY_UNTIL
      ? Math.max(0.30, 0.78 - level * 0.03)
      : Math.max(0.14, 0.48 - (level - EASY_UNTIL) * 0.02);

    let t = 0.2;
    for (let i = 0; i < count; i++) {
      wave.queue.push({
        delay: t,
        type: pickType(level),
        x: 42 + Math.random() * Math.max(1, G.W - 84),
      });
      t += step * (0.7 + Math.random() * 0.6);
    }
  }

  /* ---------------- 生成一只敌机 ---------------- */
  let uidSeq = 0;

  function spawn(type, x, opts) {
    opts = opts || {};

    const def = TYPES[type] || TYPES.scout;
    const lv = wave.level;
    const scale = opts.noScale ? 1 : hpScale(lv);

    const e = {
      uid: ++uidSeq,
      type,
      x,
      baseX: x,
      y: opts.y === undefined ? -34 : opts.y,
      r: def.r,
      hp: def.hp * scale,
      maxHp: 0,
      score: def.score,
      color: def.color,
      t: Math.random() * 6,
      vx: 0,
      vy: 0,
      amp: 0,
      freq: 0,
      fireCd: 0.9 + Math.random() * 1.5,
      fireCd2: 2.2,
      hitFlash: 0,
      frostT: 0,       // 霜冻弹减速剩余时间
      frostMul: 1,     // 减速倍率（越小越慢）
      /* 辐射流：持续伤害（DOT）
         辐射 / 剧毒 / 燃烧 三种来源共用这一份层数 */
      dotStacks: 0,    // 当前持续伤害层数
      dotT: 0,         // 剩余持续时间
      dotTick: 0,      // 距离下一次跳数
      art: def.art || def.r,
      xp: def.xp || 1,
      elite: false,
      state: 'enter',       // diver 用：enter → hover → dive
      stateT: 0,
      alive: true,
    };

    /* ------- 各机型的运动参数（整体降速 25% 左右） ------- */
    if (type === 'scout') {
      e.vy = 124 + Math.random() * 40 + lv * 1.6;
    } else if (type === 'zigzag') {
      e.vy = 76 + Math.random() * 24 + lv * 1.2;
      e.amp = 46 + Math.random() * 52;
      e.freq = 1.1 + Math.random() * 0.9;
    } else if (type === 'gunship') {
      e.vy = 41 + Math.random() * 12 + lv * 0.8;
      e.amp = 26 + Math.random() * 26;
      e.freq = 0.7 + Math.random() * 0.5;
    } else if (type === 'diver') {
      e.vy = 98 + lv * 1.2;
      e.hoverY = 120 + Math.random() * 150;
      e.fireCd = 1.4;
    } else if (type === 'weaver') {
      e.vy = 60 + lv * 0.8;
      e.hoverY = 80 + Math.random() * 70;
      e.amp = 120 + Math.random() * 60;
      e.freq = 0.85 + Math.random() * 0.5;
      e.fireCd = 1.6;
    } else if (type === 'splitter') {
      e.vy = 47 + lv * 0.8;
      e.amp = 34 + Math.random() * 30;
      e.freq = 0.6 + Math.random() * 0.4;
    } else if (type === 'escort') {
      e.vy = 35 + lv * 0.6;
      e.hoverY = 104;
      e.amp = G.W / 2 - 96;
      e.freq = 0.42;
      e.fireCd = 1.8;
      e.fireCd2 = 3.4;
    }

    /* ------- 精英变异 ------- */
    if (!opts.forceElite && !opts.noElite && !opts.noScale && type !== 'escort' &&
        Math.random() < eliteChance(lv)) {
      e.elite = true;
    }
    if (opts.forceElite) e.elite = true;

    if (e.elite) {
      e.hp *= ELITE_HP;
      e.r *= ELITE_R;
      e.score = Math.round(e.score * ELITE_SCORE);
      e.xp = Math.round(e.xp * ELITE_XP);
      e.vy *= 0.86;
      e.color = '#ffd166';
    }

    e.maxHp = e.hp;
    if (opts.hp) { e.hp = opts.hp; e.maxHp = opts.hp; }

    list.push(e);
    return e;
  }

  /* ---------------- 敌机开火 ---------------- */
  function enemyFire(e) {
    const B = G.bullets;
    const P = G.player;
    if (!B || !P) return;

    const lv = wave.level;
    const eliteMul = e.elite ? 1.18 : 1;
    const spd = (210 + lv * 6) * eliteMul;

    switch (e.type) {
      case 'scout': {
        const v = B.aim(e.x, e.y + 12, P.x, P.y, spd * 0.9);
        B.spawnEnemy(e.x, e.y + 12, v.vx, v.vy, { r: 4.5 });
        if (e.elite) {
          const v2 = B.aim(e.x, e.y + 12, P.x, P.y, spd * 0.9, 0.3);
          const v3 = B.aim(e.x, e.y + 12, P.x, P.y, spd * 0.9, -0.3);
          B.spawnEnemy(e.x, e.y + 12, v2.vx, v2.vy, { r: 4.5 });
          B.spawnEnemy(e.x, e.y + 12, v3.vx, v3.vy, { r: 4.5 });
        }
        e.fireCd = 2.2 + Math.random() * 1.6;
        break;
      }

      case 'zigzag': {
        const n = e.elite ? 2 : 1;
        for (let k = 0; k < n; k++) {
          const v = B.aim(e.x, e.y + 12, P.x, P.y, spd, k * 0.22);
          B.spawnEnemy(e.x, e.y + 12, v.vx, v.vy, { r: 5 });
        }
        e.fireCd = 1.9 + Math.random() * 1.4;
        break;
      }

      case 'gunship': {
        for (let k = -1; k <= 1; k++) {
          const v = B.aim(e.x, e.y + 16, P.x, P.y, spd * 0.85, k * 0.3);
          B.spawnEnemy(e.x + k * 8, e.y + 16, v.vx, v.vy, { r: 5.5 });
        }
        if (e.elite) {
          for (let k = 0; k < 8; k++) {
            const a = (k * Math.PI * 2) / 8 + e.t;
            B.spawnEnemy(e.x, e.y, Math.cos(a) * spd * 0.7, Math.sin(a) * spd * 0.7, { r: 5 });
          }
        }
        e.fireCd = 2.4 + Math.random() * 1.2;
        break;
      }

      case 'diver': {
        const n = e.elite ? 5 : 3;
        for (let k = 0; k < n; k++) {
          const off = (k - (n - 1) / 2) * 0.2;
          const v = B.aim(e.x, e.y + 12, P.x, P.y, spd * 0.8, off);
          B.spawnEnemy(e.x, e.y + 12, v.vx, v.vy, { r: 5 });
        }
        e.fireCd = 2.6 + Math.random();
        break;
      }

      case 'weaver': {
        // 一排平行弹幕，整体向前推进
        const n = e.elite ? 9 : 6;
        for (let k = 0; k < n; k++) {
          const x = e.x + (k - (n - 1) / 2) * 34;
          const a = Math.PI / 2 + (Math.random() - 0.5) * 0.16;
          B.spawnEnemy(x, e.y + 14, Math.cos(a) * spd * 0.75, Math.sin(a) * spd * 0.75, { r: 5 });
        }
        e.fireCd = 2.5 + Math.random() * 0.8;
        break;
      }

      case 'splitter': {
        for (let k = 0; k < 6; k++) {
          const a = (k * Math.PI * 2) / 6 + e.t * 0.8;
          B.spawnEnemy(e.x, e.y, Math.cos(a) * spd * 0.62, Math.sin(a) * spd * 0.62, { r: 5 });
        }
        e.fireCd = 3.0 + Math.random();
        break;
      }

      case 'escort': {
        // 双段：瞄准扇形 + 环形
        const n = 5 + Math.min(4, Math.floor(lv / 4));
        for (let k = 0; k < n; k++) {
          const off = (k - (n - 1) / 2) * 0.19;
          const v = B.aim(e.x, e.y + 20, P.x, P.y, spd * 0.95, off);
          B.spawnEnemy(e.x, e.y + 20, v.vx, v.vy, { r: 6 });
        }
        e.fireCd = 2.0 + Math.random() * 0.6;
        break;
      }
    }

    if (G.audio && G.audio.enemyShoot) G.audio.enemyShoot();
  }

  /** 护卫舰的第二段弹幕（环形） */
  function escortRadial(e) {
    const B = G.bullets;
    if (!B) return;
    const spd = 175 + wave.level * 5;
    const n = 12 + Math.min(6, Math.floor(wave.level / 3));
    for (let k = 0; k < n; k++) {
      const a = (k * Math.PI * 2) / n + e.t;
      B.spawnEnemy(e.x, e.y, Math.cos(a) * spd, Math.sin(a) * spd, { r: 5.5 });
    }
    if (G.audio && G.audio.enemyShoot) G.audio.enemyShoot();
  }

  /* ---------------- 逐帧更新敌机 ---------------- */
  function updateEnemies(dt) {
    const P = G.player;
    const S = G.stats || {};
    const slowMul = S.slow > 0 ? Math.max(0.35, 1 - 0.15 * S.slow) : 1;

    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i];
      if (!e) { list.splice(i, 1); continue; }   // 防御：清掉空槽，别让一帧异常把游戏打崩
      e.t += dt;
      e.stateT += dt;
      if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt * 5);

      /* ---- 辐射流：按"层数"结算的持续伤害 ----
         辐射 / 剧毒 / 燃烧 走的是同一条管线（upgrades.tickDot），
         公式与 Boss 共用；这里只负责把结果落到敌机身上。 */
      if (e.dotStacks > 0 && G.upgrades && G.upgrades.tickDot) {
        const R = G.upgrades.tickDot(e, dt);

        if (R.dmg > 0 && G.combat && G.combat.record) {
          // DOT 是独立伤害类型：单独用绿色飘字，和子弹伤害区分开
          G.combat.record(e.x, e.y, R.dmg, R.crit, 'dot' + e.uid, 'dot');
        }

        if (R.dead) {
          G.enemies.damage(i, 9999, { depth: 0, dot: true });
          continue;
        }

        if (R.burst) {
          if (G.particles) {
            G.particles.sweep(e.x, e.y, R.burst.radius, '#b6ff6e', 0.4, 2.5);
            G.particles.burst(e.x, e.y, { color: '#9ae66e', count: 18, speed: 300 });
          }
          if (G.upgrades.blastAround) {
            G.upgrades.blastAround(e.x, e.y, R.burst.radius, R.burst.dmg, true);
          }
        }
      }

      /* ---- 霜冻弹减速 ---- */
      let frostMul = 1;
      if (e.frostT > 0) {
        e.frostT -= dt;
        frostMul = e.frostMul || 0.5;
      }
      const speedMul = slowMul * frostMul;

      /* ---- 位移 ---- */
      switch (e.type) {
        case 'scout':
          e.y += e.vy * dt * speedMul;
          e.x += Math.sin(e.t * 0.9) * 26 * dt * speedMul;
          break;

        case 'zigzag':
        case 'gunship':
        case 'splitter':
          e.y += e.vy * dt * speedMul;
          e.x = e.baseX + Math.sin(e.t * e.freq) * e.amp;
          break;

        case 'diver':
          if (e.state === 'enter') {
            e.y += e.vy * dt * speedMul;
            if (e.y >= e.hoverY) { e.y = e.hoverY; e.state = 'hover'; e.stateT = 0; }
          } else if (e.state === 'hover') {
            e.x = e.baseX + Math.sin(e.t * 1.6) * 40;
            if (e.stateT > 0.75) {
              e.state = 'dive';
              e.stateT = 0;
              // 锁定玩家方向
              const dx = P ? P.x - e.x : 0;
              const dy = P ? P.y - e.y : 300;
              const len = Math.hypot(dx, dy) || 1;
              const sp = 430 + wave.level * 8;
              e.vx = (dx / len) * sp;
              e.vy = Math.max(160, (dy / len) * sp);
            }
          } else {
            e.x += e.vx * dt * speedMul;
            e.y += e.vy * dt * speedMul;
          }
          break;

        case 'weaver':
          if (e.state === 'enter') {
            e.y += e.vy * dt * speedMul;
            if (e.y >= e.hoverY) { e.y = e.hoverY; e.state = 'hover'; }
          } else {
            e.x = e.baseX + Math.sin(e.t * e.freq) * e.amp;
            e.y = e.hoverY + Math.sin(e.t * 1.4) * 10;
          }
          break;

        case 'escort':
          if (e.state === 'enter') {
            e.y += e.vy * dt * speedMul;
            if (e.y >= e.hoverY) { e.y = e.hoverY; e.state = 'hover'; }
          } else {
            e.x = G.W / 2 + Math.sin(e.t * e.freq) * e.amp;
            e.y = e.hoverY + Math.sin(e.t * 1.1) * 7;
          }
          break;
      }

      // 别贴边
      if (e.x < e.r) {
        e.x = e.r;
        if (e.amp) e.baseX = e.r - Math.sin(e.t * e.freq) * e.amp;
        e.vx = Math.abs(e.vx);
      }
      if (e.x > G.W - e.r) {
        e.x = G.W - e.r;
        if (e.amp) e.baseX = G.W - e.r - Math.sin(e.t * e.freq) * e.amp;
        e.vx = -Math.abs(e.vx);
      }

      /* ---- 开火 ---- */
      if (P && P.alive && e.y > 20 && e.y < G.H * 0.8) {
        e.fireCd -= dt * speedMul;
        if (e.fireCd <= 0) enemyFire(e);

        if (e.type === 'escort') {
          e.fireCd2 -= dt * speedMul;
          if (e.fireCd2 <= 0) {
            e.fireCd2 = 3.6;
            escortRadial(e);
          }
        }
      }

      /* ---- 出界回收 ---- */
      if (e.y > G.H + e.r + 30) list.splice(i, 1);
    }
  }

  /* ============================================================
     绘制
     ============================================================ */
  function drawScout(ctx) {
    ctx.fillStyle = '#ff8a5c';
    ctx.beginPath();
    ctx.moveTo(0, 14);
    ctx.lineTo(-12, -8);
    ctx.lineTo(-5, -4);
    ctx.lineTo(0, -11);
    ctx.lineTo(5, -4);
    ctx.lineTo(12, -8);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = 'rgba(255,235,200,0.95)';
    ctx.beginPath();
    ctx.arc(0, 2, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawZigzag(ctx, e) {
    ctx.rotate(Math.sin(e.t * 2.4) * 0.22);
    ctx.fillStyle = '#c07dff';
    ctx.beginPath();
    ctx.moveTo(0, 15);
    ctx.lineTo(15, 0);
    ctx.lineTo(0, -15);
    ctx.lineTo(-15, 0);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = 'rgba(20,0,40,0.65)';
    ctx.beginPath();
    ctx.moveTo(0, 7);
    ctx.lineTo(7, 0);
    ctx.lineTo(0, -7);
    ctx.lineTo(-7, 0);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = 'rgba(240,200,255,0.9)';
    ctx.beginPath();
    ctx.arc(0, 0, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawGunship(ctx, e) {
    ctx.fillStyle = '#ff5c7a';
    ctx.beginPath();
    ctx.moveTo(0, 24);
    ctx.lineTo(13, 12);
    ctx.lineTo(23, 4);
    ctx.lineTo(18, -10);
    ctx.lineTo(0, -18);
    ctx.lineTo(-18, -10);
    ctx.lineTo(-23, 4);
    ctx.lineTo(-13, 12);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,220,220,0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-14, -2);
    ctx.lineTo(14, -2);
    ctx.stroke();

    const pulse = 0.6 + 0.4 * Math.sin(e.t * 6);
    ctx.fillStyle = 'rgba(255,240,180,' + (0.55 + 0.45 * pulse).toFixed(2) + ')';
    ctx.beginPath();
    ctx.arc(0, 8, 5.5 * (0.85 + 0.15 * pulse), 0, Math.PI * 2);
    ctx.fill();
  }

  function drawDiver(ctx, e) {
    // 俯冲前会先"抬头"蓄力
    if (e.state === 'hover') ctx.rotate(Math.sin(e.t * 10) * 0.12);

    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.moveTo(0, 19);
    ctx.lineTo(-6, 2);
    ctx.lineTo(-14, -8);
    ctx.lineTo(-5, -5);
    ctx.lineTo(0, -14);
    ctx.lineTo(5, -5);
    ctx.lineTo(14, -8);
    ctx.lineTo(6, 2);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = 'rgba(90,50,0,0.8)';
    ctx.beginPath();
    ctx.moveTo(0, 10);
    ctx.lineTo(3.5, 0);
    ctx.lineTo(0, -5);
    ctx.lineTo(-3.5, 0);
    ctx.closePath();
    ctx.fill();
  }

  function drawWeaver(ctx, e) {
    const sway = Math.sin(e.t * 2) * 0.1;
    ctx.rotate(sway);

    ctx.fillStyle = '#5ce1e6';
    ctx.beginPath();
    ctx.moveTo(0, 11);
    ctx.lineTo(-19, 2);
    ctx.lineTo(-13, -13);
    ctx.lineTo(0, -8);
    ctx.lineTo(13, -13);
    ctx.lineTo(19, 2);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = 'rgba(220,255,255,0.5)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-13, -2);
    ctx.lineTo(13, -2);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(0, 3, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawSplitter(ctx, e) {
    const wob = 1 + Math.sin(e.t * 4) * 0.06;
    ctx.fillStyle = '#9ae66e';
    ctx.beginPath();
    ctx.ellipse(0, 0, 20 * wob, 17 * wob, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(20,60,0,0.55)';
    ctx.lineWidth = 1.6;
    for (let k = 0; k < 3; k++) {
      const a = e.t * 1.2 + (k * Math.PI * 2) / 3;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * 16, Math.sin(a) * 16);
      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(255,255,220,0.9)';
    ctx.beginPath();
    ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawEscort(ctx, e) {
    // 侧翼吊舱
    ctx.fillStyle = '#7a2f5c';
    ctx.strokeStyle = '#ff9de2';
    ctx.lineWidth = 2;
    [-1, 1].forEach((s) => {
      ctx.beginPath();
      ctx.moveTo(s * 42, -6);
      ctx.lineTo(s * 24, -20);
      ctx.lineTo(s * 24, 16);
      ctx.lineTo(s * 42, 10);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    });

    // 主舰体
    const g = ctx.createLinearGradient(0, -30, 0, 34);
    g.addColorStop(0, '#8a3a6a');
    g.addColorStop(0.55, '#3a1730');
    g.addColorStop(1, '#1b0a18');
    ctx.fillStyle = g;
    ctx.strokeStyle = '#ff9de2';
    ctx.beginPath();
    ctx.moveTo(0, 32);
    ctx.lineTo(-20, 16);
    ctx.lineTo(-30, -6);
    ctx.lineTo(-14, -26);
    ctx.lineTo(14, -26);
    ctx.lineTo(30, -6);
    ctx.lineTo(20, 16);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255,200,240,0.28)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-18, 0);
    ctx.lineTo(18, 0);
    ctx.moveTo(-12, 14);
    ctx.lineTo(12, 14);
    ctx.stroke();

    // 核心
    const pulse = 0.6 + 0.4 * Math.sin(e.t * 5);
    const cg = ctx.createRadialGradient(0, 0, 0, 0, 0, 24);
    cg.addColorStop(0, '#ff9de2');
    cg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.arc(0, 0, 24 * pulse, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#fff0fa';
    ctx.beginPath();
    ctx.arc(0, 0, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  /** 精英光环 + 血条 */
  function drawOverlay(ctx, e, designR) {
    // 持续伤害层数：绿色光晕 + 层数读数，让 DOT 流能看清"烂到几层了"
    // 辐射 / 剧毒 / 燃烧 三层数已经合流，所以这里只有一个读数
    if (e.dotStacks > 0) {
      const S = G.stats || {};
      const k = S.dotMax > 0 ? Math.min(1, e.dotStacks / S.dotMax) : 0;

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.10 + 0.32 * k;
      const rg = ctx.createRadialGradient(0, 0, designR * 0.3, 0, 0, designR * 1.5);
      rg.addColorStop(0, 'rgba(150,230,90,0.55)');
      rg.addColorStop(1, 'rgba(150,230,90,0)');
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(0, 0, designR * 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      if (e.dotStacks >= 3) {
        ctx.fillStyle = 'rgba(214,255,154,' + (0.55 + 0.45 * k).toFixed(2) + ')';
        ctx.font = '700 10px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('☣' + e.dotStacks, 0, designR + 13);
      }
    }

    if (e.elite) {
      const pulse = 0.55 + 0.45 * Math.sin(e.t * 5);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(0, 0, designR * 0.6, 0, 0, designR * 1.9);
      g.addColorStop(0, 'rgba(255,209,102,0.30)');
      g.addColorStop(1, 'rgba(255,209,102,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, designR * 1.9, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.strokeStyle = 'rgba(255,209,102,' + (0.5 + 0.4 * pulse).toFixed(2) + ')';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, designR * 1.28, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 血条：精英/护卫舰，或已经受过伤的大怪
    const tough = e.type === 'escort' || e.elite || e.maxHp >= 7;
    if (tough && e.hp < e.maxHp) {
      const w = designR * 2.1;
      const y = -designR - 12;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(-w / 2, y, w, 3.5);
      ctx.fillStyle = e.elite ? '#ffd166' : '#ff6b6b';
      ctx.fillRect(-w / 2, y, w * Math.max(0, e.hp / e.maxHp), 3.5);
    }

    if (e.elite) {
      ctx.fillStyle = '#ffd166';
      ctx.font = '700 11px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('★', 0, -designR - 20);
    }
  }

  const DRAW = {
    scout: drawScout,
    zigzag: drawZigzag,
    gunship: drawGunship,
    diver: drawDiver,
    weaver: drawWeaver,
    splitter: drawSplitter,
    escort: drawEscort,
  };

  /* ============================================================
     对外接口
     ============================================================ */
  G.enemies = {
    list,
    wave,
    TYPES,
    hpScale,
    waveCount,
    tierMul,
    eliteChance,
    EASY_UNTIL,
    ELITE_FROM,
    TIER_STEP,
    TIER_LEN,

    reset() {
      list.length = 0;
      wave.banner = null;
      wave.gap = 0;
      wave.queue.length = 0;
      startWave(1);
      G.level = 1;
    },

    update(dt) {
      if (wave.banner) {
        wave.banner.t -= dt;
        if (wave.banner.t <= 0) wave.banner = null;
      }

      const bossBusy = !!(G.boss && G.boss.active && G.boss.active());

      if (wave.gap > 0) {
        wave.gap -= dt;
        if (wave.gap <= 0) {
          startWave(wave.level + 1);
          return;
        }
        updateEnemies(dt);
        return;
      }

      if (wave.queue.length > 0) {
        for (let i = wave.queue.length - 1; i >= 0; i--) {
          const q = wave.queue[i];
          q.delay -= dt;
          if (q.delay <= 0) {
            spawn(q.type, q.x);
            wave.queue.splice(i, 1);
          }
        }
      } else if (list.length === 0 && !bossBusy) {
        wave.gap = 1.1;
        if (G.audio && G.audio.levelUp) G.audio.levelUp();
      }

      updateEnemies(dt);
    },

    draw() {
      const ctx = G.ctx;

      for (const e of list) {
        ctx.save();
        ctx.translate(e.x, e.y);

        const k = e.r / (e.art || e.r);
        if (k !== 1) ctx.scale(k, k);

        const designR = e.art || e.r;

        // 尾焰
        const f = 8 + Math.random() * 6;
        const g = ctx.createLinearGradient(0, -12, 0, -12 - f);
        g.addColorStop(0, 'rgba(255,180,120,0.75)');
        g.addColorStop(1, 'rgba(255,80,40,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(-4, -12);
        ctx.lineTo(4, -12);
        ctx.lineTo(0, -12 - f);
        ctx.closePath();
        ctx.fill();

        // 本体
        const fn = DRAW[e.type] || drawScout;
        fn(ctx, e);

        drawOverlay(ctx, e, designR);

        // 受击白闪
        if (e.hitFlash > 0) {
          ctx.globalAlpha = e.hitFlash * 0.85;
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(0, 0, designR * 0.9, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        }

        ctx.restore();
      }

      if (wave.banner) {
        const a = Math.min(1, wave.banner.t / 0.4);
        ctx.save();
        ctx.globalAlpha = a;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '700 30px "Segoe UI", "Microsoft YaHei", sans-serif';
        ctx.fillStyle = '#eaf9ff';
        ctx.shadowColor = 'rgba(90,200,255,0.9)';
        ctx.shadowBlur = 22;
        ctx.fillText(wave.banner.text, G.W / 2, G.H * 0.38);
        ctx.restore();
      }
    },

    spawn,

    /** 对第 i 只敌机造成伤害，返回是否击杀 */
    damage(i, dmg, opts) {
      const e = list[i];
      if (!e || !e.alive) return false;

      opts = opts || {};
      const S = G.stats || {};

      e.hp -= (dmg || 1);
      // DOT 跳数不闪白（否则敌人会一直抖）；但 DOT 引发的爆炸仍要闪
      if (!opts.dot || opts.flash) e.hitFlash = 1;

      // 辐射流：只有"常规子弹命中"才叠 DOT 层。
      // DOT 自身造成的伤害标了 opts.dot，再叠层会变成自我循环。
      if (!opts.dot && e.hp > 0 && G.upgrades && G.upgrades.applyDot) {
        G.upgrades.applyDot(e, S.dotPerHit || 0);
      }

      if (e.hp > 0) {
        if (G.audio && G.audio.hit) G.audio.hit();
        return false;
      }

      /* ---------------- 击杀 ---------------- */
      e.alive = false;

      const ex = e.x;
      const ey = e.y;
      const etype = e.type;
      const ecolor = e.color;
      const emaxHp = e.maxHp;
      const escore = e.score;
      const euid = e.uid;
      const exp = e.xp || 1;
      const eelite = e.elite;
      const designR = e.art || e.r;
      const edot = e.dotStacks || 0;

      list.splice(i, 1);

      // 辐射扩散：死亡时把层数传染给附近的敌人
      if (edot > 0 && S.dotSpread > 0) {
        const range = (70 + 26 * S.dotSpread) * (S.dotPlague > 0 ? 2 : 1);
        const give = S.dotPlague > 0 ? edot : Math.ceil(edot * 0.5);

        if (G.particles) G.particles.sweep(ex, ey, range, '#9ae66e', 0.38, 2.2);

        for (let k = list.length - 1; k >= 0; k--) {
          const nb = list[k];
          if (!nb) continue;
          if (Math.hypot(nb.x - ex, nb.y - ey) <= range + nb.r) {
            G.upgrades.applyDot(nb, give);
          }
        }
      }

      if (G.particles && G.particles.burst) {
        const big = etype === 'escort' || etype === 'gunship' || eelite;
        G.particles.burst(ex, ey, {
          color: ecolor,
          count: big ? 34 : 18,
          speed: big ? 340 : 240,
        });
      }
      if (G.audio && G.audio.explode) {
        G.audio.explode(etype === 'escort' ? 1.15 : (eelite ? 0.9 : 0.55));
      }

      // 分裂体：炸成两只侦察机（不再套娃、不再变异）
      if (etype === 'splitter' && !opts.noSplit) {
        spawn('scout', ex - 24, { y: ey, noSplit: true, noElite: true });
        spawn('scout', ex + 24, { y: ey, noSplit: true, noElite: true });
        if (G.particles) G.particles.ring(ex, ey, '#9ae66e', 12, 380);
      }

      // 计分
      const mul = (G.upgrades && G.upgrades.scoreMultiplier)
        ? G.upgrades.scoreMultiplier()
        : (S.scoreMul || 1);
      G.score += Math.round(escore * mul);
      G.hud.invalidate();

      // 经验
      if (G.progress && G.progress.addXp) G.progress.addXp(exp);

      // 击杀回调
      if (G.upgrades && G.upgrades.onKill) {
        G.upgrades.onKill(
          { x: ex, y: ey, type: etype, maxHp: emaxHp, uid: euid },
          opts.depth || 0
        );
      }

      // 掉落：精英与护卫舰必掉
      if (G.powerups && G.powerups.maybeDrop) {
        if (eelite || etype === 'escort') {
          G.powerups.spawn('rapid', ex, ey);
        }
        G.powerups.maybeDrop(ex, ey, etype);
      }

      if (G.shake) G.shake.add(etype === 'escort' ? 9 : (eelite ? 6 : (etype === 'gunship' ? 7 : 3)));

      return true;
    },
  };

  console.log('[星际突袭] 敌机系统就绪 · ' + Object.keys(TYPES).length + ' 种机型 + 精英变异');
})();
