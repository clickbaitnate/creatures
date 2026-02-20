# Biochemistry System

## 1. Overview

The biochemistry system simulates approximately 80 chemicals inside each creature. These chemicals interact through genome-encoded reactions distributed across 21 organs, forming a rich internal simulation that drives behavior, health, metabolism, learning, reproduction, and aging.

Biochemistry serves as the bridge between two major subsystems:

- **The Brain** -- via emitters (neuron activity produces chemicals) and receptors (chemical concentrations modulate neurons). See [BRAIN.md](BRAIN.md).
- **The Body** -- metabolism converts food to energy, organs degrade with age, immune responses fight pathogens, and reproductive hormones govern mating and pregnancy.

Chemical concentrations collectively define the creature's **internal state**. A creature with high Hunger, low Glucose, and rising Stress will behave very differently from one with high Dopamine, high Comfort, and low Tiredness. The brain reads these states through receptor genes, makes decisions, and those decisions feed back into the chemistry through emitter genes. This closed loop -- chemistry drives behavior, behavior changes chemistry -- is the core of what makes each creature feel alive.

Every simulation tick (50ms), the biochemistry engine:

1. Applies half-life decay to all chemicals
2. Evaluates ~120 genome-encoded reactions across 21 organs
3. Processes emitter genes (brain activity -> chemical emission)
4. Processes receptor genes (chemical concentration -> neuron modulation)
5. Updates organ health based on aging and damage

---

## 2. Chemical Representation

Each creature's chemical state is stored as a flat typed array:

```typescript
const chemicals = new Float32Array(256);
```

| Property | Value |
|----------|-------|
| Storage | `Float32Array(256)` per creature |
| Active slots | 0--79 (80 chemicals) |
| Reserved slots | 80--255 (for modding and expansion) |
| Value range | 0.0 (absent) to 1.0 (saturated) |
| Update frequency | Every simulation tick (50ms = 20 Hz) |
| Precision | 32-bit float (~7 decimal digits) |

Concentrations are clamped to `[0.0, 1.0]` after every update pass. A concentration of 0.0 means the chemical is completely absent; 1.0 means the creature is fully saturated. Most chemicals operate in the 0.0--0.5 range during normal healthy function, with values above 0.7 indicating extreme or pathological states.

The 256-slot design leaves 176 slots unused. These are reserved for:

- **Modding**: custom chemicals added by user-created genome modifications
- **Expansion**: future development phases may add additional chemical systems
- **Species variation**: different creature species could use the reserved range for species-specific chemicals

Slots 80--255 are initialized to 0.0 and are not subject to decay or reactions unless explicitly referenced by genome-encoded genes.

---

## 3. Chemical Categories

All ~80 chemicals are organized into 8 functional categories. Each chemical has a unique **slot ID**, a **name**, and a **brief description** of its role.

### Drives (Slots 0--15)

Drive chemicals represent the creature's internal needs and emotional states. They are the primary interface between biochemistry and behavior -- the brain's Drive lobe reads these values to determine what the creature "wants."

| ID | Name | Description |
|----|------|-------------|
| 0 | Hunger | Rises when Glucose is low; drives food-seeking behavior |
| 1 | Tiredness | Accumulates during activity and wakefulness; drives sleep-seeking |
| 2 | Pain | Produced by injury, toxins, extreme temperature; drives avoidance |
| 3 | Loneliness | Rises when no conspecifics are nearby; drives social seeking |
| 4 | Boredom | Rises during inactivity or repetitive stimulation; drives exploration |
| 5 | Anger | Produced by frustration (blocked goals, crowding); drives aggression |
| 6 | Fear | Produced by threat detection, pain, loud stimuli; drives flight |
| 7 | SexDrive | Rises with sex hormones and maturity; drives mating behavior |
| 8 | Comfort | Inverse-drive: high = content; drops with Pain, extreme temps |
| 9 | Crowding | Rises when too many creatures nearby; drives withdrawal |
| 10 | Nausea | Produced by toxins, illness, overeating; drives food avoidance |
| 11 | Sleepiness | Rises with Melatonin and Tiredness; triggers sleep state |
| 12 | Coldness | Rises when environmental temperature is low; drives warmth-seeking |
| 13 | Hotness | Rises when environmental temperature is high; drives cooling |
| 14 | Thirst | Rises when Water is low; drives water-seeking behavior |
| 15 | Stress | Meta-drive: weighted sum of multiple elevated drives; modulates Cortisol |

### Metabolic (Slots 16--31)

Metabolic chemicals model the creature's energy economy -- from food intake through cellular energy production and waste elimination.

| ID | Name | Description |
|----|------|-------------|
| 16 | Glucose | Primary energy currency; produced from food digestion |
| 17 | Glycogen | Short-term energy storage; liver and muscle reserves |
| 18 | Fat | Long-term energy storage; slow to deposit and withdraw |
| 19 | Protein | Structural molecule; needed for growth, muscle, repair |
| 20 | ATP | Cellular energy; consumed by movement, thought, organ function |
| 21 | ADP | Spent energy molecule; recycled back to ATP via respiration |
| 22 | Oxygen | Absorbed from environment via lungs; required for ATP production |
| 23 | CO2 | Waste product of respiration; expelled via lungs |
| 24 | Water | Essential solvent; consumed and excreted continuously |
| 25 | Lactate | Anaerobic byproduct; accumulates during intense exertion |
| 26 | Urea | Protein metabolism waste; filtered by kidneys |
| 27 | Bile | Produced by liver; aids fat digestion in intestine |
| 28 | Insulin | Pancreatic hormone; drives Glucose -> Glycogen conversion |
| 29 | Glucagon | Pancreatic hormone; drives Glycogen -> Glucose conversion |
| 30 | GrowthHormone | Stimulates protein synthesis, bone growth, organ development |
| 31 | Cortisol | Stress hormone; mobilizes energy reserves, suppresses immune function |

### Hormonal (Slots 32--43)

Hormonal chemicals modulate the creature's behavioral tendencies, mood, and physiological state at a broad level. They act more slowly than drive chemicals and create longer-term behavioral shifts.

| ID | Name | Description |
|----|------|-------------|
| 32 | Adrenaline | Fight-or-flight hormone; boosts ATP production, increases alertness |
| 33 | Serotonin | Mood stabilizer; reduces Anger, Fear; promotes Comfort |
| 34 | Dopamine | Reward signal; produced by positive outcomes; reinforces learning |
| 35 | Endorphin | Natural painkiller; reduces Pain, produced during exercise and bonding |
| 36 | Melatonin | Sleep hormone; rises in darkness, promotes Sleepiness |
| 37 | Testosterone | Male sex hormone; drives aggression, muscle growth, SexDrive |
| 38 | Estrogen | Female sex hormone; modulates fertility, bonding behavior |
| 39 | Oxytocin | Bonding hormone; produced during social contact, reduces Stress |
| 40 | Vasopressin | Water retention hormone; regulates kidney Water reabsorption |
| 41 | Thyroid | Metabolic rate regulator; scales all metabolic reaction rates |
| 42 | Leptin | Satiety signal; produced by Fat storage, suppresses Hunger |
| 43 | Ghrelin | Hunger signal; rises when Glucose is low, amplifies Hunger |

### Toxins (Slots 44--51)

Toxins are harmful chemicals acquired from the environment. They cause damage, trigger immune responses, and must be metabolized or fought off.

| ID | Name | Description |
|----|------|-------------|
| 44 | Alcohol | Environmental toxin; impairs brain function, damages liver |
| 45 | Cyanide | Lethal toxin; blocks ATP production in mitochondria |
| 46 | Histamine | Inflammatory mediator; released during allergic/immune reactions |
| 47 | Allergen | Environmental trigger; causes Histamine release in sensitive creatures |
| 48 | Venom | Injected by hostile creatures/objects; causes Pain and tissue damage |
| 49 | Radiation | Environmental hazard; causes CellDamage, mutations in offspring |
| 50 | HeavyMetal | Environmental toxin; accumulates slowly, damages kidneys and brain |
| 51 | Pathogen | Infectious agent; triggers immune response, causes Fever |

### Immune (Slots 52--59)

Immune chemicals model the creature's defense system against pathogens, toxins, and cellular damage.

| ID | Name | Description |
|----|------|-------------|
| 52 | AntibodyA | Specific defense against Pathogen variant A |
| 53 | AntibodyB | Specific defense against Pathogen variant B |
| 54 | AntibodyC | Specific defense against Pathogen variant C |
| 55 | WhiteBloodCells | General immune effector; fights all pathogens and infections |
| 56 | Inflammation | Nonspecific immune response; increases local blood flow and Pain |
| 57 | Fever | Systemic temperature increase; boosts immune rate, increases metabolic cost |
| 58 | Interferon | Antiviral signal; slows Pathogen replication rate |
| 59 | Complement | Immune cascade protein; amplifies antibody effectiveness |

