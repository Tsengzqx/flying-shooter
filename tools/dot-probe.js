/* ============================================================
   开发用探针：在真实游戏循环里量化"持续伤害 DOT"的贡献，
   并验证它确实不吃常规子弹加成。
   ------------------------------------------------------------
   用法：node tools/dot-probe.js
   （只是开发自检工具，删掉不影响游戏）
   ============================================================ */
'use strict';

const path = require('path');
const fs = require('fs');
const vm = require('vm');

/* 复用冒烟测试的桩环境：取到"开始测试"之前的全部脚手架 */
const smokeSrc = fs.readFileSync(path.join(__dirname, 'smoke-test.js'), 'utf8');
const harness = smokeSrc.slice(0, smokeSrc.indexOf('/* ---------------- 开始测试'));

const ctx = {
  console,
  require,
  module: { exports: {} },
  exports: {},
  process,
  Buffer,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  __dirname: path.join(__dirname),
  __filename: path.join(__dirname, 'dot-probe.js'),
};
ctx.global = ctx;
ctx.window = ctx;
ctx.self = ctx;
ctx.globalThis = ctx;

vm.createContext(ctx);
/* 把脚手架内部的 sandbox / step / startSafe 借出来（追加代码与它们同一作用域） */
vm.runInContext(
  harness +
  '\n;globalThis.__probe = { G: sandbox.Game, step: step, startSafe: startSafe };',
  ctx,
  { filename: 'harness.js' }
);

const G = ctx.__probe.G;
const step = ctx.__probe.step;
const startSafe = ctx.__probe.startSafe;

const BULLET_BUFFS = [
  'gen_power', 'gen_bigshot', 'gen_heavy', 'gen_crit', 'gen_critdmg',
  'gen_rapid', 'gen_hitpower', 'gen_execute', 'gen_berserk',
  'swarm_ammo', 'swarm_torrent', 'lv_power', 'item_power',
];
const DOT_BUFFS = [
  'dot_core', 'dot_stack', 'dot_power', 'dot_cap', 'dot_haste',
  'dot_duration', 'dot_burn', 'dot_venom', 'dot_crit', 'dot_critdmg',
];

/** 打一只无敌的靶子 N 帧，返回累计伤害 */
function measure(buffs, frames) {
  startSafe();
  G.upgrades.reset();
  for (const id of buffs) G.upgrades.owned[id] = 5;
  G.upgrades.recalc();

  G.enemies.list.length = 0;
  G.enemies.wave.queue.length = 0;
  if (G.boss && G.boss.reset) G.boss.reset();
  G.enemies.spawn('gunship', G.W / 2);

  const e = G.enemies.list[0];
  e.hp = 1e9;
  e.x = G.W / 2;
  e.baseX = G.W / 2;
  e.y = G.H * 0.45;
  e.vy = 0;
  e.fireCd = 1e9;
  if (G.progress) G.progress.state.need = Infinity;

  let dealt = 0;
  for (let i = 0; i < frames; i++) {
    const hp0 = e.hp;
    step(16);
    dealt += Math.max(0, hp0 - e.hp);   // 敌机可能被打出列表，用 hp 差值累计
    if (e.hp > 1e9) e.hp = 1e9;
  }
  return { dealt, stacks: e.dotStacks, maxStacks: G.stats.dotMax };
}

const FRAMES = 480;   // 约 7.7 秒

console.log('\n=== 持续伤害 DOT 探针 ===\n');

const bulletOnly = measure(BULLET_BUFFS, FRAMES);
console.log('[A] 纯子弹流（不拿辐射源）');
console.log('    总伤害 = ' + bulletOnly.dealt.toFixed(0));
console.log('    层数   = ' + (bulletOnly.stacks || 0) + '  ← 必须是 0\n');

const bulletPlusDot = measure(BULLET_BUFFS.concat(DOT_BUFFS), FRAMES);
console.log('[B] 子弹流 + 满辐射流');
console.log('    总伤害 = ' + bulletPlusDot.dealt.toFixed(0));
console.log('    层数   = ' + bulletPlusDot.stacks + ' / 上限 ' + bulletPlusDot.maxStacks);
const extra = bulletPlusDot.dealt - bulletOnly.dealt;
console.log('    DOT 贡献 ≈ ' + extra.toFixed(0) + '  (' +
  ((bulletPlusDot.dealt / Math.max(1, bulletOnly.dealt) - 1) * 100).toFixed(1) + '%)');
console.log('    DOT 占比 ≈ ' +
  ((extra / Math.max(1, bulletPlusDot.dealt)) * 100).toFixed(1) + '%\n');

