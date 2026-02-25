// ═══════════════════════════════════════════════════════════════════════
// SpaceMouse / 3Dconnexion 6-DOF input via the Gamepad API
// ═══════════════════════════════════════════════════════════════════════
//
// 3Dconnexion SpaceMouse devices expose themselves as HID gamepads with
// 6 axes (3 translation + 3 rotation) and usually 0-2 buttons.
//
// Axis mapping (varies slightly per model, but this covers SpaceMouse
// Compact, SpaceMouse Pro, SpaceNavigator):
//   0 : tx  — push left (−) / right (+)
//   1 : ty  — push down (−) / up (+)   [or pull / push on some models]
//   2 : tz  — push forward (−) / backward (+)
//   3 : rx  — tilt forward (−) / backward (+)   (pitch)
//   4 : ry  — twist left (−) / right (+)         (yaw)
//   5 : rz  — tilt left (−) / right (+)          (roll)
//
// Values are in [−1, +1] with a configurable deadzone.

export interface SpaceMouseState {
  /** Pan left (−) / right (+) */
  tx: number;
  /** Pan down / pull out (−) / up / push in (+) */
  ty: number;
  /** Pan forward (−) / backward (+) */
  tz: number;
  /** Tilt (pitch) forward (−) / backward (+) */
  rx: number;
  /** Twist (yaw) left (−) / right (+) */
  ry: number;
  /** Tilt (roll) left (−) / right (+) */
  rz: number;
  /** Button 0 pressed */
  btn0: boolean;
  /** Button 1 pressed */
  btn1: boolean;
  /** Whether a SpaceMouse is connected */
  connected: boolean;
}

const DEADZONE = 0.06;

function deadzone(v: number): number {
  if (Math.abs(v) < DEADZONE) return 0;
  // Rescale so that values just past the deadzone start near 0
  const sign = v > 0 ? 1 : -1;
  return sign * (Math.abs(v) - DEADZONE) / (1 - DEADZONE);
}

export class SpaceMouse {
  private gpIndex = -1;

  readonly state: SpaceMouseState = {
    tx: 0, ty: 0, tz: 0,
    rx: 0, ry: 0, rz: 0,
    btn0: false, btn1: false,
    connected: false,
  };

  constructor() {
    window.addEventListener('gamepadconnected', (e: Event) => {
      const gp = (e as GamepadEvent).gamepad;
      if (this.looksLikeSpaceMouse(gp)) {
        this.gpIndex = gp.index;
        this.state.connected = true;
        console.log(`[SpaceMouse] Connected: "${gp.id}" (${gp.axes.length} axes, ${gp.buttons.length} buttons)`);
      }
    });

    window.addEventListener('gamepaddisconnected', (e: Event) => {
      const gp = (e as GamepadEvent).gamepad;
      if (gp.index === this.gpIndex) {
        this.gpIndex = -1;
        this.zero();
        this.state.connected = false;
        console.log('[SpaceMouse] Disconnected');
      }
    });

    // Check for already-connected gamepads (hot reload / late init)
    this.scanExisting();
  }

  // ── Detection ──────────────────────────────────────────────

  private looksLikeSpaceMouse(gp: Gamepad): boolean {
    const id = gp.id.toLowerCase();
    // Explicit vendor matches
    if (id.includes('3dconnexion')) return true;
    if (id.includes('spacemouse')) return true;
    if (id.includes('spacenavigator')) return true;
    if (id.includes('spacepilot')) return true;
    if (id.includes('spaceexplorer')) return true;
    if (id.includes('spaceball')) return true;
    // 3Dconnexion USB vendor ID (0x256F = 9583)
    if (id.includes('256f')) return true;
    // Heuristic: HID device with exactly 6 axes (most gamepads have 4)
    if (gp.axes.length >= 6 && gp.buttons.length <= 3) return true;
    return false;
  }

  private scanExisting(): void {
    try {
      const gamepads = navigator.getGamepads();
      for (const gp of gamepads) {
        if (gp && this.looksLikeSpaceMouse(gp)) {
          this.gpIndex = gp.index;
          this.state.connected = true;
          console.log(`[SpaceMouse] Found existing: "${gp.id}"`);
          break;
        }
      }
    } catch { /* getGamepads may throw in some contexts */ }
  }

  // ── Polling ────────────────────────────────────────────────

  /** Poll latest axis values — call once per frame before reading .state */
  poll(): SpaceMouseState {
    if (this.gpIndex < 0) return this.state;

    const gamepads = navigator.getGamepads();
    const gp = gamepads[this.gpIndex];
    if (!gp) {
      this.state.connected = false;
      this.zero();
      return this.state;
    }

    this.state.connected = true;
    const a = gp.axes;
    this.state.tx = deadzone(a[0] ?? 0);
    this.state.ty = deadzone(a[1] ?? 0);
    this.state.tz = deadzone(a[2] ?? 0);
    this.state.rx = deadzone(a[3] ?? 0);
    this.state.ry = deadzone(a[4] ?? 0);
    this.state.rz = deadzone(a[5] ?? 0);
    this.state.btn0 = gp.buttons[0]?.pressed ?? false;
    this.state.btn1 = gp.buttons[1]?.pressed ?? false;

    return this.state;
  }

  /** Whether any axis is currently non-zero */
  get active(): boolean {
    const s = this.state;
    return s.connected && (
      s.tx !== 0 || s.ty !== 0 || s.tz !== 0 ||
      s.rx !== 0 || s.ry !== 0 || s.rz !== 0
    );
  }

  private zero(): void {
    this.state.tx = this.state.ty = this.state.tz = 0;
    this.state.rx = this.state.ry = this.state.rz = 0;
    this.state.btn0 = this.state.btn1 = false;
  }
}
