const width = Math.min(window.innerWidth, window.innerHeight) * 0.9;
const height = width;
const sensitivity = 75;

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

// Drag to rotate
const drag = d3.drag()
  .on('drag', (event) => {
    const rotate = projection.rotate();
    const k = sensitivity / projection.scale();
    projection.rotate([
      rotate[0] + event.dx * k,
      rotate[1] - event.dy * k,
    ]);
    svg.selectAll('path').attr('d', path);
  });

svg.call(drag);

// Scroll to zoom
svg.on('wheel', (event) => {
  event.preventDefault();
  const scale = projection.scale();
  const newScale = Math.max(50, Math.min(width, scale - event.deltaY * 0.5));
  projection.scale(newScale);
  svg.select('circle.sphere').attr('r', newScale);
  svg.selectAll('path').attr('d', path);
});
