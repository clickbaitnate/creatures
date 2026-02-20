# Creatures Clone — Architecture

## Directory Structure

```
creatures/
├── ARCHITECTURE.md              # This file — system overview
├── package.json
├── tsconfig.json
├── vite.config.ts
├── index.html
├── docs/
│   ├── GENOME.md                # Genetics system design
│   ├── BRAIN.md                 # CTRNN neural network design
│   ├── BIOCHEMISTRY.md          # Chemical simulation design
│   ├── WORLD.md                 # Procedural environment design
│   ├── CREATURES.md             # Morphology & visual design
│   └── ROADMAP.md               # Phased implementation plan
├── src/
│   ├── main.ts                  # Entry point — Three.js scene bootstrap
│   ├── ecs/
│   │   ├── World.ts             # ECS world — entity manager + system runner
│   │   ├── Entity.ts            # Entity handle (numeric ID + component bitmask)
│   │   ├── Component.ts         # Component base types + registry
│   │   └── System.ts            # System base class (priority, query, update)
│   ├── components/
│   │   ├── Transform.ts         # Position, rotation, scale
│   │   ├── Renderable.ts        # Three.js Object3D reference
│   │   ├── Brain.ts             # CTRNN state arrays
│   │   ├── Genome.ts            # Encoded genome + decoded gene cache
│   │   ├── Biochemistry.ts      # Chemical concentrations Float32Array
│   │   ├── Metabolism.ts        # Organ state, energy, age
│   │   ├── Motor.ts             # Movement intent, gait state
│   │   ├── Senses.ts            # Visual, tactile, smell inputs
│   │   ├── Morphology.ts        # Body plan, skeleton ref, LOD level
│   │   └── Lifecycle.ts         # Life stage, age, fertility
│   ├── systems/
│   │   ├── BrainSystem.ts       # CTRNN integration step
│   │   ├── BiochemistrySystem.ts # Chemical reactions + decay
│   │   ├── SensorySystem.ts     # Populate sense inputs from world state
│   │   ├── MotorSystem.ts       # Translate brain outputs to movement
│   │   ├── MetabolismSystem.ts  # Energy, hunger, aging
│   │   ├── ReproductionSystem.ts # Mating, genome crossover, birth
│   │   ├── LearningSystem.ts    # Hebbian updates, instinct reinforcement
│   │   ├── WorldSystem.ts       # Terrain updates, vegetation growth
│   │   ├── RenderSystem.ts      # Sync ECS state → Three.js objects
│   │   └── UISystem.ts          # HUD, inspector, debug overlays
│   ├── brain/
│   │   ├── CTRNN.ts             # Core CTRNN math (integration, activation)
│   │   ├── Lobe.ts              # Lobe definition (neuron range, type)
│   │   └── LearningRule.ts      # Hebbian, atrophy, rewiring
│   ├── genome/
│   │   ├── Genome.ts            # Genome encoder/decoder
│   │   ├── Gene.ts              # Gene type definitions
│   │   ├── Crossover.ts         # Sexual recombination
│   │   └── Mutation.ts          # Point, duplication, deletion
│   ├── biochemistry/
│   │   ├── ChemicalRegistry.ts  # Chemical ID → name/half-life/category
│   │   ├── Organ.ts             # Organ with genome-encoded reactions
│   │   ├── Reaction.ts          # Chemical reaction (inputs → outputs + rate)
│   │   └── EmitterReceptor.ts   # Brain↔chemistry coupling
│   ├── world/
│   │   ├── Terrain.ts           # Simplex noise heightmap generation
│   │   ├── Biome.ts             # Biome assignment + properties
│   │   ├── Vegetation.ts        # Plant growth, seeding, harvesting
│   │   ├── Weather.ts           # Temperature, rain, seasons
│   │   ├── Water.ts             # Rivers, ponds, flow
│   │   ├── DayNight.ts          # Sun position, ambient light cycle
│   │   └── Chunk.ts             # Chunk loading/unloading
│   ├── creatures/
│   │   ├── BodyPlan.ts          # Genome → body plan interpretation
│   │   ├── Skeleton.ts          # Three.js Bone hierarchy builder
│   │   ├── MeshGenerator.ts     # Metaball → marching cubes mesh
│   │   ├── SkinShader.ts        # HSL color + procedural patterns
│   │   ├── Animation.ts         # IK solver, gait generation
│   │   └── LOD.ts               # Level-of-detail switching
│   ├── workers/
│   │   ├── SimWorker.ts         # Web Worker entry — runs sim systems
│   │   └── SharedState.ts       # SharedArrayBuffer layout + accessors
│   ├── ui/
│   │   ├── HUD.ts               # Overlay (population, time, selection)
│   │   ├── Inspector.ts         # Selected creature detail panel
│   │   ├── BrainMonitor.ts      # Live neuron activity visualizer
│   │   ├── GenomeViewer.ts      # Chromosome/gene browser
│   │   └── Genealogy.ts         # Family tree viewer
│   └── utils/
│       ├── SimplexNoise.ts      # Simplex noise implementation
│       ├── MarchingCubes.ts     # Isosurface extraction
│       ├── IKSolver.ts          # FABRIK inverse kinematics
│       ├── ObjectPool.ts        # Reusable object pool
│       └── Math.ts              # Common math helpers (lerp, clamp, etc.)
├── public/                      # Static assets served as-is
└── assets/
    ├── textures/                # Terrain, vegetation textures
    ├── models/                  # Fallback static models (if any)
    └── sounds/                  # Ambient, creature sounds
```

