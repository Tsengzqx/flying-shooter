/* ============================================================
   星际突袭 · 不变量模糊测试  tools/fuzz.js
   ------------------------------------------------------------
   反复随机开局、随机选强化、随机输入、随机强推关卡，
   每一帧检查一批"永远不该发生"的情况：

     · 抛异常（含完整现场：第几轮第几帧、当时关卡与 Boss）
     · Game.stats 里出现 NaN / Infinity
     · 玩家 / Boss / 敌机的坐标、血量变成 NaN
     · 子弹 / 敌机 / 粒子数组无限增长（泄漏）

   用法：
     node tools/fuzz.js                   默认种子 + 20 轮
     node tools/fuzz.js 777               指定种子
     node tools/fuzz.js 777 40 2600       种子 / 轮数 / 每轮帧数
     node tools/fuzz.js --json            只输出一行机器可读结果（给 CI 用）

   退出码：0 = 没发现问题，1 = 发现了（可直接接进 CI）

   说明：种子只决定**本脚本自己**的随机选择（初始强化、关卡、输入时机）。
   游戏内部大量使用 Math.random()，没有播种，所以同一种子每次跑出来的
   路径并不完全相同 —— 这是有意的：覆盖更广，才更容易撞出稀有 bug。
   这个脚本当初就是这样抓到"爆裂弹连环爆炸 100% 崩溃"的。
   ============================================================ */
'use strict';

const path = require('path');
const fs = require('fs');
const vm = require('vm');

/* ---------------- 参数 ---------------- */
const argv = process.argv.slice(2);
const JSON_OUT = argv.indexOf('--json') !== -1;
const nums = argv.filter((a) => /^\d+$/.test(a)).map(Number);

const SEED = nums[0] || 20261006;
const ROUNDS = nums[1] || 20;
const FRAMES = nums[2] || 2200;

/* ---------------- 复用冒烟测试的桩环境 ---------------- */
const smokeSrc = fs.readFileSync(path.join(__dirname, 'smoke-test.js'), 'utf8');
const harness = smokeSrc.slice(0, smokeSrc.indexOf('/* ---------------- 开始测试'));

const ctx = {
  console, require, module: { exports: {} }, exports: {}, process, Buffer,
  setTimeout, clearTimeout, setInterval, clearInterval, __dirname: __dirname,
};
ctx.global = ctx; ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(harness + '\n;globalThis.__p={G:sandbox.Game,step:step,startSafe:startSafe};',
  ctx, { filename: 'harness.js' });

const G = ctx.__p.G;
const step = ctx.__p.step;
const startSafe = ctx.__p.startSafe;

/* ---------------- 可复现的伪随机（只管本脚本的选择） ---------------- */
let seed = SEED;
function rnd() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
const pick = (arr) => arr[(rnd() * arr.length) | 0];

/* ---------------- 数组上限告警 ---------------- */
const CAPS = {
  friendly: 4000, hostile: 3000, enemies: 300, particles: 6000,
};

/* 这些字段"无穷大"是设计如此（表示无上限），不算问题 */
const ALLOW_INF = { hitDamageCap: 1 };

const problems = [];
const seen = new Set();

function report(kind, info) {
  const key = kind + '|' + info.where;
  if (seen.has(key)) return;
  seen.add(key);
  problems.push({ kind, info });
  if (JSON_OUT) return;
  console.log('\n!! [' + kind + '] ' + info.where);
  for (const k in info) if (k !== 'where') console.log('     ' + k + ' = ' + info[k]);
}

function checkStats(tag) {
  const S = G.stats;
  for (const k in S) {
    const v = S[k];
    if (typeof v !== 'number') continue;
    if (Number.isNaN(v)) {
      report('NaN-STAT', { where: tag + ' stats.' + k, value: String(v) });
    } else if (!isFinite(v) && !ALLOW_INF[k]) {
      report('INF-STAT', { where: tag + ' stats.' + k, value: String(v) });
    }
  }
}

function checkEntity(tag, name, o) {
  if (!o) return;
  for (const k of ['x', 'y', 'hp', 'maxHp', 'r', 'vx', 'vy']) {
    if (o[k] === undefined) continue;
    if (typeof o[k] !== 'number' || !isFinite(o[k])) {
      report('NaN-ENTITY', {
        where: tag + ' ' + name + '.' + k,
        value: String(o[k]),
        type: o.type || o.id || '?',
      });
      return;
    }
  }
}

function checkCaps(tag) {
  const B = G.bullets;
  const pairs = [
    ['friendly', B ? B.friendly.length : 0],
    ['hostile', B ? B.hostile.length : 0],
    ['enemies', G.enemies ? G.enemies.list.length : 0],
    ['particles', G.particles ? G.particles.list.length : 0],
  ];
  for (const [k, n] of pairs) {
    if (n > CAPS[k]) report('LEAK', { where: tag + ' ' + k, count: n, cap: CAPS[k] });
  }
}

/* ---------------- 主循环 ---------------- */
if (!JSON_OUT) {
  console.log('\n=== 星际突袭 · 不变量模糊测试 ===');
  console.log('轮数 ' + ROUNDS + ' × 每轮 ' + FRAMES + ' 帧，种子 ' + SEED + '\n');
}