### Learning (Slots 60--67)

Learning chemicals interface directly with the brain's synaptic plasticity system. They determine how strongly and in what direction the creature's neural connections are modified by experience.

| ID | Name | Description |
|----|------|-------------|
| 60 | Reward | Positive reinforcement signal; strengthens recently active synapses |
| 61 | Punishment | Negative reinforcement signal; weakens recently active synapses |
| 62 | LearningRate | Global modulator of synaptic plasticity magnitude |
| 63 | Curiosity | Drives exploration of novel stimuli; decays with familiarity |
| 64 | Habituation | Accumulates with repeated identical stimuli; reduces response |
| 65 | Sensitization | Increases response to stimuli following intense or aversive experience |
| 66 | ConsolidationFactor | Converts short-term synaptic changes to long-term during sleep |
| 67 | Neuroplasticity | Age-dependent capacity for synaptic change; high in youth, declines |

### Reproductive (Slots 68--75)

Reproductive chemicals govern the mating cycle, pregnancy, lactation, and offspring production.

| ID | Name | Description |
|----|------|-------------|
| 68 | Fertility | Current reproductive viability; must exceed threshold for conception |
| 69 | PregnancyHormone | Rises during gestation; suppresses Fertility, increases nutrient demand |
| 70 | LactationHormone | Post-birth hormone; enables nursing, suppresses Fertility |
| 71 | MatingPheromone | External chemical signal; attracts potential mates |
| 72 | BondingHormone | Pair-bonding signal; rises after mating, promotes proximity to mate |
| 73 | GestationProgress | Monotonically increasing during pregnancy; triggers birth at 1.0 |
| 74 | EggMaturation | Female gamete readiness; cycles periodically in mature females |
| 75 | SpermCount | Male gamete availability; regenerates over time in mature males |

### Regulatory (Slots 76--79)

Regulatory chemicals control the creature's overall viability, aging process, and cellular integrity.

| ID | Name | Description |
|----|------|-------------|
| 76 | LifeForce | Overall vitality; starts at 1.0, drains from damage and age; death at < 0.01 |
| 77 | AgingFactor | Monotonically increasing age signal; accelerates organ degradation |
| 78 | CellDamage | Accumulated cellular damage from toxins, radiation, metabolic stress |
| 79 | RepairEnzyme | Cellular repair capacity; counteracts CellDamage; declines with age |

---

## 4. Half-Life Decay Model

Every chemical naturally decays toward zero over time. This models metabolic clearance, enzymatic breakdown, and natural dissipation. Without decay, chemicals would accumulate indefinitely and the system would saturate.

### Decay Formula

Each simulation tick, every chemical concentration is multiplied by its decay factor:

```
concentration *= decay_factor
```

where:

```
decay_factor = 0.5 ^ (dt / half_life)
```

- `dt` = time elapsed since last tick (typically 1 tick = 50ms)
- `half_life` = number of ticks for the chemical to reach half its current concentration
- A half-life of 100 ticks means the chemical halves every 5 seconds of real time

### Implementation

```typescript
function applyDecay(chemicals: Float32Array, halfLives: Float32Array, dt: number): void {
    for (let i = 0; i < 80; i++) {
        if (chemicals[i] > 0.0001) {  // skip negligible concentrations
            const decayFactor = Math.pow(0.5, dt / halfLives[i]);
            chemicals[i] *= decayFactor;
            if (chemicals[i] < 0.0001) chemicals[i] = 0; // snap to zero
        }
    }
}
```

The 0.0001 threshold avoids wasting cycles on vanishingly small concentrations and prevents floating-point denormalization slowdowns.

### Default Half-Lives by Category

Half-lives are genome-encoded per chemical per species, but each chemical has a default value used when no genome override is present. These defaults represent reasonable biological timescales.

| Category | ID Range | Default Half-Life (ticks) | Real Time Equivalent | Rationale |
|----------|----------|--------------------------|---------------------|-----------|
| Drives | 0--15 | 100 | 5.0 s | Drives should persist long enough to motivate behavior but not indefinitely |
| Metabolic | 16--31 | varies (see below) | varies | Energy molecules turn over rapidly; storage molecules persist |
| Hormonal | 32--43 | 50 | 2.5 s | Hormones act quickly and are cleared quickly for responsiveness |
| Toxins | 44--51 | 200 | 10.0 s | Toxins are hard to clear; they linger and cause sustained damage |
| Immune | 52--59 | 150 | 7.5 s | Immune responses ramp up and wind down over moderate timescales |
| Learning | 60--67 | 80 | 4.0 s | Learning signals must be present during the consolidation window |
| Reproductive | 68--75 | 300 | 15.0 s | Reproductive cycles operate on longer timescales |
| Regulatory | 76--79 | 500 | 25.0 s | Life-level signals change very slowly |

### Individual Metabolic Half-Lives

Metabolic chemicals vary widely because the energy economy requires both fast-turnover molecules (ATP) and slow-storage molecules (Fat):

| ID | Chemical | Half-Life (ticks) | Real Time | Notes |
|----|----------|-------------------|-----------|-------|
| 16 | Glucose | 60 | 3.0 s | Consumed rapidly by all organs |
| 17 | Glycogen | 200 | 10.0 s | Medium-term storage; slower turnover |
| 18 | Fat | 400 | 20.0 s | Long-term storage; very slow turnover |
| 19 | Protein | 300 | 15.0 s | Structural; slow turnover except during growth |
| 20 | ATP | 20 | 1.0 s | Extremely fast turnover; constantly produced and consumed |
| 21 | ADP | 20 | 1.0 s | Matches ATP turnover rate |
| 22 | Oxygen | 30 | 1.5 s | Must be continuously replenished by breathing |
| 23 | CO2 | 30 | 1.5 s | Must be continuously expelled by breathing |
| 24 | Water | 250 | 12.5 s | Slow turnover; large body reservoir |
| 25 | Lactate | 80 | 4.0 s | Cleared by liver; moderate rate |
| 26 | Urea | 100 | 5.0 s | Filtered by kidneys at steady rate |
| 27 | Bile | 120 | 6.0 s | Recycled in enterohepatic circulation |
| 28 | Insulin | 40 | 2.0 s | Rapid hormonal signaling |
| 29 | Glucagon | 40 | 2.0 s | Rapid hormonal signaling |
| 30 | GrowthHormone | 60 | 3.0 s | Pulsatile release; moderate clearance |
| 31 | Cortisol | 80 | 4.0 s | Stress response; moderate duration |

### Individual Hormonal Half-Lives

| ID | Chemical | Half-Life (ticks) | Real Time | Notes |
|----|----------|-------------------|-----------|-------|
| 32 | Adrenaline | 30 | 1.5 s | Very fast acting, fast clearance |
| 33 | Serotonin | 60 | 3.0 s | Moderate persistence for mood stability |
| 34 | Dopamine | 40 | 2.0 s | Quick reward signal |
| 35 | Endorphin | 70 | 3.5 s | Moderate analgesic duration |
| 36 | Melatonin | 100 | 5.0 s | Longer persistence for sleep maintenance |
| 37 | Testosterone | 80 | 4.0 s | Moderate hormonal persistence |
| 38 | Estrogen | 80 | 4.0 s | Moderate hormonal persistence |
| 39 | Oxytocin | 40 | 2.0 s | Quick bonding signal |
| 40 | Vasopressin | 50 | 2.5 s | Moderate regulatory duration |
| 41 | Thyroid | 120 | 6.0 s | Slow metabolic regulator |
| 42 | Leptin | 90 | 4.5 s | Moderate satiety signal |
| 43 | Ghrelin | 50 | 2.5 s | Quick hunger signal |

---

## 5. The 21 Organs

Each creature has 21 organs. Every organ maintains its own health value, runs a set of genome-encoded chemical reactions, and degrades over the creature's lifetime. Organs are the primary site where chemicals are produced, consumed, and transformed.

### Organ Table

