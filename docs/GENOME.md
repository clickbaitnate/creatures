# Genome System

## 1. Overview

The genome is the generative blueprint for every creature in the simulation. It encodes the complete specification of a creature's brain wiring, biochemical machinery, organ systems, body morphology, and lifecycle parameters. There is no hardcoded creature template; everything emerges from interpreting the genome at birth and at each life stage transition.

The genome is **diploid**: every creature carries two copies of each chromosome, one inherited from each parent. Gene expression follows a dominance model (Section 7), meaning that for each gene locus the creature's phenotype is determined by comparing the two alleles and expressing the dominant one, blending co-dominant ones, or averaging when dominance is equal.

A single haploid genome is stored as a flat `Uint8Array`. A typical genome contains roughly 266 genes at an average of 32 bytes each, yielding approximately 8.5 KB per haploid copy and 17 KB for a full diploid organism. The encoding is compact enough to store thousands of ancestral genomes for phylogenetic analysis without significant memory pressure.

The genome is read at two times:

1. **At birth (embryogenesis)** -- all genes with `switch_on_stage = 0` (embryo) or `switch_on_stage = 255` (always) are expressed. This builds the initial brain, body, and biochemistry.
2. **At life stage transitions** -- when a creature advances from child to adolescent, adolescent to adult, and so on, genes gated to the new stage are expressed, potentially adding new brain lobes, altering biochemistry, or changing morphology.

---

## 2. Chromosome Structure

The genome is organized into **9 chromosomes**, each responsible for a distinct subsystem. Within a chromosome, genes are laid out sequentially with no padding; gene boundaries are determined by the gene header's type field, which implies the payload length.

| Chr | Name                   | Typical Gene Count | Subsystem                                  |
|-----|------------------------|--------------------|---------------------------------------------|
| 1   | Brain Lobes            | ~16                | Lobe definitions (neuron count, position, activation fn, decay rate) |
| 2   | Brain Connections      | ~48                | Dendrite trees connecting lobes (source, dest, weights, learning rules) |
| 3   | Instincts              | ~30                | Initial reward/punishment wiring             |
| 4   | Biochemical Reactions  | ~80                | Organ reaction rules (substrates, catalysts, products, rates) |
| 5   | Emitters               | ~28                | Brain-to-chemistry bridges (neuron/lobe drives chemical emission) |
| 6   | Receptors              | ~28                | Chemistry-to-brain bridges (chemical modulates neuron/lobe) |
| 7   | Organs                 | ~12                | Organ definitions (type, health, degradation) |
| 8   | Morphology             | ~16                | Body plan (segments, limbs, colors, patterns) |
| 9   | Lifecycle & Reproduction | ~8               | Life stage durations, fertility, mate preferences |
|     | **Total**              | **~266**           |                                             |

### 2.1 Chromosome 1: Brain Lobes

Each gene defines a single lobe in the neural architecture. A lobe is a rectangular grid of neurons with uniform properties. Typical lobes include the perception lobe, drive lobe, concept lobe, decision lobe, attention lobe, and several intermediate processing lobes.

See [BRAIN.md](BRAIN.md) for how lobes are instantiated and connected at runtime.

### 2.2 Chromosome 2: Brain Connections

Each gene defines a dendrite tree: a pattern of connections from a source lobe to a destination lobe. A single dendrite tree gene can generate hundreds of individual synaptic connections based on its density parameter. Learning rules determine how connection weights change during the creature's lifetime.

### 2.3 Chromosome 3: Instincts

Instinct genes wire specific sensory or drive states to reward/punishment chemicals. They function as the creature's innate behavioral biases before any learning occurs. Approximately 30 genes encode instincts such as "hunger reduction feels rewarding" and "pain is punishing."

### 2.4 Chromosome 4: Biochemical Reactions

Reaction genes define the biochemical machinery within each organ. Each reaction specifies two substrates, a catalyst, two products, a reaction rate, and a threshold. The biochemistry engine ticks these reactions every simulation step.

See [BIOCHEMISTRY.md](BIOCHEMISTRY.md) for the chemical simulation model.

### 2.5 Chromosome 5: Emitters

Emitter genes bridge from the neural system to the biochemical system. When a neuron or lobe aggregate exceeds a threshold, the emitter injects a specified chemical into a specified organ at a specified rate.

### 2.6 Chromosome 6: Receptors

Receptor genes bridge from the biochemical system back to the neural system. When a chemical concentration in an organ exceeds a threshold, the receptor modulates a target neuron or lobe, adjusting its activation or resting potential.

### 2.7 Chromosome 7: Organs

Organ genes define the creature's internal organs: brain, heart, liver, stomach, lungs, immune system, reproductive system, and others. Each organ has a type, initial health value, and a degradation rate that governs aging.

### 2.8 Chromosome 8: Morphology

Morphology genes define the creature's visible body as a tree of segments. Each segment has a type (torso, limb, head, tail), a parent segment, geometric properties (length, radius, joint limits), and appearance properties (color in HSL, pattern ID).

