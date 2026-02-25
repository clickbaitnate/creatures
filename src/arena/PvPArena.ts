// ═══════════════════════════════════════════════════════════════════════
// PvP Arena — A standalone combat test mode for creature animations
// ═══════════════════════════════════════════════════════════════════════
//
// Spawns two creatures on a small arena floor with weapons equipped.
// They fight using TacticalCombatSystem logic and the AnimationSystem
// renders their combat animations. Camera orbits around the fight.

import * as THREE from 'three';
import { World } from '../ecs/World';
import { TransformStore } from '../components/Transform';
import { RenderableStore } from '../components/Renderable';
import { BrainStore } from '../components/Brain';
import { GenomeStore } from '../components/Genome';
import { BiochemStore, createBiochem } from '../components/Biochemistry';
import { MotorStore, createMotor } from '../components/Motor';
import { SensesStore, createSenses } from '../components/Senses';
import { LifecycleStore, createLifecycle, LifeStage } from '../components/Lifecycle';
import { SocialStore, createSocial, Activity } from '../components/Social';
import { InventoryStore, createInventory, addItem, ItemType, countItem, getBestWeapon } from '../components/Inventory';
import { GoalStore, createGoal } from '../components/Goal';
import { ZealotryStore, createZealotry } from '../components/Zealotry';
import { MemoryStore, createMemory } from '../components/Memory';
import { VocabularyStore, createVocabulary } from '../components/Vocabulary';
import { CombatStore, createCombat } from '../components/Combat';
import { DiaryStore, createDiary } from '../components/Diary';
import { MatingStore, createMating } from '../components/Mating';
import { ExpressionStore, createExpression } from '../components/Expression';
import { ShaderStateStore } from '../components/ShaderState';
import { createDefaultGenome, genomeToBrain, type CreatureGenome } from '../genome/Genome';
import { buildCreatureMesh, attachToolMesh, attachShieldMesh } from '../creatures/MeshBuilder';
import { ChemId } from '../biochemistry/ChemicalRegistry';
import { randFloat } from '../utils/Math';
import { ITEM_NAMES } from '../components/Inventory';
import { CombatVFX } from '../creatures/CombatVFX';
import type { SpaceMouse } from '../input/SpaceMouse';

// ── Arena Config ───────────────────────────────────────────────────────

const ARENA_SIZE = 12;
const SPAWN_DIST = 4;
const CAMERA_HEIGHT = 6;
const CAMERA_DIST = 10;
const CAMERA_ORBIT_SPEED = 0.3;

// ── Loadout presets ────────────────────────────────────────────────────

interface Loadout {
  name: string;
  emoji: string;
  items: [ItemType, number][];
  traits: Partial<CreatureGenome>;
}

const LOADOUTS: Loadout[] = [
  {
    name: 'Swordsman',
    emoji: '⚔️',
    items: [[ItemType.IronSword, 1], [ItemType.Shield, 1]],
    traits: { aggression: 0.8, speed: 2.5, bodyScale: 1.1 },
  },
  {
    name: 'Berserker',
    emoji: '🪓',
    items: [[ItemType.MetalAxe, 1]],
    traits: { aggression: 0.95, speed: 3.0, bodyScale: 1.3, huntAffinity: 0.8 },
  },
  {
    name: 'Scout',
    emoji: '🏹',
    items: [[ItemType.StoneSword, 1], [ItemType.Shield, 1]],
    traits: { aggression: 0.5, speed: 3.5, bodyScale: 0.8, curiosity: 0.9 },
  },
  {
    name: 'Brute',
    emoji: '🛡️',
    items: [[ItemType.WoodSword, 1], [ItemType.Shield, 1]],
    traits: { aggression: 0.6, speed: 1.8, bodyScale: 1.4, loyalty: 0.9 },
  },
  {
    name: 'Miner',
    emoji: '⛏️',
    items: [[ItemType.MetalPick, 1]],
    traits: { aggression: 0.4, speed: 2.2, bodyScale: 1.0, gatherAffinity: 0.9 },
  },
  {
    name: 'Random',
    emoji: '🎲',
    items: [],
    traits: {},
  },
];

// ── Arena State ────────────────────────────────────────────────────────

interface Fighter {
  id: number;
  genome: CreatureGenome;
  mesh: THREE.Group;
  loadoutIndex: number;
}

export class PvPArena {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private world: World;
  private running = false;
  private disposed = false;

  private fighters: Fighter[] = [];
  private arenaGroup: THREE.Group;
  private orbitAngle = 0;
  private uiRoot: HTMLDivElement;
  private animFrameId = 0;
  private lastTime = 0;

  // Round state
  private roundActive = false;
  private roundTimer = 0;
  private roundCount = 0;
  private wins = [0, 0];
  private paused = false;
  private speedMult = 1;
  private combatVFX: CombatVFX | null = null;
  private spaceMouse: SpaceMouse | null = null;
  private smCamDist: number = CAMERA_DIST;
  private smCamHeight: number = CAMERA_HEIGHT;

  onExit: (() => void) | null = null;

  constructor(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    renderer: THREE.WebGLRenderer,
    spaceMouse?: SpaceMouse,
  ) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.spaceMouse = spaceMouse ?? null;
    this.world = new World();
    this.arenaGroup = new THREE.Group();
    this.uiRoot = document.createElement('div');

