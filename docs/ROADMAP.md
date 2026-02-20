# Creatures Clone — Implementation Roadmap

## Overview

Eight phases, each building on the last. Each phase produces a playable (or at least runnable) build. The goal is to always have something working — never a long stretch of invisible backend work.

**Estimated total scope**: ~266 genes, ~480 neurons, ~80 chemicals, ~21 organs, procedural mesh creatures, noise-based biomes, full world simulation.

---

## Phase 1: Vertical Slice

**Goal**: A minimal but complete life loop — creatures that can sense, think, move, eat, and reproduce on a flat world.

### Deliverables
- [ ] Flat green ground plane (no terrain generation)
- [ ] Simple CTRNN brain: 32 neurons across 4 lobes (Drive×4, Sense×8, Concept×12, Decision×8)
- [ ] 10 chemicals: Hunger, Energy, Pain, Glucose, ATP, Reward, Punishment, Age, LifeForce, Tiredness
- [ ] 3 organs: Stomach (food→glucose), Muscles (ATP→movement), Brain (reward/punishment)
- [ ] Capsule creature visuals (CapsuleGeometry, solid color, no skeleton)
- [ ] Basic movement: forward, turn left, turn right, eat
- [ ] Food objects: randomly spawning green spheres with energy content
- [ ] Eating: creature touches food → food consumed → glucose increases
- [ ] Metabolism: glucose→ATP→energy for movement, hunger rises when glucose low
- [ ] Simple reproduction: when two creatures are near + both have high energy → spawn child with crossed-over genome
- [ ] Minimal genome: ~30 genes (brain connections, 3 organ reactions, emitters, receptors, basic morphology)
- [ ] Death: LifeForce drops to 0 from starvation or old age
- [ ] Basic HUD: creature count, selected creature info (energy, hunger, age)
- [ ] Click to select a creature, camera follows selected

### Architecture
- Single-threaded (no Web Worker yet)
- ECS scaffolding: World, Entity, Component, System base classes
- Systems: BrainSystem, BiochemistrySystem, MotorSystem, SensorySystem, MetabolismSystem, ReproductionSystem, RenderSystem