See [CREATURES.md](CREATURES.md) for the rendering and physics integration.

### 2.9 Chromosome 9: Lifecycle & Reproduction

Lifecycle genes control the duration of each life stage (embryo, child, adolescent, adult, old), fertility window parameters, mate preference weights, and pregnancy duration. These genes directly govern the population dynamics of the simulation.

---

## 3. Gene Header Format

Every gene, regardless of type, begins with a 6-byte common header. The header is read first to determine how to interpret the subsequent payload bytes.

```
Offset  Size  Field              Description
------  ----  -----------------  --------------------------------------------------
0x00    1     gene_type          Identifies the gene type (see Section 4)
0x01    1     mutation_rate      Per-byte mutation probability (0-255 maps to 0%-100%)
0x02    1     dominance          Dominance value for diploid expression (higher wins)
0x03    1     switch_on_stage    Life stage when gene activates:
                                   0x00 = embryo
                                   0x01 = child
                                   0x02 = adolescent
                                   0x03 = adult
                                   0x04 = old
                                   0xFF = always (expressed at all stages)
0x04    1     switch_on_gender   Gender filter:
                                   0x00 = both
                                   0x01 = male only
                                   0x02 = female only
0x05    1     flags              Bit field:
                                   bit 0: essential (cannot be deleted by mutation)
                                   bit 1: mutable (point mutations allowed)
                                   bit 2: duplicable (gene duplication allowed)
                                   bits 3-7: reserved
------  ----
Total:  6 bytes
```

### 3.1 Mutation Rate Interpretation

The `mutation_rate` byte controls per-byte mutation probability during reproduction. The mapping is linear:

```
probability = mutation_rate / 255.0
```

A value of `0` means the gene payload is completely stable across generations. A value of `255` means every payload byte has a 100% chance of being randomized (effectively a fully volatile gene). Typical values range from 5 to 30 (~2% to ~12%).

The mutation rate field itself is also subject to meta-mutation at a fixed rate of 1%, allowing evolution to tune its own evolvability.

### 3.2 Dominance

The `dominance` byte determines which allele is expressed when the creature is diploid (Section 7). Higher values are more dominant. A value of `128` is considered "neutral" dominance.

### 3.3 Flags Bit Layout

```
Bit  Name        Meaning
---  ----------  -------------------------------------------------------
0    essential   If set, gene deletion mutations are suppressed
1    mutable     If clear, point mutations are suppressed regardless of mutation_rate
2    duplicable  If set, gene duplication mutations are allowed
3-7  reserved    Must be 0; ignored during expression
```

---

## 4. Gene Type Specifications

Each gene type has a fixed-length payload that follows the 6-byte header. The `gene_type` field in the header determines the payload format.

### Gene Type ID Table

| gene_type | Name                | Chromosome | Payload Size | Total Gene Size |
|-----------|---------------------|------------|-------------|-----------------|
| 0x01      | Brain Lobe          | 1          | 18 bytes    | 24 bytes        |
| 0x02      | Brain Connection    | 2          | 20 bytes    | 26 bytes        |
| 0x03      | Instinct            | 3          | 12 bytes    | 18 bytes        |
| 0x04      | Biochemical Reaction| 4          | 16 bytes    | 22 bytes        |
| 0x05      | Emitter             | 5          | 10 bytes    | 16 bytes        |
| 0x06      | Receptor            | 6          | 10 bytes    | 16 bytes        |
| 0x07      | Organ               | 7          | 10 bytes    | 16 bytes        |
| 0x08      | Morphology          | 8          | 22 bytes    | 28 bytes        |
| 0x09      | Lifecycle           | 9          | 20 bytes    | 26 bytes        |

---

### 4.1 Brain Lobe Gene (0x01)

Defines a single lobe in the creature's neural architecture.

| Offset | Size | Field               | Type   | Description                                      |
|--------|------|---------------------|--------|--------------------------------------------------|
| 0x00   | 1    | lobe_id             | uint8  | Unique lobe identifier (0-255)                   |
| 0x01   | 2    | neuron_count        | uint16 | Number of neurons in this lobe (big-endian)      |
| 0x03   | 1    | pos_x               | uint8  | X position in brain space (0-255 grid)           |
| 0x04   | 1    | pos_y               | uint8  | Y position in brain space (0-255 grid)           |
| 0x05   | 1    | width               | uint8  | Lobe width in neurons                            |
| 0x06   | 1    | height              | uint8  | Lobe height in neurons                           |
| 0x07   | 1    | activation_fn       | uint8  | Activation function: 0=sigmoid, 1=tanh, 2=relu, 3=step, 4=linear |
| 0x08   | 1    | resting_potential   | uint8  | Resting activation level (0-255)                 |
| 0x09   | 1    | decay_rate          | uint8  | Per-tick activation decay (0=none, 255=instant)  |
| 0x0A   | 1    | threshold           | uint8  | Minimum input to fire (0-255)                    |
| 0x0B   | 1    | winner_take_all     | uint8  | WTA mode: 0=off, 1=within lobe, 2=within row    |
| 0x0C   | 1    | leak_rate           | uint8  | Spontaneous noise injection rate                 |
| 0x0D   | 1    | state_rule          | uint8  | State variable update rule ID (see BRAIN.md)     |
| 0x0E   | 1    | nominal_threshold   | uint8  | Threshold for nominal state transitions          |
| 0x0F   | 1    | sensitivity         | uint8  | Input gain multiplier (128 = 1.0x)               |
| 0x10   | 1    | relaxation          | uint8  | Rate of return to resting potential after firing  |
| 0x11   | 1    | flags_lobe          | uint8  | bit 0: mirrored, bit 1: wrap-around connectivity |

