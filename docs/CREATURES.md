# Creatures — Morphology & Visual System

## 1. Overview

Creatures have procedurally generated bodies derived entirely from their genome. No two
creatures look exactly alike. The rendering pipeline works as follows:

1. **Genome decode** — Morphology genes on Chromosome 8 are read to produce a body plan.
2. **Body plan** — A tree of typed segments (torso, head, limbs, tail) with per-segment
   dimensions, joint types, and joint limits.
3. **Skeleton construction** — The body plan tree is translated into a Three.js `Bone`
   hierarchy, producing a poseable armature.
4. **Mesh generation** — Each bone spawns one or more metaball primitives. The combined
   implicit surface field is polygonised via Marching Cubes into an indexed
   `BufferGeometry` (positions, normals, UVs).
5. **Skin shader** — A `MeshStandardMaterial` with custom shader injection applies
   genome-encoded base color, secondary color, and procedural pattern (spots, stripes,
   gradient, patches, speckle, or solid).
6. **Procedural animation** — FABRIK inverse kinematics drive the legs against the
   terrain. Head tracking, idle breathing, emotional expressions, eating, and death
   animations are layered on top. No hand-authored keyframes.
7. **LOD** — Four discrete levels of detail (full mesh, simplified mesh, very-simple
   mesh, billboard) are crossfaded based on camera distance to keep the frame budget
   under control.

The entire visual representation is deterministic given a genome: the same genome will
always produce the same creature appearance.

---

## 2. Body Plan from Genome

### 2.1 Morphology Genes

Morphology is encoded on **Chromosome 8** of the creature genome. Each gene on this
chromosome defines a single body segment. The gene locus order determines parse order;
segment parent references create the tree.

A single morphology gene contains the following fields:

| Field          | Type    | Range / Values                        | Notes                                   |
|----------------|---------|---------------------------------------|-----------------------------------------|
| segment_type   | enum    | torso, head, eye, arm, hand, leg,     | Determines mesh strategy and IK role    |
|                |         | foot, tail, tail_tip                  |                                         |
| parent_segment | uint8   | Index into segment list               | 0 = torso (root, self-referencing)      |
| length         | float32 | 0.1 – 2.0                            | World-space units along bone axis       |
| radius         | float32 | 0.05 – 0.5                           | Metaball base radius                    |
| joint_type     | enum    | hinge, ball, fixed                    | Constrains IK solver                    |
| joint_min      | float32 | -180° – 0°                           | Minimum joint deflection                |
| joint_max      | float32 | 0° – 180°                            | Maximum joint deflection                |
| color_hue      | float32 | 0 – 360                              | HSL hue for this segment                |
| color_sat      | float32 | 0.3 – 1.0                            | HSL saturation                          |
| color_lgt      | float32 | 0.2 – 0.8                            | HSL lightness                           |
| pattern_id     | uint8   | 0 – 5                                | Indexes into pattern table (see sec. 5) |

### 2.2 Body Tree Structure

The body plan is a rooted tree. The **torso** is always the root. A **head** is always
present, attached to the top of the torso. All other segments are optional and
genome-controlled.

**Variable limb counts:**

- **Legs:** 2, 4, or 6 (always in symmetrical left/right pairs). Encoded as 1–3 leg
  pair genes.
- **Arms:** 0, 1, or 2 (always in symmetrical pairs if present). Encoded as 0–1 arm
  pair genes.
- **Tail:** 0 or 1. Optionally followed by a tail_tip segment.

### 2.3 Body Plan Tree (ASCII)

```
Torso (always present, root segment)
├── Head (always present, attached to torso top)
│   ├── Left Eye
│   └── Right Eye
├── Arm L (optional, 0-2 arms)
│   └── Hand L
├── Arm R (optional)
│   └── Hand R
├── Leg 1 L (2-6 legs, symmetrical pairs)
│   └── Foot 1 L
├── Leg 1 R
│   └── Foot 1 R
├── Leg 2 L (if >= 4 legs)
│   └── Foot 2 L
├── Leg 2 R (if >= 4 legs)
│   └── Foot 2 R
├── Leg 3 L (if 6 legs)
│   └── Foot 3 L
├── Leg 3 R (if 6 legs)
│   └── Foot 3 R
└── Tail (optional, 0-1)
    └── Tail Tip (optional)
```

