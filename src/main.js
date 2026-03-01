const canvas = document.getElementById('game-canvas');
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error('Missing required #game-canvas element');
}

const ctx = canvas.getContext('2d');
if (!ctx) {
  throw new Error('Unable to acquire 2D canvas context');
}

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
registry.register('crossroad', (data) => new GameObject(data));

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
  crossroads: [],
};

const gameObjects = [...levelBlueprint.roads, ...levelBlueprint.buildings, ...levelBlueprint.crossroads]
  .map((item) => registry.create(item));
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

function roadContainsCell(road, cell) {
  return (
    cell.x >= road.coord.x
    && cell.x < road.coord.x + road.size.w
    && cell.y >= road.coord.y
    && cell.y < road.coord.y + road.size.h
  );
}

const laneDirections = new Map();
for (const key of roadCells) {
  const [x, y] = key.split(',').map(Number);
  const cell = { x, y };
  const horizontalRoads = roads.filter((road) => road.meta.orientation === 'h' && roadContainsCell(road, cell));
  const verticalRoads = roads.filter((road) => road.meta.orientation === 'v' && roadContainsCell(road, cell));

  if (horizontalRoads.length > 0 && verticalRoads.length > 0) {
    laneDirections.set(key, null);
    continue;
  }

  if (horizontalRoads.length > 0) {
    const road = horizontalRoads[0];
    const isNorthLane = y === road.coord.y + road.size.h - 1;
    laneDirections.set(key, isNorthLane ? { dx: 1, dy: 0 } : { dx: -1, dy: 0 });
    continue;
  }

  if (verticalRoads.length > 0) {
    const road = verticalRoads[0];
    const isWestLane = x === road.coord.x;
    laneDirections.set(key, isWestLane ? { dx: 0, dy: 1 } : { dx: 0, dy: -1 });
    continue;
  }

  laneDirections.set(key, null);
}

function directionFromStep(dx, dy) {
  if (dx === 1 && dy === 0) return 'E';
  if (dx === -1 && dy === 0) return 'W';
  if (dx === 0 && dy === 1) return 'N';
  if (dx === 0 && dy === -1) return 'S';
  return null;
}

function oppositeDirection(direction) {
  if (direction === 'E') return 'W';
  if (direction === 'W') return 'E';
  if (direction === 'N') return 'S';
  if (direction === 'S') return 'N';
  return null;
}

function classifyCrossroad(openings) {
  const sorted = [...openings].sort();
  const signature = sorted.join('');
  const count = sorted.length;
  if (count === 4) return { kind: '4-way', variant: 'cross' };
  if (count === 3) return { kind: '3-way', variant: `tee-${signature}` };
  if (count === 2) {
    const isStraight = (sorted.includes('N') && sorted.includes('S')) || (sorted.includes('E') && sorted.includes('W'));
    if (isStraight) return null;
    return { kind: '2-way', variant: `corner-${signature}` };
  }
  return null;
}

const generatedCrossroads = [...roadGraph.entries()].flatMap(([key, neighbors]) => {
  if (neighbors.length < 2 || neighbors.length > 4) return [];
  const [x, y] = key.split(',').map(Number);
  const openings = neighbors
    .map((neighbor) => directionFromStep(neighbor.x - x, neighbor.y - y))
    .filter(Boolean);
  const profile = classifyCrossroad(openings);
  if (!profile) return [];

  return [registry.create({
    id: `x-${x}-${y}`,
    type: 'crossroad',
    coord: { x, y },
    size: { w: 1, h: 1 },
    meta: {
      kind: profile.kind,
      variant: profile.variant,
      openings,
    },
  })];
});

const crossroads = generatedCrossroads;
const crossroadByCell = new Map(crossroads.map((crossroad) => [`${crossroad.coord.x},${crossroad.coord.y}`, crossroad]));

function canTravel(from, to) {
  const fromKey = `${from.x},${from.y}`;
  const toKey = `${to.x},${to.y}`;
  const step = { dx: to.x - from.x, dy: to.y - from.y };
  const fromLane = laneDirections.get(fromKey);
  const toLane = laneDirections.get(toKey);

  const matchesFromLane = !fromLane || (fromLane.dx === step.dx && fromLane.dy === step.dy);
  const matchesToLane = !toLane || (toLane.dx === step.dx && toLane.dy === step.dy);
  return matchesFromLane && matchesToLane;
}