**Total payload: 18 bytes. Total gene size: 24 bytes.**

The `neuron_count` field is authoritative; `width * height` should equal `neuron_count` but the decoder uses `neuron_count` if they disagree.

---

### 4.2 Brain Connection Gene (0x02)

Defines a dendrite tree: a systematic pattern of connections from one lobe to another.

| Offset | Size | Field               | Type   | Description                                      |
|--------|------|---------------------|--------|--------------------------------------------------|
| 0x00   | 1    | source_lobe         | uint8  | Source lobe ID                                   |
| 0x01   | 1    | dest_lobe           | uint8  | Destination lobe ID                              |
| 0x02   | 1    | density             | uint8  | Connection density (0-255 maps to 0%-100%)       |
| 0x03   | 1    | weight_init_min     | uint8  | Minimum initial weight (0-255)                   |
| 0x04   | 1    | weight_init_max     | uint8  | Maximum initial weight (0-255)                   |
| 0x05   | 1    | learning_rule       | uint8  | Learning rule ID:                                |
|        |      |                     |        |   0=none, 1=hebbian, 2=anti-hebbian,             |
|        |      |                     |        |   3=spread, 4=backprop-approx, 5=reward-mod      |
| 0x06   | 1    | learning_rate       | uint8  | Learning speed (0-255, 128 = baseline)           |
| 0x07   | 1    | plasticity          | uint8  | Susceptibility to weight change (0=frozen, 255=maximally plastic) |
| 0x08   | 1    | susceptibility_decay| uint8  | Per-tick decay of plasticity (aging stiffens)    |
| 0x09   | 1    | reinforcement_chem  | uint8  | Chemical ID that modulates this connection's learning |
| 0x0A   | 1    | ltw_gain            | uint8  | Long-term weight gain factor                     |
| 0x0B   | 1    | stw_gain            | uint8  | Short-term weight gain factor                    |
| 0x0C   | 1    | fan_out             | uint8  | Max connections per source neuron                |
| 0x0D   | 1    | fan_in              | uint8  | Max connections per dest neuron                  |
| 0x0E   | 1    | topology            | uint8  | 0=random, 1=one-to-one, 2=neighborhood, 3=all-to-all |
| 0x0F   | 1    | neighborhood_radius | uint8  | Radius for topology=2 (neighborhood connections) |
| 0x10   | 1    | migration_rule      | uint8  | Connection migration: 0=fixed, 1=activity-dep    |
| 0x11   | 1    | weight_limit_lo     | uint8  | Floor for weight values                          |
| 0x12   | 1    | weight_limit_hi     | uint8  | Ceiling for weight values                        |
| 0x13   | 1    | flags_conn          | uint8  | bit 0: inhibitory, bit 1: modulatory             |

**Total payload: 20 bytes. Total gene size: 26 bytes.**

When the gene is expressed, the engine iterates over the source and destination lobes, creating individual synaptic connections according to the `topology` and `density` parameters. Initial weights are sampled uniformly from `[weight_init_min, weight_init_max]`.

---

### 4.3 Instinct Gene (0x03)

Wires an innate association between a condition and a reward/punishment chemical response.

| Offset | Size | Field               | Type   | Description                                      |
|--------|------|---------------------|--------|--------------------------------------------------|
| 0x00   | 1    | source_lobe_1       | uint8  | First condition lobe ID                          |
| 0x01   | 1    | source_neuron_1     | uint8  | First condition neuron index                     |
| 0x02   | 1    | source_lobe_2       | uint8  | Second condition lobe ID (0xFF = unused)         |
| 0x03   | 1    | source_neuron_2     | uint8  | Second condition neuron index                    |
| 0x04   | 1    | source_lobe_3       | uint8  | Third condition lobe ID (0xFF = unused)          |
| 0x05   | 1    | source_neuron_3     | uint8  | Third condition neuron index                     |
| 0x06   | 1    | action_lobe         | uint8  | Action lobe ID to associate with                 |
| 0x07   | 1    | action_neuron       | uint8  | Action neuron index                              |
| 0x08   | 1    | reward_chemical     | uint8  | Chemical to inject on match (0xFF = none)        |
| 0x09   | 1    | reward_amount       | uint8  | Amount of reward chemical to inject              |
| 0x0A   | 1    | punish_chemical     | uint8  | Chemical to inject on mismatch (0xFF = none)     |
| 0x0B   | 1    | punish_amount       | uint8  | Amount of punishment chemical to inject          |

