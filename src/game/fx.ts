import * as THREE from "three";
import { isLoDevice, isStruggling } from "./textures";

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
  bounce: number;
  r: number;
  g: number;
  b: number;
  pixel: boolean;
  arc: boolean;
};

const lo = isLoDevice();
const MAX = lo ? 80 : 160;

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
  private pix: Float32Array;
  private posAttr: THREE.BufferAttribute;
  private colAttr: THREE.BufferAttribute;
  private sizAttr: THREE.BufferAttribute;
  private pixAttr: THREE.BufferAttribute;
  private points: THREE.Points;
  private tex: THREE.CanvasTexture;
  private uScale: THREE.IUniform<number>;
  private mul = lo ? 0.42 : 0.85;
  private ash = 0;
  private hex = new THREE.Color();
  private chunks: Array<{ mesh: THREE.Mesh; vx: number; vy: number; vz: number; life: number }> = [];
  private fleshGeo = new THREE.BoxGeometry(0.07, 0.05, 0.06);
  private glassGeo = new THREE.BoxGeometry(0.09, 0.012, 0.07);
  private fleshMats = [0xe7c2a8, 0xc47a62, 0x8d3a32, 0x5c221c].map(
    (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0.02 }),
  );
  private glassMat = new THREE.MeshStandardMaterial({
    color: 0xd8fff6,
    emissive: 0x7ff5e4,
    emissiveIntensity: 0.6,
    transparent: true,
    opacity: 0.55,
    roughness: 0.08,
  });

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
        bounce: 0,
        r: 1,
        g: 1,
        b: 1,
        pixel: false,
        arc: false,
      });
      this.free.push(i);
    }
    this.pos = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 3);
    this.siz = new Float32Array(MAX);
    this.pix = new Float32Array(MAX);
    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.colAttr = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    this.sizAttr = new THREE.BufferAttribute(this.siz, 1).setUsage(THREE.DynamicDrawUsage);
    this.pixAttr = new THREE.BufferAttribute(this.pix, 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("position", this.posAttr);
    geo.setAttribute("color", this.colAttr);
    geo.setAttribute("aSize", this.sizAttr);
    geo.setAttribute("aPixel", this.pixAttr);
    geo.setDrawRange(0, 0);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 4, 0), 80);
    this.tex = glowMap();
    this.uScale = { value: 560 };
    const mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: this.tex }, uScale: this.uScale },
      vertexShader: `
        attribute float aSize;
        attribute float aPixel;
        attribute vec3 color;
        varying vec3 vColor;
        varying float vPixel;
        uniform float uScale;
        void main() {
          vColor = color;
          vPixel = aPixel;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = clamp(aSize * uScale / max(1.0, -mv.z), 2.0, 160.0);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        uniform sampler2D uMap;
        varying vec3 vColor;
        varying float vPixel;
        void main() {
          if (vPixel > 1.5) {
            vec2 q = gl_PointCoord - 0.5;
            float d = length(q);
            float core = smoothstep(0.2, 0.0, d);
            float ring = smoothstep(0.5, 0.34, d) * smoothstep(0.16, 0.28, d);
            float a = core + ring * 0.9;
            if (a < 0.04) discard;
            gl_FragColor = vec4(vColor, 1.0) * a;
            return;
          }
          if (vPixel > 0.5) {
            vec2 p = gl_PointCoord;
            float square = step(0.1, p.x) * step(0.1, p.y) * step(p.x, 0.9) * step(p.y, 0.9);
            if (square < 0.5) discard;
            gl_FragColor = vec4(vColor, 0.92);
            return;
          }
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
      bounce?: number;
      up?: number;
      pixel?: boolean;
      arc?: boolean;
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
    p.bounce = opts.bounce ?? 0;
    p.pixel = opts.pixel ?? false;
    p.arc = opts.arc ?? false;
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

  shotImpact(
    x: number,
    y: number,
    z: number,
    color: number,
    dx: number,
    dy: number,
    dz: number,
    heavy = false,
    primary = true,
  ) {
    this.emit(x, y, z, 0xfff7df, {
      speed: 0.02,
      life: primary ? 0.11 : 0.07,
      size: heavy ? 0.54 : 0.32,
      grow: -2.2,
      grav: 0,
      up: 0,
      pixel: true,
    });
    const count = this.n(primary ? (heavy ? 8 : 5) : 2);
    for (let i = 0; i < count; i++) {
      const spread = primary ? 3.4 : 1.7;
      const speed = (heavy ? 7.6 : 5.2) * (0.65 + Math.random() * 0.55);
      this.emit(x, y, z, i % 3 === 0 ? 0xffe3a3 : color, {
        vx: -dx * speed + (Math.random() - 0.5) * spread,
        vy: -dy * speed + (Math.random() - 0.2) * spread,
        vz: -dz * speed + (Math.random() - 0.5) * spread,
        life: primary ? 0.24 : 0.15,
        size: heavy ? 0.16 : 0.11,
        grav: 11,
        drag: 1.25,
        bounce: primary ? 0.16 : 0,
        pixel: true,
      });
    }
  }

  explode(x: number, y: number, z: number, color: number) {
    this.emit(x, y, z, 0xfff6de, { speed: 0.02, life: 0.1, size: 1.7, grow: -5.5, grav: 0, up: 0 });
    this.emit(x, y, z, 0xffe08a, { speed: 0.04, life: 0.16, size: 1.15, grow: -3.2, grav: 0, up: 0 });
    this.emit(x, y, z, color, { speed: 0.05, life: 0.26, size: 0.86, grow: -1.2, grav: 0, up: 0.12 });
    const sparks = this.n(16);
    for (let i = 0; i < sparks; i++) {
      this.emit(x, y, z, i % 2 ? 0xfff1b0 : color, {
        speed: 9 + Math.random() * 5,
        life: 0.28 + Math.random() * 0.22,
        size: 0.12 + Math.random() * 0.08,
        up: 1.6,
        grav: 16,
        drag: 0.7,
        bounce: 0.28,
      });
    }
    for (let i = 0; i < this.n(7); i++) {
      this.emit(x, y + 0.05, z, 0x5a3a28, {
        speed: 4.2,
        life: 0.7,
        size: 0.1,
        up: 1.1,
        grav: 22,
        drag: 0.9,
        bounce: 0.42,
      });
    }
    for (let i = 0; i < this.n(8); i++) {
      this.emit(x, y + 0.08, z, 0xff6a28, {
        speed: 1.4,
        life: 0.62,
        size: 0.28,
        grow: 1.1,
        up: 2.1,
        grav: -1.4,
        drag: 2.4,
        cone: 0.9,
      });
    }
    for (let i = 0; i < this.n(7); i++) {
      this.emit(x, y + 0.16, z, 0x4a3228, {
        speed: 0.7,
        life: 0.95,
        size: 0.34,
        grow: 2.4,
        up: 1.3,
        grav: -0.45,
        drag: 2.8,
        cone: 0.7,
      });
    }
    const ring = this.n(10);
    for (let i = 0; i < ring; i++) {
      const a = (i / ring) * Math.PI * 2;
      this.emit(x, y + 0.04, z, 0xffc48a, {
        vx: Math.cos(a) * 8.5,
        vy: 0.35,
        vz: Math.sin(a) * 8.5,
        life: 0.2,
        size: 0.2,
        grav: 3,
        drag: 1.6,
      });
    }
  }

  private spawnChunk(x: number, y: number, z: number, glass: boolean) {
    let slot = this.chunks.find((c) => c.life <= 0);
    if (!slot && this.chunks.length < 40) {
      const mesh = new THREE.Mesh(glass ? this.glassGeo : this.fleshGeo, glass ? this.glassMat : this.fleshMats[0]!);
      mesh.visible = false;
      mesh.castShadow = true;
      this.mesh.add(mesh);
      slot = { mesh, vx: 0, vy: 0, vz: 0, life: 0 };
      this.chunks.push(slot);
    }
    if (!slot) return;
    slot.life = glass ? 0.7 : 1.15;
    slot.mesh.visible = true;
    slot.mesh.material = glass ? this.glassMat : this.fleshMats[Math.floor(Math.random() * this.fleshMats.length)]!;
    slot.mesh.position.set(x, y, z);
    const s = glass ? 0.7 + Math.random() * 0.8 : 0.7 + Math.random() * 1.6;
    slot.mesh.scale.set(s, s * (0.6 + Math.random()), s);
    slot.mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    const a = Math.random() * Math.PI * 2;
    const sp = glass ? 3.5 + Math.random() * 3 : 2.2 + Math.random() * 4.5;
    slot.vx = Math.cos(a) * sp;
    slot.vz = Math.sin(a) * sp;
    slot.vy = 2.2 + Math.random() * 3.4;
  }

  flesh(x: number, y: number, z: number, heavy = false) {
    const colors = [0xe7c2a8, 0xc47a62, 0x8d3a32, 0x5c221c];
    const count = this.n(heavy ? 26 : 8);
    for (let i = 0; i < count; i++) {
      this.emit(x, y, z, colors[i % colors.length]!, {
        speed: (heavy ? 7.5 : 4.2) * (0.45 + Math.random() * 0.8),
        life: heavy ? 0.72 : 0.38,
        size: heavy ? 0.12 + Math.random() * 0.14 : 0.08 + Math.random() * 0.06,
        up: 1.8,
        grav: 18,
        drag: 0.55,
        bounce: 0.32,
        pixel: true,
      });
    }
    for (let i = 0; i < (heavy ? 8 : 3); i++) this.spawnChunk(x, y, z, false);
    if (!heavy) return;
    for (let i = 0; i < this.n(8); i++) {
      this.emit(x, y + 0.15, z, 0xd8fff6, {
        speed: 5 + Math.random() * 3,
        life: 0.34,
        size: 0.07,
        up: 2.4,
        grav: 9,
        drag: 0.7,
        pixel: true,
      });
      this.spawnChunk(x, y, z, true);
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

  burnSmoke(x: number, y: number, z: number) {
    for (let i = 0; i < this.n(9); i++) {
      this.emit(x, y + 0.15, z, 0x6a5c52, {
        speed: 0.7,
        life: 0.9,
        size: 0.58,
        grow: 1.6,
        grav: -2.4,
        up: 2.6,
        drag: 1.5,
        cone: 0.95,
      });
    }
    for (let i = 0; i < this.n(5); i++) {
      this.emit(x, y + 0.08, z, 0xff6a28, { speed: 1.3, life: 0.28, size: 0.2, up: 1.8, grav: 2, cone: 1.05 });
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

  pixelTrail(x: number, y: number, z: number) {
    if (this.alive.length > MAX * 0.7) return;
    this.emit(x, y, z, 0x7af0ff, { speed: 0.2, life: 0.18, size: 0.1, grow: 0.2, grav: 0, up: 0, drag: 2, pixel: true });
    this.emit(x, y, z, 0xfff2c8, { speed: 0.1, life: 0.1, size: 0.06, grav: 0, up: 0, pixel: true });
  }

  rocketTrail(x: number, y: number, z: number, vx: number, vy: number, vz: number) {
    if (this.alive.length > MAX * 0.82) return;
    const len = Math.hypot(vx, vy, vz) || 1;
    const bx = -vx / len;
    const by = -vy / len;
    const bz = -vz / len;
    this.emit(x, y, z, 0xfff6d2, { speed: 0.02, life: 0.07, size: 0.46, grow: -3.4, grav: 0, up: 0 });
    this.emit(x + bx * 0.35, y + by * 0.35, z + bz * 0.35, 0xff6a22, {
      vx: bx * 3.2,
      vy: by * 3.2 + 0.4,
      vz: bz * 3.2,
      life: 0.22,
      size: 0.28,
      grow: 0.9,
      grav: -0.4,
      drag: 1.4,
    });
    this.emit(x + bx * 0.7, y + by * 0.7, z + bz * 0.7, 0x6a5348, {
      vx: bx * 1.4 + (Math.random() - 0.5) * 0.8,
      vy: by * 1.4 + 0.8,
      vz: bz * 1.4 + (Math.random() - 0.5) * 0.8,
      life: 0.48,
      size: 0.22,
      grow: 1.6,
      grav: -0.15,
      drag: 1.8,
    });
  }

  ionMuzzle(x: number, y: number, z: number, dx: number, dy: number, dz: number) {
    this.emit(x, y, z, 0xf4fbff, { speed: 0.02, life: 0.05, size: 0.28, grow: -3, grav: 0, up: 0, arc: true });
    this.emit(x + dx * 0.2, y + dy * 0.2, z + dz * 0.2, 0x7eb6ff, {
      vx: dx * 6,
      vy: dy * 6,
      vz: dz * 6,
      life: 0.07,
      size: 0.12,
      grav: 0,
      drag: 2,
      arc: true,
    });
  }

  ionTrail(x: number, y: number, z: number, vx: number, vy: number, vz: number) {
    if (this.alive.length > MAX * 0.72) return;
    const len = Math.hypot(vx, vy, vz) || 1;
    const bx = -vx / len;
    const by = -vy / len;
    const bz = -vz / len;
    this.emit(x, y, z, 0xf7fbff, { speed: 0.01, life: 0.05, size: 0.2, grow: -2.4, grav: 0, up: 0, arc: true });
    this.emit(x + bx * 0.32, y + by * 0.32, z + bz * 0.32, 0x5aa8ff, {
      vx: bx * 1.4,
      vy: by * 1.4,
      vz: bz * 1.4,
      life: 0.12,
      size: 0.1,
      grav: 0,
      drag: 3,
      arc: true,
    });
    this.emit(x + bx * 0.62, y + by * 0.62, z + bz * 0.62, 0xc9a6ff, {
      vx: bx * 0.5,
      vy: by * 0.5,
      vz: bz * 0.5,
      life: 0.16,
      size: 0.07,
      grav: 0,
      drag: 2.2,
      arc: true,
    });
  }

  ionPop(x: number, y: number, z: number) {
    this.emit(x, y, z, 0xf4fbff, { speed: 0.02, life: 0.07, size: 0.42, grow: -3.6, grav: 0, up: 0, arc: true });
    this.emit(x, y, z, 0x7eb6ff, { speed: 0.04, life: 0.14, size: 0.28, grow: -1.4, grav: 0, up: 0, arc: true });
    const n = this.n(8);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      this.emit(x, y, z, i % 2 ? 0xc9a6ff : 0x5aa8ff, {
        vx: Math.cos(a) * 6.5,
        vy: 0.15,
        vz: Math.sin(a) * 6.5,
        life: 0.14,
        size: 0.07,
        grav: 0,
        drag: 2.4,
        arc: true,
      });
    }
  }

  bulletTrail(x: number, y: number, z: number, color: number, hot = false) {
    if (this.alive.length > MAX * 0.68) return;
    this.emit(x, y, z, color, { speed: 0.08, life: hot ? 0.14 : 0.11, size: hot ? 0.16 : 0.11, grow: 0.16, grav: 0, up: 0, drag: 2.6, pixel: true });
    if (hot) this.emit(x, y, z, 0xffe1a0, { speed: 0.04, life: 0.07, size: 0.055, grav: 0, up: 0, pixel: true });
  }

  pixelBurst(x: number, y: number, z: number, color: number, tier: "tick" | "blast" | "boom" = "blast") {
    if (tier === "boom") {
      this.pixelExplode(x, y, z);
      return;
    }
    const tick = tier === "tick";
    this.emit(x, y, z, 0xfff7df, {
      speed: 0.02,
      life: tick ? 0.08 : 0.12,
      size: tick ? 0.42 : 0.78,
      grow: -2.8,
      grav: 0,
      up: 0,
      pixel: true,
    });
    const count = this.n(tick ? 7 : 16);
    for (let i = 0; i < count; i++) {
      this.emit(x, y, z, i % 2 ? 0xfff1c2 : color, {
        speed: (tick ? 5.5 : 9) * (0.55 + Math.random() * 0.7),
        life: tick ? 0.2 : 0.36,
        size: tick ? 0.1 : 0.15,
        up: 1.5,
        grav: 12,
        drag: 0.85,
        bounce: tick ? 0 : 0.18,
        pixel: true,
      });
    }
  }

  pixelExplode(x: number, y: number, z: number) {
    this.emit(x, y, z, 0xffffff, { speed: 0.04, life: 0.16, size: 1.5, grow: -4.5, grav: 0, up: 0, pixel: true });
    const colors = [0x7af0ff, 0x2ee0c8, 0xffd166, 0xe24a2b];
    for (let i = 0; i < this.n(42); i++) {
      this.emit(x, y, z, colors[i % colors.length]!, {
        speed: 9 + Math.random() * 6,
        life: 0.45 + Math.random() * 0.22,
        size: 0.1 + Math.random() * 0.08,
        up: 2.5,
        grav: 16,
        drag: 0.8,
        pixel: true,
      });
    }
    for (let i = 0; i < this.n(12); i++) {
      this.emit(x, y + 0.1, z, 0x7af0ff, { speed: 2.2, life: 0.75, size: 0.16, grow: 0.35, up: 0.4, grav: 1, drag: 1.8, pixel: true });
    }
  }

  rush(x: number, y: number, z: number, color: number) {
    if (this.busy()) return;
    this.emit(x, y, z, color, { speed: 1.4, life: 0.14, size: 0.16, up: 0.04, grav: 0, drag: 1.8, cone: 0.55 });
  }

  muzzle(x: number, y: number, z: number, dx: number, dy: number, dz: number, color: number) {
    this.emit(x, y, z, 0xfff4d0, { speed: 0.04, life: 0.055, size: 0.3, grow: -3.4, grav: 0, up: 0, pixel: true });
    const n = this.n(4);
    for (let i = 0; i < n; i++) {
      const j = 0.16;
      this.emit(x, y, z, color, {
        vx: dx * (8 + Math.random() * 5) + (Math.random() - 0.5) * j * 8,
        vy: dy * (8 + Math.random() * 5) + (Math.random() - 0.5) * j * 8,
        vz: dz * (8 + Math.random() * 5) + (Math.random() - 0.5) * j * 8,
        life: 0.085,
        size: 0.11,
        grav: 4,
        drag: 2,
        pixel: true,
      });
    }
  }

  update(_dt: number, _camera?: THREE.Camera) {
    const dt = _dt;
    this.uScale.value = 420 * Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, 1);
    this.ash += dt;
    if (!lo && !isStruggling() && this.ash > 0.2 && this.alive.length < 22) {
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
    for (const chunk of this.chunks) {
      if (chunk.life <= 0) continue;
      chunk.life -= dt;
      chunk.vy -= 16 * dt;
      chunk.vx *= 1 - Math.min(0.4, dt);
      chunk.vz *= 1 - Math.min(0.4, dt);
      chunk.mesh.position.x += chunk.vx * dt;
      chunk.mesh.position.y += chunk.vy * dt;
      chunk.mesh.position.z += chunk.vz * dt;
      if (chunk.mesh.position.y < 0.04) {
        chunk.mesh.position.y = 0.04;
        chunk.vy = Math.abs(chunk.vy) * 0.28;
        chunk.vx *= 0.6;
        chunk.vz *= 0.6;
      }
      chunk.mesh.rotation.x += chunk.vx * dt;
      chunk.mesh.rotation.z += chunk.vz * dt;
      if (chunk.life <= 0) chunk.mesh.visible = false;
    }
    const dampDt = dt;
    let w = 0;
    const alive = this.alive;
    const pool = this.pool;
    const pos = this.pos;
    const col = this.col;
    const siz = this.siz;
    const pix = this.pix;
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
      if (p.bounce > 0 && p.y < 0.04) {
        p.y = 0.04;
        p.vy = Math.abs(p.vy) * p.bounce;
        p.vx *= 0.72;
        p.vz *= 0.72;
      }
      const t = p.life / p.max;
      const fade = t * t;
      const o = w * 3;
      pos[o] = p.x;
      pos[o + 1] = p.y;
      pos[o + 2] = p.z;
      if (p.arc) {
        col[o] = p.r * (0.55 + 0.45 * fade);
        col[o + 1] = p.g * (0.55 + 0.45 * fade);
        col[o + 2] = p.b * (0.55 + 0.45 * fade);
      } else if (p.pixel) {
        col[o] = p.r * (0.45 + 0.55 * fade);
        col[o + 1] = p.g * (0.45 + 0.55 * fade);
        col[o + 2] = p.b * (0.45 + 0.55 * fade);
      } else {
        col[o] = p.r * (0.3 + 0.7 * fade);
        col[o + 1] = p.g * (0.22 + 0.62 * fade);
        col[o + 2] = p.b * (0.12 + 0.5 * fade);
      }
      siz[w] = Math.max(0.02, p.size + p.grow * (1 - t) * p.size);
      pix[w] = p.arc ? 2 : p.pixel ? 1 : 0;
      alive[w++] = i;
    }
    alive.length = w;
    this.points.geometry.setDrawRange(0, w);
    this.posAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;
    this.sizAttr.needsUpdate = true;
    this.pixAttr.needsUpdate = true;
    this.posAttr.addUpdateRange(0, w * 3);
    this.colAttr.addUpdateRange(0, w * 3);
    this.sizAttr.addUpdateRange(0, w);
    this.pixAttr.addUpdateRange(0, w);
  }

  dispose() {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
    this.tex.dispose();
    this.fleshGeo.dispose();
    this.glassGeo.dispose();
    this.glassMat.dispose();
    for (const mat of this.fleshMats) mat.dispose();
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
