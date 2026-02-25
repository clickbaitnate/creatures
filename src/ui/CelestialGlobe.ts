// Astrological globe background for the main menu
// 3D sphere with constellation lines, rainbow tracers, polar rotation, scale pulsing

import * as THREE from 'three';

// Constellation data: [name, [[ra_hours, dec_degrees], ...], [[starIdx, starIdx], ...]]
// Simplified real positions (RA in hours 0-24, Dec in degrees -90 to +90)
const CONSTELLATIONS: [string, [number, number][], [number, number][]][] = [
  // Zodiac
  ['Aries', [[2.12, 23.5], [2.0, 21.0], [1.9, 20.8], [1.85, 19.2]], [[0,1],[1,2],[2,3]]],
  ['Taurus', [[4.6, 16.5], [4.48, 15.9], [4.33, 17.5], [4.0, 12.5], [5.63, 21.1], [5.44, 28.6]], [[0,1],[1,2],[1,3],[0,4],[4,5]]],
  ['Gemini', [[6.75, 16.4], [7.1, 30.2], [7.6, 31.9], [7.75, 28.0], [6.63, 25.1], [6.38, 22.5]], [[0,5],[5,4],[4,1],[1,2],[2,3],[3,0]]],
  ['Cancer', [[8.97, 11.9], [8.74, 21.5], [8.28, 9.2], [8.72, 18.2]], [[0,3],[3,1],[3,2]]],
  ['Leo', [[10.14, 12.0], [11.24, 20.5], [11.82, 14.6], [10.33, 19.8], [9.76, 23.8], [10.12, 16.8]], [[4,3],[3,5],[5,0],[0,1],[1,2]]],
  ['Virgo', [[13.42, -11.2], [12.69, -1.4], [13.04, 10.9], [12.33, -0.7], [11.84, 1.8], [12.93, 3.4]], [[0,1],[1,5],[5,2],[1,3],[3,4]]],
  ['Libra', [[15.28, -9.4], [14.85, -16.0], [15.07, -25.3], [14.59, -15.6]], [[0,1],[1,3],[1,2]]],
  ['Scorpius', [[16.49, -26.4], [16.0, -22.6], [16.09, -19.8], [16.35, -25.6], [16.86, -34.3], [17.2, -37.1], [17.56, -37.0], [17.62, -43.0]], [[2,1],[1,0],[0,3],[3,4],[4,5],[5,6],[6,7]]],
  ['Sagittarius', [[18.4, -29.6], [18.1, -30.4], [19.04, -29.9], [18.92, -26.3], [18.35, -25.4], [19.16, -21.0], [18.76, -27.0]], [[1,0],[0,6],[6,4],[4,3],[3,5],[6,2]]],
  ['Capricornus', [[20.29, -12.5], [21.78, -16.1], [21.44, -22.4], [20.77, -25.3], [20.35, -14.8]], [[0,4],[4,1],[1,2],[2,3],[3,0]]],
  ['Aquarius', [[22.1, -0.3], [21.53, -5.6], [22.36, -1.4], [22.48, 0.0], [22.88, -7.6], [23.16, -6.0]], [[1,0],[0,2],[2,3],[3,4],[4,5]]],
  ['Pisces', [[1.52, 15.3], [23.99, 6.9], [23.67, 5.6], [23.29, 3.3], [0.81, 7.6], [1.19, 24.6]], [[3,2],[2,1],[1,4],[4,0],[0,5]]],
  // Famous
  ['Orion', [[5.92, 7.4], [5.42, -0.3], [5.24, -8.2], [5.6, -1.9], [5.53, -1.2], [5.68, -1.9], [5.79, -9.7], [5.25, 6.3], [5.59, -1.2]], [[7,4],[4,8],[8,5],[5,6],[7,0],[0,6],[4,3],[5,2]]],
  ['Ursa Major', [[11.06, 61.8], [11.03, 56.4], [11.9, 53.7], [12.26, 57.0], [12.9, 55.9], [13.4, 54.9], [13.79, 49.3]], [[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,3]]],
  ['Cassiopeia', [[0.15, 59.2], [0.68, 56.5], [0.95, 60.7], [1.43, 60.2], [1.91, 63.7]], [[0,1],[1,2],[2,3],[3,4]]],
  ['Cygnus', [[20.69, 45.3], [19.51, 28.0], [20.37, 40.3], [19.75, 45.1], [20.77, 33.9], [21.22, 30.2]], [[3,2],[2,0],[1,2],[2,4],[4,5]]],
  ['Lyra', [[18.62, 38.8], [18.98, 32.7], [18.75, 33.4], [18.83, 36.9], [18.97, 36.1]], [[0,3],[3,4],[4,1],[1,2],[2,3]]],
  ['Draco', [[17.94, 51.5], [17.15, 65.7], [16.4, 61.5], [15.42, 59.0], [14.07, 64.4], [12.56, 69.8], [11.52, 69.3]], [[0,1],[1,2],[2,3],[3,4],[4,5],[5,6]]],
  ['Perseus', [[3.08, 53.5], [3.41, 49.9], [3.1, 40.9], [3.96, 40.0], [3.75, 42.6], [3.08, 44.9]], [[0,1],[1,5],[5,2],[1,4],[4,3]]],
  ['Andromeda', [[0.14, 29.1], [1.16, 35.6], [2.07, 42.3], [0.66, 30.9], [0.83, 41.1]], [[0,3],[3,1],[1,4],[1,2]]],
  ['Corona Borealis', [[15.58, 26.7], [15.46, 29.1], [15.71, 31.4], [15.96, 30.3], [16.02, 29.9], [16.14, 33.9]], [[0,1],[1,2],[2,3],[3,4],[4,5]]],
  ['Aquila', [[19.85, 8.9], [19.77, 10.6], [19.09, 13.9], [20.19, -0.8]], [[2,1],[1,0],[0,3]]],
  ['Crux', [[12.44, -63.1], [12.25, -58.7], [12.52, -57.1], [12.35, -59.7]], [[0,1],[2,3]]],
];