**Total payload: 12 bytes. Total gene size: 18 bytes.**

An instinct gene fires during embryogenesis to pre-wire a single "if condition then action yields reward" association. Up to three condition neuron states can be AND-combined. If a condition lobe is `0xFF`, that slot is ignored (always true).

---

### 4.4 Biochemical Reaction Gene (0x04)

Defines a single chemical reaction within an organ.

| Offset | Size | Field               | Type   | Description                                      |
|--------|------|---------------------|--------|--------------------------------------------------|
| 0x00   | 1    | organ_id            | uint8  | Organ in which reaction occurs                   |
| 0x01   | 1    | substrate1          | uint8  | First substrate chemical ID                      |
| 0x02   | 1    | substrate1_amount   | uint8  | Units of substrate1 consumed per tick            |
| 0x03   | 1    | substrate2          | uint8  | Second substrate chemical ID (0xFF = none)       |
| 0x04   | 1    | substrate2_amount   | uint8  | Units of substrate2 consumed per tick            |
| 0x05   | 1    | catalyst            | uint8  | Catalyst chemical ID (0xFF = uncatalyzed)        |
| 0x06   | 1    | catalyst_threshold  | uint8  | Minimum catalyst concentration to proceed        |
| 0x07   | 1    | product1            | uint8  | First product chemical ID                        |
| 0x08   | 1    | product1_amount     | uint8  | Units of product1 produced per tick              |
| 0x09   | 1    | product2            | uint8  | Second product chemical ID (0xFF = none)         |
| 0x0A   | 1    | product2_amount     | uint8  | Units of product2 produced per tick              |
| 0x0B   | 1    | reaction_rate       | uint8  | Base rate (0=never, 255=every tick)              |
| 0x0C   | 1    | threshold           | uint8  | Minimum substrate1 concentration to react        |
| 0x0D   | 1    | half_life_product1  | uint8  | Decay rate of product1 (0=stable, 255=instant)   |
| 0x0E   | 1    | half_life_product2  | uint8  | Decay rate of product2                           |
| 0x0F   | 1    | flags_rxn           | uint8  | bit 0: reversible, bit 1: competitive inhibition |

**Total payload: 16 bytes. Total gene size: 22 bytes.**

Reactions execute every simulation tick within their assigned organ. The effective rate is modulated by catalyst concentration and substrate availability. See [BIOCHEMISTRY.md](BIOCHEMISTRY.md) for the reaction kinetics model.

---

### 4.5 Emitter Gene (0x05)

Bridges the neural system to the biochemical system.

| Offset | Size | Field               | Type   | Description                                      |
|--------|------|---------------------|--------|--------------------------------------------------|
| 0x00   | 1    | source_type         | uint8  | 0=lobe aggregate, 1=specific neuron, 2=organ     |
| 0x01   | 1    | source_id           | uint8  | Lobe ID, neuron index, or organ ID               |
| 0x02   | 1    | source_index        | uint8  | Sub-index (neuron within lobe, or 0xFF for aggregate) |
| 0x03   | 1    | target_organ        | uint8  | Organ into which chemical is emitted             |
| 0x04   | 1    | chemical_id         | uint8  | Chemical to emit                                 |
| 0x05   | 1    | emission_rate       | uint8  | Base emission rate (0-255)                       |
| 0x06   | 1    | threshold           | uint8  | Source activation must exceed this to emit        |
| 0x07   | 1    | gain                | uint8  | Multiplier: emission = (activation - threshold) * gain / 128 |
| 0x08   | 1    | sample_rule         | uint8  | 0=instantaneous, 1=average over tick, 2=peak     |
| 0x09   | 1    | clear_after_emit    | uint8  | If nonzero, reset source activation after emitting|

**Total payload: 10 bytes. Total gene size: 16 bytes.**

---

### 4.6 Receptor Gene (0x06)

Bridges the biochemical system to the neural system.

| Offset | Size | Field               | Type   | Description                                      |
|--------|------|---------------------|--------|--------------------------------------------------|
| 0x00   | 1    | source_organ        | uint8  | Organ from which to read chemical concentration  |
| 0x01   | 1    | chemical_id         | uint8  | Chemical to sense                                |
| 0x02   | 1    | target_type         | uint8  | 0=lobe (all neurons), 1=specific neuron          |
| 0x03   | 1    | target_lobe         | uint8  | Target lobe ID                                   |
| 0x04   | 1    | target_neuron       | uint8  | Target neuron index (if target_type=1)           |
| 0x05   | 1    | gain                | uint8  | Sensitivity: modulation = concentration * gain / 128 |
| 0x06   | 1    | threshold           | uint8  | Minimum chemical concentration to activate       |
| 0x07   | 1    | modulation_type     | uint8  | 0=add to input, 1=multiply activation, 2=set resting potential, 3=modulate threshold |
| 0x08   | 1    | invert              | uint8  | If nonzero, invert the modulation effect         |
| 0x09   | 1    | flags_receptor      | uint8  | bit 0: digital (on/off), bit 1: latching         |

