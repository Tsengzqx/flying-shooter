#!/usr/bin/env node
'use strict';
/* Development only. Set ART_RENDER_MODULE to an installed @resvg/resvg-js
 * module path, then run node tools/prepare-art.js. No runtime dependency.
 * Originals are read-only; only assets/art/runtime is generated.
 */
const fs = require('fs');
const path = require('path');
const { Resvg } = require(process.env.ART_RENDER_MODULE || '@resvg/resvg-js');
const root = path.resolve(__dirname, '..');
const art = path.join(root, 'assets/art');
const out = path.join(art, 'runtime');
const manifest = JSON.parse(fs.readFileSync(path.join(art, 'manifest.json'), 'utf8'));
fs.mkdirSync(out, { recursive: true });

// Balanced group extraction (not a greedy regex): nested groups remain intact.
// These two source files have a single translated art parent and local groups.
function group(source, id) {
  const start = source.indexOf('<g id="' + id + '"');
  if (start < 0) throw new Error('Missing SVG layer: ' + id);
  const tags = /<\/?g\b[^>]*>/g;
  tags.lastIndex = start;
  let depth = 0, m;
  while ((m = tags.exec(source))) {
    if (m[0].startsWith('</')) depth--;
    else if (!m[0].endsWith('/>')) depth++;
    if (depth === 0) return source.slice(start, tags.lastIndex);
  }
  throw new Error('Unbalanced SVG layer: ' + id);
}

const report = [];
for (const asset of manifest.assets) {
  const source = fs.readFileSync(path.join(art, asset.svg), 'utf8');
  const vb = source.match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number);
  const b = asset.alphaBoundsPixels;
  const ratio = vb[2] / asset.pixels;
  // Radial art keeps its true mechanical pivot. Every layer shares this crop.
  const radial = asset.facing === 'radial';
  const cx = radial ? asset.pixels / 2 : b.x + b.width / 2;
  const cy = radial ? asset.pixels / 2 : b.y + b.height / 2;
  const extent = radial
    ? 2 * Math.max(cx - b.x, b.x + b.width - cx, cy - b.y, b.y + b.height - cy)
    : Math.max(b.width, b.height);
  const side = extent / 0.96;
  const crop = [(cx - side / 2) * ratio, (cy - side / 2) * ratio, side * ratio, side * ratio];
  const size = asset.category === 'bosses' ? 512 : 256;
  function emit(id, svg) {
    svg = svg.replace(/<svg\b[^>]*>/, '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="' + crop.join(' ') + '">');
    const rendered = new Resvg(svg, { font: { loadSystemFonts: false } }).render();
    const png = rendered.asPng();
    fs.writeFileSync(path.join(out, id + '.png'), png);
    report.push({ id, source: asset.svg, pixels: size, bytes: png.length, cropViewBox: crop });
  }
  emit(asset.id, source);
  const ids = asset.id === 'arbiter' ? ['arbiter-outer-ring', 'arbiter-inner-ring']
    : asset.id === 'devourer' ? ['devourer-armor-ring', 'devourer-intake-iris'] : null;
  if (ids) {
    const defs = source.match(/<defs>[\s\S]*?<\/defs>/)[0];
    let remainder = source;
    for (const id of ids) {
      const layer = group(source, id);
      emit(id, '<svg xmlns="http://www.w3.org/2000/svg">' + defs + '<g transform="translate(384 384)">' + layer + '</g></svg>');
      remainder = remainder.replace(layer, '');
    }
    // Preserve all non-ring fittings, not just the named hull subgroup.
    emit(asset.id + '-hull', remainder);
  }
}
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify({
  schemaVersion: 1,
  generator: 'node tools/prepare-art.js (ART_RENDER_MODULE=@resvg/resvg-js path)',
  normalization: 'alpha bounds, 4% total padding; radial layers share original center pivot',
  assets: report,
}, null, 2) + '\n');
console.log('Generated ' + report.length + ' runtime PNGs; ' + report.reduce((n, a) => n + a.bytes, 0) + ' bytes. Originals unchanged.');