function canTraverseConnection(previousCell, currentCell, nextCell) {
  const stepIn = previousCell
    ? directionFromStep(currentCell.x - previousCell.x, currentCell.y - previousCell.y)
    : null;
  const stepOut = directionFromStep(nextCell.x - currentCell.x, nextCell.y - currentCell.y);
  if (!stepOut) return false;

  const crossroad = crossroadByCell.get(`${currentCell.x},${currentCell.y}`);
  if (!crossroad) {
    if (!stepIn) return true;
    return stepIn === stepOut;
  }

  const openings = new Set(crossroad.meta.openings);
  if (!openings.has(stepOut)) return false;
  if (!stepIn) return true;

  const cameFrom = oppositeDirection(stepIn);
  if (!openings.has(cameFrom)) return false;
  const isUTurn = stepIn === oppositeDirection(stepOut);
  if (isUTurn) return false;
  return true;
}

function findRuns(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const runs = [];
  let current = [];
  for (const value of sorted) {
    if (!current.length || value === current[current.length - 1] + 1) {
      current.push(value);
      continue;
    }
    runs.push(current);
    current = [value];
  }
  if (current.length) runs.push(current);
  return runs;
}

function pickContiguousPair(run) {
  const middle = Math.floor((run.length - 2) / 2);
  return [run[middle], run[middle + 1]];
}

function buildBuildingPortal(building) {
  const sides = [];

  const southRoadXs = [];
  const northRoadXs = [];
  for (let x = building.coord.x; x < building.coord.x + building.size.w; x += 1) {
    if (roadCells.has(`${x},${building.coord.y - 1}`)) southRoadXs.push(x);
    if (roadCells.has(`${x},${building.coord.y + building.size.h}`)) northRoadXs.push(x);
  }

  const westRoadYs = [];
  const eastRoadYs = [];
  for (let y = building.coord.y; y < building.coord.y + building.size.h; y += 1) {
    if (roadCells.has(`${building.coord.x - 1},${y}`)) westRoadYs.push(y);
    if (roadCells.has(`${building.coord.x + building.size.w},${y}`)) eastRoadYs.push(y);
  }

  for (const run of findRuns(southRoadXs)) {
    if (run.length >= 2) {
      const [x0, x1] = pickContiguousPair(run);
      sides.push({
        side: 'south',
        roadCells: [{ x: x0, y: building.coord.y - 1 }, { x: x1, y: building.coord.y - 1 }],
      });
    }
  }
  for (const run of findRuns(northRoadXs)) {
    if (run.length >= 2) {
      const [x0, x1] = pickContiguousPair(run);
      sides.push({
        side: 'north',
        roadCells: [{ x: x0, y: building.coord.y + building.size.h }, { x: x1, y: building.coord.y + building.size.h }],
      });
    }
  }
  for (const run of findRuns(westRoadYs)) {
    if (run.length >= 2) {
      const [y0, y1] = pickContiguousPair(run);
      sides.push({
        side: 'west',
        roadCells: [{ x: building.coord.x - 1, y: y0 }, { x: building.coord.x - 1, y: y1 }],
      });
    }
  }
  for (const run of findRuns(eastRoadYs)) {
    if (run.length >= 2) {
      const [y0, y1] = pickContiguousPair(run);
      sides.push({
        side: 'east',
        roadCells: [{ x: building.coord.x + building.size.w, y: y0 }, { x: building.coord.x + building.size.w, y: y1 }],
      });
    }
  }

  if (!sides.length) return null;

  const preferredOrder = ['south', 'north', 'west', 'east'];
  const selected = sides.sort(
    (a, b) => preferredOrder.indexOf(a.side) - preferredOrder.indexOf(b.side),
  )[0];

  return {
    buildingId: building.id,
    side: selected.side,
    roadCells: selected.roadCells,
  };
}

