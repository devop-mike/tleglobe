const isMobile = window.innerWidth < 768;
const width = window.innerWidth;
const height = window.innerHeight;
const sidebarWidth = isMobile ? 0 : 200;
const globeWidth = width - sidebarWidth;
const radius = Math.min(globeWidth, height) / 2 - 10;
const cx0 = sidebarWidth + globeWidth / 2;
const cy0 = height / 2;
const sensitivity = 75;
const EARTH_RADIUS_KM = 6371;
const DOT_R = isMobile ? 3.5 : 2;
const DOT_R_SEL = isMobile ? 5 : 3.5;

const HAM_NORADS = new Set([
  7530, 22825, 24278, 25544, 27607, 39444,
  40910, 40931, 40967,
  42759, 42761, 43017, 43137, 43678, 43770, 43803,
  44909, 45119, 46494, 46785,
]);
const WEATHER_NORADS = new Set([25338, 28654, 33591, 37849, 38771, 40069, 43013, 43689, 44387]);
const CATEGORY_COLORS = {
  ham: '#ffd700', weather: '#00bfff', starlink: '#aaaaaa',
  cosmos: '#ff6b6b', flock: '#ff9944', other: '#00ff88',
};
const CATEGORY_LABELS = {
  ham: 'Ham radio', weather: 'Weather', starlink: 'Starlink',
  cosmos: 'COSMOS', flock: 'FLOCK', other: 'Other',
};

function getCategory(name, noradId) {
  if (HAM_NORADS.has(noradId)) return 'ham';
  if (WEATHER_NORADS.has(noradId)) return 'weather';
  if (name.startsWith('STARLINK')) return 'starlink';
  if (name.startsWith('COSMOS')) return 'cosmos';
  if (name.startsWith('FLOCK')) return 'flock';
  return 'other';
}

const projection = d3.geoOrthographic()
  .scale(radius)
  .center([0, 0])
  .rotate([0, -30])
  .translate([cx0, cy0]);

const path = d3.geoPath().projection(projection);

const svg = d3.select('#globe')
  .attr('width', width)
  .attr('height', height);

svg.append('circle').attr('class', 'sphere').attr('cx', cx0).attr('cy', cy0).attr('r', radius);
svg.append('path').datum({ type: 'Sphere' }).attr('class', 'sphere').attr('d', path);
svg.append('path').datum(d3.geoGraticule()()).attr('class', 'graticule').attr('d', path);

const landGroup = svg.append('g');
const borderGroup = svg.append('g');
const trailLayer = svg.append('g');
const satLayer = svg.append('g');
const labelLayer = svg.append('g').attr('display', 'none');

fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json')
  .then(r => r.json())
  .then(world => {
    landGroup.selectAll('path')
      .data(topojson.feature(world, world.objects.countries).features)
      .join('path').attr('class', 'land').attr('d', path);
    borderGroup.append('path')
      .datum(topojson.mesh(world, world.objects.countries, (a, b) => a !== b))
      .attr('class', 'border').attr('d', path);
  });

function isVisible(lon, lat) {
  const [r0, r1] = projection.rotate();
  const lon0 = -r0 * Math.PI / 180;
  const lat0 = -r1 * Math.PI / 180;
  const lonR = lon * Math.PI / 180;
  const latR = lat * Math.PI / 180;
  return Math.sin(latR) * Math.sin(lat0) + Math.cos(latR) * Math.cos(lat0) * Math.cos(lonR - lon0) > 0;
}

function elevatedXY(lon, lat, altKm) {
  const [sx, sy] = projection([lon, lat]);
  const [cx, cy] = projection.translate();
  const visualAlt = altKm <= 2000 ? altKm : 2000 + Math.log10(altKm / 2000) * 1000;
  const factor = (EARTH_RADIUS_KM + visualAlt) / EARTH_RADIUS_KM;
  return [cx + (sx - cx) * factor, cy + (sy - cy) * factor];
}

// Tooltip (desktop)
const tooltip = d3.select('#tooltip');
function showTooltip(event, name) {
  tooltip.style('display', 'block').text(name);
  moveTooltip(event);
}
function moveTooltip(event) {
  tooltip.style('left', (event.clientX + 14) + 'px').style('top', (event.clientY - 10) + 'px');
}
function hideTooltip() { tooltip.style('display', 'none'); }

// Name badge (mobile)
const nameBadge = document.getElementById('name-badge');
let badgeTimer = null;
function showBadge(name) {
  clearTimeout(badgeTimer);
  nameBadge.textContent = name;
  nameBadge.classList.add('visible');
  badgeTimer = setTimeout(() => nameBadge.classList.remove('visible'), 2500);
}