| # | Organ | Primary Function | Typical Reaction Count |
|---|-------|-----------------|----------------------|
| 0 | Brain | Reward/punishment signaling, learning chemical production | 6 |
| 1 | Heart | Oxygen circulation, ATP distribution | 4 |
| 2 | Lungs | O2 intake from environment, CO2 expulsion | 3 |
| 3 | Stomach | Food item -> Glucose + Protein conversion | 4 |
| 4 | Intestine | Glucose -> Glycogen, Fat absorption, Bile-assisted digestion | 5 |
| 5 | Liver | Glycogen storage, toxin detoxification, Bile production | 8 |
| 6 | Kidneys | Urea filtration, Water balance, waste excretion | 5 |
| 7 | Muscles | ATP -> mechanical work + Lactate, Protein consumption for growth | 4 |
| 8 | Skin | Temperature regulation, Pain sensing from environment | 3 |
| 9 | Eyes | Sensory only -- no chemical reactions | 0 |
| 10 | Immune System | Antibody production, Pathogen destruction, Inflammation | 8 |
| 11 | Endocrine | Serotonin, Dopamine, Endorphin production and regulation | 6 |
| 12 | Reproductive | Sex hormone production, Fertility cycling, gestation chemicals | 7 |
| 13 | Fat Storage | Fat deposit from excess Glucose, Fat withdrawal when Glucose low | 4 |
| 14 | Bone Marrow | WhiteBloodCell production, Complement synthesis | 4 |
| 15 | Thyroid | Thyroid hormone production, metabolic rate modulation | 3 |
| 16 | Adrenal Glands | Adrenaline production from Stress/Fear, Cortisol from Stress | 4 |
| 17 | Pancreas | Insulin release when Glucose high, Glucagon when Glucose low | 4 |
| 18 | Nervous System | Pain chemical processing, reflex chemical cascades | 5 |
| 19 | Spleen | Old cell recycling, immune cell reservoir, Inflammation regulation | 4 |
| 20 | Growth Plates | GrowthHormone effects on Protein/bone, AgingFactor progression | 5 |

**Total reactions: ~120** (varies by genome; the above counts are defaults).

### Organ Properties

Each organ has the following genome-encoded properties (see [GENOME.md](GENOME.md) for gene format):

| Property | Type | Range | Description |
|----------|------|-------|-------------|
| `health` | float | 0.0--1.0 | Current organ health; starts at 1.0 at birth |
| `degradation_rate` | float | 0.0001--0.01 | Base rate of health loss per tick (genome-encoded) |
| `reactions` | array | 2--8 entries | Genome-encoded chemical reactions this organ performs |
| `organ_id` | uint8 | 0--20 | Identifies which organ this gene defines |
| `clock_rate` | float | 0.5--2.0 | Multiplier on how often this organ evaluates reactions (1.0 = every tick) |

### Organ Health and Efficiency

Organ health directly scales the efficiency of all reactions run by that organ:

```
effective_rate = base_rate * organ_health
```

A heart at 0.5 health runs its ATP distribution reaction at half efficiency. This creates cascading effects: reduced heart health means less ATP everywhere, which impairs muscle function, brain activity, and all other organs that consume ATP.

### Critical Organs

Three organs are designated **critical** -- if any of them drops below 0.05 health, the creature dies:

- **Brain** (organ 0): below 0.05 = brain death
- **Heart** (organ 1): below 0.05 = cardiac failure
- **Lungs** (organ 2): below 0.05 = respiratory failure

---

## 6. Reaction System

Reactions are the core mechanism by which chemicals interact. Each reaction consumes substrate chemicals and produces product chemicals, modulated by a catalyst and governed by rate and threshold parameters.

### Reaction Format

```
substrate1 + substrate2 --[catalyst, rate, threshold]--> product1 + product2
```

Every reaction has 7 genome-encoded parameters:

| Parameter | Type | Description |
|-----------|------|-------------|
| `organ_id` | uint8 | Which organ runs this reaction (0--20) |
| `substrate1` | uint8 | Chemical ID of first input (0--255; 255 = none) |
| `substrate2` | uint8 | Chemical ID of second input (0--255; 255 = none) |
| `product1` | uint8 | Chemical ID of first output (0--255; 255 = none) |
| `product2` | uint8 | Chemical ID of second output (0--255; 255 = none) |
| `catalyst` | uint8 | Chemical ID that catalyzes this reaction (255 = always-on) |
| `rate` | float | Base reaction rate (0.0--1.0) |
| `threshold` | float | Catalyst concentration required for full rate (0.0--1.0) |

### Reaction Evaluation

Each tick, for each organ, for each reaction in that organ:

```typescript
function evaluateReaction(
    chemicals: Float32Array,
    reaction: Reaction,
    organHealth: number
): void {
    const sub1 = reaction.substrate1 !== 255 ? chemicals[reaction.substrate1] : 1.0;
    const sub2 = reaction.substrate2 !== 255 ? chemicals[reaction.substrate2] : 1.0;

    // Catalyst factor: ramps from 0 to 1 as catalyst approaches threshold
    let catalystFactor = 1.0;
    if (reaction.catalyst !== 255) {
        const catConc = chemicals[reaction.catalyst];
        catalystFactor = catConc >= reaction.threshold
            ? 1.0
            : catConc / reaction.threshold;
    }

    // Compute output amount
    const output = reaction.rate * Math.min(sub1, sub2) * catalystFactor * organHealth;

    // Consume substrates
    if (reaction.substrate1 !== 255) chemicals[reaction.substrate1] -= output;
    if (reaction.substrate2 !== 255) chemicals[reaction.substrate2] -= output;

    // Produce products
    if (reaction.product1 !== 255) chemicals[reaction.product1] += output;
    if (reaction.product2 !== 255) chemicals[reaction.product2] += output;

    // Clamp all affected chemicals to [0, 1]
    // ... (clamping omitted for brevity)
}
```

Key behaviors:

- **Single-substrate reactions**: set `substrate2 = 255`; the `min(sub1, sub2)` becomes just `sub1` since the absent substrate defaults to 1.0.
- **Uncatalyzed reactions**: set `catalyst = 255`; `catalystFactor` stays at 1.0 and the reaction always runs.
- **Organ health scaling**: a damaged organ produces less output from all its reactions.
- **Conservation is approximate**: products may not exactly equal substrates in quantity. This is intentional -- biological systems are not perfectly conservative, and it allows for energy "sources" (eating food) and "sinks" (waste excretion).

### Example Reactions by Organ

Below are representative default reactions for each organ. Actual reactions are genome-encoded and can vary between creatures and species.

#### Organ 0: Brain

| # | Substrate 1 | Substrate 2 | Catalyst | Product 1 | Product 2 | Rate | Threshold | Description |
|---|------------|------------|---------|----------|----------|------|-----------|-------------|
| 0 | ATP (20) | -- | -- | Reward (60) | -- | 0.05 | -- | Baseline reward from having energy |
| 1 | Pain (2) | -- | -- | Punishment (61) | -- | 0.15 | -- | Pain produces punishment signal |
| 2 | ATP (20) | -- | Curiosity (63) | LearningRate (62) | ADP (21) | 0.10 | 0.2 | Curiosity + energy boosts learning |
| 3 | Dopamine (34) | -- | -- | Reward (60) | -- | 0.20 | -- | Dopamine amplifies reward |
| 4 | Stress (15) | -- | -- | Punishment (61) | Cortisol (31) | 0.08 | -- | Stress produces punishment + cortisol |
| 5 | ATP (20) | -- | -- | Neuroplasticity (67) | ADP (21) | 0.03 | -- | Brain energy maintains plasticity |

#### Organ 1: Heart

| # | Substrate 1 | Substrate 2 | Catalyst | Product 1 | Product 2 | Rate | Threshold | Description |
|---|------------|------------|---------|----------|----------|------|-----------|-------------|
| 0 | Oxygen (22) | Glucose (16) | -- | ATP (20) | CO2 (23) | 0.25 | -- | Aerobic respiration: primary ATP source |
| 1 | ADP (21) | Oxygen (22) | -- | ATP (20) | -- | 0.15 | -- | ADP recycling |
| 2 | ATP (20) | -- | Adrenaline (32) | ATP (20) | -- | 0.10 | 0.3 | Adrenaline boosts circulation (ATP redistribution) |
| 3 | Glucose (16) | -- | -- | ATP (20) | Lactate (25) | 0.05 | -- | Anaerobic fallback when O2 low |

#### Organ 2: Lungs

| # | Substrate 1 | Substrate 2 | Catalyst | Product 1 | Product 2 | Rate | Threshold | Description |
|---|------------|------------|---------|----------|----------|------|-----------|-------------|
| 0 | -- | -- | -- | Oxygen (22) | -- | 0.30 | -- | Oxygen intake from environment |
| 1 | CO2 (23) | -- | -- | -- | -- | 0.30 | -- | CO2 expulsion (pure consumption) |
| 2 | -- | -- | Adrenaline (32) | Oxygen (22) | -- | 0.15 | 0.2 | Adrenaline increases breathing rate |

#### Organ 3: Stomach

