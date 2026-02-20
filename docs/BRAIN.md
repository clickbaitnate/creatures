# Brain: Continuous-Time Recurrent Neural Network (CTRNN)

## 1. Overview

The creature brain is a **Continuous-Time Recurrent Neural Network (CTRNN)**. Unlike conventional discrete-step neural networks where activations update in lockstep, CTRNN neuron activations evolve continuously over time according to ordinary differential equations (ODEs). Each neuron has its own time constant governing how quickly it responds to input, enabling a rich spectrum of temporal dynamics: fast reflexive reactions in motor lobes, slow integration in concept lobes, and persistent oscillatory states in drive lobes.

The genome fully encodes the brain's structure. Lobe genes define neuron counts, activation functions, and time constant ranges. Connection genes define which lobes wire to which, initial weight distributions, and learning rules. Instinct genes provide hardwired stimulus-response-reward triplets that bootstrap behavior before learning takes over. The brain is not a blank slate, but it is deeply plastic: connection weights change continuously through Hebbian learning modulated by biochemical reward and punishment signals.

The architecture is organized into **9 lobes** totaling approximately **480 neurons**, connected by roughly 4,000-6,000 synapses (sparse connectivity). This is small enough to simulate at 20 Hz for dozens of creatures simultaneously in a Web Worker, yet complex enough to produce emergent behavior that surprises even the designer.

---

## 2. CTRNN Mathematics

### 2.1 Core Differential Equation

Each neuron `i` has a continuous state variable `y_i` that evolves according to:

```
tau_i * (dy_i / dt) = -y_i + sum_j(w_ij * sigma(y_j + bias_j)) + I_i
```

Where:

| Symbol | Meaning | Range |
|--------|---------|-------|
| `y_i` | Internal state of neuron `i` | unbounded (clamped post-activation) |
| `tau_i` | Time constant of neuron `i` | 1-10 ticks (genome-encoded) |
| `w_ij` | Connection weight from neuron `j` to neuron `i` | [-1.0, 1.0] |
| `sigma` | Activation function (per-lobe) | see below |
| `bias_j` | Bias of pre-synaptic neuron `j` | [-1.0, 1.0] (genome-encoded) |
| `I_i` | External input to neuron `i` | [0.0, 1.0] for sensory, biochemistry-derived |

The term `-y_i` provides passive decay: without input, a neuron's state decays exponentially toward zero with time constant `tau_i`. The summation term integrates weighted, activated inputs from all connected neurons. The external input `I_i` injects sensory or biochemical signals directly.

### 2.2 Forward Euler Integration

The ODE is integrated numerically using the forward Euler method at each simulation tick:

```
y_i(t + dt) = y_i(t) + (dt / tau_i) * (-y_i(t) + sum_j(w_ij * sigma(y_j(t) + bias_j)) + I_i)
```

- **dt** = simulation timestep = **50ms** (one tick)
- **tau_i** varies per neuron, encoded in the genome, typically **1-10 ticks**
  - `tau = 1`: neuron responds instantly (full update each tick)
  - `tau = 10`: neuron integrates input slowly over ~500ms, acting as a leaky memory

The ratio `dt / tau_i` acts as an effective learning rate for the state update. When `tau_i = dt`, the neuron fully overwrites its state each tick. When `tau_i >> dt`, only a fraction of the new input bleeds through, creating smoothing and temporal persistence.

### 2.3 Activation Functions

Each lobe specifies one of three activation functions applied to the neuron state before it propagates to downstream connections:

```
sigmoid(x) = 1 / (1 + exp(-x))          Output range: (0, 1)
tanh(x)    = (exp(x) - exp(-x)) /       Output range: (-1, 1)
             (exp(x) + exp(-x))
relu(x)    = max(0, x)                   Output range: [0, inf)
```

| Activation | Used By | Rationale |
|------------|---------|-----------|
| Sigmoid | Perception, Concept, Attention, StimulusSource, Noun, Verb | Bounded [0,1], smooth gradient, biologically plausible firing rate |
| Tanh | Drive | Centered at zero, allows "satisfied" (negative) vs "needy" (positive) |
| ReLU | Decision, GeneralSense | Sparse activation, clear on/off for motor commands |

### 2.4 State Clamping

After integration, neuron states are clamped to prevent runaway values:

```
y_i = clamp(y_i, -5.0, 5.0)
```