// Satellite state
let hoveredSat = null;
let selectedSats = new Set();
let showSelectedOnly = false;
let labelsVisible = false;
let timeRotationEnabled = false;
let timeRotationInterval = null;
let hiddenCategories = new Set();

function refreshSatStyles() {
  satLayer.selectAll('circle.sat')
    .attr('r', d => selectedSats.has(d.name) ? DOT_R_SEL : DOT_R)
    .attr('fill', d => selectedSats.has(d.name) ? '#fff' : CATEGORY_COLORS[d.category])
    .attr('fill-opacity', d => (selectedSats.has(d.name) || d.name === hoveredSat) ? 1 : 0.85);
}

function setListHover(name) {
  d3.select('#sat-list').selectAll('.sat-item').classed('hovered', d => d.name === name);
}

function updateShowSelectedRow() {
  const has = selectedSats.size > 0;
  document.getElementById('show-selected-row').classList.toggle('visible', has);
  if (!has) {
    showSelectedOnly = false;
    document.getElementById('show-selected').checked = false;
  }
}

function renderSatellites() {
  let visible = currentSats.filter(s => isVisible(s.lon, s.lat) && !hiddenCategories.has(s.category));
  if (showSelectedOnly && selectedSats.size > 0) visible = visible.filter(s => selectedSats.has(s.name));

  satLayer.selectAll('circle.sat')
    .data(visible, d => d.name)
    .join(
      enter => enter.append('circle')
        .attr('class', 'sat')
        .style('cursor', 'pointer')
        .on('mouseover', (event, d) => {
          hoveredSat = d.name;
          showTooltip(event, d.name);
          refreshSatStyles();
          setListHover(d.name);
        })
        .on('mousemove', moveTooltip)
        .on('mouseout', () => {
          hoveredSat = null;
          hideTooltip();
          refreshSatStyles();
          setListHover(null);
        })
        .on('click', (event, d) => {
          event.stopPropagation();
          if (selectedSats.has(d.name)) selectedSats.delete(d.name);
          else selectedSats.add(d.name);
          if (isMobile) showBadge(d.name);
          refreshSatStyles();
          renderSatList();
          updateShowSelectedRow();
        }),
      update => update,
      exit => exit.remove(),
    )
    .attr('r', d => selectedSats.has(d.name) ? DOT_R_SEL : DOT_R)
    .attr('fill', d => selectedSats.has(d.name) ? '#fff' : CATEGORY_COLORS[d.category])
    .attr('fill-opacity', d => (selectedSats.has(d.name) || d.name === hoveredSat) ? 1 : 0.85)
    .attr('cx', d => elevatedXY(d.lon, d.lat, d.alt)[0])
    .attr('cy', d => elevatedXY(d.lon, d.lat, d.alt)[1]);
}

function renderSatList() {
  const sorted = tleData
    .filter(s => !hiddenCategories.has(s.category))
    .sort((a, b) => a.name.localeCompare(b.name));
  d3.select('#sat-list').selectAll('.sat-item')
    .data(sorted, d => d.name)
    .join(
      enter => enter.append('div')
        .attr('class', 'sat-item')
        .text(d => d.name)
        .on('mouseover', (event, d) => {
          hoveredSat = d.name; refreshSatStyles(); setListHover(d.name);
        })
        .on('mouseout', () => {
          hoveredSat = null; refreshSatStyles(); setListHover(null);
        })
        .on('click', (event, d) => {
          if (selectedSats.has(d.name)) selectedSats.delete(d.name);
          else selectedSats.add(d.name);
          refreshSatStyles(); renderSatList(); updateShowSelectedRow();
        }),
      update => update,
      exit => exit.remove(),
    )
    .classed('selected', d => selectedSats.has(d.name))
    .classed('hovered', d => d.name === hoveredSat)
    .style('border-left-color', d => CATEGORY_COLORS[d.category]);
}

function renderLabels() {
  if (!labelsVisible) return;
  let visible = currentSats.filter(s => isVisible(s.lon, s.lat) && !hiddenCategories.has(s.category));
  if (showSelectedOnly && selectedSats.size > 0) visible = visible.filter(s => selectedSats.has(s.name));
  labelLayer.selectAll('text.sat-label')
    .data(visible, d => d.name)
    .join('text')
    .attr('class', 'sat-label')
    .text(d => d.name)
    .attr('x', d => elevatedXY(d.lon, d.lat, d.alt)[0] + 4)
    .attr('y', d => elevatedXY(d.lon, d.lat, d.alt)[1] - 4);
}