## Core Architecture: Lightweight ECS

The simulation uses a lightweight Entity-Component-System (ECS) pattern — not a full ECS framework, but a clean separation of data (components) from logic (systems).

### Entities
- Each entity is a numeric ID (uint32)
- A central `World` object maps entity IDs → component bitmasks
- Component storage: Struct-of-Arrays (SoA) per component type for cache-friendly iteration

### Components
- Plain TypeScript objects or typed arrays
- No inheritance — composition only
- Each component type gets a unique bit in a bitmask for fast archetype queries
- Heavy numeric state (brain activations, chemical concentrations) stored as `Float32Array` for Web Worker transfer

### Systems
- Each system declares a required component query (bitmask)
- Systems run in a fixed priority order each tick
- Two system groups:
  - **Simulation systems** (brain, biochem, metabolism, motor, reproduction, learning, world) — deterministic, fixed timestep (50ms / 20 Hz)
  - **Render systems** (render, UI) — run on `requestAnimationFrame`, interpolate from sim state

### Why not a full ECS library?
- We need tight control over memory layout for SharedArrayBuffer
- The component set is known at compile time — no need for runtime archetype discovery
- Keeps bundle small and avoids framework lock-in

## Threading Model

```
┌─────────────────────────────┐     SharedArrayBuffer      ┌─────────────────────────────┐
│        MAIN THREAD          │◄──────────────────────────►│       WEB WORKER            │
│                             │                             │                             │
│  Three.js Renderer          │   Creature transforms       │  BrainSystem                │
│  RenderSystem               │   (pos, rot, scale)         │  BiochemistrySystem         │
│  UISystem                   │                             │  MetabolismSystem           │
│  Input handling             │   Brain output summary       │  SensorySystem              │
│  Camera controls            │   (for visualization)        │  MotorSystem                │
│                             │                             │  ReproductionSystem         │
│  requestAnimationFrame      │   Chemical summary           │  LearningSystem             │
│  (variable rate, ~60fps)    │   (for HUD/inspector)        │  WorldSystem                │
│                             │                             │                             │
│                             │   ◄── MessagePort ──►       │  Fixed timestep (20 Hz)     │
│                             │   (low-freq commands:        │                             │
│                             │    spawn, select, save)      │                             │
└─────────────────────────────┘                             └─────────────────────────────┘
```

### Communication Strategy

**High-frequency state** (every frame):
- Creature transforms: written by Worker, read by Main — stored in SharedArrayBuffer
- Double-buffered: Worker writes to back buffer, atomically swaps pointer when frame is complete
- Main thread reads front buffer during render — no locks needed

**Medium-frequency data** (every few frames):
- Brain activation snapshots for visualization
- Chemical concentration summaries for HUD
- Written to a separate SharedArrayBuffer region, updated at ~4 Hz