// Convert RA/Dec to 3D position on unit sphere
function raDec2Vec(ra: number, dec: number, radius: number): THREE.Vector3 {
  const phi = (ra / 24) * Math.PI * 2;     // RA to radians (0-2PI)
  const theta = (90 - dec) * Math.PI / 180; // Dec to polar angle
  return new THREE.Vector3(
    radius * Math.sin(theta) * Math.cos(phi),
    radius * Math.cos(theta),
    radius * Math.sin(theta) * Math.sin(phi),
  );
}

const TRAIL_COUNT = 12;   // number of rainbow ghost copies
const GLOBE_RADIUS = 3.2;

export class CelestialGlobe {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private globe: THREE.Group;
  private trails: THREE.Group[] = [];
  private canvas: HTMLCanvasElement;
  private animId = 0;
  private startTime = 0;
  private disposed = false;

  constructor() {
    // Create canvas
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'celestial-globe';
    this.canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:0;pointer-events:none;';

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);

    // Scene
    this.scene = new THREE.Scene();

    // Camera
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    this.camera.position.set(0, 0.5, 6);
    this.camera.lookAt(0, 0, 0);

    // Build globe
    this.globe = new THREE.Group();
    this.scene.add(this.globe);

    this.buildWireframe();
    this.buildConstellations();
    this.buildTrails();
    this.buildStarField();

