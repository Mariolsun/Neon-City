const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

const CELL_SIZE = 32;
const GRID_WIDTH = 36;
const GRID_HEIGHT = 22;
const OFFSET_X = Math.floor((canvas.width - GRID_WIDTH * CELL_SIZE) / 2);
const OFFSET_Y = Math.floor((canvas.height - GRID_HEIGHT * CELL_SIZE) / 2);

const rand = (min, max) => Math.random() * (max - min) + min;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const TAU = Math.PI * 2;

function normalizeAngle(angle) {
  let normalized = angle;
  while (normalized > Math.PI) normalized -= TAU;
  while (normalized < -Math.PI) normalized += TAU;
  return normalized;
}

class GameObject {
  constructor({ id, coord, size, type, meta = {} }) {
    this.id = id;
    this.coord = coord; // bottom-left cell
    this.size = size;
    this.type = type;
    this.meta = meta;
  }

  containsCell(x, y) {
    return (
      x >= this.coord.x &&
      x < this.coord.x + this.size.w &&
      y >= this.coord.y &&
      y < this.coord.y + this.size.h
    );
  }

  center() {
    return {
      x: this.coord.x + this.size.w / 2,
      y: this.coord.y + this.size.h / 2,
    };
  }
}

class ObjectRegistry {
  constructor() {
    this.factories = new Map();
  }

  register(type, factory) {
    this.factories.set(type, factory);
  }

  create(data) {
    const factory = this.factories.get(data.type);
    if (!factory) {
      throw new Error(`Unknown game object type: ${data.type}`);
    }
    return factory(data);
  }
}

const registry = new ObjectRegistry();
registry.register('road', (data) => new GameObject(data));
registry.register('building', (data) => new GameObject(data));

const levelBlueprint = {
  roads: [
    { id: 'r-loop-bottom', coord: { x: 4, y: 4 }, size: { w: 28, h: 2 }, type: 'road', meta: { orientation: 'h' } },
    { id: 'r-loop-top', coord: { x: 4, y: 16 }, size: { w: 28, h: 2 }, type: 'road', meta: { orientation: 'h' } },
    { id: 'r-loop-left', coord: { x: 4, y: 6 }, size: { w: 2, h: 10 }, type: 'road', meta: { orientation: 'v' } },
    { id: 'r-loop-right', coord: { x: 30, y: 6 }, size: { w: 2, h: 10 }, type: 'road', meta: { orientation: 'v' } },
    { id: 'r-mid-horizontal', coord: { x: 8, y: 10 }, size: { w: 20, h: 2 }, type: 'road', meta: { orientation: 'h' } },
    { id: 'r-mid-vertical-west', coord: { x: 12, y: 6 }, size: { w: 2, h: 10 }, type: 'road', meta: { orientation: 'v' } },
    { id: 'r-mid-vertical-east', coord: { x: 22, y: 6 }, size: { w: 2, h: 10 }, type: 'road', meta: { orientation: 'v' } },
  ],
  buildings: [
    { id: 'b-hub', coord: { x: 14, y: 12 }, size: { w: 4, h: 4 }, type: 'building', meta: { style: 'hub', neon: '#1de9ff' } },
    { id: 'b-reactor', coord: { x: 18, y: 12 }, size: { w: 4, h: 4 }, type: 'building', meta: { style: 'reactor', neon: '#9cff57' } },
    { id: 'b-tower-west', coord: { x: 6, y: 7 }, size: { w: 3, h: 3 }, type: 'building', meta: { style: 'tower', neon: '#ff43b4' } },
    { id: 'b-tower-east', coord: { x: 27, y: 7 }, size: { w: 3, h: 3 }, type: 'building', meta: { style: 'tower', neon: '#7c7bff' } },
    { id: 'b-plant-south', coord: { x: 14, y: 6 }, size: { w: 3, h: 3 }, type: 'building', meta: { style: 'plant', neon: '#ffa35c' } },
    { id: 'b-plant-north', coord: { x: 19, y: 6 }, size: { w: 3, h: 3 }, type: 'building', meta: { style: 'plant', neon: '#4ce2ff' } },
  ],
};

const gameObjects = [...levelBlueprint.roads, ...levelBlueprint.buildings].map((item) => registry.create(item));
const roads = gameObjects.filter((obj) => obj.type === 'road');
const buildings = gameObjects.filter((obj) => obj.type === 'building');