### 2.4 Symmetry

Arm and leg segments are defined once in the genome and mirrored. The mirror operation
negates the X component of the bone's local offset, producing a left/right pair from a
single gene. Color and radius are shared; joint limits are mirrored (min/max swap sign
on the lateral axis).

---

## 3. Skeleton Construction

### 3.1 Bone Hierarchy

The body plan tree maps 1-to-1 onto a Three.js `Bone` hierarchy:

```
THREE.Bone ("torso")                     ← root bone, positioned at world origin
├── THREE.Bone ("head")
│   ├── THREE.Bone ("eye_L")
│   └── THREE.Bone ("eye_R")
├── THREE.Bone ("arm_L_0")              ← optional
│   └── THREE.Bone ("hand_L_0")
├── THREE.Bone ("arm_R_0")              ← mirror
│   └── THREE.Bone ("hand_R_0")
├── THREE.Bone ("leg_L_0")
│   └── THREE.Bone ("foot_L_0")
├── THREE.Bone ("leg_R_0")
│   └── THREE.Bone ("foot_R_0")
├── THREE.Bone ("leg_L_1")              ← if >= 4 legs
│   └── THREE.Bone ("foot_L_1")
├── THREE.Bone ("leg_R_1")
│   └── THREE.Bone ("foot_R_1")
├── THREE.Bone ("leg_L_2")              ← if 6 legs
│   └── THREE.Bone ("foot_L_2")
├── THREE.Bone ("leg_R_2")
│   └── THREE.Bone ("foot_R_2")
└── THREE.Bone ("tail_0")               ← optional
    └── THREE.Bone ("tail_tip_0")       ← optional
```

### 3.2 Naming Convention

Bones follow a strict naming convention so that animation code can address them
generically:

```
<segment_type>                           torso, head
<segment_type>_<side>_<index>            arm_L_0, leg_R_1, foot_L_2
<segment_type>_<index>                   tail_0, tail_tip_0
```

- `<side>` is `L` or `R`.
- `<index>` is zero-based within its type (e.g., the second leg pair is index `1`).

### 3.3 Bone Properties

Each `Bone` stores the following data (some as `userData` metadata):

| Property         | Source               | Description                              |
|------------------|----------------------|------------------------------------------|
| `position`       | Computed from parent | Local offset along parent bone's axis    |
| `length`         | Gene `length`        | Bone length in world units (0.1 – 2.0)  |
| `jointType`      | Gene `joint_type`    | `hinge`, `ball`, or `fixed`              |
| `jointMin`       | Gene `joint_min`     | Minimum angular deflection (radians)     |
| `jointMax`       | Gene `joint_max`     | Maximum angular deflection (radians)     |
| `segmentRadius`  | Gene `radius`        | Metaball radius for this segment         |
| `segmentType`    | Gene `segment_type`  | Enum for mesh generation strategy        |

### 3.4 Rest Pose

The skeleton rest pose is the default configuration used for mesh binding:

- **Torso:** upright, Y-axis aligned.
- **Head:** centered above torso, looking forward (+Z).
- **Arms (if present):** hanging at sides, slight forward angle (~10°).
- **Legs:** splayed naturally outward (~15° from vertical) to ensure stable standing.
- **Tail (if present):** extending behind and slightly downward (~30° below horizontal).

### 3.5 Skinned Mesh Binding

A single `THREE.SkinnedMesh` is constructed and bound to the `Bone` hierarchy via a
`THREE.Skeleton`. Bone influences (skin weights) are computed per-vertex based on
proximity to the nearest bone at mesh generation time. Each vertex is influenced by at
most 4 bones (standard GPU skinning limit).

---

## 4. Mesh Generation — Metaball Implicit Surface

### 4.1 Metaball Field Function

The creature's body surface is defined as an implicit scalar field. Each bone contributes
one or more metaball primitives to this field. The field value at any point `p` in space
is:

```
f(p) = sum_i( r_i^2 / |p - c_i|^2 )
```