let maxLevel = 0;
let maxFriendly = 0;
let maxHostile = 0;
let maxEnemies = 0;
let maxParticles = 0;
const bossesSeen = new Set();
let overloadSeen = 0;

for (let round = 0; round < ROUNDS; round++) {
  startSafe();

  // 随机给一批初始强化，制造各种离谱组合
  const ids = G.upgrades.POOL.map((b) => b.id);
  const n0 = 3 + ((rnd() * 25) | 0);
  for (let i = 0; i < n0; i++) {
    const id = pick(ids);
    const def = G.upgrades.POOL.find((b) => b.id === id);
    G.upgrades.owned[id] = Math.max(G.upgrades.owned[id] || 0, 1 + ((rnd() * def.max) | 0));
  }
  G.upgrades.recalc();

  // 随机推到一个关卡，覆盖各个 Boss
  const lvl = 1 + ((rnd() * 65) | 0);
  G.enemies.wave.level = lvl - 1;
  G.enemies.wave.queue.length = 0;
  G.enemies.list.length = 0;

  // 一部分轮次允许死亡，去覆盖 gameover 流程
  const immortal = rnd() < 0.6;

  for (let f = 0; f < FRAMES; f++) {
    if (rnd() < 0.25) {
      G.input.held.left = rnd() < 0.5;
      G.input.held.right = rnd() < 0.5;
      G.input.held.up = rnd() < 0.5;
      G.input.held.down = rnd() < 0.5;
    }
    if (immortal) {
      G.player.invuln = 1e6;
      if (G.lives < 2) G.lives = 2;
    }

    if (G.state === 'upgrade' && G.upgrades.state.offers.length) {
      G.upgrades.choose(pick(G.upgrades.state.offers).id);
    }
    if (G.state === 'gameover') {
      startSafe();
      G.enemies.wave.level = lvl - 1;
      G.enemies.wave.queue.length = 0;
    }

    // 少量轮次强制触发过载，覆盖那条分支
    const boss = G.boss.state.boss;
    if (boss && rnd() < 0.02) {
      boss.fightT = Math.max(boss.fightT, G.boss.OVERLOAD_AFTER);
      if (boss.overload) overloadSeen++;
    }

    const tag = 'R' + round + 'F' + f;

    try {
      step(16);
    } catch (e) {
      report('CRASH', {
        where: tag,
        error: (e && e.message) || String(e),
        stack: (e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : ''),
        level: G.level,
        state: G.state,
        boss: G.boss.state.boss ? G.boss.state.boss.name : '-',
      });
      break;
    }

    checkStats(tag);

    const b = G.boss.state.boss;
    if (b) {
      bossesSeen.add(b.name);
      checkEntity(tag, 'boss', b);
    }
    checkEntity(tag, 'player', G.player);

    const L = G.enemies.list;
    for (let i = 0; i < L.length; i++) checkEntity(tag, 'enemy[' + i + ']', L[i]);
    checkCaps(tag);

    const B = G.bullets;
    if (B) {
      maxFriendly = Math.max(maxFriendly, B.friendly.length);
      maxHostile = Math.max(maxHostile, B.hostile.length);
    }
    maxEnemies = Math.max(maxEnemies, L.length);
    if (G.particles) maxParticles = Math.max(maxParticles, G.particles.list.length);
    maxLevel = Math.max(maxLevel, G.level);
  }

  if (!JSON_OUT && (round + 1) % 10 === 0) {
    process.stdout.write('  ...' + (round + 1) + '/' + ROUNDS + ' 轮，目前 ' +
      problems.length + ' 个问题\n');
  }
}

/* ---------------- 结果 ---------------- */
const ok = problems.length === 0;

if (JSON_OUT) {
  console.log(JSON.stringify({
    tool: 'fuzz', ok, problems: problems.length, rounds: ROUNDS, frames: FRAMES,
    maxLevel, bosses: [...bossesSeen], peaks: {
      friendly: maxFriendly, hostile: maxHostile,
      enemies: maxEnemies, particles: maxParticles,
    },
  }));
} else {
  console.log('\n=== 结果 ===\n');
  console.log('  问题数        : ' + problems.length);
  console.log('  达到的最高关卡: ' + maxLevel);
  console.log('  见过的 Boss   : ' + bossesSeen.size + ' 种  ' + [...bossesSeen].join(' / '));
  console.log('  触发过载次数  : ' + overloadSeen);
  console.log('  峰值子弹(我方): ' + maxFriendly + '   (告警线 ' + CAPS.friendly + ')');
  console.log('  峰值子弹(敌方): ' + maxHostile + '   (告警线 ' + CAPS.hostile + ')');
  console.log('  峰值敌机      : ' + maxEnemies + '   (告警线 ' + CAPS.enemies + ')');
  console.log('  峰值粒子      : ' + maxParticles + '   (告警线 ' + CAPS.particles + ')');
  console.log('');
  console.log(ok ? '  未发现异常 ✅' : '  发现 ' + problems.length + ' 类问题 ❌');
  console.log('');
  console.log('FUZZ ' + (ok ? 'pass' : 'fail') + ' problems=' + problems.length);
}

process.exit(ok ? 0 : 1);