| # | Substrate 1 | Substrate 2 | Catalyst | Product 1 | Product 2 | Rate | Threshold | Description |
|---|------------|------------|---------|----------|----------|------|-----------|-------------|
| 0 | -- | -- | -- | Glucose (16) | Protein (19) | 0.00 | -- | Food conversion (rate set externally by eat action) |
| 1 | Glucose (16) | -- | -- | -- | Nausea (10) | 0.02 | -- | Excess glucose causes nausea |
| 2 | Alcohol (44) | -- | -- | Nausea (10) | -- | 0.20 | -- | Alcohol causes nausea |
| 3 | -- | -- | -- | Bile (27) | -- | 0.01 | -- | Residual bile demand signal |

#### Organ 4: Intestine

| # | Substrate 1 | Substrate 2 | Catalyst | Product 1 | Product 2 | Rate | Threshold | Description |
|---|------------|------------|---------|----------|----------|------|-----------|-------------|
| 0 | Glucose (16) | -- | Insulin (28) | Glycogen (17) | -- | 0.15 | 0.2 | Insulin-mediated glucose storage |
| 1 | Fat (18) | Bile (27) | -- | Glucose (16) | -- | 0.08 | -- | Bile-assisted fat digestion |
| 2 | Protein (19) | -- | -- | Glucose (16) | Urea (26) | 0.05 | -- | Protein catabolism |
| 3 | Glucose (16) | -- | -- | Fat (18) | -- | 0.03 | -- | Excess glucose -> fat storage |
| 4 | Water (24) | -- | -- | -- | -- | 0.10 | -- | Water absorption |

#### Organ 5: Liver

| # | Substrate 1 | Substrate 2 | Catalyst | Product 1 | Product 2 | Rate | Threshold | Description |
|---|------------|------------|---------|----------|----------|------|-----------|-------------|
| 0 | Glycogen (17) | -- | Glucagon (29) | Glucose (16) | -- | 0.20 | 0.2 | Glucagon-mediated glycogen breakdown |
| 1 | Glucose (16) | -- | Insulin (28) | Glycogen (17) | -- | 0.15 | 0.3 | Insulin-mediated glycogen synthesis |
| 2 | Alcohol (44) | -- | -- | -- | CellDamage (78) | 0.10 | -- | Alcohol detox (damages liver) |
| 3 | HeavyMetal (50) | -- | -- | -- | CellDamage (78) | 0.05 | -- | Heavy metal detox |
| 4 | Lactate (25) | Oxygen (22) | -- | Glucose (16) | -- | 0.12 | -- | Lactate recycling (Cori cycle) |
| 5 | -- | -- | -- | Bile (27) | -- | 0.08 | -- | Bile production |
| 6 | Cyanide (45) | -- | -- | -- | CellDamage (78) | 0.15 | -- | Cyanide detox attempt |
| 7 | Venom (48) | -- | -- | -- | CellDamage (78) | 0.08 | -- | Venom detox attempt |

#### Organ 6: Kidneys

| # | Substrate 1 | Substrate 2 | Catalyst | Product 1 | Product 2 | Rate | Threshold | Description |
|---|------------|------------|---------|----------|----------|------|-----------|-------------|
| 0 | Urea (26) | Water (24) | -- | -- | -- | 0.15 | -- | Urea excretion |
| 1 | Water (24) | -- | Vasopressin (40) | Water (24) | -- | 0.10 | 0.3 | Vasopressin water reabsorption |
| 2 | HeavyMetal (50) | Water (24) | -- | -- | -- | 0.05 | -- | Heavy metal excretion |
| 3 | -- | -- | -- | -- | Thirst (14) | 0.02 | -- | Low water triggers thirst (rate modulated externally) |
| 4 | Water (24) | -- | -- | -- | -- | 0.05 | -- | Baseline water excretion |

#### Organ 7: Muscles

| # | Substrate 1 | Substrate 2 | Catalyst | Product 1 | Product 2 | Rate | Threshold | Description |
|---|------------|------------|---------|----------|----------|------|-----------|-------------|
| 0 | ATP (20) | -- | -- | ADP (21) | Lactate (25) | 0.00 | -- | Movement energy (rate set by motor output) |
| 1 | Protein (19) | GrowthHormone (30) | -- | -- | -- | 0.05 | -- | Muscle growth consumes protein |
| 2 | Glucose (16) | -- | -- | ATP (20) | Lactate (25) | 0.08 | -- | Local muscle glycolysis |
| 3 | Lactate (25) | Oxygen (22) | -- | ATP (20) | CO2 (23) | 0.06 | -- | Lactate oxidation recovery |

#### Organ 8: Skin

| # | Substrate 1 | Substrate 2 | Catalyst | Product 1 | Product 2 | Rate | Threshold | Description |
|---|------------|------------|---------|----------|----------|------|-----------|-------------|
| 0 | -- | -- | -- | Coldness (12) | -- | 0.00 | -- | Cold sensing (rate set by environment) |
| 1 | -- | -- | -- | Hotness (13) | -- | 0.00 | -- | Heat sensing (rate set by environment) |
| 2 | -- | -- | -- | Pain (2) | Histamine (46) | 0.00 | -- | Injury response (rate set by damage events) |

#### Organ 9: Eyes

No chemical reactions. Sensory input only; see [BRAIN.md](BRAIN.md) for visual processing.

#### Organ 10: Immune System

| # | Substrate 1 | Substrate 2 | Catalyst | Product 1 | Product 2 | Rate | Threshold | Description |
|---|------------|------------|---------|----------|----------|------|-----------|-------------|
| 0 | WhiteBloodCells (55) | Pathogen (51) | -- | -- | Inflammation (56) | 0.20 | -- | WBC attacks pathogen |
| 1 | AntibodyA (52) | Pathogen (51) | -- | -- | -- | 0.25 | -- | Antibody A neutralizes pathogen |
| 2 | AntibodyB (53) | Pathogen (51) | -- | -- | -- | 0.25 | -- | Antibody B neutralizes pathogen |
| 3 | AntibodyC (54) | Pathogen (51) | -- | -- | -- | 0.25 | -- | Antibody C neutralizes pathogen |
| 4 | Inflammation (56) | -- | -- | Fever (57) | Pain (2) | 0.15 | -- | Inflammation triggers fever and pain |
| 5 | Pathogen (51) | -- | Interferon (58) | -- | -- | 0.10 | 0.2 | Interferon slows pathogen |
| 6 | Complement (59) | Pathogen (51) | -- | -- | -- | 0.30 | -- | Complement cascade destroys pathogen |
| 7 | Pathogen (51) | -- | -- | -- | AntibodyA (52) | 0.02 | -- | Pathogen exposure builds antibodies |

#### Organ 11: Endocrine

| # | Substrate 1 | Substrate 2 | Catalyst | Product 1 | Product 2 | Rate | Threshold | Description |
|---|------------|------------|---------|----------|----------|------|-----------|-------------|
| 0 | ATP (20) | -- | -- | Serotonin (33) | ADP (21) | 0.06 | -- | Baseline serotonin production |
| 1 | Reward (60) | -- | -- | Dopamine (34) | -- | 0.15 | -- | Reward drives dopamine production |
| 2 | Pain (2) | -- | -- | Endorphin (35) | -- | 0.10 | -- | Pain triggers endorphin release |
| 3 | -- | -- | -- | Melatonin (36) | -- | 0.00 | -- | Melatonin (rate set by light cycle) |
| 4 | Oxytocin (39) | -- | -- | Comfort (8) | -- | 0.12 | -- | Oxytocin promotes comfort |
| 5 | Serotonin (33) | -- | -- | Comfort (8) | -- | 0.08 | -- | Serotonin promotes comfort |

#### Organ 12: Reproductive

| # | Substrate 1 | Substrate 2 | Catalyst | Product 1 | Product 2 | Rate | Threshold | Description |
|---|------------|------------|---------|----------|----------|------|-----------|-------------|
| 0 | ATP (20) | -- | -- | Testosterone (37) | ADP (21) | 0.04 | -- | Testosterone production (male) |
| 1 | ATP (20) | -- | -- | Estrogen (38) | ADP (21) | 0.04 | -- | Estrogen production (female) |
| 2 | Testosterone (37) | -- | -- | SexDrive (7) | -- | 0.10 | -- | Testosterone drives libido |
| 3 | Estrogen (38) | -- | -- | Fertility (68) | EggMaturation (74) | 0.08 | -- | Estrogen drives fertility cycle |
| 4 | -- | -- | PregnancyHormone (69) | GestationProgress (73) | -- | 0.01 | 0.3 | Gestation progression |
| 5 | -- | -- | -- | MatingPheromone (71) | -- | 0.03 | -- | Pheromone emission (modulated by sex hormones) |
| 6 | Fertility (68) | -- | -- | SpermCount (75) | -- | 0.05 | -- | Sperm production (male) |

#### Organ 13: Fat Storage