const buildingPortals = buildings.map((building) => {
  const portal = buildBuildingPortal(building);
  if (!portal) {
    throw new Error(`Invalid level: building ${building.id} has no 2-cell road-connected portal`);
  }
  for (const roadCell of portal.roadCells) {
    const key = `${roadCell.x},${roadCell.y}`;
    if (!roadCells.has(key)) {
      throw new Error(`Invalid level: portal ${building.id}@${key} is not connected to a road cell`);
    }
  }
  building.meta.portal = portal;
  return { building, portal };
});

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

function bfsPath(start, goal, previousCell = null) {
  const startKey = `${start.x},${start.y}`;
  const goalKey = `${goal.x},${goal.y}`;
  if (!roadGraph.has(startKey) || !roadGraph.has(goalKey)) return null;

  const previousKey = previousCell ? `${previousCell.x},${previousCell.y}` : 'none';
  const startState = `${startKey}|${previousKey}`;

  const queue = [{ current: startKey, previous: previousKey }];
  const visited = new Set([startState]);
  const parent = new Map();

  let goalState = null;

  while (queue.length > 0) {
    const state = queue.shift();
    if (state.current === goalKey) {
      goalState = `${state.current}|${state.previous}`;
      break;
    }

    const [cx, cy] = state.current.split(',').map(Number);
    const currentCell = { x: cx, y: cy };
    const neighbors = roadGraph.get(state.current) || [];
    for (const next of neighbors) {
      const nextKey = `${next.x},${next.y}`;
      if (!canTravel(currentCell, next)) continue;
      const previousCell = state.previous === 'none'
        ? null
        : (() => {
          const [px, py] = state.previous.split(',').map(Number);
          return { x: px, y: py };
        })();
      if (!canTraverseConnection(previousCell, currentCell, next)) continue;

      const nextState = `${nextKey}|${state.current}`;
      if (visited.has(nextState)) continue;

      visited.add(nextState);
      parent.set(nextState, `${state.current}|${state.previous}`);
      queue.push({ current: nextKey, previous: state.current });
    }
  }

  if (!goalState) return null;

  const path = [];
  let currentState = goalState;
  while (currentState) {
    const [currentKey] = currentState.split('|');
    const [x, y] = currentKey.split(',').map(Number);
    path.push({ x, y });
    currentState = parent.get(currentState);
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

function hexToRgb(hex) {
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  };
}

function mixColors(a, b, ratio, alpha) {
  const c1 = hexToRgb(a);
  const c2 = hexToRgb(b);
  const t = Math.max(0, Math.min(1, ratio));
  const r = Math.round(c1.r + (c2.r - c1.r) * t);
  const g = Math.round(c1.g + (c2.g - c1.g) * t);
  const bChannel = Math.round(c1.b + (c2.b - c1.b) * t);
  return `rgba(${r}, ${g}, ${bChannel}, ${alpha})`;
}

const roadGlowProfiles = new Map(
  roads.map((road, index) => [
    road.id,
    {
      pulsePhase: index * 0.9,
      huePhase: index * 1.7,
      pulseSpeed: 0.45 + (index % 3) * 0.1,
      hueSpeed: 0.12 + (index % 2) * 0.04,
      accentA: '#1dfdff',
      accentB: index % 2 === 0 ? '#7c7bff' : '#ff43b4',
    },
  ]),
);

const vehicleTypes = [
  { kind: 'hover', body: '#68d5ff', glow: '#1de9ff', tail: '#1de9ff', speed: 3.8 },
  { kind: 'cargo', body: '#f7a9ff', glow: '#ff43b4', tail: '#ff43b4', speed: 3.4 },
  { kind: 'pulse', body: '#d2ff9b', glow: '#9cff57', tail: '#9cff57', speed: 4.2 },
  { kind: 'taxi', body: '#ffc67d', glow: '#ff9c3d', tail: '#ffb970', speed: 3.6 },
];

const MIN_ACTIVE_VEHICLES = 2;
const MAX_ACTIVE_VEHICLES = 4;

function createTrip(originBuildingId = null) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const origin = originBuildingId
      ? buildingPortals.find((entry) => entry.building.id === originBuildingId)
      : pick(buildingPortals);
    if (!origin) continue;

    const prefersReturn = Math.random() < 0.25;
    const destinationPool = prefersReturn
      ? buildingPortals
      : buildingPortals.filter((entry) => entry.building.id !== origin.building.id);
    const destination = pick(destinationPool.length ? destinationPool : buildingPortals);
    if (!destination) continue;

    const start = pick(origin.portal.roadCells);
    const goal = pick(destination.portal.roadCells);
    const path = bfsPath(start, goal);
    if (!path || path.length <= 1) continue;

    const minDistance = origin.building.id === destination.building.id ? 7 : 3;
    if (path.length < minDistance) continue;

    return {
      originBuildingId: origin.building.id,
      originPortal: origin.portal,
      start,
      route: path.slice(1),
      destinationPortal: destination.portal,
      destinationBuildingId: destination.building.id,
    };
  }
  return null;
}

