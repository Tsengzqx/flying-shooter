/* ============================================================
   星际突袭 · 玩家战机  js/player.js
   ------------------------------------------------------------
   · 键盘 / 指针两种操控方式
   · 开火（基础单发，吃到道具后三向散射 + 高速连发）
   · 无敌帧、护盾、受击处理与残机
   ------------------------------------------------------------
   对外接口：
     Game.player.x / .y / .r / .alive / .power
     Game.player.reset() / .update(dt) / .draw() / .hit()
     Game.player.addPower(type)   供第 ⑤ 部分道具调用
   ============================================================ */
'use strict';

(function () {
  const G = (window.Game = window.Game || {});

  const BASE_CD = 0.155;      // 基础射击间隔（秒）
  const RAPID_MUL = 0.62;     // 连发道具的间隔倍率
  const RESPAWN_INVULN = 2.0; // 复活无敌时间

  const P = {
    x: 0,
    y: 0,
    r: 11,          // 受击判定半径（比外观小，手感更宽容）
    speed: 430,
    fireCd: 0,
    invuln: 0,
    alive: true,
    autoFire: true,   // 自动攻击（一直开火；测试里可临时关掉以便精确计数）
    ringCd: 0,      // 相位环射计时
    tilt: 0,        // 机身倾斜（仅视觉）
    power: { spread: 0, rapid: 0, shield: 0 },   // 道具剩余秒数
  };

  function spawnY() {
    return G.H - Math.max(84, G.H * 0.15);
  }

  P.reset = function () {
    P.x = G.W / 2;
    P.y = spawnY();
    P.fireCd = 0;
    P.invuln = 1.6 + ((G.stats && G.stats.invulnBonus) || 0);
    P.alive = true;
    P.autoFire = true;
    P.ringCd = 0;
    P.tilt = 0;
    P.power = { spread: 0, rapid: 0, shield: 0 };
  };

  /* ------------------------------------------------------------
     更新
     ------------------------------------------------------------ */
  P.update = function (dt) {
    if (!P.alive) return;

    const S = G.stats || {};
    const input = G.input;
    const ax = input ? input.axis : { x: 0, y: 0 };
    const spd = P.speed * (S.moveSpeedMul || 1);

    let dx = ax.x * spd * dt;
    let dy = ax.y * spd * dt;

    // 指针跟随
    const ptr = input && input.pointer;
    if (ptr && ptr.active) {
      const tx = ptr.x;
      const ty = ptr.y - 48;                    // 目标点抬到手指上方
      const k = Math.min(1, dt * 16 * (S.agility || 1));   // 平滑插值系数
      dx += (tx - P.x) * k;
      dy += (ty - P.y) * k;
      P.tilt += (Math.max(-0.5, Math.min(0.5, (tx - P.x) * 0.02)) - P.tilt) * Math.min(1, dt * 10);
    } else {
      P.tilt += (ax.x * 0.32 - P.tilt) * Math.min(1, dt * 10);
    }

    P.x += dx;
    P.y += dy;

    // 活动范围
    const pad = 16;
    const topLimit = pad + 34;
    if (P.x < pad) P.x = pad;
    else if (P.x > G.W - pad) P.x = G.W - pad;
    if (P.y < topLimit) P.y = topLimit;
    else if (P.y > G.H - pad) P.y = G.H - pad;

    // 计时器
    if (P.invuln > 0) P.invuln = Math.max(0, P.invuln - dt);
    for (const k in P.power) {
      if (P.power[k] > 0) P.power[k] = Math.max(0, P.power[k] - dt);
    }

    // 开火：自动攻击 —— 只要还活着就持续射击，玩家只需专注走位
    P.fireCd -= dt;
    if (P.autoFire && P.fireCd <= 0) P.fire();

    // 相位环射：周期性打出一圈全向弹幕
    if (S.ringShot > 0) {
      P.ringCd -= dt;
      if (P.ringCd <= 0) {
        P.ringCd = Math.max(1.1, 3.2 - 0.55 * S.ringShot);
        P.fireRing();
      }
    }
  };

  /**
   * 当前一次射击的实际间隔（秒）
   * 面板显示"攻击速度"用的就是它的倒数
   */
  P.effectiveCd = function () {
    const S = G.stats || {};
    let cd = BASE_CD * (S.fireRateMul || 1) * (P.power.rapid > 0 ? RAPID_MUL : 1);
    if (G.progress && G.progress.potentialMul) cd *= G.progress.potentialMul();
    return Math.max(0.03, cd);
  };

  /** 相位环射：向四周打出一圈子弹 */
  P.fireRing = function () {
    const S = G.stats || {};
    const B = G.bullets;
    if (!B || !B.spawnPlayer) return;

    const n = 8 + 4 * (S.ringShot || 1);
    const spd = 520 * (S.bulletSpeedMul || 1);
    const opt = {
      r: 3.6 * (S.bulletSizeMul || 1),
      damage: (S.damage || 1) * 0.7,
      pierce: 0,
    };

    for (let i = 0; i < n; i++) {
      const a = (i * Math.PI * 2) / n - Math.PI / 2;
      B.spawnPlayer(P.x, P.y, Math.cos(a) * spd, Math.sin(a) * spd, opt);
    }

    if (G.particles) G.particles.ring(P.x, P.y, '#a9d8ff', 10, 430);
  };

  /* ------------------------------------------------------------
     开火
     ------------------------------------------------------------ */
  P.fire = function () {
    const S = G.stats || {};

    // 射速 = 基础 × 增益属性 × 连发道具 × 潜能爆发
    P.fireCd = P.effectiveCd();

    const B = G.bullets;
    if (!B || !B.spawnPlayer) return;

    P.shootVolley(S, 1);

    // 金色 · 回响射击：有概率立刻再打一轮
    if (S.echoChance > 0 && Math.random() < S.echoChance) {
      P.shootVolley(S, 0.75);
      if (G.particles) G.particles.text(P.x, P.y - 38, '回响', '#ffd166', 14);
    }

    if (G.particles && G.particles.spark) G.particles.spark(P.x, P.y - 22, '#bff4ff');
    if (G.audio && G.audio.shoot) G.audio.shoot();
  };

  /**
   * 打出一轮完整弹幕：主炮 / 前向弹道 / 侧翼 / 尾部 / 镜像齐射
   * @param {number} power 本轮伤害倍率（回响射击用 0.75）
   */
  P.shootVolley = function (S, power) {
    const B = G.bullets;
    if (!B || !B.spawnPlayer) return;

    const spd = 760 * (S.bulletSpeedMul || 1);
    const style = S.bulletStyle || 'normal';

    // 大部分弹道共享的参数
    const base = {
      r: 4 * (S.bulletSizeMul || 1),
      damage: (S.damage || 1) * (power || 1),
      pierce: S.pierce || 0,
      homing: S.homing || 0,
      ricochet: S.bulletRicochet || 0,
      style: style,
    };
    // 只有主炮带波动，侧翼/尾部保持笔直
    const mainOpt = Object.assign({}, base, { wave: S.bulletWave || 0 });

    const UP = -Math.PI / 2;

    /* ---- 主炮：弹道多了就分排布阵 ---- */
    const spreadPower = P.power.spread > 0 ? 3 : 0;
    const n = 2 + (S.extraBullets || 0) + spreadPower;
    const spacing = 9;
    const fan = (S.spreadAngle || 0) + (P.power.spread > 0 ? 0.10 : 0);
    const perRow = 7;

    for (let i = 0; i < n; i++) {
      const row = Math.floor(i / perRow);
      const col = i % perRow;
      const inRow = Math.min(perRow, n - row * perRow);
      const k = col - (inRow - 1) / 2;
      const a = UP + k * fan;

      B.spawnPlayer(
        P.x + k * spacing,
        P.y - 20 + row * 10,
        Math.cos(a) * spd,
        Math.sin(a) * spd,
        mainOpt
      );
    }

    /* ---- 前向弹道：机首正前方的一列笔直火力 ---- */
    const front = S.frontLanes || 0;
    for (let i = 0; i < front; i++) {
      const k = i - (front - 1) / 2;
      B.spawnPlayer(P.x + k * 5, P.y - 30, 0, -spd, base);
    }

    /* ---- 侧翼炮台 ---- */
    const side = S.sideGun || 0;
    for (let i = 0; i < side; i++) {
      const off = 0.55 + i * 0.13;
      const a1 = UP - off;
      const a2 = UP + off;
      B.spawnPlayer(P.x, P.y - 6, Math.cos(a1) * spd * 0.92, Math.sin(a1) * spd * 0.92, base);
      B.spawnPlayer(P.x, P.y - 6, Math.cos(a2) * spd * 0.92, Math.sin(a2) * spd * 0.92, base);
    }

    /* ---- 尾部机炮 ---- */
    const rear = S.rearGun || 0;
    for (let i = 0; i < rear; i++) {
      const a = Math.PI / 2 + (i - (rear - 1) / 2) * 0.24;
      B.spawnPlayer(P.x, P.y + 14, Math.cos(a) * spd * 0.85, Math.sin(a) * spd * 0.85, base);
    }

    /* ---- 镜像齐射：向后同步打出一整排 ---- */
    const mirror = S.mirror || 0;
    for (let m = 0; m < mirror; m++) {
      const rowN = Math.min(perRow, n);
      for (let i = 0; i < rowN; i++) {
        const k = i - (rowN - 1) / 2;
        B.spawnPlayer(P.x + k * spacing, P.y + 16 + m * 9, 0, spd * 0.9, base);
      }
    }
  };

  /* ------------------------------------------------------------
     受击：返回 true 表示"这一下生效了"
     ------------------------------------------------------------ */
  P.hit = function () {
    if (!P.alive) return false;
    if (P.invuln > 0) return false;

    const S = G.stats || {};
    const bonus = S.invulnBonus || 0;

    // 复合装甲：概率完全免疫
    if (S.armor > 0 && Math.random() < S.armor) {
      P.invuln = 0.6 + bonus;
      if (G.particles) {
        G.particles.burst(P.x, P.y, { color: '#9ad8ff', count: 14, speed: 240 });
        G.particles.text(P.x, P.y - 34, '免疫', '#9ad8ff', 15);
      }
      if (G.audio && G.audio.shieldHit) G.audio.shieldHit();
      return true;
    }

    // 护盾抵挡一次
    if (P.power.shield > 0) {
      P.power.shield = 0;
      P.invuln = 1.0 + bonus;
      if (G.particles && G.particles.burst) {
        G.particles.burst(P.x, P.y, { color: '#7bffd0', count: 24, speed: 280 });
      }
      if (G.audio && G.audio.shieldHit) G.audio.shieldHit();
      return true;
    }

    // 真实受伤
    G.lives--;
    P.power.spread = 0;
    P.power.rapid = 0;

    if (G.particles && G.particles.burst) {
      G.particles.burst(P.x, P.y, { color: '#7fe6ff', count: 40, speed: 340 });
    }
    if (G.audio && G.audio.explode) G.audio.explode(1);
    if (G.shake) G.shake.add(14);

    if (G.lives <= 0) {
      // 凤凰核心：原地复活
      if (G.upgrades && G.upgrades.tryRevive && G.upgrades.tryRevive()) {
        G.lives = Math.max(1, Math.round((S.maxLives || 3) * 0.5));
        P.invuln = 3.0 + bonus;
        if (G.particles) {
          G.particles.burst(P.x, P.y, { color: '#ffd166', count: 60, speed: 420 });
          G.particles.text(P.x, P.y - 44, '🕊️ 凤凰重生', '#ffd166', 20);
        }
        if (G.audio && G.audio.levelUp) G.audio.levelUp();
        G.hud.invalidate();
        return true;
      }

      P.alive = false;
      G.hud.invalidate();
      G.gameOver();
      return true;
    }

    // 还有命：原地复活 + 无敌
    P.x = G.W / 2;
    P.y = spawnY();
    P.invuln = RESPAWN_INVULN + bonus;
    G.hud.invalidate();
    return true;
  };

  /* ------------------------------------------------------------
     道具加成（第 ⑤ 部分调用）
     ------------------------------------------------------------ */
  /**
   * 临时道具加成
   * @param {string} type spread / rapid / shield
   * @param {number} [durMul]  道具流"时效延长"的倍率
   * @param {number} [quality] 道具流"高级补给"的层数
   */
  P.addPower = function (type, durMul, quality) {
    durMul = durMul || 1;
    quality = quality || 0;

    const base = 8 * durMul * (1 + 0.35 * quality);
    const CAP = 40;

    if (type === 'spread') {
      P.power.spread = Math.min(CAP, P.power.spread + base);
    } else if (type === 'rapid') {
      P.power.rapid = Math.min(CAP, P.power.rapid + base);
    } else if (type === 'shield') {
      P.power.shield = Math.min(CAP, P.power.shield + base);
      // 高级补给：拾取护盾时附带短暂无敌
      if (quality > 0) P.invuln = Math.max(P.invuln, 0.6 + 0.4 * quality);
    }
  };

  /* ------------------------------------------------------------
     绘制
     ------------------------------------------------------------ */
  P.draw = function () {
    if (!P.alive) return;

    const ctx = G.ctx;
    ctx.save();
    ctx.translate(P.x, P.y);
    ctx.rotate(P.tilt);

    // 无敌帧闪烁
    const blink = P.invuln > 0 && Math.floor(G.time * 14) % 2 === 0;
    if (blink) ctx.globalAlpha = 0.35;

    // 引擎火焰
    const flame = 13 + Math.random() * 9;
    const fg = ctx.createLinearGradient(0, 10, 0, 12 + flame);
    fg.addColorStop(0, 'rgba(180,245,255,0.95)');
    fg.addColorStop(0.5, 'rgba(90,190,255,0.55)');
    fg.addColorStop(1, 'rgba(30,90,255,0)');
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.moveTo(-5.5, 10);
    ctx.lineTo(5.5, 10);
    ctx.lineTo(0, 12 + flame);
    ctx.closePath();
    ctx.fill();

    // 机身
    const body = ctx.createLinearGradient(0, -20, 0, 16);
    body.addColorStop(0, '#ffffff');
    body.addColorStop(0.42, '#73e8ff');
    body.addColorStop(1, '#1668c8');
    ctx.fillStyle = body;
    ctx.strokeStyle = 'rgba(200,245,255,0.9)';
    ctx.lineWidth = 1.2;

    ctx.beginPath();
    ctx.moveTo(0, -21);        // 机首
    ctx.lineTo(4.5, -8);
    ctx.lineTo(9, -3);
    ctx.lineTo(18, 10);        // 右翼尖
    ctx.lineTo(8, 9);
    ctx.lineTo(6.5, 16);
    ctx.lineTo(0, 12);
    ctx.lineTo(-6.5, 16);
    ctx.lineTo(-8, 9);
    ctx.lineTo(-18, 10);       // 左翼尖
    ctx.lineTo(-9, -3);
    ctx.lineTo(-4.5, -8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 座舱
    ctx.fillStyle = 'rgba(8,38,78,0.92)';
    ctx.beginPath();
    ctx.ellipse(0, -4, 3.2, 6.2, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(200,248,255,0.85)';
    ctx.beginPath();
    ctx.ellipse(-0.9, -6.4, 1.1, 2.3, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // 护盾光环（不吃闪烁影响，单独画）
    if (P.power.shield > 0) {
      const pulse = 0.5 + 0.5 * Math.sin(G.time * 8);
      ctx.save();
      ctx.translate(P.x, P.y);
      ctx.strokeStyle = 'rgba(120,255,205,' + (0.30 + 0.35 * pulse).toFixed(2) + ')';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 27 + 2 * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(120,255,205,0.12)';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.arc(0, 0, 27 + 2 * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  };

  G.player = P;
  console.log('[星际突袭] 玩家战机就绪');
})();