/* ---- 独立性：只拿辐射流时，子弹加成不该改变 DOT 数值 ---- */
const snapshot = (dotLevels, bulletLevels) => {
  startSafe();
  G.upgrades.reset();
  for (const id of DOT_BUFFS) if (dotLevels > 0) G.upgrades.owned[id] = dotLevels;
  for (const id of BULLET_BUFFS) if (bulletLevels > 0) G.upgrades.owned[id] = bulletLevels;
  G.upgrades.recalc();
  const S = G.stats;
  return {
    perStack: S.dotPerStack,
    perHit: S.dotPerHit,
    max: S.dotMax,
    interval: S.dotInterval,
    duration: S.dotDuration,
    crit: S.dotCritChance,
    critMul: S.dotCritMul,
    bulletDamage: S.damage,
    bulletCrit: S.critChance,
    bulletCritMul: S.critMul,
    bulletRate: S.fireRateMul,
    lanes: S.extraBullets,
  };
};

const DOT_LV = 3;
const pure = snapshot(DOT_LV, 0);       // 只拿辐射流
const mixed = snapshot(DOT_LV, 5);      // 同样的辐射流 + 满子弹流

console.log('[C] 独立性检查：辐射流等级不变（都取 ' + DOT_LV + ' 级），只额外塞满子弹流');
console.log('    此时子弹侧：伤害 ' + mixed.bulletDamage.toFixed(1) +
  ' / 暴击 ' + Math.round(mixed.bulletCrit * 100) + '% / 暴伤 ' +
  Math.round(mixed.bulletCritMul * 100) + '% / 射速系数 ' +
  mixed.bulletRate.toFixed(3) + ' / 额外弹道 ' + mixed.lanes);

let clean = true;
for (const k of ['perStack', 'perHit', 'max', 'interval', 'duration', 'crit', 'critMul']) {
  const same = pure[k] === mixed[k];
  if (!same) clean = false;
  console.log('    ' + (same ? 'OK ' : '!! ') + k.padEnd(9) +
    ' ' + pure[k] + ' → ' + mixed[k]);
}
console.log('    结论：' + (clean ? 'DOT 完全不受子弹加成影响 ✅' : '存在串味 ❌') + '\n');

/* ---- 只拿子弹流时，DOT 伤害必须为 0 ---- */
console.log('[D] 只拿子弹流时的 DOT 伤害应该为 0');
const bulletOnlySnap = snapshot(0, 5);
console.log('    dotActive = ' + G.stats.dotActive +
  ' , dotPerStack = ' + G.stats.dotPerStack);
console.log('    实际 DOT 跳伤（100 次 1 秒跳数）=' +
  (() => {
    const t = { x: 0, y: 0, r: 10, hp: 1e9, dotStacks: 99, dotT: 99, dotTick: 0 };
    for (let i = 0; i < 100; i++) G.upgrades.tickDot(t, 1);
    return (1e9 - t.hp).toFixed(4);
  })());

/* ---- DPS 公式自检：缩短间隔必须真的提高 DPS ---- */
console.log('\n[E] "高频衰变 / 衰变链"必须真的提高 DPS（回归：间隔被约掉）');
G.upgrades.reset();
G.upgrades.owned.dot_core = 3;
G.upgrades.recalc();
const dpsOf = () => {
  const S = G.stats;
  const t = { x: 0, y: 0, r: 10, hp: 1e12, dotStacks: 30, dotT: 1e9, dotTick: 0 };
  const before = t.hp;
  for (let i = 0; i < 400; i++) G.upgrades.tickDot(t, 0.05);   // 20 秒
  return (before - t.hp) / 20;
};
const dpsBase = dpsOf();
G.upgrades.owned.dot_haste = 4;
G.upgrades.recalc();
const dpsHaste = dpsOf();
G.upgrades.owned.dot_chain = 3;
G.upgrades.recalc();
const dpsChain = dpsOf();
console.log('    基础（间隔 ' + G.stats.dotInterval.toFixed(3) + 's，30 层）DPS = ' +
  dpsBase.toFixed(1));
console.log('    + 高频衰变 4 级                          DPS = ' + dpsHaste.toFixed(1) +
  '  (×' + (dpsHaste / dpsBase).toFixed(2) + ')');
console.log('    + 衰变链 3 级（间隔 ' + G.stats.dotInterval.toFixed(3) + 's 再压缩）DPS = ' +
  dpsChain.toFixed(1) + '  (×' + (dpsChain / dpsBase).toFixed(2) + ')');
console.log('    结论：' + (dpsHaste > dpsBase * 1.2 && dpsChain > dpsHaste * 1.2
  ? '两个增益都真实生效 ✅' : '有一个没生效 ❌') + '\n');