| # | Substrate 1 | Substrate 2 | Catalyst | Product 1 | Product 2 | Rate | Threshold | Description |
|---|------------|------------|---------|----------|----------|------|-----------|-------------|
| 0 | Glucose (16) | -- | Insulin (28) | Fat (18) | -- | 0.08 | 0.3 | Insulin-mediated fat storage |
| 1 | Fat (18) | -- | Glucagon (29) | Glucose (16) | -- | 0.06 | 0.2 | Glucagon-mediated fat mobilization |
| 2 | Fat (18) | -- | -- | Leptin (42) | -- | 0.05 | -- | Fat stores produce leptin |
| 3 | -- | -- | -- | Ghrelin (43) | -- | 0.03 | -- | Low glucose triggers ghrelin (modulated externally) |

#### Organ 14: Bone Marrow

| # | Substrate 1 | Substrate 2 | Catalyst | Product 1 | Product 2 | Rate | Threshold | Description |
|---|------------|------------|---------|----------|----------|------|-----------|-------------|
| 0 | ATP (20) | Protein (19) | -- | WhiteBloodCells (55) | ADP (21) | 0.08 | -- | WBC production |
| 1 | ATP (20) | -- | Inflammation (56) | WhiteBloodCells (55) | ADP (21) | 0.15 | 0.2 | Inflammation boosts WBC production |
| 2 | Protein (19) | -- | -- | Complement (59) | -- | 0.04 | -- | Complement synthesis |
| 3 | ATP (20) | -- | -- | Interferon (58) | ADP (21) | 0.03 | -- | Interferon baseline production |

#### Organ 15: Thyroid

| # | Substrate 1 | Substrate 2 | Catalyst | Product 1 | Product 2 | Rate | Threshold | Description |
|---|------------|------------|---------|----------|----------|------|-----------|-------------|
| 0 | ATP (20) | -- | -- | Thyroid (41) | ADP (21) | 0.06 | -- | Thyroid hormone production |
| 1 | Thyroid (41) | -- | -- | -- | -- | 0.02 | -- | Thyroid self-regulation (negative feedback) |
| 2 | Thyroid (41) | Glucose (16) | -- | ATP (20) | CO2 (23) | 0.05 | -- | Thyroid boosts metabolic rate |

#### Organ 16: Adrenal Glands

| # | Substrate 1 | Substrate 2 | Catalyst | Product 1 | Product 2 | Rate | Threshold | Description |
|---|------------|------------|---------|----------|----------|------|-----------|-------------|
| 0 | ATP (20) | -- | Fear (6) | Adrenaline (32) | ADP (21) | 0.20 | 0.2 | Fear triggers adrenaline |
| 1 | ATP (20) | -- | Stress (15) | Adrenaline (32) | ADP (21) | 0.15 | 0.3 | Stress triggers adrenaline |
| 2 | ATP (20) | -- | Stress (15) | Cortisol (31) | ADP (21) | 0.12 | 0.2 | Stress triggers cortisol |
| 3 | Cortisol (31) | -- | -- | Glucose (16) | -- | 0.08 | -- | Cortisol mobilizes glucose |

#### Organ 17: Pancreas

| # | Substrate 1 | Substrate 2 | Catalyst | Product 1 | Product 2 | Rate | Threshold | Description |
|---|------------|------------|---------|----------|----------|------|-----------|-------------|
| 0 | ATP (20) | -- | Glucose (16) | Insulin (28) | ADP (21) | 0.15 | 0.4 | High glucose triggers insulin |
| 1 | ATP (20) | -- | -- | Glucagon (29) | ADP (21) | 0.10 | -- | Low glucose triggers glucagon (inversely modulated) |
| 2 | Insulin (28) | Glucagon (29) | -- | -- | -- | 0.20 | -- | Insulin and glucagon counteract each other |
| 3 | -- | -- | -- | -- | Hunger (0) | 0.01 | -- | Low glucose baseline hunger signal |

#### Organ 18: Nervous System

| # | Substrate 1 | Substrate 2 | Catalyst | Product 1 | Product 2 | Rate | Threshold | Description |
|---|------------|------------|---------|----------|----------|------|-----------|-------------|
| 0 | Pain (2) | -- | -- | Stress (15) | -- | 0.12 | -- | Pain causes stress |
| 1 | Pain (2) | -- | Endorphin (35) | -- | -- | 0.15 | 0.2 | Endorphin suppresses pain |
| 2 | Fear (6) | -- | Serotonin (33) | -- | -- | 0.10 | 0.3 | Serotonin calms fear |
| 3 | Anger (5) | -- | Serotonin (33) | -- | -- | 0.08 | 0.3 | Serotonin calms anger |
| 4 | ATP (20) | -- | -- | Sensitization (65) | ADP (21) | 0.02 | -- | Energy maintains neural sensitivity |

#### Organ 19: Spleen

| # | Substrate 1 | Substrate 2 | Catalyst | Product 1 | Product 2 | Rate | Threshold | Description |
|---|------------|------------|---------|----------|----------|------|-----------|-------------|
| 0 | Inflammation (56) | -- | -- | -- | -- | 0.10 | -- | Inflammation clearance |
| 1 | WhiteBloodCells (55) | -- | -- | -- | Protein (19) | 0.03 | -- | Old WBC recycling |
| 2 | CellDamage (78) | -- | -- | -- | -- | 0.02 | -- | Damaged cell clearance |
| 3 | ATP (20) | -- | Inflammation (56) | WhiteBloodCells (55) | ADP (21) | 0.05 | 0.3 | Emergency WBC release |

#### Organ 20: Growth Plates

| # | Substrate 1 | Substrate 2 | Catalyst | Product 1 | Product 2 | Rate | Threshold | Description |
|---|------------|------------|---------|----------|----------|------|-----------|-------------|
| 0 | Protein (19) | GrowthHormone (30) | -- | -- | -- | 0.06 | -- | Protein + GH consumed for body growth |
| 1 | -- | -- | -- | AgingFactor (77) | -- | 0.001 | -- | Slow constant aging |
| 2 | AgingFactor (77) | -- | -- | CellDamage (78) | -- | 0.02 | -- | Aging causes cell damage |
| 3 | CellDamage (78) | ATP (20) | -- | RepairEnzyme (79) | ADP (21) | 0.05 | -- | Damage triggers repair |
| 4 | RepairEnzyme (79) | CellDamage (78) | -- | -- | -- | 0.10 | -- | Repair enzyme fixes cell damage |

---

## 7. Emitter/Receptor System

The emitter/receptor system is the critical bridge between the creature's **brain** (neural network) and its **body** (chemical simulation). Without this coupling, the brain would operate in isolation from the body and vice versa.

See [BRAIN.md](BRAIN.md) for the neural architecture and lobe definitions.

### Emitters

Emitters convert neural activity into chemical production. Each emitter is a genome-encoded gene with the following structure:

| Field | Type | Description |
|-------|------|-------------|
| `lobe_id` | uint8 | Which brain lobe contains the source neuron |
| `neuron_id` | uint8 | Which neuron within the lobe to monitor |
| `threshold` | float | Minimum neuron activation to trigger emission |
| `chemical_id` | uint8 | Which chemical to emit (0--79) |
| `rate` | float | How much chemical to add per tick when triggered |
| `proportional` | bool | If true, emission scales with neuron activation; if false, flat rate above threshold |

**Emitter behavior per tick:**

```typescript
function processEmitter(emitter: EmitterGene, brain: Brain, chemicals: Float32Array): void {
    const activation = brain.lobes[emitter.lobe_id].neurons[emitter.neuron_id].output;
    if (activation > emitter.threshold) {
        const amount = emitter.proportional
            ? emitter.rate * activation
            : emitter.rate;
        chemicals[emitter.chemical_id] += amount;
    }
}
```

### Receptors

Receptors modulate neural activity based on chemical concentrations. Each receptor is a genome-encoded gene:

| Field | Type | Description |
|-------|------|-------------|
| `chemical_id` | uint8 | Which chemical to read (0--79) |
| `threshold` | float | Minimum concentration to trigger modulation |
| `lobe_id` | uint8 | Which brain lobe to modulate |
| `neuron_id` | uint8 | Which neuron to modulate (255 = all neurons in lobe) |
| `gain` | float | Multiplier applied to the neuron's input/output |
| `mode` | enum | `excitatory` (increases activation) or `inhibitory` (decreases activation) |

**Receptor behavior per tick:**

```typescript
function processReceptor(receptor: ReceptorGene, brain: Brain, chemicals: Float32Array): void {
    const concentration = chemicals[receptor.chemical_id];
    if (concentration > receptor.threshold) {
        const modulation = receptor.gain * concentration;
        if (receptor.neuron_id === 255) {
            // Modulate all neurons in lobe
            for (const neuron of brain.lobes[receptor.lobe_id].neurons) {
                applyModulation(neuron, modulation, receptor.mode);
            }
        } else {
            applyModulation(
                brain.lobes[receptor.lobe_id].neurons[receptor.neuron_id],
                modulation,
                receptor.mode
            );
        }
    }
}
```