**Total payload: 10 bytes. Total gene size: 16 bytes.**

---

### 4.7 Organ Gene (0x07)

Defines a body organ and its properties.

| Offset | Size | Field               | Type   | Description                                      |
|--------|------|---------------------|--------|--------------------------------------------------|
| 0x00   | 1    | organ_id            | uint8  | Unique organ identifier                          |
| 0x01   | 1    | organ_type          | uint8  | 0=brain, 1=heart, 2=liver, 3=stomach, 4=lungs, 5=immune, 6=reproductive, 7=muscle, 8=skin, 9=generic |
| 0x02   | 1    | initial_health      | uint8  | Starting health (0-255)                          |
| 0x03   | 1    | degradation_rate    | uint8  | Health loss per life-stage tick (governs aging)   |
| 0x04   | 1    | repair_rate         | uint8  | Natural healing rate per tick                    |
| 0x05   | 1    | damage_suscept      | uint8  | Susceptibility to toxin/injury damage            |
| 0x06   | 1    | energy_cost         | uint8  | Energy consumption per tick to maintain organ     |
| 0x07   | 1    | failure_chem        | uint8  | Chemical emitted when organ health drops below threshold |
| 0x08   | 1    | failure_threshold   | uint8  | Health level that triggers failure chemical       |
| 0x09   | 1    | clock_rate          | uint8  | Organ-local tick multiplier (128 = 1.0x normal)  |

**Total payload: 10 bytes. Total gene size: 16 bytes.**

When an organ's health reaches zero, it fails. Organ failure cascades through the biochemistry: a failed liver ceases all liver reactions, toxins accumulate, and the creature rapidly declines. A failed heart is immediately fatal.

---

### 4.8 Morphology Gene (0x08)

Defines a single body segment in the creature's physical form.

| Offset | Size | Field               | Type   | Description                                      |
|--------|------|---------------------|--------|--------------------------------------------------|
| 0x00   | 1    | segment_id          | uint8  | Unique segment identifier                        |
| 0x01   | 1    | segment_type        | uint8  | 0=torso, 1=limb, 2=head, 3=tail, 4=wing, 5=fin  |
| 0x02   | 1    | parent_segment      | uint8  | ID of parent segment (0xFF = root/torso)         |
| 0x03   | 1    | attach_point        | uint8  | Attachment angle on parent (0-255 maps to 0-360 deg) |
| 0x04   | 2    | length              | uint16 | Segment length in body-space units (big-endian)  |
| 0x06   | 1    | radius              | uint8  | Segment radius/thickness                         |
| 0x07   | 1    | joint_limit_min     | uint8  | Minimum joint angle (0-255 maps to -180 to +180) |
| 0x08   | 1    | joint_limit_max     | uint8  | Maximum joint angle                              |
| 0x09   | 1    | joint_stiffness     | uint8  | Joint resistance to movement                     |
| 0x0A   | 1    | color_h             | uint8  | Hue (0-255 maps to 0-360 deg)                   |
| 0x0B   | 1    | color_s             | uint8  | Saturation (0-255)                               |
| 0x0C   | 1    | color_l             | uint8  | Lightness (0-255)                                |
| 0x0D   | 1    | pattern_id          | uint8  | Surface pattern: 0=solid, 1=spots, 2=stripes, 3=gradient, 4=patches |
| 0x0E   | 1    | pattern_scale       | uint8  | Pattern repeat frequency                         |
| 0x0F   | 1    | pattern_color_h     | uint8  | Secondary pattern hue                            |
| 0x10   | 1    | symmetry            | uint8  | 0=none, 1=bilateral (auto-mirror segment)        |
| 0x11   | 1    | mass_density        | uint8  | Relative mass (affects physics)                  |
| 0x12   | 1    | sprite_variant      | uint8  | Visual variant within segment type               |
| 0x13   | 1    | texture_id          | uint8  | Surface texture: 0=smooth, 1=fur, 2=scales, 3=feathers |
| 0x14   | 1    | collision_group     | uint8  | Physics collision group ID                       |
| 0x15   | 1    | flags_morph         | uint8  | bit 0: visible, bit 1: load-bearing, bit 2: prehensile |

**Total payload: 22 bytes. Total gene size: 28 bytes.**

Body segments form a tree rooted at the torso (`parent_segment = 0xFF`). The morphology decoder walks the tree depth-first to build the creature's skeletal and visual representation. Segments with `symmetry = 1` are automatically mirrored across the creature's sagittal plane, so a single limb gene produces a matching pair.

---

### 4.9 Lifecycle & Reproduction Gene (0x09)

Controls life stage timing, fertility, and mate selection.

