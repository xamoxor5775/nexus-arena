import * as THREE from "three";

type Particle = {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  size: number;
  grow: number;
  drag: number;
  grav: number;
  r: number;
  g: number;
  b: number;
};

const lo =
  typeof window !== "undefined" &&
  (window.innerWidth < 720 || (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false));

const MAX = lo ? 96 : 180;

function glowMap(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 32;
  c.height = 32;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.2, "rgba(255,230,200,0.85)");
  g.addColorStop(0.5, "rgba(255,110,40,0.28)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

export class ParticleField {
  mesh: THREE.Group;
  private pool: Particle[] = [];
  private alive: number[] = [];
  private free: number[] = [];
  private pos: Float32Array;
  private col: Float32Array;
  private siz: Float32Array;
  private posAttr: THREE.BufferAttribute;
  private colAttr: THREE.BufferAttribute;
  private sizAttr: THREE.BufferAttribute;
  private points: THREE.Points;
  private tex: THREE.CanvasTexture;
  private uScale: THREE.IUniform<number>;
  private mul = lo ? 0.5 : 1;
  private ash = 0;
  private hex = new THREE.Color();

  constructor() {
    for (let i = 0; i < MAX; i++) {
      this.pool.push({
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        max: 1,
        size: 0.1,
        grow: 0,
        drag: 0.4,
        grav: 10,
        r: 1,
        g: 1,
        b: 1,
      });
      this.free.push(i);
    }
    this.pos = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 3);
    this.siz = new Float32Array(MAX);
    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.colAttr = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    this.sizAttr = new THREE.BufferAttribute(this.siz, 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("position", this.posAttr);
    geo.setAttribute("color", this.colAttr);
    geo.setAttribute("aSize", this.sizAttr);
    geo.setDrawRange(0, 0);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 4, 0), 80);
    this.tex = glowMap();
    this.uScale = { value: 560 };
    const mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: this.tex }, uScale: this.uScale },
      vertexShader: `
        attribute float aSize;
        attribute vec3 color;
        varying vec3 vColor;
        uniform float uScale;
        void main() {
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = clamp(aSize * uScale / max(1.0, -mv.z), 2.0, 160.0);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        uniform sampler2D uMap;
        varying vec3 vColor;
        void main() {
          vec4 t = texture2D(uMap, gl_PointCoord);
          if (t.a < 0.04) discard;
          gl_FragColor = vec4(vColor * t.rgb, 1.0) * t.a;
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 8;
    this.mesh = new THREE.Group();
    this.mesh.add(this.points);
  }

  private busy() {
    return this.free.length < 6;
  }

  private emit(
    x: number,
    y: number,
    z: number,
    color: number,
    opts: {
      vx?: number;
      vy?: number;
      vz?: number;
      speed?: number;
      cone?: number;
      life?: number;
      size?: number;
      grow?: number;
      drag?: number;
      grav?: number;
      up?: number;
    } = {},
  ) {
    const i = this.free.pop();
    if (i === undefined) return;
    this.alive.push(i);
    const p = this.pool[i]!;
    p.x = x;
    p.y = y;
    p.z = z;
    if (opts.vx !== undefined) {
      p.vx = opts.vx;
      p.vy = opts.vy ?? 0;
      p.vz = opts.vz ?? 0;
    } else {
      const th = Math.random() * Math.PI * 2;
      const ph = Math.random() * (opts.cone ?? Math.PI);
      const sp = (opts.speed ?? 3) * (0.35 + Math.random());
      p.vx = Math.cos(th) * Math.sin(ph) * sp;
      p.vy = Math.cos(ph) * sp + (opts.up ?? 0.5);
      p.vz = Math.sin(th) * Math.sin(ph) * sp;
    }
    p.life = (opts.life ?? 0.4) * (0.65 + Math.random() * 0.5);
    p.max = p.life;
    p.size = (opts.size ?? 0.12) * (0.65 + Math.random() * 0.55);
    p.grow = opts.grow ?? 0;
    p.drag = opts.drag ?? 0.6;
    p.grav = opts.grav ?? 11;
    this.hex.setHex(color);
    p.r = this.hex.r;
    p.g = this.hex.g;
    p.b = this.hex.b;
  }

  private n(count: number) {
    return Math.max(1, Math.round(count * this.mul));
  }

  burst(
    x: number,
    y: number,
    z: number,
    n: number,
    color: number,
    speed: number,
    life = 0.45,
    size = 0.07,
    up = 0.4,
  ) {
    const c = this.n(n);
    for (let i = 0; i < c; i++) this.emit(x, y, z, color, { speed, life, size: size * 2.2, up, grav: 9 });
  }

  impact(x: number, y: number, z: number, color: number, heavy = false) {
    this.emit(x, y, z, color, { speed: 0.15, life: 0.1, size: heavy ? 0.62 : 0.34, grow: -1.8, grav: 0, up: 0 });
    const n = this.n(heavy ? 8 : 5);
    for (let i = 0; i < n; i++) {
      this.emit(x, y, z, color, { speed: heavy ? 6.5 : 4.6, life: 0.2, size: 0.14, up: 0.7, grav: 14, cone: 1.6 });
    }
  }

  explode(x: number, y: number, z: number, color: number) {
    this.emit(x, y, z, 0xfff2c8, { speed: 0.04, life: 0.14, size: 1.2, grow: -4, grav: 0, up: 0 });
    this.emit(x, y, z, color, { speed: 0.06, life: 0.24, size: 0.8, grow: -1.5, grav: 0, up: 0.15 });
    const n = this.n(14);
    for (let i = 0; i < n; i++) this.emit(x, y, z, color, { speed: 8, life: 0.38, size: 0.2, up: 2, grav: 14 });
    for (let i = 0; i < this.n(6); i++) {
      this.emit(x, y + 0.1, z, 0xff6a32, { speed: 1, life: 0.55, size: 0.3, grow: 0.9, up: 1.6, grav: -1, drag: 2 });
    }
  }

  death(x: number, y: number, z: number, color: number) {
    this.emit(x, y, z, color, { speed: 0.08, life: 0.16, size: 0.9, grow: -2.2, grav: 0, up: 0 });
    for (let i = 0; i < this.n(14); i++) {
      this.emit(x, y, z, color, { speed: 6.8, life: 0.42, size: 0.18, up: 2.2, grav: 12 });
    }
  }

  dust(x: number, y: number, z: number, impact = 0.4) {
    const n = this.n(3 + Math.floor(impact * 7));
    for (let i = 0; i < n; i++) {
      this.emit(x, y, z, 0xc8b8a4, {
        speed: 1.4 + impact * 1.8,
        life: 0.28 + impact * 0.12,
        size: 0.11 + impact * 0.06,
        grow: 0.7,
        up: 0.12,
        grav: 5,
        drag: 2.2,
        cone: 1.2,
      });
    }
  }

  jump(x: number, y: number, z: number) {
    this.dust(x, y, z, 0.22);
  }

  boost(x: number, y: number, z: number) {
    this.emit(x, y, z, 0xffc44d, { speed: 0.15, life: 0.12, size: 0.4, grow: -1.8, grav: 0, up: 0 });
    for (let i = 0; i < this.n(4); i++) {
      this.emit(x, y, z, 0xffc44d, { speed: 3.8, life: 0.18, size: 0.14, up: 2, grav: 8 });
    }
  }

  pad(x: number, y: number, z: number) {
    this.emit(x, y, z, 0x7ff5e4, { speed: 0.08, life: 0.16, size: 0.6, grow: -1.2, grav: 0, up: 0 });
    for (let i = 0; i < this.n(8); i++) {
      this.emit(x, y, z, 0x7ff5e4, { speed: 2, life: 0.34, size: 0.13, up: 5.5, grav: 4, drag: 0.8, cone: 0.45 });
    }
  }

  blink(x: number, y: number, z: number, color: number) {
    this.emit(x, y, z, color, { speed: 0.04, life: 0.14, size: 0.72, grow: -2, grav: 0, up: 0 });
    for (let i = 0; i < this.n(5); i++) {
      this.emit(x, y, z, color, { speed: 5, life: 0.22, size: 0.14, up: 0.3, grav: 2, cone: 2.4 });
    }
  }

  volt(x: number, y: number, z: number, color: number) {
    this.emit(x, y, z, color, { speed: 0.08, life: 0.12, size: 0.48, grow: -2.2, grav: 0, up: 0 });
    for (let i = 0; i < this.n(5); i++) {
      this.emit(x, y, z, color, { speed: 6, life: 0.16, size: 0.16, up: 0.15, grav: 4, cone: 2.8 });
    }
  }

  pickup(x: number, y: number, z: number, color: number) {
    this.emit(x, y, z, color, { speed: 0.06, life: 0.18, size: 0.48, grow: -1.1, grav: 0, up: 0 });
    for (let i = 0; i < this.n(5); i++) {
      this.emit(x, y, z, color, { speed: 2.4, life: 0.32, size: 0.11, up: 2.4, grav: 4, drag: 1.2 });
    }
  }

  trail(x: number, y: number, z: number, color: number) {
    if (this.alive.length > MAX * 0.55) return;
    this.emit(x, y, z, color, { speed: 0.3, life: 0.12, size: 0.14, grow: 0.3, grav: 0, up: 0, drag: 2 });
  }

  rush(x: number, y: number, z: number, color: number) {
    if (this.busy()) return;
    this.emit(x, y, z, color, { speed: 1.4, life: 0.14, size: 0.16, up: 0.04, grav: 0, drag: 1.8, cone: 0.55 });
  }

  muzzle(x: number, y: number, z: number, dx: number, dy: number, dz: number, color: number) {
    this.emit(x, y, z, 0xfff4d0, { speed: 0.04, life: 0.06, size: 0.28, grow: -3, grav: 0, up: 0 });
    const n = this.n(3);
    for (let i = 0; i < n; i++) {
      const j = 0.16;
      this.emit(x, y, z, color, {
        vx: dx * (8 + Math.random() * 5) + (Math.random() - 0.5) * j * 8,
        vy: dy * (8 + Math.random() * 5) + (Math.random() - 0.5) * j * 8,
        vz: dz * (8 + Math.random() * 5) + (Math.random() - 0.5) * j * 8,
        life: 0.1,
        size: 0.13,
        grav: 4,
        drag: 2,
      });
    }
  }

  update(_dt: number, _camera?: THREE.Camera) {
    const dt = _dt;
    this.uScale.value = 540 * Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, 1.5);
    this.ash += dt;
    if (this.ash > 0.2 && this.alive.length < 28) {
      this.ash = 0;
      const a = Math.random() * Math.PI * 2;
      const r = 8 + Math.random() * 34;
      this.emit(Math.cos(a) * r, 0.5 + Math.random() * 1.6, Math.sin(a) * r, 0xff6a32, {
        speed: 0.2,
        life: 1.5,
        size: 0.09 + Math.random() * 0.08,
        grow: 0.12,
        up: 0.65,
        grav: -0.5,
        drag: 0.9,
        cone: 0.35,
      });
    }
    const dampDt = dt;
    let w = 0;
    const alive = this.alive;
    const pool = this.pool;
    const pos = this.pos;
    const col = this.col;
    const siz = this.siz;
    const free = this.free;
    for (let r = 0; r < alive.length; r++) {
      const i = alive[r]!;
      const p = pool[i]!;
      p.life -= dampDt;
      if (p.life <= 0) {
        free.push(i);
        continue;
      }
      const drag = 1 - Math.min(0.95, p.drag * dampDt);
      p.vx *= drag;
      p.vz *= drag;
      p.vy -= p.grav * dampDt;
      p.x += p.vx * dampDt;
      p.y += p.vy * dampDt;
      p.z += p.vz * dampDt;
      const t = p.life / p.max;
      const fade = t * t;
      const o = w * 3;
      pos[o] = p.x;
      pos[o + 1] = p.y;
      pos[o + 2] = p.z;
      col[o] = p.r * (0.3 + 0.7 * fade);
      col[o + 1] = p.g * (0.22 + 0.62 * fade);
      col[o + 2] = p.b * (0.12 + 0.5 * fade);
      siz[w] = Math.max(0.02, p.size + p.grow * (1 - t) * p.size);
      alive[w++] = i;
    }
    alive.length = w;
    this.points.geometry.setDrawRange(0, w);
    this.posAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;
    this.sizAttr.needsUpdate = true;
    this.posAttr.addUpdateRange(0, w * 3);
    this.colAttr.addUpdateRange(0, w * 3);
    this.sizAttr.addUpdateRange(0, w);
  }

  dispose() {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
    this.tex.dispose();
  }
}

export class TraumaShake {
  trauma = 0;
  add(v: number) {
    this.trauma = Math.min(1, this.trauma + v);
  }
  sample(dt: number, scale: number): { x: number; y: number; z: number } {
    this.trauma = Math.max(0, this.trauma - dt * 1.8);
    const s = this.trauma * this.trauma * scale;
    if (s <= 0.0001) return { x: 0, y: 0, z: 0 };
    return {
      x: (Math.random() * 2 - 1) * 0.18 * s,
      y: (Math.random() * 2 - 1) * 0.12 * s,
      z: (Math.random() * 2 - 1) * 0.08 * s,
    };
  }
}