function render() {
  svg.selectAll('path').attr('d', path);
  if (trailCoords.length) updateTrails();
  renderSatellites();
  renderLabels();
}

function syncSphereCircles() {
  const [tx, ty] = projection.translate();
  const s = projection.scale();
  svg.select('circle.sphere').attr('r', s).attr('cx', tx).attr('cy', ty);
}

// Unified pointer handler — 1 pointer rotates, 2 pointers pinch-zoom.
// Replaces d3.drag + separate touch handlers so they can't conflict.
const activePointers = new Map();
let lastPinchDist = null;

svg.node().addEventListener('pointerdown', (e) => {
  e.preventDefault();
  svg.node().setPointerCapture(e.pointerId);
  activePointers.set(e.pointerId, [e.clientX, e.clientY]);
});

svg.node().addEventListener('pointermove', (e) => {
  if (!activePointers.has(e.pointerId)) return;
  const [px, py] = activePointers.get(e.pointerId);
  activePointers.set(e.pointerId, [e.clientX, e.clientY]);

  if (activePointers.size === 1) {
    const k = sensitivity / projection.scale();
    const [r0, r1] = projection.rotate();
    projection.rotate([r0 + (e.clientX - px) * k, r1 - (e.clientY - py) * k]);
    render();
  } else if (activePointers.size === 2) {
    const pts = Array.from(activePointers.values());
    const dist = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]);
    if (lastPinchDist !== null) {
      const scale = projection.scale();
      const newScale = Math.max(50, Math.min(Math.min(width, height) * 4, scale * dist / lastPinchDist));
      const [tx, ty] = projection.translate();
      const mx = (pts[0][0] + pts[1][0]) / 2;
      const my = (pts[0][1] + pts[1][1]) / 2;
      const factor = newScale / scale;
      projection.scale(newScale).translate([mx + (tx - mx) * factor, my + (ty - my) * factor]);
      syncSphereCircles();
      render();
    }
    lastPinchDist = dist;
  }
});

svg.node().addEventListener('pointerup', (e) => {
  activePointers.delete(e.pointerId);
  if (activePointers.size < 2) lastPinchDist = null;
});

svg.node().addEventListener('pointercancel', (e) => {
  activePointers.delete(e.pointerId);
  if (activePointers.size < 2) lastPinchDist = null;
});

// Scroll zoom (desktop)
svg.on('wheel', (event) => {
  event.preventDefault();
  const [mx, my] = d3.pointer(event);
  const scale = projection.scale();
  const newScale = Math.max(50, Math.min(Math.min(width, height) * 4, scale - event.deltaY * 0.5));
  const [tx, ty] = projection.translate();
  const factor = newScale / scale;
  projection.scale(newScale).translate([mx + (tx - mx) * factor, my + (ty - my) * factor]);
  syncSphereCircles();
  render();
});

// TLE data
let tleData = [];
let currentSats = [];
let trailCoords = [];
let trailMinutes = 15;
let trailsVisible = true;

function parseTLEs(text) {
  const lines = text.trim().split('\n').map(l => l.trim()).filter(Boolean);
  const sats = [];
  let i = 0;
  while (i < lines.length) {
    const l0 = lines[i], l1 = lines[i + 1], l2 = lines[i + 2];
    if (l0 && l1 && l2 && !l0.startsWith('1 ') && !l0.startsWith('2 ') && l1.startsWith('1 ') && l2.startsWith('2 ')) {
      const name = l0.startsWith('0 ') ? l0.slice(2) : l0;
      const noradId = parseInt(l1.substring(2, 7).trim());
      try { sats.push({ name, noradId, category: getCategory(name, noradId), satrec: satellite.twoline2satrec(l1, l2) }); } catch (_) {}
      i += 3;
    } else if (l0 && l1 && l0.startsWith('1 ') && l1.startsWith('2 ')) {
      const noradId = parseInt(l0.substring(2, 7).trim());
      const name = String(noradId);
      try { sats.push({ name, noradId, category: getCategory(name, noradId), satrec: satellite.twoline2satrec(l0, l1) }); } catch (_) {}
      i += 2;
    } else { i++; }
  }
  const seen = new Map();
  for (const s of sats) seen.set(s.noradId, s);
  return Array.from(seen.values());
}