| Offset | Size | Field               | Type   | Description                                      |
|--------|------|---------------------|--------|--------------------------------------------------|
| 0x00   | 2    | embryo_duration     | uint16 | Ticks spent as embryo (big-endian)               |
| 0x02   | 2    | child_duration      | uint16 | Ticks spent as child                             |
| 0x04   | 2    | adolescent_duration | uint16 | Ticks spent as adolescent                        |
| 0x06   | 2    | adult_duration      | uint16 | Ticks spent as adult                             |
| 0x08   | 2    | old_duration        | uint16 | Ticks spent as old (after which: death)          |
| 0x0A   | 1    | fertility_start     | uint8  | Life stage at which fertility begins (2=adolescent, 3=adult) |
| 0x0B   | 1    | fertility_rate      | uint8  | Probability of conception per mating event (0-255) |
| 0x0C   | 2    | pregnancy_duration  | uint16 | Ticks of gestation before birth                  |
| 0x0E   | 1    | litter_size_min     | uint8  | Minimum offspring per pregnancy                  |
| 0x0F   | 1    | litter_size_max     | uint8  | Maximum offspring per pregnancy                  |
| 0x10   | 1    | mate_pref_species   | uint8  | Minimum genome similarity to accept mate (0-255) |
| 0x11   | 1    | mate_pref_health    | uint8  | Minimum perceived health of mate (0-255)         |
| 0x12   | 1    | mate_pref_age       | uint8  | Preferred mate life stage (0=any, 2=adolescent+) |
| 0x13   | 1    | senescence_rate     | uint8  | Aging acceleration factor in old stage           |

**Total payload: 20 bytes. Total gene size: 26 bytes.**

---

## 5. Crossover Mechanics

When two creatures mate, sexual recombination produces a child genome through per-chromosome crossover.

### 5.1 Algorithm

For each of the 9 chromosomes:

1. **Align** the maternal and paternal copies of the chromosome by gene locus. If chromosomes differ in length (due to prior duplications/deletions), align from the start and treat extra trailing genes as unpaired.

2. **Select crossover points.** Generate 1 or 2 random crossover points, uniformly distributed along the chromosome length:
   - 1 crossover point: 70% of the time
   - 2 crossover points: 30% of the time

3. **Splice.** Alternate between maternal and paternal genes at each crossover point. The starting parent is chosen randomly (50/50).

4. **Assign.** The resulting spliced chromosome becomes one allele in the child. Repeat the process to produce the second allele from the same two parental chromosomes (with independently chosen crossover points).

```
Example: 1 crossover point at gene 4

Parent A (maternal):  [A1][A2][A3][A4][A5][A6][A7]
Parent B (paternal):  [B1][B2][B3][B4][B5][B6][B7]
                                      ^
                                crossover point

Child allele 1:       [A1][A2][A3][A4][B5][B6][B7]
Child allele 2:       [B1][B2][B3][B4][A5][A6][A7]  (independent crossover)
```

```
Example: 2 crossover points at genes 2 and 5

Parent A (maternal):  [A1][A2][A3][A4][A5][A6][A7]
Parent B (paternal):  [B1][B2][B3][B4][B5][B6][B7]
                              ^           ^
                         crossover    crossover

Child allele 1:       [A1][A2][B3][B4][B5][A6][A7]
```

### 5.2 Unpaired Gene Handling

If one parent has more genes on a chromosome than the other (due to prior gene duplication), the extra genes are treated as follows:

- If they fall after all crossover points and are on the "active" parent's side, they are included.
- If they fall on the "inactive" parent's side, they are dropped.
- This means gene duplications can be lost or preserved through crossover, providing evolutionary pressure on chromosome length.

---

## 6. Mutation Types

Mutations are applied to the child genome after crossover, before embryogenesis begins. Each mutation type has an independent probability.

### 6.1 Point Mutation

A single byte within a gene's payload is replaced with a random value.

- **Rate**: Controlled per-gene by the `mutation_rate` header field.
- **Scope**: Each byte in the payload is independently evaluated: `if random() < mutation_rate / 255, byte = random_uint8()`.
- **Constraint**: Only applied if the gene's `mutable` flag (bit 1 of `flags`) is set.
- **Header mutation**: The gene header fields (except `gene_type`) are also subject to point mutation, but at a flat 1% rate per byte, independent of the gene's `mutation_rate`. This allows evolution of dominance, switch-on stage, and even the mutation rate itself.

### 6.2 Gene Duplication

An entire gene (header + payload) is copied and inserted immediately after the original within the same chromosome.

- **Rate**: ~0.1% per gene per generation (approximately 1 in 1000).
- **Constraint**: Only applied if the gene's `duplicable` flag (bit 2 of `flags`) is set.
- **Effect**: The duplicate begins identical to the original. Subsequent point mutations can then cause the two copies to diverge, potentially producing novel functionality (neofunctionalization) or redundancy (robustness).

### 6.3 Gene Deletion

A gene is removed from the chromosome entirely.

