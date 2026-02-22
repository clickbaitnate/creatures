// Entity is just a numeric ID. Component bitmask tracked by World.

let nextEntityId = 0;

export function createEntityId(): number {
  return nextEntityId++;
}

export function getNextEntityId(): number {
  return nextEntityId;
}

export function resetEntityId(value = 0): void {
  nextEntityId = value;
}
