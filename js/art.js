/* 星际突袭 · Optional local PNG renderer. No gameplay/module dependencies.
 * Build protocol: JSON.parse the text between ART_SOURCES_BEGIN/END, replace
 * each local path with its PNG data URL, then JSON.stringify the same table.
 * Never wait for ready to start play: unavailable sprites use Canvas fallbacks.
 */
'use strict';
(function () {
  const G = (window.Game = window.Game || {});
  if (G.art) return; // One image instance/load per entry, even if script is repeated.
  const SOURCES = /* ART_SOURCES_BEGIN */ {
    "player": "assets/art/runtime/player.png",
    "scout": "assets/art/runtime/scout.png",
    "zigzag": "assets/art/runtime/zigzag.png",
    "gunship": "assets/art/runtime/gunship.png",
    "diver": "assets/art/runtime/diver.png",
    "weaver": "assets/art/runtime/weaver.png",
    "splitter": "assets/art/runtime/splitter.png",
    "escort": "assets/art/runtime/escort.png",
    "hive": "assets/art/runtime/hive.png",
    "reaver": "assets/art/runtime/reaver.png",
    "dread": "assets/art/runtime/dread.png",
    "arbiter": "assets/art/runtime/arbiter.png",
    "endwalker": "assets/art/runtime/endwalker.png",
    "devourer": "assets/art/runtime/devourer.png",
    "elite-overlay": "assets/art/runtime/elite-overlay.png",
    "arbiter-outer-ring": "assets/art/runtime/arbiter-outer-ring.png",
    "arbiter-inner-ring": "assets/art/runtime/arbiter-inner-ring.png",
    "arbiter-hull": "assets/art/runtime/arbiter-hull.png",
    "devourer-armor-ring": "assets/art/runtime/devourer-armor-ring.png",
    "devourer-intake-iris": "assets/art/runtime/devourer-intake-iris.png",
    "devourer-hull": "assets/art/runtime/devourer-hull.png"
  } /* ART_SOURCES_END */;

  const entries = Object.create(null);
  const stats = { draws: 0, fallbacks: 0 };
  function status() {
    const items = Object.keys(entries).map((id) => {
      const e = entries[id];
      return { id, src: e.src, state: e.state, error: e.error,
        width: e.width, height: e.height, draws: e.draws };
    });
    return { total: items.length,
      loaded: items.filter((e) => e.state === 'loaded').length,
      failed: items.filter((e) => e.state === 'failed').length,
      pending: items.filter((e) => e.state === 'loading').length,
      draws: stats.draws, fallbacks: stats.fallbacks, entries: items };
  }
  function available(id) { return !!entries[id] && entries[id].state === 'loaded'; }

  // Draw at the current entity origin. Size is the square's design-space edge;
  // generated crops fill 96% of it, rather than retaining original blank margins.
  function draw(ctx, id, size, y) {
    const e = entries[id];
    if (!available(id) || !ctx || typeof ctx.drawImage !== 'function') {
      stats.fallbacks++;
      return false;
    }
    try {
      ctx.drawImage(e.image, -size / 2, (y || 0) - size / 2, size, size);
      e.draws++;
      stats.draws++;
      return true;
    } catch (error) {
      e.state = 'failed';
      e.error = 'draw: ' + String(error && error.message || error);
      stats.fallbacks++;
      return false;
    }
  }

  G.art = { entries, stats, status, available, draw, sources: SOURCES, ready: null };
  const loads = Object.keys(SOURCES).map((id) => new Promise((resolve) => {
    const e = entries[id] = { id, src: SOURCES[id], state: 'loading', error: null,
      image: null, width: 0, height: 0, draws: 0 };
    let settled = false, timer;
    function finish(error) {
      if (settled) return;
      settled = true;
      if (timer && typeof clearTimeout === 'function') clearTimeout(timer);
      if (e.image) { e.image.onload = null; e.image.onerror = null; }
      e.width = e.image && e.image.naturalWidth || 0;
      e.height = e.image && e.image.naturalHeight || 0;
      e.state = error ? 'failed' : 'loaded';
      e.error = error ? String(error.message || error) : null;
      resolve(e);
    }
    if (typeof Image !== 'function') { finish('Image unavailable; Canvas fallback'); return; }
    try {
      const image = e.image = new Image();
      image.decoding = 'async';
      image.onload = function () {
        if (!image.naturalWidth || !image.naturalHeight) { finish('Empty image'); return; }
        if (typeof image.decode === 'function') {
          Promise.resolve().then(() => image.decode()).then(() => finish(), finish);
        } else finish();
      };
      image.onerror = function () { finish('PNG load failed'); };
      // A stalled request or decode must not keep ready pending forever.
      if (typeof setTimeout === 'function') timer = setTimeout(() => finish('PNG load/decode timeout'), 12000);
      image.src = e.src;
    } catch (error) { finish(error); }
  }));
  G.art.ready = Promise.all(loads).then(status);
})();
