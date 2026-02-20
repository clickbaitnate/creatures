export function clamp(x: number, min: number, max: number): number {
  return x < min ? min : x > max ? max : x;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function randFloat(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function randInt(min: number, max: number): number {
  return Math.floor(randFloat(min, max + 1));
}

export function distSq(x1: number, z1: number, x2: number, z2: number): number {
  const dx = x1 - x2;
  const dz = z1 - z2;
  return dx * dx + dz * dz;
}

export function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

export function tanhFn(x: number): number {
  return Math.tanh(x);
}

export function relu(x: number): number {
  return x > 0 ? x : 0;
}
