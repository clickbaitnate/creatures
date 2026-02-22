// GLSL string exports for creature shaders.
// Injected into MeshStandardMaterial via onBeforeCompile.

export const NOISE_GLSL = /* glsl */ `
// Simplex-ish 3D noise (hash-based, good enough for creature patterns)
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
    i.z + vec4(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}
`;

export const VORONOI_GLSL = /* glsl */ `
// Simple 2D Voronoi for spots
vec2 voronoiHash(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}

float voronoi(vec2 p, float time) {
  vec2 n = floor(p);
  vec2 f = fract(p);
  float md = 8.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = voronoiHash(n + g);
      o = 0.5 + 0.5 * sin(time * 0.2 + 6.2831 * o); // animated drift
      vec2 r = g + o - f;
      float d = dot(r, r);
      md = min(md, d);
    }
  }
  return sqrt(md);
}
`;

export const UTIL_GLSL = /* glsl */ `
// Posterize to N levels
vec3 posterize(vec3 col, float levels) {
  return floor(col * levels + 0.5) / levels;
}

// Bayer 4x4 ordered dither
float bayerDither(vec2 fragCoord) {
  int x = int(mod(fragCoord.x, 4.0));
  int y = int(mod(fragCoord.y, 4.0));
  int index = x + y * 4;
  // 4x4 Bayer matrix values / 16
  float bayer[16];
  bayer[0]  =  0.0/16.0; bayer[1]  =  8.0/16.0; bayer[2]  =  2.0/16.0; bayer[3]  = 10.0/16.0;
  bayer[4]  = 12.0/16.0; bayer[5]  =  4.0/16.0; bayer[6]  = 14.0/16.0; bayer[7]  =  6.0/16.0;
  bayer[8]  =  3.0/16.0; bayer[9]  = 11.0/16.0; bayer[10] =  1.0/16.0; bayer[11] =  9.0/16.0;
  bayer[12] = 15.0/16.0; bayer[13] =  7.0/16.0; bayer[14] = 13.0/16.0; bayer[15] =  5.0/16.0;
  return bayer[index];
}

// HSL to RGB
vec3 hsl2rgb(vec3 hsl) {
  float h = hsl.x;
  float s = hsl.y;
  float l = hsl.z;
  float c = (1.0 - abs(2.0 * l - 1.0)) * s;
  float x = c * (1.0 - abs(mod(h * 6.0, 2.0) - 1.0));
  float m = l - c * 0.5;
  vec3 rgb;
  if      (h < 1.0/6.0) rgb = vec3(c, x, 0.0);
  else if (h < 2.0/6.0) rgb = vec3(x, c, 0.0);
  else if (h < 3.0/6.0) rgb = vec3(0.0, c, x);
  else if (h < 4.0/6.0) rgb = vec3(0.0, x, c);
  else if (h < 5.0/6.0) rgb = vec3(x, 0.0, c);
  else                   rgb = vec3(c, 0.0, x);
  return rgb + m;
}

// Hue rotation
vec3 hueRotate(vec3 col, float angle) {
  float cosA = cos(angle);
  float sinA = sin(angle);
  vec3 k = vec3(0.57735);
  return col * cosA + cross(k, col) * sinA + k * dot(k, col) * (1.0 - cosA);
}
`;

export const CREATURE_UNIFORMS_GLSL = /* glsl */ `
uniform float u_time;
uniform float u_energy;
uniform float u_hunger;
uniform float u_pain;
uniform float u_reward;
uniform float u_lifeForce;
uniform float u_tiredness;
uniform float u_age;
uniform vec3  u_baseHSL;
uniform vec3  u_accentHSL;
uniform float u_speciesHash;
uniform float u_patternType;
uniform float u_patternScale;
uniform vec4  u_patternParams;
uniform float u_rank;
uniform float u_sex;
uniform vec4  u_emotion;
uniform int   u_partRole;
`;

