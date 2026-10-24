/* Interactive network map (inline SVG, no external libraries, tiles or tracking).
   Reads data/network-map.json and draws plants, DCs, customer zones and flows. */
(function () {
  'use strict';

  var root = document.getElementById('netmap');
  if (!root) return;
  var app = root.querySelector('.netmap-app');
  var ns = 'http://www.w3.org/2000/svg';

  // If anything goes wrong, fall back to the static images kept inside <noscript>.
  var ns_el = root.querySelector('noscript');
  var fallbackHtml = ns_el ? ns_el.textContent : '';
  function fallback() {
    if (fallbackHtml) root.innerHTML = fallbackHtml;
  }
  if (!app || !window.fetch || !document.createElementNS) { fallback(); return; }

  // Simplified outline of the continental U.S. as [lon, lat] pairs (clockwise from the northwest).
  var OUTLINE = [
    [-124.7, 48.4], [-123.2, 48.3], [-122.8, 49.0], [-95.2, 49.0], [-94.6, 48.7], [-93.0, 48.6],
    [-91.4, 48.1], [-89.6, 48.0], [-92.0, 46.8], [-90.4, 46.6], [-88.0, 47.4], [-87.0, 46.5],
    [-84.9, 46.8], [-84.5, 46.4], [-83.6, 46.1], [-84.7, 45.8], [-83.4, 45.2], [-83.9, 43.9],
    [-82.5, 43.0], [-83.1, 42.2], [-83.4, 41.7], [-82.7, 41.5], [-81.7, 41.5], [-80.5, 42.0],
    [-79.0, 42.8], [-79.05, 43.25], [-77.0, 43.3], [-76.2, 43.6], [-76.3, 44.2], [-75.3, 44.9],
    [-74.7, 45.0], [-71.5, 45.0], [-70.8, 45.4], [-70.3, 46.4], [-69.2, 47.45], [-68.3, 47.35],
    [-67.8, 47.07], [-67.8, 45.7], [-67.0, 44.8], [-68.5, 44.2], [-70.2, 43.65], [-70.7, 43.0],
    [-70.8, 42.6], [-71.0, 42.3], [-70.0, 41.8], [-70.0, 41.6], [-71.4, 41.45], [-72.9, 41.25],
    [-73.7, 40.9], [-74.0, 40.4], [-74.1, 39.7], [-74.9, 38.95], [-75.1, 38.4], [-75.5, 37.6],
    [-76.0, 37.0], [-75.9, 36.5], [-75.5, 35.3], [-76.5, 34.7], [-77.9, 33.9], [-79.0, 33.2],
    [-80.0, 32.5], [-81.2, 31.7], [-81.4, 30.7], [-81.3, 29.8], [-80.5, 28.4], [-80.0, 26.8],
    [-80.15, 25.7], [-80.4, 25.2], [-81.1, 25.15], [-81.8, 26.1], [-82.2, 26.9], [-82.7, 27.8],
    [-82.8, 28.9], [-83.7, 29.9], [-84.3, 30.05], [-85.3, 29.7], [-86.5, 30.4], [-88.0, 30.3],
    [-89.3, 30.3], [-89.2, 29.0], [-90.2, 29.1], [-91.5, 29.5], [-92.8, 29.6], [-93.8, 29.7],
    [-94.8, 29.3], [-95.9, 28.6], [-97.0, 27.8], [-97.4, 26.9], [-97.15, 25.95], [-98.3, 26.1],
    [-99.1, 26.4], [-99.5, 27.5], [-100.5, 28.7], [-101.4, 29.8], [-102.4, 29.8], [-103.1, 29.0],
    [-104.5, 29.6], [-104.9, 30.6], [-106.5, 31.75], [-108.2, 31.78], [-108.2, 31.33],
    [-111.07, 31.33], [-114.8, 32.5], [-117.1, 32.53], [-117.3, 33.1], [-118.4, 33.75],
    [-119.2, 34.15], [-120.5, 34.45], [-120.65, 35.1], [-121.9, 36.6], [-122.5, 37.5],
    [-123.0, 38.0], [-123.7, 38.9], [-124.35, 40.3], [-124.2, 42.0], [-124.5, 42.8],
    [-124.0, 44.6], [-123.95, 46.2], [-124.1, 46.9]
  ];

  // Albers equal-area conic projection (standard U.S. parameters).
  var RAD = Math.PI / 180;
  var P1 = 29.5 * RAD, P2 = 45.5 * RAD, P0 = 37.5 * RAD, L0 = -96 * RAD;
  var N = (Math.sin(P1) + Math.sin(P2)) / 2;
  var C = Math.cos(P1) * Math.cos(P1) + 2 * N * Math.sin(P1);
  var RHO0 = Math.sqrt(C - 2 * N * Math.sin(P0)) / N;
  function albers(lon, lat) {
    var rho = Math.sqrt(C - 2 * N * Math.sin(lat * RAD)) / N;
    var th = N * (lon * RAD - L0);
    return [rho * Math.sin(th), -(RHO0 - rho * Math.cos(th))];
  }

  var W = 1000, PAD = 24;
  var pts = OUTLINE.map(function (p) { return albers(p[0], p[1]); });
  var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  pts.forEach(function (p) {
    minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
    minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]);
  });
  var SCALE = (W - 2 * PAD) / (maxX - minX);
  var H = Math.round((maxY - minY) * SCALE + 2 * PAD);
  function project(lon, lat) {
    var p = albers(lon, lat);
    return [PAD + (p[0] - minX) * SCALE, PAD + (p[1] - minY) * SCALE];
  }

  // Plants share coordinates with DCs in four cities, so plants are drawn offset (with a short stem).
  var PLANT_OFFSET = [-20, -17];

  var reduceQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  function reduced() { return !!(reduceQuery && reduceQuery.matches); }

  function svgEl(name, attrs, parent) {
    var e = document.createElementNS(ns, name);
    if (attrs) for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function num(n, d) {
    return Number(n).toLocaleString('en-US', { maximumFractionDigits: d == null ? 1 : d });
  }
  function round1(v) { return (Math.round(v * 10 + 1e-9) / 10).toFixed(1); }
  var LABELS = { baseline: 'Baseline', optimized: 'Optimized' };

  fetch(root.getAttribute('data-src'))
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function (data) { build(data); })
    .catch(fallback);

  function build(data) {
    var stage = app.querySelector('[data-stage]');
    var desc = document.getElementById('netmap-desc');
    var buttons = app.querySelectorAll('.netmap-btn');
    var captions = app.querySelectorAll('[data-caption]');
    var kpiEls = {};
    Array.prototype.forEach.call(app.querySelectorAll('[data-kpi]'), function (e) { kpiEls[e.getAttribute('data-kpi')] = e; });

    var facilities = data.facilities;
    var byId = {};
    facilities.forEach(function (f) { f.xy = project(f.lon, f.lat); byId[f.id] = f; });
    var plants = facilities.filter(function (f) { return f.type === 'plant'; });
    var dcs = facilities.filter(function (f) { return f.type === 'dc'; });
    var customers = facilities.filter(function (f) { return f.type === 'customer'; });
    plants.forEach(function (f) { f.pos = [f.xy[0] + PLANT_OFFSET[0], f.xy[1] + PLANT_OFFSET[1]]; });
    dcs.forEach(function (f) { f.pos = f.xy; });
    customers.forEach(function (f) { f.pos = f.xy; });
    var maxDemand = Math.max.apply(null, customers.map(function (c) { return c.demand_tl; }));

    var svg = svgEl('svg', {
      viewBox: '0 0 ' + W + ' ' + H, role: 'group', 'aria-describedby': 'netmap-desc',
      'aria-label': 'Interactive map of the continental U.S. showing plants, distribution centers and customer zones for the selected network. Tab to a plant or open distribution center for details.',
      focusable: 'false'
    });
    svgEl('path', {
      class: 'nm-land', 'aria-hidden': 'true',
      d: 'M' + OUTLINE.map(function (p) { var q = project(p[0], p[1]); return q[0].toFixed(1) + ' ' + q[1].toFixed(1); }).join('L') + 'Z'
    }, svg);
    var stemLayer = svgEl('g', { 'aria-hidden': 'true' }, svg);
    var flowLayer = svgEl('g', { 'aria-hidden': 'true' }, svg);
    var custLayer = svgEl('g', null, svg);
    var dcLayer = svgEl('g', null, svg);
    var labelLayer = svgEl('g', { 'aria-hidden': 'true' }, svg);
    var plantLayer = svgEl('g', null, svg);

    // Customer zones: small circles sized by demand.
    customers.forEach(function (c) {
      c.r = 2 + 5.5 * Math.sqrt(c.demand_tl / maxDemand);
      var g = svgEl('g', { class: 'nm-cust', 'data-id': c.id, role: 'img', tabindex: '-1',
        'aria-label': c.name + ', ' + c.state + ', customer zone, demand ' + num(c.demand_tl) + ' TL per year' }, custLayer);
      svgEl('circle', { class: 'nm-hit', cx: c.pos[0], cy: c.pos[1], r: Math.max(c.r + 3, 9) }, g);
      svgEl('circle', { class: 'nm-dot', cx: c.pos[0], cy: c.pos[1], r: c.r.toFixed(2) }, g);
    });

    // Plants: factory-shaped markers, offset from the DC that shares their city.
    plants.forEach(function (p) {
      svgEl('line', { class: 'nm-stem', x1: p.pos[0], y1: p.pos[1], x2: p.xy[0], y2: p.xy[1] }, stemLayer);
      var g = svgEl('g', { class: 'nm-plant', 'data-id': p.id, role: 'img', tabindex: '0',
        transform: 'translate(' + p.pos[0].toFixed(1) + ' ' + p.pos[1].toFixed(1) + ')',
        'aria-label': p.name + ', plant, capacity ' + num(p.capacity_tl, 0) + ' TL per year' }, plantLayer);
      svgEl('circle', { class: 'nm-hit', r: 16 }, g);
      svgEl('path', { class: 'nm-plant-shape', d: 'M-11 8V-2L-5-6V-2L1-6V-2L7-6V-11H11V8Z' }, g);
    });

    // DCs: circles sized Small / Large; closed ones fade to a dashed ghost ring.
    var SIZE_R = { Small: 9, Large: 13 };
    dcs.forEach(function (d) {
      var g = svgEl('g', { class: 'nm-dc', 'data-id': d.id, role: 'img' }, dcLayer);
      svgEl('circle', { class: 'nm-hit', cx: d.pos[0], cy: d.pos[1], r: 15 }, g);
      d.dot = svgEl('circle', { class: 'nm-dot', cx: d.pos[0], cy: d.pos[1], r: 9 }, g);
      d.el = g;
      var left = d.lon < -118;
      d.label = svgEl('text', {
        class: 'nm-label', x: d.pos[0] + (left ? -16 : 16), y: d.pos[1] + 4,
        'text-anchor': left ? 'end' : 'start'
      }, labelLayer);
      d.label.textContent = d.city;
    });

    stage.insertBefore(svg, stage.firstChild);

    // Tooltip (shared). Facilities also carry full aria-labels, so the tooltip is visual only.
    var tip = document.createElement('div');
    tip.className = 'netmap-tip';
    tip.setAttribute('aria-hidden', 'true');
    tip.hidden = true;
    stage.appendChild(tip);

    var current = 'baseline';

    function closedLabel() { return 'Closed in the ' + LABELS[current] + ' network'; }

    function describe(f) {
      if (f.type === 'plant') return [f.name, 'Plant', 'Capacity: ' + num(f.capacity_tl, 0) + ' TL/yr'];
      if (f.type === 'dc') {
        if (!f.open[current]) return [f.name, closedLabel()];
        var lines = [f.name, 'Distribution center (' + f.size[current] + ')', 'Capacity: ' + num(f.capacity_tl[current], 0) + ' TL/yr'];
        customers.forEach(function (c) {
          if (c.lat === f.lat && c.lon === f.lon) lines.push('Also a customer zone: demand ' + num(c.demand_tl) + ' TL/yr');
        });
        return lines;
      }
      return [f.name + ', ' + f.state, 'Customer zone', 'Demand: ' + num(f.demand_tl) + ' TL/yr'];
    }

    var tipFor = null;
    function showTip(g) {
      var f = byId[g.getAttribute('data-id')];
      if (!f) return;
      tipFor = g;
      var lines = describe(f);
      tip.textContent = '';
      lines.forEach(function (t, i) {
        var s = document.createElement(i === 0 ? 'strong' : 'span');
        s.textContent = t;
        tip.appendChild(s);
      });
      tip.hidden = false;
      var pt = svg.createSVGPoint();
      pt.x = f.pos[0]; pt.y = f.pos[1];
      var m = svg.getScreenCTM();
      if (!m) { tip.hidden = true; return; }
      var s = pt.matrixTransform(m);
      var sr = stage.getBoundingClientRect();
      var x = s.x - sr.left, y = s.y - sr.top;
      var tw = tip.offsetWidth, th = tip.offsetHeight;
      x = Math.max(tw / 2 + 4, Math.min(sr.width - tw / 2 - 4, x));
      var above = y - th - 18 >= 4;
      tip.style.left = x.toFixed(0) + 'px';
      tip.style.top = (above ? y - 16 : y + 16).toFixed(0) + 'px';
      tip.classList.toggle('is-below', !above);
    }
    function hideTip() { tip.hidden = true; tipFor = null; }

    function targetOf(e) {
      var t = e.target;
      return t && t.closest ? t.closest('[data-id]') : null;
    }
    svg.addEventListener('pointerover', function (e) {
      if (e.pointerType === 'touch') return;
      var g = targetOf(e);
      if (g) showTip(g);
    });
    svg.addEventListener('pointerout', function (e) {
      if (e.pointerType === 'touch') return;
      if (targetOf(e) && document.activeElement !== targetOf(e)) hideTip();
    });
    svg.addEventListener('click', function (e) {
      var g = targetOf(e);
      if (g) showTip(g); else hideTip();
    });
    svg.addEventListener('focusin', function (e) { var g = targetOf(e); if (g) showTip(g); });
    svg.addEventListener('focusout', hideTip);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') hideTip(); });
    document.addEventListener('click', function (e) { if (!stage.contains(e.target)) hideTip(); });
    window.addEventListener('resize', hideTip);

    // Flows: smooth curves, width scaled by volume, inbound (plant to DC) vs outbound (DC to customer).
    function flowWidth(v) { return 0.8 + 6.5 * Math.sqrt(v / 10281); }
    function flowPath(a, b) {
      var x1 = a[0], y1 = a[1], x2 = b[0], y2 = b[1];
      var dx = x2 - x1, dy = y2 - y1, len = Math.sqrt(dx * dx + dy * dy);
      var mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      var px = -dy * 0.16, py = dx * 0.16;
      if (my + py > my) { px = -px; py = -py; }
      return 'M' + x1.toFixed(1) + ' ' + y1.toFixed(1) + 'Q' + (mx + px).toFixed(1) + ' ' + (my + py).toFixed(1) +
        ' ' + x2.toFixed(1) + ' ' + y2.toFixed(1);
    }
    var flowGroup = null, flowTimer = null;

    function renderFlows(name, animate) {
      var flows = data.scenarios[name].flows.slice().sort(function (a, b) { return b.volume_tl - a.volume_tl; });
      if (flowGroup) {
        var old = flowGroup;
        if (animate) {
          old.style.transition = 'opacity .2s';
          old.style.opacity = '0';
          setTimeout(function () { if (old.parentNode) old.parentNode.removeChild(old); }, 230);
        } else if (old.parentNode) old.parentNode.removeChild(old);
      }
      var g = svgEl('g', null, flowLayer);
      flowGroup = g;
      var inbound = [], outbound = [];
      flows.forEach(function (fl) {
        var a = byId[fl.from], b = byId[fl.to];
        if (!a || !b) return;
        var dx = a.pos[0] - b.pos[0], dy = a.pos[1] - b.pos[1];
        if (Math.sqrt(dx * dx + dy * dy) < 1.5) return; // same location, nothing to draw
        var p = svgEl('path', {
          class: 'nm-flow nm-' + fl.leg, d: flowPath(a.pos, b.pos), fill: 'none',
          'stroke-width': flowWidth(fl.volume_tl).toFixed(2)
        }, g);
        (fl.leg === 'inbound' ? inbound : outbound).push(p);
      });
      if (!animate || !g.firstChild || !('animate' in g.firstChild)) return;
      // Lanes draw outward: plant to DC first, then DC to customer. Total under 1.3 seconds.
      inbound.forEach(function (p) {
        var len = p.getTotalLength();
        p.animate([{ strokeDasharray: len + ' ' + len, strokeDashoffset: len },
          { strokeDasharray: len + ' ' + len, strokeDashoffset: 0 }],
        { duration: 450, delay: 0, easing: 'ease-out', fill: 'backwards' });
      });
      outbound.forEach(function (p, i) {
        var len = p.getTotalLength();
        p.animate([{ strokeDasharray: len + ' ' + len, strokeDashoffset: len },
          { strokeDasharray: len + ' ' + len, strokeDashoffset: 0 }],
        { duration: 550, delay: 400 + Math.min(i, 40) * 5, easing: 'ease-out', fill: 'backwards' });
      });
    }

    function updateKpis(name) {
      var k = data.scenarios[name].kpis;
      kpiEls.cost.textContent = '$' + round1(k.total_cost / 1e6) + 'M';
      kpiEls.dcs.textContent = String(k.dc_count);
      kpiEls.service.textContent = round1(k.service_level_pct_within_500mi) + '%';
      kpiEls.savings.textContent = name === 'optimized'
        ? '$' + round1(data.summary.total_cost_saving_usd / 1e6) + 'M (' + round1(data.summary.savings_pct) + '%) lower'
        : 'Reference point';
    }

    function updateDescription(name) {
      var open = dcs.filter(function (d) { return d.open[name]; });
      var closed = dcs.filter(function (d) { return !d.open[name]; });
      var k = data.scenarios[name].kpis;
      desc.textContent = LABELS[name] + ' network: ' + plants.length + ' plants (' +
        plants.map(function (p) { return p.city; }).join(', ') + ') supply ' + open.length + ' open distribution centers: ' +
        open.map(function (d) { return d.city + ' (' + d.size[name] + ')'; }).join(', ') + '. ' +
        (closed.length ? 'Not open in this scenario: ' + closed.map(function (d) { return d.city; }).join(', ') + '. ' : '') +
        'The DCs serve ' + customers.length + ' customer zones. Annual cost $' + round1(k.total_cost / 1e6) + ' million, ' +
        round1(k.service_level_pct_within_500mi) + ' percent of demand within one-day range.' +
        (name === 'optimized' ? ' That is $' + round1(data.summary.total_cost_saving_usd / 1e6) + ' million (' +
          round1(data.summary.savings_pct) + ' percent) lower than the baseline.' : '');
    }

    function updateMarkers(name) {
      dcs.forEach(function (d) {
        var open = d.open[name];
        d.el.classList.toggle('is-closed', !open);
        d.dot.setAttribute('r', SIZE_R[open ? d.size[name] : 'Small']);
        d.el.setAttribute('tabindex', open ? '0' : '-1');
        d.el.setAttribute('aria-label', open
          ? d.name + ', distribution center, ' + d.size[name] + ', capacity ' + num(d.capacity_tl[name], 0) + ' TL per year'
          : d.name + ', closed in the ' + LABELS[name] + ' network');
        d.label.classList.toggle('is-closed', !open);
      });
    }

    function setScenario(name, byUser) {
      current = name;
      hideTip();
      Array.prototype.forEach.call(buttons, function (b) {
        b.setAttribute('aria-pressed', b.getAttribute('data-scenario') === name ? 'true' : 'false');
      });
      Array.prototype.forEach.call(captions, function (c) { c.hidden = c.getAttribute('data-caption') !== name; });
      updateKpis(name);
      updateDescription(name);
      updateMarkers(name);
      if (byUser || drawn) { drawn = true; renderFlows(name, !reduced()); }
    }

    var drawn = false;
    Array.prototype.forEach.call(buttons, function (b) {
      b.addEventListener('click', function () {
        var n = b.getAttribute('data-scenario');
        if (n !== current) setScenario(n, true);
      });
    });

    app.hidden = false;
    setScenario('baseline', false);

    // Lanes draw in the first time the map scrolls into view.
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        if (entries.some(function (e) { return e.isIntersecting; })) {
          io.disconnect();
          if (!drawn) { drawn = true; renderFlows(current, !reduced()); }
        }
      }, { threshold: 0.3 });
      io.observe(stage);
    } else {
      drawn = true;
      renderFlows(current, !reduced());
    }
  }
})();