**Low-frequency commands** (event-driven):
- `MessagePort` for structured messages: spawn creature, select creature, save/load, pause/resume
- These are infrequent and can tolerate the postMessage overhead

### SharedArrayBuffer Layout

```
Offset (bytes)    Size              Content
──────────────    ────              ───────
0x0000            4                 Buffer swap flag (Atomics)
0x0004            4                 Creature count
0x0008            4                 Simulation tick number
0x000C            4                 Reserved

── Per-creature block (512 bytes each, max 256 creatures = 128 KB) ──
0x0010 + i*512    12 (3×f32)        Position (x, y, z)
        + 12      16 (4×f32)        Rotation (quaternion)
        + 28      12 (3×f32)        Scale
        + 40      4  (u32)          State flags (alive, life stage, etc.)
        + 44      4  (f32)          Energy level
        + 48      4  (f32)          Health
        + 52      4  (f32)          Age
        + 56      64 (16×f32)       Drive levels (hunger, tiredness, etc.)
        + 120     64 (16×f32)       Brain output summary (motor commands)
        + 184     320 (80×f32)      Top-80 chemical concentrations
        + 504     8                  Reserved/padding

── World state region ──
0x20010           varies            Terrain modification deltas
                                    Vegetation state grid
                                    Weather parameters
```

## System Interconnection

```
                          ┌──────────┐
                          │  GENOME  │
                          └────┬─────┘
              ┌────────────────┼────────────────┐
              ▼                ▼                 ▼
        ┌──────────┐    ┌──────────┐     ┌────────────┐
        │  BRAIN   │◄──►│BIOCHEM   │     │ MORPHOLOGY │
        │  (CTRNN) │    │(chemicals│     │(body plan) │
        └────┬─────┘    │ organs)  │     └──────┬─────┘
             │          └────┬─────┘            │
    ┌────────┴───┐          │            ┌──────┴─────┐
    ▼            ▼          ▼            ▼            ▼
┌────────┐ ┌─────────┐ ┌────────┐ ┌──────────┐ ┌─────────┐
│SENSES  │ │ MOTOR   │ │METABOL │ │ SKELETON │ │ANIMATION│
│(input) │ │(output) │ │(energy)│ │ (bones)  │ │  (IK)   │
└────┬───┘ └────┬────┘ └────┬───┘ └──────────┘ └─────────┘
     │          │           │
     ▼          ▼           ▼
  ┌──────────────────────────────┐
  │           WORLD              │
  │  (terrain, vegetation,       │
  │   weather, day/night)        │
  └──────────────────────────────┘
```

### Data Flow Each Tick

1. **SensorySystem** — reads world state + nearby entities → populates `Senses` component
2. **BrainSystem** — reads `Senses` + `Biochemistry` drive levels → CTRNN integration → writes `Brain` outputs
3. **LearningSystem** — reads brain activations + reward chemicals → Hebbian weight updates
4. **BiochemistrySystem** — runs organ reactions, emitter/receptor coupling, chemical decay
5. **MetabolismSystem** — energy consumption, aging, organ degradation, death check
6. **MotorSystem** — reads brain motor outputs → applies forces/velocities to `Transform`
7. **ReproductionSystem** — checks mating conditions → genome crossover → spawns new entity
8. **WorldSystem** — vegetation growth, weather updates, day/night progression
9. **RenderSystem** *(main thread)* — reads transforms from SharedArrayBuffer → updates Three.js objects
10. **UISystem** *(main thread)* — reads summary data → updates HUD/inspector overlays

## Cross-References

- Genome encoding: [docs/GENOME.md](docs/GENOME.md)
- Brain architecture: [docs/BRAIN.md](docs/BRAIN.md)
- Biochemistry simulation: [docs/BIOCHEMISTRY.md](docs/BIOCHEMISTRY.md)
- World generation: [docs/WORLD.md](docs/WORLD.md)
- Creature visuals: [docs/CREATURES.md](docs/CREATURES.md)
- Implementation phases: [docs/ROADMAP.md](docs/ROADMAP.md)