### Success Criteria
- 10-20 creatures roaming, eating, reproducing
- Population sustains itself (doesn't go extinct immediately or explode)
- Observable emergent behavior: creatures move toward food when hungry
- Runs at 60fps

---

## Phase 2: Terrain + Full Brain

**Goal**: Noise-based terrain with biomes, expanded brain with learning, day/night cycle.

### Deliverables
- [ ] Simplex noise terrain generation (4 octaves, 512×512)
- [ ] Moisture map (2 octaves)
- [ ] Biome assignment: 10+ biome types from elevation×moisture matrix
- [ ] Biome-colored terrain (vertex colors or texture atlas)
- [ ] Full brain: 480 neurons across 9 lobes (Drive, StimulusSource, Noun, Verb, GeneralSense, Attention, Perception, Concept, Decision)
- [ ] Genome-encoded brain lobe and connection genes
- [ ] Learning rules: Hebbian strengthening, atrophy, reward-modulated learning
- [ ] Instinct genes: ~30 hardwired stimulus→action→reward mappings
- [ ] Day/night cycle: 10 min real-time = 1 game day, sun arc, lighting changes
- [ ] Expanded senses: see nearby creatures (species, distance, direction), see nearby food, sense terrain type, sense temperature, sense light level
- [ ] 5 additional chemicals: Serotonin, Dopamine, Adrenaline, Sleepiness, Boredom
- [ ] Sleep behavior: creatures rest at night (sleepiness drive)
- [ ] Camera controls: orbit, pan, zoom

### Architecture
- Still single-threaded
- SimplexNoise utility implemented
- Terrain mesh generation pipeline

### Success Criteria
- Visually distinct biomes visible from above
- Day/night cycle visually convincing
- Creatures learn over their lifetime (measurable weight changes)
- Creatures exhibit biome preferences (stay where food is abundant)

---

## Phase 3: Full Biochemistry

**Goal**: Complete chemical simulation with all organs, disease, aging, and life stages.

### Deliverables
- [ ] All ~80 chemicals implemented
- [ ] All 21 organs with genome-encoded reactions (~120 reactions total)
- [ ] Full emitter/receptor system coupling brain ↔ chemistry
- [ ] Half-life decay for all chemicals
- [ ] Complete drive system: 16 drives from chemical levels
- [ ] Life stages: egg → baby → child → adolescent → adult → elder
- [ ] Aging: AgingFactor increases, organ degradation, elder creatures slow down
- [ ] Disease system: environmental pathogens, immune response (antibodies, fever)
- [ ] Hunger/thirst/tiredness fully driven by metabolic chemicals
- [ ] Temperature effects: Coldness/Hotness drives from environment
- [ ] Toxin exposure from certain biomes or plants
- [ ] Multiple food types: plants with different nutritional values
- [ ] Creature inspector panel: show all chemical levels, organ health, life stage
- [ ] Death from: starvation, disease, organ failure, old age, toxins

### Architecture
- ChemicalRegistry with all 80 chemicals
- Organ system with genome-decoded reaction chains
- Expanded genome: ~150 genes (adding reaction, emitter, receptor, organ genes)

### Success Criteria
- Creatures have realistic metabolic cycles (eat, digest, burn energy)
- Disease outbreaks can occur and spread
- Creatures age visibly (life stage progression over ~5 min real-time)
- Elder creatures die of old age; population turns over

---

## Phase 4: Procedural Mesh Creatures

**Goal**: Replace capsule placeholders with genome-driven metaball creatures with IK animation.

### Deliverables
- [ ] Morphology genes: body plan (limb count, segment sizes, proportions)
- [ ] Skeleton builder: genome → Three.js Bone hierarchy
- [ ] Metaball field: skeleton bones → implicit surface primitives
- [ ] Marching cubes: isosurface extraction at configurable resolution
- [ ] SkinnedMesh binding: mesh bound to skeleton
- [ ] Skin shader: HSL base color + procedural patterns (spots, stripes, gradient, etc.)
- [ ] FABRIK IK solver for legs
- [ ] Gait generation: bipedal, quadruped, hexapod gaits (phase-offset sinusoidal)
- [ ] Foot placement: raycast to terrain for IK targets
- [ ] Head tracking: head looks toward attention target
- [ ] Idle animations: breathing, weight shifting
- [ ] Expression animations: curiosity (head tilt), fear (crouch), aggression (raised posture)
- [ ] Life stage scaling: baby=30%, child=60%, adolescent=85%, adult=100%, elder=95%
- [ ] Mesh caching: generate once at birth/growth stage change, reuse geometry

### Architecture
- MarchingCubes utility
- FABRIK IKSolver utility
- BodyPlan interpreter (genome → body tree)
- MeshGenerator pipeline (body tree → metaballs → marching cubes → BufferGeometry)

### Success Criteria
- Each creature looks unique (genome-driven variation)
- Parents and children look similar (inherited morphology)
- Walking animation looks natural on terrain
- Mesh generation < 100ms per creature
- No visual glitches at LOD transitions

---

## Phase 5: Web Worker Offloading

**Goal**: Move simulation to a Web Worker for smooth 60fps with 50+ creatures.

### Deliverables
- [ ] SimWorker: Web Worker running all simulation systems (brain, biochem, metabolism, motor, reproduction, learning, world)
- [ ] SharedArrayBuffer layout: per-creature transforms, drive levels, brain output summary, chemical summary
- [ ] Double-buffered transform sync: Worker writes back buffer, atomically swaps
- [ ] Main thread reads front buffer during render — no locks
- [ ] MessagePort for low-frequency commands: spawn, select, save, pause
- [ ] Medium-frequency data channel: brain snapshots, chemical summaries (~4 Hz)
- [ ] Fixed timestep in Worker (50ms / 20 Hz), interpolation on main thread
- [ ] COOP/COEP headers in Vite config (already scaffolded)
- [ ] Graceful fallback: if SharedArrayBuffer unavailable, run single-threaded
- [ ] Profiling: measure frame times, worker tick times, identify bottlenecks

### Architecture
- SharedState module: typed array views over SharedArrayBuffer
- Worker entry point: SimWorker.ts
- Main thread: only RenderSystem + UISystem + input handling
- Sync protocol: atomic swap flag + tick counter

### Success Criteria
- 50 creatures at 60fps (main thread frame time < 16ms)
- Worker tick time < 50ms for 50 creatures
- No visible stutter during creature spawn/death
- Brain visualization still works (reads from shared buffer)

---

## Phase 6: Advanced World

**Goal**: Full procedural world with weather, water, vegetation ecosystems, and chunk loading.

### Deliverables
- [ ] Chunk-based terrain: 32×32m chunks, 16×16 grid
- [ ] Chunk LOD: full-res near camera, simplified far
- [ ] Async chunk loading (no frame drops)
- [ ] Vegetation system: 8 plant types with growth stages (seed→sprout→mature→flowering→seeding→dead)
- [ ] Seasonal vegetation cycles: spring growth, summer flowering, autumn seeding, winter dormancy
- [ ] Seed spreading: mature plants seed adjacent cells
- [ ] Plant rendering: instanced meshes, billboards for distant plants
- [ ] Weather: temperature model (biome + season + day/night + random)
- [ ] Rain: probability-based events, particle system, increases moisture
- [ ] Wind: affects seed spreading, subtle creature push
- [ ] Water bodies: ponds (below sea level), rivers (gradient descent from peaks)
- [ ] Water rendering: transparent surface, animated wave shader
- [ ] River generation: trace paths from high points to low
- [ ] Creatures can drink from water (reduces Thirst drive)
- [ ] Creatures wade through shallow water (speed penalty)
- [ ] Vegetation affects creature diet: different plants have different nutrients/toxins

### Architecture
- Chunk manager with loading/unloading state machine
- Vegetation grid: sparse data structure, ~10K active plants
- Weather state: global object, updated per tick
- Water mesh: separate plane geometry at y=0

### Success Criteria
- Visually rich, varied landscape
- Vegetation ecosystem sustains itself (plants grow, seed, die, regrow)
- Weather visually and mechanically affects the world
- No frame drops during chunk transitions
- Creatures interact meaningfully with all world features

---

## Phase 7: UI Polish

**Goal**: Rich inspection tools for observing and understanding creature behavior.

### Deliverables
- [ ] HUD overlay: population count, time of day, season, generation count, selected creature summary
- [ ] Creature inspector panel:
  - Name, species, age, life stage, generation
  - All 16 drives as bar charts
  - Top chemical levels
  - Organ health bars
  - Current action / decision
  - Parent/offspring links
- [ ] Brain monitor: real-time neuron activity visualization
  - Lobe layout (grid per lobe)
  - Neuron activation as color intensity
  - Connection weights as lines (thickness = weight)
  - Highlight active pathways
- [ ] Genome viewer:
  - Chromosome list with gene count per chromosome
  - Gene detail view: type, parameters, dominance, mutation rate
  - Compare two genomes (parent vs child, or two creatures)
  - Highlight mutated genes
- [ ] Genealogy tree:
  - Family tree visualization (parents → children)
  - Scrollable/zoomable
  - Color-coded by species/generation
  - Click to select creature
- [ ] Persistence (IndexedDB):
  - Save world state: terrain seed, creature genomes, chemical states, brain weights, vegetation state
  - Load/restore saved worlds
  - Auto-save every 5 minutes
  - Multiple save slots
- [ ] Time controls: pause, 1×, 2×, 5× speed
- [ ] Free camera + follow camera + top-down map view
- [ ] Creature naming: auto-generated names from genome hash

### Architecture
- UI components as HTML/CSS overlays (not Three.js)
- Data binding: poll SharedArrayBuffer / ECS state at UI refresh rate (10 Hz)
- IndexedDB wrapper with versioned schema
- Genealogy stored as adjacency list in memory

### Success Criteria
- Can understand any creature's behavior by inspecting brain + chemicals + drives
- Can trace lineage across generations
- Save/load round-trips without data loss
- UI doesn't impact render performance (<1ms overhead)

---

## Phase 8: Advanced Genetics

**Goal**: Full diploid genetics, speciation, and sexual selection.

### Deliverables
- [ ] Full diploid genome: two copies of each chromosome per creature
- [ ] Allele expression: dominance comparison, co-dominance blending
- [ ] Sexual dimorphism: gender-switched genes (different expression for male/female)
- [ ] Mate selection: creatures prefer mates with certain traits (genome-encoded preferences)
- [ ] Sexual selection pressure: preferred traits increase mating success
- [ ] Speciation detection: track genetic distance between populations
  - Genetic distance metric: normalized Hamming distance across genomes
  - Species threshold: creatures with distance > 0.3 cannot interbreed
  - Species ID assigned by clustering algorithm
  - Visual species indicator (nameplate color)
- [ ] Full mutation suite: point mutation, gene duplication, gene deletion, chromosome duplication (rare)
- [ ] Mutation rate evolution: mutation rate genes can themselves mutate
- [ ] Heterozygote advantage: some gene combinations more fit when heterozygous
- [ ] Inbreeding depression: track inbreeding coefficient, reduce fitness when high
- [ ] Genome statistics overlay: population diversity metrics, allele frequencies, selection pressure indicators
- [ ] Fossil record: log extinct species with representative genome snapshots

### Architecture
- Genome doubled: two Uint8Array per creature (maternal + paternal)
- Expression resolver: per-gene dominance comparison
- Species tracker: clustering over genetic distance matrix (recomputed every ~100 ticks)
- Fossil log: IndexedDB collection of extinct species genomes

### Success Criteria
- Observable speciation: populations diverge into distinct species over many generations
- Sexual selection drives trait exaggeration (e.g., brighter colors in one sex)
- Diploid genetics produce visible heterozygote variation
- Inbreeding avoidance emerges as behavioral pattern

---

## Phase Dependencies

```
Phase 1 (Vertical Slice)
   │
   ├──► Phase 2 (Terrain + Full Brain)
   │       │
   │       ├──► Phase 3 (Full Biochemistry)
   │       │       │
   │       │       └──► Phase 8 (Advanced Genetics)
   │       │
   │       └──► Phase 4 (Procedural Mesh)
   │
   ├──► Phase 5 (Web Worker) ◄── can start after Phase 1, benefits from Phase 2-3
   │
   └──► Phase 6 (Advanced World) ◄── requires Phase 2 terrain
           │
           └──► Phase 7 (UI Polish) ◄── benefits from all prior phases
```

Phases 2-4 can be partially parallelized. Phase 5 can start early (after Phase 1) but benefits from having more systems to offload. Phase 7 is best done last since it inspects all other systems. Phase 8 builds on the genome foundation from Phases 1-3.

## Cross-References

- System architecture: [ARCHITECTURE.md](../ARCHITECTURE.md)
- Genome design: [GENOME.md](GENOME.md)
- Brain design: [BRAIN.md](BRAIN.md)
- Biochemistry design: [BIOCHEMISTRY.md](BIOCHEMISTRY.md)
- World design: [WORLD.md](WORLD.md)
- Creature visuals: [CREATURES.md](CREATURES.md)
