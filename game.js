/**
 * Snake — TypeScript IL game spec using @engine SDK.
 *
 * Classic snake game with wrapping edges, growing body, food consumption,
 * score tracking, and speed acceleration per level.
 *
 * To run:  game.start(canvas)
 * To bundle:  bundleGame(thisFileSource) → standalone JS
 */

import { defineGame } from '@engine/core';
import { consumeAction } from '@engine/input';
import { wrapPosition, selfCollides, randomFreePosition } from '@engine/grid';
import {
  clearCanvas, drawBorder, drawSnake, drawFood,
  drawHUD, drawGameOver,
} from '@engine/render';
import { drawTouchOverlay } from '@engine/touch';

// ── Constants ───────────────────────────────────────────────────────

const COLS = 20;
const ROWS = 20;
const CELL_SIZE = 25;
const SCORE_PER_FOOD = 10;
const LINES_PER_LEVEL = 5; // Food eaten per level

// ── Game Definition ─────────────────────────────────────────────────

const game = defineGame({
  display: {
    type: 'grid',
    width: COLS,
    height: ROWS,
    cellSize: CELL_SIZE,
    background: '#1a1a2e',
  },
  input: {
    up:      { keys: ['ArrowUp', 'w'] },
    down:    { keys: ['ArrowDown', 's'] },
    left:    { keys: ['ArrowLeft', 'a'] },
    right:   { keys: ['ArrowRight', 'd'] },
    restart: { keys: ['r', 'R'] },
  },
  timing: {
    tickRate: 150,
  },
});

// ── Components ──────────────────────────────────────────────────────

game.component('Snake', {
  segments: [],       // [{x,y}, ...] — head is index 0
  dx: 1,              // Current direction
  dy: 0,
  growing: false,
  headColor: '#4CAF50',
  bodyColor: '#81C784',
});

game.component('Food', { color: '#F44336' });
game.component('Position', { x: 0, y: 0 });

// ── Resources ───────────────────────────────────────────────────────

game.resource('state', {
  score: 0,
  level: 1,
  foodEaten: 0,
  gameOver: false,
});

game.resource('_movement', { elapsed: 0 });
game.resource('_pendingDir', { dx: null, dy: null });

// ── Spawn System ────────────────────────────────────────────────────

game.system('spawn', function spawnSystem(world, _dt) {
  if (world.getResource('_spawned')) return;
  world.setResource('_spawned', true);

  // Create snake at center of grid
  const cx = Math.floor(COLS / 2);
  const cy = Math.floor(ROWS / 2);
  const snakeEid = world.createEntity();
  world.addComponent(snakeEid, 'Position', { x: cx, y: cy });
  world.addComponent(snakeEid, 'Snake', {
    segments: [
      { x: cx, y: cy },
      { x: cx - 1, y: cy },
      { x: cx - 2, y: cy },
    ],
    dx: 1,
    dy: 0,
    growing: false,
    headColor: '#4CAF50',
    bodyColor: '#81C784',
  });

  // Spawn initial food
  spawnFood(world);
});

function spawnFood(world) {
  // Gather occupied positions (snake segments)
  const snakes = world.query('Snake');
  let occupied = [];
  for (const sid of snakes) {
    const snake = world.getComponent(sid, 'Snake');
    occupied = occupied.concat(snake.segments);
  }

  const pos = randomFreePosition(COLS, ROWS, occupied);

  // Check if food entity exists, reuse it
  const foods = world.query('Food', 'Position');
  if (foods.length > 0) {
    const foodPos = world.getComponent(foods[0], 'Position');
    foodPos.x = pos.x;
    foodPos.y = pos.y;
  } else {
    const fid = world.createEntity();
    world.addComponent(fid, 'Position', { x: pos.x, y: pos.y });
    world.addComponent(fid, 'Food', { color: '#F44336' });
  }
}

// ── Input System ────────────────────────────────────────────────────