class Vehicle {
  constructor(id, trip) {
    this.id = id;
    this.type = pick(vehicleTypes);
    this.cell = { ...trip.start };
    this.position = { ...cellCenter(trip.start) };
    this.path = [...trip.route];
    this.originBuildingId = trip.originBuildingId;
    this.originPortal = trip.originPortal;
    this.destinationPortal = trip.destinationPortal;
    this.destinationBuildingId = trip.destinationBuildingId;
    this.progress = 0;
    this.tail = [];
    this.radius = 8;
    this.heading = 0;
    this.targetHeading = 0;
    this.previousCell = null;
    this.phase = 'exiting';
    this.transitionProgress = 0;
    this.transitionDuration = 0.45;
    this.despawned = false;

    this.setTransitionFromBuilding(this.originBuildingId, this.cell);
  }

  setTransitionFromBuilding(buildingId, roadCell) {
    const building = buildings.find((candidate) => candidate.id === buildingId);
    if (!building) return;
    const buildingCenter = cellCenter(building.center());
    this.transitionStart = { ...buildingCenter };
    this.transitionEnd = cellCenter(roadCell);
  }

  setTransitionToBuilding(roadCell, buildingId) {
    const building = buildings.find((candidate) => candidate.id === buildingId);
    if (!building) return;
    const buildingCenter = cellCenter(building.center());
    this.transitionStart = cellCenter(roadCell);
    this.transitionEnd = { ...buildingCenter };
  }

  update(dt) {
    if (this.phase !== 'road') {
      this.transitionProgress += dt / this.transitionDuration;
      const t = Math.min(this.transitionProgress, 1);
      const from = this.transitionStart;
      const to = this.transitionEnd;
      this.targetHeading = Math.atan2(to.y - from.y, to.x - from.x);
      const headingDelta = normalizeAngle(this.targetHeading - this.heading);
      this.heading += headingDelta * Math.min(1, dt * 10);
      this.position.x = from.x + (to.x - from.x) * t;
      this.position.y = from.y + (to.y - from.y) * t;

      this.tail.push({ x: this.position.x, y: this.position.y, life: 0.65 });
      if (this.tail.length > 24) this.tail.shift();

      if (this.transitionProgress >= 1) {
        if (this.phase === 'exiting') {
          this.phase = 'road';
        } else {
          this.despawned = true;
        }
      }
      this.fadeTail(dt);
      return;
    }

    if (!this.path.length) {
      this.phase = 'entering';
      this.transitionProgress = 0;
      this.setTransitionToBuilding(this.cell, this.destinationBuildingId);
      return;
    }

    const nextCell = this.path[0];

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
      const departedCell = this.cell;
      this.cell = nextCell;
      this.path.shift();
      this.progress = 0;
      this.previousCell = departedCell;
    }