export const PATTERN_GLSL = /* glsl */ `
// Returns pattern intensity 0-1 for the given position
float creaturePattern(vec3 pos, float patternType, float scale, vec4 params, float time, float energy) {
  float animSpeed = mix(0.1, 1.0, energy);
  float t = time * animSpeed;
  int pType = int(patternType + 0.5);

  if (pType == 0) {
    // Solid — no pattern
    return 0.0;
  }
  else if (pType == 1) {
    // Stripes — direction from params.xy, freq from params.z
    vec2 dir = normalize(params.xy + 0.001);
    float freq = params.z * scale;
    return smoothstep(0.0, 0.3, sin(dot(pos.xy, dir) * freq + t * 0.3));
  }
  else if (pType == 2) {
    // Spots — Voronoi cells
    float density = params.x * scale;
    float v = voronoi(pos.xz * density, t);
    return 1.0 - smoothstep(0.05, 0.25 * params.y, v);
  }
  else if (pType == 3) {
    // Spirals
    float arms = max(1.0, floor(params.x * 5.0 + 1.0));
    float tightness = params.y * 3.0 + 1.0;
    float a = atan(pos.z, pos.x);
    float r = length(pos.xz) * scale;
    return smoothstep(0.0, 0.4, sin(a * arms + r * tightness + t * 0.15));
  }
  else if (pType == 4) {
    // Gradient — vertical blend
    float blend = clamp(pos.y * scale * 0.5 + 0.5 + sin(t * 0.4) * 0.15, 0.0, 1.0);
    return blend;
  }
  else if (pType == 5) {
    // Iridescence — view-angle dependent (approximated with normal.z)
    float iriShift = pos.z * 2.0 + sin(t * 0.5) * 0.1;
    return clamp(iriShift * 0.5 + 0.5, 0.0, 1.0);
  }

  return 0.0;
}
`;

// The main fragment shader injection — goes after #include <dithering_fragment>
export const CREATURE_FRAGMENT_GLSL = /* glsl */ `
{
  // Only apply patterns to body parts (0=body, 1=belly, 2=accent)
  if (u_partRole <= 2) {
    vec3 baseRGB = hsl2rgb(u_baseHSL);
    vec3 accentRGB = hsl2rgb(u_accentHSL);

    // Pattern
    float pat = creaturePattern(vViewPosition, u_patternType, u_patternScale, u_patternParams, u_time, u_energy);

    // Reward amplifies pattern motion (brief psychedelic surge)
    pat = clamp(pat + u_reward * 0.3, 0.0, 1.0);

    // Mix accent color based on pattern
    if (u_partRole == 0 || u_partRole == 2) {
      gl_FragColor.rgb = mix(gl_FragColor.rgb, mix(gl_FragColor.rgb, accentRGB, 0.6), pat * 0.5);
    }

    // Hue cycling — species-specific, amplified by reward
    float hueShift = sin(u_time * 0.5 + u_speciesHash * 6.28) * (0.05 + u_reward * 0.3);
    gl_FragColor.rgb = hueRotate(gl_FragColor.rgb, hueShift);

    // Pain flash — red overlay
    gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0, 0.1, 0.05), u_pain * 0.6);

    // Energy desaturation
    float gray = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));
    float desat = smoothstep(0.5, 0.1, u_energy);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(gray), desat * 0.6);

    // Tiredness dimming
    gl_FragColor.rgb *= mix(1.0, 0.5, u_tiredness);

    // Age graying
    gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(gray), u_age * 0.4);
  }

  // Rank glow — rim-light boost (applies to all parts except eyes/mouth)
  // Use 'normal' (computed by normal_fragment_begin) instead of vNormal
  // since vNormal is not declared with flatShading enabled.
  if (u_partRole <= 2) {
    vec3 viewDir = normalize(-vViewPosition);
    float rim = 1.0 - max(dot(viewDir, normal), 0.0);
    rim = pow(rim, 3.0);
    gl_FragColor.rgb += vec3(1.0, 0.95, 0.8) * rim * u_rank * 0.5;
  }

  // Posterization — N64 color banding
  float levels = mix(6.0, 4.0, u_tiredness);
  gl_FragColor.rgb = posterize(gl_FragColor.rgb, levels);

  // Dithering
  float dither = bayerDither(gl_FragCoord.xy);
  float ditherStrength = mix(0.02, 0.06, 1.0 - u_energy);
  gl_FragColor.rgb += (dither - 0.5) * ditherStrength;

  // Display intensity boost for males during courtship (via u_sex and u_emotion.x)
  if (u_sex < 0.5) {
    float displayBoost = u_emotion.x * 0.15;
    gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb * 1.3, displayBoost);
  }
}
`;
