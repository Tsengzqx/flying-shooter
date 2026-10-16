#!/usr/bin/env node
'use strict';
// Fast dependency-free loader/render regression. Browser pixel/decode checks are separate.
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.resolve(__dirname, '..');
const code = Object.fromEntries(['art', 'player', 'enemies', 'boss'].map((id) =>
  [id, fs.readFileSync(path.join(root, 'js', id + '.js'), 'utf8')]));
function context(mode) {
  const calls = { images: 0, sprites: [], paths: 0, timers: [] };
  const gradient = { addColorStop() {} };
  const ctx = new Proxy({ globalAlpha: 1 }, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === 'drawImage') return (image) => { calls.sprites.push(image.src); };
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => gradient;
      if (key === 'beginPath') return () => { calls.paths++; };
      return () => {};
    },
  });
  const G = { ctx, W: 540, H: 800, time: 2.4, stats: {}, log() {}, hud: { invalidate() {} } };
  const math = Object.create(Math);
  const sandbox = { window: { Game: G }, Math: math, Promise,
    setTimeout(fn) { calls.timers.push(fn); return calls.timers.length; }, clearTimeout() {} };
  if (mode !== 'no-image') sandbox.Image = class {
    constructor() { calls.images++; if (mode === 'constructor-error') throw Error('unsupported'); }
    set src(value) {
      this._src = value;
      this.naturalWidth = this.naturalHeight = 256;
      if (mode === 'load-error') queueMicrotask(() => this.onerror && this.onerror());
      else if (mode !== 'stalled') queueMicrotask(() => this.onload && this.onload());
    }
    get src() { return this._src; }
    decode() { return mode === 'decode-error' ? Promise.reject(Error('corrupt')) : Promise.resolve(); }
  };
  vm.createContext(sandbox);
  vm.runInContext(code.art, sandbox);
  return { G, sandbox, calls, math };
}
(async () => {
  for (const mode of ['no-image', 'load-error', 'decode-error', 'constructor-error', 'stalled']) {
    const env = context(mode);
    if (mode === 'stalled') env.calls.timers.forEach((fn) => fn());
    const status = await env.G.art.ready;
    assert.equal(status.total, 21);
    assert.equal(status.failed, 21, mode);
    assert.equal(status.pending, 0);
    assert.equal(env.G.art.draw(env.G.ctx, 'player', 42), false);
  }
  for (const mode of ['no-image', 'loaded']) {
    const { G, sandbox, calls, math } = context(mode);
    const ready = await G.art.ready;
    assert.equal(ready.loaded, mode === 'loaded' ? 21 : 0);
    vm.runInContext(code.art, sandbox);
    assert.equal(calls.images, mode === 'loaded' ? 21 : 0, 'No duplicate image instances');
    for (const id of ['player', 'enemies', 'boss']) vm.runInContext(code[id], sandbox);
    G.player.reset();
    G.player.power.shield = 2;
    for (const type of Object.keys(G.enemies.TYPES)) {
      const e = G.enemies.spawn(type, 200, { y: 250, noScale: true, forceElite: true });
      e.hitFlash = 1; e.dotStacks = 6; e.hp *= 0.5;
    }
    math.random = () => { throw Error('Rendering consumed gameplay random'); };
    G.player.draw();
    G.enemies.draw();
    for (let level = 10; level <= 60; level += 10) {
      math.random = () => 0.4;
      G.boss.start(level);
      math.random = () => { throw Error('Boss draw consumed gameplay random'); };
      const bs = G.boss.state.boss;
      bs.t = 2.4; bs.y = 180; bs.hp = bs.maxHp * 0.2;
      bs.phase = 3; bs.hitFlash = 1; bs.dotStacks = 8; bs.overload = true;
      G.boss.draw(); G.boss.drawUI();
      bs.alpha = 0.2; G.boss.draw();
      bs.dead = true; G.boss.draw();
    }
    assert(calls.paths > 0, 'Preserved Canvas effects/fallback');
    if (mode === 'no-image') assert.equal(calls.sprites.length, 0);
    else {
      for (const id of Object.keys(G.art.entries)) {
        assert.equal(G.art.draw(G.ctx, id, 42), true, id);
        assert(G.art.entries[id].draws > 0, id + ' drawn');
      }
      const imagesBefore = calls.images;
      G.player.draw(); G.enemies.draw(); G.boss.draw();
      assert.equal(calls.images, imagesBefore, 'Draw must not allocate/load images');
      G.ctx.drawImage = () => { throw Error('GPU/image failure'); };
      assert.equal(G.art.draw(G.ctx, 'player', 42), false);
      assert.equal(G.art.entries.player.state, 'failed');
    }
  }
  // PNG signature/dimensions are also checked without external libraries.
  const generated = JSON.parse(fs.readFileSync(path.join(root, 'assets/art/runtime/manifest.json'), 'utf8'));
  assert.equal(generated.assets.length, 21);
  for (const entry of generated.assets) {
    const png = fs.readFileSync(path.join(root, 'assets/art/runtime', entry.id + '.png'));
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    assert.equal(png.readUInt32BE(16), entry.pixels);
    assert.equal(png.readUInt32BE(20), entry.pixels);
  }
  console.log('Art regression passed: 21 PNGs; success, no Image, load/decode/constructor/timeout/draw failures; all entity fallbacks/effects; no draw-time Math.random or image allocation.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