    this.startTime = performance.now();
  }

  private buildWireframe(): void {
    // Subtle latitude/longitude grid
    const gridMat = new THREE.LineBasicMaterial({ color: 0x222244, transparent: true, opacity: 0.15 });

    // Latitude circles
    for (let lat = -60; lat <= 60; lat += 30) {
      const pts: THREE.Vector3[] = [];
      const theta = (90 - lat) * Math.PI / 180;
      for (let i = 0; i <= 64; i++) {
        const phi = (i / 64) * Math.PI * 2;
        pts.push(new THREE.Vector3(
          GLOBE_RADIUS * Math.sin(theta) * Math.cos(phi),
          GLOBE_RADIUS * Math.cos(theta),
          GLOBE_RADIUS * Math.sin(theta) * Math.sin(phi),
        ));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      this.globe.add(new THREE.Line(geo, gridMat));
    }

    // Longitude circles
    for (let lon = 0; lon < 360; lon += 30) {
      const pts: THREE.Vector3[] = [];
      const phi = (lon / 360) * Math.PI * 2;
      for (let i = 0; i <= 64; i++) {
        const theta = (i / 64) * Math.PI;
        pts.push(new THREE.Vector3(
          GLOBE_RADIUS * Math.sin(theta) * Math.cos(phi),
          GLOBE_RADIUS * Math.cos(theta),
          GLOBE_RADIUS * Math.sin(theta) * Math.sin(phi),
        ));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      this.globe.add(new THREE.Line(geo, gridMat));
    }

    // Ecliptic ring (tilted 23.4 degrees)
    const eclipticPts: THREE.Vector3[] = [];
    for (let i = 0; i <= 128; i++) {
      const a = (i / 128) * Math.PI * 2;
      eclipticPts.push(new THREE.Vector3(
        GLOBE_RADIUS * 1.01 * Math.cos(a),
        0,
        GLOBE_RADIUS * 1.01 * Math.sin(a),
      ));
    }
    const eclGeo = new THREE.BufferGeometry().setFromPoints(eclipticPts);
    const eclLine = new THREE.Line(eclGeo, new THREE.LineBasicMaterial({ color: 0x443366, transparent: true, opacity: 0.3 }));
    eclLine.rotation.x = 23.4 * Math.PI / 180;
    this.globe.add(eclLine);
  }

  private buildConstellations(): void {
    // Main constellation lines (white)
    const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 });
    const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.06, transparent: true, opacity: 0.9 });

    for (const [, stars, edges] of CONSTELLATIONS) {
      const positions = stars.map(([ra, dec]) => raDec2Vec(ra, dec, GLOBE_RADIUS));

      // Star dots
      const starGeo = new THREE.BufferGeometry().setFromPoints(positions);
      this.globe.add(new THREE.Points(starGeo, starMat));

      // Lines
      for (const [a, b] of edges) {
        const lineGeo = new THREE.BufferGeometry().setFromPoints([positions[a], positions[b]]);
        this.globe.add(new THREE.Line(lineGeo, lineMat));
      }
    }
  }

  private buildTrails(): void {
    // Rainbow ghost copies that trail behind rotation
    const rainbow = [
      0xff0000, 0xff4400, 0xff8800, 0xffcc00, 0xffff00, 0x88ff00,
      0x00ff44, 0x00ffcc, 0x0088ff, 0x4400ff, 0x8800ff, 0xff00ff,
    ];

    for (let t = 0; t < TRAIL_COUNT; t++) {
      const trailGroup = new THREE.Group();
      const opacity = 0.25 * (1 - t / TRAIL_COUNT);
      const color = rainbow[t % rainbow.length];
      const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity });

      for (const [, stars, edges] of CONSTELLATIONS) {
        const positions = stars.map(([ra, dec]) => raDec2Vec(ra, dec, GLOBE_RADIUS));
        for (const [a, b] of edges) {
          const geo = new THREE.BufferGeometry().setFromPoints([positions[a], positions[b]]);
          trailGroup.add(new THREE.Line(geo, mat));
        }
      }

      this.scene.add(trailGroup);
      this.trails.push(trailGroup);
    }
  }

  private buildStarField(): void {
    // Background scattered stars (not on the globe, further out)
    const count = 400;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI;
      const phi = Math.random() * Math.PI * 2;
      const r = 8 + Math.random() * 12;
      positions[i * 3] = r * Math.sin(theta) * Math.cos(phi);
      positions[i * 3 + 1] = r * Math.cos(theta);
      positions[i * 3 + 2] = r * Math.sin(theta) * Math.sin(phi);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color: 0xaabbff, size: 0.04, transparent: true, opacity: 0.5 });
    this.scene.add(new THREE.Points(geo, mat));
  }

  mount(container: HTMLElement): void {
    container.appendChild(this.canvas);
    this.resize();
    window.addEventListener('resize', this.onResize);
    this.animate();
  }

  private onResize = (): void => { this.resize(); };

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private animate = (): void => {
    if (this.disposed) return;
    this.animId = requestAnimationFrame(this.animate);

    const elapsed = (performance.now() - this.startTime) / 1000;

    // Dissociative time warp: rotation speed oscillates in a complex pattern
    // Multiple sine waves at irrational-ratio frequencies create aperiodic feel
    const baseSpeed = 0.08;
    const warp = 1.0
      + 0.3 * Math.sin(elapsed * 0.137)
      + 0.2 * Math.sin(elapsed * 0.089)
      + 0.15 * Math.sin(elapsed * 0.233)
      + 0.1 * Math.sin(elapsed * 0.031);
    const rotationAngle = elapsed * baseSpeed * warp;

    // Polar rotation (around Y axis)
    this.globe.rotation.y = rotationAngle;
    // Gentle axial tilt wobble
    this.globe.rotation.x = 0.15 + 0.08 * Math.sin(elapsed * 0.07);
    this.globe.rotation.z = 0.05 * Math.sin(elapsed * 0.053);

    // Scale pulse — compound breathing with irregularity
    const pulse = 1.0
      + 0.06 * Math.sin(elapsed * 0.4)
      + 0.03 * Math.sin(elapsed * 0.67)
      + 0.02 * Math.sin(elapsed * 1.13);
    this.globe.scale.setScalar(pulse);

    // Rainbow trails: each trail is a time-delayed copy of the globe rotation
    for (let t = 0; t < TRAIL_COUNT; t++) {
      const delay = (t + 1) * 0.12; // seconds of delay per trail
      const trailTime = Math.max(0, elapsed - delay);
      const trailWarp = 1.0
        + 0.3 * Math.sin(trailTime * 0.137)
        + 0.2 * Math.sin(trailTime * 0.089)
        + 0.15 * Math.sin(trailTime * 0.233)
        + 0.1 * Math.sin(trailTime * 0.031);
      const trailAngle = trailTime * baseSpeed * trailWarp;

      this.trails[t].rotation.y = trailAngle;
      this.trails[t].rotation.x = 0.15 + 0.08 * Math.sin(trailTime * 0.07);
      this.trails[t].rotation.z = 0.05 * Math.sin(trailTime * 0.053);

      const trailPulse = 1.0
        + 0.06 * Math.sin(trailTime * 0.4)
        + 0.03 * Math.sin(trailTime * 0.67)
        + 0.02 * Math.sin(trailTime * 1.13);
      this.trails[t].scale.setScalar(trailPulse);

      // Shift trail hues over time for extra dissociation
      const hueShift = (elapsed * 0.05 + t * 0.08) % 1;
      const hueColor = new THREE.Color().setHSL(hueShift, 0.9, 0.55);
      for (const child of this.trails[t].children) {
        if ((child as THREE.Line).material) {
          const mat = (child as THREE.Line).material as THREE.LineBasicMaterial;
          mat.color.copy(hueColor);
        }
      }
    }

    // Camera subtle drift for dissociative feel
    this.camera.position.x = 0.3 * Math.sin(elapsed * 0.041);
    this.camera.position.y = 0.5 + 0.2 * Math.sin(elapsed * 0.059);
    this.camera.lookAt(0, 0, 0);

    // FOV oscillation (subtle)
    this.camera.fov = 50 + 3 * Math.sin(elapsed * 0.073) + 2 * Math.sin(elapsed * 0.129);
    this.camera.updateProjectionMatrix();

    this.renderer.render(this.scene, this.camera);
  };

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.animId);
    window.removeEventListener('resize', this.onResize);
    this.renderer.dispose();
    this.scene.traverse(obj => {
      if ((obj as any).geometry) (obj as any).geometry.dispose();
      if ((obj as any).material) {
        const mat = (obj as any).material;
        if (Array.isArray(mat)) mat.forEach((m: any) => m.dispose());
        else mat.dispose();
      }
    });
    this.canvas.remove();
  }
}