Where:

- `c_i` = center position of the i-th metaball (world space)
- `r_i` = influence radius of the i-th metaball
- `|p - c_i|^2` = squared Euclidean distance from `p` to `c_i`

The **isosurface** is the set of all points where `f(p) = 1.0` (threshold). Points
where `f(p) > 1.0` are inside the body; points where `f(p) < 1.0` are outside.

### 4.2 Metaball Placement per Segment Type

Each segment type maps to a specific metaball configuration:

```
Segment Type    Metaball Count    Placement Strategy
─────────────   ──────────────    ──────────────────────────────────────────
Torso           2-3               Overlapping along Y axis (oval/barrel shape)
                                  Center ball is largest, end balls are smaller
Head            1-2               Single large sphere, optional smaller chin ball
Eye             1 (tiny)          Small sphere offset from head surface
Arm / Leg       2                 One at joint, one at midpoint (tapered cylinder)
Hand / Foot     1                 Single sphere, slightly flattened
Tail            1                 Single sphere per tail segment
Tail Tip        1                 Small sphere at end of tail
```

**Torso example (3 metaballs):**

```
         ( o )          ← top ball:    center = torso_top,    r = radius * 0.8
        (  O  )         ← middle ball: center = torso_center, r = radius * 1.0
         ( o )          ← bottom ball: center = torso_bottom, r = radius * 0.8
```

**Limb example (2 metaballs):**

```
    (O)-----(o)          ← joint ball: r = radius * 1.0
     ^       ^              mid ball:  r = radius * 0.7 (taper toward extremity)
   joint   midpoint
```

### 4.3 Isosurface Extraction — Marching Cubes

The implicit field is sampled on a regular 3D grid and polygonised using the **Marching
Cubes** algorithm:

1. Compute a bounding box that encloses all metaballs (with padding = max radius).
2. Subdivide the bounding box into a regular voxel grid.
3. Evaluate `f(p)` at each grid vertex.
4. For each voxel, look up the Marching Cubes case (256 cases) based on which corners
   are above/below the threshold of `1.0`.
5. Interpolate edge intersection positions and emit triangles.
6. Compute vertex normals as the gradient of `f(p)` (analytic: normalized sum of
   `-2 * r_i^2 * (p - c_i) / |p - c_i|^4`).

**Grid resolution by LOD:**

| LOD Level | Grid Resolution | Approximate Voxel Count | Triangle Count (typical) |
|-----------|-----------------|-------------------------|--------------------------|
| 0 (High)  | 32 x 32 x 32  | 32,768                  | 2,000 – 6,000            |
| 1 (Medium) | 16 x 16 x 16 | 4,096                   | 500 – 1,500              |
| 2 (Low)   | 8 x 8 x 8      | 512                     | 100 – 400                |

### 4.4 Mesh Output

The Marching Cubes pass produces an indexed `THREE.BufferGeometry` with:

- `position` — `Float32Array`, 3 components per vertex
- `normal` — `Float32Array`, 3 components per vertex (from field gradient)
- `uv` — `Float32Array`, 2 components per vertex (see UV mapping below)
- `skinIndex` — `Uint8Array`, 4 components per vertex (bone indices)
- `skinWeight` — `Float32Array`, 4 components per vertex (bone weights, sum to 1.0)
- `index` — `Uint16Array` or `Uint32Array` (triangle indices)

### 4.5 UV Mapping

UV coordinates are computed per-vertex based on the segment type of the nearest bone:

- **Torso:** Planar projection from the body-space Y axis.
  - `u = (x - bbox.min.x) / bbox_width`
  - `v = (y - bbox.min.y) / bbox_height`
- **Limbs (arms, legs, tail):** Cylindrical projection along the bone axis.
  - `u = atan2(local_z, local_x) / (2 * PI)`
  - `v = distance_along_bone_axis / bone_length`
- **Head:** Spherical projection from head center.
  - `u = atan2(local_z, local_x) / (2 * PI)`
  - `v = acos(local_y / distance) / PI`

### 4.6 Mesh Caching

Mesh generation is **expensive** (~50ms) and must not run every frame. Meshes are
generated only at:

- **Birth** — initial mesh from genome.
- **Life stage transitions** — re-meshed at new scale with adjusted proportions (e.g.,
  baby's oversized head).

The resulting `BufferGeometry` is cached on the creature entity. Skinning (vertex
deformation by bone transforms) is handled entirely on the GPU each frame via
`SkinnedMesh` — no CPU-side mesh updates are needed for animation.

---

## 5. Skin Shader

### 5.1 Base Material

The creature's surface uses a `THREE.MeshStandardMaterial` with physically-based
rendering properties:

| Property   | Value | Rationale                               |
|------------|-------|-----------------------------------------|
| roughness  | 0.7   | Organic, slightly matte skin            |
| metalness  | 0.0   | Non-metallic biological surface         |
| side       | FrontSide | Standard opaque rendering           |

Custom coloring and patterns are injected via `material.onBeforeCompile`, which patches
the fragment shader with additional uniforms and logic.

### 5.2 Color from Genome

Two colors are extracted from the genome:

- **Base color:** `hsl(hue, saturation, lightness)` — the dominant body color.
  - Hue: 0 – 360
  - Saturation: 0.3 – 1.0
  - Lightness: 0.2 – 0.8
- **Secondary color:** `hsl(hue2, saturation2, lightness2)` — used by patterns.
  - Same ranges as base color.
  - Typically a contrasting or complementary hue.

A **belly color** is derived automatically:

```
belly_color = hsl(base_hue, base_saturation * 0.6, base_lightness * 1.3)
```

Clamped to valid HSL ranges. The belly color is blended in based on the vertex's
body-space Y coordinate (lower = more belly color).

### 5.3 Procedural Patterns

The genome's `pattern_id` field (0–5) selects one of six procedural pattern functions.
All patterns are computed in the fragment shader using the interpolated UV and
world-space position.

| ID | Name     | Algorithm                                                    |
|----|----------|--------------------------------------------------------------|
| 0  | Solid    | No pattern. Entire surface uses base color.                  |
| 1  | Spots    | 2D Voronoi noise in UV space. Cells below distance threshold |
|    |          | are colored with secondary color. Produces organic spots.    |
| 2  | Stripes  | Directional sine wave: `sin(dot(uv, direction) * frequency)`|
|    |          | thresholded to produce alternating bands of base/secondary.  |
| 3  | Gradient | Top-to-bottom linear interpolation from base color to        |
|    |          | secondary color, keyed on body-space Y.                      |
| 4  | Patches  | Low-frequency 2D Perlin noise, thresholded into large        |
|    |          | irregular blobs of secondary color.                          |
| 5  | Speckled | High-frequency 3D value noise. Small random dots of          |
|    |          | secondary color scattered across the surface.                |

### 5.4 Pattern Scale

The genome encodes a **pattern_scale** value (0.1 – 2.0) that multiplies the UV
coordinates before they are fed into the pattern function. Lower values produce larger
pattern features; higher values produce finer detail.

```glsl
// In fragment shader (injected via onBeforeCompile)
uniform vec3 u_baseColor;
uniform vec3 u_secondaryColor;
uniform vec3 u_bellyColor;
uniform int  u_patternId;
uniform float u_patternScale;

vec3 applyPattern(vec3 baseCol, vec3 secCol, vec2 uv, vec3 worldPos) {
    vec2 scaledUV = uv * u_patternScale;

    if (u_patternId == 0) {
        return baseCol;                               // Solid
    } else if (u_patternId == 1) {
        float v = voronoiNoise(scaledUV);             // Spots
        return mix(baseCol, secCol, step(0.3, v));
    } else if (u_patternId == 2) {
        float s = sin(dot(scaledUV, vec2(1.0, 0.5)) * 6.2832);  // Stripes
        return mix(baseCol, secCol, step(0.0, s));
    } else if (u_patternId == 3) {
        float t = clamp(worldPos.y * 0.5 + 0.5, 0.0, 1.0);     // Gradient
        return mix(secCol, baseCol, t);
    } else if (u_patternId == 4) {
        float n = perlinNoise2D(scaledUV * 2.0);     // Patches
        return mix(baseCol, secCol, step(0.4, n));
    } else if (u_patternId == 5) {
        float n = valueNoise3D(worldPos * 10.0);      // Speckled
        return mix(baseCol, secCol, step(0.7, n));
    }
    return baseCol;
}
```

### 5.5 Shader Injection

The pattern shader is injected into `MeshStandardMaterial` via `onBeforeCompile`:

```javascript
material.onBeforeCompile = (shader) => {
    // Add uniforms
    shader.uniforms.u_baseColor      = { value: baseColorVec3 };
    shader.uniforms.u_secondaryColor = { value: secondaryColorVec3 };
    shader.uniforms.u_bellyColor     = { value: bellyColorVec3 };
    shader.uniforms.u_patternId      = { value: patternId };
    shader.uniforms.u_patternScale   = { value: patternScale };

    // Inject into fragment shader
    shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `
        #include <color_fragment>
        // --- Creature skin pattern ---
        vec3 patternColor = applyPattern(
            u_baseColor, u_secondaryColor, vUv, vWorldPosition
        );
        // Belly blend based on body-space Y
        float bellyFactor = smoothstep(-0.5, 0.2, -vWorldPosition.y);
        diffuseColor.rgb = mix(patternColor, u_bellyColor, bellyFactor);
        `
    );

    // Prepend noise functions and uniform declarations
    shader.fragmentShader = noiseGLSL + shader.fragmentShader;
};
```

---

## 6. Procedural Animation

All creature animation is procedural. There are no pre-baked keyframe animations. The
animation system reads motor outputs from the brain (see BRAIN.md) and translates them
into bone transforms each frame.

### 6.1 Locomotion — IK Legs

#### 6.1.1 FABRIK Inverse Kinematics

Each leg is treated as a 2-bone IK chain: upper leg bone + lower leg bone (foot is the
end effector). The **FABRIK** (Forward And Backward Reaching Inverse Kinematics)
algorithm is used:

```
FABRIK(chain, target, iterations=3):
    for i in 1..iterations:
        // Forward pass: from end effector toward root
        chain[end].position = target
        for j = end-1 down to 0:
            direction = normalize(chain[j].position - chain[j+1].position)
            chain[j].position = chain[j+1].position + direction * bone_length[j]

        // Backward pass: from root toward end effector
        chain[0].position = root_position  // pin root
        for j = 1 to end:
            direction = normalize(chain[j].position - chain[j-1].position)
            chain[j].position = chain[j-1].position + direction * bone_length[j-1]

    apply_joint_constraints(chain)
```

Joint constraints (from genome) are enforced after each iteration by clamping bone
angles to their `jointMin`/`jointMax` limits.

#### 6.1.2 Foot Placement

Foot target positions are determined by raycasting downward from each leg's hip position
to the terrain surface (see WORLD.md for terrain height queries):

```
foot_target.xz = hip_position.xz + movement_direction * step_length
foot_target.y  = terrain_height(foot_target.xz)
```

#### 6.1.3 Gait Generation

Legs cycle through a step pattern based on sinusoidal phase offsets. The **gait phase**
`phi` is a continuously increasing value (0.0 – 1.0, wrapping) that advances
proportionally to movement speed.

**Gait patterns by leg count:**

```
Leg Count   Gait Name     Phase Offsets (per leg)
─────────   ──────────    ──────────────────────────────────────────────────
2 legs      Bipedal       L0 = 0.0,  R0 = 0.5
                          (alternating left-right)

4 legs      Trot          L0 = 0.0,  R0 = 0.5,  L1 = 0.5,  R1 = 0.0
                          (diagonal pairs move together)

6 legs      Tripod        L0 = 0.0,  R0 = 0.5,  L1 = 0.5,
                          R1 = 0.0,  L2 = 0.0,  R2 = 0.5
                          (alternating triplets: L0+R1+L2 vs R0+L1+R2)
```

For each leg, the step cycle is:

```
leg_phase = fract(phi + phase_offset)

if leg_phase < 0.5:
    // Stance phase: foot is on the ground, body moves over it
    foot_target = ground_contact_point
else:
    // Swing phase: foot lifts and moves forward
    swing_t = (leg_phase - 0.5) / 0.5
    foot_target.xz = lerp(old_contact, new_contact, swing_t)
    foot_target.y  = ground_height + step_height * sin(swing_t * PI)
```

**Step parameters:**

| Parameter    | Formula                          | Typical Value     |
|--------------|----------------------------------|-------------------|
| step_height  | 0.3 * leg_length                 | ~0.15 – 0.6 units |
| step_length  | proportional to speed            | speed * 0.5       |
| body_bob     | 0.05 * sin(phi * 2 * PI * legs) | Subtle vertical   |

#### 6.1.4 Body Bob

The torso root bone oscillates vertically in sync with the gait cycle to produce a
natural walking bob:

```
torso.position.y += 0.05 * sin(phi * 2.0 * PI * num_leg_pairs)
```

### 6.2 Head Tracking

The head bone rotates to face the creature's current **attention target** (food source,
another creature, player interaction point, etc.). The rotation is smoothly interpolated:

```
target_rotation = lookAt(head.worldPosition, attention_target)
head.quaternion = slerp(head.quaternion, target_rotation, 0.1)  // per frame
```

When no specific target exists, the head defaults to looking in the creature's movement
direction with slight random look-around offsets (see Idle Animation).

### 6.3 Idle Animation

When the creature is stationary, several subtle animations keep it feeling alive:

- **Breathing:** The torso bone's scale oscillates gently on the X and Z axes:
  ```
  breathe_t = sin(time * 1.5)  // ~1.5 Hz breathing rate
  torso.scale.x = 1.0 + 0.02 * breathe_t
  torso.scale.z = 1.0 + 0.02 * breathe_t
  torso.scale.y = 1.0 - 0.01 * breathe_t  // slight vertical compress on inhale
  ```

- **Weight shifting:** Slow lateral sway of the torso (~0.3 Hz):
  ```
  sway_t = sin(time * 0.3)
  torso.rotation.z = 0.02 * sway_t
  ```

- **Look-around:** Periodic random head rotations (every 2–5 seconds, duration ~1s):
  ```
  if time_since_last_look > random(2.0, 5.0):
      look_target = random_point_in_view_cone(45°, 3.0m)
      // head tracking will slerp toward this
  ```

### 6.4 Expressions