Post-activation outputs are naturally bounded by the activation function (sigmoid/tanh), or clamped to `[0.0, 2.0]` for ReLU lobes.

---

## 3. Lobe Architecture

The brain is divided into 9 lobes. Each lobe is a contiguous block of neurons with shared configuration (activation function, time constant range). Lobes provide organizational structure but do not impose hard boundaries on connectivity.

| Lobe | Neurons | Offset | Purpose |
|------|---------|--------|---------|
| Drive | 16 | 0 | Biochemistry-derived drives (hunger, pain, tiredness, etc.) |
| StimulusSource | 16 | 16 | What object type is being attended to |
| Noun | 16 | 32 | Object identity / category |
| Verb | 16 | 48 | Action being considered / performed |
| GeneralSense | 8 | 64 | Temperature, light, terrain type, etc. |
| Attention | 40 | 72 | Salience filtering, focus selection |
| Perception | 96 | 112 | Combined sensory feature vectors |
| Concept | 256 | 208 | Associative memory, learned concepts |
| Decision | 16 | 464 | Final motor command outputs |
| **Total** | **480** | | |

### 3.1 Drive Lobe (16 neurons)

- **Activation function**: tanh
- **Time constant range**: 5-10 ticks (slow, integrative)
- **Inputs from**: Biochemistry system (external input `I_i`), no neural inputs
- **Outputs to**: Attention lobe
- **Purpose**: Each neuron represents one of the 16 biochemical drives. Values are injected directly from the biochemistry simulation every tick. Positive values represent unmet needs; negative values represent satiation. The slow time constants smooth out rapid biochemical fluctuations, creating stable motivational states.

### 3.2 StimulusSource Lobe (16 neurons)

- **Activation function**: sigmoid
- **Time constant range**: 1-2 ticks (fast, reactive)
- **Inputs from**: Sensory system (external input `I_i`)
- **Outputs to**: Perception lobe
- **Purpose**: Encodes the category/type of the object currently in the creature's attentional focus. Each neuron represents one object type (food, creature, toy, plant, boundary, hazard, etc.). Sensory input activates the appropriate neuron based on what the creature is looking at. Fast time constants ensure the representation updates immediately when attention shifts.

### 3.3 Noun Lobe (16 neurons)

- **Activation function**: sigmoid
- **Time constant range**: 2-4 ticks (moderate)
- **Inputs from**: Sensory system (external input `I_i`)
- **Outputs to**: Perception lobe
- **Purpose**: Encodes the specific identity or sub-category of the attended object. Where StimulusSource encodes "food," Noun encodes "apple" or "cheese." The slightly slower time constant creates short-term persistence, so a noun lingers briefly after the object leaves view, supporting sequence learning and association.

### 3.4 Verb Lobe (16 neurons)

