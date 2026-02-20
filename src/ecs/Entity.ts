// Entity is just a numeric ID. Component bitmask tracked by World.

let nextEntityId = 0;

export function createEntityId(): number {
  return nextEntityId++;
}
