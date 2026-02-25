// Metallic hypersigillism skybox with rainbow traces
// Custom ShaderMaterial on an inverted sphere

import * as THREE from 'three';

const vertexShader = /* glsl */ `
varying vec3 vWorldDir;
varying vec2 vUv;

void main() {
  vUv = uv;
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldDir = normalize(worldPos.xyz - cameraPosition);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = /* glsl */ `
precision highp float;

uniform float uTime;
uniform float uDayLight;  // 0=night, 1=day
uniform vec3 uSunDir;

varying vec3 vWorldDir;
varying vec2 vUv;

// ── Noise functions ──────────────────────────────────────────

float hash(vec3 p) {
  p = fract(p * vec3(443.897, 441.423, 437.195));
  p += dot(p, p.yzx + 19.19);
  return fract((p.x + p.y) * p.z);
}

float noise3d(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);

  float n = mix(
    mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
        mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
        mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
    f.z);
  return n;
}

float fbm(vec3 p, int octaves) {
  float val = 0.0;
  float amp = 0.5;
  float freq = 1.0;
  for (int i = 0; i < 6; i++) {
    if (i >= octaves) break;
    val += amp * noise3d(p * freq);
    freq *= 2.17;
    amp *= 0.48;
  }
  return val;
}

// ── Sigil geometry ───────────────────────────────────────────

// Triangle wave for sharp angular patterns
float tri(float x) {
  return abs(fract(x) - 0.5) * 2.0;
}

// Hexagonal distance field
float hexDist(vec2 p) {
  p = abs(p);
  return max(p.x + p.y * 0.577350269, p.y * 1.154700538);
}

// Rotating 2D
vec2 rot2d(vec2 p, float a) {
  float c = cos(a), s = sin(a);
  return vec2(p.x * c - p.y * s, p.x * s + p.y * c);
}

// Sigil pattern: layered geometric forms
float sigilPattern(vec3 dir, float t) {
  // Project onto sphere coordinates
  float phi = atan(dir.z, dir.x);
  float theta = acos(clamp(dir.y, -1.0, 1.0));

  vec2 uv = vec2(phi / 3.14159, theta / 3.14159);

  float pattern = 0.0;

  // Layer 1: Rotating hex grid
  vec2 p1 = rot2d(uv * 6.0, t * 0.15);
  float hex1 = hexDist(fract(p1) - 0.5);
  pattern += smoothstep(0.45, 0.42, hex1) * 0.4;

  // Layer 2: Counter-rotating triangular lattice
  vec2 p2 = rot2d(uv * 10.0, -t * 0.1);
  float tri1 = tri(p2.x + p2.y) * tri(p2.x - p2.y);
  pattern += smoothstep(0.2, 0.18, tri1) * 0.3;

  // Layer 3: Radial sigil lines
  float radial = abs(sin(phi * 8.0 + t * 0.2)) * abs(sin(theta * 6.0 - t * 0.15));
  pattern += smoothstep(0.05, 0.0, radial) * 0.2;

  // Layer 4: Deep fractal hex
  vec2 p4 = rot2d(uv * 20.0, t * 0.05 + sin(t * 0.07) * 2.0);
  float hex2 = hexDist(fract(p4) - 0.5);
  pattern += smoothstep(0.48, 0.46, hex2) * smoothstep(0.3, 0.48, hex2) * 0.6;

  // Layer 5: Sacred geometry circles
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    vec2 center = vec2(sin(t * 0.1 + fi * 2.094), cos(t * 0.08 + fi * 2.094)) * 0.3;
    vec2 p5 = uv * 4.0 - center;
    float r = length(p5);
    float ring = abs(r - 0.5 - fi * 0.3) - 0.02;
    pattern += smoothstep(0.02, 0.0, abs(ring)) * 0.25;
  }

  return clamp(pattern, 0.0, 1.0);
}

// ── Metallic reflection ──────────────────────────────────────

vec3 metallicReflection(vec3 dir, float t) {
  // Fake environment reflection using warped noise
  vec3 warpedDir = dir + 0.3 * vec3(
    noise3d(dir * 3.0 + t * 0.1),
    noise3d(dir * 3.0 + 100.0 + t * 0.08),
    noise3d(dir * 3.0 + 200.0 + t * 0.12)
  );

  float n = fbm(warpedDir * 2.0 + t * 0.05, 4);

  // Chrome base
  vec3 chrome = mix(vec3(0.15, 0.15, 0.2), vec3(0.8, 0.85, 0.9), n);

  // Fresnel-like darkening at edges
  float fresnel = pow(1.0 - abs(dir.y), 3.0);
  chrome *= 1.0 + fresnel * 0.5;

  return chrome;
}

// ── Rainbow trace ────────────────────────────────────────────

