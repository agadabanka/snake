// engine-ecs:../ecs/index.js
var World = class {
  constructor() {
    this.nextEntityId = 0;
    this.entities = /* @__PURE__ */ new Set();
    this.components = /* @__PURE__ */ new Map();
    this.systems = [];
    this.resources = /* @__PURE__ */ new Map();
    this.events = [];
    this.running = true;
  }
  // --- Entities ---
  createEntity() {
    const id = this.nextEntityId++;
    this.entities.add(id);
    return id;
  }
  destroyEntity(id) {
    this.entities.delete(id);
    for (const store of this.components.values()) {
      store.delete(id);
    }
  }
  // --- Components ---
  registerComponent(name) {
    if (!this.components.has(name)) {
      this.components.set(name, /* @__PURE__ */ new Map());
    }
  }
  addComponent(entityId, name, data = {}) {
    if (!this.components.has(name)) {
      this.registerComponent(name);
    }
    this.components.get(name).set(entityId, data);
    return this;
  }
  getComponent(entityId, name) {
    const store = this.components.get(name);
    return store ? store.get(entityId) : void 0;
  }
  hasComponent(entityId, name) {
    const store = this.components.get(name);
    return store ? store.has(entityId) : false;
  }
  removeComponent(entityId, name) {
    const store = this.components.get(name);
    if (store) store.delete(entityId);
  }
  // --- Queries ---
  query(...componentNames) {
    const results = [];
    for (const entityId of this.entities) {
      let match = true;
      for (const name of componentNames) {
        if (!this.hasComponent(entityId, name)) {
          match = false;
          break;
        }
      }
      if (match) results.push(entityId);
    }
    return results;
  }
  // --- Resources (global singletons) ---
  setResource(name, data) {
    this.resources.set(name, data);
  }
  getResource(name) {
    return this.resources.get(name);
  }
  // --- Events ---
  emit(type, data = {}) {
    this.events.push({ type, data });
  }
  getEvents(type) {
    return this.events.filter((e) => e.type === type);
  }
  clearEvents() {
    this.events.length = 0;
  }
  // --- Systems ---
  addSystem(name, fn, priority = 0) {
    this.systems.push({ name, fn, priority });
    this.systems.sort((a, b) => a.priority - b.priority);
  }
  tick(dt) {
    for (const system of this.systems) {
      system.fn(this, dt);
    }
    this.clearEvents();
  }
};

// engine:@engine/core
function defineGame(config) {
  const components = {};
  const entities = [];
  const resources = {};
  const systems = [];
  const builder = {
    /** Register a component type with default values. */
    component(name, defaults = {}) {
      components[name] = defaults;
      return builder;
    },
    /** Spawn an entity with the given components. */
    spawn(name, componentData) {
      entities.push({ name, components: componentData });
      return builder;
    },
    /** Register a global resource. */
    resource(name, data) {
      resources[name] = data;
      return builder;
    },
    /** Add a system function. Systems run in registration order. */
    system(name, fn) {
      systems.push({ name, fn });
      return builder;
    },
    /** Compile into a running ECS World with canvas. */
    compile(canvas) {
      const world = new World();
      const display = config.display;
      if (display.type === "grid") {
        const grid = [];
        for (let r = 0; r < display.height; r++) {
          grid.push(new Array(display.width).fill(null));
        }
        world.setResource("_board", {
          cols: display.width,
          rows: display.height,
          grid
        });
      }
      for (const [name, data] of Object.entries(resources)) {
        world.setResource(name, JSON.parse(JSON.stringify(data)));
      }
      if (config.input) {
        const input = {};
        for (const action of Object.keys(config.input)) {
          input[action] = false;
        }
        world.setResource("input", input);
      }
      if (config.timing) {
        world.setResource("_tickRate", config.timing.tickRate);
      }
      if (canvas) {
        const cellSize = display.cellSize || 30;
        const ctx = canvas.getContext("2d");
        canvas.width = display.width * cellSize + 180;
        canvas.height = display.height * cellSize + 20;
        world.setResource("renderer", { ctx, cellSize, offsetX: 10, offsetY: 10 });
      }
      for (const name of Object.keys(components)) {
        world.registerComponent(name);
      }
      for (const entity of entities) {
        const eid = world.createEntity();
        for (const [compName, compData] of Object.entries(entity.components)) {
          world.addComponent(eid, compName, JSON.parse(JSON.stringify(compData)));
        }
      }
      for (let i = 0; i < systems.length; i++) {
        world.addSystem(systems[i].name, systems[i].fn, i);
      }
      world.setResource("_config", config);
      world.setResource("_components", components);
      return world;
    },
    /** Compile and start the game loop with keyboard wiring. */
    start(canvas) {
      const world = builder.compile(canvas);
      if (config.input) {
        const input = world.getResource("input");
        const keyToAction = {};
        for (const [action, keys] of Object.entries(config.input)) {
          const keyList = Array.isArray(keys) ? keys : keys.keys || [keys];
          for (const key of keyList) {
            keyToAction[key] = action;
          }
        }
        document.addEventListener("keydown", (e) => {
          const action = keyToAction[e.key];
          if (action) {
            e.preventDefault();
            if (action === "restart") {
              const board = world.getResource("_board");
              if (board) {
                for (let r = 0; r < board.rows; r++) board.grid[r].fill(null);
              }
              const state = world.getResource("state");
              if (state && resources.state) {
                Object.assign(state, JSON.parse(JSON.stringify(resources.state)));
              }
              return;
            }
            input[action] = true;
          }
        });
      }
      let last = performance.now();
      function loop(now) {
        const dt = now - last;
        last = now;
        world.tick(dt);
        requestAnimationFrame(loop);
      }
      requestAnimationFrame(loop);
      return world;
    },
    /** Expose config for introspection. */
    getConfig() {
      return config;
    },
    getSystems() {
      return systems;
    },
    getResources() {
      return resources;
    },
    getComponents() {
      return components;
    },
    getEntities() {
      return entities;
    }
  };
  return builder;
}

