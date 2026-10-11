/* ============================================================
   星际突袭 · 生命周期混沌测试  tools/chaos.js
   ------------------------------------------------------------
   专打"状态切换"这类最容易出 bug 的地方：在随机时刻暂停 / 继续 /
   送死 / 复活 / 重开 / 拾取道具 / 开关静音 / 打开图鉴 / 击破 Boss，
   看会不会把状态机搞乱、抛异常、或者"暂停了却还在动"。

   用法：
     node tools/chaos.js                  默认种子 + 200 轮
     node tools/chaos.js 999              指定种子
     node tools/chaos.js 999 400          种子 / 轮数
     node tools/chaos.js --json           机器可读输出（给 CI 用）

   退出码：0 = 没问题，1 = 有问题

   检查的不变量：
     · 任何操作都不该抛异常
     · Game.state 只能是 menu / playing / paused / gameover / upgrade
     · Game.screen 只能是 null / menu / pause / over / upgrade / codex
     · 暂停期间敌人不该移动
     · 生命值不该变成 NaN 或负数
   ============================================================ */
'use strict';

const path = require('path');
const fs = require('fs');
const vm = require('vm');

/* ---------------- 参数 ---------------- */
const argv = process.argv.slice(2);
const JSON_OUT = argv.indexOf('--json') !== -1;
const nums = argv.filter((a) => /^\d+$/.test(a)).map(Number);

const SEED = nums[0] || 424242;
const ROUNDS = nums[1] || 200;

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

let seed = SEED;
function rnd() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
const pick = (a) => a[(rnd() * a.length) | 0];

/* 每种操作被抽到的概率一样；nothing 多放几个，避免一直在切状态 */
const ACTIONS = ['pause', 'resume', 'kill', 'restart', 'powerup', 'mute',
  'toMenu', 'codex', 'levelup', 'killBoss', 'nothing', 'nothing', 'nothing'];

const POWER_TYPES = ['spread', 'rapid', 'shield', 'heal', '这个类型不存在'];

const OK_STATES = ['menu', 'playing', 'paused', 'gameover', 'upgrade'];
const OK_SCREENS = [null, 'menu', 'pause', 'over', 'upgrade', 'codex'];

const problems = [];
const seen = new Set();
function bad(kind, info) {
  const key = kind + '|' + info.where;
  if (seen.has(key)) return;
  seen.add(key);
  problems.push({ kind, info });
  if (JSON_OUT) return;
  console.log('\n!! [' + kind + ']');
  for (const k in info) console.log('     ' + k + ' = ' + info[k]);
}

if (!JSON_OUT) {
  console.log('\n=== 星际突袭 · 生命周期混沌测试 ===');
  console.log('轮数 ' + ROUNDS + '，种子 ' + SEED + '\n');
}

const acts = {};

for (let r = 0; r < ROUNDS; r++) {
  startSafe();
  G.progress.state.need = 40;          // 让升级来得快一点
  G.lives = 5;
  G.player.invuln = 0;

  for (let i = 0; i < 900; i++) {
    const a = pick(ACTIONS);
    if (a !== 'nothing') acts[a] = (acts[a] || 0) + 1;

    try {
      switch (a) {
        case 'pause':
        case 'resume':
          if (G.togglePause) G.togglePause();
          break;
        case 'kill':
          G.player.invuln = 0;
          G.player.hit();
          break;
        case 'restart':
          if (rnd() < 0.25) startSafe();
          break;
        case 'powerup':
          if (G.powerups && G.powerups.spawn) {
            G.powerups.spawn(pick(POWER_TYPES), G.player.x, G.player.y);
            if (G.powerups.apply) G.powerups.apply(pick(POWER_TYPES), G.player.x, G.player.y);
          }
          break;
        case 'mute':
          if (G.audio && G.audio.toggleMute) G.audio.toggleMute();
          break;
        case 'toMenu':
          if (rnd() < 0.2 && G.state === 'gameover' && G.toMenu) G.toMenu();
          break;
        case 'codex':
          if (G.codex) { G.codex.open('build'); G.codex.close(); }
          break;
        case 'levelup':
          if (G.progress && G.progress.addXp) G.progress.addXp(500);
          if (G.state === 'upgrade' && G.upgrades.state.offers.length) {
            G.upgrades.choose(pick(G.upgrades.state.offers).id);
          }
          break;
        case 'killBoss':
          if (G.boss.state.boss) {
            const b = G.boss.state.boss;
            b.hp = 1;
            G.boss.tryHit({ x: b.x, y: b.y, r: 4, damage: 99, critChance: 0 });
          } else if (rnd() < 0.3) {
            G.boss.start(10 + 10 * ((rnd() * 5) | 0));
          }
          break;
      }
    } catch (e) {
      bad('ACTION-CRASH', {
        where: 'R' + r + 'F' + i + ' action=' + a,
        error: (e && e.message) || String(e),
        state: G.state, screen: String(G.screen),
      });
    }

    try {
      step(16);
    } catch (e) {
      bad('STEP-CRASH', {
        where: 'R' + r + 'F' + i + ' after=' + a,
        error: (e && e.message) || String(e),
        stack: (e && e.stack ? e.stack.split('\n')[1] : ''),
        state: G.state, screen: String(G.screen),
      });
      break;
    }

    if (OK_STATES.indexOf(G.state) === -1) {
      bad('BAD-STATE', { where: 'R' + r + 'F' + i, state: G.state });
      break;
    }
    if (OK_SCREENS.indexOf(G.screen) === -1) {
      bad('BAD-SCREEN', { where: 'R' + r + 'F' + i, screen: String(G.screen) });
      break;
    }

    // 暂停必须真的暂停
    if (G.state === 'paused' && G.enemies.list.length) {
      const y0 = G.enemies.list[0].y;
      step(16);
      if (G.enemies.list.length && Math.abs(G.enemies.list[0].y - y0) > 0.01) {
        bad('PAUSE-LEAK', {
          where: 'R' + r + 'F' + i,
          moved: (G.enemies.list[0].y - y0).toFixed(2),
        });
        break;
      }
    }

    if (!isFinite(G.lives) || G.lives < 0) {
      bad('BAD-LIVES', { where: 'R' + r + 'F' + i, lives: String(G.lives) });
      break;
    }
  }
}

const ok = problems.length === 0;

if (JSON_OUT) {
  console.log(JSON.stringify({
    tool: 'chaos', ok, problems: problems.length,
    rounds: ROUNDS, actions: acts,
  }));
} else {
  console.log('触发过的操作：');
  const keys = Object.keys(acts).sort();
  for (const k of keys) console.log('  ' + k.padEnd(10) + acts[k]);
  console.log('\n=== 结果 ===\n');
  console.log(ok ? '  未发现状态机问题 ✅' : '  发现 ' + problems.length + ' 类问题 ❌');
  console.log('');
  console.log('CHAOS ' + (ok ? 'pass' : 'fail') + ' problems=' + problems.length);
}

process.exit(ok ? 0 : 1);