vec3 rainbowTrace(vec3 dir, float t) {
  float phi = atan(dir.z, dir.x);
  float theta = acos(clamp(dir.y, -1.0, 1.0));

  // Multiple flowing rainbow streams
  float stream1 = sin(phi * 3.0 + theta * 5.0 + t * 0.4 + fbm(dir * 4.0 + t * 0.1, 3) * 3.0);
  float stream2 = sin(phi * 7.0 - theta * 3.0 - t * 0.3 + fbm(dir * 6.0 - t * 0.15, 3) * 2.0);
  float stream3 = sin(phi * 5.0 + theta * 8.0 + t * 0.25);

  // Sharp traces (not smooth gradients)
  float trace1 = smoothstep(0.92, 0.98, stream1);
  float trace2 = smoothstep(0.93, 0.98, stream2);
  float trace3 = smoothstep(0.90, 0.96, stream3);

  // Rainbow hue from position + time
  float hue1 = fract(phi * 0.5 + t * 0.05);
  float hue2 = fract(theta * 0.3 + t * 0.07 + 0.33);
  float hue3 = fract((phi + theta) * 0.4 + t * 0.03 + 0.66);

  // HSV to RGB (simplified)
  vec3 col1 = 0.5 + 0.5 * cos(6.28318 * (hue1 + vec3(0.0, 0.33, 0.67)));
  vec3 col2 = 0.5 + 0.5 * cos(6.28318 * (hue2 + vec3(0.0, 0.33, 0.67)));
  vec3 col3 = 0.5 + 0.5 * cos(6.28318 * (hue3 + vec3(0.0, 0.33, 0.67)));

  return col1 * trace1 * 1.5 + col2 * trace2 * 1.2 + col3 * trace3 * 0.8;
}

// ── Main ─────────────────────────────────────────────────────

void main() {
  vec3 dir = normalize(vWorldDir);
  float t = uTime;

  // Base metallic sky
  vec3 metal = metallicReflection(dir, t);

  // Sigil overlay
  float sigil = sigilPattern(dir, t);

  // Sigil color: chrome with slight blue/purple tint
  vec3 sigilCol = mix(
    vec3(0.4, 0.42, 0.5),
    vec3(0.9, 0.92, 1.0),
    sigil
  );

  // Combine metal base with sigil geometry
  vec3 color = mix(metal, sigilCol, sigil * 0.7);

  // Add metallic sheen to sigil lines
  color += sigil * vec3(0.3, 0.35, 0.45) * (0.5 + 0.5 * sin(t * 0.3));

  // Rainbow traces on top
  vec3 rainbow = rainbowTrace(dir, t);
  color += rainbow;

  // Rainbow also reflects in the metallic areas
  float metalN = fbm(dir * 3.0 + t * 0.02, 3);
  color += rainbow * 0.3 * metalN;

  // Horizon glow
  float horizonGlow = exp(-abs(dir.y) * 4.0);
  vec3 horizonCol = 0.5 + 0.5 * cos(6.28318 * (t * 0.02 + vec3(0.0, 0.1, 0.2)));
  color += horizonCol * horizonGlow * 0.15;

  // Day/night modulation
  float nightFactor = 1.0 - uDayLight;

  // At night: darker, more saturated, sigils glow more
  vec3 nightColor = color * 0.3;
  nightColor += sigil * vec3(0.1, 0.08, 0.2) * 0.5; // sigils softly glow at night
  nightColor += rainbow * 0.5; // rainbow traces persist

  // At day: brighter, washed out slightly, metallic sheen stronger
  vec3 dayColor = color * 0.6 + vec3(0.15, 0.18, 0.22);

  // Sun contribution during day
  float sunDot = max(dot(dir, uSunDir), 0.0);
  dayColor += pow(sunDot, 32.0) * vec3(1.0, 0.95, 0.8) * 0.4;
  dayColor += pow(sunDot, 4.0) * vec3(0.3, 0.25, 0.2) * 0.3;

  color = mix(dayColor, nightColor, nightFactor);

  // Subtle vignette toward nadir (ground)
  float nadir = smoothstep(-0.1, -0.5, dir.y);
  color = mix(color, vec3(0.02, 0.02, 0.04), nadir);

  // Tone mapping
  color = color / (color + 0.8);

  // Slight chromatic split at bright areas for extra hypersigil feel
  float brightness = dot(color, vec3(0.299, 0.587, 0.114));
  if (brightness > 0.4) {
    float shift = (brightness - 0.4) * 0.02;
    color.r = color.r + shift;
    color.b = color.b - shift;
  }

  gl_FragColor = vec4(color, 1.0);
}
`;

export class SkyDome {
  mesh: THREE.Mesh;
  private material: THREE.ShaderMaterial;

  constructor() {
    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uDayLight: { value: 1.0 },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      },
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
    });

    const geometry = new THREE.SphereGeometry(10, 32, 24);
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.renderOrder = -1000;
    this.mesh.frustumCulled = false;
  }

  update(time: number, dayLight: number, sunAngle: number): void {
    this.material.uniforms.uTime.value = time;
    this.material.uniforms.uDayLight.value = dayLight;
    this.material.uniforms.uSunDir.value.set(
      Math.cos(sunAngle),
      Math.sin(sunAngle),
      0,
    ).normalize();
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