- **Activation function**: sigmoid
- **Time constant range**: 2-4 ticks (moderate)
- **Inputs from**: Sensory system (external input `I_i`), Decision lobe (feedback)
- **Outputs to**: Perception lobe
- **Purpose**: Encodes the action currently being performed or considered. Receives both sensory input (observed actions of others) and feedback from the Decision lobe (the creature's own actions). This feedback loop is critical: it allows the creature to associate its own actions with outcomes during learning.

### 3.5 GeneralSense Lobe (8 neurons)

- **Activation function**: ReLU
- **Time constant range**: 1-3 ticks (fast to moderate)
- **Inputs from**: Environment sensors (external input `I_i`)
- **Outputs to**: Perception lobe
- **Purpose**: Encodes ambient environmental conditions: temperature, light level, terrain type, altitude, humidity, time of day, crowding, and noise level. These are continuous-valued signals (ReLU preserves magnitude information) that provide context for decision-making.

### 3.6 Attention Lobe (40 neurons)

- **Activation function**: sigmoid
- **Time constant range**: 2-5 ticks (moderate)
- **Inputs from**: Drive lobe, internal competitive dynamics
- **Outputs to**: Perception lobe (gating/modulation)
- **Purpose**: The attentional bottleneck. Performs salience filtering: determines which features of the perceptual field are amplified and which are suppressed. The 40 neurons are organized as a soft winner-take-all network with lateral inhibition (implemented via negative recurrent weights within the lobe). Drive inputs bias attention toward need-relevant stimuli (hungry creatures attend to food). Attention outputs multiplicatively gate the Perception lobe inputs.

### 3.7 Perception Lobe (96 neurons)

- **Activation function**: sigmoid
- **Time constant range**: 2-4 ticks (moderate)
- **Inputs from**: StimulusSource, Noun, Verb, GeneralSense, Attention (gating)
- **Outputs to**: Concept lobe
- **Purpose**: The central integration layer. Combines all sensory modalities into a unified feature vector. Attention gating modulates which features are salient. The 96-neuron width provides enough representational capacity for combinatorial encoding of multi-modal sensory scenes. Perception neurons develop tuning curves through learning: individual neurons may come to represent "food while hungry" or "creature nearby and lonely."

### 3.8 Concept Lobe (256 neurons)

- **Activation function**: sigmoid
- **Time constant range**: 3-8 ticks (slow, memory-like)
- **Inputs from**: Perception lobe (sparse), Concept lobe (recurrent, very sparse)
- **Outputs to**: Decision lobe, Concept lobe (recurrent)
- **Purpose**: The associative memory and reasoning core. This is the largest lobe and the most plastic. Sparse connectivity from Perception means each concept neuron "sees" only a small random subset of perceptual features. Recurrent connections within the Concept lobe allow pattern completion, sustained activation, and sequential state transitions. Slow time constants create persistent activations that serve as working memory. This is where learned associations form: concepts like "that food reduces hunger" emerge as stable attractor states.

### 3.9 Decision Lobe (16 neurons)

- **Activation function**: ReLU
- **Time constant range**: 1-2 ticks (fast, responsive)
- **Inputs from**: Concept lobe
- **Outputs to**: Motor system (external output), Verb lobe (feedback)
- **Purpose**: Final motor command output. Each neuron maps to a specific behavioral primitive (see Section 6). ReLU activation ensures outputs are non-negative (you cannot "un-eat"). Fast time constants ensure decisions translate immediately into action. The strongest-activated neuron generally dominates behavior, though multiple outputs can be active simultaneously (e.g., moving forward while eating).

---

## 4. Connection Architecture

### 4.1 Default Wiring (Genome-Encoded)

The genome defines inter-lobe connection tracts. Each tract specifies: source lobe, target lobe, density, weight initialization, and learning rule.

```
Drive ──────────────────────► Attention
StimulusSource ─────────────► Perception
Noun ───────────────────────► Perception
Verb ───────────────────────► Perception
GeneralSense ───────────────► Perception
Attention ──────────────────► Perception  (gating/modulation)
Perception ─────────────────► Concept     (sparse, ~5% density)
Concept ────────────────────► Concept     (recurrent, ~1% density)
Concept ────────────────────► Decision
Decision ───────────────────► Verb        (feedback loop)
```

### 4.2 Connection Tract Parameters

| Tract | Source | Target | Density | Weight Init | Learning Rule |
|-------|--------|--------|---------|-------------|---------------|
| Drive→Attention | Drive (16) | Attention (40) | 100% | U[-0.3, 0.3] | Reward-modulated |
| StimSrc→Perception | StimulusSource (16) | Perception (96) | 50% | U[0.0, 0.2] | Hebbian |
| Noun→Perception | Noun (16) | Perception (96) | 50% | U[0.0, 0.2] | Hebbian |
| Verb→Perception | Verb (16) | Perception (96) | 50% | U[0.0, 0.2] | Hebbian |
| GenSense→Perception | GeneralSense (8) | Perception (96) | 75% | U[0.0, 0.3] | Hebbian |
| Attention→Perception | Attention (40) | Perception (96) | 30% | U[0.1, 0.5] | Reward-modulated |
| Perception→Concept | Perception (96) | Concept (256) | 5% | U[-0.1, 0.1] | Reward-modulated |
| Concept→Concept | Concept (256) | Concept (256) | 1% | U[-0.05, 0.05] | Reward-modulated |
| Concept→Decision | Concept (256) | Decision (16) | 25% | U[-0.2, 0.2] | Reward-modulated |
| Decision→Verb | Decision (16) | Verb (16) | 100% (1-to-1) | 0.5 | None (fixed) |

**Density** refers to the probability that any given (source, target) neuron pair within the tract has a connection. For example, Perception→Concept at 5% density over 96 x 256 = 24,576 possible connections yields approximately 1,229 actual synapses.

**Weight Init** specifies the uniform distribution `U[min, max]` from which initial weights are drawn. The genome encodes the min and max values; mutations shift the distribution.

### 4.3 Estimated Synapse Count

| Tract | Max Possible | Density | Approx. Synapses |
|-------|-------------|---------|-------------------|
| Drive→Attention | 640 | 100% | 640 |
| StimSrc→Perception | 1,536 | 50% | 768 |
| Noun→Perception | 1,536 | 50% | 768 |
| Verb→Perception | 1,536 | 50% | 768 |
| GenSense→Perception | 768 | 75% | 576 |
| Attention→Perception | 3,840 | 30% | 1,152 |
| Perception→Concept | 24,576 | 5% | 1,229 |
| Concept→Concept | 65,536 | 1% | 655 |
| Concept→Decision | 4,096 | 25% | 1,024 |
| Decision→Verb | 16 | 100% | 16 |
| **Total** | | | **~7,596** |

---

## 5. Input Mapping

### 5.1 Biochemistry Drives to Drive Lobe

The biochemistry simulation (see [BIOCHEMISTRY.md](BIOCHEMISTRY.md)) produces 16 continuous drive values in `[0.0, 1.0]`, injected directly as external inputs `I_i` to the Drive lobe every tick.

| Neuron | Drive | Source Chemical | Semantics |
|--------|-------|-----------------|-----------|
| 0 | Hunger | glucose deficit | 0 = full, 1 = starving |
| 1 | Tiredness | ATP deficit | 0 = rested, 1 = exhausted |
| 2 | Pain | substance P | 0 = no pain, 1 = severe pain |
| 3 | Loneliness | social hormone deficit | 0 = socially fulfilled, 1 = isolated |
| 4 | Boredom | novelty deficit | 0 = stimulated, 1 = understimulated |
| 5 | Anger | adrenaline excess | 0 = calm, 1 = enraged |
| 6 | Fear | cortisol excess | 0 = safe, 1 = terrified |
| 7 | Sex Drive | gonadotropin | 0 = no urge, 1 = peak urge |
| 8 | Comfort | endorphin deficit | 0 = comfortable, 1 = distressed |
| 9 | Crowding | crowding hormone | 0 = uncrowded, 1 = claustrophobic |
| 10 | Nausea | toxin concentration | 0 = healthy, 1 = severely ill |
| 11 | Sleepiness | melatonin | 0 = alert, 1 = falling asleep |
| 12 | Coldness | temperature deficit | 0 = warm, 1 = freezing |
| 13 | Hotness | temperature excess | 0 = cool, 1 = overheating |
| 14 | Thirst | water deficit | 0 = hydrated, 1 = parched |
| 15 | Stress | cortisol sustained | 0 = relaxed, 1 = chronically stressed |

### 5.2 Sensory Inputs

Sensory data from the environment maps to four input lobes. The sensory system (see [ARCHITECTURE.md](ARCHITECTURE.md)) preprocesses raw world state into normalized `[0.0, 1.0]` signals.

#### StimulusSource Lobe (16 neurons) - Object Category

| Neuron | Category |
|--------|----------|
| 0 | Food (edible plant/fruit) |
| 1 | Creature (same species) |
| 2 | Creature (other species) |
| 3 | Plant (non-edible) |
| 4 | Water source |
| 5 | Toy / interactive object |
| 6 | Shelter / structure |
| 7 | Hazard (fire, thorns, etc.) |
| 8 | Boundary / wall |
| 9 | Tool / artifact |
| 10 | Egg / offspring |
| 11 | Corpse / dead matter |
| 12 | Chemical trail / scent |
| 13 | Sound source |
| 14 | Light source |
| 15 | Unknown / novel object |

#### Noun Lobe (16 neurons) - Object Identity

Encodes a learned 16-bit feature vector for the specific object being attended to. Unlike StimulusSource (which is categorical), Noun values are distributed representations learned through experience. Initial encoding is random; through Hebbian learning, similar objects come to have similar Noun representations.

#### Verb Lobe (16 neurons) - Action Encoding

| Neuron | Action |
|--------|--------|
| 0 | Approach / walk toward |
| 1 | Retreat / walk away |
| 2 | Turn left |
| 3 | Turn right |
| 4 | Eat / consume |
| 5 | Pick up / grab |
| 6 | Drop / release |
| 7 | Attack / strike |
| 8 | Flee / run away |
| 9 | Speak / vocalize |
| 10 | Mate / court |
| 11 | Sleep / rest |
| 12 | Play / explore |
| 13 | Groom / self-care |
| 14 | Push / manipulate |
| 15 | Idle / wait |

#### GeneralSense Lobe (8 neurons) - Environmental Context

| Neuron | Sense | Range |
|--------|-------|-------|
| 0 | Ambient temperature | 0=cold, 1=hot |
| 1 | Light level | 0=dark, 1=bright |
| 2 | Terrain friction | 0=slippery, 1=rough |
| 3 | Altitude / elevation | 0=low, 1=high |
| 4 | Humidity | 0=dry, 1=wet |
| 5 | Time of day | 0=midnight, 1=noon (cyclic) |
| 6 | Nearby creature density | 0=alone, 1=crowded |
| 7 | Ambient noise level | 0=silent, 1=loud |

---

## 6. Output Mapping

The Decision lobe's 16 neurons are read every tick and mapped to motor commands. The activation value (post-ReLU, range `[0.0, 2.0]`) determines command intensity.

| Neuron | Motor Command | Intensity Mapping |
|--------|---------------|-------------------|
| 0 | Move forward | 0=stop, 1=walk, 2=run |
| 1 | Turn left | 0=none, 1=45deg, 2=90deg per tick |
| 2 | Turn right | 0=none, 1=45deg, 2=90deg per tick |
| 3 | Movement speed | 0=creep, 1=normal, 2=sprint (multiplier) |
| 4 | Eat / drink | >0.5 triggers consumption of attended object |
| 5 | Pick up / interact | >0.5 triggers grab of attended object |
| 6 | Drop | >0.5 releases held object |
| 7 | Attack | >0.5 initiates attack on attended creature |
| 8 | Flee | >0.5 triggers rapid movement away from attended object |
| 9 | Vocalize / express | value selects expression type (mapped to animation) |
| 10 | Mate | >0.5 initiates mating attempt with attended creature |
| 11 | Sleep | >0.5 initiates sleep (cumulative threshold) |
| 12 | Reserved | Future use |
| 13 | Reserved | Future use |
| 14 | Reserved | Future use |
| 15 | Reserved | Future use |

### 6.1 Motor Conflict Resolution

When conflicting commands are active simultaneously (e.g., both "move forward" and "flee"), the motor system applies priority rules:

1. **Flee** overrides all movement commands (survival reflex)
2. **Sleep** suppresses all outputs except flee (emergency wake)
3. **Attack** and **mate** are mutually exclusive (highest activation wins)
4. **Eat** requires the creature to be adjacent to a consumable and not fleeing
5. **Turn left** and **turn right** cancel partially (net rotation = difference)

---

## 7. Learning Rules

Connection weights are updated every tick after the forward pass. Each connection tract has a genome-assigned learning rule. Multiple rules can combine additively.

### 7.1 Hebbian Strengthening

Connections strengthen when pre-synaptic and post-synaptic neurons are co-active. This is the classic "fire together, wire together" rule.

```
dw_ij = learning_rate * pre_j * post_i
```

- `learning_rate`: genome-encoded, typically 0.001-0.01 per tick
- `pre_j`: activated output of pre-synaptic neuron `j` (i.e., `sigma(y_j + bias_j)`)
- `post_i`: activated output of post-synaptic neuron `i`
- Weights are clamped to `[-1.0, 1.0]` after update

### 7.2 Atrophy (Connection Decay)

Unused connections slowly decay toward zero. This prevents the network from saturating and encourages specialization.

```
dw_ij = -atrophy_rate * (1 - |pre_j * post_i|) * w_ij
```

- `atrophy_rate`: genome-encoded, typically 0.0001-0.001 per tick
- The term `(1 - |pre_j * post_i|)` ensures that actively-used connections are protected from decay
- Decay is proportional to current weight magnitude: large weights decay faster in absolute terms but at the same relative rate

### 7.3 Reward-Modulated Learning

Hebbian update scaled by the concentration of reward chemical in the creature's bloodstream. This is the primary mechanism for operant conditioning: behaviors that lead to drive reduction are reinforced.

```
dw_ij = learning_rate * pre_j * post_i * reward
```

- `reward`: concentration of reward chemical (range `[0.0, 1.0]`), produced by the biochemistry system when a drive is reduced (see [BIOCHEMISTRY.md](BIOCHEMISTRY.md))
- When `reward = 0`, no learning occurs (even if neurons are co-active)
- This rule is used for all connections from Perception→Concept, Concept→Concept, and Concept→Decision
- Combined with atrophy, this creates a system where only rewarded associations persist

### 7.4 Punishment-Modulated Learning

Inverse of reward-modulated learning. Active connections are weakened when punishment chemical is present. This enables avoidance learning.

```
dw_ij = -learning_rate * pre_j * post_i * punishment
```

- `punishment`: concentration of punishment chemical (range `[0.0, 1.0]`), produced when a drive increases sharply (pain spike, sudden hunger, etc.)
- Weakens connections that were active during the aversive event
- Combined with reward-modulated learning, creates a push-pull system that shapes behavior toward drive homeostasis

### 7.5 Rewiring (Connection Reassignment)

When a connection weight drops below a threshold (through atrophy or punishment), it may be randomly reassigned to a different pre-synaptic neuron. This enables structural plasticity.

```
if |w_ij| < rewire_threshold:
    with probability p_rewire:
        j_new = random neuron in source lobe
        w_i,j_new = random_init()
        remove connection (i, j)
```

- `rewire_threshold`: genome-encoded, typically 0.01
- `p_rewire`: genome-encoded, typically 0.1-0.3 per tick per sub-threshold connection
- `random_init()`: small random weight from the tract's initialization distribution
- This prevents "dead" connections from permanently wasting capacity
- Effectively implements a form of neural search: the network explores different wiring configurations over the creature's lifetime

### 7.6 Learning Rate Schedule

All learning rates are modulated by the creature's age:

```
effective_lr = base_lr * age_factor(age)

age_factor(age):
    if age < infant_period:    return 2.0   (rapid early learning)
    if age < juvenile_period:  return 1.0   (normal learning)
    if age < adult_period:     return 0.5   (reduced plasticity)
    else:                      return 0.2   (slow late learning)
```

This mirrors biological critical periods: young creatures learn faster but are also more vulnerable to maladaptive associations.

---

## 8. Instinct Genes

Instinct genes provide approximately **30 hardwired stimulus-action-reward mappings** that bootstrap behavior before learning takes over. Each instinct gene specifies:

- **Condition**: a pattern of input lobe activations that must be present
- **Action**: a Decision lobe neuron to activate
- **Reward/Punishment**: a biochemical consequence that reinforces or discourages the behavior
- **Decay rate**: how quickly the instinct fades as learning takes over (some never fade)

### 8.1 Instinct Table

| # | Condition | Action | Consequence | Decay |
|---|-----------|--------|-------------|-------|
| 1 | StimulusSource=Food AND Drive:Hunger > 0.5 | Approach (Decision 0) | Reward (hunger reduction anticipated) | Slow |
| 2 | Adjacent to Food AND Drive:Hunger > 0.3 | Eat (Decision 4) | Reward (hunger reduced) | Slow |
| 3 | StimulusSource=Hazard | Retreat (Decision 8) | Reward (pain avoided) | Never |
| 4 | Drive:Pain > 0.7 | Flee (Decision 8) | Reward (pain reduced via escape) | Never |
| 5 | StimulusSource=Creature(same) AND Drive:Loneliness > 0.5 | Approach (Decision 0) | Reward (loneliness reduced) | Medium |
| 6 | StimulusSource=WaterSource AND Drive:Thirst > 0.5 | Approach (Decision 0) | Reward (thirst reduction anticipated) | Slow |
| 7 | Adjacent to WaterSource AND Drive:Thirst > 0.3 | Eat/Drink (Decision 4) | Reward (thirst reduced) | Slow |
| 8 | Drive:Tiredness > 0.8 | Sleep (Decision 11) | Reward (tiredness reduced) | Never |
| 9 | Drive:Sleepiness > 0.7 | Sleep (Decision 11) | Reward (sleepiness reduced) | Never |
| 10 | GeneralSense:Temperature low AND Drive:Coldness > 0.5 | Approach shelter (Decision 0) | Reward (coldness reduced) | Medium |
| 11 | GeneralSense:Temperature high AND Drive:Hotness > 0.5 | Approach water (Decision 0) | Reward (hotness reduced) | Medium |
| 12 | Drive:Boredom > 0.6 | Explore/random walk (Decision 0+1 or 0+2) | Reward (boredom reduced) | Fast |
| 13 | StimulusSource=Creature(other) AND Drive:Fear > 0.5 | Flee (Decision 8) | Reward (fear reduced) | Slow |
| 14 | StimulusSource=Creature(same) AND Drive:SexDrive > 0.7 | Approach (Decision 0) | Reward (sex drive anticipated) | Medium |
| 15 | Adjacent to Creature(same) AND Drive:SexDrive > 0.7 | Mate (Decision 10) | Reward (sex drive reduced) | Medium |
| 16 | StimulusSource=Egg AND self is parent | Approach (Decision 0) | Reward (comfort increased) | Medium |
| 17 | Drive:Nausea > 0.5 AND holding object | Drop (Decision 6) | Neutral (prevents eating) | Slow |
| 18 | StimulusSource=Toy AND Drive:Boredom > 0.4 | Pick up (Decision 5) | Reward (boredom reduced) | Fast |
| 19 | Drive:Crowding > 0.6 | Move away (Decision 0+1) | Reward (crowding reduced) | Medium |
| 20 | StimulusSource=Food AND Drive:Hunger < 0.1 | Idle (no action boost) | Neutral (prevents overeating) | Fast |
| 21 | Attacked by creature | Attack back (Decision 7) | Reward (anger reduced) | Slow |
| 22 | Drive:Anger > 0.8 AND nearby creature | Attack (Decision 7) | Punishment (anger sustained) | Medium |
| 23 | StimulusSource=Creature(same) AND nearby | Vocalize (Decision 9) | Reward (loneliness reduced) | Fast |
| 24 | Drive:Comfort < 0.3 (comfortable) | Idle (Decision 15/none) | Neutral (no unnecessary action) | Never |
| 25 | GeneralSense:LightLevel low AND Drive:Fear > 0.3 | Approach light (Decision 0) | Reward (fear reduced) | Medium |
| 26 | Just hatched (age < 100 ticks) | Vocalize (Decision 9) | Reward (loneliness reduced) | Fast |
| 27 | StimulusSource=Unknown AND Drive:Boredom > 0.3 | Approach (Decision 0) | Reward (boredom reduced) | Fast |
| 28 | Drive:Stress > 0.7 | Groom/self-care (Decision 13 via Verb) | Reward (stress reduced) | Slow |
| 29 | Falling / sudden altitude change | Flee (Decision 8) | Punishment (pain anticipated) | Never |
| 30 | StimulusSource=ChemicalTrail AND Drive:Hunger > 0.4 | Follow trail (Decision 0) | Reward (hunger reduction anticipated) | Medium |

### 8.2 Instinct Decay

Instinct genes have a **strength** value that starts at 1.0 and decays over the creature's lifetime at a genome-specified rate:

```
instinct_strength(t) = initial_strength * exp(-decay_rate * t)
```

- **Never** decay: survival-critical instincts (flee from pain, sleep when exhausted)
- **Slow** decay (rate ~0.0001): feeding, drinking instincts (replaced by learned food preferences)
- **Medium** decay (rate ~0.001): social, thermal regulation (refined by experience)
- **Fast** decay (rate ~0.01): exploration, play (quickly replaced by learned behavior)

The instinct contribution is added to the Decision lobe as an additional external input, weighted by the current instinct strength. As the strength decays, learned associations in the Concept→Decision pathway take over.

---

## 9. Implementation Notes

### 9.1 Memory Layout

All neuron states are stored in a single contiguous `Float32Array` for cache-friendly access and efficient transfer to/from Web Workers via `SharedArrayBuffer` or structured clone.

```
brain.states     = new Float32Array(480);   // y_i for all neurons
brain.outputs    = new Float32Array(480);   // sigma(y_i + bias_i) cached
brain.biases     = new Float32Array(480);   // bias_i per neuron
brain.taus       = new Float32Array(480);   // tau_i per neuron
brain.inputs     = new Float32Array(480);   // I_i external inputs (zeroed each tick)
```

Total per creature: `480 * 5 * 4 bytes = 9,600 bytes` (~9.4 KB) for neuron data.

### 9.2 Connection Storage

Connections are stored in **Compressed Sparse Row (CSR) format** for efficient forward pass computation (iterate over all inputs to each target neuron):

```
brain.conn_target_offsets = new Uint16Array(481);  // CSR row pointers (one per neuron + 1)
brain.conn_sources        = new Uint16Array(8000); // source neuron indices
brain.conn_weights        = new Float32Array(8000); // w_ij values
brain.conn_rules          = new Uint8Array(8000);  // learning rule ID per connection
```

Estimated ~8,000 connections at `(2 + 4 + 1) bytes = 7 bytes` each = **~56 KB** per creature for connection data.

Alternative: flat arrays with lobe-based offsets for tracts with known fixed density (e.g., Drive→Attention at 100% = 640 connections stored as a dense 16x40 matrix).

### 9.3 Forward Pass Pseudocode

```javascript
function brainTick(brain, dt) {
    const { states, outputs, biases, taus, inputs,
            conn_target_offsets, conn_sources, conn_weights } = brain;

    // 1. Compute activated outputs for all neurons (using previous state)
    for (let i = 0; i < 480; i++) {
        outputs[i] = activate(states[i] + biases[i], lobeOf(i));
    }

    // 2. Update neuron states via forward Euler
    for (let i = 0; i < 480; i++) {
        let input_sum = 0;
        const start = conn_target_offsets[i];
        const end   = conn_target_offsets[i + 1];
        for (let c = start; c < end; c++) {
            input_sum += conn_weights[c] * outputs[conn_sources[c]];
        }
        const dy = (-states[i] + input_sum + inputs[i]);
        states[i] += (dt / taus[i]) * dy;
        states[i] = clamp(states[i], -5.0, 5.0);
    }

    // 3. Recompute outputs with new states (for reading by motor system)
    for (let i = 0; i < 480; i++) {
        outputs[i] = activate(states[i] + biases[i], lobeOf(i));
    }

    // 4. Apply learning rules
    applyLearningRules(brain);

    // 5. Clear external inputs for next tick
    inputs.fill(0);
}
```

### 9.4 Performance Budget

| Metric | Value |
|--------|-------|
| Neurons per creature | 480 |
| Connections per creature | ~7,600 |
| Ticks per second | 20 |
| Neuron updates per tick per creature | 480 |
| Connection evaluations per tick per creature | ~7,600 |
| Neuron updates per second per creature | 9,600 |
| Connection evaluations per second per creature | 152,000 |
| Target creature count | 50 |
| Total neuron updates per second | 480,000 |
| Total connection evaluations per second | 7,600,000 |

At ~7.6 million multiply-accumulate operations per second, this is well within the capability of a single Web Worker on modern hardware (a single core can easily handle 100M+ float operations per second). The brain simulation should consume less than **2ms per tick** for all 50 creatures combined, leaving ample budget for biochemistry, physics, and rendering.

### 9.5 Serialization

Brain state is serialized for save/load and genome export:

```javascript
function serializeBrain(brain) {
    return {
        states:  Array.from(brain.states),
        biases:  Array.from(brain.biases),
        taus:    Array.from(brain.taus),
        weights: {
            offsets: Array.from(brain.conn_target_offsets),
            sources: Array.from(brain.conn_sources),
            weights: Array.from(brain.conn_weights),
            rules:   Array.from(brain.conn_rules),
        }
    };
}
```

Compressed (gzip), a single brain serializes to approximately **20-30 KB**.

---

## 10. Cross-References

- **[GENOME.md](GENOME.md)** -- Brain lobe genes (neuron counts, activation functions, time constants, biases), connection tract genes (source/target lobes, density, weight init ranges, learning rules), instinct genes (condition/action/consequence triplets). The brain is entirely constructed from the genome at birth; mutations affect brain structure in the next generation.

- **[BIOCHEMISTRY.md](BIOCHEMISTRY.md)** -- Drive chemicals that feed into the Drive lobe, reward and punishment chemical concentrations that modulate learning rules, age-dependent chemical profiles that affect learning rate schedules. The biochemistry and brain are tightly coupled: the brain reads drive states and the biochemistry reads motor outputs (e.g., eating triggers glucose absorption).

- **[ARCHITECTURE.md](ARCHITECTURE.md)** -- Threading model for brain simulation (dedicated Web Worker), SharedArrayBuffer layout for cross-thread brain state access, tick scheduling and synchronization between brain updates and world simulation, input/output buffer protocols between the sensory system and brain lobes.

- **[CREATURES.md](CREATURES.md)** -- Motor output mapping from Decision lobe activations to creature animations and world-state changes, sensory input pipeline from world objects to brain input lobes, creature lifecycle events that affect brain state (birth, aging, death), social interaction protocols mediated by brain outputs.
