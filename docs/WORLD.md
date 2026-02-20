# WORLD.md — Procedural Environment Design

## Table of Contents

1. [Overview](#1-overview)
2. [Simplex Noise Terrain Generation](#2-simplex-noise-terrain-generation)
3. [Biome Assignment Matrix](#3-biome-assignment-matrix)
4. [Vegetation System](#4-vegetation-system)
5. [Day/Night Cycle](#5-daynight-cycle)
6. [Weather System](#6-weather-system)
7. [Water Bodies](#7-water-bodies)
8. [Chunk-Based Loading](#8-chunk-based-loading)
9. [World Interaction](#9-world-interaction)
10. [Implementation Notes](#10-implementation-notes)
11. [Cross-References](#11-cross-references)

---

## 1. Overview

The world is a **procedural vivarium** — a self-contained, living environment in which creatures are born, forage, learn, reproduce, and die. Inspired by Steve Grand's *Creatures* (1996), the environment is not merely a backdrop but an active participant in the simulation: terrain determines movement cost and habitat, biomes govern what grows where, weather shifts temperature and moisture, and a day/night cycle drives behavioral rhythms in every organism.

The world is built from several interlocking layers:

```
┌─────────────────────────────────────────────────────┐
│                    Sky / Lighting                    │
│              (day/night cycle, sun arc)              │
├─────────────────────────────────────────────────────┤
│                   Weather Layer                      │
│         (temperature, rain, wind, seasons)           │
├─────────────────────────────────────────────────────┤
│                 Vegetation Layer                     │
│    (plants, growth cycles, seeds, food sources)      │
├─────────────────────────────────────────────────────┤
│                   Water Layer                        │
│        (ponds, lakes, rivers, wave shader)           │
├─────────────────────────────────────────────────────┤
│                  Biome Layer                         │
│       (elevation × moisture classification)          │
├─────────────────────────────────────────────────────┤
│                 Terrain Layer                        │
│     (simplex noise heightmap + moisture map)         │
├─────────────────────────────────────────────────────┤
│               Chunk Management                       │
│      (32×32m chunks, LOD, async loading)             │
└─────────────────────────────────────────────────────┘
```

**Key characteristics:**

- **Noise-based terrain**: 4-octave simplex noise produces a naturalistic heightmap; a separate moisture pass classifies biomes.
- **Biome diversity**: 15 distinct biome types emerge from an elevation-by-moisture matrix, each with unique properties affecting creatures and vegetation.
- **Living vegetation**: 8 plant types grow, flower, seed, and die according to biome fertility, season, and weather.
- **Dynamic weather**: temperature, rain, and wind shift with season and time of day, directly influencing creature biochemistry and plant growth.
- **Water bodies**: lakes fill depressions below sea level; rivers trace gradient-descent paths from peaks to basins.
- **Day/night cycle**: a 10-minute real-time day drives a sun arc, lighting phase transitions, and creature sleep rhythms.
- **Chunk-based loading**: the 512x512-meter world is divided into 32x32-meter chunks, loaded and unloaded around the camera for efficient rendering and simulation.

The world state is deterministic given a seed, meaning the same seed always produces the same terrain, biome layout, and initial vegetation placement.

---

## 2. Simplex Noise Terrain Generation

### 2.1 Heightmap Generation

Terrain elevation is generated using **4-octave simplex noise** sampled over a 512x512 grid (1 unit = 1 meter). Each octave adds progressively finer detail at diminishing amplitude.

**Octave parameters:**

| Octave | Frequency | Amplitude | Description              |
|--------|-----------|-----------|--------------------------|
| 0      | 1.0       | 1.000     | Continental-scale shapes  |
| 1      | 2.0       | 0.500     | Regional hills and basins |
| 2      | 4.0       | 0.250     | Local ridges and valleys  |
| 3      | 8.0       | 0.125     | Fine surface detail       |

**Global constants:**

| Parameter   | Value  | Description                                  |
|-------------|--------|----------------------------------------------|
| Lacunarity  | 2.0    | Frequency multiplier between octaves         |
| Persistence | 0.5    | Amplitude multiplier between octaves         |
| Height min  | -10 m  | Deepest underwater terrain                   |
| Height max  | +30 m  | Tallest peak                                 |
| Sea level   | 0 m    | Water fills any cell with elevation < 0      |
| Grid size   | 512x512| 1 cell = 1 meter                             |

**Generation formula:**

```
elevation(x, z) = remap(sum_octaves(x, z), -1..1, -10..30)

where:
  sum_octaves(x, z) = Σ(i=0..3) amplitude[i] * simplex(x * frequency[i] / 512,
                                                          z * frequency[i] / 512,
                                                          seed)

  amplitude[i] = persistence ^ i    → [1.0, 0.5, 0.25, 0.125]
  frequency[i] = lacunarity ^ i     → [1.0, 2.0, 4.0, 8.0]

  remap(value, -1..1, -10..30):
    normalized = (value + 1) / 2                   // map to 0..1
    return normalized * (30 - (-10)) + (-10)       // map to -10..30
```

**Pseudocode:**

```javascript
function generateHeightmap(seed) {
    const heightmap = new Float32Array(512 * 512);
    const simplex = new SimplexNoise(seed);
    const maxAmp = 1.0 + 0.5 + 0.25 + 0.125; // 1.875 — for normalization

    for (let z = 0; z < 512; z++) {
        for (let x = 0; x < 512; x++) {
            let value = 0;
            let freq = 1.0;
            let amp = 1.0;

            for (let octave = 0; octave < 4; octave++) {
                const nx = x * freq / 512;
                const nz = z * freq / 512;
                value += amp * simplex.noise2D(nx, nz);
                freq *= 2.0;  // lacunarity
                amp *= 0.5;   // persistence
            }

            // Normalize to -1..1, then remap to -10..30
            const normalized = value / maxAmp;
            heightmap[z * 512 + x] = ((normalized + 1) / 2) * 40 - 10;
        }
    }

    return heightmap;
}
```

### 2.2 Moisture Map

A separate **2-octave simplex noise** pass produces the moisture map, using a different seed offset to ensure it is uncorrelated with elevation.

| Octave | Frequency | Amplitude |
|--------|-----------|-----------|
| 0      | 1.0       | 1.0       |
| 1      | 2.0       | 0.5       |

```javascript
function generateMoistureMap(seed) {
    const moisture = new Float32Array(512 * 512);
    const simplex = new SimplexNoise(seed + 31337); // offset seed

    for (let z = 0; z < 512; z++) {
        for (let x = 0; x < 512; x++) {
            let value = 0;
            let freq = 1.0;
            let amp = 1.0;

            for (let octave = 0; octave < 2; octave++) {
                value += amp * simplex.noise2D(x * freq / 512, z * freq / 512);
                freq *= 2.0;
                amp *= 0.5;
            }

            // Normalize to 0..1
            moisture[z * 512 + x] = (value / 1.5 + 1) / 2;
        }
    }

    return moisture;
}
```

Moisture values are clamped to `[0.0, 1.0]` and used directly in biome assignment and weather calculations.

### 2.3 Terrain Mesh Construction

The heightmap is realized as a **subdivided plane** in Three.js. Each vertex's Y coordinate is displaced by the corresponding heightmap sample.

```
Terrain mesh pipeline:
  1. Create PlaneGeometry(512, 512, 511, 511)  → 512×512 vertices
  2. Rotate to XZ plane (default Three.js plane is XY)
  3. For each vertex (i):
       geometry.attributes.position.array[i * 3 + 1] = heightmap[i]
  4. geometry.computeVertexNormals()   → correct lighting on slopes
  5. Apply biome-colored material (vertex colors or texture splatting)
```

Normal recalculation after vertex displacement is **critical** — without it, the terrain would be lit as if it were still flat, destroying all visual depth. `computeVertexNormals()` averages the face normals of all triangles sharing each vertex to produce smooth shading.

### 2.4 Seed-Based Reproducibility

All noise functions accept a numeric seed. The same seed always produces the same heightmap and moisture map, which means:

- Identical worlds can be shared by exchanging a single integer.
- Regression tests can assert specific terrain features at known coordinates.
- Chunk generation can happen lazily and out-of-order, since any chunk can be computed independently from its coordinates and the global seed.

---

## 3. Biome Assignment Matrix

Each cell in the 512x512 grid is assigned a biome based on its **elevation** (from the heightmap) and **moisture** (from the moisture map). The classification forms a 5x3 matrix:

### 3.1 Classification Table

| Elevation \ Moisture     | Dry (0.0 - 0.3)  | Medium (0.3 - 0.6) | Wet (0.6 - 1.0)   |
|--------------------------|-------------------|---------------------|--------------------|
| **High (> 20 m)**        | Rocky Peak        | Alpine Meadow       | Snow/Ice           |
| **Mid-High (10 - 20 m)** | Scrubland         | Forest              | Rainforest         |
| **Mid (3 - 10 m)**       | Desert/Sand       | Grassland           | Marsh              |
| **Low (0 - 3 m)**        | Dry Beach         | Meadow              | Swamp              |
| **Below Sea (-10 - 0 m)**| Shallow Water     | Deep Water          | Deep Water         |

```javascript
function assignBiome(elevation, moisture) {
    // Elevation band
    let elevBand;
    if (elevation > 20)       elevBand = "high";
    else if (elevation > 10)  elevBand = "mid_high";
    else if (elevation > 3)   elevBand = "mid";
    else if (elevation > 0)   elevBand = "low";
    else                      elevBand = "below_sea";

    // Moisture band
    let moistBand;
    if (moisture < 0.3)       moistBand = "dry";
    else if (moisture < 0.6)  moistBand = "medium";
    else                      moistBand = "wet";

    return BIOME_MATRIX[elevBand][moistBand];
}
```

### 3.2 Biome Properties

Each biome carries a set of properties that feed into vegetation, weather, creature movement, and rendering:

| Biome          | Ground Color   | Veg. Density | Max Veg Types | Temp Modifier | Fertility | Move Speed |
|----------------|----------------|-------------|---------------|---------------|-----------|------------|
| Rocky Peak     | `#8B8682`      | 0.05        | 2             | -8 C          | 0.05      | 0.6        |
| Alpine Meadow  | `#7EC850`      | 0.40        | 4             | -5 C          | 0.30      | 0.8        |
| Snow/Ice       | `#F0F8FF`      | 0.02        | 1             | -15 C         | 0.01      | 0.4        |
| Scrubland      | `#C2B280`      | 0.25        | 3             | +3 C          | 0.15      | 0.9        |
| Forest         | `#228B22`      | 0.80        | 6             | -1 C          | 0.60      | 0.7        |
| Rainforest     | `#006400`      | 0.95        | 8             | +2 C          | 0.90      | 0.5        |
| Desert/Sand    | `#EDC9AF`      | 0.08        | 2             | +10 C         | 0.03      | 0.8        |
| Grassland      | `#7CFC00`      | 0.50        | 5             | +0 C          | 0.50      | 1.0        |
| Marsh          | `#4A7023`      | 0.60        | 5             | -1 C          | 0.55      | 0.6        |
| Dry Beach      | `#F5DEB3`      | 0.10        | 2             | +2 C          | 0.08      | 0.9        |
| Meadow         | `#90EE90`      | 0.65        | 6             | +0 C          | 0.70      | 1.0        |
| Swamp          | `#2E473B`      | 0.70        | 5             | -2 C          | 0.60      | 0.3        |
| Shallow Water  | `#87CEEB`      | 0.15        | 1             | -1 C          | 0.10      | 0.4        |
| Deep Water     | `#1E3A5F`      | 0.05        | 1             | -3 C          | 0.02      | 0.0        |

**Property definitions:**

- **Ground Color**: base hex color for vertex coloring / ground texture tint.
- **Vegetation Density**: fraction (0-1) of cells that can hold a plant at maximum capacity.
- **Max Vegetation Types**: how many distinct plant species can coexist in this biome.
- **Temperature Modifier**: added to the base temperature (see Weather System, Section 6). Units: degrees Celsius.
- **Fertility Rate**: multiplier on plant growth speed (0 = nothing grows, 1 = fastest possible).
- **Movement Speed Modifier**: multiplier on creature walking speed (1.0 = normal, 0.0 = impassable).

### 3.3 Biome Transition Smoothing

Hard boundaries between biomes look unnatural. At biome boundaries, properties are **linearly interpolated** over a 3-cell (3-meter) transition zone:

```
For a cell at position P near a biome boundary:
  1. Sample biome at P and at all 8 neighbors
  2. If any neighbor has a different biome, mark P as a transition cell
  3. Blend ground color, fertility, and vegetation density:
       blended_property = lerp(biome_A.property, biome_B.property, t)
     where t = distance_to_boundary / 3.0, clamped to [0, 1]
```

This prevents jarring visual seams and lets vegetation taper naturally at biome edges.

---

## 4. Vegetation System

### 4.1 Plant Types

Eight plant types provide food sources, environmental enrichment, and visual diversity:

| Type       | Biomes Found In                        | Max Height | Energy | Seed Radius | Growth Time  |
|------------|----------------------------------------|-----------|--------|-------------|-------------|
| Grass      | Grassland, Meadow, Alpine Meadow, Forest | 0.3 m    | 5      | 2 cells     | 1 game-day  |
| Flower     | Meadow, Grassland, Alpine Meadow       | 0.4 m     | 8      | 3 cells     | 2 game-days |
| Bush       | Forest, Scrubland, Rainforest          | 1.5 m     | 15     | 2 cells     | 4 game-days |
| SmallTree  | Forest, Rainforest, Swamp              | 4.0 m     | 30     | 4 cells     | 8 game-days |
| LargeTree  | Forest, Rainforest                     | 10.0 m    | 60     | 5 cells     | 16 game-days|
| Mushroom   | Forest, Swamp, Marsh                   | 0.2 m     | 12     | 1 cell      | 1 game-day  |
| Fruit      | Forest, Rainforest, Meadow             | 0.1 m     | 25     | 3 cells     | 3 game-days |
| Seaweed    | Shallow Water, Deep Water              | 0.5 m     | 10     | 2 cells     | 2 game-days |

### 4.2 Plant Data Structure

```javascript
class Plant {
    position: { x: number, z: number }; // grid coordinates (0-511)
    type: PlantType;                     // enum: Grass, Flower, Bush, ...
    growthStage: GrowthStage;            // seed → sprout → mature → flowering → seeding → dead
    energyContent: number;               // food value for creatures (depletes when eaten)
    age: number;                         // in game-ticks
    maxAge: number;                      // determined by type
    growthProgress: number;              // 0.0 → 1.0 within current stage
}
```

### 4.3 Growth Stages

Every plant progresses through six lifecycle stages:

```
  seed ──→ sprout ──→ mature ──→ flowering ──→ seeding ──→ dead
  (10%)    (20%)      (30%)      (20%)         (15%)       (5%)

  Percentages indicate fraction of total growth time spent in each stage.
```

**Stage details:**

| Stage     | Duration (% of growth time) | Visual                        | Interactions                     |
|-----------|-----------------------------|-------------------------------|----------------------------------|
| Seed      | 10%                         | Not visible                   | Cannot be eaten                  |
| Sprout    | 20%                         | Small green nub               | Can be eaten (25% energy)        |
| Mature    | 30%                         | Full-size plant model         | Can be eaten (100% energy)       |
| Flowering | 20%                         | Model + colored flower parts  | Can be eaten; attracts creatures |
| Seeding   | 15%                         | Model + visible seed pods     | Disperses seeds to nearby cells  |
| Dead      | 5%                          | Brown/wilted model            | Decomposes; adds fertility       |

### 4.4 Growth Rules

Growth rate for a plant at position `(x, z)` on a given tick:

```
growth_rate = BASE_RATE
            × biome.fertility
            × moisture_factor(moisture[x][z])
            × temperature_factor(current_temp)
            × season_factor(current_season)
            × daylight_factor(time_of_day)

where:
  moisture_factor(m)    = clamp(m * 2, 0, 1)           // 0 at m=0, 1 at m≥0.5
  temperature_factor(t) = 1 - abs(t - 20) / 30         // optimal at 20°C, zero at -10 or 50
                          clamped to [0, 1]
  season_factor:
    spring  = 1.5
    summer  = 1.0
    autumn  = 0.6
    winter  = 0.1
  daylight_factor:
    day (0.1 - 0.5)   = 1.0
    dawn (0.0 - 0.1)  = 0.5
    dusk (0.5 - 0.6)  = 0.5
    night (0.6 - 1.0) = 0.0    // growth paused at night

  BASE_RATE = 1.0 / (plant.type.growthTime * TICKS_PER_GAME_DAY)
```

### 4.5 Seed Dispersal

When a plant enters the **seeding** stage, it attempts to place seeds in nearby cells:

```
Dispersal algorithm:
  1. For each tick in the seeding stage:
       chance_to_spawn = 0.1 per tick (10% chance each tick)
  2. If spawn triggered:
       angle = random(0, 2π)
       distance = random(1, plant.type.seedRadius)
       target_x = plant.x + round(cos(angle) * distance)
       target_z = plant.z + round(sin(angle) * distance)
  3. Wind modifier:
       target_x += wind.direction.x * wind.speed * 0.5
       target_z += wind.direction.z * wind.speed * 0.5
  4. Validation:
       - target cell must be within world bounds
       - target cell biome must support this plant type
       - target cell plant count < biome.vegetationDensity * MAX_PLANTS_PER_CELL
  5. If valid: create new Plant at target with stage = seed
```

**Max plant density per cell** is determined by the biome:

```
max_plants_in_cell = floor(biome.vegetationDensity * MAX_PLANTS_PER_CELL)

MAX_PLANTS_PER_CELL = 4   (global constant: at most 4 plants per 1m² cell)
```

### 4.6 Seasonal Effects on Vegetation

```
┌────────────────────────────────────────────────────────────┐
│  Spring        Summer        Autumn         Winter         │
│  ┌──────┐     ┌──────┐     ┌──────┐      ┌──────┐        │
│  │ Fast │     │Flower│     │Seed &│      │Dorma-│        │
│  │growth│────→│& fruit────→│color │─────→│ncy / │────→ … │
│  │ ×1.5 │     │ ×1.0 │     │change│      │die   │        │
│  │      │     │      │     │ ×0.6 │      │ ×0.1 │        │
│  └──────┘     └──────┘     └──────┘      └──────┘        │
│                                                            │
│  New sprouts   Flowering     Leaves turn    Some plants    │
│  emerge        peaks         brown/orange   die; perennials│
│  rapidly       Fruit ready   Seeds drop     go dormant     │
└────────────────────────────────────────────────────────────┘
```

- **Spring**: growth rate multiplier 1.5x. Dormant plants resume growth. New seeds sprout rapidly.
- **Summer**: growth rate 1.0x. Flowering and fruiting peak. Maximum food availability.
- **Autumn**: growth rate 0.6x. Mature plants enter seeding stage faster. Visual color shift to brown/orange for deciduous types.
- **Winter**: growth rate 0.1x. Annual plants (Grass, Flower) die. Perennials (Trees, Bushes) enter dormancy (growth paused, no energy expenditure). Mushrooms unaffected (constant slow growth).

### 4.7 Creature Interaction with Plants

When a creature eats a plant:

```
1. Creature receives plant.energyContent (modified by growth stage)
2. Plant energy is depleted:
     - If plant type has roots (Bush, SmallTree, LargeTree):
         plant.energyContent = 0
         plant.growthStage = sprout   // regrows from roots
         plant.growthProgress = 0
     - If plant type has no roots (Grass, Flower, Mushroom, Fruit, Seaweed):
         plant.growthStage = dead     // dies, will decompose
3. Eaten plants leave a "stump" visual for one growth cycle before removal
```

### 4.8 Rendering

```
Vegetation rendering strategy:
  - Each plant type has one instanced mesh (InstancedMesh in Three.js)
  - Instance count = number of active plants of that type in loaded chunks
  - Instance matrix encodes: position, scale (from growth stage), rotation (random Y)
  - Distant plants (>80m from camera): replaced with billboards (textured quads
    always facing camera) for performance
  - Billboard threshold: LOD switch at 80 meters
  - Update frequency: instance buffers rebuilt when chunk activates or plant
    state changes (not every frame)
```

---

## 5. Day/Night Cycle

### 5.1 Timing

```
Real-time to game-time mapping:
  10 minutes real-time = 1 game-day
  600 seconds real     = 24 game-hours
  25 seconds real      = 1 game-hour
  1 second real        = 0.04 game-hours = 2.4 game-minutes

Tick rate: 60 ticks/second (tied to requestAnimationFrame)
  → 36,000 ticks per game-day
  → 1 tick = 2.4 game-seconds
```

The day cycle is represented as a normalized value `t` in `[0.0, 1.0)`:

```
t = (elapsedRealTimeMs % 600000) / 600000

  t = 0.00  →  midnight (start of new day)
  t = 0.25  →  6:00 AM (sunrise)
  t = 0.50  →  noon
  t = 0.75  →  6:00 PM (sunset)
```

### 5.2 Lighting Phases

Four lighting phases govern ambient color, light intensity, and sky color:

| Phase  | t Range     | Game Time        | Ambient Color       | Light Intensity | Sky Color           |
|--------|-------------|------------------|---------------------|-----------------|---------------------|
| Dawn   | 0.00 - 0.10 | 00:00 - 02:24   | `#FF8C42` (orange)  | 0.0 → 0.8      | `#1B1B3A` → `#87CEEB` |
| Day    | 0.10 - 0.50 | 02:24 - 12:00   | `#FFFFFF` (white)   | 0.8 → 1.0 → 0.8 | `#87CEEB` (sky blue) |
| Dusk   | 0.50 - 0.60 | 12:00 - 14:24   | `#FF6347` (red-orange)| 0.8 → 0.1    | `#87CEEB` → `#2C1654` |
| Night  | 0.60 - 1.00 | 14:24 - 24:00   | `#1A1A40` (dark blue)| 0.1 (moonlight)| `#0B0B2A` (dark)    |

> **Note:** Because we compress 24 game-hours into these ranges, dawn and dusk are brief transitions, while day and night are longer sustained periods.

### 5.3 Sun Position

The sun follows a semicircular arc across the sky from east to west:

```
sun_angle = π * sun_t    // 0 at dawn horizon, π at dusk horizon

where sun_t = remap(t, 0.0..0.6, 0.0..1.0)  // sun visible from t=0.0 to t=0.6
      (sun below horizon for t > 0.6)

sun_position:
  x = cos(sun_angle) * SUN_DISTANCE        // east-west
  y = sin(sun_angle) * SUN_DISTANCE         // height
  z = 0                                     // fixed on the east-west plane

SUN_DISTANCE = 200  (far enough to approximate directional light)
```

```
                        y
                        ↑   ☀ (noon, t=0.30)
                        │  / \
                        │ /   \
                        │/     \
         ───────────────┼───────────────→ x
       East (dawn)      │0       West (dusk)
       t = 0.00         │        t = 0.60
                        │
                    (ground)
```

### 5.4 Three.js Implementation

```javascript
// Sun light setup
const sunLight = new THREE.DirectionalLight(0xffffff, 1.0);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.near = 0.5;
sunLight.shadow.camera.far = 500;
scene.add(sunLight);

// Ambient light (tinted by phase)
const ambientLight = new THREE.AmbientLight(0x404040, 0.3);
scene.add(ambientLight);

// Moon light (active at night)
const moonLight = new THREE.DirectionalLight(0x4444AA, 0.1);
moonLight.position.set(-100, 80, 50);
scene.add(moonLight);

function updateDayNightCycle(t) {
    // Sun position
    if (t < 0.6) {
        const sunT = t / 0.6;
        const angle = Math.PI * sunT;
        sunLight.position.set(
            Math.cos(angle) * 200,
            Math.sin(angle) * 200,
            0
        );
        sunLight.visible = true;
    } else {
        sunLight.visible = false;
    }

    // Phase-based lighting
    if (t < 0.10) {                          // Dawn
        const p = t / 0.10;
        ambientLight.color.lerpColors(NIGHT_COLOR, DAWN_COLOR, p);
        ambientLight.intensity = lerp(0.1, 0.5, p);
        sunLight.intensity = lerp(0.0, 0.8, p);
    } else if (t < 0.50) {                   // Day
        const p = (t - 0.10) / 0.40;
        ambientLight.color.set(DAY_COLOR);
        ambientLight.intensity = 0.5;
        // Sun peaks at midpoint (t=0.30), intensity bell curve
        sunLight.intensity = 0.8 + 0.2 * Math.sin(p * Math.PI);
    } else if (t < 0.60) {                   // Dusk
        const p = (t - 0.50) / 0.10;
        ambientLight.color.lerpColors(DUSK_COLOR, NIGHT_COLOR, p);
        ambientLight.intensity = lerp(0.5, 0.1, p);
        sunLight.intensity = lerp(0.8, 0.0, p);
    } else {                                  // Night
        ambientLight.color.set(NIGHT_COLOR);
        ambientLight.intensity = 0.1;
        moonLight.visible = true;
    }

    // Sky color (applied to scene background or sky shader)
    scene.background = computeSkyColor(t);
}
```

### 5.5 Gameplay Effects

| System      | Day Effect                          | Night Effect                           |
|-------------|-------------------------------------|----------------------------------------|
| Creatures   | Active, foraging                    | Sleep drive increases (see CREATURES.md) |
| Plants      | Photosynthesis (growth active)      | Growth paused                          |
| Temperature | Base + biome modifier               | Base + biome modifier - 8°C            |
| Visibility  | Full render distance                | Reduced creature perception range (50%) |

---

## 6. Weather System

### 6.1 Temperature Model

Temperature at any point in the world is computed from multiple layered factors:

```
temperature(x, z, t) = BASE_TEMP
                      + biome_modifier(x, z)
                      + seasonal_modifier(current_season)
                      + diurnal_modifier(t)
                      + random_fluctuation()

BASE_TEMP = 18°C  (comfortable default)
```

**Seasonal temperature modifiers:**

| Season | Modifier |
|--------|----------|
| Spring | +2°C     |
| Summer | +8°C     |
| Autumn | +0°C     |
| Winter | -10°C    |

**Diurnal (day/night) modifier:**

```
diurnal_modifier(t):
  if t in [0.10, 0.50]:   // Day
      return +4°C × sin((t - 0.10) / 0.40 × π)   // peaks at noon
  if t in [0.60, 1.00]:   // Night
      return -8°C
  // Dawn/Dusk: linear interpolation between night and day values
```

**Random fluctuation:** Gaussian noise with mean 0, standard deviation 1.5°C, sampled once per game-hour and interpolated smoothly.

**Example temperature calculation:**

```
Location: Forest biome (modifier -1°C)
Season:   Summer (+8°C)
Time:     Noon (diurnal +4°C)
Fluctuation: +0.7°C

Temperature = 18 + (-1) + 8 + 4 + 0.7 = 29.7°C
```

### 6.2 Seasons

Seasons cycle in a fixed pattern. One full year = 16 game-days = 160 real-time minutes.

```
Season length: 4 game-days each (40 real-time minutes)

Game-day:  0  1  2  3 │ 4  5  6  7 │ 8  9  10 11 │ 12 13 14 15 │ 16 ...
Season:    ── Spring ──│── Summer ──│── Autumn  ──│── Winter  ──│── Spring ──
```

```javascript
function getCurrentSeason(gameDay) {
    const dayInYear = gameDay % 16;
    if (dayInYear < 4)  return "spring";
    if (dayInYear < 8)  return "summer";
    if (dayInYear < 12) return "autumn";
    return "winter";
}
```

### 6.3 Rain System

Rain events are probabilistic and localized by biome moisture:

**Rain probability (checked once per game-hour):**

```
rain_chance = biome.moisture × 0.3 + seasonal_rain_modifier

seasonal_rain_modifier:
  spring = +0.15
  summer = +0.05
  autumn = +0.10
  winter = +0.00

Example: Rainforest (moisture ~0.8) in spring:
  rain_chance = 0.8 × 0.3 + 0.15 = 0.39  → 39% chance per game-hour
```

**Rain event properties:**

| Property   | Range           | Description                                |
|------------|-----------------|--------------------------------------------|
| Duration   | 0.5 - 2.0 hrs  | Game-hours (12.5 - 50 real seconds)        |
| Intensity  | 0.1 - 1.0      | Affects moisture increase and visual density|
| Coverage   | 3x3 chunks      | Rain covers a 96×96 meter area             |

**Rain effects per tick during a rain event:**

```
For each cell in rain coverage:
  moisture[x][z] += 0.001 × intensity     // moisture gradually increases
  moisture[x][z] = min(moisture[x][z], 1.0)

Plant growth bonus during rain:
  growth_rate *= (1.0 + 0.5 × intensity)  // up to 50% faster growth
```

**Rain visual:**

```javascript
// Particle system for rain
const rainGeometry = new THREE.BufferGeometry();
const rainCount = 5000 * intensity;  // scale particle count with intensity
const rainPositions = new Float32Array(rainCount * 3);

// Initialize random positions in a box above the camera
for (let i = 0; i < rainCount; i++) {
    rainPositions[i * 3]     = (Math.random() - 0.5) * 96;  // x: coverage area
    rainPositions[i * 3 + 1] = Math.random() * 30;           // y: fall height
    rainPositions[i * 3 + 2] = (Math.random() - 0.5) * 96;  // z: coverage area
}

rainGeometry.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));
const rainMaterial = new THREE.PointsMaterial({
    color: 0xAAAACC,
    size: 0.1,
    transparent: true,
    opacity: 0.6
});
const rain = new THREE.Points(rainGeometry, rainMaterial);

// Per-frame update: move particles down, reset when below ground
function updateRain(deltaTime) {
    const positions = rain.geometry.attributes.position.array;
    for (let i = 0; i < positions.length; i += 3) {
        positions[i + 1] -= 20 * deltaTime;  // fall speed: 20 m/s
        if (positions[i + 1] < 0) {
            positions[i + 1] = 30;            // reset to top
        }
    }
    rain.geometry.attributes.position.needsUpdate = true;
}
```

### 6.4 Wind

Wind is a global vector that shifts slowly over time:

```
wind = {
    direction: { x: number, z: number },   // unit vector
    speed: number                           // 0..10 m/s
}

Update per game-hour:
  wind.direction rotates by random(-30°, +30°)
  wind.speed += random(-1, +1), clamped to [0, 10]

Seasonal wind speed bias:
  spring: +1 m/s average
  summer: +0 m/s
  autumn: +2 m/s
  winter: +3 m/s
```

**Wind effects:**

- **Seed dispersal**: seeds shift downwind during spreading (see Section 4.5).
- **Creature movement**: creatures moving against the wind lose 5% speed per m/s of wind. Moving with the wind: no bonus (they are not sailboats).
- **Rain angle**: rain particle fall angle tilted by wind direction (visual only).

### 6.5 Weather State Object

```javascript
const weatherState = {
    temperature: 18.0,           // current global base temperature (°C)
    season: "spring",            // current season string
    seasonDay: 0,                // day within current season (0-3)
    gameDay: 0,                  // total game-days elapsed
    wind: {
        direction: { x: 0.7, z: 0.3 },
        speed: 2.5
    },
    rain: {
        active: false,
        intensity: 0.0,
        remainingDuration: 0.0,  // game-hours remaining
        center: { x: 256, z: 256 }
    },
    fluctuation: 0.0             // current random temperature fluctuation
};
```

---

## 7. Water Bodies

### 7.1 Ponds and Lakes

Any contiguous region of terrain cells with elevation below sea level (< 0 m) is classified as a **pond** (< 50 cells) or **lake** (>= 50 cells). These regions are automatically filled with water.

```
Identification algorithm:
  1. Flood-fill from every cell where elevation < 0
  2. Group connected cells into water bodies
  3. Classify:  area < 50 cells → pond,  area >= 50 cells → lake
  4. Store each water body as a list of cell coordinates + bounding box
```

### 7.2 Water Surface Rendering

A transparent blue plane is placed at `y = 0` over each water body's bounding box. An animated wave shader creates the illusion of moving water.

```javascript
// Water surface material
const waterMaterial = new THREE.ShaderMaterial({
    uniforms: {
        uTime:      { value: 0.0 },
        uColor:     { value: new THREE.Color(0x1E90FF) },
        uOpacity:   { value: 0.6 },
        uWaveScale: { value: 0.3 },
        uWaveSpeed: { value: 1.5 }
    },
    vertexShader: `
        uniform float uTime;
        uniform float uWaveScale;
        uniform float uWaveSpeed;
        varying vec2 vUv;

        void main() {
            vUv = uv;
            vec3 pos = position;
            // Two overlapping sine waves for natural motion
            pos.y += sin(pos.x * 2.0 + uTime * uWaveSpeed) * uWaveScale * 0.5;
            pos.y += sin(pos.z * 3.0 + uTime * uWaveSpeed * 0.7) * uWaveScale * 0.3;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
    `,
    fragmentShader: `
        uniform vec3 uColor;
        uniform float uOpacity;
        varying vec2 vUv;

        void main() {
            // Slight color variation based on UV for depth illusion
            vec3 color = uColor * (0.8 + 0.2 * sin(vUv.x * 10.0 + vUv.y * 10.0));
            gl_FragColor = vec4(color, uOpacity);
        }
    `,
    transparent: true,
    side: THREE.DoubleSide
});
```

### 7.3 Rivers

Rivers are generated by tracing **gradient descent** paths from high-elevation points down to the nearest water body or world edge.

**River generation algorithm:**

```
RIVER_COUNT = 4 (number of rivers to attempt)

For each river attempt:
  1. Pick a random cell with elevation > 15m (high ground)
  2. Start a path at that cell
  3. Repeat until reaching elevation < 0 or world edge:
       a. Examine all 8 neighbors of the current cell
       b. Move to the neighbor with the lowest elevation
       c. If no neighbor is lower (local minimum), terminate the river
       d. Add current cell to the river path
  4. Discard rivers shorter than 20 cells (too short to be visible)
  5. Store the river as an ordered list of (x, z) cells
```

```
River path example (top-down view of heightmap):

    Peak (25m)
       ↓
    22 → 19 → 17 → 14
                      ↓
              11 ← 12 ← 13
               ↓
              8 → 5 → 3 → 1 → -2 (reaches lake)
```

**River properties:**

| Property       | Value / Range    | Description                                    |
|----------------|------------------|------------------------------------------------|
| Width          | 2 - 5 meters     | Wider at lower elevations                      |
| Current speed  | 0.5 - 3.0 m/s   | Proportional to elevation gradient              |
| Depth          | 0.3 - 1.5 m     | Shallow at source, deeper downstream            |

**Width formula:**

```
river_width(cell) = lerp(2, 5, 1 - elevation(cell) / max_river_elevation)

  At the source (high elevation): width ≈ 2m
  At the mouth (sea level):       width ≈ 5m
```

**Current (flow) vector:**

```
flow_direction(cell) = normalize(next_cell.position - cell.position)
flow_speed(cell)     = clamp(elevation_drop_to_next * 2.0, 0.5, 3.0)
```

**River rendering:** Rivers are rendered as a ribbon mesh (a strip of triangles following the path), with the same wave shader as lakes but with an additional UV scroll in the flow direction to create the appearance of flowing water.

### 7.4 Water Interaction with Creatures

```
Creature water interactions:
  - Drinking: creature at a water-adjacent cell can drink.
      Thirst drive reduced by 50 per drink action.
      Cooldown: 1 game-minute between drinks.

  - Wading: creatures can enter cells with water depth ≤ 0.5m (shallow water).
      Movement speed penalty: 60% of normal (moveSpeed × 0.4).
      Creatures get "wet" status (affects temperature: +2°C cooling).

  - Deep water: cells with elevation < -1.5m are impassable.
      Creatures treat deep water cells as walls in pathfinding.
      If pushed into deep water (edge case), creature is teleported to
      nearest shallow cell and takes 10 damage.

  - Rivers: creatures can cross rivers at shallow points (width < 3m).
      Current pushes creature downstream by flow_speed × 0.3 per tick.
```

---

## 8. Chunk-Based Loading

### 8.1 Chunk Grid

The 512x512 world is divided into a **16x16 grid** of **32x32-meter chunks**:

```
World layout (16×16 chunks):

  ┌────┬────┬────┬────┬────┬────┐
  │0,0 │1,0 │2,0 │... │    │15,0│
  ├────┼────┼────┼────┼────┼────┤
  │0,1 │1,1 │2,1 │    │    │    │
  ├────┼────┼────┼────┼────┼────┤
  │    │    │    │    │    │    │
  ├────┼────┼────┼────┼────┼────┤
  │... │    │    │    │    │... │
  ├────┼────┼────┼────┼────┼────┤
  │0,15│    │    │    │    │15,15│
  └────┴────┴────┴────┴────┴────┘

  Each cell = 32×32 meters
  Total: 16 × 16 = 256 chunks
  Active at any time: ~π × 5² ≈ 78 chunks (within radius 5)
```

### 8.2 Active Radius and Chunk States

The **active radius** is **5 chunks** (160 meters) centered on the camera position. Only chunks within this radius are fully loaded and simulated.

**Chunk state machine:**

```
  unloaded ──→ loading ──→ active ──→ inactive ──→ unloaded
     │                        ↑           │
     │                        └───────────┘
     │            (camera moves back into range)
     │
     └──── (chunk enters active radius) ────→ loading
```

| State    | Terrain Mesh | Vegetation Sim | Entities | Memory        |
|----------|-------------|----------------|----------|---------------|
| Unloaded | No          | No             | No       | None          |
| Loading  | Generating  | Initializing   | Spawning | Allocating    |
| Active   | Yes (full)  | Yes (ticking)  | Yes      | Full          |
| Inactive | Yes (LOD)   | No (paused)    | Sleeping | Reduced       |

### 8.3 Chunk Data Structure

```javascript
class Chunk {
    cx: number;                    // chunk grid X (0-15)
    cz: number;                    // chunk grid Z (0-15)
    state: ChunkState;             // unloaded | loading | active | inactive

    // Terrain
    terrainMesh: THREE.Mesh;       // 32×32 subdivided plane with displaced vertices
    heightmapSlice: Float32Array;  // 32×32 = 1024 floats (view into global heightmap)
    moistureSlice: Float32Array;   // 32×32 = 1024 floats (view into global moisture map)
    biomeGrid: Uint8Array;         // 32×32 = 1024 biome IDs

    // Vegetation
    plants: Plant[];               // active plants in this chunk
    plantDirty: boolean;           // if true, rebuild instance buffers

    // Entities
    creatures: Creature[];         // creatures currently in this chunk
    items: Item[];                 // dropped items, objects

    // LOD
    lodLevel: number;              // 0 = full, 1 = half, 2 = quarter resolution
    lodMesh: THREE.Mesh | null;    // simplified mesh for distant rendering
}
```

### 8.4 LOD (Level of Detail)

Chunks at different distances from the camera use different mesh resolutions:

| Distance (chunks) | LOD Level | Vertices per Chunk | Triangles |
|--------------------|-----------|-------------------|-----------|
| 0 - 2             | 0 (full)  | 33×33 = 1,089     | 2,048     |
| 3 - 4             | 1 (half)  | 17×17 = 289       | 512       |
| 5                  | 2 (quarter)| 9×9 = 81         | 128       |

```
LOD visualization (side view — mesh density):

  LOD 0 (near)        LOD 1 (mid)         LOD 2 (far)
  ╱╲╱╲╱╲╱╲╱╲         ╱╲  ╱╲  ╱╲          ╱╲    ╱╲
 ╱  ╲╱  ╲╱  ╲       ╱  ╲╱  ╲╱  ╲        ╱  ╲  ╱  ╲
  Full detail         Half detail         Quarter detail
```

### 8.5 Async Chunk Loading

Chunk generation is performed asynchronously to avoid frame drops:

```
Loading pipeline (per chunk):
  Frame 1:  Generate heightmap slice (< 1ms)
  Frame 2:  Compute biome grid (< 1ms)
  Frame 3:  Build terrain mesh geometry (< 2ms)
  Frame 4:  Place initial vegetation (< 1ms)
  Frame 5:  Compile materials, add to scene
  ─────────────────────────────────────────
  Total: ~5ms spread over 5 frames (~83ms wall-clock at 60fps)

  Maximum chunks loading simultaneously: 3
  → Worst case loading impact: 3 × 1ms = 3ms per frame
```

```javascript
class ChunkLoader {
    loadQueue: ChunkCoord[] = [];
    activeLoads: number = 0;
    MAX_CONCURRENT = 3;

    update() {
        while (this.activeLoads < this.MAX_CONCURRENT && this.loadQueue.length > 0) {
            const coord = this.loadQueue.shift();
            this.activeLoads++;
            this.loadChunkAsync(coord).then(() => {
                this.activeLoads--;
            });
        }
    }

    async loadChunkAsync(coord: ChunkCoord): Promise<void> {
        const chunk = new Chunk(coord.cx, coord.cz);

        // Step 1: heightmap slice (yield to main thread between steps)
        chunk.heightmapSlice = this.sliceHeightmap(coord);
        await yieldToMainThread();

        // Step 2: biome classification
        chunk.biomeGrid = this.classifyBiomes(chunk.heightmapSlice, chunk.moistureSlice);
        await yieldToMainThread();

        // Step 3: mesh generation
        chunk.terrainMesh = this.buildMesh(chunk.heightmapSlice, chunk.biomeGrid);
        await yieldToMainThread();

        // Step 4: vegetation placement
        chunk.plants = this.placeInitialVegetation(chunk.biomeGrid, chunk.moistureSlice);
        await yieldToMainThread();

        // Step 5: add to scene
        chunk.state = ChunkState.Active;
        scene.add(chunk.terrainMesh);
    }
}

function yieldToMainThread(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 0));
}
```

### 8.6 Vegetation in Inactive Chunks

When a chunk transitions from **active** to **inactive**, vegetation simulation pauses:

- Plants freeze at their current growth stage and progress.
- No seeds are dispersed from or into inactive chunks.
- When re-activated, "catch-up" growth is applied based on elapsed time:

```
catch_up_growth(plant, elapsed_ticks):
  // Simplified: apply average growth rate × elapsed time
  avg_rate = BASE_RATE × biome.fertility × season_factor(current_season) × 0.5
  plant.growthProgress += avg_rate × elapsed_ticks
  // Advance through stages as needed
  while plant.growthProgress >= 1.0:
      advanceStage(plant)
      plant.growthProgress -= 1.0
```

---

## 9. World Interaction

### 9.1 Creature Sensory Inputs from World

Creatures perceive the world through a set of **sensory channels** that map world state to creature neural inputs (see CREATURES.md for the neural architecture):

| Sense           | Source                        | Range          | Neural Input        |
|-----------------|-------------------------------|----------------|---------------------|
| Terrain type    | Biome at creature position    | Current cell   | Categorical (0-14)  |
| Elevation       | Heightmap at position         | Current cell   | Float (-10..30)     |
| Temperature     | Weather + biome at position   | Current cell   | Float (-20..50)     |
| Nearby plants   | Vegetation grid scan          | 5-cell radius  | Count + nearest direction |
| Nearby creatures| Entity spatial index          | 10-cell radius | Count + nearest direction |
| Water proximity | Distance to nearest water cell| 8-cell radius  | Float (0..8)        |
| Slope           | Heightmap gradient at position| Current cell   | Float (0..1)        |
| Light level     | Day/night cycle `t` value     | Global         | Float (0..1)        |
| Wetness         | Rain + water state            | Current cell   | Boolean             |

### 9.2 Creature Effects on World

Creatures are not passive observers — they modify the world through their actions:

```
┌─────────────────┐     ┌──────────────────────────────────────┐
│    Creature      │     │            World Effect              │
│    Action        │────→│                                      │
├─────────────────┤     ├──────────────────────────────────────┤
│ Eat plant        │────→│ Plant energy reduced or plant killed │
│ Walk on cell     │────→│ Grass trampled (growth reset 10%)   │
│ Deposit waste    │────→│ Cell fertility +0.05 (temporary)    │
│ Die on cell      │────→│ Cell fertility +0.20 (nutrients)    │
│ Drink water      │────→│ Local water level -0.001 (cosmetic) │
└─────────────────┘     └──────────────────────────────────────┘
```

**Trampling**: when a creature walks through a cell containing Grass, there is a 20% chance per step that the grass is trampled (growth progress reset to 10% of current). This prevents creatures from walking through dense grass without impact.

**Waste as fertilizer**: creature waste deposits boost the fertility of a cell by +0.05 (additive, capped at 1.0). This bonus decays by 0.005 per game-hour back to the base biome fertility. This creates a feedback loop: creatures that frequent an area inadvertently improve its plant growth.

### 9.3 Terrain Modification

Terrain modification (digging, building, erosion) is **not planned for the initial implementation**. The heightmap is static after generation. This simplification:

- Avoids complex mesh updates at runtime.
- Keeps chunk loading deterministic (any chunk can be regenerated from the seed alone).
- Reduces memory usage (no delta storage needed).

Future phases may introduce limited terrain modification (see ROADMAP.md, Phase 7+).

---

## 10. Implementation Notes

### 10.1 Memory Budget

| Data Structure        | Size Calculation                | Memory     |
|-----------------------|--------------------------------|------------|
| Heightmap             | Float32Array(512 × 512)        | 1.00 MB    |
| Moisture map          | Float32Array(512 × 512)        | 1.00 MB    |
| Biome grid            | Uint8Array(512 × 512)          | 0.25 MB    |
| Vegetation (sparse)   | ~10,000 plants × 64 bytes each | 0.63 MB    |
| Weather state         | Single object                  | < 1 KB     |
| Chunk metadata (256)  | 256 × ~200 bytes               | 0.05 MB    |
| Active chunk meshes (~78) | 78 × ~50 KB avg            | 3.80 MB    |
| **Total world state** |                                | **~6.7 MB** |

### 10.2 Per-Tick Performance Budget

Target: **60 fps** → **16.67 ms per frame** total, of which the world simulation must use no more than **3 ms**.

| System                 | Budget   | Notes                                          |
|------------------------|----------|------------------------------------------------|
| Weather update         | 0.1 ms   | Once per tick, single object                   |
| Vegetation growth      | 1.5 ms   | ~10K plants, but only active chunk plants tick |
| Day/night lighting     | 0.1 ms   | Uniform updates only                           |
| Chunk load/unload      | 1.0 ms   | Amortized over frames (async batches)          |
| Creature-world queries | 0.3 ms   | Spatial index lookups for ~50 creatures        |
| **Total**              | **3.0 ms** |                                               |

### 10.3 Chunk Mesh Generation Timing

```
Benchmark: chunk mesh generation (32×32, LOD 0)

  Heightmap slice extraction:   0.3 ms
  Biome classification:         0.2 ms
  Geometry construction:        2.0 ms
  Normal computation:           1.5 ms
  Material/color assignment:    0.5 ms
  Buffer upload to GPU:         0.5 ms
  ─────────────────────────────────────
  Total per chunk:             ~5.0 ms

  Spread across 5 frames:      ~1.0 ms per frame impact
```

### 10.4 Spatial Indexing

Creature-world and creature-creature queries use a **spatial hash grid** for O(1) average lookups:

```javascript
class SpatialHash {
    cellSize: number = 8;  // 8-meter cells → 64×64 hash grid
    grid: Map<number, Entity[]> = new Map();

    hash(x: number, z: number): number {
        const cx = Math.floor(x / this.cellSize);
        const cz = Math.floor(z / this.cellSize);
        return cx + cz * 64;
    }

    insert(entity: Entity): void { /* ... */ }
    remove(entity: Entity): void { /* ... */ }
    query(x: number, z: number, radius: number): Entity[] { /* ... */ }
}
```

### 10.5 Random Number Generation

All random operations use a **seeded PRNG** (xorshift128+ or similar) derived from the world seed. This ensures:

- Deterministic world generation (same seed = same world).
- Reproducible weather sequences for debugging.
- Each system (terrain, vegetation, weather) uses a separate PRNG stream derived from the base seed to avoid order-dependent coupling.

```javascript
function createPRNG(seed: number): () => number {
    // xorshift128+ implementation
    let s0 = seed;
    let s1 = seed ^ 0xDEADBEEF;

    return function(): number {
        let x = s0;
        const y = s1;
        s0 = y;
        x ^= x << 23;
        x ^= x >> 17;
        x ^= y;
        x ^= y >> 26;
        s1 = x;
        return (s0 + s1) >>> 0 / 0xFFFFFFFF;  // normalized to 0..1
    };
}

const terrainRNG = createPRNG(worldSeed);
const vegetationRNG = createPRNG(worldSeed + 1);
const weatherRNG = createPRNG(worldSeed + 2);
```

---

## 11. Cross-References

This document interfaces with the following design documents:

### ARCHITECTURE.md

- **System diagram**: the World module sits alongside the Creature module and Renderer module, communicating via an event bus.
- **Threading model**: world generation (heightmap, mesh building) is off-main-thread via async batching (see Section 8.5). Future optimization: Web Worker for chunk generation.
- **Update loop**: world systems (weather, vegetation, day/night) are updated in the main simulation tick, before creature updates and after input processing.

```
Main loop order (from ARCHITECTURE.md):
  1. Input processing
  2. World tick (weather, vegetation, day/night)  ← this document
  3. Creature tick (drives, brain, actions)        ← CREATURES.md
  4. Physics / collision resolution
  5. Render
```

### CREATURES.md

- **Creature-world interaction**: creatures sense terrain type, elevation, temperature, nearby plants, and water (Section 9.1 of this document maps to creature sensory input neurons).
- **Drives affected by world**: Hunger (food availability from vegetation), Thirst (water proximity), Coldness/Hotness (temperature from weather), Sleepiness (day/night cycle), Crowding (nearby creatures).
- **Actions that modify world**: eating, trampling, waste deposition (Section 9.2).
- **Movement**: creature speed modulated by biome move speed modifier and water/wind effects.

### BIOCHEMISTRY.md

- **Temperature → chemical effects**: the world's temperature value at a creature's position feeds into the creature's internal biochemistry simulation. Temperature outside the comfort range (15-25°C) triggers stress chemical production.
- **Specific pathways**:
  - Temperature < 10°C → Coldness chemical increases → triggers shivering behavior, seek warmth drive.
  - Temperature > 35°C → Hotness chemical increases → triggers panting, seek shade/water drive.
  - Temperature extremes (< -5°C or > 45°C) → damage chemical accumulation → health loss.
- **Nutrition**: plant energy content (Section 4) maps to creature glucose/starch intake values defined in BIOCHEMISTRY.md.

### ROADMAP.md

The world is built incrementally across multiple development phases:

| Phase | Milestone                        | World Features                                     |
|-------|----------------------------------|----------------------------------------------------|
| 1     | Flat World Prototype             | Flat green plane, no biomes, hardcoded food items   |
| 2     | Noise Terrain                    | Simplex heightmap, basic biome coloring, static mesh|
| 3     | Biomes & Vegetation              | Full biome matrix, plant types, growth simulation   |
| 4     | Day/Night Cycle                  | Sun arc, lighting phases, creature sleep behavior   |
| 5     | Chunk Loading                    | 32×32 chunks, LOD, async loading                    |
| 6     | Full Weather & Water             | Rain, wind, seasons, rivers, lakes, wave shader     |
| 7+    | (Future) Terrain Modification    | Erosion, creature digging, dynamic heightmap        |

---

*This document describes the world simulation layer of the Creatures clone. For the creature AI and neural architecture, see CREATURES.md. For the chemical simulation governing creature internal state, see BIOCHEMISTRY.md. For system architecture and module boundaries, see ARCHITECTURE.md.*