function computeTrailCoords(satrec, fromDate, durationMin) {
  const coords = [];
  for (let t = 0; t <= durationMin; t += 1 / 4) {
    const date = new Date(fromDate.getTime() + t * 60000);
    try {
      const { position } = satellite.propagate(satrec, date);
      if (!position || typeof position === 'boolean') continue;
      const geo = satellite.eciToGeodetic(position, satellite.gstime(date));
      coords.push([satellite.degreesLong(geo.longitude), satellite.degreesLat(geo.latitude), geo.height]);
    } catch (_) {}
  }
  return coords.length ? coords : null;
}

function buildTrailPath(coords) {
  let d = '';
  let prevLon = null;
  const [cx, cy] = projection.translate();
  const r = projection.scale();
  for (const [lon, lat, alt] of coords) {
    if (!isVisible(lon, lat)) { prevLon = null; continue; }
    const [x, y] = elevatedXY(lon, lat, alt);
    if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) { prevLon = null; continue; }
    const jump = prevLon !== null && Math.abs(lon - prevLon) > 180;
    d += (prevLon === null || jump) ? `M${x.toFixed(1)},${y.toFixed(1)}` : `L${x.toFixed(1)},${y.toFixed(1)}`;
    prevLon = lon;
  }
  return d;
}

function updateTrails() {
  let data = trailCoords.filter(t => !hiddenCategories.has(t.category));
  if (showSelectedOnly && selectedSats.size > 0) data = data.filter(t => selectedSats.has(t.name));
  trailLayer.selectAll('path.trail')
    .data(data, t => t.name)
    .join('path')
    .attr('class', 'trail')
    .attr('stroke', t => CATEGORY_COLORS[t.category])
    .attr('d', t => buildTrailPath(t.coords));
}

function recomputeTrails() {
  const now = new Date();
  trailCoords = tleData.map(({ name, category, satrec }) => {
    const coords = computeTrailCoords(satrec, now, trailMinutes);
    return coords ? { name, category, coords } : null;
  }).filter(Boolean);
  updateTrails();
}

function propagate(date) {
  const gmst = satellite.gstime(date);
  const result = [];
  for (const { name, noradId, category, satrec } of tleData) {
    try {
      const { position } = satellite.propagate(satrec, date);
      if (!position || typeof position === 'boolean') continue;
      const geo = satellite.eciToGeodetic(position, gmst);
      result.push({ name, noradId, category,
        lon: satellite.degreesLong(geo.longitude),
        lat: satellite.degreesLat(geo.latitude),
        alt: geo.height });
    } catch (_) {}
  }
  return result;
}

function updateSatellites() {
  currentSats = propagate(new Date());
  renderSatellites();
  renderLabels();
  if (trailsVisible) recomputeTrails();
}

function buildCategoryFilters() {
  const counts = {};
  for (const { category } of tleData) counts[category] = (counts[category] || 0) + 1;
  const container = document.getElementById('category-filters');
  container.innerHTML = '';
  for (const cat of ['ham', 'weather', 'starlink', 'cosmos', 'flock', 'other']) {
    if (!counts[cat]) continue;
    const label = document.createElement('label');
    label.className = 'cat-row';
    label.innerHTML = `<input type="checkbox" checked><span class="cat-dot" style="background:${CATEGORY_COLORS[cat]}"></span>${CATEGORY_LABELS[cat]} <span class="cat-count">(${counts[cat]})</span>`;
    label.querySelector('input').addEventListener('change', e => {
      if (e.target.checked) hiddenCategories.delete(cat);
      else hiddenCategories.add(cat);
      renderSatellites(); renderLabels(); updateTrails(); renderSatList();
    });
    container.appendChild(label);
  }
}

// Controls
document.getElementById('labels-toggle').addEventListener('change', (e) => {
  labelsVisible = e.target.checked;
  labelLayer.attr('display', labelsVisible ? null : 'none');
  if (labelsVisible) renderLabels();
  else labelLayer.selectAll('text').remove();
});

document.getElementById('time-rotation').addEventListener('change', (e) => {
  timeRotationEnabled = e.target.checked;
  if (timeRotationEnabled) {
    const tick = () => {
      const now = new Date();
      const utcHours = now.getUTCHours() + now.getUTCMinutes() / 60 + now.getUTCSeconds() / 3600;
      const [, lat] = projection.rotate();
      projection.rotate([(utcHours - 12) * 15, lat]);
      render();
    };
    tick();
    timeRotationInterval = setInterval(tick, 1000);
  } else {
    clearInterval(timeRotationInterval);
  }
});