const roadCells = new Set();
for (const road of roads) {
  for (let x = road.coord.x; x < road.coord.x + road.size.w; x += 1) {
    for (let y = road.coord.y; y < road.coord.y + road.size.h; y += 1) {
      roadCells.add(`${x},${y}`);
    }
  }
}

const buildingCells = new Set();
for (const building of buildings) {
  for (let x = building.coord.x; x < building.coord.x + building.size.w; x += 1) {
    for (let y = building.coord.y; y < building.coord.y + building.size.h; y += 1) {
      buildingCells.add(`${x},${y}`);
    }
  }
}

const overlappingCells = [];
for (const roadCell of roadCells) {
  if (buildingCells.has(roadCell)) overlappingCells.push(roadCell);
}

if (overlappingCells.length > 0) {
  throw new Error(`Invalid level: road/building overlap at ${overlappingCells.join(' | ')}`);
}

const roadGraph = new Map();
for (const key of roadCells) {
  const [x, y] = key.split(',').map(Number);
  const neighbors = [
    { x: x + 1, y },
    { x: x - 1, y },
    { x, y: y + 1 },
    { x, y: y - 1 },
  ].filter((n) => roadCells.has(`${n.x},${n.y}`));
  roadGraph.set(key, neighbors);
}

const entrances = buildings.map((building) => {
  const options = [];
  for (let x = building.coord.x - 1; x <= building.coord.x + building.size.w; x += 1) {
    const south = `${x},${building.coord.y - 1}`;
    const north = `${x},${building.coord.y + building.size.h}`;
    if (roadCells.has(south)) options.push({ buildingId: building.id, x, y: building.coord.y - 1 });
    if (roadCells.has(north)) options.push({ buildingId: building.id, x, y: building.coord.y + building.size.h });
  }
  for (let y = building.coord.y; y < building.coord.y + building.size.h; y += 1) {
    const west = `${building.coord.x - 1},${y}`;
    const east = `${building.coord.x + building.size.w},${y}`;
    if (roadCells.has(west)) options.push({ buildingId: building.id, x: building.coord.x - 1, y });
    if (roadCells.has(east)) options.push({ buildingId: building.id, x: building.coord.x + building.size.w, y });
  }
  return { building, options };
}).filter((entry) => entry.options.length > 0);

for (const key of roadCells) {
  const [x, y] = key.split(',').map(Number);
  const degree = roadGraph.get(key)?.length ?? 0;
  if (degree !== 1) continue;

  const touchesBuilding = [
    `${x + 1},${y}`,
    `${x - 1},${y}`,
    `${x},${y + 1}`,
    `${x},${y - 1}`,
  ].some((adjacent) => buildingCells.has(adjacent));

  if (!touchesBuilding) {
    throw new Error(`Invalid level: dead-end road at ${key} is not connected to a building`);
  }
}

function bfsPath(start, goal) {
  const startKey = `${start.x},${start.y}`;
  const goalKey = `${goal.x},${goal.y}`;
  if (!roadGraph.has(startKey) || !roadGraph.has(goalKey)) return null;

  const queue = [startKey];
  const visited = new Set([startKey]);
  const parent = new Map();

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === goalKey) break;
    const neighbors = roadGraph.get(current) || [];
    for (const next of neighbors) {
      const nextKey = `${next.x},${next.y}`;
      if (!visited.has(nextKey)) {
        visited.add(nextKey);
        parent.set(nextKey, current);
        queue.push(nextKey);
      }
    }
  }

  if (!visited.has(goalKey)) return null;

  const path = [];
  let currentKey = goalKey;
  while (currentKey) {
    const [x, y] = currentKey.split(',').map(Number);
    path.push({ x, y });
    currentKey = parent.get(currentKey);
  }
  return path.reverse();
}

function cellCenter(cell) {
  return {
    x: OFFSET_X + (cell.x + 0.5) * CELL_SIZE,
    y: canvas.height - OFFSET_Y - (cell.y + 0.5) * CELL_SIZE,
  };
}