- **Rate**: ~0.05% per gene per generation (approximately 1 in 2000).
- **Constraint**: Genes with the `essential` flag (bit 0 of `flags`) set cannot be deleted. Attempting to delete an essential gene is silently skipped.
- **Effect**: Removes the gene from one allele. If the other allele still carries the gene, the creature may function normally (haploinsufficiency depends on the gene). If both alleles lose the gene, the associated structure is absent.

### 6.4 Chromosome-Level Duplication

An entire chromosome is duplicated, giving the creature three copies instead of two.

- **Rate**: Extremely rare, ~0.01% per chromosome per generation.
- **Effect**: The extra chromosome's genes are all expressed (following normal dominance rules across all three alleles, with the two most dominant being used). This is generally deleterious but occasionally beneficial, providing raw material for major evolutionary transitions.

### 6.5 Mutation Rate Summary

| Mutation Type              | Rate per Unit per Generation | Unit          |
|----------------------------|------------------------------|---------------|
| Point mutation             | `mutation_rate / 255` per byte | per byte     |
| Header meta-mutation       | 1% per byte                  | per header byte |
| Gene duplication           | 0.1%                         | per gene      |
| Gene deletion              | 0.05%                        | per gene      |
| Chromosome duplication     | 0.01%                        | per chromosome |

---

## 7. Diploid Allele Expression

Each creature carries two alleles (copies) for each gene locus on every chromosome. The expression engine resolves which allele(s) contribute to the creature's phenotype.

### 7.1 Expression Algorithm

For each gene position `i` on chromosome `c`:

```
allele_a = genome.chromosomes[c].allele_maternal[i]
allele_b = genome.chromosomes[c].allele_paternal[i]

if allele_a is null:
    express(allele_b)                      // hemizygous
elif allele_b is null:
    express(allele_a)                      // hemizygous
elif allele_a.header.dominance > allele_b.header.dominance:
    express(allele_a)                      // A is dominant
elif allele_b.header.dominance > allele_a.header.dominance:
    express(allele_b)                      // B is dominant
elif gene_type is co-dominant:
    express(allele_a)
    express(allele_b)                      // both expressed, effects sum
else:
    express(blend(allele_a, allele_b))     // equal dominance: average numeric fields
```

### 7.2 Blending Rules

When two alleles have equal dominance and the gene type is not co-dominant, numeric payload fields are averaged:

```
for each field f in payload:
    result.f = (allele_a.f + allele_b.f) / 2   // integer division, round down
```

Non-numeric fields (IDs, flags, enum values) are taken from whichever allele has the lower `gene_type`-specific tiebreaker (typically the maternal allele).

### 7.3 Co-Dominant Gene Types

The following gene types are co-dominant, meaning both alleles are expressed independently and their effects accumulate:

| Gene Type              | Co-Dominant Effect                                    |
|------------------------|-------------------------------------------------------|
| Biochemical Reaction   | Both reactions run; creature has both metabolic pathways |
| Emitter                | Both emitters active; chemical emission sums           |
| Receptor               | Both receptors active; modulation effects sum           |
| Instinct               | Both instinct wirings installed                        |

Brain Lobe genes, Brain Connection genes, Organ genes, Morphology genes, and Lifecycle genes use the dominant-or-blend model and are **not** co-dominant. Expressing two conflicting brain lobes at the same lobe ID would corrupt the neural architecture.

### 7.4 Gender-Specific Expression

Before dominance resolution, the engine checks the `switch_on_gender` header field. If a gene is marked male-only (`0x01`) and the creature is female, that allele is silently skipped (treated as null). This allows sexual dimorphism in brain wiring, morphology, and biochemistry.

### 7.5 Life Stage Gating

Similarly, `switch_on_stage` prevents a gene from being expressed until the creature reaches the specified life stage. A brain lobe gene with `switch_on_stage = 0x02` (adolescent) will not exist in the creature's brain until adolescence, at which point it is dynamically instantiated and connected.

---

## 8. Binary Encoding

The genome is stored as a flat `Uint8Array`. The complete binary layout is as follows.

### 8.1 File / Memory Layout

```
+--------------------------------------------------+
| GENOME HEADER (16 bytes)                         |
+--------------------------------------------------+
| CHROMOSOME TABLE (9 entries x 8 bytes = 72 bytes)|
+--------------------------------------------------+
| ALLELE A DATA (variable length)                  |
|   Chromosome 1 genes...                          |
|   Chromosome 2 genes...                          |
|   ...                                            |
|   Chromosome 9 genes...                          |
+--------------------------------------------------+
| ALLELE B DATA (variable length)                  |
|   Chromosome 1 genes...                          |
|   Chromosome 2 genes...                          |
|   ...                                            |
|   Chromosome 9 genes...                          |
+--------------------------------------------------+
```

### 8.2 Genome Header (16 bytes)