// engine:@engine/input
function consumeAction(input, action) {
  if (input[action]) {
    input[action] = false;
    return true;
  }
  return false;
}

// engine:@engine/grid
function wrapPosition(x, y, cols, rows) {
  return [
    (x % cols + cols) % cols,
    (y % rows + rows) % rows
  ];
}
function selfCollides(head, segments) {
  for (const seg of segments) {
    if (seg.x === head.x && seg.y === head.y) return true;
  }
  return false;
}
function randomFreePosition(cols, rows, occupied) {
  let x, y;
  let attempts = 0;
  do {
    x = Math.floor(Math.random() * cols);
    y = Math.floor(Math.random() * rows);
    attempts++;
    if (attempts > cols * rows * 2) break;
  } while (occupied.some((p) => p.x === x && p.y === y));
  return { x, y };
}

// engine:@engine/render
function drawHUD(ctx, state, offsetX, gridWidth, offsetY, opts = {}) {
  const {
    fields = ["score"],
    fontSize = 18,
    labels = {},
    color = "#fff"
  } = opts;
  const hudX = offsetX + gridWidth + 15;
  ctx.font = `${fontSize}px monospace`;
  ctx.fillStyle = color;
  ctx.textAlign = "left";
  let y = offsetY + 30;
  for (const field of fields) {
    const label = labels[field] || field.charAt(0).toUpperCase() + field.slice(1);
    const value = state[field] !== void 0 ? state[field] : "\u2014";
    ctx.fillText(`${label}: ${value}`, hudX, y);
    y += fontSize + 8;
  }
}
function drawGameOver(ctx, offsetX, offsetY, W, H, opts = {}) {
  const {
    title = "GAME OVER",
    titleColor = "#ff4444",
    subtitle
  } = opts;
  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.fillRect(offsetX, offsetY, W, H);
  ctx.fillStyle = titleColor;
  ctx.font = "bold 36px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(title, offsetX + W / 2, offsetY + H / 2 - 20);
  if (subtitle) {
    ctx.fillStyle = "#fff";
    ctx.font = "18px monospace";
    ctx.fillText(subtitle, offsetX + W / 2, offsetY + H / 2 + 20);
  }
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}
function clearCanvas(ctx, bgColor = "#111") {
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}
function drawBorder(ctx, offsetX, offsetY, W, H, color = "#444") {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.strokeRect(offsetX, offsetY, W, H);
}
function drawCell(ctx, offsetX, offsetY, cellSize, gx, gy, color, borderColor = null) {
  const px = offsetX + gx * cellSize;
  const py = offsetY + gy * cellSize;
  ctx.fillStyle = color;
  ctx.fillRect(px + 1, py + 1, cellSize - 2, cellSize - 2);
  if (borderColor) {
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 1, py + 1, cellSize - 2, cellSize - 2);
  }
}
function drawSnake(ctx, segments, offsetX, offsetY, cellSize, opts = {}) {
  const { headColor = "#4CAF50", bodyColor = "#81C784" } = opts;
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i];
    const color = i === 0 ? headColor : bodyColor;
    drawCell(ctx, offsetX, offsetY, cellSize, seg.x, seg.y, color);
  }
}
function drawFood(ctx, pos, offsetX, offsetY, cellSize, color = "#F44336") {
  const px = offsetX + pos.x * cellSize + cellSize * 0.15;
  const py = offsetY + pos.y * cellSize + cellSize * 0.15;
  const size = cellSize * 0.7;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(px + size / 2, py + size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();
}

// ../../../virtual/game.js
var COLS = 20;
var ROWS = 20;
var CELL_SIZE = 25;
var SCORE_PER_FOOD = 10;
var LINES_PER_LEVEL = 5;
var game = defineGame({
  display: {
    type: "grid",
    width: COLS,
    height: ROWS,
    cellSize: CELL_SIZE,
    background: "#1a1a2e"
  },
  input: {
    up: { keys: ["ArrowUp", "w"] },
    down: { keys: ["ArrowDown", "s"] },
    left: { keys: ["ArrowLeft", "a"] },
    right: { keys: ["ArrowRight", "d"] },
    restart: { keys: ["r", "R"] }
  },
  timing: {
    tickRate: 150
  }
});
game.component("Snake", {
  segments: [],
  // [{x,y}, ...] — head is index 0
  dx: 1,
  // Current direction
  dy: 0,
  growing: false,
  headColor: "#4CAF50",
  bodyColor: "#81C784"
});
game.component("Food", { color: "#F44336" });
game.component("Position", { x: 0, y: 0 });
game.resource("state", {
  score: 0,
  level: 1,
  foodEaten: 0,
  gameOver: false
});
game.resource("_movement", { elapsed: 0 });
game.resource("_pendingDir", { dx: null, dy: null });
game.system("spawn", function spawnSystem(world, _dt) {
  if (world.getResource("_spawned")) return;
  world.setResource("_spawned", true);
  const cx = Math.floor(COLS / 2);
  const cy = Math.floor(ROWS / 2);
  const snakeEid = world.createEntity();
  world.addComponent(snakeEid, "Position", { x: cx, y: cy });
  world.addComponent(snakeEid, "Snake", {
    segments: [
      { x: cx, y: cy },
      { x: cx - 1, y: cy },
      { x: cx - 2, y: cy }
    ],
    dx: 1,
    dy: 0,
    growing: false,
    headColor: "#4CAF50",
    bodyColor: "#81C784"
  });
  spawnFood(world);
});
function spawnFood(world) {
  const snakes = world.query("Snake");
  let occupied = [];
  for (const sid of snakes) {
    const snake = world.getComponent(sid, "Snake");
    occupied = occupied.concat(snake.segments);
  }
  const pos = randomFreePosition(COLS, ROWS, occupied);
  const foods = world.query("Food", "Position");
  if (foods.length > 0) {
    const foodPos = world.getComponent(foods[0], "Position");
    foodPos.x = pos.x;
    foodPos.y = pos.y;
  } else {
    const fid = world.createEntity();
    world.addComponent(fid, "Position", { x: pos.x, y: pos.y });
    world.addComponent(fid, "Food", { color: "#F44336" });
  }
}
game.system("input", function inputSystem(world, _dt) {
  const state = world.getResource("state");
  if (state.gameOver) return;
  const input = world.getResource("input");
  const snakes = world.query("Snake");
  if (snakes.length === 0) return;
  const snake = world.getComponent(snakes[0], "Snake");
  const pending = world.getResource("_pendingDir");
  if (consumeAction(input, "up") && snake.dy !== 1) {
    pending.dx = 0;
    pending.dy = -1;
  }
  if (consumeAction(input, "down") && snake.dy !== -1) {
    pending.dx = 0;
    pending.dy = 1;
  }
  if (consumeAction(input, "left") && snake.dx !== 1) {
    pending.dx = -1;
    pending.dy = 0;
  }
  if (consumeAction(input, "right") && snake.dx !== -1) {
    pending.dx = 1;
    pending.dy = 0;
  }
});
function getTickInterval(level) {
  return Math.max(60, 150 - (level - 1) * 5);
}
game.system("movement", function movementSystem(world, dt) {
  const state = world.getResource("state");
  if (state.gameOver) return;
  const movement = world.getResource("_movement");
  movement.elapsed += dt;
  const interval = getTickInterval(state.level);
  if (movement.elapsed < interval) return;
  movement.elapsed -= interval;
  const snakes = world.query("Snake");
  if (snakes.length === 0) return;
  const snakeEid = snakes[0];
  const snake = world.getComponent(snakeEid, "Snake");
  const pos = world.getComponent(snakeEid, "Position");
  const pending = world.getResource("_pendingDir");
  if (pending.dx !== null) {
    snake.dx = pending.dx;
    snake.dy = pending.dy;
    pending.dx = null;
    pending.dy = null;
  }
  const [nx, ny] = wrapPosition(
    snake.segments[0].x + snake.dx,
    snake.segments[0].y + snake.dy,
    COLS,
    ROWS
  );
  if (selfCollides({ x: nx, y: ny }, snake.segments)) {
    state.gameOver = true;
    return;
  }
  snake.segments.unshift({ x: nx, y: ny });
  pos.x = nx;
  pos.y = ny;
  const foods = world.query("Food", "Position");
  let ate = false;
  for (const fid of foods) {
    const foodPos = world.getComponent(fid, "Position");
    if (foodPos.x === nx && foodPos.y === ny) {
      ate = true;
      state.score += SCORE_PER_FOOD;
      state.foodEaten = (state.foodEaten || 0) + 1;
      const newLevel = Math.floor(state.foodEaten / LINES_PER_LEVEL) + 1;
      if (newLevel > state.level) {
        state.level = newLevel;
        world.emit("levelUp", { level: newLevel });
      }
      world.emit("consumed", { score: SCORE_PER_FOOD });
      spawnFood(world);
      break;
    }
  }
  if (!ate) {
    snake.segments.pop();
  }
  world.emit("moved");
});
game.system("render", function renderSystem(world, _dt) {
  const renderer = world.getResource("renderer");
  if (!renderer) return;
  const { ctx, cellSize, offsetX, offsetY } = renderer;
  const state = world.getResource("state");
  const W = COLS * cellSize;
  const H = ROWS * cellSize;
  clearCanvas(ctx, "#1a1a2e");
  ctx.fillStyle = "#16213e";
  ctx.fillRect(offsetX, offsetY, W, H);
  ctx.strokeStyle = "#1a2740";
  ctx.lineWidth = 0.5;
  for (let r = 0; r <= ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(offsetX, offsetY + r * cellSize);
    ctx.lineTo(offsetX + W, offsetY + r * cellSize);
    ctx.stroke();
  }
  for (let c = 0; c <= COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(offsetX + c * cellSize, offsetY);
    ctx.lineTo(offsetX + c * cellSize, offsetY + H);
    ctx.stroke();
  }
  drawBorder(ctx, offsetX, offsetY, W, H, "#333");
  const foods = world.query("Food", "Position");
  for (const fid of foods) {
    const foodPos = world.getComponent(fid, "Position");
    const food = world.getComponent(fid, "Food");
    drawFood(ctx, foodPos, offsetX, offsetY, cellSize, food.color);
  }
  const snakes = world.query("Snake");
  for (const sid of snakes) {
    const snake = world.getComponent(sid, "Snake");
    drawSnake(ctx, snake.segments, offsetX, offsetY, cellSize, {
      headColor: snake.headColor,
      bodyColor: snake.bodyColor
    });
  }
  drawHUD(ctx, state, offsetX, W, offsetY, {
    fields: ["score", "level"],
    fontSize: 18,
    labels: { score: "Score", level: "Level" }
  });
  if (state && state.gameOver) {
    drawGameOver(ctx, offsetX, offsetY, W, H, {
      title: "GAME OVER",
      titleColor: "#ff4444",
      subtitle: `Score: ${state.score} | Press R to restart`
    });
  }
});
var game_default = game;
export {
  game_default as default
};
