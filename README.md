# Snake

Classic snake game with wrapping edges, growing body, food consumption, score tracking, and speed acceleration.

Built with [ECS Game Factory](https://github.com/agadabanka/game-factory) using the **TypeScript Intermediate Language** pipeline.

## Architecture

```
game.js (TypeScript IL)  →  esbuild-wasm  →  dist/game.bundle.js (standalone)
```

- `game.js` — Game spec using the `@engine` SDK (8KB source)
- `dist/game.bundle.js` — Standalone bundle (~17KB) with zero external dependencies
- `spec.json` — Original JSON spec (backward compatibility)

## Controls

| Key | Action |
|-----|--------|
| Arrow Up / W | Move up |
| Arrow Down / S | Move down |
| Arrow Left / A | Move left |
| Arrow Right / D | Move right |
| R | Restart |

## Features

- Snake grows when eating food
- Edge wrapping (snake wraps around the board)
- Self-collision detection (game over on self-hit)
- 10 points per food eaten
- Level progression every 5 food items
- Speed acceleration per level (150ms down to 60ms)
- Random food placement (avoids snake body)
