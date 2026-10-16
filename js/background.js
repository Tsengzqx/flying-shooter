/* 星际深空 · 独立的、纯视觉 Canvas2D 背景。
 * 不消费 Math.random：固定种子 PRNG / 整数噪声与战斗随机源完全隔离。
 * 固定缓存上限：1 张 320×384 星空 + 最多 6 张 512×512 星体（约 6.5 MiB RGBA）。
 * 纹理仅首次 draw 按需同步生成；resize/reset 保留缓存，无异步任务、无屏幕尺寸纹理。
 * 主画布仅 source-over；不触碰 DPR transform，不写入任何战斗状态。
 */
'use strict';
(function () {
  const G = (window.Game = window.Game || {});
  const TAU = Math.PI * 2;
  const FADE_SECONDS = 2.6;
  const defs = Object.freeze({
    hive: Object.freeze({ material: 'arid-rock', radius: 0.235, x: 0.73, y: 0.24, maxAlpha: 0.64, seed: 173, tint: '#b99652' }),
    reaver: Object.freeze({ material: 'violet-gas', radius: 0.305, x: 0.24, y: 0.28, maxAlpha: 0.61, seed: 419, tint: '#9263b5' }),
    dread: Object.freeze({ material: 'lava-fissures', radius: 0.265, x: 0.75, y: 0.31, maxAlpha: 0.62, seed: 853, tint: '#bf593a' }),
    arbiter: Object.freeze({ material: 'ice-ocean', radius: 0.345, x: 0.27, y: 0.20, maxAlpha: 0.60, seed: 1249, tint: '#71aeba' }),
    endwalker: Object.freeze({ material: 'violet-frost', radius: 0.205, x: 0.72, y: 0.19, maxAlpha: 0.66, seed: 1979, tint: '#77618f' }),
    devourer: Object.freeze({ material: 'ringed-giant', radius: 0.39, x: 0.67, y: 0.22, maxAlpha: 0.60, seed: 2843, tint: '#c29554' }),
  });
  const ids = Object.keys(defs);
  const textures = Object.create(null);
  const weights = Object.create(null);
  const state = { currentId: null, previousId: null, alpha: 0, previousAlpha: 0, time: 0, width: 0, height: 0 };
  const debug = { skyBuilds: 0, planetBuilds: 0, cachedPlanets: 0, pixelTextures: 0, fallbackTextures: 0, maxPlanetSize: 512, skyWidth: 320, skyHeight: 384 };
  let sky = null;
  let stars = null;
  for (const id of ids) weights[id] = 0;

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const smooth = v => { v = clamp(v, 0, 1); return v * v * (3 - 2 * v); };
  const mix = (a, b, t) => a + (b - a) * t;
  function rng(seed) {
    return function () {
      seed |= 0;
      seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash(x, y, z, seed) {
    let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647) ^ seed;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  }
  // 连续三维 value noise：在球面取样，不使用平面贴图假冒球体。
  function noise(x, y, z, seed) {
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    let u = x - ix, v = y - iy, w = z - iz;
    u = u * u * (3 - 2 * u); v = v * v * (3 - 2 * v); w = w * w * (3 - 2 * w);
    return mix(mix(mix(hash(ix, iy, iz, seed), hash(ix + 1, iy, iz, seed), u),
      mix(hash(ix, iy + 1, iz, seed), hash(ix + 1, iy + 1, iz, seed), u), v),
    mix(mix(hash(ix, iy, iz + 1, seed), hash(ix + 1, iy, iz + 1, seed), u),
      mix(hash(ix, iy + 1, iz + 1, seed), hash(ix + 1, iy + 1, iz + 1, seed), u), v), w);
  }
  function fbm(x, y, z, seed, octaves) {
    let total = 0, amp = 0.54, norm = 0;
    for (let i = 0; i < octaves; i++) {
      total += noise(x, y, z, seed + i * 117) * amp;
      norm += amp; amp *= 0.48;
      x = x * 2.07 + 13.1; y = y * 2.07 - 7.3; z = z * 2.07 + 5.7;
    }
    return total / norm;
  }
  function canvasOf(w, h) {
    let canvas;
    if (typeof document !== 'undefined' && document.createElement) canvas = document.createElement('canvas');
    else if (typeof OffscreenCanvas !== 'undefined') canvas = new OffscreenCanvas(w, h);
    if (!canvas) return null;
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext && canvas.getContext('2d');
    return ctx ? { canvas, ctx } : null;
  }
  function pixels(ctx, w, h) {
    // 测试桩没有完整像素 API 时直接走轻量渐变，绝不执行全像素噪声循环。
    if (typeof ctx.createImageData !== 'function' || typeof ctx.getImageData !== 'function' || typeof ctx.putImageData !== 'function') return null;
    try {
      const image = ctx.createImageData(w, h);
      return image && image.data && image.data.length === w * h * 4 ? image : null;
    } catch (_) { return null; }
  }
  function layout(id, w, h) {
    if (!Object.prototype.hasOwnProperty.call(defs, id)) return null;
    const d = defs[id];
    w = Number.isFinite(w) ? Math.max(0, w) : 0;
    h = Number.isFinite(h) ? Math.max(0, h) : 0;
    const r = Math.min(w, h) * d.radius;
    return { x: w * d.x, y: h * d.y, r, radius: r, textureScale: id === 'devourer' ? 256 / 148 : 256 / 230 };
  }
  function resize(w = G.W, h = G.H) {
    state.width = Number.isFinite(w) ? Math.max(0, w) : 0;
    state.height = Number.isFinite(h) ? Math.max(0, h) : 0;
  }
  function reset() {
    state.currentId = state.previousId = null;
    state.alpha = state.previousAlpha = state.time = 0;
    for (const id of ids) weights[id] = 0;
  }
  function update(dt) {
    if (G.state === 'paused' || G.state === 'upgrade') return;
    if (G.state === 'menu') { reset(); return; }
    const playing = G.state === 'playing';
    const bs = G.boss && G.boss.state && G.boss.state.boss;
    const bossId = playing && bs && !bs.dead && bs.def && bs.def.id;
    const target = bossId && Object.prototype.hasOwnProperty.call(defs, bossId) ? bossId : null;
    if (!playing && !ids.some(id => weights[id] > 0)) return;
    dt = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    state.time += dt;
    // 各自保留淡出权重，即使快速连续切换也不会把旧星体瞬间重置成满亮。
    state.currentId = target;
    let previous = null, previousAlpha = 0;
    for (const id of ids) {
      weights[id] = clamp(weights[id] + (id === target ? 1 : -1) * dt / FADE_SECONDS, 0, 1);
      const alpha = smooth(weights[id]) * defs[id].maxAlpha;
      if (id !== target && alpha > previousAlpha) { previous = id; previousAlpha = alpha; }
    }
    state.alpha = target ? smooth(weights[target]) * defs[target].maxAlpha : 0;
    state.previousId = previous;
    state.previousAlpha = previousAlpha;
  }

  function buildSky() {
    const result = canvasOf(320, 384);
    if (!result) return null;
    const c = result.ctx, im = pixels(c, 320, 384);
    if (im) {
      debug.pixelTextures++;
      const data = im.data;
      for (let y = 0; y < 384; y++) {
        for (let x = 0; x < 320; x++) {
          const u = x / 320, v = y / 384;
          const cloud = fbm(u * 4.2, v * 5.3, 1.9, 617, 5);
          const wisps = fbm(u * 9 + cloud * 2.2, v * 10, 4.1, 997, 4);
          const axis = u - (0.10 + v * 0.83 + 0.065 * Math.sin(v * 7));
          const band = Math.exp(-axis * axis / 0.012);
          const halo = Math.exp(-axis * axis / 0.07);
          const lane = smooth((wisps - 0.43) * 5) * band;
          const dust = smooth((cloud - 0.39) * 3.5);
          const filaments = Math.max(0, wisps - 0.34) * band * (1 - lane * 0.88);
          const i = (y * 320 + x) * 4;
          data[i] = 2 + dust * 4 + halo * 3 + filaments * 82;
          data[i + 1] = 4 + dust * 5 + halo * 4 + filaments * 91;
          data[i + 2] = 9 + dust * 10 + halo * 7 + filaments * 124;
          data[i + 3] = 255;
        }
      }
      c.putImageData(im, 0, 0);
      // 银河的细粒星群烘焙在远景中：不在每帧画成一群亮弹丸。
      const random = rng(10091);
      for (let i = 0; i < 2600; i++) {
        const v = random(), spread = (random() + random() + random() - 1.5) * 0.16;
        const u = 0.10 + v * 0.83 + 0.065 * Math.sin(v * 7) + spread;
        c.fillStyle = i % 4 === 0 ? 'rgba(196,175,154,0.23)' : 'rgba(166,187,213,0.27)';
        const s = 0.23 + random() * 0.30;
        c.fillRect(u * 320, v * 384, s, s);
      }
    } else {
      debug.fallbackTextures++;
      c.fillStyle = '#030710'; c.fillRect(0, 0, 320, 384);
      if (typeof c.createLinearGradient === 'function') {
        const g = c.createLinearGradient(0, 384, 320, 0);
        g.addColorStop(0, '#030710'); g.addColorStop(0.48, '#0b1321'); g.addColorStop(1, '#030710');
        c.fillStyle = g; c.fillRect(0, 0, 320, 384);
      }
    }
    debug.skyBuilds++;
    return result.canvas;
  }
  function makeStars() {
    const random = rng(0x571a9);
    const colors = ['#b4c4dc', '#9eacc5', '#d6c2a5', '#9dbacb'];
    return Array.from({ length: 180 }, (_, i) => ({
      x: random(), y: random(), depth: 0.25 + random() * 0.75,
      size: i < 10 ? 1.15 : 0.48 + random() * 0.45,
      alpha: i < 10 ? 0.76 : 0.24 + random() * 0.32,
      phase: random() * TAU, color: colors[Math.floor(random() * colors.length)],
    }));
  }
  function fallbackPlanet(c, def, ringed) {
    const r = ringed ? 148 : 230;
    if (ringed && typeof c.ellipse === 'function') {
      c.save(); c.translate(256, 256); c.rotate(-0.34);
      c.strokeStyle = '#80613a'; c.lineWidth = 26;
      c.beginPath(); c.ellipse(0, 0, 219, 65, 0, 0, TAU); c.stroke(); c.restore();
    }
    c.fillStyle = def.tint;
    if (typeof c.createRadialGradient === 'function') {
      const g = c.createRadialGradient(256 - r * 0.48, 256 - r * 0.38, r * 0.04, 256, 256, r);
      g.addColorStop(0, def.tint); g.addColorStop(0.53, def.tint); g.addColorStop(0.87, '#100d1a'); g.addColorStop(1, '#040711');
      c.fillStyle = g;
    }
    c.beginPath(); c.arc(256, 256, r, 0, TAU); c.fill();
  }
  function buildPlanet(id) {
    const result = canvasOf(512, 512);
    if (!result) return null;
    const def = defs[id], c = result.ctx, im = pixels(c, 512, 512);
    const ringed = id === 'devourer';
    if (!im) {
      debug.fallbackTextures++;
      fallbackPlanet(c, def, ringed);
    } else {
      debug.pixelTextures++;
      const data = im.data, radius = ringed ? 148 : 230, seed = def.seed;
      // 与球面法线点乘的平行光；负值是真正的夜半球，不是整盘径向渐变。
      const lx = -0.66, ly = -0.43, lz = 0.616;
      const atmosphere = id === 'arbiter' ? [74, 151, 175] : id === 'hive' || ringed ? [155, 112, 62] : id === 'dread' ? [170, 65, 39] : [105, 76, 146];
      for (let py = 0; py < 512; py++) {
        for (let px = 0; px < 512; px++) {
          const dx = px + 0.5 - 256, dy = py + 0.5 - 256;
          const nx = dx / radius, ny = dy / radius, rr = nx * nx + ny * ny;
          const index = (py * 512 + px) * 4;
          let red = 0, green = 0, blue = 0, alpha = 0;
          if (rr <= 1) {
            const nz = Math.sqrt(1 - rr);
            const light = nx * lx + ny * ly + nz * lz;
            const diffuse = 0.025 + Math.pow(Math.max(0, light), 0.85) * 0.85;
            const terrain = fbm(nx * 3.5 + 7, ny * 3.5 + 2, nz * 3.5, seed, 5);
            const detail = noise(nx * 83, ny * 83, nz * 83, seed + 73);
            const warp = noise(nx * 10, ny * 10, nz * 10, seed + 59);
            let r, g, b, glow = 0;
            if (id === 'hive') {
              const ridge = Math.pow(1 - Math.abs(terrain * 2 - 1), 5);
              const stone = clamp(terrain * 1.2 + detail * 0.17, 0, 1);
              const strata = Math.sin((ny + terrain * 0.16) * 52) * 0.5 + 0.5;
              r = 76 + stone * 108 + ridge * 15;
              g = 54 + stone * 79 + strata * 7;
              b = 30 + stone * 40;
            } else if (id === 'reaver' || ringed) {
              const latitude = Math.asin(ny) + nx * 0.12;
              const turbulence = (terrain - 0.5) * 2.3 + (warp - 0.5) * 0.15;
              const bands = Math.sin(latitude * 36 + turbulence * 8) * 0.5 + 0.5;
              const fine = Math.sin(latitude * 113 + turbulence * 16) * 0.5 + 0.5;
              const stormX = nx + 0.32, stormY = (ny - 0.22) * 2.8;
              const storm = Math.exp(-(stormX * stormX + stormY * stormY) * 35);
              const value = 0.28 + bands * 0.43 + fine * 0.12 + terrain * 0.22 - storm * 0.28;
              r = ringed ? 103 + value * 112 : 64 + value * 103;
              g = ringed ? 64 + value * 91 : 39 + value * 71;
              b = ringed ? 31 + value * 46 : 92 + value * 109;
            } else if (id === 'dread') {
              // 扭曲多尺度等值线构成分叉裂隙，发光严格限制在窄缝内。
              const cracks = Math.abs(fbm(nx * 6 + warp, ny * 6, nz * 6, seed + 311, 3) - 0.51);
              glow = Math.pow(clamp(1 - cracks / 0.028, 0, 1), 2) * smooth((terrain - 0.35) * 5);
              r = 42 + terrain * 77 + detail * 11; g = 25 + terrain * 35; b = 25 + terrain * 27;
            } else if (id === 'arbiter') {
              const ice = smooth((terrain - 0.50 + Math.pow(Math.abs(ny), 5) * 0.28) * 17);
              const fracture = Math.pow(Math.abs(warp * 2 - 1), 5);
              r = mix(16, 140 + detail * 34, ice) - fracture * 18;
              g = mix(55, 179 + detail * 27, ice) - fracture * 19;
              b = mix(70, 190 + detail * 22, ice) - fracture * 12;
            } else {
              const frost = smooth((terrain - 0.54 + Math.abs(ny) * 0.045) * 12);
              const rock = Math.pow(terrain, 1.7);
              r = 37 + rock * 40 + frost * 78 + detail * 9;
              g = 25 + rock * 27 + frost * 61;
              b = 56 + rock * 58 + frost * 87;
            }
            const micro = 0.88 + detail * 0.20;
            red = r * diffuse * micro; green = g * diffuse * micro; blue = b * diffuse * micro;
            if (glow > 0) { red += glow * 143; green += glow * 39; blue += glow * 8; }
            const rim = Math.pow(1 - nz, 7) * (0.12 + Math.max(0, light) * 0.65);
            red += atmosphere[0] * rim; green += atmosphere[1] * rim; blue += atmosphere[2] * rim;
            alpha = clamp((1 - Math.sqrt(rr)) * radius, 0, 1);
            // 主星对环投影的柔和遮光，避免环像平面图标。
            if (ringed && ny > 0.18 && ny < 0.30 && nx > -0.15) {
              const shadow = 1 - Math.sin((ny - 0.18) / 0.12 * Math.PI) * 0.28;
              red *= shadow; green *= shadow; blue *= shadow;
            }
          } else if (rr < 1.035) {
            const distance = Math.sqrt(rr);
            const sun = Math.max(0, nx * lx + ny * ly);
            alpha = Math.pow(1 - (distance - 1) / 0.0174, 2) * (0.06 + sun * 0.35);
            red = atmosphere[0]; green = atmosphere[1]; blue = atmosphere[2];
          }
          if (ringed) {
            // 倾斜薄环；远半环先被球遮挡，近半环横过球面。全部一次烘焙。
            const u = dx * 0.943 - dy * 0.333;
            const v = dx * 0.333 + dy * 0.943;
            const ringRadius = Math.sqrt(u * u + (v / 0.30) * (v / 0.30));
            if (ringRadius > 176 && ringRadius < 247 && (rr > 1 || v > 0)) {
              const edge = smooth((ringRadius - 176) / 6) * smooth((247 - ringRadius) / 6);
              const gaps = (ringRadius > 211 && ringRadius < 216) || (ringRadius > 232 && ringRadius < 234);
              const grain = 0.65 + 0.18 * Math.sin(ringRadius * 2.7) + 0.12 * Math.sin(ringRadius * 0.73);
              let a = edge * grain * (gaps ? 0.08 : 0.66);
              // 夜侧投影：环在星体右后方自然暗下去。
              const shadow = u > 0 && v < 0 && Math.abs(v) < 39 ? 0.22 : 1;
              const brightness = (0.55 + (1 - u / 260) * 0.18) * shadow;
              const outAlpha = a + alpha * (1 - a);
              if (outAlpha > 0) {
                red = (167 * brightness * a + red * alpha * (1 - a)) / outAlpha;
                green = (125 * brightness * a + green * alpha * (1 - a)) / outAlpha;
                blue = (69 * brightness * a + blue * alpha * (1 - a)) / outAlpha;
              }
              alpha = outAlpha;
            }
          }
          data[index] = clamp(red, 0, 255); data[index + 1] = clamp(green, 0, 255); data[index + 2] = clamp(blue, 0, 255); data[index + 3] = clamp(alpha, 0, 1) * 255;
        }
      }
      c.putImageData(im, 0, 0);
    }
    debug.planetBuilds++;
    return result.canvas;
  }
  function drawPlanet(ctx, id, w, h) {
    const alpha = smooth(weights[id]) * defs[id].maxAlpha;
    if (alpha <= 0) return;
    if (!Object.prototype.hasOwnProperty.call(textures, id)) {
      textures[id] = buildPlanet(id);
      debug.cachedPlanets = Object.keys(textures).length;
    }
    const texture = textures[id];
    if (!texture) return;
    const p = layout(id, w, h);
    const span = p.r * p.textureScale;
    const t = state.time;
    const dx = Math.sin(t * 0.017 + defs[id].seed) * Math.min(w, h) * 0.008;
    const dy = Math.sin(t * 0.013) * Math.min(w, h) * 0.009;
    // 完全显现后夜半球也遮住远方恒星：调暗表面，不把整个行星变成透明玻璃。
    ctx.globalAlpha = smooth(weights[id]);
    ctx.fillStyle = '#020309';
    ctx.beginPath(); ctx.arc(p.x + dx, p.y + dy, p.r * 0.997, 0, TAU); ctx.fill();
    ctx.globalAlpha = alpha;
    ctx.drawImage(texture, p.x + dx - span, p.y + dy - span, span * 2, span * 2);
  }
  function draw(ctx = G.ctx) {
    if (!ctx) return;
    const w = state.width || G.W || 0, h = state.height || G.H || 0;
    if (w <= 0 || h <= 0) return;
    ctx.save();
    try {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#02050c'; ctx.fillRect(0, 0, w, h);
      if (!sky) sky = buildSky();
      if (!stars) stars = makeStars();
      if (sky) {
        const ox = Math.sin(state.time * 0.009) * w * 0.018;
        const oy = Math.sin(state.time * 0.007) * h * 0.015;
        ctx.drawImage(sky, -w * 0.06 + ox, -h * 0.06 + oy, w * 1.12, h * 1.12);
      }
      for (const star of stars) {
        const x = ((star.x * w + Math.sin(state.time * 0.011) * star.depth * 3) % w + w) % w;
        const y = (star.y * h + state.time * star.depth * 0.65) % h;
        ctx.globalAlpha = star.alpha * (0.90 + Math.sin(state.time * 0.35 + star.phase) * 0.10);
        ctx.fillStyle = star.color; ctx.fillRect(x, y, star.size, star.size);
      }
      // menu 即使尚未收到 update/reset，也绝不渲染上局星体残影。
      if (G.state !== 'menu') {
        for (const id of ids) if (id !== state.currentId) drawPlanet(ctx, id, w, h);
        if (state.currentId) drawPlanet(ctx, state.currentId, w, h);
      }
    } finally { ctx.restore(); }
  }
  G.background = { update, draw, resize, reset, defs, state, layout, debug };
})();
