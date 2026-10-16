'use strict';
/**
 * STAR STRIKE / MK.II hostile fleet — original, dependency-free vector source.
 * Run: node assets/art/_source/generate-enemies.js
 * Writes ONLY the six owned enemy SVGs. No game code, diver, raster, or network I/O.
 * Top-down ships face +Y. Native artboard 512; exported resolution 1024 square.
 */
const fs = require('node:fs');
const path = require('node:path');
const OUT = path.resolve(__dirname, '..', 'enemies');
const palettes = {
  scout:    { base:'#aa5c32', mid:'#d18a50', light:'#edbb7c', shade:'#653d2b', edge:'#d8b18a', emit:'#ffb35e', glass:'#8e4d29' },
  zigzag:   { base:'#67518e', mid:'#9172bc', light:'#c0a5dd', shade:'#3c315d', edge:'#af9cc9', emit:'#c49aef', glass:'#68508c' },
  gunship:  { base:'#8e3d48', mid:'#b95b61', light:'#df9291', shade:'#502b35', edge:'#be9398', emit:'#f09886', glass:'#903e45' },
  weaver:   { base:'#356e79', mid:'#5598a1', light:'#99d1d0', shade:'#25434e', edge:'#97b8bd', emit:'#72d8d9', glass:'#2d8993' },
  splitter: { base:'#576f42', mid:'#87a65e', light:'#bbd48d', shade:'#35482f', edge:'#a9bd92', emit:'#b0dc7b', glass:'#668d43' },
  escort:   { base:'#76456b', mid:'#a26993', light:'#d4a0c3', shade:'#492e48', edge:'#b99aaf', emit:'#e6a3d5', glass:'#955e8c' },
};
const ink = '#0c141e', dark = '#18232e', metal = '#354650', steel = '#738792';
let s, p;
const push = v => s.push(v);
function poly(points, fill, stroke = ink, width = 2) { push(`<polygon points="${points}" fill="${fill}" stroke="${stroke}" stroke-width="${width}" stroke-linejoin="round"/>`); }
function line(x1,y1,x2,y2,color=steel,w=1.4) { push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${w}" stroke-linecap="round"/>`); }
function rect(x,y,w,h,fill,stroke=ink,sw=1) { push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`); }
function circle(x,y,r,fill,stroke=ink,sw=1.5) { push(`<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`); }
function label(x,y,t,size=5,color=p.light) { push(`<text x="${x}" y="${y}" fill="${color}" font-family="monospace" font-size="${size}" letter-spacing="0.65">${t}</text>`); }
function group(transform, fn) { push(`<g transform="${transform}">`); fn(); push('</g>'); }
function mirror(fn) { fn(); group('translate(512 0) scale(-1 1)', fn); }
function bolt(x,y,r=2) { circle(x,y,r,dark,p.edge,0.8); line(x-r*0.45,y,x+r*0.45,y,steel,0.6); }
function bolts(points) { for (const [x,y] of points) bolt(x,y); }
function vent(x,y,w,h,n=7) {
  poly(`${x},${y} ${x+w},${y+3} ${x+w},${y+h} ${x},${y+h-3}`,ink,p.edge,1);
  for(let i=0;i<n;i++) {
    const yy=y+5+i*(h-9)/(n-1);
    line(x+3,yy,x+w-3,yy+1,steel,1.8);
    line(x+3,yy+1.8,x+w-3,yy+2.8,metal,0.8);
  }
}
function reactor(x,y,r=17) {
  circle(x,y,r+5,ink,p.edge,1.5); circle(x,y,r+1,metal,p.base,2);
  for(let i=0;i<8;i++) group(`translate(${x} ${y}) rotate(${i*45})`,()=>rect(-1.5,-r-3,3,4,p.light,'none'));
  circle(x,y,r-4,dark,p.edge,1); circle(x,y,r-8,p.glass,p.emit,1.7);
  circle(x,y,Math.max(2,r-12),p.emit,'none');
  line(x-3,y-r+9,x+1,y-r+9,p.light,1.2);
}
function sensor(x,y,r=6) {
  circle(x,y,r+3,ink,p.edge,1);circle(x,y,r,metal,p.base,1.1);
  circle(x,y,r-2,p.glass,p.emit,1.1);circle(x-1,y-1,1.2,p.light,'none');
}
function cannon(x,y,len=68,scale=1) {
  group(`translate(${x} ${y}) scale(${scale})`,()=> {
    poly('-11,-12 11,-12 14,8 10,23 -10,23 -14,8',metal,ink,2.5);
    poly('-9,-10 9,-10 9,12 -9,12',p.base,p.edge,1);
    rect(-6,13,12,len-17,ink,steel,1.3);
    rect(-2.4,16,4.8,len-24,metal,'none');
    line(-1,18,-1,len-11,p.edge,1);
    for(let i=0;i<5;i++) rect(-8,17+i*5,16,2.5,steel,ink,0.6);
    poly(`-8,${len-9} 8,${len-9} 6,${len} -6,${len}`,metal,p.edge,1);
    rect(-4,len-3,8,3,ink,'none');
    bolt(-7,-5,1.3);bolt(7,-5,1.3);
    rect(-3,-6,6,3,p.emit,'none');
  });
}
function engine(x,y,w=24,h=46) {
  group(`translate(${x} ${y})`,()=> {
    poly(`${-w/2},0 ${w/2},0 ${w/2+4},${h-8} ${w/2-1},${h} ${-w/2+1},${h} ${-w/2-4},${h-8}`,metal,ink,2.5);
    rect(-w/2+3,4,w-6,9,dark,p.edge,1);
    rect(-w/2+5,5,w-10,4,p.emit,'none');
    for(let i=0;i<5;i++) line(-w/2+1,18+i*4.6,w/2-1,18+i*4.6,steel,1.4);
    line(-w/2+2,0,-w/2+2,-7,p.emit,2);line(w/2-2,0,w/2-2,-7,p.emit,2);
    bolt(0,h-6,2);
  });
}
function hatch(x,y,w=24,h=30) {
  poly(`${x+4},${y} ${x+w-4},${y} ${x+w},${y+5} ${x+w},${y+h-5} ${x+w-4},${y+h} ${x+4},${y+h} ${x},${y+h-5} ${x},${y+5}`,p.shade,p.edge,1);
  rect(x+w/2-4,y+h/2-1,8,2,metal,steel,0.7);
  bolt(x+4,y+5,1.2);bolt(x+w-4,y+h-5,1.2);
}
function caution(x,y,w=20) {
  rect(x,y,w,5,p.light,ink,0.7);
  for(let i=2;i<w-3;i+=5) line(x+i,y+0.8,x+i+2,y+4.2,dark,1.7);
}
function scout() {
  // Narrow dart: open V tail, swept delta shoulders, one reconnaissance lance.
  poly('256,66 283,127 304,147 397,113 361,260 302,331 256,446 210,331 151,260 115,113 208,147 229,127','url(#hull)',ink,5);
  mirror(()=> {
    poly('124,126 205,158 228,220 208,312 159,253',p.base,p.edge,1.3);
    poly('131,135 198,164 213,207 163,237',p.mid,ink,1.5);
    poly('131,135 145,190 163,237 151,244',p.light,'none');
    poly('164,245 205,219 216,232 199,298 171,269',p.shade,p.edge,1);
    vent(170,247,22,28,5);
    poly('201,164 219,175 231,211 222,217',p.light,'none');
    line(145,157,156,202,p.light,1.5);
    line(160,229,194,212,p.edge,1.2);
    bolts([[147,151],[161,231],[204,187],[202,286]]);
    engine(230,104,17,49);
    cannon(194,273,59,0.68);
    sensor(218,245,4.5);
  });
  poly('256,81 276,139 282,213 300,295 280,365 256,432 232,365 212,295 230,213 236,139','url(#armor)',ink,3);
  poly('256,91 250,148 237,187 232,165 242,129',p.light,'none');
  poly('256,91 270,139 277,186 264,150',p.base,'none');
  poly('256,157 274,189 277,249 256,278 235,249 238,189',ink,p.edge,1.7);
  poly('256,170 267,193 269,238 256,260 243,238 245,194','url(#glass)',p.emit,1);
  poly('249,189 253,181 252,232 246,244',p.light,'none');
  line(259,202,263,230,p.emit,1.1);
  reactor(256,300,17);
  mirror(()=> {
    poly('229,269 233,284 235,321 245,341 234,361 220,300',p.base,p.edge,1);
    line(224,291,231,325,p.light,1.5);
    bolts([[237,275],[230,310],[243,342]]);
  });
  poly('256,330 271,349 256,416 241,349',dark,p.edge,1.2);
  for(let i=0;i<7;i++) rect(251+i*.45,344+i*7,10-i*.9,2.8,p.mid,'none');
  poly('256,395 260,406 256,429 252,406',p.light,'none');
  sensor(256,145,5);
  label(158,209,'S-01',5);label(284,285,'RCS',4.5);label(244,328,'SCAN',4);
  caution(174,173,19);
}
function zigzag() {
  // Deliberately asymmetric hooked wing and lateral vectored engine pods.
  poly('235,88 275,111 296,160 349,140 422,100 448,160 424,237 366,291 314,309 277,416 233,405 204,323 148,308 82,251 64,195 92,122 145,168 203,176','url(#hull)',ink,5);
  poly('93,137 137,180 203,191 218,224 180,254 124,237 83,199',p.base,p.edge,1.5);
  poly('93,137 105,177 141,204 198,207 203,191 137,180',p.light,ink,1);
  poly('86,211 128,252 186,269 204,305 153,294 94,245',p.mid,p.edge,1);
  poly('111,215 149,225 180,219 169,243 134,240',p.shade,ink,1);
  vent(128,218,24,21,4);
  poly('304,179 356,156 415,114 433,161 409,223 358,265 314,285 296,246',p.base,p.edge,1.4);
  poly('322,185 368,158 414,127 420,163 398,201 352,218',p.mid,ink,1.5);
  poly('414,127 403,160 361,194 322,185 368,158',p.light,'none');
  poly('400,217 351,250 317,258 315,278 356,262 408,223',p.shade,'none');
  group('translate(380 197) rotate(39)',()=>vent(-12,-8,24,37,7));
  line(350,228,323,240,p.edge,2);line(417,172,407,196,p.light,2);
  // Tangential thrusters visibly point in opposite lateral directions.
  group('translate(87 194) rotate(-75)',()=>engine(0,0,22,51));
  group('translate(420 247) rotate(112)',()=>engine(0,0,23,52));
  poly('237,99 266,123 284,179 306,238 301,316 272,403 242,391 218,314 216,244 226,170','url(#armor)',ink,3.5);
  poly('240,111 248,165 232,214 224,210 235,158',p.light,'none');
  poly('268,133 276,195 293,242 282,260 268,205',p.shade,'none');
  engine(251,107,21,42);
  poly('252,171 274,213 268,254 239,276 229,231',ink,p.edge,1.5);
  poly('251,187 265,216 258,248 240,258 239,229','url(#glass)',p.emit,1.2);
  line(250,198,245,238,p.light,2);
  reactor(262,293,19);
  poly('234,304 244,323 259,337 251,373 234,337',p.mid,p.edge,1);
  poly('283,316 280,348 269,387 263,359 267,331',p.base,p.edge,1);
  vent(247,337,12,28,6);
  cannon(289,321,65,0.65);
  sensor(200,248,6);sensor(320,225,5);
  hatch(157,275,28,19);
  bolts([[103,161],[104,227],[154,199],[193,202],[167,288],[204,291],[246,169],[275,184],[228,285],[286,281],[240,329],[274,365],[329,194],[364,173],[405,151],[344,256]]);
  caution(172,185,20);caution(329,203,21);
  label(315,251,'VEC-02',5);label(233,317,'09',5);label(122,208,'PORT',4);
  line(212,262,221,277,p.emit,2);line(301,266,306,252,p.emit,2);
}
function gunship() {
  // Wide slab-sided siege craft: three forward guns and two armored sponsons.
  poly('167,103 217,116 256,97 295,116 345,103 385,142 439,162 449,279 420,336 340,359 297,384 256,421 215,384 172,359 92,336 63,279 73,162 127,142','url(#hull)',ink,5);
  mirror(()=> {
    poly('80,173 134,151 169,122 199,136 203,305 172,344 105,321 78,276',p.base,p.edge,1.6);
    poly('86,177 139,159 160,138 184,144 184,213 156,231 92,221',p.mid,ink,2);
    poly('86,177 100,184 157,171 174,147 160,138 139,159',p.light,'none');
    poly('92,236 151,245 180,229 183,280 165,322 113,308 94,276',p.shade,p.edge,1.2);
    vent(110,251,39,40,8);
    poly('157,249 169,242 173,282 159,309 150,303',p.mid,'none');
    line(96,194,98,216,p.light,2);line(103,298,113,310,p.light,2);
    engine(159,127,30,63);
    cannon(126,308,81,1);
    sensor(181,221,7);
    hatch(83,226,18,31);
    bolts([[89,182],[101,213],[176,198],[164,236],[104,297],[167,325],[191,268]]);
    caution(113,192,27);
  });
  poly('256,108 287,128 313,178 313,293 294,340 256,401 218,340 199,293 199,178 225,128','url(#armor)',ink,3.5);
  mirror(()=> {
    poly('226,143 236,140 231,190 221,231 207,220 210,181',p.light,ink,1);
    poly('211,252 231,269 233,309 245,332 232,357 215,319',p.base,p.edge,1);
    vent(214,276,12,35,6);
    bolts([[225,165],[210,239],[228,329]]);
  });
  poly('240,144 272,144 284,180 271,207 241,207 228,180',dark,p.edge,1.4);
  poly('240,159 272,159 276,178 266,191 246,191 236,178','url(#glass)',p.emit,1.4);
  line(245,164,265,164,p.light,1.7);
  reactor(256,246,26);
  label(243,284,'R-03',6);label(111,239,'AMMO',5);label(348,239,'TRIAD',5);
  cannon(256,318,96,1.05);
  sensor(256,125,4);
  hatch(240,296,32,19);
}
function weaver() {
  // Low transverse beam hull: six independently armored lattice emitters.
  poly('67,151 115,127 171,161 226,171 256,135 286,171 341,161 397,127 445,151 450,249 423,285 335,303 300,323 273,363 239,363 212,323 177,303 89,285 62,249','url(#hull)',ink,5);
  mirror(()=> {
    poly('77,160 113,140 166,176 216,184 222,255 189,283 101,271 74,243',p.base,p.edge,1.5);
    poly('83,167 111,153 158,187 204,195 202,219 144,215 89,205',p.mid,ink,1.4);
    poly('83,167 93,169 144,201 202,205 204,195 158,187 111,153',p.light,'none');
    poly('86,216 147,229 204,230 207,250 183,268 102,255',p.shade,p.edge,1);
    line(110,237,181,247,p.emit,1.7);
    engine(112,148,23,47);
    sensor(190,202,5);
    vent(143,178,23,24,5);
    bolts([[83,175],[92,244],[132,213],[173,262],[209,230]]);
    caution(112,205,25);
  });
  // Launcher bank is not a duplicate gunship: narrow tubes hung along a beam.
  for(const [x,y] of [[92,259],[145,279],[195,291],[317,291],[367,279],[420,259]]) {
    poly(`${x-16},${y-16} ${x+16},${y-16} ${x+19},${y+30} ${x+10},${y+48} ${x-10},${y+48} ${x-19},${y+30}`,metal,ink,2.5);
    poly(`${x-12},${y-10} ${x+12},${y-10} ${x+12},${y+23} ${x-12},${y+23}`,p.mid,p.edge,1);
    rect(x-7,y+1,14,25,dark,p.edge,1);
    for(let i=0;i<4;i++) rect(x-5,y+4+i*5,10,2,p.emit,'none');
    rect(x-7,y+29,14,12,ink,p.edge,1.2);
    rect(x-4,y+31,8,4,p.glass,p.emit,0.7);
    bolt(x-10,y-6,1.5);bolt(x+10,y-6,1.5);
  }
  poly('256,148 282,184 294,245 285,311 270,353 242,353 227,311 218,245 230,184','url(#armor)',ink,3.5);
  poly('256,158 250,198 233,221 230,204 239,182',p.light,'none');
  poly('256,158 273,185 280,220 264,199',p.base,'none');
  poly('256,191 276,225 269,246 243,246 236,225',ink,p.edge,1.5);
  poly('256,203 267,224 263,235 249,235 245,224','url(#glass)',p.emit,1.1);
  reactor(256,277,20);
  vent(245,311,22,23,5);
  sensor(256,343,4);
  line(224,264,208,253,p.edge,1.5);line(288,264,304,253,p.edge,1.5);
  bolts([[235,246],[277,246],[237,305],[275,305]]);
  label(238,309,'NET-04',4.5);label(91,224,'LATTICE',4.6);label(371,224,'ARRAY',4.6);
}
function splitter() {
  // Two visibly independent arrow-capsules; four breakaway locks bridge the gap.
  // The long open center seam remains actual transparent negative space.
  for(const y of [169,213,276,323]) {
    rect(222,y,68,13,dark,ink,2);
    rect(235,y+2,42,9,metal,p.edge,0.7);
    rect(252,y+1,8,11,p.mid,ink,1);
    caution(245,y+4,22);
  }
  mirror(()=> {
    poly('181,80 216,107 235,177 232,297 223,365 187,436 158,392 144,334 98,305 93,192 127,145 142,99','url(#hull)',ink,5);
    poly('150,112 180,92 204,118 221,180 216,286 224,326 208,370 187,418 169,380 160,321 111,296 106,198 140,153','url(#armor)',p.edge,1.8);
    poly('151,123 178,106 186,137 165,186 142,221 113,245 112,204 144,160',p.mid,ink,1.7);
    poly('151,123 178,106 173,129 151,174 123,213 112,221 112,204 144,160',p.light,'none');
    poly('117,258 143,244 158,261 153,302 124,290',p.shade,p.edge,1.2);
    vent(120,261,25,25,5);
    poly('204,160 218,183 212,249 204,263 198,230',p.base,p.edge,1);
    engine(179,106,24,54);
    poly('182,164 202,195 200,229 180,250 162,225 165,195',ink,p.edge,1.5);
    poly('182,177 192,197 191,220 181,234 172,219 174,198','url(#glass)',p.emit,1.1);
    line(181,185,177,214,p.light,1.7);
    reactor(183,284,22);
    poly('165,318 182,328 198,314 209,329 198,369 186,393 172,363',p.shade,p.edge,1.1);
    vent(177,338,15,29,6);
    cannon(145,315,66,0.72);
    sensor(214,307,4.5);
    sensor(132,237,4.5);
    bolts([[145,157],[122,229],[155,230],[205,188],[204,259],[116,290],[163,310],[207,337],[182,381]]);
    caution(194,133,17);
    for(let i=0;i<3;i++) rect(218,232+i*10,5,6,metal,p.edge,0.7);
    poly('187,394 192,402 187,420 183,405',p.light,'none');
  });
  label(165,263,'A-05',5);label(329,263,'B-05',5);
  label(111,253,'SEP',4);label(383,253,'SEP',4);
}
function escort() {
  // Long spinal frigate: layered prow, two heavy side batteries, command bridge.
  poly('225,64 287,64 309,97 318,153 350,171 389,206 396,301 365,350 313,367 292,410 256,449 220,410 199,367 147,350 116,301 123,206 162,171 194,153 203,97','url(#hull)',ink,5);
  mirror(()=> {
    poly('165,185 198,173 210,216 209,327 193,353 154,335 129,297 136,215',p.base,p.edge,1.5);
    poly('143,215 166,193 191,185 193,248 172,265 138,256',p.mid,ink,1.7);
    poly('143,215 155,215 177,204 183,188 166,193',p.light,'none');
    poly('136,268 166,276 191,258 193,313 177,335 153,321',p.shade,p.edge,1.1);
    vent(147,278,26,38,8);
    engine(172,190,23,47);
    cannon(151,319,66,0.76);
    cannon(186,329,77,0.79);
    sensor(196,260,5);
    bolts([[140,238],[181,244],[133,287],[179,325],[200,298]]);
    caution(145,251,23);
  });
  poly('229,74 283,74 299,103 308,182 320,238 307,326 284,398 256,435 228,398 205,326 192,238 204,182 213,103','url(#armor)',ink,3.4);
  mirror(()=> {
    poly('222,109 234,109 227,180 213,218 205,211 215,159',p.light,ink,1);
    poly('213,243 232,257 232,321 246,355 233,385 216,333 205,289',p.base,p.edge,1.3);
    poly('214,252 220,258 220,313 230,335 226,345 213,315',p.mid,'none');
    vent(213,273,12,39,7);
    bolts([[222,122],[214,213],[230,245],[211,265],[223,332],[237,375]]);
    engine(230,79,20,46);
    hatch(212,185,17,26);
  });
  poly('242,124 270,124 287,158 280,202 256,225 232,202 225,158',ink,p.edge,1.7);
  poly('243,139 269,139 277,159 270,190 256,204 242,190 235,159','url(#glass)',p.emit,1.1);
  poly('243,143 249,143 245,179 250,190 243,185 239,158',p.light,'none');
  line(256,140,256,192,p.edge,1.2);line(240,164,272,164,p.base,2);
  reactor(256,263,24);
  poly('241,299 271,299 282,324 269,349 243,349 230,324',dark,p.edge,1.2);
  sensor(256,321,10);
  cannon(256,359,75,0.85);
  hatch(241,93,30,22);
  label(243,296,'E-06',6);label(235,234,'COMMAND',4.7);
  label(154,274,'PDC',4.5);label(341,274,'PDC',4.5);
  for(let i=0;i<4;i++) { rect(239,352+i*8,5,3,p.mid,'none');rect(268,352+i*8,5,3,p.mid,'none'); }
}
const builders = { scout, zigzag, gunship, weaver, splitter, escort };
const descriptions = {
  scout:'Orange reconnaissance dart; narrow arrow hull, swept shoulders, optical cockpit and single spinal lance.',
  zigzag:'Violet asymmetric hooked-wing skirmisher; opposed lateral vector thrusters and offset forward railgun.',
  gunship:'Red broad armored gunboat; three heavy forward cannons, ammunition sponsons and recessed siege reactor.',
  weaver:'Cyan transverse lattice ship; six discrete launcher pods, crosswise power bus and central fire-control core.',
  splitter:'Green separable twin-capsule vessel; two complete reactors, independent cabins and four breakaway couplers.',
  escort:'Pink-violet long armored frigate; spinal command bridge, stepped prow and four sponson point-defense guns.',
};
fs.mkdirSync(OUT, { recursive:true });
for(const [id,build] of Object.entries(builders)) {
  p = palettes[id]; s = [];
  push('<?xml version="1.0" encoding="UTF-8"?>');
  push(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 512 512" role="img" aria-labelledby="title desc">`);
  push(`<title id="title">STAR STRIKE / ${id.toUpperCase()} / MK.II</title><desc id="desc">${descriptions[id]} Original hard-surface vector artwork. Transparent background. Forward direction is down.</desc>`);
  push(`<defs>
    <linearGradient id="hull" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${metal}"/><stop offset="0.5" stop-color="${dark}"/><stop offset="1" stop-color="${ink}"/></linearGradient>
    <linearGradient id="armor" x1="0" y1="0" x2="1" y2="0.7"><stop stop-color="${p.light}"/><stop offset="0.38" stop-color="${p.mid}"/><stop offset="0.7" stop-color="${p.base}"/><stop offset="1" stop-color="${p.shade}"/></linearGradient>
    <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${p.glass}"/><stop offset="0.48" stop-color="${p.base}"/><stop offset="1" stop-color="${dark}"/></linearGradient>
  </defs>`);
  build(); push('</svg>');
  const svg = s.join('\n') + '\n';
  if (/<(?:script|image|foreignObject)\b|(?:href|src)\s*=|<!DOCTYPE/i.test(svg)) throw new Error(`Unsafe SVG: ${id}`);
  const count = (svg.match(/<(?:polygon|path|rect|circle|line|text)\b/g)||[]).length;
  if(count < 100) throw new Error(`Insufficient shape layering: ${id} (${count})`);
  fs.writeFileSync(path.join(OUT, `${id}.svg`), svg, 'utf8');
  console.log(`${id}.svg: ${count} shapes, ${Buffer.byteLength(svg)} bytes, 1024x1024 / viewBox 0 0 512 512`);
}