### Key Emitter/Receptor Couplings

These are the default genome-encoded couplings that link specific brain regions to specific chemicals. Genomes can modify, add, or remove these couplings.

#### Drive Lobe Receptors (chemicals -> brain)

The Drive lobe has 16 neurons, one per drive. Each is driven by its corresponding drive chemical:

| Receptor | Chemical | Lobe | Neuron | Gain | Mode | Description |
|----------|----------|------|--------|------|------|-------------|
| R0 | Hunger (0) | Drive | 0 | 1.0 | excitatory | Hunger chemical activates hunger drive neuron |
| R1 | Tiredness (1) | Drive | 1 | 1.0 | excitatory | Tiredness activates tiredness drive neuron |
| R2 | Pain (2) | Drive | 2 | 1.2 | excitatory | Pain strongly activates pain drive neuron |
| R3 | Loneliness (3) | Drive | 3 | 0.8 | excitatory | Loneliness activates loneliness drive neuron |
| R4 | Boredom (4) | Drive | 4 | 0.7 | excitatory | Boredom activates boredom drive neuron |
| R5 | Anger (5) | Drive | 5 | 1.0 | excitatory | Anger activates anger drive neuron |
| R6 | Fear (6) | Drive | 6 | 1.3 | excitatory | Fear strongly activates fear drive neuron |
| R7 | SexDrive (7) | Drive | 7 | 0.9 | excitatory | Sex drive activates mating drive neuron |
| R8 | Comfort (8) | Drive | 8 | 0.6 | inhibitory | Comfort reduces drive (satisfaction signal) |
| R9 | Crowding (9) | Drive | 9 | 0.8 | excitatory | Crowding activates withdrawal drive |
| R10 | Nausea (10) | Drive | 10 | 1.0 | excitatory | Nausea activates food-avoidance drive |
| R11 | Sleepiness (11) | Drive | 11 | 1.1 | excitatory | Sleepiness activates sleep drive |
| R12 | Coldness (12) | Drive | 12 | 0.9 | excitatory | Cold activates warmth-seeking drive |
| R13 | Hotness (13) | Drive | 13 | 0.9 | excitatory | Heat activates cooling drive |
| R14 | Thirst (14) | Drive | 14 | 1.0 | excitatory | Thirst activates water-seeking drive |
| R15 | Stress (15) | Drive | 15 | 1.0 | excitatory | Stress activates general avoidance drive |

#### Decision Lobe Emitters (brain -> chemicals)

When the Decision lobe selects an action, associated emitters fire:

| Emitter | Lobe | Neuron | Chemical | Rate | Threshold | Description |
|---------|------|--------|----------|------|-----------|-------------|
| E0 | Decision | "fight" | Adrenaline (32) | 0.15 | 0.5 | Fighting decision emits adrenaline |
| E1 | Decision | "flee" | Adrenaline (32) | 0.20 | 0.4 | Fleeing decision emits more adrenaline |
| E2 | Decision | "eat" | Insulin (28) | 0.05 | 0.3 | Eating decision primes insulin |
| E3 | Decision | "sleep" | Melatonin (36) | 0.10 | 0.5 | Sleep decision promotes melatonin |
| E4 | Decision | "mate" | Oxytocin (39) | 0.08 | 0.5 | Mating decision promotes bonding |
| E5 | Decision | "explore" | Curiosity (63) | 0.10 | 0.3 | Exploration decision boosts curiosity |

#### Reward/Punishment Emitters (brain -> chemicals)

The brain's reward circuitry produces learning chemicals:

| Emitter | Lobe | Neuron | Chemical | Rate | Threshold | Description |
|---------|------|--------|----------|------|-----------|-------------|
| E6 | Reward | 0 | Reward (60) | 0.20 | 0.3 | Positive outcome emits reward signal |
| E7 | Reward | 1 | Punishment (61) | 0.20 | 0.3 | Negative outcome emits punishment signal |
| E8 | Reward | 0 | Dopamine (34) | 0.10 | 0.4 | Strong positive outcome emits dopamine |
| E9 | Reward | 1 | Endorphin (35) | 0.05 | 0.5 | Punishment triggers small endorphin response |

#### Hormonal Modulation Receptors (chemicals -> brain)

Hormones broadly modulate brain lobe activity:

| Receptor | Chemical | Lobe | Neuron | Gain | Mode | Description |
|----------|----------|------|--------|------|------|-------------|
| R16 | Adrenaline (32) | Attention | all (255) | 0.5 | excitatory | Adrenaline sharpens attention |
| R17 | Serotonin (33) | Concept | all (255) | 0.3 | excitatory | Serotonin enhances concept formation |
| R18 | Cortisol (31) | Attention | all (255) | 0.4 | excitatory | Cortisol narrows attention focus |
| R19 | Melatonin (36) | Decision | all (255) | 0.6 | inhibitory | Melatonin suppresses decision-making (sleep) |
| R20 | Dopamine (34) | Concept | all (255) | 0.4 | excitatory | Dopamine enhances associative thinking |
| R21 | LearningRate (62) | all lobes | all (255) | 0.3 | excitatory | LearningRate globally modulates plasticity |
| R22 | Neuroplasticity (67) | all lobes | all (255) | 0.2 | excitatory | Plasticity enables synaptic modification |

---

## 8. Drive System

The 16 drives are the creature's primary motivational system. Each drive is computed from a weighted combination of chemical concentrations and fed into the brain's Drive lobe, where it competes with other drives for behavioral priority.

### Drive Computation

Each drive value is computed as:

```
drive_value = clamp(w1 * chem1 + w2 * chem2 + w3 * chem3, 0.0, 1.0)
```

The drive value is then written to the corresponding neuron in the Drive lobe via the receptor system described in Section 7.

### Drive-to-Chemical Mapping

| Drive ID | Drive Name | Chemical 1 (weight) | Chemical 2 (weight) | Chemical 3 (weight) | Notes |
|----------|-----------|---------------------|---------------------|---------------------|-------|
| 0 | Hunger | Ghrelin 43 (0.5) | -Glucose 16 (0.4) | -Leptin 42 (0.3) | Rises with ghrelin, falls with glucose and leptin |
| 1 | Tiredness | Tiredness 1 (0.6) | ADP 21 (0.3) | Lactate 25 (0.2) | Direct accumulation + metabolic fatigue signals |
| 2 | Pain | Pain 2 (0.8) | Inflammation 56 (0.2) | -- | Primarily direct pain signal |
| 3 | Loneliness | Loneliness 3 (0.7) | -Oxytocin 39 (0.3) | -- | Rises in isolation, reduced by bonding |
| 4 | Boredom | Boredom 4 (0.6) | -Curiosity 63 (0.2) | -Dopamine 34 (0.3) | Falls with engagement and reward |
| 5 | Anger | Anger 5 (0.6) | Cortisol 31 (0.2) | -Serotonin 33 (0.3) | Amplified by stress, calmed by serotonin |
| 6 | Fear | Fear 6 (0.7) | Adrenaline 32 (0.2) | -Serotonin 33 (0.2) | Amplified by adrenaline, calmed by serotonin |
| 7 | SexDrive | SexDrive 7 (0.5) | Testosterone 37 (0.3) | Estrogen 38 (0.3) | Driven by sex hormones |
| 8 | Comfort | Comfort 8 (0.4) | Serotonin 33 (0.3) | Endorphin 35 (0.3) | Inverse drive: high = satisfied |
| 9 | Crowding | Crowding 9 (0.8) | -Oxytocin 39 (0.2) | -- | Direct spatial signal, bonding reduces it |
| 10 | Nausea | Nausea 10 (0.7) | Histamine 46 (0.2) | Alcohol 44 (0.2) | Toxin and immune mediated |
| 11 | Sleepiness | Sleepiness 11 (0.5) | Melatonin 36 (0.4) | Tiredness 1 (0.2) | Melatonin + tiredness convergence |
| 12 | Coldness | Coldness 12 (0.9) | -- | -- | Almost purely environmental signal |
| 13 | Hotness | Hotness 13 (0.9) | -- | -- | Almost purely environmental signal |
| 14 | Thirst | Thirst 14 (0.6) | -Water 24 (0.4) | -- | Direct thirst + low water |
| 15 | Stress | Stress 15 (0.3) | Cortisol 31 (0.3) | Pain 2 (0.2) | Meta-drive computed from multiple sources |

Note: Negative weights (prefixed with `-`) mean the chemical *reduces* the drive. For example, Glucose at 0.5 contributes -0.20 to Hunger (i.e., reduces it).

### Drive-Behavior Loop

The drive system creates behavioral pressure through this cycle:

