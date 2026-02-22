# Creatures

An AI-driven creature simulation where behavior, culture, and evolution emerge from neural networks, biochemistry, and genetics — not scripts.

Inspired by the 1996 *Creatures* (Norns) simulator. Built with TypeScript and Three.js.

## What Is This?

**Creatures** is a living ecosystem simulation. Drop into a procedurally-generated voxel world populated by autonomous creatures that sense, think, feel, gather, build, fight, trade, worship, mate, and die — all driven by bottom-up dynamics rather than hardcoded behavior.

Each creature has:
- A **CTRNN brain** (60 recurrent neurons) that learns through reward/punishment signals
- **Internal biochemistry** (11 chemicals: hunger, energy, pain, reward, anxiety, dopamine, etc.)
- A **diploid genome** encoding body shape, personality traits, neural wiring, and metabolism
- A **vocabulary** of discovered emojis that gates what they can say, craft, and believe
- A **procedural voxel body** — blocky chibi characters with expressive faces and visible equipment

No creature behavior is scripted. Hunger is a chemical. Fear emerges from pain and punishment. Aggression comes from genome traits amplified by anxiety. Cooperation forms through repeated positive interactions. Religion crystallizes from shared symbols. Everything is emergent.

## Features

### World
- **Voxel terrain** — 25x25 chunks, 16x64x16 blocks each, with 5 distinct biomes (Plains, Forest, Desert, Tundra, Swamp)
- **Day/night cycle** — sun orbits, lighting shifts, ambient dims; monsters spawn at night
- **Seasons** — spring, summer, autumn, winter affect temperature and creature behavior
- **Water flow** — cellular automata water simulation, canal support, boats required to cross
- **33 block types** — dirt, stone, ores, wood, crops, crafting stations, building materials

### Creatures
- **Procedural bodies** — voxel chibi meshes generated from genome (color, ears, body scale)
- **Expressive faces** — eyes squint when happy, widen with fear, pupils dilate in anger
- **Emotional system** — happiness, fear, anger, curiosity, tiredness, pain, anxiety all derived from biochemistry
- **Instinct system** — 21 instincts overlay brain outputs for survival (eat when hungry, flee from monsters, fight or flight, build shelters)
- **Memory** — creatures remember hostile and friendly individuals

### Vocabulary Discovery
- Creatures start knowing only 5 basic emojis (happy, sad, angry, scared, self)
- They **learn new emojis** by experiencing things: gathering teaches item emojis, fighting teaches combat emojis, seeing monsters teaches monster emojis
- Vocabulary **gates crafting recipes** — you can't craft a sword if you've never learned the combat emoji
- Vocabulary **spreads through conversation** — creatures in earshot share knowledge
- Vocabulary **shapes religion** — faction philosophy emerges from collectively known symbols

### Society
- **Factions** form from bonded creatures; each develops a philosophy from shared vocabulary
- **Hierarchies** — dominance challenges determine rank within factions
- **Diplomacy** — factions develop alliance/rivalry relationships; wars break out
- **Proximity trading** — creatures barter surplus items with nearby creatures (no global market)
- **Trader caste** — creatures with high sociability + hoard affinity develop traveling trade routes between settlements
- **Territory** — factions claim and defend areas

### Combat
- **Night monsters** — Skeletons, Demons, Giant Spiders, Zombies with distinct stats and voxel-style models
- **Fight-or-flight** — creatures assess threat vs. their weapons, allies nearby, aggression, and energy
- **Group tactics** — allies rally to join fights; courage scales with numbers
- **Weapons & armor** — wood/stone/iron swords, shields; damage multipliers and reduction

### Building & Crafting
- **Blueprint system** — huts, walls, watchtowers, farms, shrines, storage pits
- **Evolutionary architecture** — genome traits mutate building blueprints across generations
- **Block-by-block construction** — creatures carry materials and place blocks at construction sites
- **Crafting recipes** — tools, weapons, food bundles, boats; gated by vocabulary knowledge and crafting table proximity

### Reproduction & Evolution
- **Sexual selection** — females evaluate male attractiveness (display, health, energy, color match)
- **Courtship** — multi-phase courtship with display behavior
- **Diploid crossover** — offspring inherit blended traits from both parents
- **Mutation** — random trait variation drives evolution across generations
- **Pair bonding** — monogamous creatures form lasting bonds

## Getting Started

```bash
git clone https://github.com/clickbaitnate/creatures.git
cd creatures
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

### Build for Production

```bash
npm run build
npm run preview
```

## Controls

| Input | Action |
|-------|--------|
| **WASD** / Arrow Keys | Pan camera |
| **Right-click drag** | Pan camera |
| **Scroll wheel** | Zoom in/out |
| **Q / E** | Rotate camera |
| **Shift** | Fast pan |
| **Left-click** | Select creature |
| **[ / ]** | Cycle through creatures |
| **F** | Follow selected creature |
| **P** | Possess selected creature (god mode) |
| **Escape** | Deselect |
| Edge of screen | Edge scrolling |

## Architecture

```
src/
  ecs/            # Entity-Component-System framework
  components/     # Data stores (Transform, Brain, Genome, Biochemistry, Motor,
                  #   Senses, Inventory, Vocabulary, Social, Expression, etc.)
  systems/        # Logic (Sensory, Brain, Instinct, Biochemistry, Motor,
                  #   Eating, Gathering, Crafting, Hunting, Social, Building,
                  #   Construction, Reproduction, Market, Religion, etc.)
  brain/          # CTRNN neural network implementation
  genome/         # Genome definition, crossover, mutation
  biochemistry/   # Chemical registry and reaction system
  creatures/      # Procedural mesh builder
  voxel/          # Voxel world, chunk meshing, block types, water flow, blueprints
  world/          # Day/night, seasons, monsters, factions, territory, politics,
                  #   hierarchy, zodiac, sephiroth, name generator
  ui/             # Game UI, speech bubbles, charts, dashboard, god mode
  data/           # Data logging
  utils/          # Math helpers
```

### System Execution Order

```
Sensory (10) -> Memory (11) -> Expression (12) -> Brain (20) -> Goals (22)
-> Instinct (25) -> Biochemistry (30) -> Metabolism (35) -> Religion (38)
-> Hierarchy (40) -> Market (44) -> Social (45) -> Motor (50) -> Eating (55)
-> Gathering (57) -> Hunting (58) -> Reproduction (60) -> Crafting (63)
-> Construction (64) -> Building (65) -> Shader (95) -> Animation (96)
-> Render (100)
```

## Tech Stack

- **TypeScript** — full type safety
- **Three.js** — WebGL rendering (voxel chunks, creature meshes, lighting)
- **Vite** — dev server and bundler
- No other runtime dependencies

## Design Documents

Detailed design specs live in `/docs`:

- [Architecture](ARCHITECTURE.md) — ECS design, system pipeline, component layout
- [Creatures](docs/CREATURES.md) — body plan, morphology, animation
- [Brain](docs/BRAIN.md) — CTRNN architecture, lobes, learning rules
- [Genome](docs/GENOME.md) — diploid encoding, crossover, mutation, expression
- [Biochemistry](docs/BIOCHEMISTRY.md) — chemicals, organs, reactions, disease
- [World](docs/WORLD.md) — terrain, biomes, vegetation, weather, water
- [Roadmap](docs/ROADMAP.md) — implementation phases

## License

MIT