```
Offset  Size  Field              Description
------  ----  -----------------  ----------------------------------
0x00    4     magic              ASCII "CGEN" (0x43 0x47 0x45 0x4E)
0x04    2     version            Format version (uint16 BE, currently 1)
0x06    1     chromosome_count   Number of chromosomes (9)
0x07    1     ploidy             Ploidy level (2 for diploid)
0x08    2     allele_a_length    Total byte length of allele A data (uint16 BE)
0x0A    2     allele_b_length    Total byte length of allele B data (uint16 BE)
0x0C    4     checksum           CRC32 of all data following this field
```

### 8.3 Chromosome Table Entry (8 bytes each)

```
Offset  Size  Field              Description
------  ----  -----------------  ----------------------------------
0x00    1     chromosome_id      Chromosome number (1-9)
0x01    1     gene_count_a       Number of genes in allele A copy
0x02    1     gene_count_b       Number of genes in allele B copy
0x03    2     offset_a           Byte offset into allele A data (uint16 BE)
0x05    2     offset_b           Byte offset into allele B data (uint16 BE)
0x07    1     reserved           Must be 0x00
```

### 8.4 Gene Encoding

Each gene is encoded as:

```
[6-byte header][N-byte payload]
```

Where `N` is determined by the `gene_type` field in the header (see Section 4).

Genes are packed sequentially with no alignment padding. The decoder reads the header, determines the payload size from the gene type, reads that many bytes, then advances to the next gene.

### 8.5 Size Estimates

| Component            | Typical Size       |
|----------------------|--------------------|
| Genome header        | 16 bytes           |
| Chromosome table     | 72 bytes           |
| Allele A data        | ~8,512 bytes       |
| Allele B data        | ~8,512 bytes       |
| **Total diploid**    | **~17,112 bytes**  |

Breakdown of allele data (one copy):

| Chromosome | Genes | Avg Gene Size | Subtotal     |
|------------|-------|---------------|-------------|
| 1 (Lobes)  | 16    | 24 bytes      | 384 bytes   |
| 2 (Conn)   | 48    | 26 bytes      | 1,248 bytes |
| 3 (Inst)   | 30    | 18 bytes      | 540 bytes   |
| 4 (React)  | 80    | 22 bytes      | 1,760 bytes |
| 5 (Emit)   | 28    | 16 bytes      | 448 bytes   |
| 6 (Recep)  | 28    | 16 bytes      | 448 bytes   |
| 7 (Organ)  | 12    | 16 bytes      | 192 bytes   |
| 8 (Morph)  | 16    | 28 bytes      | 448 bytes   |
| 9 (Life)   | 8     | 26 bytes      | 208 bytes   |
| **Total**  | **266** |             | **5,676 bytes** |

Note: The estimate of ~8,512 bytes above accounts for variance in gene counts across individuals due to duplication/deletion mutations. The baseline 5,676 bytes represents a "standard" genome; actual genomes grow and shrink over evolutionary time.

### 8.6 Serialization Pseudocode

```typescript
function encodeGenome(genome: Genome): Uint8Array {
  const header = new Uint8Array(16);
  header.set([0x43, 0x47, 0x45, 0x4E]); // "CGEN"
  writeUint16BE(header, 4, FORMAT_VERSION);
  header[6] = genome.chromosomes.length;
  header[7] = genome.ploidy;

  const alleleA = encodeAllele(genome.alleleA);
  const alleleB = encodeAllele(genome.alleleB);

  writeUint16BE(header, 8, alleleA.length);
  writeUint16BE(header, 10, alleleB.length);

  const chromTable = encodeChromosomeTable(genome);

  const full = concat(header, chromTable, alleleA, alleleB);
  writeUint32BE(full, 12, crc32(full.subarray(16)));

  return full;
}

function encodeGene(gene: Gene): Uint8Array {
  const payloadSize = PAYLOAD_SIZES[gene.header.gene_type];
  const buf = new Uint8Array(6 + payloadSize);

  // Header
  buf[0] = gene.header.gene_type;
  buf[1] = gene.header.mutation_rate;
  buf[2] = gene.header.dominance;
  buf[3] = gene.header.switch_on_stage;
  buf[4] = gene.header.switch_on_gender;
  buf[5] = gene.header.flags;

  // Payload (type-specific)
  buf.set(gene.payload, 6);

  return buf;
}
```

---

## 9. Cross-References

- **[BRAIN.md](BRAIN.md)** -- Neural architecture, lobe instantiation from chromosome 1, dendrite tree construction from chromosome 2, learning rules, and tick-level brain simulation.
- **[BIOCHEMISTRY.md](BIOCHEMISTRY.md)** -- Chemical simulation engine, reaction kinetics for chromosome 4, emitter/receptor bridges from chromosomes 5 and 6, organ chemical compartments from chromosome 7.
- **[CREATURES.md](CREATURES.md)** -- Creature lifecycle management, morphology rendering from chromosome 8, life stage transitions from chromosome 9, mating behavior and genome inheritance.
- **[ARCHITECTURE.md](ARCHITECTURE.md)** -- Overall system architecture, how the genome decoder integrates with the ECS, serialization format for save/load, and genome storage in the population database.