document.getElementById('center-btn').addEventListener('click', () => {
  projection.scale(radius).translate([cx0, cy0]);
  svg.select('circle.sphere').attr('r', radius).attr('cx', cx0).attr('cy', cy0);
  render();
});

document.getElementById('trails-toggle').addEventListener('change', (e) => {
  trailsVisible = e.target.checked;
  trailLayer.attr('display', trailsVisible ? null : 'none');
  document.getElementById('trail-length-row').classList.toggle('visible', trailsVisible);
  if (trailsVisible) recomputeTrails();
});

document.getElementById('trail-length').addEventListener('input', (e) => {
  trailMinutes = +e.target.value;
  document.getElementById('trail-length-value').textContent = `${trailMinutes} min`;
  recomputeTrails();
});

document.getElementById('show-selected').addEventListener('change', (e) => {
  showSelectedOnly = e.target.checked;
  renderSatellites(); renderLabels(); updateTrails();
});

// Drawer (mobile)
const sidebar = document.getElementById('sidebar');
const mobileControls = document.getElementById('mobile-controls');
function setDrawer(open) {
  sidebar.classList.toggle('open', open);
  if (mobileControls) mobileControls.classList.toggle('drawer-open', open);
}
document.getElementById('drawer-btn').addEventListener('click', () => setDrawer(!sidebar.classList.contains('open')));
document.getElementById('drawer-handle').addEventListener('click', () => setDrawer(false));

// Mobile control buttons
function holdButton(el, fn) {
  let iv = null;
  const start = (e) => { e.preventDefault(); fn(); iv = setInterval(fn, 80); };
  const stop = () => { clearInterval(iv); iv = null; };
  el.addEventListener('pointerdown', start);
  el.addEventListener('pointerup', stop);
  el.addEventListener('pointercancel', stop);
  el.addEventListener('pointerleave', stop);
}

holdButton(document.getElementById('rot-up'),    () => { const [r0,r1]=projection.rotate(); projection.rotate([r0,r1-3]); render(); });
holdButton(document.getElementById('rot-down'),  () => { const [r0,r1]=projection.rotate(); projection.rotate([r0,r1+3]); render(); });
holdButton(document.getElementById('rot-left'),  () => { const [r0,r1]=projection.rotate(); projection.rotate([r0-3,r1]); render(); });
holdButton(document.getElementById('rot-right'), () => { const [r0,r1]=projection.rotate(); projection.rotate([r0+3,r1]); render(); });

holdButton(document.getElementById('pan-up'),    () => { const [tx,ty]=projection.translate(); projection.translate([tx,ty-10]); syncSphereCircles(); render(); });
holdButton(document.getElementById('pan-down'),  () => { const [tx,ty]=projection.translate(); projection.translate([tx,ty+10]); syncSphereCircles(); render(); });
holdButton(document.getElementById('pan-left'),  () => { const [tx,ty]=projection.translate(); projection.translate([tx-10,ty]); syncSphereCircles(); render(); });
holdButton(document.getElementById('pan-right'), () => { const [tx,ty]=projection.translate(); projection.translate([tx+10,ty]); syncSphereCircles(); render(); });

holdButton(document.getElementById('zoom-in-btn'),  () => {
  const s = projection.scale();
  const ns = Math.min(Math.min(width,height)*4, s*1.08);
  const [tx,ty]=projection.translate(); const f=ns/s;
  projection.scale(ns).translate([cx0+(tx-cx0)*f, cy0+(ty-cy0)*f]);
  syncSphereCircles(); render();
});
holdButton(document.getElementById('zoom-out-btn'), () => {
  const s = projection.scale();
  const ns = Math.max(50, s/1.08);
  const [tx,ty]=projection.translate(); const f=ns/s;
  projection.scale(ns).translate([cx0+(tx-cx0)*f, cy0+(ty-cy0)*f]);
  syncSphereCircles(); render();
});

document.getElementById('center-mobile-btn').addEventListener('click', () => {
  projection.scale(radius).translate([cx0, cy0]);
  svg.select('circle.sphere').attr('r', radius).attr('cx', cx0).attr('cy', cy0);
  render();
});

fetch('data/visual.txt')
  .then(r => r.text())
  .then(text => {
    tleData = parseTLEs(text);
    buildCategoryFilters();
    renderSatList();
    updateSatellites();
    setInterval(updateSatellites, 5000);
  })
  .catch(err => console.error('Failed to load TLE data:', err));