game.system('input', function inputSystem(world, _dt) {
  const state = world.getResource('state');
  if (state.gameOver) return;

  const input = world.getResource('input');
  const snakes = world.query('Snake');
  if (snakes.length === 0) return;

  const snake = world.getComponent(snakes[0], 'Snake');
  const pending = world.getResource('_pendingDir');

  // Queue direction change (prevent 180° reversal)
  if (consumeAction(input, 'up') && snake.dy !== 1) {
    pending.dx = 0; pending.dy = -1;
  }
  if (consumeAction(input, 'down') && snake.dy !== -1) {
    pending.dx = 0; pending.dy = 1;
  }
  if (consumeAction(input, 'left') && snake.dx !== 1) {
    pending.dx = -1; pending.dy = 0;
  }
  if (consumeAction(input, 'right') && snake.dx !== -1) {
    pending.dx = 1; pending.dy = 0;
  }
});

// ── AI Auto-Play System ─────────────────────────────────────────────

game.system('ai', function aiSystem(world, _dt) {
  const state = world.getResource('state');
  if (state.gameOver) return;

  const snakes = world.query('Snake');
  if (snakes.length === 0) return;

  const snake = world.getComponent(snakes[0], 'Snake');
  const foods = world.query('Food', 'Position');
  if (foods.length === 0) return;

  const foodPos = world.getComponent(foods[0], 'Position');
  const head = snake.segments[0];
  const pending = world.getResource('_pendingDir');

  // Build occupancy set from snake body (excluding tail which will move)
  const bodySet = new Set();
  for (let i = 0; i < snake.segments.length - 1; i++) {
    bodySet.add(`${snake.segments[i].x},${snake.segments[i].y}`);
  }

  // Try BFS to find path to food
  const dir = bfsDirection(head, foodPos, snake.dx, snake.dy, bodySet);
  if (dir && (dir.dx !== snake.dx || dir.dy !== snake.dy)) {
    // Prevent 180 reversal
    if (dir.dx !== -snake.dx || dir.dy !== -snake.dy) {
      pending.dx = dir.dx;
      pending.dy = dir.dy;
    }
  }
});

function bfsDirection(head, target, curDx, curDy, bodySet) {
  // Simple BFS on wrapping grid to find shortest path to food
  const dirs = [
    { dx: 0, dy: -1 }, // up
    { dx: 0, dy: 1 },  // down
    { dx: -1, dy: 0 }, // left
    { dx: 1, dy: 0 },  // right
  ];

  const visited = new Set();
  visited.add(`${head.x},${head.y}`);
  const queue = [];

  // Start with valid first moves (no 180 reversal)
  for (const d of dirs) {
    if (d.dx === -curDx && d.dy === -curDy) continue; // skip reversal
    const nx = ((head.x + d.dx) % COLS + COLS) % COLS;
    const ny = ((head.y + d.dy) % ROWS + ROWS) % ROWS;
    const key = `${nx},${ny}`;
    if (bodySet.has(key)) continue;
    if (nx === target.x && ny === target.y) return d;
    visited.add(key);
    queue.push({ x: nx, y: ny, firstDir: d });
  }

  // BFS up to limited depth for performance
  let limit = 200;
  while (queue.length > 0 && limit-- > 0) {
    const cur = queue.shift();
    for (const d of dirs) {
      const nx = ((cur.x + d.dx) % COLS + COLS) % COLS;
      const ny = ((cur.y + d.dy) % ROWS + ROWS) % ROWS;
      const key = `${nx},${ny}`;
      if (visited.has(key) || bodySet.has(key)) continue;
      if (nx === target.x && ny === target.y) return cur.firstDir;
      visited.add(key);
      queue.push({ x: nx, y: ny, firstDir: cur.firstDir });
    }
  }

  // Fallback: pick any safe direction
  for (const d of dirs) {
    if (d.dx === -curDx && d.dy === -curDy) continue;
    const nx = ((head.x + d.dx) % COLS + COLS) % COLS;
    const ny = ((head.y + d.dy) % ROWS + ROWS) % ROWS;
    if (!bodySet.has(`${nx},${ny}`)) return d;
  }

  return null; // No safe move
}

// ── Movement System ─────────────────────────────────────────────────

function getTickInterval(level) {
  return Math.max(60, 150 - (level - 1) * 5);
}