function blend(hex, alpha) {
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const vehicleTypes = [
  { kind: 'hover', body: '#68d5ff', glow: '#1de9ff', tail: '#1de9ff', speed: 2.4 },
  { kind: 'cargo', body: '#f7a9ff', glow: '#ff43b4', tail: '#ff43b4', speed: 2.0 },
  { kind: 'pulse', body: '#d2ff9b', glow: '#9cff57', tail: '#9cff57', speed: 2.8 },
  { kind: 'taxi', body: '#ffc67d', glow: '#ff9c3d', tail: '#ffb970', speed: 2.2 },
];

class Vehicle {
  constructor(id, startCell) {
    this.id = id;
    this.type = pick(vehicleTypes);
    this.cell = { ...startCell };
    this.position = cellCenter(startCell);
    this.path = [];
    this.progress = 0;
    this.stopTimer = rand(0.2, 2.2);
    this.stopType = 'traffic';
    this.tail = [];
    this.radius = 8;
    this.heading = 0;
    this.targetHeading = 0;
  }

  assignRoute(cells) {
    this.path = cells;
    this.progress = 0;
  }

  update(dt, occupiedCells) {
    if (this.stopTimer > 0) {
      this.stopTimer -= dt;
      this.fadeTail(dt);
      return;
    }

    if (!this.path.length) {
      this.pickNewRoute();
      return;
    }

    const nextCell = this.path[0];
    const nextKey = `${nextCell.x},${nextCell.y}`;
    const myKey = `${this.cell.x},${this.cell.y}`;

    if (occupiedCells.has(nextKey) && nextKey !== myKey) {
      this.stopTimer = rand(0.2, 0.5);
      this.stopType = 'traffic';
      this.fadeTail(dt);
      return;
    }

    this.progress += dt * this.type.speed;
    const from = cellCenter(this.cell);
    const to = cellCenter(nextCell);
    this.targetHeading = Math.atan2(to.y - from.y, to.x - from.x);
    const headingDelta = normalizeAngle(this.targetHeading - this.heading);
    const turnRate = 10;
    this.heading += headingDelta * Math.min(1, dt * turnRate);
    const t = Math.min(this.progress, 1);
    this.position.x = from.x + (to.x - from.x) * t;
    this.position.y = from.y + (to.y - from.y) * t;

    this.tail.push({ x: this.position.x, y: this.position.y, life: 0.65 });
    if (this.tail.length > 24) this.tail.shift();

    if (this.progress >= 1) {
      this.cell = nextCell;
      this.path.shift();
      this.progress = 0;

      const entry = entrances.find((item) => item.options.some((option) => option.x === this.cell.x && option.y === this.cell.y));
      if (entry && Math.random() < 0.24) {
        this.stopTimer = rand(1.4, 3.1);
        this.stopType = 'building';
      } else if (Math.random() < 0.1) {
        this.stopTimer = rand(0.5, 1.6);
        this.stopType = 'traffic';
      }
    }

    this.fadeTail(dt);
  }

  fadeTail(dt) {
    for (const piece of this.tail) piece.life -= dt;
    this.tail = this.tail.filter((piece) => piece.life > 0);
  }

  pickNewRoute() {
    const start = this.cell;
    let target;

    if (Math.random() < 0.6) {
      const building = pick(entrances);
      target = pick(building.options);
    } else {
      const keys = [...roadCells];
      const [x, y] = pick(keys).split(',').map(Number);
      target = { x, y };
    }

    const path = bfsPath(start, target);
    if (path && path.length > 1) {
      this.assignRoute(path.slice(1));
    }
  }

  draw(ctx) {
    for (const piece of this.tail) {
      ctx.beginPath();
      ctx.fillStyle = blend(this.type.tail, piece.life * 0.55);
      ctx.arc(piece.x, piece.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.shadowColor = blend(this.type.glow, 0.9);
    ctx.shadowBlur = 14;
    ctx.fillStyle = this.type.body;
    ctx.save();
    ctx.translate(this.position.x, this.position.y);
    ctx.rotate(this.heading);
    ctx.beginPath();
    ctx.roundRect(-9, -5, 18, 10, 4);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = blend('#ffffff', 0.5);
    ctx.fillRect(2, -2, 5, 2);
    ctx.restore();
  }
}

const seedCells = Array.from(roadCells)
  .slice(0, 10)
  .map((key) => {
    const [x, y] = key.split(',').map(Number);
    return { x, y };
  });

const vehicles = Array.from({ length: 10 }, (_, i) => new Vehicle(i + 1, seedCells[i % seedCells.length]));

for (const vehicle of vehicles) vehicle.pickNewRoute();

function drawGrid() {
  ctx.strokeStyle = 'rgba(62, 123, 178, 0.18)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= GRID_WIDTH; x += 1) {
    const px = OFFSET_X + x * CELL_SIZE;
    ctx.beginPath();
    ctx.moveTo(px, OFFSET_Y);
    ctx.lineTo(px, canvas.height - OFFSET_Y);
    ctx.stroke();
  }
  for (let y = 0; y <= GRID_HEIGHT; y += 1) {
    const py = canvas.height - OFFSET_Y - y * CELL_SIZE;
    ctx.beginPath();
    ctx.moveTo(OFFSET_X, py);
    ctx.lineTo(canvas.width - OFFSET_X, py);
    ctx.stroke();
  }
}

function drawRoad(road) {
  const x = OFFSET_X + road.coord.x * CELL_SIZE;
  const y = canvas.height - OFFSET_Y - (road.coord.y + road.size.h) * CELL_SIZE;
  const w = road.size.w * CELL_SIZE;
  const h = road.size.h * CELL_SIZE;

  ctx.fillStyle = '#0d1128';
  ctx.fillRect(x, y, w, h);

  ctx.strokeStyle = 'rgba(30, 253, 255, 0.14)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

  ctx.strokeStyle = 'rgba(130, 155, 255, 0.26)';
  ctx.setLineDash([10, 8]);
  ctx.beginPath();
  if (road.meta.orientation === 'h') {
    ctx.moveTo(x + 6, y + h / 2);
    ctx.lineTo(x + w - 6, y + h / 2);
  } else {
    ctx.moveTo(x + w / 2, y + 6);
    ctx.lineTo(x + w / 2, y + h - 6);
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawBuilding(building) {
  const x = OFFSET_X + building.coord.x * CELL_SIZE;
  const y = canvas.height - OFFSET_Y - (building.coord.y + building.size.h) * CELL_SIZE;
  const w = building.size.w * CELL_SIZE;
  const h = building.size.h * CELL_SIZE;

  const neon = building.meta.neon;
  const gradient = ctx.createLinearGradient(x, y, x + w, y + h);
  gradient.addColorStop(0, 'rgba(24, 30, 66, 0.95)');
  gradient.addColorStop(1, 'rgba(11, 17, 42, 0.95)');

  ctx.fillStyle = gradient;
  ctx.fillRect(x, y, w, h);

  ctx.strokeStyle = blend(neon, 0.65);
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);

  ctx.fillStyle = blend(neon, 0.18);
  for (let i = 0; i < building.size.w; i += 1) {
    for (let j = 0; j < building.size.h; j += 1) {
      if ((i + j) % 2 === 0) {
        const wx = x + i * CELL_SIZE + 8;
        const wy = y + j * CELL_SIZE + 10;
        ctx.fillRect(wx, wy, 12, 8);
      }
    }
  }

  if (building.meta.style === 'reactor') {
    ctx.beginPath();
    ctx.strokeStyle = blend(neon, 0.8);
    ctx.lineWidth = 2;
    ctx.arc(x + w / 2, y + h / 2, Math.min(w, h) * 0.2, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.shadowColor = blend(neon, 0.6);
  ctx.shadowBlur = 16;
  ctx.fillStyle = blend(neon, 0.35);
  ctx.fillRect(x + 6, y + h - 6, w - 12, 2);
  ctx.shadowBlur = 0;
}

let lastTs = performance.now();
function frame(ts) {
  const dt = Math.min((ts - lastTs) / 1000, 0.05);
  lastTs = ts;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const bg = ctx.createLinearGradient(0, 0, 0, canvas.height);
  bg.addColorStop(0, '#080b1d');
  bg.addColorStop(1, '#040511');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawGrid();
  roads.forEach(drawRoad);
  buildings.forEach(drawBuilding);

  const occupiedCells = new Set(vehicles.map((v) => `${v.cell.x},${v.cell.y}`));
  for (const vehicle of vehicles) vehicle.update(dt, occupiedCells);
  for (const vehicle of vehicles) vehicle.draw(ctx);

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