    this.fadeTail(dt);
  }

  fadeTail(dt) {
    for (const piece of this.tail) piece.life -= dt;
    this.tail = this.tail.filter((piece) => piece.life > 0);
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

const vehicles = [];
let vehicleIdCounter = 1;
let spawnCooldown = 0;

function spawnVehicle(force = false) {
  if (vehicles.length >= MAX_ACTIVE_VEHICLES) return;
  if (!force && spawnCooldown > 0) return;

  const trip = createTrip();
  if (!trip) return;
  vehicles.push(new Vehicle(vehicleIdCounter, trip));
  vehicleIdCounter += 1;
  spawnCooldown = rand(0.4, 1.2);
}

for (let i = 0; i < MIN_ACTIVE_VEHICLES; i += 1) spawnVehicle(true);

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

function drawRoad(road, timeSeconds) {
  const x = OFFSET_X + road.coord.x * CELL_SIZE;
  const y = canvas.height - OFFSET_Y - (road.coord.y + road.size.h) * CELL_SIZE;
  const w = road.size.w * CELL_SIZE;
  const h = road.size.h * CELL_SIZE;

  ctx.fillStyle = '#0d1128';
  ctx.fillRect(x, y, w, h);

  const profile = roadGlowProfiles.get(road.id);
  const pulse = (Math.sin(timeSeconds * profile.pulseSpeed * TAU + profile.pulsePhase) + 1) * 0.5;
  const glowIntensity = 0.42 + pulse * 0.5;
  const hueMixRaw = (Math.sin(timeSeconds * profile.hueSpeed * TAU + profile.huePhase) + 1) * 0.5;
  const hueMix = Math.max(0.15, Math.pow(hueMixRaw, 2.2));

  ctx.strokeStyle = mixColors(profile.accentA, profile.accentB, hueMix, 0.14 + glowIntensity * 0.12);
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

  ctx.strokeStyle = mixColors('#829bff', profile.accentA, hueMix * 0.7, 0.2 + glowIntensity * 0.24);
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

  const portal = building.meta.portal;
  if (!portal) return;

  const first = portal.roadCells[0];
  const second = portal.roadCells[1];
  const minX = Math.min(first.x, second.x);
  const maxX = Math.max(first.x, second.x);
  const minY = Math.min(first.y, second.y);
  const maxY = Math.max(first.y, second.y);

  let markerX = x;
  let markerY = y;
  let markerW = CELL_SIZE * (maxX - minX + 1);
  let markerH = CELL_SIZE * (maxY - minY + 1);

  if (portal.side === 'west') {
    markerX = x - 2;
    markerY = y + h - (maxY - building.coord.y + 1) * CELL_SIZE;
    markerW = 4;
  } else if (portal.side === 'east') {
    markerX = x + w - 2;
    markerY = y + h - (maxY - building.coord.y + 1) * CELL_SIZE;
    markerW = 4;
  } else if (portal.side === 'south') {
    markerX = x + (minX - building.coord.x) * CELL_SIZE;
    markerY = y + h - 2;
    markerH = 4;
  } else if (portal.side === 'north') {
    markerX = x + (minX - building.coord.x) * CELL_SIZE;
    markerY = y - 2;
    markerH = 4;
  }

  ctx.fillStyle = blend(neon, 0.9);
  ctx.fillRect(markerX, markerY, markerW, markerH);
}

function drawCrossroad(crossroad) {
  const x = OFFSET_X + crossroad.coord.x * CELL_SIZE;
  const y = canvas.height - OFFSET_Y - (crossroad.coord.y + 1) * CELL_SIZE;

  const palette = {
    '4-way': '#1de9ff',
    '3-way': '#ff43b4',
    '2-way': '#9cff57',
  };

  const color = palette[crossroad.meta.kind] || '#9cb7ff';
  const centerX = x + CELL_SIZE / 2;
  const centerY = y + CELL_SIZE / 2;

  ctx.beginPath();
  ctx.fillStyle = blend(color, 0.5);
  ctx.arc(centerX, centerY, 4, 0, TAU);
  ctx.fill();

  ctx.beginPath();
  ctx.strokeStyle = blend(color, 0.8);
  ctx.lineWidth = 1.5;
  ctx.arc(centerX, centerY, 7, 0, TAU);
  ctx.stroke();
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
  const elapsed = ts / 1000;
  roads.forEach((road) => drawRoad(road, elapsed));
  crossroads.forEach(drawCrossroad);
  buildings.forEach(drawBuilding);

  spawnCooldown = Math.max(0, spawnCooldown - dt);
  if (vehicles.length < MIN_ACTIVE_VEHICLES) {
    spawnVehicle(true);
  } else if (vehicles.length < MAX_ACTIVE_VEHICLES && Math.random() < dt * 0.7) {
    spawnVehicle();
  }

  for (const vehicle of vehicles) vehicle.update(dt);
  for (let i = vehicles.length - 1; i >= 0; i -= 1) {
    if (vehicles[i].despawned) vehicles.splice(i, 1);
  }
  for (const vehicle of vehicles) vehicle.draw(ctx);

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
