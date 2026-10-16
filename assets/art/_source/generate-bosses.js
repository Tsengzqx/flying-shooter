#!/usr/bin/env node
'use strict';
/**
 * STAR STRIKE / Boss hard-surface studies / MK.II
 * Original vector artwork. Pure Node, deterministic, no packages or external assets.
 * Run: node assets/art/_source/generate-bosses.js
 * Enemy forward is +Y. All coordinates below are relative to the 384,384 pivot.
 * Groups named *-ring and *-hull are reserved for future animation, not animated here.
 */
const fs = require('node:fs');
const path = require('node:path');
const OUT = path.resolve(__dirname, '..', 'bosses');
const INK = '#090f1b';
const STEEL = '#61727b';
const DARK = '#19242e';
const PALE = '#c4d0d1';
let out = [];
let C;
let mirrored = false;
const n = v => Number(v.toFixed(2));
const attrs = a => Object.entries(a).map(([k, v]) => ` ${k}="${v}"`).join('');
const el = (tag, a) => out.push(`<${tag}${attrs(a)}/>`);
const poly = (pts, fill = 'url(#armor)', stroke = INK, sw = 3) => el('polygon', { points: Array.isArray(pts) ? pts.map(p => p.map(n).join(',')).join(' ') : pts, fill, stroke, 'stroke-width': sw, 'stroke-linejoin': 'round' });
const line = (pts, color = C.edge, sw = 1.5) => el('polyline', { points: Array.isArray(pts) ? pts.map(p => p.map(n).join(',')).join(' ') : pts, fill: 'none', stroke: color, 'stroke-width': sw, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' });
const rect = (x, y, w, h, fill = DARK, stroke = INK, sw = 1.5, r = 0) => el('rect', { x, y, width: w, height: h, rx: r, fill, stroke, 'stroke-width': sw });
const circle = (x, y, r, fill = DARK, stroke = C.edge, sw = 1.5) => el('circle', { cx: x, cy: y, r, fill, stroke, 'stroke-width': sw });
const pth = (d, fill, stroke = INK, sw = 3, extra = {}) => el('path', { d, fill, stroke, 'stroke-width': sw, 'stroke-linejoin': 'round', ...extra });
const group = (transform, fn, id) => {
  const previousMirror = mirrored;
  if (transform && /scale\(-1 1\)/.test(transform)) mirrored = !mirrored;
  out.push(`<g${attrs({ ...(id ? { id } : {}), ...(transform ? { transform } : {}) })}>`);
  fn(); out.push('</g>'); mirrored = previousMirror;
};
// Mirrored wing geometry must not turn engraved service lettering backwards.
const label = (x, y, text, fill = C.light, size = 7, anchor = 'middle') => out.push(`<text x="${x}" y="${y}"${mirrored ? ` transform="translate(${2 * x} 0) scale(-1 1)"` : ''} fill="${fill}" font-family="monospace" font-size="${size}" font-weight="bold" letter-spacing="0.7" text-anchor="${anchor}">${text}</text>`);
const bolt = (x, y, r = 2.3) => { circle(x, y, r, C.light, INK, 0.8); };
const bolts = pts => pts.forEach(p => bolt(...p));
const hex = (x, y, r, fill, stroke = INK, sw = 2, angle = 30) => poly(Array.from({ length: 6 }, (_, i) => { const a = (angle + i * 60) * Math.PI / 180; return [x + Math.cos(a) * r, y + Math.sin(a) * r]; }), fill, stroke, sw);
const at = (r, a) => [n(Math.sin(a * Math.PI / 180) * r), n(-Math.cos(a * Math.PI / 180) * r)];
const annulus = (r1, r2, a1, a2, fill, stroke = INK, sw = 2) => {
  const a = at(r2, a1), b = at(r2, a2), c = at(r1, a2), d = at(r1, a1);
  pth(`M ${a} A ${r2} ${r2} 0 ${a2 - a1 > 180 ? 1 : 0} 1 ${b} L ${c} A ${r1} ${r1} 0 ${a2 - a1 > 180 ? 1 : 0} 0 ${d} Z`, fill, stroke, sw);
};
function vent(x, y, w, h, count = 6, angle = 0, hot = false) {
  group(`translate(${x} ${y}) rotate(${angle})`, () => {
    poly([[0, 5], [5, 0], [w - 5, 0], [w, 5], [w, h - 5], [w - 5, h], [5, h], [0, h - 5]], INK, C.mid, 1.5);
    for (let i = 0; i < count; i++) {
      const yy = 6 + i * (h - 12) / Math.max(count - 1, 1);
      line([[5, yy], [w - 5, yy]], hot ? C.core : STEEL, 2.3);
    }
    line([[1, h - 5], [1, 5], [5, 1], [w - 5, 1]], C.edge, 1);
  });
}
function hatch(x, y, w = 35, h = 23, text = '') {
  group(`translate(${x} ${y})`, () => {
    poly([[4, 0], [w - 4, 0], [w, 4], [w, h], [0, h], [0, 4]], C.mid, INK, 1.5);
    line([[3, h - 3], [3, 4], [w - 5, 4]], C.edge, 1);
    rect(w - 10, h / 2 - 2, 5, 3, INK, 'none');
    bolt(6, h - 5, 1.5);
    if (text) label(w / 2, h / 2 + 3, text, C.light, 5);
  });
}
function sensor(x, y, r = 12) {
  circle(x, y, r + 4, INK, C.edge, 1.5);
  circle(x, y, r, STEEL, INK, 1.5);
  circle(x, y, r * 0.65, C.dark, C.light, 1);
  circle(x, y, r * 0.32, C.core, 'none');
}
function conduit(points, hot = false) {
  line(points, INK, 7); line(points, hot ? C.core : STEEL, 3); line(points, hot ? C.light : C.edge, 0.8);
}
function turret(x, y, scale = 1, twin = false) {
  group(`translate(${x} ${y}) scale(${scale})`, () => {
    circle(0, 0, 28, INK, STEEL, 2);
    circle(0, 0, 22, C.dark, C.edge, 1);
    for (const bx of twin ? [-9, 9] : [0]) {
      rect(bx - 5, 4, 10, 61, DARK, INK, 2);
      rect(bx - 2, 8, 4, 51, STEEL, 'none');
      for (let k = 0; k < 4; k++) rect(bx - 6, 24 + k * 8, 12, 3, C.mid, INK, 0.7);
      poly([[bx - 7, 60], [bx + 7, 60], [bx + 6, 72], [bx - 6, 72]], C.mid, INK, 2);
      rect(bx - 4, 65, 8, 4, INK, C.edge, 1);
    }
    poly([[-22, -15], [-11, -25], [13, -25], [23, -13], [19, 17], [11, 24], [-13, 24], [-22, 14]], 'url(#armor)', INK, 3);
    poly([[-16, -13], [-8, -19], [7, -19], [9, 12], [-12, 17]], C.light, C.mid, 1);
    poly([[12, -19], [18, -11], [14, 15], [11, 18]], C.dark, 'none');
    circle(0, -2, 6, DARK, C.edge, 1.5); circle(0, -2, 2.5, C.core, 'none');
    bolts([[-16, -7], [15, -7], [-13, 12], [13, 12]]);
  });
}
function core(x, y, r) {
  circle(x, y, r + 9, INK, C.mid, 3);
  circle(x, y, r + 3, C.dark, C.edge, 2);
  for (let i = 0; i < 8; i++) group(`translate(${x} ${y}) rotate(${i * 45})`, () => { rect(-3, -r - 6, 6, 7, PALE, INK, 0.8); });
  circle(x, y, r - 5, 'url(#reactor)', INK, 2);
  circle(x, y, r * 0.52, INK, C.light, 1.5);
  circle(x, y, r * 0.31, C.core, 'none');
  line([[x - r * 0.35, y - r * 0.32], [x, y - r * 0.53], [x + r * 0.35, y - r * 0.32]], C.light, 1.2);
}
function defs() {
  return `<defs>
  <linearGradient id="armor" x1="0%" y1="0%" x2="85%" y2="100%"><stop stop-color="${C.light}"/><stop offset=".25" stop-color="${C.mid}"/><stop offset=".72" stop-color="${C.mid}"/><stop offset="1" stop-color="${C.dark}"/></linearGradient>
  <linearGradient id="hull" x1="0%" y1="0%" x2="20%" y2="100%"><stop stop-color="${C.mid}"/><stop offset=".5" stop-color="${C.dark}"/><stop offset="1" stop-color="${INK}"/></linearGradient>
  <linearGradient id="metal" x1="0%" y1="0%" x2="100%" y2="70%"><stop stop-color="#8a9da5"/><stop offset=".3" stop-color="#41535f"/><stop offset=".75" stop-color="#26333e"/><stop offset="1" stop-color="#131e28"/></linearGradient>
  <radialGradient id="reactor"><stop stop-color="${C.light}"/><stop offset=".46" stop-color="${C.core}"/><stop offset="1" stop-color="${C.dark}"/></radialGradient>
</defs>`;
}

function hive() {
  // Six individually framed launch citadels, tied together by a broad hexagonal hull.
  hex(0, 0, 257, 'url(#hull)', INK, 6);
  for (let i = 0; i < 6; i++) group(`rotate(${i * 60})`, () => {
    poly([[-63, -180], [-73, -235], [-34, -293], [34, -293], [73, -235], [63, -180]], 'url(#metal)', INK, 5);
    rect(-21, -306, 42, 33, DARK, INK, 3);
    rect(-14, -304, 28, 8, C.core, C.light, 1);
    for (let k = 0; k < 4; k++) rect(-18, -291 + k * 6, 36, 3, STEEL, INK, 0.5);
  });
  for (let i = 0; i < 6; i++) group(`rotate(${i * 60}) translate(0 -228)`, () => {
    hex(0, 0, 86, 'url(#armor)', INK, 5, 30);
    hex(0, 0, 74, C.mid, C.edge, 1.5, 30);
    poly([[-64, -34], [0, -71], [64, -34], [49, -31], [0, -57], [-49, -31]], C.light, 'none');
    hex(0, 0, 57, INK, C.dark, 5, 30);
    // Seven recessed hexagonal hangar mouths, with paired rails and a back wall.
    const bays = [[0, 0], ...Array.from({ length: 6 }, (_, j) => at(33, j * 60))];
    bays.forEach(([x, y], j) => {
      hex(x, y, 18, C.dark, C.edge, 1.3, 30);
      hex(x, y, 13.5, INK, STEEL, 1, 30);
      line([[x - 7, y + 6], [x - 7, y - 5], [x + 7, y - 5], [x + 7, y + 6]], C.mid, 2);
      rect(x - 5, y + 7, 10, 2.3, j % 3 === 0 ? C.core : STEEL, 'none');
    });
    bolts([[-63, -24], [63, -24], [-63, 25], [63, 25], [0, -65], [0, 65]]);
    label(0, 63, `BAY-${i + 1}`, C.light, 5.5);
  });
  hex(0, 0, 180, INK, C.edge, 2);
  for (let i = 0; i < 6; i++) group(`rotate(${i * 60})`, () => {
    poly([[-75, -145], [0, -176], [75, -145], [48, -75], [0, -56], [-48, -75]], 'url(#armor)', INK, 4);
    poly([[-66, -141], [-5, -166], [-5, -133], [-41, -108]], C.light, 'none');
    poly([[8, -166], [66, -141], [42, -85], [24, -92], [47, -137]], C.dark, 'none');
    vent(-22, -125, 44, 37, 5);
    line([[-60, -132], [-45, -90], [-25, -79]], C.edge, 1.7);
    bolts([[-58, -139], [58, -139], [-37, -84], [37, -84]]);
    hatch(-18, -163, 36, 23, `${i + 1}A`);
    sensor(0, -191, 9);
  });
  core(0, 0, 47);
  // Central keel makes the otherwise radial carrier read as facing down.
  poly([[-27, 63], [27, 63], [37, 126], [21, 180], [0, 214], [-21, 180], [-37, 126]], 'url(#armor)', INK, 4);
  poly([[-15, 82], [15, 82], [18, 132], [0, 172], [-18, 132]], C.dark, INK, 2);
  vent(-10, 92, 20, 48, 6, 0, true);
  line([[-22, 145], [0, 192], [22, 145]], C.light, 2.5);
  for (const side of [-1, 1]) turret(side * 155, 66, 0.64, true);
  label(0, -65, 'HIVE / 01', C.light, 7);
}

function reaver() {
  // Open curved blades are intentionally unlike Endwalker's solid angular stealth wings.
  for (const side of [-1, 1]) group(`scale(${side} 1)`, () => {
    poly([[51, -111], [175, -211], [278, -258], [321, -211], [330, -84], [291, 109], [202, 263], [224, 94], [234, -25], [190, -77], [77, 30]], 'url(#hull)', INK, 6);
    poly([[91, -111], [186, -195], [274, -241], [305, -201], [310, -91], [278, 90], [223, 211], [249, 75], [260, -36], [197, -111]], 'url(#armor)', C.mid, 2);
    poly([[195, -190], [272, -231], [294, -201], [299, -100], [287, -89], [281, -191], [246, -197], [201, -168]], C.light, 'none');
    poly([[306, -77], [277, 91], [223, 211], [259, 82], [281, -53]], C.edge, 'none');
    poly([[258, -27], [244, 77], [220, 191], [232, 85], [238, -22], [193, -83], [202, -102]], C.dark, INK, 1.5);
    // Warp induction crescent: a segmented arc fitted into each shoulder.
    pth('M 112 -111 L 190 -177 L 248 -188 L 264 -149 L 255 -91 L 232 -78 L 238 -139 L 221 -153 L 193 -143 L 132 -91 Z', INK, C.edge, 1.7);
    line([[124, -109], [194, -164], [237, -173], [250, -148], [244, -99]], C.core, 4);
    for (let j = 0; j < 6; j++) {
      const x = 144 + j * 13, y = -124 - j * 9;
      line([[x - 5, y - 5], [x + 4, y + 5]], STEEL, 4);
    }
    vent(273, -80, 25, 87, 10, 11);
    hatch(159, -150, 35, 25, 'WP');
    hatch(271, -191, 22, 28);
    conduit([[98, -67], [152, -116], [188, -120]]);
    line([[91, -30], [177, -104], [200, -91]], C.edge, 1.7);
    bolts([[98, -107], [203, -199], [275, -220], [303, -184], [287, 22], [263, 102], [238, 150], [252, -46], [210, -80]]);
    sensor(105, -77, 13);
    turret(187, -13, 0.62);
    // A lower wing actuator and isolated emitting edge, not a bloom halo.
    poly([[95, 12], [144, -17], [170, 49], [138, 129], [126, 65]], 'url(#metal)', INK, 3);
    rect(136, 28, 9, 47, C.mid, INK, 1);
    line([[138, 33], [138, 71]], C.core, 2);
    for (let k = 0; k < 5; k++) line([[130, 30 + k * 9], [150, 22 + k * 9]], STEEL, 2);
  });
  group('', () => {
    poly([[0, -307], [34, -247], [49, -134], [69, -43], [45, 115], [20, 257], [0, 327], [-20, 257], [-45, 115], [-69, -43], [-49, -134], [-34, -247]], 'url(#hull)', INK, 6);
    poly([[0, -287], [23, -241], [34, -146], [0, -114], [-34, -146], [-23, -241]], 'url(#armor)', C.edge, 1.5);
    poly([[-8, -269], [-18, -231], [-21, -161], [-5, -144]], C.light, 'none');
    vent(-14, -226, 28, 60, 7, 0, true);
    for (const s of [-1, 1]) {
      poly([[s * 11, -114], [s * 41, -134], [s * 57, -42], [s * 38, 91], [s * 26, 156], [s * 19, 66]], 'url(#armor)', INK, 2);
      line([[s * 34, -112], [s * 46, -42], [s * 29, 78]], C.light, 2);
      vent(s < 0 ? -37 : 17, 64, 20, 57, 7);
      conduit([[s * 25, -89], [s * 30, -52], [s * 24, -13]]);
      bolts([[s * 40, -75], [s * 33, 36], [s * 26, 132]]);
    }
    poly([[0, -111], [20, -63], [14, 33], [0, 71], [-14, 33], [-20, -63]], INK, C.edge, 2);
    poly([[0, -89], [11, -54], [7, 21], [0, 43], [-7, 21], [-11, -54]], 'url(#reactor)', 'none');
    sensor(0, -129, 10);
    core(0, 107, 20);
    poly([[-22, 151], [0, 137], [22, 151], [15, 246], [0, 310], [-15, 246]], 'url(#armor)', INK, 2);
    poly([[-7, 166], [7, 166], [6, 245], [0, 279], [-6, 245]], INK, C.edge, 1);
    for (let i = 0; i < 8; i++) rect(-4, 174 + i * 9, 8, 3, i < 5 ? STEEL : C.core, 'none');
    line([[0, 286], [0, 308]], C.light, 3);
    label(0, -236, '02', C.light, 7);
    label(0, 151, 'VR', C.light, 6);
  }, 'reaver-hull');
}

function dread() {
  // Wide, blocky fortress with three independent heavy artillery stations.
  poly([[-326, -153], [-284, -211], [-168, -211], [-137, -259], [137, -259], [168, -211], [284, -211], [326, -153], [310, 118], [258, 192], [149, 232], [-149, 232], [-258, 192], [-310, 118]], 'url(#hull)', INK, 6);
  for (const s of [-1, 1]) group(`scale(${s} 1)`, () => {
    poly([[165, -194], [186, -297], [241, -309], [270, -282], [277, -191]], 'url(#metal)', INK, 5);
    rect(197, -302, 41, 17, INK, C.mid, 2);
    rect(202, -298, 31, 6, C.core, C.light, 1);
    vent(196, -270, 51, 65, 8, 0, true);
    poly([[164, -181], [279, -192], [308, -146], [297, -38], [166, -43], [147, -93]], 'url(#armor)', INK, 4);
    poly([[173, -171], [275, -180], [295, -146], [182, -138]], C.light, 'none');
    line([[298, -134], [289, -57], [170, -59]], C.edge, 2);
    hatch(186, -125, 47, 30, 'P-03');
    vent(253, -126, 29, 53, 6);
    bolts([[174, -157], [281, -155], [181, -74], [285, -69]]);
    // Outboard stepped skirt plates and lateral heat sinks.
    for (let i = 0; i < 3; i++) {
      const yy = -17 + i * 62;
      poly([[263, yy], [306 - i * 9, yy - 9], [298 - i * 12, yy + 42], [256 - i * 11, yy + 55], [250, yy + 10]], 'url(#armor)', INK, 3);
      line([[273, yy + 3], [295 - i * 9, yy], [287 - i * 10, yy + 31]], C.light, 1.5);
      bolt(268, yy + 24);
    }
    poly([[129, -24], [253, -24], [263, 121], [232, 169], [132, 198], [111, 156]], 'url(#metal)', INK, 4);
    vent(125, 87, 29, 69, 8, 0, true);
    conduit([[148, -6], [133, 21], [133, 69]], true);
    conduit([[243, -2], [253, 28], [249, 77]]);
    sensor(286, -26, 9);
    hatch(186, 159, 39, 24, 'MAG');
    turret(203, 22, 1.55, true);
    // Armored lower gunwale.
    poly([[56, 175], [115, 164], [128, 220], [92, 260], [49, 249]], 'url(#armor)', INK, 3);
    vent(69, 190, 32, 41, 5);
    bolts([[60, 188], [113, 211], [91, 246]]);
  });
  // Bridge and exposed thermal bus run across the width of the ship.
  poly([[-135, -240], [-103, -277], [103, -277], [135, -240], [130, -155], [-130, -155]], 'url(#armor)', INK, 4);
  poly([[-120, -235], [-95, -263], [95, -263], [120, -235], [106, -227], [-106, -227]], C.light, 'none');
  rect(-101, -219, 202, 34, INK, C.mid, 2);
  for (let i = 0; i < 11; i++) rect(-94 + i * 17, -212, 12, 13, i % 3 === 0 ? C.light : C.core, C.dark, 1);
  label(0, -239, 'MOLTEN / 03', INK, 8);
  for (const x of [-112, 112]) { bolt(x, -226); bolt(x, -173); }
  poly([[-148, -149], [148, -149], [155, -116], [140, -86], [-140, -86], [-155, -116]], INK, STEEL, 2);
  rect(-133, -130, 266, 17, C.core, C.edge, 1);
  for (let i = 0; i < 17; i++) rect(-132 + i * 16, -135, 6, 28, DARK, INK, 1);
  poly([[-97, -79], [-57, -107], [57, -107], [97, -79], [106, 131], [49, 187], [-49, 187], [-106, 131]], 'url(#armor)', INK, 4);
  for (const s of [-1, 1]) {
    poly([[s * 76, -68], [s * 92, -58], [s * 92, 113], [s * 64, 141], [s * 65, 33]], C.dark, INK, 1);
    vent(s < 0 ? -90 : 67, -39, 23, 88, 10, 0, true);
    bolts([[s * 77, -68], [s * 82, 102], [s * 48, 153]]);
  }
  core(0, -62, 28);
  // Main battery sits forward of the bridge, with a much longer barrel assembly.
  circle(0, 61, 57, DARK, C.edge, 2);
  for (const x of [-16, 16]) {
    rect(x - 9, 94, 18, 198, 'url(#metal)', INK, 3);
    rect(x - 3, 105, 6, 167, STEEL, 'none');
    for (let k = 0; k < 9; k++) rect(x - 11, 144 + k * 14, 22, 5, C.mid, INK, 1);
    poly([[x - 13, 276], [x + 13, 276], [x + 12, 319], [x - 12, 319]], C.dark, INK, 3);
    rect(x - 8, 300, 16, 11, INK, C.light, 1.3);
  }
  poly([[-46, 18], [-28, 2], [28, 2], [46, 18], [43, 87], [24, 111], [-24, 111], [-43, 87]], 'url(#armor)', INK, 4);
  poly([[-36, 22], [-22, 12], [0, 12], [0, 93], [-27, 86]], C.light, 'none');
  poly([[12, 14], [34, 24], [31, 85], [13, 96]], C.dark, 'none');
  sensor(0, 38, 13);
  vent(-20, 68, 40, 25, 3);
  bolts([[-33, 29], [33, 29], [-30, 78], [30, 78]]);
  label(0, 123, 'SIEGE', C.light, 7);
}

function arbiter() {
  // Two physically separated concentric mechanisms; open space between the rings.
  // Static IDs keep the rotation pivots at the common local origin for later use.
  group('', () => {
    circle(0, 0, 286, 'none', INK, 58);
    circle(0, 0, 286, 'none', STEEL, 46);
    circle(0, 0, 309, 'none', C.edge, 2);
    circle(0, 0, 263, 'none', C.mid, 2);
    for (let i = 0; i < 12; i++) group(`rotate(${i * 30})`, () => {
      annulus(266, 307, -13.7, 13.7, 'url(#armor)', INK, 2.5);
      annulus(296, 306, -11.7, 10, C.light, 'none');
      annulus(269, 279, -9, 10, C.dark, 'none');
      rect(-12, -297, 24, 21, C.dark, INK, 1.3);
      rect(-8, -292, 16, 4, C.core, 'none');
      rect(-8, -284, 16, 3, STEEL, 'none');
      for (const a of [-10, 10]) { const p = at(285, a); bolt(...p); }
      poly([[-6, -265], [6, -265], [8, -253], [-8, -253]], DARK, INK, 1.5);
      label(36, -280, String(i + 1).padStart(2, '0'), C.light, 6);
    });
    // Four broad bearing housings are integral to the outer ring.
    for (let i = 0; i < 4; i++) group(`rotate(${45 + i * 90})`, () => {
      poly([[-25, -299], [-17, -323], [17, -323], [25, -299], [20, -270], [-20, -270]], 'url(#metal)', INK, 4);
      sensor(0, -295, 12);
      line([[-13, -315], [13, -315]], C.core, 3);
      bolts([[-16, -279], [16, -279]]);
    });
  }, 'arbiter-outer-ring');
  group('', () => {
    circle(0, 0, 206, 'none', INK, 47);
    circle(0, 0, 206, 'none', C.dark, 39);
    circle(0, 0, 185, 'none', C.edge, 2);
    for (let i = 0; i < 12; i++) group(`rotate(${15 + i * 30})`, () => {
      annulus(188, 223, -13.5, 13.5, 'url(#metal)', INK, 2);
      annulus(213, 221, -10, 9, C.mid, C.edge, 0.7);
      poly([[-15, -210], [12, -210], [17, -202], [9, -194], [-15, -194], [-8, -202]], C.light, INK, 1);
      line([[-8, -202], [6, -202]], C.core, 2);
      bolts([[-33, -201], [33, -201]]);
      for (let j = 0; j < 3; j++) line([[19 + j * 5, -211], [21 + j * 5, -205]], STEEL, 1.5);
    });
    for (let i = 0; i < 4; i++) group(`rotate(${i * 90})`, () => {
      poly([[-12, -186], [12, -186], [10, -146], [0, -134], [-10, -146]], 'url(#armor)', INK, 3);
      rect(-4, -178, 8, 26, C.core, INK, 1);
    });
  }, 'arbiter-inner-ring');
  group('', () => {
    // A downward spear/diamond and twin forward weapons break rotational symmetry.
    poly([[0, -166], [72, -65], [109, 0], [75, 94], [0, 177], [-75, 94], [-109, 0], [-72, -65]], 'url(#hull)', INK, 5);
    for (const s of [-1, 1]) {
      poly([[s * 7, -144], [s * 60, -62], [s * 88, -3], [s * 60, 30], [s * 24, -37]], 'url(#armor)', INK, 2);
      poly([[s * 12, -124], [s * 47, -64], [s * 58, -20], [s * 31, -48]], C.light, 'none');
      poly([[s * 86, 12], [s * 65, 87], [s * 7, 152], [s * 20, 77], [s * 45, 42]], 'url(#armor)', INK, 2);
      line([[s * 72, 30], [s * 55, 80], [s * 21, 120]], C.edge, 1.5);
      turret(s * 88, 107, 0.58);
      vent(s < 0 ? -64 : 42, -20, 22, 43, 5);
      bolts([[s * 47, -62], [s * 66, 57]]);
    }
    poly([[0, -65], [31, -3], [0, 82], [-31, -3]], INK, C.edge, 2);
    poly([[0, -43], [17, -2], [0, 54], [-17, -2]], 'url(#reactor)', C.light, 1);
    line([[0, -35], [0, 42]], C.light, 3);
    sensor(0, -97, 9);
    hatch(-15, 97, 30, 22, '04');
    // Keel linked to the outer ring, the only far-forward mechanical pointer.
    poly([[-18, 270], [18, 270], [24, 298], [0, 328], [-24, 298]], 'url(#armor)', INK, 3);
    poly([[-7, 289], [7, 289], [0, 313]], C.light, 'none');
    label(0, 139, 'ARB', C.light, 7);
  }, 'arbiter-hull');
}

function endwalker() {
  // Faceted ghost wing: a wide sawtooth trailing edge and hollow black spinal chamber.
  for (const s of [-1, 1]) group(`scale(${s} 1)`, () => {
    poly([[30, -173], [95, -204], [137, -294], [160, -180], [328, -253], [292, -62], [260, 4], [281, 99], [206, 63], [218, 221], [137, 164], [115, 276], [70, 204], [42, 85]], 'url(#hull)', INK, 6);
    poly([[70, -139], [140, -166], [309, -233], [275, -66], [241, 0], [253, 62], [187, 34], [193, 177], [141, 127], [111, 211], [84, 133]], 'url(#armor)', C.mid, 1.5);
    poly([[89, -137], [140, -152], [293, -216], [268, -163], [167, -105], [100, -83]], C.mid, 'none');
    poly([[292, -217], [275, -170], [249, -57], [223, 1], [231, 37], [217, 23], [230, -39]], C.light, 'none');
    poly([[105, -69], [170, -92], [248, -150], [216, -35], [172, 12], [126, 13]], C.dark, INK, 2);
    line([[113, -62], [171, -83], [235, -131]], C.edge, 1.3);
    // Radar-absorbent tile rows follow actual panel boundaries, not random texture.
    for (let i = 0; i < 5; i++) {
      const x = 130 + i * 20, y = -48 - i * 11;
      poly([[x, y], [x + 14, y - 6], [x + 7, y + 17], [x - 7, y + 24]], i % 2 ? '#343249' : '#484358', INK, 1);
    }
    poly([[96, 27], [153, 34], [172, 93], [139, 102], [114, 171], [99, 121]], 'url(#metal)', INK, 2);
    vent(115, 43, 29, 57, 7, -8);
    poly([[166, 49], [184, 58], [188, 159], [168, 132]], C.mid, INK, 1.5);
    line([[174, 70], [178, 127]], C.core, 2);
    poly([[79, -181], [117, -260], [126, -199], [109, -170]], C.mid, INK, 2);
    line([[91, -189], [115, -240]], C.edge, 1.6);
    hatch(174, -156, 35, 21, 'RAM');
    conduit([[76, -116], [85, -56], [97, -30]]);
    sensor(95, -13, 10);
    turret(170, -11, 0.5);
    bolts([[87, -127], [150, -128], [274, -188], [247, -89], [111, 32], [157, 100], [183, 135], [235, 21]]);
    line([[60, -141], [74, -74], [77, 25]], C.edge, 1.6);
  });
  group('', () => {
    // Twin aft vanes and a five-piece forward shadow keel replace soft ghost tails.
    poly([[-37, -187], [-43, -279], [-15, -327], [-8, -240], [0, -199], [8, -240], [15, -327], [43, -279], [37, -187]], 'url(#metal)', INK, 4);
    line([[-28, -238], [-22, -290]], C.core, 3); line([[28, -238], [22, -290]], C.core, 3);
    poly([[0, -222], [49, -159], [66, -42], [52, 111], [29, 230], [0, 328], [-29, 230], [-52, 111], [-66, -42], [-49, -159]], 'url(#armor)', INK, 5);
    for (const s of [-1, 1]) {
      poly([[s * 10, -194], [s * 38, -151], [s * 48, -54], [s * 33, -73], [s * 22, -153]], C.light, 'none');
      poly([[s * 46, -22], [s * 38, 114], [s * 22, 195], [s * 20, 107]], C.dark, INK, 1);
      vent(s < 0 ? -44 : 28, 35, 16, 61, 7, 0, false);
      conduit([[s * 28, -159], [s * 36, -110], [s * 34, -76]]);
      bolts([[s * 37, -127], [s * 47, -5], [s * 33, 108]]);
      poly([[s * 37, 139], [s * 60, 201], [s * 47, 295], [s * 33, 248]], C.dark, INK, 3);
      line([[s * 46, 201], [s * 43, 264]], C.edge, 1.3);
    }
    poly([[0, -138], [28, -65], [25, 55], [0, 139], [-25, 55], [-28, -65]], INK, C.edge, 2.5);
    poly([[0, -106], [17, -60], [15, 49], [0, 101], [-15, 49], [-17, -60]], '#0d0d1c', C.mid, 1);
    // The narrow singularity is opaque and readable, never a transparent grey silhouette.
    poly([[0, -49], [8, -13], [5, 24], [0, 49], [-5, 24], [-8, -13]], C.core, 'none');
    poly([[0, -30], [3, -11], [0, 25], [-3, -11]], C.light, 'none');
    for (const y of [-71, 61]) { line([[-23, y], [-12, y + 12]], C.light, 2); line([[23, y], [12, y + 12]], C.light, 2); }
    sensor(0, -169, 9);
    poly([[-17, 158], [0, 143], [17, 158], [13, 228], [0, 301], [-13, 228]], C.dark, C.edge, 1.5);
    for (let j = 0; j < 6; j++) line([[-7, 171 + j * 11], [7, 171 + j * 11]], STEEL, 2);
    line([[0, 243], [0, 292]], C.core, 2);
    label(0, -193, '05', INK, 7);
    label(0, 125, 'CLOAK', C.light, 5.5);
  }, 'endwalker-hull');
}

function devourer() {
  // Heavy twelve-sided industrial annulus surrounds a fourteen-jaw stellar intake.
  const hull = Array.from({ length: 24 }, (_, i) => at(i % 2 ? 305 : 319, i * 15));
  poly(hull, 'url(#hull)', INK, 6);
  circle(0, 0, 271, 'none', STEEL, 70);
  circle(0, 0, 267, 'none', INK, 57);
  group('', () => {
    for (let i = 0; i < 12; i++) group(`rotate(${i * 30})`, () => {
      annulus(229, 306, -13.4, 13.4, 'url(#armor)', INK, 3);
      annulus(290, 304, -11.6, 11.6, C.light, 'none');
      annulus(233, 246, -11, 11, C.dark, INK, 1);
      poly([[-23, -279], [23, -279], [29, -259], [18, -247], [-18, -247], [-29, -259]], 'url(#metal)', INK, 2);
      vent(-15, -274, 30, 22, 3, 0, true);
      for (const a of [-10, 10]) { bolt(...at(278, a)); bolt(...at(252, a)); }
      rect(-7, -300, 14, 6, C.dark, INK, 1);
      label(39, -268, String(i + 1).padStart(2, '0'), C.light, 6);
      // Orange bus couples each armor segment to the iris mechanism.
      poly([[-11, -231], [11, -231], [15, -209], [-15, -209]], DARK, INK, 2);
      rect(-5, -230, 10, 21, C.core, INK, 1);
      line([[-12, -219], [12, -219]], STEEL, 3);
    });
  }, 'devourer-armor-ring');
  // Four dense bearing/coolant stations break up the annular hull.
  for (let i = 0; i < 4; i++) group(`rotate(${45 + 90 * i})`, () => {
    poly([[-33, -299], [-23, -321], [23, -321], [33, -299], [29, -242], [16, -221], [-16, -221], [-29, -242]], 'url(#metal)', INK, 4);
    rect(-16, -312, 32, 12, INK, C.mid, 1);
    rect(-11, -309, 22, 5, C.core, 'none');
    core(0, -266, 16);
    bolts([[-23, -294], [23, -294], [-19, -239], [19, -239]]);
  });
  circle(0, 0, 207, C.dark, INK, 7);
  circle(0, 0, 192, INK, C.edge, 3);
  group('', () => {
    for (let i = 0; i < 14; i++) group(`rotate(${i * 360 / 14})`, () => {
      // Overlapping machined jaws point tangentially inward, not a decorative sunburst.
      poly([[-35, -189], [25, -194], [34, -165], [7, -115], [-29, -85], [-15, -139]], 'url(#armor)', INK, 3);
      poly([[-26, -181], [14, -184], [19, -167], [-18, -106], [-3, -149]], C.light, 'none');
      poly([[25, -172], [7, -128], [-20, -98], [-7, -131]], C.mid, 'none');
      line([[-24, -169], [-13, -168], [-17, -150]], STEEL, 2);
      bolt(-14, -176, 2.5);
      circle(12, -170, 5, INK, C.edge, 1);
    });
  }, 'devourer-intake-iris');
  circle(0, 0, 91, '#120d0b', C.mid, 3);
  circle(0, 0, 79, 'none', C.core, 7);
  circle(0, 0, 69, '#080d15', C.light, 1.5);
  for (let i = 0; i < 7; i++) annulus(78, 86, i * 360 / 7 + 3, i * 360 / 7 + 33, C.light, 'none');
  // Three restrained rings deepen the central void without glow or full-canvas effects.
  circle(0, 0, 55, 'none', '#3d2d25', 1.5);
  circle(0, 0, 39, 'none', '#211e21', 1);
  poly([[-8, -25], [12, -16], [19, 9], [-4, 21], [-18, 2]], '#0d121a', 'none');
  // Facing is marked structurally: rear exhaust deck, front paired intake mandibles.
  group('', () => {
    poly([[-39, -309], [-26, -327], [26, -327], [39, -309], [31, -278], [-31, -278]], C.dark, INK, 3);
    vent(-23, -314, 46, 26, 4, 0, true);
    for (const s of [-1, 1]) {
      group(`translate(${s * 103} 263)`, () => {
        poly([[-26, -24], [26, -24], [27, 16], [16, 64], [-16, 64], [-27, 16]], 'url(#armor)', INK, 4);
        poly([[-17, -17], [-4, -17], [-4, 42], [-13, 53]], C.light, 'none');
        rect(-10, 7, 20, 31, DARK, INK, 2);
        for (let k = 0; k < 4; k++) rect(-8, 11 + k * 6, 16, 2, C.core, 'none');
        rect(-12, 46, 24, 10, INK, C.edge, 1.2);
        bolts([[-18, -8], [18, -8]]);
      });
      turret(s * 266, 64, 0.68, true);
    }
    poly([[-35, 250], [35, 250], [30, 287], [0, 308], [-30, 287]], C.dark, INK, 3);
    sensor(0, 270, 12);
    label(0, 295, 'SD-06', C.light, 6);
  }, 'devourer-hull');
}

const designs = [
  { id: 'hive', name: '钢铁蜂巢 / IRON HIVE', description: 'Gold six-lobed hexagonal carrier, forty-two recessed honeycomb launch bays, armored radial command citadel and forward keel.', colors: { light: '#f3d894', mid: '#b88a3d', dark: '#624127', edge: '#e8bc69', core: '#ffb747' }, draw: hive },
  { id: 'reaver', name: '虚空掠夺者 / VOID REAVER', description: 'Violet hooked scythe wings, open negative-space sweep, segmented warp-induction crescents and long needle fuselage.', colors: { light: '#c6b6e7', mid: '#83639e', dark: '#382846', edge: '#bd91eb', core: '#b780ff' }, draw: reaver },
  { id: 'dread', name: '熔核巨舰 / MOLTEN DREAD', description: 'Broad red-orange armored fortress, triple heavy twin-barrel batteries, rear reactor stacks and exposed thermal bus.', colors: { light: '#f3b28d', mid: '#ad5541', dark: '#542a2c', edge: '#ed9a6c', core: '#ff743b' }, draw: dread },
  { id: 'arbiter', name: '深空仲裁者 / ARBITER', description: 'Two separate concentric cyan mechanical rings, twelve indexed armor sectors each, floating diamond command spear and forward gunnery.', colors: { light: '#c2edf0', mid: '#548c9a', dark: '#254956', edge: '#8bd9e7', core: '#6de3ed' }, draw: arbiter },
  { id: 'endwalker', name: '终焉之影 / ENDWALKER', description: 'Readable dark-violet faceted ghost wing, jagged stealth vanes, radar-absorbent panels, black spinal chamber and split shadow keel.', colors: { light: '#aaa1c7', mid: '#615575', dark: '#2e293e', edge: '#a393c6', core: '#ac83df' }, draw: endwalker },
  { id: 'devourer', name: '噬星者 / STAR DEVOURER', description: 'Massive orange-gold annular machine, twelve industrial armor blocks, fourteen overlapping inward jaws and black stellar intake reactor.', colors: { light: '#f4d394', mid: '#b8843c', dark: '#62442c', edge: '#e7b960', core: '#ff9844' }, draw: devourer },
];

fs.mkdirSync(OUT, { recursive: true });
for (const design of designs) {
  C = design.colors;
  out = [];
  group('translate(384 384)', design.draw, `${design.id}-art`);
  const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="1536" viewBox="0 0 768 768" role="img" aria-labelledby="title desc">\n<title id="title">${design.name} — MK.II</title>\n<desc id="desc">${design.description} Original top-down enemy craft facing down. Transparent background. Static vector artwork.</desc>\n${defs()}\n${out.join('\n')}\n</svg>\n`;
  if (/<(?:script|image|foreignObject)\b|(?:href|url)\s*=\s*["']https?:/i.test(svg)) throw new Error(`External content in ${design.id}`);
  fs.writeFileSync(path.join(OUT, `${design.id}.svg`), svg, 'utf8');
  const shapes = (svg.match(/<(?:path|polygon|polyline|rect|circle)\b/g) || []).length;
  console.log(`${design.id}.svg: ${shapes} geometric elements, ${Buffer.byteLength(svg)} bytes`);
}
