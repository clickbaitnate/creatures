import * as THREE from 'three';
import type { CreatureGenome } from '../genome/Genome';
import {
  NOISE_GLSL,
  VORONOI_GLSL,
  UTIL_GLSL,
  CREATURE_UNIFORMS_GLSL,
  PATTERN_GLSL,
  CREATURE_FRAGMENT_GLSL,
} from './ShaderGLSL';

// Part roles for u_partRole uniform
export const PART_BODY   = 0;
export const PART_BELLY  = 1;
export const PART_ACCENT = 2;
export const PART_EYE    = 3;
export const PART_PUPIL  = 4;
export const PART_MOUTH  = 5;

export interface CreatureShaderUniforms {
  u_time:         { value: number };
  u_energy:       { value: number };
  u_hunger:       { value: number };
  u_pain:         { value: number };
  u_reward:       { value: number };
  u_lifeForce:    { value: number };
  u_tiredness:    { value: number };
  u_age:          { value: number };
  u_baseHSL:      { value: THREE.Vector3 };
  u_accentHSL:    { value: THREE.Vector3 };
  u_speciesHash:  { value: number };
  u_patternType:  { value: number };
  u_patternScale: { value: number };
  u_patternParams:{ value: THREE.Vector4 };
  u_rank:         { value: number };
  u_sex:          { value: number };
  u_emotion:      { value: THREE.Vector4 };
}

function hashSpeciesMarker(marker: number[]): number {
  let h = 0;
  for (let i = 0; i < marker.length; i++) {
    h = ((h << 5) - h + (marker[i] * 1000 | 0)) | 0;
  }
  return (h & 0x7fffffff) / 0x7fffffff; // normalize to 0-1
}

function patternTypeFromHash(hash: number): number {
  return Math.floor(hash * 5.99); // 0-5
}

function patternParamsFromHash(hash: number, genome: CreatureGenome): THREE.Vector4 {
  // Derive 4 pattern parameters from species marker
  const m = genome.speciesMarker;
  return new THREE.Vector4(
    m[2] * 2.0 - 1.0,  // direction / density param
    m[3],               // size / tightness param
    m[4] * 8.0 + 2.0,  // frequency param
    m[5],               // extra param
  );
}

export function createCreatureUniforms(genome: CreatureGenome): CreatureShaderUniforms {
  const speciesHash = hashSpeciesMarker(genome.speciesMarker);
  const patternType = patternTypeFromHash(speciesHash);

  return {
    u_time:         { value: 0 },
    u_energy:       { value: 0.9 },
    u_hunger:       { value: 0 },
    u_pain:         { value: 0 },
    u_reward:       { value: 0 },
    u_lifeForce:    { value: 1 },
    u_tiredness:    { value: 0 },
    u_age:          { value: 0 },
    u_baseHSL:      { value: new THREE.Vector3(genome.colorH / 360, genome.colorS, genome.colorL) },
    u_accentHSL:    { value: new THREE.Vector3(genome.accentH / 360, genome.colorS * 0.8, genome.colorL * 0.9) },
    u_speciesHash:  { value: speciesHash },
    u_patternType:  { value: patternType },
    u_patternScale: { value: genome.speciesMarker[6] * 3.0 + 1.0 },
    u_patternParams:{ value: patternParamsFromHash(speciesHash, genome) },
    u_rank:         { value: 0 },
    u_sex:          { value: 0 },
    u_emotion:      { value: new THREE.Vector4(0, 0, 0, 0) },
  };
}

const HEADER_GLSL = [NOISE_GLSL, VORONOI_GLSL, UTIL_GLSL, CREATURE_UNIFORMS_GLSL, PATTERN_GLSL].join('\n');

export function applyCreatureShader(
  material: THREE.MeshStandardMaterial,
  uniforms: CreatureShaderUniforms,
  partRole: number,
): void {
  material.onBeforeCompile = (shader) => {
    // Add shared uniforms (reference same objects)
    for (const [key, val] of Object.entries(uniforms)) {
      shader.uniforms[key] = val;
    }
    // Per-material part role
    shader.uniforms['u_partRole'] = { value: partRole };

    // Inject declarations before main in both vertex and fragment
    shader.vertexShader = shader.vertexShader.replace(
      'void main() {',
      `${CREATURE_UNIFORMS_GLSL}\nvoid main() {`,
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      'void main() {',
      `${HEADER_GLSL}\nvoid main() {`,
    );

    // Inject creature effects after dithering (last thing before })
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      `#include <dithering_fragment>\n${CREATURE_FRAGMENT_GLSL}`,
    );
  };

  // Force recompilation
  material.needsUpdate = true;
}