    // Register all required storages
    const storages = [
      TransformStore, RenderableStore, BrainStore, GenomeStore,
      BiochemStore, MotorStore, SensesStore, LifecycleStore,
      SocialStore, InventoryStore, GoalStore, ZealotryStore,
      MemoryStore, VocabularyStore, CombatStore, DiaryStore,
      MatingStore, ExpressionStore, ShaderStateStore,
    ];
    for (const s of storages) {
      this.world.registerStorage(s as any);
    }
  }

  start(): void {
    this.running = true;
    this.disposed = false;
    this.buildArena();
    this.buildUI();
    this.spawnFighters(0, 0); // default loadouts
    this.startRound();
    this.lastTime = performance.now();
    this.tick();
  }

  stop(): void {
    this.running = false;
    this.disposed = true;
    cancelAnimationFrame(this.animFrameId);

    // Dispose combat VFX
    if (this.combatVFX) {
      this.combatVFX.dispose();
      this.combatVFX = null;
    }

    // Remove arena meshes
    this.scene.remove(this.arenaGroup);

    // Remove fighter meshes
    for (const f of this.fighters) {
      this.scene.remove(f.mesh);
    }
    this.fighters = [];

    // Remove UI
    this.uiRoot.remove();

    // Restore scene
    this.scene.background = new THREE.Color(0x87CEEB);
    this.scene.fog = new THREE.FogExp2(0x87CEEB, 0.005);
  }

  // ── Arena Construction ─────────────────────────────────────────────

  private buildArena(): void {
    this.arenaGroup = new THREE.Group();
    this.combatVFX = new CombatVFX(this.scene);

    // Dark backdrop
    this.scene.background = new THREE.Color(0x0a0a1a);
    this.scene.fog = new THREE.FogExp2(0x0a0a1a, 0.04);

    // Arena floor — stone circle
    const floorGeo = new THREE.CircleGeometry(ARENA_SIZE, 64);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x2a2a3a,
      roughness: 0.8,
      metalness: 0.1,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.arenaGroup.add(floor);

    // Ring markings
    const ringGeo = new THREE.RingGeometry(ARENA_SIZE - 0.3, ARENA_SIZE, 64);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x554422, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.01;
    this.arenaGroup.add(ring);

    // Inner ring
    const innerRing = new THREE.Mesh(
      new THREE.RingGeometry(SPAWN_DIST - 0.1, SPAWN_DIST + 0.1, 64),
      new THREE.MeshBasicMaterial({ color: 0x333344, side: THREE.DoubleSide }),
    );
    innerRing.rotation.x = -Math.PI / 2;
    innerRing.position.y = 0.01;
    this.arenaGroup.add(innerRing);

    // Center mark
    const centerGeo = new THREE.CircleGeometry(0.3, 16);
    const centerMat = new THREE.MeshBasicMaterial({ color: 0x664422 });
    const center = new THREE.Mesh(centerGeo, centerMat);
    center.rotation.x = -Math.PI / 2;
    center.position.y = 0.02;
    this.arenaGroup.add(center);

    // Lighting
    const ambient = new THREE.AmbientLight(0x334466, 0.6);
    this.arenaGroup.add(ambient);

    const spot1 = new THREE.SpotLight(0xff6644, 2, 30, Math.PI / 4, 0.5);
    spot1.position.set(-5, 10, -5);
    spot1.castShadow = true;
    this.arenaGroup.add(spot1);

    const spot2 = new THREE.SpotLight(0x4466ff, 2, 30, Math.PI / 4, 0.5);
    spot2.position.set(5, 10, 5);
    spot2.castShadow = true;
    this.arenaGroup.add(spot2);

    // Rim lights
    const rim1 = new THREE.PointLight(0xff4444, 1, 20);
    rim1.position.set(-ARENA_SIZE, 2, 0);
    this.arenaGroup.add(rim1);

    const rim2 = new THREE.PointLight(0x4444ff, 1, 20);
    rim2.position.set(ARENA_SIZE, 2, 0);
    this.arenaGroup.add(rim2);

    // Torches around arena
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const x = Math.cos(angle) * (ARENA_SIZE + 1);
      const z = Math.sin(angle) * (ARENA_SIZE + 1);

      const torchLight = new THREE.PointLight(0xff8833, 0.5, 8);
      torchLight.position.set(x, 3, z);
      this.arenaGroup.add(torchLight);

      // Torch post
      const postGeo = new THREE.CylinderGeometry(0.08, 0.1, 3, 6);
      const postMat = new THREE.MeshStandardMaterial({ color: 0x553311 });
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(x, 1.5, z);
      post.castShadow = true;
      this.arenaGroup.add(post);

      // Flame glow sphere
      const flameGeo = new THREE.SphereGeometry(0.15, 8, 8);
      const flameMat = new THREE.MeshBasicMaterial({ color: 0xff8833 });
      const flame = new THREE.Mesh(flameGeo, flameMat);
      flame.position.set(x, 3.2, z);
      flame.name = `torch_${i}`;
      this.arenaGroup.add(flame);
    }

    this.scene.add(this.arenaGroup);
  }

  // ── Fighter Spawning ───────────────────────────────────────────────

  private spawnFighters(loadout1: number, loadout2: number): void {
    // Clean up existing fighters
    for (const f of this.fighters) {
      this.scene.remove(f.mesh);
      this.world.destroy(f.id);
    }
    this.fighters = [];

    const f1 = this.spawnFighter(-SPAWN_DIST, 0, Math.PI / 2, loadout1, 1);
    const f2 = this.spawnFighter(SPAWN_DIST, 0, -Math.PI / 2, loadout2, 2);
    this.fighters = [f1, f2];
  }

  private spawnFighter(x: number, z: number, rotation: number, loadoutIdx: number, factionId: number): Fighter {
    const loadout = LOADOUTS[loadoutIdx];
    const genome = createDefaultGenome();

    // Apply loadout traits
    Object.assign(genome, loadout.traits);

    // Random colors for visual variety
    genome.colorH = randFloat(0, 360);
    genome.accentH = randFloat(0, 360);

    // Random weapon if "Random" loadout
    if (loadout.name === 'Random') {
      const weapons: ItemType[] = [ItemType.WoodSword, ItemType.StoneSword, ItemType.IronSword, ItemType.StoneAxe, ItemType.MetalAxe, ItemType.MetalPick];
      const randomWeapon = weapons[Math.floor(Math.random() * weapons.length)];
      loadout.items = [[randomWeapon, 1]];
      if (Math.random() > 0.4) loadout.items.push([ItemType.Shield, 1]);
      genome.aggression = randFloat(0.3, 1.0);
      genome.speed = randFloat(1.5, 3.5);
      genome.bodyScale = randFloat(0.7, 1.4);
    }

    const id = this.world.spawn();
    const { group: mesh, uniforms } = buildCreatureMesh(genome);
    mesh.position.set(x, 0, z);
    mesh.rotation.y = rotation;
    mesh.userData.entityId = id;
    this.scene.add(mesh);

    this.world.addComponent(id, TransformStore, { x, y: 0, z, rotation });
    this.world.addComponent(id, RenderableStore, { object: mesh });
    this.world.addComponent(id, ShaderStateStore, { uniforms });
    this.world.addComponent(id, BrainStore, { brain: genomeToBrain(genome) });
    this.world.addComponent(id, GenomeStore, { genome });
    this.world.addComponent(id, BiochemStore, createBiochem());
    this.world.addComponent(id, MotorStore, createMotor());
    this.world.addComponent(id, SensesStore, createSenses());
    this.world.addComponent(id, LifecycleStore, createLifecycle(99999));
    this.world.addComponent(id, MatingStore, createMating(genome.sex));
    this.world.addComponent(id, ExpressionStore, createExpression());
    this.world.addComponent(id, GoalStore, createGoal());
    this.world.addComponent(id, ZealotryStore, createZealotry());
    this.world.addComponent(id, MemoryStore, createMemory());
    this.world.addComponent(id, VocabularyStore, createVocabulary());
    this.world.addComponent(id, CombatStore, createCombat(
      genome.combatWeightsIH, genome.combatBiasH,
      genome.combatWeightsHO, genome.combatBiasO,
    ));
    this.world.addComponent(id, DiaryStore, createDiary());

    const inv = createInventory();
    for (const [item, qty] of loadout.items) {
      addItem(inv, item, qty);
    }
    this.world.addComponent(id, InventoryStore, inv);

    // Set social with unique faction so they fight
    const social = createSocial(loadout.name, factionId);
    social.health = 1.0;
    social.activity = Activity.Fighting;
    social.attackTarget = -1; // Will be set in combat logic
    this.world.addComponent(id, SocialStore, social);

    // Full energy
    const bio = BiochemStore.get(id);
    if (bio) {
      bio.chemicals[ChemId.Energy] = 1.0;
      bio.chemicals[ChemId.Glucose] = 0.8;
    }

    // Set threat so combat system activates
    const senses = SensesStore.get(id);
    if (senses) {
      senses.threatLevel = 0.8;
    }

    // Equip first weapon immediately
    if (loadout.items.length > 0) {
      inv.equippedTool = loadout.items[0][0];
      attachToolMesh(mesh, inv.equippedTool as ItemType);
      if (countItem(inv, ItemType.Shield) > 0) {
        attachShieldMesh(mesh, true);
      }
    }

    return { id, genome, mesh, loadoutIndex: loadoutIdx };
  }

  // ── Combat Logic ───────────────────────────────────────────────────

  private startRound(): void {
    this.roundActive = true;
    this.roundTimer = 0;
    this.roundCount++;

    // Reset fighters to starting positions
    if (this.fighters.length === 2) {
      this.resetFighterState(this.fighters[0], -SPAWN_DIST, 0, Math.PI / 2);
      this.resetFighterState(this.fighters[1], SPAWN_DIST, 0, -Math.PI / 2);
    }
  }

  private resetFighterState(f: Fighter, x: number, z: number, rot: number): void {
    const t = TransformStore.get(f.id);
    if (t) { t.x = x; t.y = 0; t.z = z; t.rotation = rot; }
    f.mesh.position.set(x, 0, z);
    f.mesh.rotation.y = rot;

    const social = SocialStore.get(f.id);
    if (social) {
      social.health = 1.0;
      social.activity = Activity.Fighting;
    }

    const bio = BiochemStore.get(f.id);
    if (bio) {
      bio.chemicals[ChemId.Energy] = 1.0;
    }

    const lc = LifecycleStore.get(f.id);
    if (lc) lc.stage = LifeStage.Alive;

    const senses = SensesStore.get(f.id);
    if (senses) senses.threatLevel = 0.8;
  }

  private updateCombat(dt: number): void {
    if (!this.roundActive || this.fighters.length < 2) return;
    this.roundTimer += dt;

    const f1 = this.fighters[0];
    const f2 = this.fighters[1];
    const s1 = SocialStore.get(f1.id);
    const s2 = SocialStore.get(f2.id);
    const t1 = TransformStore.get(f1.id);
    const t2 = TransformStore.get(f2.id);

    if (!s1 || !s2 || !t1 || !t2) return;

    // Set each other as attack targets
    s1.attackTarget = f2.id;
    s2.attackTarget = f1.id;
    s1.activity = Activity.Fighting;
    s2.activity = Activity.Fighting;

    // Simple AI: move toward each other
    const dx = t2.x - t1.x;
    const dz = t2.z - t1.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    const m1 = MotorStore.get(f1.id);
    const m2 = MotorStore.get(f2.id);

    if (m1) {
      const angle1 = Math.atan2(dx, dz);
      let rel1 = angle1 - t1.rotation;
      while (rel1 > Math.PI) rel1 -= Math.PI * 2;
      while (rel1 < -Math.PI) rel1 += Math.PI * 2;
      if (rel1 < -0.1) m1.turnLeft = 0.5;
      else if (rel1 > 0.1) m1.turnRight = 0.5;
      m1.forward = dist > 1.5 ? 0.8 : 0.1;

      // Update transform (simple movement)
      t1.rotation += (m1.turnRight - m1.turnLeft) * dt * 3;
      t1.x += Math.sin(t1.rotation) * m1.forward * dt * (f1.genome.speed ?? 2);
      t1.z += Math.cos(t1.rotation) * m1.forward * dt * (f1.genome.speed ?? 2);
    }
    if (m2) {
      const angle2 = Math.atan2(-dx, -dz);
      let rel2 = angle2 - t2.rotation;
      while (rel2 > Math.PI) rel2 -= Math.PI * 2;
      while (rel2 < -Math.PI) rel2 += Math.PI * 2;
      if (rel2 < -0.1) m2.turnLeft = 0.5;
      else if (rel2 > 0.1) m2.turnRight = 0.5;
      m2.forward = dist > 1.5 ? 0.8 : 0.1;

      t2.rotation += (m2.turnRight - m2.turnLeft) * dt * 3;
      t2.x += Math.sin(t2.rotation) * m2.forward * dt * (f2.genome.speed ?? 2);
      t2.z += Math.cos(t2.rotation) * m2.forward * dt * (f2.genome.speed ?? 2);
    }

    // Damage when close
    if (dist < 2.0) {
      const inv1 = InventoryStore.get(f1.id);
      const inv2 = InventoryStore.get(f2.id);
      const weapon1 = inv1 ? getBestWeapon(inv1) : { damage: 0.3 };
      const weapon2 = inv2 ? getBestWeapon(inv2) : { damage: 0.3 };

      // Attack rate: every ~0.5 seconds
      const attackRate = 0.02;
      const aggressionMod1 = f1.genome.aggression * 0.5 + 0.5;
      const aggressionMod2 = f2.genome.aggression * 0.5 + 0.5;

      if (Math.random() < attackRate * aggressionMod1) {
        const dmg = weapon1.damage * randFloat(0.05, 0.12);
        s2.health = Math.max(0, s2.health - dmg);
        if (this.combatVFX) {
          const hasArmor2 = inv2 ? countItem(inv2, ItemType.Shield) > 0 : false;
          if (hasArmor2) {
            this.combatVFX.spawnBlockSparks(t2.x, t2.y, t2.z);
          } else {
            this.combatVFX.spawnHitSparks(t2.x, t2.y, t2.z, 0xffaa22);
          }
          this.combatVFX.spawnSlashTrail(t1.x, t1.y, t1.z, t1.rotation, 0xffffff);
        }
      }
      if (Math.random() < attackRate * aggressionMod2) {
        const dmg = weapon2.damage * randFloat(0.05, 0.12);
        s1.health = Math.max(0, s1.health - dmg);
        if (this.combatVFX) {
          const hasArmor1 = inv1 ? countItem(inv1, ItemType.Shield) > 0 : false;
          if (hasArmor1) {
            this.combatVFX.spawnBlockSparks(t1.x, t1.y, t1.z);
          } else {
            this.combatVFX.spawnHitSparks(t1.x, t1.y, t1.z, 0xffaa22);
          }
          this.combatVFX.spawnSlashTrail(t2.x, t2.y, t2.z, t2.rotation, 0xffffff);
        }
      }
    }

    // Keep fighters in arena
    this.clampToArena(t1);
    this.clampToArena(t2);

    // Update mesh positions
    f1.mesh.position.set(t1.x, 0, t1.z);
    f1.mesh.rotation.y = t1.rotation;
    f2.mesh.position.set(t2.x, 0, t2.z);
    f2.mesh.rotation.y = t2.rotation;

    // Check for knockout
    if (s1.health <= 0 || s2.health <= 0) {
      this.roundActive = false;
      if (s1.health <= 0 && s2.health > 0) {
        this.wins[1]++;
        s2.activity = Activity.Mating; // Victory dance
      } else if (s2.health <= 0 && s1.health > 0) {
        this.wins[0]++;
        s1.activity = Activity.Mating; // Victory dance
      }
      // Both dead = draw
      this.updateScoreboard();
    }

    // Timeout at 30 seconds
    if (this.roundTimer > 30) {
      this.roundActive = false;
      // Whoever has more health wins
      if (s1.health > s2.health) this.wins[0]++;
      else if (s2.health > s1.health) this.wins[1]++;
      this.updateScoreboard();
    }
  }

  private clampToArena(t: { x: number; z: number }): void {
    const dist = Math.sqrt(t.x * t.x + t.z * t.z);
    if (dist > ARENA_SIZE - 1) {
      const scale = (ARENA_SIZE - 1) / dist;
      t.x *= scale;
      t.z *= scale;
    }
  }

  // ── Animation ──────────────────────────────────────────────────────

  private animateFighters(dt: number, time: number): void {
    for (const f of this.fighters) {
      const social = SocialStore.get(f.id);
      const motor = MotorStore.get(f.id);
      const inv = InventoryStore.get(f.id);
      if (!social) continue;

      const group = f.mesh;
      const activity = social.activity;

      // Find body parts
      const legL = this.findChild(group, 'legL');
      const legR = this.findChild(group, 'legR');
      const armL = this.findChild(group, 'armL');
      const armR = this.findChild(group, 'armR');
      const head = this.findChild(group, 'head');
      const torso = this.findChild(group, 'torso');

      // Reset
      const rs = 0.12;
      if (legL) legL.rotation.x *= (1 - rs);
      if (legR) legR.rotation.x *= (1 - rs);
      if (armL) { armL.rotation.x *= (1 - rs); armL.rotation.z *= (1 - rs); armL.rotation.y *= (1 - rs); }
      if (armR) { armR.rotation.x *= (1 - rs); armR.rotation.z *= (1 - rs); armR.rotation.y *= (1 - rs); }
      if (torso) { torso.rotation.x *= (1 - rs); torso.rotation.z *= (1 - rs); }
      if (head) head.rotation.y *= (1 - rs * 0.5);

      if (activity === Activity.Fighting) {
        const fightPhase = time * 7;
        const fightCycle = fightPhase % (Math.PI * 2);
        const isAttacking = fightCycle < Math.PI * 1.3;

        if (isAttacking) {
          const slashT = fightCycle / (Math.PI * 1.3);
          const attackType = Math.floor(fightPhase / (Math.PI * 2)) % 3;

          let armX: number, armZ: number;
          if (attackType === 0) {
            armX = -0.7 - slashT * 0.5;
            armZ = 0.6 - slashT * 1.8;
          } else if (attackType === 1) {
            armX = -1.3 + slashT * 1.0;
            armZ = -0.2 - slashT * 0.3;
          } else {
            armX = -1.0 + slashT * 0.6;
            armZ = 0.4 - slashT * 1.2;
          }

          if (armR) { armR.rotation.x = armX; armR.rotation.z = armZ; armR.rotation.y = Math.sin(fightCycle * 2) * 0.2; }
          if (armL) { armL.rotation.x = -0.3 - slashT * 0.2; armL.rotation.z = 0.1; }
          if (torso) { torso.rotation.x = -0.15; torso.rotation.z = Math.sin(slashT * Math.PI) * 0.1; }
        } else {
          const defendT = (fightCycle - Math.PI * 1.3) / (Math.PI * 0.7);
          if (armR) { armR.rotation.x = -0.6; armR.rotation.z = -0.4 + defendT * 0.1; armR.rotation.y = 0.1; }
          if (armL) { armL.rotation.x = -1.1 + defendT * 0.2; armL.rotation.z = 0.5; armL.rotation.y = -0.1; }
          if (torso) { torso.rotation.x = 0.1; torso.rotation.z = -0.05; }
        }

        if (legL) { legL.rotation.x = 0.3; legL.rotation.z = 0.1; }
        if (legR) { legR.rotation.x = -0.35; legR.rotation.z = -0.1; }
        if (head) head.rotation.x = isAttacking ? -0.1 : 0.05;
      } else if (activity === Activity.Mating) {
        // Victory dance
        const dancePhase = time * 4;
        const sway = Math.sin(dancePhase) * 0.2;
        if (torso) torso.rotation.z = sway;
        if (armL) { armL.rotation.x = -0.3; armL.rotation.z = 0.6 + Math.sin(dancePhase * 1.5) * 0.3; }
        if (armR) { armR.rotation.x = -0.3; armR.rotation.z = -0.6 - Math.sin(dancePhase * 1.5) * 0.3; }
        if (legL) legL.rotation.x = Math.sin(dancePhase * 2) * 0.15;
        if (legR) legR.rotation.x = -Math.sin(dancePhase * 2) * 0.15;
      } else {
        // Idle
        const idlePhase = time * 0.8 + f.id * 1.3;
        if (torso) { torso.rotation.x = Math.sin(idlePhase) * 0.02; }
        if (head) { head.rotation.y = Math.sin(idlePhase * 0.3) * 0.08; }
      }

      // Update tool position to follow hand
      const handR = this.findChild(group, 'handR');
      const handL = this.findChild(group, 'handL');
      const toolMesh = group.getObjectByName('equippedTool') as THREE.Group | null;
      const shieldMesh = group.getObjectByName('equippedShield') as THREE.Group | null;

      if (toolMesh && handR) {
        toolMesh.position.copy(handR.position);
        toolMesh.position.y += 0.06;
        if (armR) { toolMesh.rotation.copy(armR.rotation); toolMesh.rotation.x -= 0.3; }
      }
      if (shieldMesh && handL) {
        shieldMesh.position.copy(handL.position);
        shieldMesh.position.y += 0.06;
        shieldMesh.position.x -= 0.04;
        if (armL) { shieldMesh.rotation.copy(armL.rotation); shieldMesh.rotation.x -= 0.2; }
      }
    }
  }

  private findChild(group: THREE.Group, name: string): THREE.Object3D | null {
    for (const child of group.children) {
      if (child.name === name) return child;
    }
    return null;
  }

  // ── Camera ─────────────────────────────────────────────────────────

  private updateCamera(dt: number): void {
    // SpaceMouse: manual orbit control overrides auto-orbit
    if (this.spaceMouse) {
      const sm = this.spaceMouse.poll();
      if (sm.connected) {
        // Yaw twist → orbit angle (replaces auto-orbit when active)
        if (sm.ry !== 0) {
          this.orbitAngle += sm.ry * 2.5 * dt;
        } else {
          this.orbitAngle += dt * CAMERA_ORBIT_SPEED; // auto-orbit when idle
        }

        // Push/pull (ty) → zoom camera distance
        this.smCamDist = Math.max(4, Math.min(25, this.smCamDist - sm.ty * 15 * dt));

        // Push forward/back (tz) → camera height
        this.smCamHeight = Math.max(2, Math.min(15, this.smCamHeight + sm.tz * 10 * dt));
      } else {
        this.orbitAngle += dt * CAMERA_ORBIT_SPEED;
      }
    } else {
      this.orbitAngle += dt * CAMERA_ORBIT_SPEED;
    }

    const cx = Math.cos(this.orbitAngle) * this.smCamDist;
    const cz = Math.sin(this.orbitAngle) * this.smCamDist;
    this.camera.position.set(cx, this.smCamHeight, cz);
    this.camera.lookAt(0, 1, 0);
  }

  // ── Torch Flicker ──────────────────────────────────────────────────

  private flickerTorches(time: number): void {
    for (let i = 0; i < 8; i++) {
      const flame = this.arenaGroup.getObjectByName(`torch_${i}`);
      if (flame) {
        const scale = 0.8 + Math.sin(time * 8 + i * 2.7) * 0.3 + Math.sin(time * 13 + i * 1.3) * 0.15;
        flame.scale.setScalar(scale);
      }
    }
  }

  // ── Main Loop ──────────────────────────────────────────────────────

  private tick = (): void => {
    if (this.disposed) return;
    this.animFrameId = requestAnimationFrame(this.tick);

    const now = performance.now();
    let dt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    dt = Math.min(dt, 0.05); // Cap

    if (!this.paused) {
      dt *= this.speedMult;
      this.updateCombat(dt);
    }

    // Update combat particle effects
    if (this.combatVFX) this.combatVFX.update(dt);

    const time = now * 0.001;
    this.animateFighters(dt, time);
    this.flickerTorches(time);
    this.updateCamera(dt);
    this.updateHUD();
    this.renderer.render(this.scene, this.camera);
  };

  // ── UI ─────────────────────────────────────────────────────────────

  private buildUI(): void {
    this.uiRoot.id = 'pvp-arena-ui';
    this.uiRoot.innerHTML = `
      <style>
        #pvp-arena-ui {
          position: fixed; inset: 0; z-index: 9000; pointer-events: none;
          font-family: 'Inter', system-ui, sans-serif;
        }
        #pvp-arena-ui * { pointer-events: auto; }

        .arena-header {
          position: absolute; top: 0; left: 0; right: 0;
          display: flex; justify-content: center; align-items: center;
          padding: 16px 24px; gap: 24px;
        }
        .arena-title {
          font-size: 24px; font-weight: 900; letter-spacing: 4px;
          background: linear-gradient(135deg, #ff6644, #ff4466);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent;
          background-clip: text;
          filter: drop-shadow(0 0 10px rgba(255,80,60,0.4));
        }
        .arena-round {
          font-size: 12px; color: rgba(255,255,255,0.4); letter-spacing: 2px;
        }

        .arena-hud {
          position: absolute; top: 60px; left: 50%; transform: translateX(-50%);
          display: flex; gap: 20px; align-items: center;
        }
        .fighter-card {
          width: 200px; padding: 10px 14px;
          background: rgba(10,10,30,0.85); backdrop-filter: blur(10px);
          border-radius: 10px; border: 1px solid rgba(100,140,255,0.15);
        }
        .fighter-card.left { border-left: 3px solid #ff4444; }
        .fighter-card.right { border-right: 3px solid #4444ff; }
        .fighter-name {
          font-size: 14px; font-weight: 700; color: #e0e8ff;
          margin-bottom: 6px;
        }
        .fighter-hp-track {
          height: 10px; border-radius: 5px; background: rgba(255,255,255,0.1);
          overflow: hidden;
        }
        .fighter-hp-fill {
          height: 100%; border-radius: 5px; transition: width 0.2s;
        }
        .fighter-hp-fill.red { background: linear-gradient(90deg, #ff4444, #ff6666); }
        .fighter-hp-fill.blue { background: linear-gradient(90deg, #4444ff, #6666ff); }
        .fighter-stats {
          display: flex; gap: 8px; margin-top: 6px;
          font-size: 9px; color: rgba(255,255,255,0.4);
        }
        .vs-badge {
          font-size: 28px; font-weight: 900; color: #FFD700;
          text-shadow: 0 0 20px rgba(255,215,0,0.5);
        }
        .score-badge {
          font-size: 16px; font-weight: 700; color: rgba(255,255,255,0.6);
          text-align: center;
        }

        .arena-controls {
          position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%);
          display: flex; gap: 8px; align-items: center;
        }
        .arena-btn {
          padding: 8px 16px; border: 1px solid rgba(100,140,255,0.25);
          border-radius: 8px; background: rgba(10,10,30,0.85);
          color: #c0d0ff; font-size: 12px; font-weight: 600;
          cursor: pointer; transition: all 0.2s;
          backdrop-filter: blur(10px);
        }
        .arena-btn:hover { background: rgba(60,80,180,0.3); border-color: rgba(100,160,255,0.5); }
        .arena-btn.danger { border-color: rgba(255,80,80,0.3); color: #ff9090; }
        .arena-btn.danger:hover { background: rgba(180,40,40,0.3); }
        .arena-btn.primary { background: linear-gradient(135deg, #4a7cf7, #7c5bf0); border: none; color: white; }
        .arena-btn.primary:hover { filter: brightness(1.2); }

        .arena-loadouts {
          position: absolute; bottom: 70px; left: 50%; transform: translateX(-50%);
          display: flex; gap: 16px;
        }
        .loadout-panel {
          display: flex; flex-direction: column; gap: 4px;
          align-items: center;
        }
        .loadout-panel-label {
          font-size: 10px; color: rgba(255,255,255,0.4); letter-spacing: 1px;
        }
        .loadout-row {
          display: flex; gap: 4px;
        }
        .loadout-btn {
          padding: 5px 10px; border: 1px solid rgba(100,140,255,0.2);
          border-radius: 6px; background: rgba(10,10,30,0.7);
          color: rgba(200,210,255,0.7); font-size: 11px; cursor: pointer;
          transition: all 0.15s;
        }
        .loadout-btn:hover { background: rgba(60,80,180,0.3); }
        .loadout-btn.active { background: rgba(80,120,255,0.3); border-color: rgba(100,160,255,0.5); color: #fff; }

        .arena-ko {
          position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
          font-size: 64px; font-weight: 900; letter-spacing: 8px;
          color: #FFD700; text-shadow: 0 0 40px rgba(255,215,0,0.6);
          animation: koFlash 0.5s ease-out;
          display: none;
        }
        .arena-ko.visible { display: block; }
        @keyframes koFlash {
          0% { transform: translate(-50%, -50%) scale(2); opacity: 0; }
          100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
        }

        .arena-exit {
          position: absolute; top: 16px; left: 16px;
        }
      </style>

      <div class="arena-header">
        <div class="arena-title">⚔️ PVP ARENA</div>
        <div class="arena-round" id="arena-round">ROUND 1</div>
      </div>

      <div class="arena-hud">
        <div class="fighter-card left" id="fighter-card-0">
          <div class="fighter-name" id="fighter-name-0">Fighter 1</div>
          <div class="fighter-hp-track">
            <div class="fighter-hp-fill red" id="fighter-hp-0" style="width:100%"></div>
          </div>
          <div class="fighter-stats" id="fighter-stats-0"></div>
        </div>
        <div>
          <div class="vs-badge">VS</div>
          <div class="score-badge" id="arena-score">0 — 0</div>
        </div>
        <div class="fighter-card right" id="fighter-card-1">
          <div class="fighter-name" id="fighter-name-1">Fighter 2</div>
          <div class="fighter-hp-track">
            <div class="fighter-hp-fill blue" id="fighter-hp-1" style="width:100%"></div>
          </div>
          <div class="fighter-stats" id="fighter-stats-1"></div>
        </div>
      </div>

      <div class="arena-ko" id="arena-ko">K.O.</div>

      <div class="arena-loadouts">
        <div class="loadout-panel">
          <div class="loadout-panel-label">FIGHTER 1</div>
          <div class="loadout-row" id="loadout-row-0"></div>
        </div>
        <div class="loadout-panel">
          <div class="loadout-panel-label">FIGHTER 2</div>
          <div class="loadout-row" id="loadout-row-1"></div>
        </div>
      </div>

      <div class="arena-controls">
        <button class="arena-btn primary" id="arena-fight">⚔️ FIGHT!</button>
        <button class="arena-btn" id="arena-pause">⏸ Pause</button>
        <button class="arena-btn" id="arena-speed">⏩ 2x</button>
        <button class="arena-btn" id="arena-randomize">🎲 Randomize Both</button>
      </div>

      <div class="arena-exit">
        <button class="arena-btn danger" id="arena-exit-btn">✕ Exit Arena</button>
      </div>
    `;
    document.body.appendChild(this.uiRoot);
    this.bindUI();
  }

  private bindUI(): void {
    // Loadout buttons
    for (let fighter = 0; fighter < 2; fighter++) {
      const row = this.uiRoot.querySelector(`#loadout-row-${fighter}`) as HTMLDivElement;
      if (!row) continue;
      let html = '';
      for (let l = 0; l < LOADOUTS.length; l++) {
        const lo = LOADOUTS[l];
        const active = fighter === 0 ? l === 0 : l === 0;
        html += `<button class="loadout-btn${active ? ' active' : ''}" data-fighter="${fighter}" data-loadout="${l}">${lo.emoji} ${lo.name}</button>`;
      }
      row.innerHTML = html;
    }

    // Loadout clicks
    this.uiRoot.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('.loadout-btn') as HTMLElement;
      if (btn) {
        const fighter = parseInt(btn.dataset.fighter ?? '0');
        const loadout = parseInt(btn.dataset.loadout ?? '0');
        // Update active state
        const row = this.uiRoot.querySelector(`#loadout-row-${fighter}`);
        row?.querySelectorAll('.loadout-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        // Store selection
        if (this.fighters[fighter]) {
          this.fighters[fighter].loadoutIndex = loadout;
        }
      }
    });

    // Fight button
    this.uiRoot.querySelector('#arena-fight')?.addEventListener('click', () => {
      const l0 = this.getActiveLoadout(0);
      const l1 = this.getActiveLoadout(1);
      this.spawnFighters(l0, l1);
      this.startRound();
      const ko = this.uiRoot.querySelector('#arena-ko') as HTMLElement;
      if (ko) ko.classList.remove('visible');
    });

    // Pause
    this.uiRoot.querySelector('#arena-pause')?.addEventListener('click', () => {
      this.paused = !this.paused;
      const btn = this.uiRoot.querySelector('#arena-pause') as HTMLElement;
      if (btn) btn.textContent = this.paused ? '▶ Resume' : '⏸ Pause';
    });

    // Speed
    this.uiRoot.querySelector('#arena-speed')?.addEventListener('click', () => {
      if (this.speedMult === 1) this.speedMult = 2;
      else if (this.speedMult === 2) this.speedMult = 4;
      else this.speedMult = 1;
      const btn = this.uiRoot.querySelector('#arena-speed') as HTMLElement;
      if (btn) btn.textContent = `⏩ ${this.speedMult}x`;
    });

    // Randomize
    this.uiRoot.querySelector('#arena-randomize')?.addEventListener('click', () => {
      const randomIdx = LOADOUTS.length - 1; // "Random" is last
      this.spawnFighters(randomIdx, randomIdx);
      // Update loadout buttons
      for (let f = 0; f < 2; f++) {
        const row = this.uiRoot.querySelector(`#loadout-row-${f}`);
        row?.querySelectorAll('.loadout-btn').forEach((b, i) => {
          b.classList.toggle('active', i === randomIdx);
        });
      }
      this.startRound();
      const ko = this.uiRoot.querySelector('#arena-ko') as HTMLElement;
      if (ko) ko.classList.remove('visible');
    });

    // Exit
    this.uiRoot.querySelector('#arena-exit-btn')?.addEventListener('click', () => {
      this.stop();
      this.onExit?.();
    });
  }

  private getActiveLoadout(fighter: number): number {
    const row = this.uiRoot.querySelector(`#loadout-row-${fighter}`);
    const active = row?.querySelector('.loadout-btn.active') as HTMLElement;
    return active ? parseInt(active.dataset.loadout ?? '0') : 0;
  }

  private updateHUD(): void {
    if (this.fighters.length < 2) return;

    for (let i = 0; i < 2; i++) {
      const f = this.fighters[i];
      const social = SocialStore.get(f.id);
      const inv = InventoryStore.get(f.id);
      const hp = social?.health ?? 0;

      const hpBar = this.uiRoot.querySelector(`#fighter-hp-${i}`) as HTMLElement;
      if (hpBar) hpBar.style.width = `${Math.max(0, hp * 100)}%`;

      const nameEl = this.uiRoot.querySelector(`#fighter-name-${i}`) as HTMLElement;
      if (nameEl) {
        const loadout = LOADOUTS[f.loadoutIndex];
        nameEl.textContent = `${loadout.emoji} ${loadout.name}`;
      }

      const statsEl = this.uiRoot.querySelector(`#fighter-stats-${i}`) as HTMLElement;
      if (statsEl) {
        const wpn = inv ? getBestWeapon(inv) : { damage: 0 };
        const hasShield = inv ? countItem(inv, ItemType.Shield) > 0 : false;
        statsEl.textContent = `ATK: ${wpn.damage.toFixed(1)} · SPD: ${f.genome.speed.toFixed(1)} · AGG: ${(f.genome.aggression * 100).toFixed(0)}%${hasShield ? ' · 🛡️' : ''}`;
      }
    }

    // Round label
    const roundEl = this.uiRoot.querySelector('#arena-round') as HTMLElement;
    if (roundEl) {
      roundEl.textContent = this.roundActive ? `ROUND ${this.roundCount} · ${this.roundTimer.toFixed(1)}s` : `ROUND ${this.roundCount} OVER`;
    }
  }

  private updateScoreboard(): void {
    const scoreEl = this.uiRoot.querySelector('#arena-score') as HTMLElement;
    if (scoreEl) scoreEl.textContent = `${this.wins[0]} — ${this.wins[1]}`;

    // Show KO overlay
    const ko = this.uiRoot.querySelector('#arena-ko') as HTMLElement;
    if (ko) {
      ko.classList.add('visible');
      ko.textContent = this.roundTimer > 30 ? 'TIME!' : 'K.O.';
    }
  }
}