1. **Chemical state** produces drive values (e.g., low Glucose -> high Hunger drive)
2. **Drive lobe neurons** activate proportionally to drive values
3. **Decision lobe** weighs active drives against available actions
4. **Selected action** is executed (e.g., move toward food, eat food)
5. **Action consequences** change chemical state (e.g., eating food -> Glucose rises)
6. **Drive decreases** as the underlying chemical need is satisfied
7. **Other drives** may now take priority (e.g., once fed, Boredom becomes highest)

This cycle ensures creatures continuously pursue their most pressing need without explicit scripting.

---

## 9. Disease and Immune System

The disease/immune system provides environmental challenge, emergent illness behavior, and genome-selectable vulnerability. Creatures can get sick, recover, develop immunity, and even die from untreated infections.

### Pathogen Exposure

Pathogens enter the creature's chemistry from environmental sources:

| Source | Mechanism | Rate |
|--------|-----------|------|
| Contaminated food | Eating spoiled or toxic food items | +0.1--0.3 Pathogen per event |
| Sick creatures | Proximity to creature with Pathogen > 0.3 | +0.01 per tick while in range |
| Environmental zones | Certain map areas are disease hotspots | +0.005 per tick while in zone |
| Injury | Open wounds (Pain > 0.5) increase infection risk | +0.01 per tick while injured |

### Immune Response Cascade

When Pathogen concentration rises, the immune system activates in stages:

```
Stage 1: Pathogen > 0.05
  -> WhiteBloodCells begin attacking (Organ 10, Reaction 0)
  -> Inflammation begins rising

Stage 2: Pathogen > 0.15
  -> Inflammation triggers Fever (Organ 10, Reaction 4)
  -> Fever increases metabolic rate (ATP consumption +20%)
  -> Interferon production increases (Organ 14, Reaction 3)

Stage 3: Pathogen > 0.30
  -> Antibody production accelerates (Organ 10, Reaction 7)
  -> Complement cascade activates (Organ 10, Reaction 6)
  -> Creature shows sickness behavior: reduced movement, increased Sleepiness

Stage 4: Pathogen > 0.60
  -> Severe illness: organ damage begins
  -> CellDamage rises rapidly
  -> LifeForce begins declining
  -> Without treatment or immune success, death is possible
```

### Fever Mechanics

Fever is triggered when Inflammation exceeds a threshold (default 0.3):

```typescript
// In Organ 10, Reaction 4
if (chemicals[INFLAMMATION] > 0.3) {
    chemicals[FEVER] += 0.15 * chemicals[INFLAMMATION];
}
```

Fever effects:

| Fever Level | Effect |
|-------------|--------|
| 0.0--0.2 | No noticeable effect |
| 0.2--0.4 | Metabolic rate +10%; immune reaction rates +15% |
| 0.4--0.6 | Metabolic rate +25%; immune reaction rates +25%; Tiredness +0.02/tick |
| 0.6--0.8 | Metabolic rate +40%; immune reaction rates +30%; Pain +0.01/tick |
| 0.8--1.0 | Dangerous: CellDamage +0.01/tick; organ degradation accelerates |

Fever is a double-edged sword: it helps fight infection but consumes resources and can cause damage if sustained too long.

### Allergic Reactions

Allergies are genome-encoded sensitivities. A creature's genome may contain allergy genes that specify:

| Field | Type | Description |
|-------|------|-------------|
| `trigger_chemical` | uint8 | Environmental chemical that triggers the allergy (typically Allergen 47) |
| `sensitivity` | float | How strongly the creature reacts (0.0--1.0) |
| `response_chemical` | uint8 | Usually Histamine (46) |
| `response_rate` | float | How much Histamine is produced per unit of trigger chemical |

Allergic cascade:

```
Allergen exposure -> Histamine release -> Inflammation + Nausea + Pain
                                       -> If severe: swelling reduces Oxygen intake
```

Allergy sensitivity is heritable: offspring may inherit, gain, or lose allergies through genomic crossover and mutation. See [GENOME.md](GENOME.md).

### Vaccine/Immunity Mechanic

Exposure to low levels of Pathogen (below Stage 2 threshold) builds antibody memory:

1. Small Pathogen exposure (0.05--0.15) triggers slow Antibody production (Organ 10, Reaction 7)
2. Antibody production rate is low (0.02), but Antibody half-life is very long (150 ticks for immune chemicals)
3. On subsequent exposure, existing Antibodies neutralize Pathogen faster
4. Effectively, a creature that survived a mild illness becomes more resistant

Antibody variants (A, B, C) allow for multiple disease strains. Each antibody is most effective against its corresponding pathogen variant, encoded in the genome's immune genes.

---

## 10. Aging and Organ Degradation

Every creature ages, and aging inexorably degrades organ function, accumulates cell damage, and ultimately leads to death. The aging system ensures no creature lives forever and creates generational turnover.

### AgingFactor Progression

AgingFactor (slot 77) increases monotonically from near-zero at birth to 1.0 at extreme old age:

```
// Organ 20 (Growth Plates), Reaction 1
AgingFactor += 0.001 per tick (base rate, genome-modifiable)
```

At 0.001 per tick and 20 ticks/second, AgingFactor reaches:

| Real Time | Ticks | AgingFactor | Life Stage |
|-----------|-------|-------------|------------|
| 0 min | 0 | 0.00 | Newborn |
| 5 min | 6,000 | ~0.05 | Infant (high Neuroplasticity, high GrowthHormone) |
| 15 min | 18,000 | ~0.15 | Child (learning phase, rapid growth) |
| 30 min | 36,000 | ~0.30 | Adolescent (sexual maturity begins) |
| 60 min | 72,000 | ~0.55 | Adult (peak function, reproductive prime) |
| 90 min | 108,000 | ~0.75 | Middle-aged (organ degradation noticeable) |
| 120 min | 144,000 | ~0.90 | Elderly (significant organ decline) |
| 150 min | 180,000 | ~0.98 | Ancient (near death from accumulated damage) |

Note: AgingFactor also slowly decays due to its own half-life (500 ticks), so the actual progression is slightly slower than pure accumulation. The rate of 0.001/tick is calibrated against the 500-tick half-life to produce the progression above.

### Organ Degradation

Each organ loses health over time, scaled by the creature's AgingFactor:

```
organ.health -= organ.degradation_rate * AgingFactor * dt
```

- `degradation_rate` is genome-encoded per organ (default 0.0001--0.001)
- Young creatures (low AgingFactor) experience negligible degradation
- Old creatures (high AgingFactor) experience accelerating degradation
- Damaged organs are less efficient at running reactions (Section 5)

Example degradation rates (defaults):

| Organ | Default Degradation Rate | Notes |
|-------|------------------------|-------|
| Brain (0) | 0.0002 | Slow degradation; cognitive decline in old age |
| Heart (1) | 0.0003 | Moderate; cardiovascular aging |
| Lungs (2) | 0.0003 | Moderate; respiratory decline |
| Stomach (3) | 0.0001 | Slow; digestive resilience |
| Intestine (4) | 0.0001 | Slow |
| Liver (5) | 0.0004 | Faster if processing toxins (CellDamage amplifies) |
| Kidneys (6) | 0.0003 | Moderate |
| Muscles (7) | 0.0002 | Slow; sarcopenia in old age |
| Skin (8) | 0.0001 | Very slow |
| Eyes (9) | 0.0002 | Slow |
| Immune System (10) | 0.0005 | Relatively fast; immune senescence |
| Endocrine (11) | 0.0002 | Slow |
| Reproductive (12) | 0.0006 | Fast; fertility window is limited |
| Fat Storage (13) | 0.0001 | Very slow |
| Bone Marrow (14) | 0.0003 | Moderate |
| Thyroid (15) | 0.0002 | Slow |
| Adrenal Glands (16) | 0.0002 | Slow |
| Pancreas (17) | 0.0003 | Moderate |
| Nervous System (18) | 0.0002 | Slow |
| Spleen (19) | 0.0002 | Slow |
| Growth Plates (20) | 0.0008 | Fast; growth plates close with age |

### Cell Damage and Repair

CellDamage (slot 78) accumulates from multiple sources:

| Source | Rate | Mechanism |
|--------|------|-----------|
| Aging | 0.02 * AgingFactor/tick | Organ 20, Reaction 2 |
| Toxins | varies by toxin | Liver reactions (Organ 5) |
| Radiation | 0.05 * Radiation/tick | Direct cellular damage |
| Fever | 0.01/tick when Fever > 0.8 | Hyperthermia damage |
| Oxygen deprivation | 0.03/tick when O2 < 0.1 | Ischemic damage |

RepairEnzyme (slot 79) counteracts CellDamage:

