import { System } from '../ecs/System';
import type { World } from '../ecs/World';
import { ResourceGrid } from '../world/ResourceGrid';
import type { SeasonState } from '../world/Seasons';
import { updateSeason } from '../world/Seasons';

const CA_INTERVAL = 30; // run CA tick every 30 sim ticks

export class ResourceGridSystem extends System {
  readonly query = 0; // doesn't query entities
  readonly priority = 5;

  grid: ResourceGrid;
  season: SeasonState;
  private tickCounter = 0;

  constructor(grid: ResourceGrid, season: SeasonState) {
    super();
    this.grid = grid;
    this.season = season;
  }

  update(_world: World, _dt: number): void {
    updateSeason(this.season);

    this.tickCounter++;
    if (this.tickCounter >= CA_INTERVAL) {
      this.tickCounter = 0;
      this.grid.tick(this.season.growthMult, this.season.spreadMult);
    }
  }
}