game.system('movement', function movementSystem(world, dt) {
  const state = world.getResource('state');
  if (state.gameOver) return;

  const movement = world.getResource('_movement');
  movement.elapsed += dt;

  const interval = getTickInterval(state.level);
  if (movement.elapsed < interval) return;
  movement.elapsed -= interval;

  const snakes = world.query('Snake');
  if (snakes.length === 0) return;

  const snakeEid = snakes[0];
  const snake = world.getComponent(snakeEid, 'Snake');
  const pos = world.getComponent(snakeEid, 'Position');
  const pending = world.getResource('_pendingDir');

  // Apply pending direction
  if (pending.dx !== null) {
    snake.dx = pending.dx;
    snake.dy = pending.dy;
    pending.dx = null;
    pending.dy = null;
  }

  // Calculate new head position with wrapping
  const [nx, ny] = wrapPosition(
    snake.segments[0].x + snake.dx,
    snake.segments[0].y + snake.dy,
    COLS, ROWS
  );

  // Self-collision check (before moving)
  if (selfCollides({ x: nx, y: ny }, snake.segments)) {
    state.gameOver = true;
    return;
  }

  // Move: prepend new head
  snake.segments.unshift({ x: nx, y: ny });

  // Update Position component to head location
  pos.x = nx;
  pos.y = ny;

  // Check food consumption
  const foods = world.query('Food', 'Position');
  let ate = false;
  for (const fid of foods) {
    const foodPos = world.getComponent(fid, 'Position');
    if (foodPos.x === nx && foodPos.y === ny) {
      ate = true;
      state.score += SCORE_PER_FOOD;
      state.foodEaten = (state.foodEaten || 0) + 1;

      // Level up
      const newLevel = Math.floor(state.foodEaten / LINES_PER_LEVEL) + 1;
      if (newLevel > state.level) {
        state.level = newLevel;
        world.emit('levelUp', { level: newLevel });
      }

      world.emit('consumed', { score: SCORE_PER_FOOD });
      spawnFood(world);
      break;
    }
  }

  // If didn't eat, remove tail (snake doesn't grow)
  if (!ate) {
    snake.segments.pop();
  }

  world.emit('moved');
});

// ── Render System ───────────────────────────────────────────────────

game.system('render', function renderSystem(world, _dt) {
  const renderer = world.getResource('renderer');
  if (!renderer) return;

  const { ctx, cellSize, offsetX, offsetY } = renderer;
  const state = world.getResource('state');
  const W = COLS * cellSize;
  const H = ROWS * cellSize;

  // Clear canvas
  clearCanvas(ctx, '#1a1a2e');

  // Draw grid background
  ctx.fillStyle = '#16213e';
  ctx.fillRect(offsetX, offsetY, W, H);

  // Grid lines
  ctx.strokeStyle = '#1a2740';
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

  // Draw border
  drawBorder(ctx, offsetX, offsetY, W, H, '#333');

  // Draw food
  const foods = world.query('Food', 'Position');
  for (const fid of foods) {
    const foodPos = world.getComponent(fid, 'Position');
    const food = world.getComponent(fid, 'Food');
    drawFood(ctx, foodPos, offsetX, offsetY, cellSize, food.color);
  }

  // Draw snake
  const snakes = world.query('Snake');
  for (const sid of snakes) {
    const snake = world.getComponent(sid, 'Snake');
    drawSnake(ctx, snake.segments, offsetX, offsetY, cellSize, {
      headColor: snake.headColor,
      bodyColor: snake.bodyColor,
    });
  }

  // HUD
  drawHUD(ctx, state, offsetX, W, offsetY, {
    fields: ['score', 'level'],
    fontSize: 18,
    labels: { score: 'Score', level: 'Level' },
  });

  // Game over overlay
  if (state && state.gameOver) {
    drawGameOver(ctx, offsetX, offsetY, W, H, {
      title: 'GAME OVER',
      titleColor: '#ff4444',
      subtitle: `Score: ${state.score} | Press R to restart`,
    });
  }

  // Touch overlay (mobile)
  drawTouchOverlay(ctx, ctx.canvas.width, ctx.canvas.height);
});

export default game;