```
// Organ 20, Reaction 4
CellDamage -= 0.10 * min(RepairEnzyme, CellDamage)  // repair neutralizes damage
```

However, RepairEnzyme production declines with age:

```
effective_repair_production = base_rate * (1.0 - AgingFactor * 0.8)
```

This means:

- Young creatures repair almost all cell damage quickly
- Middle-aged creatures accumulate damage slowly
- Old creatures accumulate damage faster than they can repair it

### Death Conditions

A creature dies when ANY of these conditions is met:

| Condition | Threshold | Description |
|-----------|-----------|-------------|
| LifeForce < 0.01 | 0.01 | General vitality exhausted |
| Brain health < 0.05 | 0.05 | Brain death |
| Heart health < 0.05 | 0.05 | Cardiac failure |
| Lungs health < 0.05 | 0.05 | Respiratory failure |

LifeForce (slot 76) drains from:

```
LifeForce -= 0.001 * CellDamage * AgingFactor per tick  // chronic damage
LifeForce -= 0.01 * Cyanide per tick                     // acute toxin
LifeForce -= 0.005 * (1.0 - min(ATP, 0.1) / 0.1)        // energy starvation
```

LifeForce does not regenerate. Once lost, it is gone permanently. This ensures creatures have a finite maximum lifespan even under ideal conditions.

---

## 11. Implementation Notes

### Data Layout

```typescript
interface CreatureBiochemistry {
    chemicals: Float32Array;       // 256 slots; [0..79] active
    halfLives: Float32Array;       // 256 slots; decay rates per chemical
    organs: OrganState[];          // 21 organs
    emitters: EmitterGene[];       // genome-decoded emitter genes
    receptors: ReceptorGene[];     // genome-decoded receptor genes
}

interface OrganState {
    id: number;                    // 0--20
    health: number;                // 0.0--1.0
    degradationRate: number;       // genome-encoded
    clockRate: number;             // genome-encoded
    reactions: Reaction[];         // 2--8 genome-encoded reactions
}

interface Reaction {
    substrate1: number;            // chemical ID (255 = none)
    substrate2: number;            // chemical ID (255 = none)
    product1: number;              // chemical ID (255 = none)
    product2: number;              // chemical ID (255 = none)
    catalyst: number;              // chemical ID (255 = always-on)
    rate: number;                  // 0.0--1.0
    threshold: number;             // catalyst threshold (0.0--1.0)
}
```

### Performance Budget

The biochemistry system is designed to be lightweight. At 50 creatures per world:

| Operation | Per Creature | Per Tick (50 creatures) | Notes |
|-----------|-------------|------------------------|-------|
| Decay pass | 80 multiply+clamp | 4,000 operations | Single tight loop over chemicals array |
| Reaction evaluation | ~120 reactions | 6,000 reactions | Each reaction: 2 reads, 1 min, 1 multiply, 2 writes |
| Emitter processing | ~20 emitters | 1,000 emitters | Each: 1 read, 1 compare, 1 add |
| Receptor processing | ~25 receptors | 1,250 receptors | Each: 1 read, 1 compare, 1 multiply |
| Organ degradation | 21 organs | 1,050 operations | Each: 1 multiply, 1 subtract |
| **Total** | **~266 operations** | **~13,300 operations** | **Well under 1ms per tick** |

All operations are simple arithmetic on flat arrays -- no allocations, no branching beyond `if` comparisons, no complex data structures. The `Float32Array` layout is cache-friendly and SIMD-amenable.

### Tick Order

The biochemistry update follows a strict order each tick to ensure deterministic behavior:

```
1. Apply half-life decay to all 80 chemicals
2. For each organ (0--20):
   a. Evaluate all reactions in this organ
   b. Apply organ degradation
3. Process all emitter genes (brain -> chemicals)
4. Process all receptor genes (chemicals -> brain)
5. Clamp all chemicals to [0.0, 1.0]
6. Check death conditions
```

Emitters run after reactions so that brain-produced chemicals are available for the next tick's reactions. Receptors run last so that the brain receives the most up-to-date chemical state.

### Initialization

At creature birth, chemicals are initialized to biologically reasonable defaults:

| Chemical Category | Initial Value | Rationale |
|-------------------|---------------|-----------|
| Drives | 0.0 | No initial drives; they build naturally |
| Glucose, Glycogen | 0.3, 0.2 | Born with some energy reserves |
| ATP, Oxygen | 0.5, 0.5 | Born with functional metabolism |
| Water | 0.5 | Born hydrated |
| All other metabolic | 0.0 | Produced by organ function |
| Hormonal | 0.0 | Build up over time |
| Toxins | 0.0 | Clean at birth |
| Immune | 0.1 (WBCs only) | Born with minimal immune function |
| Learning | 0.5 (Neuroplasticity), 0.3 (LearningRate) | Born ready to learn |
| Reproductive | 0.0 | Inactive until maturity (AgingFactor > 0.25) |
| LifeForce | 1.0 | Full vitality at birth |
| AgingFactor | 0.0 | No aging at birth |
| CellDamage | 0.0 | No damage at birth |
| RepairEnzyme | 0.5 | High repair capacity at birth |

---

## 12. Cross-References

The biochemistry system is deeply interconnected with every other major system. Below are the key cross-references to other design documents.

### GENOME.md

The genome encodes nearly everything about a creature's biochemistry:

| Gene Type | Genome Section | What It Encodes |
|-----------|---------------|-----------------|
| Organ genes | Organ gene cluster | Organ degradation rates, clock rates, per-organ reaction lists |
| Reaction genes | Within organ genes | Substrates, products, catalyst, rate, threshold for each reaction |
| Emitter genes | Emitter gene cluster | Neural-to-chemical mappings (lobe, neuron, chemical, rate, threshold) |
| Receptor genes | Receptor gene cluster | Chemical-to-neural mappings (chemical, lobe, neuron, gain, mode) |
| Half-life genes | Chemical gene cluster | Per-chemical decay rates (overrides defaults) |
| Allergy genes | Immune gene cluster | Chemical sensitivities and response magnitudes |
| Initial concentration genes | Birth gene cluster | Starting chemical values at birth |

See [GENOME.md](GENOME.md) for gene encoding format, mutation rates, and crossover mechanics.

### BRAIN.md

The brain and biochemistry are coupled through emitters and receptors:

| Coupling Point | Direction | Mechanism |
|---------------|-----------|-----------|
| Drive lobe inputs | Chemistry -> Brain | 16 receptor genes map drive chemicals to drive neurons |
| Decision lobe outputs | Brain -> Chemistry | Emitter genes produce hormones when decisions are made |
| Reward/punishment | Brain -> Chemistry | Reward circuitry emits Reward/Punishment chemicals |
| Learning modulation | Chemistry -> Brain | LearningRate and Neuroplasticity modulate synaptic plasticity |
| Attention modulation | Chemistry -> Brain | Adrenaline and Cortisol modulate attention lobe gain |
| Sleep state | Chemistry -> Brain | Melatonin suppresses Decision lobe; ConsolidationFactor enables memory consolidation |

See [BRAIN.md](BRAIN.md) for lobe architecture, neuron model, and synaptic learning rules.

### ARCHITECTURE.md

Biochemistry fits into the ECS (Entity-Component-System) architecture:

| Component | Contents |
|-----------|----------|
| `BiochemistryComponent` | Float32Array(256) chemicals, Float32Array(256) halfLives |
| `OrganComponent` | Array of 21 OrganState objects |
| `EmitterComponent` | Array of decoded EmitterGene objects |
| `ReceptorComponent` | Array of decoded ReceptorGene objects |

The `BiochemistrySystem` runs once per tick and updates all creatures with BiochemistryComponent. It reads from BrainComponent (for emitters) and writes to BrainComponent (for receptors).

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full component list and system execution order.

### ROADMAP.md

Biochemistry is implemented incrementally across development phases:

| Phase | Chemicals | Organs | Reactions | Features |
|-------|-----------|--------|-----------|----------|
| Phase 1 | 10 core chemicals (Hunger, Glucose, ATP, ADP, Oxygen, CO2, Pain, Reward, Punishment, LifeForce) | 5 (Brain, Heart, Lungs, Stomach, Muscles) | ~15 | Basic metabolism, simple drives, reward/punishment |
| Phase 2 | 30 chemicals (add remaining drives, key hormones, basic immune) | 12 organs | ~50 | Full drive system, hormonal modulation, basic disease |
| Phase 3 | Full 80 chemicals | All 21 organs | ~120 | Complete biochemistry: reproduction, aging, immune, toxins, all interactions |
| Phase 4+ | 80+ (modding/expansion slots) | 21+ | 120+ | User-defined chemicals, custom organs, modding API |

See [ROADMAP.md](ROADMAP.md) for timeline estimates and milestone definitions.
