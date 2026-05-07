const width = Math.min(window.innerWidth, window.innerHeight) * 0.9;
const height = width;
const sensitivity = 75;
const EARTH_RADIUS_KM = 6371;

const projection = d3.geoOrthographic()
  .scale(width / 2 - 10)
  .center([0, 0])
  .rotate([0, -30])
  .translate([width / 2, height / 2]);

const path = d3.geoPath().projection(projection);

const svg = d3.select('#globe')
  .attr('width', width)
  .attr('height', height);

svg.append('circle')
  .attr('class', 'sphere')
  .attr('cx', width / 2)
  .attr('cy', height / 2)
  .attr('r', projection.scale());

svg.append('path')
  .datum({ type: 'Sphere' })
  .attr('class', 'sphere')
  .attr('d', path);

svg.append('path')
  .datum(d3.geoGraticule()())
  .attr('class', 'graticule')
  .attr('d', path);

const landGroup = svg.append('g');
const borderGroup = svg.append('g');
const trailLayer = svg.append('g').attr('display', 'none');
const satLayer = svg.append('g');

fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json')
  .then(r => r.json())
  .then(world => {
    landGroup.selectAll('path')
      .data(topojson.feature(world, world.objects.countries).features)
      .join('path')
      .attr('class', 'land')
      .attr('d', path);

    borderGroup.append('path')
      .datum(topojson.mesh(world, world.objects.countries, (a, b) => a !== b))
      .attr('class', 'border')
      .attr('d', path);
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
  const cx = width / 2, cy = height / 2;
  const factor = (EARTH_RADIUS_KM + altKm) / EARTH_RADIUS_KM;
  return [cx + (sx - cx) * factor, cy + (sy - cy) * factor];
}

function renderTrails() {
  trailLayer.selectAll('path.trail').attr('d', path);
}

function renderSatellites() {
  const visible = currentSats.filter(s => isVisible(s.lon, s.lat));
  satLayer.selectAll('circle.sat')
    .data(visible, d => d.name)
    .join('circle')
    .attr('class', 'sat')
    .attr('r', 2)
    .attr('cx', d => elevatedXY(d.lon, d.lat, d.alt)[0])
    .attr('cy', d => elevatedXY(d.lon, d.lat, d.alt)[1]);
}

function render() {
  svg.selectAll('path').attr('d', path);
  renderTrails();
  renderSatellites();
}

// Drag to rotate
const drag = d3.drag()
  .on('drag', (event) => {
    const rotate = projection.rotate();
    const k = sensitivity / projection.scale();
    projection.rotate([
      rotate[0] + event.dx * k,
      rotate[1] - event.dy * k,
    ]);
    render();
  });

svg.call(drag);

// Scroll to zoom
svg.on('wheel', (event) => {
  event.preventDefault();
  const scale = projection.scale();
  const newScale = Math.max(50, Math.min(width, scale - event.deltaY * 0.5));
  projection.scale(newScale);
  svg.select('circle.sphere').attr('r', newScale);
  render();
});

// Satellites
let tleData = [];
let currentSats = [];

function parseTLEs(text) {
  const lines = text.trim().split('\n').map(l => l.trim()).filter(Boolean);
  const sats = [];
  let i = 0;
  while (i < lines.length) {
    const l0 = lines[i], l1 = lines[i + 1], l2 = lines[i + 2];
    if (l0 && l1 && l2 && !l0.startsWith('1 ') && !l0.startsWith('2 ') && l1.startsWith('1 ') && l2.startsWith('2 ')) {
      // 3-line format: name, line1, line2
      try { sats.push({ name: l0, satrec: satellite.twoline2satrec(l1, l2) }); } catch (_) {}
      i += 3;
    } else if (l0 && l1 && l0.startsWith('1 ') && l1.startsWith('2 ')) {
      // 2-line format: line1, line2 (use catalog number as name)
      try { sats.push({ name: l0.substring(2, 7).trim(), satrec: satellite.twoline2satrec(l0, l1) }); } catch (_) {}
      i += 2;
    } else {
      i++;
    }
  }
  return sats;
}

function computeTrail(satrec) {
  const now = new Date();
  const periodMin = (2 * Math.PI) / satrec.no;
  if (!isFinite(periodMin) || periodMin < 1 || periodMin > 1440) return null;
  const coords = [];
  let segment = [];

  for (let t = 0; t <= periodMin; t += 1) {
    const date = new Date(now.getTime() + t * 60000);
    try {
      const { position } = satellite.propagate(satrec, date);
      if (!position || typeof position === 'boolean') continue;
      const geo = satellite.eciToGeodetic(position, satellite.gstime(date));
      const lon = satellite.degreesLong(geo.longitude);
      const lat = satellite.degreesLat(geo.latitude);
      if (segment.length && Math.abs(lon - segment[segment.length - 1][0]) > 180) {
        coords.push(segment);
        segment = [];
      }
      segment.push([lon, lat]);
    } catch (_) {}
  }
  if (segment.length) coords.push(segment);

  return { type: 'Feature', geometry: { type: 'MultiLineString', coordinates: coords } };
}

function propagate(date) {
  const gmst = satellite.gstime(date);
  const result = [];
  for (const { name, satrec } of tleData) {
    try {
      const { position } = satellite.propagate(satrec, date);
      if (!position || typeof position === 'boolean') continue;
      const geo = satellite.eciToGeodetic(position, gmst);
      result.push({
        name,
        lon: satellite.degreesLong(geo.longitude),
        lat: satellite.degreesLat(geo.latitude),
        alt: geo.height,
      });
    } catch (_) {}
  }
  return result;
}

function updateSatellites() {
  currentSats = propagate(new Date());
  renderSatellites();
}

document.getElementById('trails-toggle').addEventListener('change', (e) => {
  trailLayer.attr('display', e.target.checked ? null : 'none');
});

fetch('data/visual.txt')
  .then(r => r.text())
  .then(text => {
    tleData = parseTLEs(text);

    const trails = tleData.map(({ satrec }) => computeTrail(satrec)).filter(Boolean);
    trailLayer.selectAll('path.trail')
      .data(trails)
      .join('path')
      .attr('class', 'trail')
      .attr('d', path);

    updateSatellites();
    setInterval(updateSatellites, 5000);
  })
  .catch(err => console.error('Failed to load TLE data:', err));
