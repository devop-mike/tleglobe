const width = Math.min(window.innerWidth, window.innerHeight) * 0.9;
const height = width;
const sensitivity = 75;

const projection = d3.geoOrthographic()
  .scale(width / 2 - 10)
  .center([0, 0])
  .rotate([0, -30])
  .translate([width / 2, height / 2]);

const path = d3.geoPath().projection(projection);
const satPath = d3.geoPath().projection(projection).pointRadius(2);

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

function render() {
  svg.selectAll('path:not(.sat)').attr('d', path);
  satLayer.selectAll('path.sat').attr('d', satPath);
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
  satPath.pointRadius(Math.max(1, newScale / (width / 2) * 2));
  render();
});

// Satellites
let satData = [];

function parseTLEs(text) {
  const lines = text.trim().split('\n').map(l => l.trim()).filter(Boolean);
  const sats = [];
  for (let i = 0; i + 2 < lines.length; i += 3) {
    try {
      sats.push({
        name: lines[i],
        satrec: satellite.twoline2satrec(lines[i + 1], lines[i + 2]),
      });
    } catch (_) {}
  }
  return sats;
}

function getSatFeatures(date) {
  const gmst = satellite.gstime(date);
  const features = [];
  for (const { name, satrec } of satData) {
    try {
      const { position } = satellite.propagate(satrec, date);
      if (!position || typeof position === 'boolean') continue;
      const geo = satellite.eciToGeodetic(position, gmst);
      features.push({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [satellite.degreesLong(geo.longitude), satellite.degreesLat(geo.latitude)],
        },
        properties: { name },
      });
    } catch (_) {}
  }
  return features;
}

function updateSatellites() {
  const features = getSatFeatures(new Date());
  satLayer.selectAll('path.sat')
    .data(features)
    .join('path')
    .attr('class', 'sat')
    .attr('d', satPath);
}

fetch('data/visual.txt')
  .then(r => r.text())
  .then(text => {
    satData = parseTLEs(text);
    updateSatellites();
    setInterval(updateSatellites, 5000);
  })
  .catch(err => console.error('Failed to load TLE data:', err));
