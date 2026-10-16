/* 持续伤害平衡探针：合法构筑、固定命中基准，不模拟走位/弹道命中率。
 * node tools/dot-probe.js；固定随机种子，失败返回非零退出码。
 * 基线只关闭新增的高层乘区和 Boss 侵蚀，其余使用相同代码。 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const smoke = fs.readFileSync(path.join(__dirname, 'smoke-test.js'), 'utf8');
const harness = smoke.slice(0, smoke.indexOf('/* ---------------- 开始测试'));

function engine(legacy) {
  const proxyFs = Object.create(fs);
  proxyFs.readFileSync = function (file, encoding) {
    let src = fs.readFileSync(file, encoding);
    if (legacy && String(file).replace(/\\/g, '/').endsWith('/js/upgrades.js')) {
      assert(src.includes('const stackMul = dotStackMultiplier(t.dotStacks);'));
      assert(src.includes("S.dotBossPct = dotLv >= 3"));
      src = src.replace('const stackMul = dotStackMultiplier(t.dotStacks);', 'const stackMul = 1;')
        .replace('S.dotBossPct = dotLv >= 3', 'S.dotBossPct = false && dotLv >= 3');
    }
    return src;
  };
  // 基线必须读模块源码，不能从已打包文件读取后再假称关闭了新机制。
  const env = Object.assign({}, process.env, { SMOKE_SEED: '123', SMOKE_BUNDLE: '' });
  const context = { console, Buffer, setTimeout, clearTimeout, setInterval, clearInterval,
    process: { env, on() {}, exit(code) { throw new Error('Harness exit: ' + code); } },
    require: (id) => id === 'fs' ? proxyFs : require(id), __dirname };
  vm.createContext(context);
  vm.runInContext(harness + '\nglobalThis.api = { G, startSafe };', context);
  context.api.G.particles = null; // 不生成装饰粒子，不影响任何伤害数值
  return context.api;
}
const old = engine(true), current = engine(false);
const POOL = current.G.upgrades.POOL;
const fullDot = Object.fromEntries(POOL.filter((b) => b.build === 'rad').map((b) => [b.id, b.max]));
const earlyDot = { dot_core: 1, dot_stack: 2, dot_power: 2, dot_burn: 1, dot_haste: 2 };
const midDot = { dot_core: 3, dot_stack: 3, dot_power: 4, dot_cap: 2, dot_haste: 3,
  dot_duration: 1, dot_burn: 3, dot_venom: 2, dot_chain: 2, dot_burst: 1 };
const earlySwarm = { swarm_ammo: 2, swarm_torrent: 1, gen_power: 3, gen_rapid: 2 };
const points = (build) => Object.values(build).reduce((a, b) => a + b, 0);

function setup(api, build, wave) {
  api.startSafe();
  const G = api.G;
  for (const [id, n] of Object.entries(build)) {
    const def = G.upgrades.POOL.find((b) => b.id === id);
    assert(def && Number.isInteger(n) && n >= 0 && n <= def.max, 'Illegal upgrade: ' + id);
    G.upgrades.owned[id] = n;
  }
  G.upgrades.state.bossKills = Math.max(0, Math.floor(wave / 10) - 1);
  G.upgrades.recalc();
  G.boss.start(wave);
  return G.boss.state.boss;
}

// 每秒10次有效叠层，从0层起步；不计子弹直伤，不运行过载与Boss自毁。
function trial(api, build, wave, cap = 600) {
  const t = setup(api, build, wave), G = api.G;
  let flat = 0, erosion = 0, time = 0, nextHit = 0;
  const dt = 0.016;
  while (time < cap && t.hp > 0) {
    if (time + 1e-9 >= nextHit) {
      G.upgrades.applyDot(t, G.stats.dotPerHit);
      nextHit += 0.1;
    }
    const r = G.upgrades.tickDot(t, dt);
    flat += r.flatDmg;
    erosion += r.erosion;
    if (r.burst) { flat += r.burst.dmg; t.hp -= r.burst.dmg; }
    time += dt;
  }
  assert(erosion <= t.maxHp * 0.025 * time + 1e-4, '侵蚀突破2.5%/秒硬上限');
  return { seconds: t.hp <= 0 ? time : null, hp: t.maxHp, flat, erosion,
    erosionShare: erosion / Math.max(1, flat + erosion), cap };
}

console.log('=== DOT 后期平衡探针（固定命中，不代表走位实战） ===');
console.log('层数均符合 POOL.max；每秒10次叠层；不计子弹直伤、护卫、过载；含真实引爆。');
const rows = [];
for (const [wave, build] of [[10, earlyDot], [30, midDot], [60, fullDot], [100, fullDot]]) {
  const before = trial(old, build, wave), after = trial(current, build, wave);
  rows.push({ wave, before, after });
  console.log(JSON.stringify({ boss: wave, points: points(build), hp: after.hp,
    beforeSeconds: before.seconds === null ? '>600' : +before.seconds.toFixed(2),
    afterSeconds: after.seconds === null ? '>600' : +after.seconds.toFixed(2),
    erosionShare: (100 * after.erosionShare).toFixed(1) + '%' }));
}
assert(Math.abs(rows[0].before.seconds - rows[0].after.seconds) < 1e-8, '前期DOT不应获得额外强化');
for (const row of rows.slice(2)) {
  assert(row.after.seconds !== null && row.after.seconds < 65, '后期专精DOT应在65秒内完成固定命中基准');
  assert(row.before.seconds === null || row.after.seconds < row.before.seconds, '后期DOT未改善');
}

// 同为8点的前期单目标上界：所有主炮弹道命中，DOT按实际基础射速叠层。
// 不用后期满配数据冒充前期平衡，也不把随机掉落/走位算进差值。
function earlyDps(build, duration) {
  const t = setup(current, build, 10), G = current.G;
  t.hp = t.maxHp = 1e12;
  let total = 0, cd = 0;
  const dt = 0.016;
  for (let time = 0; time < duration; time += dt) {
    cd -= dt;
    if (cd <= 0) {
      cd += G.player.effectiveCd();
      const lanes = G.player.volleyCount(G.stats);
      total += lanes * G.stats.damage * (1 + G.stats.critChance * (G.stats.critMul - 1));
      for (let i = 0; i < lanes; i++) G.upgrades.applyDot(t, G.stats.dotPerHit);
    }
    const r = G.upgrades.tickDot(t, dt);
    total += r.dmg + (r.burst ? r.burst.dmg : 0);
  }
  return total / duration;
}
assert(points(earlyDot) === points(earlySwarm));
const swarmDps = earlyDps(earlySwarm, 8), dotDps = earlyDps(earlyDot, 8);
console.log('前期8点/8秒单目标全命中基准：弹幕DPS=' + swarmDps.toFixed(1) + '，DOT构筑DPS=' + dotDps.toFixed(1));
assert(swarmDps > dotDps, '前期弹幕定位被侵蚀');

// 子弹专精无法偷取百分比通道；子弹属性也不能增强已解锁的侵蚀。
setup(current, fullDot, 100);
const fields = ['dotPerStack', 'dotPerHit', 'dotMax', 'dotInterval', 'dotCritChance', 'dotCritMul', 'dotBossPct'];
const snapshot = fields.map((k) => current.G.stats[k]);
for (const b of POOL.filter((b) => b.build !== 'rad')) current.G.upgrades.owned[b.id] = b.max;
current.G.upgrades.recalc();
assert.deepStrictEqual(fields.map((k) => current.G.stats[k]), snapshot);
setup(current, { dot_core: 1, gen_power: 8, gen_crit: 6, gen_rapid: 5 }, 100);
assert.strictEqual(current.G.stats.dotBossPct, 0);
setup(current, {}, 100);
const t = current.G.boss.state.boss;
t.dotStacks = 100; t.dotT = 20; t.dotFocus = 8;
assert.strictEqual(current.G.upgrades.tickDot(t, 0.05).dmg, 0);
console.log('PASS：合法层数、前期定位、后期提升、侵蚀预算、独立性和点火前置。');
process.exit(0);
