import { randFloat } from '../utils/Math';
import { type CreatureGenome, Sex } from './Genome';

export function crossover(parentA: CreatureGenome, parentB: CreatureGenome): CreatureGenome {
  const pick = () => Math.random() < 0.5;
  const blend = (a: number, b: number) => (a + b) / 2 + randFloat(-0.03, 0.03);

  const brainBiases = parentA.brainBiases.map((a, i) =>
    pick() ? a : parentB.brainBiases[i]);
  const brainTaus = parentA.brainTaus.map((a, i) =>
    pick() ? a : parentB.brainTaus[i]);

  const connMap = new Map<string, { from: number; to: number; weight: number }>();
  for (const c of parentA.connections) connMap.set(`${c.from}-${c.to}`, { ...c });
  for (const c of parentB.connections) {
    const key = `${c.from}-${c.to}`;
    if (connMap.has(key)) { if (pick()) connMap.set(key, { ...c }); }
    else if (pick()) connMap.set(key, { ...c });
  }
  const connections = Array.from(connMap.values()).filter(() => Math.random() < 0.92);

  // Species marker: average with small noise (drives speciation)
  const speciesMarker = parentA.speciesMarker.map((a, i) =>
    (a + parentB.speciesMarker[i]) / 2 + randFloat(-0.01, 0.01));

  return {
    brainBiases, brainTaus, connections,
    stomachRate: pick() ? parentA.stomachRate : parentB.stomachRate,
    muscleRate: pick() ? parentA.muscleRate : parentB.muscleRate,
    brainOrganRate: pick() ? parentA.brainOrganRate : parentB.brainOrganRate,

    bodyScale: blend(parentA.bodyScale, parentB.bodyScale),
    bodyBuild: pick() ? parentA.bodyBuild : parentB.bodyBuild,
    headSize: blend(parentA.headSize, parentB.headSize),
    earType: pick() ? parentA.earType : parentB.earType,
    earSize: blend(parentA.earSize, parentB.earSize),
    armLength: blend(parentA.armLength, parentB.armLength),
    legLength: blend(parentA.legLength, parentB.legLength),
    eyeSize: blend(parentA.eyeSize, parentB.eyeSize),
    eyeSpacing: blend(parentA.eyeSpacing, parentB.eyeSpacing),

    colorH: pick() ? parentA.colorH : parentB.colorH,
    colorS: blend(parentA.colorS, parentB.colorS),
    colorL: blend(parentA.colorL, parentB.colorL),
    bellyColorL: blend(parentA.bellyColorL, parentB.bellyColorL),
    accentH: pick() ? parentA.accentH : parentB.accentH,

    aggression: blend(parentA.aggression, parentB.aggression),
    sociability: blend(parentA.sociability, parentB.sociability),
    curiosity: blend(parentA.curiosity, parentB.curiosity),
    loyalty: blend(parentA.loyalty, parentB.loyalty),
    creativity: blend(parentA.creativity, parentB.creativity),

    gatherAffinity: blend(parentA.gatherAffinity, parentB.gatherAffinity),
    huntAffinity: blend(parentA.huntAffinity, parentB.huntAffinity),
    buildAffinity: blend(parentA.buildAffinity, parentB.buildAffinity),
    hoardAffinity: blend(parentA.hoardAffinity, parentB.hoardAffinity),

    maxAge: pick() ? parentA.maxAge : parentB.maxAge,
    fertilityThreshold: blend(parentA.fertilityThreshold, parentB.fertilityThreshold),
    speed: blend(parentA.speed, parentB.speed),
    turnRate: blend(parentA.turnRate, parentB.turnRate),

    dietBerry: blend(parentA.dietBerry, parentB.dietBerry),
    dietGrass: blend(parentA.dietGrass, parentB.dietGrass),
    dietRoot: blend(parentA.dietRoot, parentB.dietRoot),

    sex: (Math.random() < 0.5 ? Sex.Male : Sex.Female),
    dimorphism: blend(parentA.dimorphism, parentB.dimorphism),
    displayIntensity: blend(parentA.displayIntensity, parentB.displayIntensity),
    monogamy: blend(parentA.monogamy, parentB.monogamy),
    mateSelectiveness: blend(parentA.mateSelectiveness, parentB.mateSelectiveness),

    buildingMutationRate: blend(parentA.buildingMutationRate, parentB.buildingMutationRate),
    buildingMaterialPref: blend(parentA.buildingMaterialPref, parentB.buildingMaterialPref),

    speciesMarker,

    birthSign: 0, // set at birth by Zodiac system
  };
}