Emotional state (from the brain's drive system; see BRAIN.md) modulates posture:

| Emotion      | Expression                                                      |
|--------------|-----------------------------------------------------------------|
| Curiosity    | Head tilts sideways (~15°), ears perk (if modeled), leans fwd   |
| Fear         | Body crouches (torso drops, legs bend more), head tucks down    |
| Aggression   | Raised posture (torso extends upward), head thrust forward      |
| Sleepiness   | Relaxed droop — torso lowers, head dips, legs splay wider       |
| Happiness    | Slight bounce (increased body bob amplitude), upright head      |
| Pain/hunger  | Hunched torso, slower movement, occasional flinch               |

Expressions are blended additively on top of locomotion and idle animations. Blend
weights are driven by the normalized drive values (0.0 – 1.0) from the brain.

### 6.5 Eating Animation

When the creature eats:

1. Head bone rotates downward toward the food source (ground level).
2. If a jaw sub-bone is modeled, it opens (~20° rotation on hinge joint).
3. Head dips in a quick "pecking" motion (2–3 short dips over ~1 second).
4. On each dip, a small particle effect triggers (food crumbs).

### 6.6 Death Animation

When health reaches zero:

1. All IK targets are released (legs stop tracking terrain).
2. Bones go limp **sequentially** from extremities inward (feet → legs → arms → head →
   torso), each with a ~0.1s delay, producing a ragdoll-like cascading collapse.
3. Each bone rotates toward gravity (downward) with damped spring dynamics.
4. The creature settles on the ground plane.
5. After settling, a slow fade-out (opacity → 0 over ~3 seconds) removes the body.

---

## 7. LOD (Level of Detail) System

### 7.1 LOD Levels

| LOD Level    | Distance   | Mesh                     | Animation              | Shadows          |
|--------------|------------|--------------------------|------------------------|------------------|
| 0 (High)     | < 20m      | Full metaball mesh (32^3)| Full IK + expressions  | Cast + receive   |
| 1 (Medium)   | 20 – 50m   | Simplified mesh (16^3)   | IK legs only           | Cast only        |
| 2 (Low)      | 50 – 100m  | Very simple mesh (8^3)   | No IK, simple bob      | None             |
| 3 (Billboard) | > 100m    | Textured quad billboard  | None                   | None             |

### 7.2 LOD Selection

Each frame, for each creature:

```
distance = length(camera.position - creature.position)

if      distance < 20:   lod = 0
else if distance < 50:   lod = 1
else if distance < 100:  lod = 2
else:                     lod = 3
```

### 7.3 LOD Transitions

Transitions between LOD levels use a **smooth crossfade** to avoid popping:

1. When the LOD level changes, both the old and new representations are rendered
   simultaneously for **0.5 seconds**.
2. The old representation fades out (`opacity: 1.0 → 0.0`).
3. The new representation fades in (`opacity: 0.0 → 1.0`).
4. After the transition completes, the old representation is removed from the scene.

This requires temporarily setting `material.transparent = true` and animating
`material.opacity` during transitions.

### 7.4 Billboard (LOD 3)

For creatures beyond 100m:

- A small render-to-texture pass captures the creature from the camera's approximate
  viewing angle into a **64x64** texture.
- This texture is applied to a camera-facing quad (`THREE.Sprite` or billboard mesh).
- The billboard texture is **updated every ~2 seconds** (not every frame) to reflect
  the creature's current orientation and life stage.
- The quad is scaled to match the creature's approximate visual size at that distance.

### 7.5 Pre-generated LOD Meshes

All three mesh LOD levels (32^3, 16^3, 8^3) are generated at creature birth/growth and
cached. This avoids runtime Marching Cubes computation when LOD changes. Total memory
per creature for 3 LOD meshes is approximately:

```
LOD 0: ~6000 triangles * 32 bytes/vertex * 3 verts/tri ≈ 576 KB
LOD 1: ~1500 triangles * 32 bytes/vertex * 3 verts/tri ≈ 144 KB
LOD 2: ~400 triangles  * 32 bytes/vertex * 3 verts/tri ≈ 38 KB
Total: ~758 KB per creature (unindexed worst case)
```

With index buffers and vertex sharing, actual memory is roughly **200–400 KB per
creature** across all three LOD meshes.

---

## 8. Life Stage Visuals

### 8.1 Life Stages

A creature passes through six visual life stages. Each stage modifies the creature's
scale and proportions:

| Stage       | Scale  | Proportional Adjustments                        | Visual Notes             |
|-------------|--------|-------------------------------------------------|--------------------------|
| Egg         | N/A    | Simple ovoid mesh, no skeleton or animation     | Speckled shell texture   |
| Baby        | 30%    | Head is 1.5x proportionally larger              | High-pitched sounds      |
| Child       | 60%    | Head is 1.2x proportionally larger              | Clumsier animation       |
| Adolescent  | 85%    | Adult proportions                               | Standard animation       |
| Adult       | 100%   | Genome-specified proportions (canonical)        | Full expression range    |
| Elder       | 95%    | Genome-specified proportions                    | Desaturated colors,      |
|             |        |                                                 | slower animations        |

### 8.2 Egg Stage

The egg is a special case — it is not a skeleton-driven mesh:

- A simple `THREE.SphereGeometry` scaled to an ovoid shape (~1.2:1.0:1.0 ratio).
- Textured with the creature's base color and a speckled pattern overlay.
- No bones, no animation. Slight ambient rotation and occasional wobble as hatching
  approaches.

### 8.3 Scale Transitions

When transitioning between life stages, the creature's scale interpolates smoothly:

```
current_scale = lerp(old_stage_scale, new_stage_scale, transition_progress)
transition_progress += delta_time / stage_transition_duration
```

The transition duration is proportional to the life stage duration (typically 5–10
seconds of visual growth). During transition:

- The skeleton scale is updated per frame.
- The mesh is **not** regenerated during the smooth scale lerp.
- A new mesh is generated **once** at the start of the new stage (to update proportions
  like the baby's large head).

### 8.4 Elder Desaturation

Elder creatures have their colors desaturated to convey age:

```
elder_saturation = base_saturation * 0.5
elder_lightness  = base_lightness * 1.1  // slightly washed out
```

Animation speeds are reduced by 20% (multiplied by 0.8). Idle sway and breathing are
slightly more pronounced (suggesting fragility).

---

## 9. Performance Budget

### 9.1 Per-Creature Costs

| Operation            | Cost            | When                       | Notes                    |
|----------------------|-----------------|----------------------------|--------------------------|
| Mesh generation      | ~50ms           | Birth / life stage change  | Marching Cubes, 3 LODs   |
| IK solve (FABRIK)    | ~0.1ms          | Every frame (LOD 0-1 only) | 3 iterations per chain   |
| Head tracking        | ~0.01ms         | Every frame (LOD 0 only)   | Single slerp             |
| Idle animation       | ~0.01ms         | Every frame (LOD 0-1 only) | Sin/cos evaluations      |
| Expression blending  | ~0.02ms         | Every frame (LOD 0 only)   | Additive bone offsets    |
| Skinning             | GPU             | Every frame                | SkinnedMesh, ~20 bones   |
| Draw call            | 1 per creature  | Every frame                | Single SkinnedMesh       |

### 9.2 Scene-Level Budget

Target scenario: **50 creatures** visible at a typical LOD distribution.

```
Typical LOD distribution for 50 creatures:
  LOD 0 (High):     5 creatures   ×  0.14ms animation  =  0.70ms
  LOD 1 (Medium):  10 creatures   ×  0.11ms animation  =  1.10ms
  LOD 2 (Low):     15 creatures   ×  0.01ms animation  =  0.15ms
  LOD 3 (Billboard): 20 creatures ×  0.00ms animation  =  0.00ms
  ─────────────────────────────────────────────────────────────────
  Total animation CPU time:                              ~1.95ms
  Total draw calls:  5 + 10 + 15 + 20 sprites          = ~50 calls
  Effective creature draw calls (non-billboard):         = ~30 calls
```

**Total creature render budget: < 4ms per frame** (CPU side), well within the 16.6ms
budget for 60 FPS.

### 9.3 Memory Budget

```
Per creature:
  Mesh geometry (3 LODs):   ~300 KB average
  Skeleton / bones:         ~2 KB
  Skin material + uniforms: ~1 KB
  Billboard texture (64x64): ~16 KB
  ──────────────────────────────────
  Total per creature:       ~320 KB

50 creatures × 320 KB = ~16 MB total creature memory
```

This fits comfortably within a 256 MB WebGL memory target.

---

## 10. Cross-References

| Topic                          | Document          | Section / Details                           |
|--------------------------------|-------------------|---------------------------------------------|
| Morphology gene encoding       | GENOME.md         | Chromosome 8 — morphology genes, body       |
|                                |                   | segment fields, limb counts                 |
| Color gene encoding            | GENOME.md         | Color genes — HSL base, secondary, pattern  |
|                                |                   | ID, pattern scale                           |
| Brain motor outputs            | BRAIN.md          | Motor output neurons → movement speed,      |
|                                |                   | turn rate, head direction, expression drives |
| Drive system (emotions)        | BRAIN.md          | Drive neurons — hunger, fear, curiosity,    |
|                                |                   | sleepiness, pain → expression blending      |
| RenderSystem integration       | ARCHITECTURE.md   | RenderSystem — creature mesh management,    |
|                                |                   | LOD switching, draw call batching            |
| LOD system architecture        | ARCHITECTURE.md   | LODSystem — distance calculation, LOD       |
|                                |                   | assignment, transition scheduling            |
| Terrain height queries         | WORLD.md          | Terrain system — heightmap sampling for IK  |
|                                |                   | foot raycasts, ground contact detection      |
| Roadmap phasing                | ROADMAP.md        | Phase 1: capsule placeholder creatures      |
|                                |                   | (simple geometry, basic animation).          |
|                                |                   | Phase 4: full procedural metaball mesh,     |
|                                |                   | complete IK, all patterns and expressions.   |
