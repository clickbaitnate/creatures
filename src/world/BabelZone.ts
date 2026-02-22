// Babel exclusion zone: creatures can't gather/eat inside, forcing them outward when hungry.

export const BABEL_RADIUS = 15;

export function inBabelZone(x: number, z: number): boolean {
  return x * x + z * z < BABEL_RADIUS * BABEL_RADIUS;
}
