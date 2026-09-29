import * as THREE from "three";
import { isLoDevice, isStruggling } from "./textures";

function makeSunGlowTex() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new THREE.Texture();
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, "rgba(255,252,236,1)");
  g.addColorStop(0.08, "rgba(255,236,170,0.95)");
  g.addColorStop(0.22, "rgba(255,176,70,0.55)");
  g.addColorStop(0.45, "rgba(255,92,24,0.22)");
  g.addColorStop(0.72, "rgba(255,40,8,0.06)");
  g.addColorStop(1, "rgba(255,20,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function makeGlintTex() {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new THREE.Texture();
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 30);
  g.addColorStop(0, "rgba(255,252,236,1)");
  g.addColorStop(0.16, "rgba(255,214,120,0.85)");
  g.addColorStop(0.42, "rgba(255,120,40,0.22)");
  g.addColorStop(1, "rgba(255,60,10,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  ctx.strokeStyle = "rgba(255,248,230,0.9)";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(32, 4);
  ctx.lineTo(32, 60);
  ctx.moveTo(4, 32);
  ctx.lineTo(60, 32);
  ctx.moveTo(12, 12);
  ctx.lineTo(52, 52);
  ctx.moveTo(52, 12);
  ctx.lineTo(12, 52);
  ctx.stroke();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function makeSunSprite(map: THREE.Texture, color: number, size: number) {
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map,
      color,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    }),
  );
  sprite.scale.setScalar(size);
  sprite.frustumCulled = false;
  sprite.renderOrder = -5;
  sprite.castShadow = false;
  return sprite;
}

const _c = new THREE.Color();
const _c2 = new THREE.Color();
const _fwd = new THREE.Vector3();

export type PulseMat = THREE.MeshStandardMaterial | THREE.MeshLambertMaterial;

export type ArenaLights = {
  tick: (now: number, dt: number, reduced: boolean, camera: THREE.Camera) => number;
  setTimeOfDay: (progress: number) => void;
  flash: (x: number, y: number, z: number, color: number, peak?: number) => void;
  setMuzzle: (color: number, peak?: number) => void;
  addPad: (parent: THREE.Object3D, x: number, z: number, y?: number) => void;
  addFill: (parent: THREE.Object3D, x: number, y: number, z: number, color: number, intensity: number, distance: number) => void;
  addGlint: (parent: THREE.Object3D, x: number, y: number, z: number) => void;
  dispose: () => void;
};

export function createArenaLights(
  scene: THREE.Scene,
  mats: {
    floor: PulseMat;
    rune: PulseMat;
    console: PulseMat;
    ruin: PulseMat;
    skull: PulseMat;
    pad: PulseMat;
    ion: PulseMat;
    ember: PulseMat;
  },
  renderer?: THREE.WebGLRenderer,
  theme: "crucible" | "pozo-cycle" | "summit" | "summit-cycle" | "lave" | "moon" | "mar" = "crucible",
): ArenaLights {
  const lowPower = isLoDevice();

  const summit = theme === "summit" || theme === "summit-cycle";
  const summitCycle = theme === "summit-cycle";
  const space = summit || theme === "moon";
  const moon = theme === "moon";
  const lave = theme === "lave";
  const sea = theme === "mar";
  const pozoCycle = theme === "pozo-cycle";
  let seaProgress = 0;
  const setTimeOfDay = (progress: number) => {
    if (sea || pozoCycle || summitCycle) seaProgress = THREE.MathUtils.clamp(progress, 0, 1);
  };
  const hemi = new THREE.HemisphereLight(
    moon ? 0xc8e8ff : summit ? 0xd7eeff : sea ? 0xc7efff : space ? 0x8ee8e8 : lave ? 0xff8a72 : 0xc4b0ff,
    moon ? 0x1a2838 : summit ? 0x3a6a88 : sea ? 0x2d5c78 : space ? 0x0a2830 : lave ? 0x3a1010 : 0x1a1028,
    moon ? 1.18 : summit ? 1.32 : sea ? 1.28 : 0.78,
  );
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(
    moon ? 0xe8f4ff : summit ? 0xfff1d0 : sea ? 0xfff4dc : space ? 0xc8fff4 : lave ? 0xff8a40 : 0xd8c8ff,
    moon ? 1.62 : summit ? 1.78 : sea ? 1.58 : space ? 1.18 : lave ? 1.42 : 1.35,
  );
  sun.position.set(48, 78, 62);
  sun.castShadow = !lowPower;
  sun.shadow.mapSize.set(512, 512);
  sun.shadow.camera.near = 8;
  sun.shadow.camera.far = 240;
  sun.shadow.camera.left = -72;
  sun.shadow.camera.right = 72;
  sun.shadow.camera.top = 72;
  sun.shadow.camera.bottom = -72;
  sun.shadow.bias = -0.0007;
  sun.shadow.normalBias = 0.035;
  sun.shadow.radius = lowPower ? 1 : 2;
  sun.shadow.autoUpdate = false;
  sun.shadow.needsUpdate = true;
  scene.add(sun);
  scene.add(sun.target);
  sun.target.position.set(0, 2, 0);

  const bounce = new THREE.DirectionalLight(space ? 0x24405c : sea ? 0x246f92 : lave ? 0x873818 : 0x6a2030, moon ? 0.42 : 0.28);
  bounce.position.set(-32, 24, -26);
  bounce.castShadow = false;
  scene.add(bounce);

  const rim = new THREE.DirectionalLight(space ? 0x9ec8ff : sea ? 0xd4f0ff : lave ? 0xffb06c : 0xffc090, moon ? 0.48 : 0.28);
  rim.position.set(12, 18, -40);
  rim.castShadow = false;
  scene.add(rim);

  const ambient = new THREE.AmbientLight(space ? 0x2c3c50 : sea ? 0x87afc6 : lave ? 0x5a3020 : 0x5a4034, moon ? 0.42 : sea ? 0.32 : 0.22);
  scene.add(ambient);

  const muzzle = new THREE.PointLight(0xffe0a0, 0, 14, 1.8);
  muzzle.castShadow = false;
  scene.add(muzzle);

  const flashes: THREE.PointLight[] = [];
  const flashT = [0, 0, 0];
  const flashPeak = [0, 0, 0];
  const flashDur = [0.18, 0.18, 0.22];
  let flashI = 0;
  for (let i = 0; i < 3; i++) {
    const L = new THREE.PointLight(0xffaa66, 0, 22, 1.7);
    L.castShadow = false;
    L.visible = false;
    scene.add(L);
    flashes.push(L);
  }

  const pads: THREE.PointLight[] = [];
  const padPhase: number[] = [];
  const fills: Array<{ lamp: THREE.PointLight; base: number; phase: number }> = [];
  const glints: Array<{ sprite: THREE.Sprite; phase: number; base: number }> = [];
  const glintMap = makeGlintTex();

  const sunGlowMap = makeSunGlowTex();
  const sunCore = new THREE.Mesh(
    new THREE.SphereGeometry(3.2, lowPower ? 12 : 16, lowPower ? 10 : 12),
    new THREE.MeshBasicMaterial({
      color: 0xfff6d8,
      fog: false,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  sunCore.position.set(48, 78, 62);
  sunCore.frustumCulled = false;
  sunCore.castShadow = false;
  sunCore.renderOrder = -4;
  scene.add(sunCore);

  const corona = makeSunSprite(sunGlowMap, space ? 0xdceaff : 0xffe8a8, space ? 34 : 52);
  const halo = makeSunSprite(sunGlowMap, space ? 0x3f78d8 : 0xff6a28, space ? 58 : 96);
  const sting = makeSunSprite(sunGlowMap, 0xfff8ee, space ? 12 : 18);
  corona.position.copy(sunCore.position);
  halo.position.copy(sunCore.position);
  sting.position.copy(sunCore.position);
  scene.add(corona, halo, sting);
  if (sea || pozoCycle || summitCycle) {
    if (sea) sun.castShadow = false;
    sunCore.visible = false;
    corona.visible = false;
    halo.visible = false;
    sting.visible = false;
  }

  const sunLamp = new THREE.PointLight(space ? 0xc6dcff : 0xffc070, 10, 180, 1.55);
  sunLamp.castShadow = false;
  sunLamp.position.copy(sunCore.position);
  scene.add(sunLamp);

  scene.fog = new THREE.Fog(
    moon ? 0x07121c : space ? 0x04141c : sea ? 0x82c8df : lave ? 0x2a0808 : 0x0c0818,
    moon ? 120 : sea ? 90 : space || lave ? 80 : 55,
    moon ? 300 : sea ? 300 : space ? 240 : lave ? 220 : 165,
  );
  scene.background = new THREE.Color(space ? 0x021018 : sea ? 0x82c8df : lave ? 0x140406 : 0x07051a);

  let muzzleT = 0;
  let muzzlePeak = 0;
  let shadowWait = 0;
  let cheapSkip = 0;
  const fogColor = scene.fog.color;
  const bg = scene.background as THREE.Color;

  function addPad(parent: THREE.Object3D, x: number, z: number, y = 0.55) {
    if (pads.length >= (lowPower ? 2 : 3)) return;
    const glow = new THREE.PointLight(lave ? 0xff6a28 : 0x7ff5e4, 2.2, 9, 1.8);
    glow.castShadow = false;
    glow.position.set(x, y, z);
    parent.add(glow);
    pads.push(glow);
    padPhase.push(pads.length * 1.37);
  }

  function addFill(
    parent: THREE.Object3D,
    x: number,
    y: number,
    z: number,
    color: number,
    intensity: number,
    distance: number,
  ) {
    if (fills.length >= (lowPower ? 4 : 8)) return;
    const lamp = new THREE.PointLight(color, intensity, distance, 1.55);
    lamp.castShadow = false;
    lamp.position.set(x, y, z);
    parent.add(lamp);
    fills.push({ lamp, base: intensity, phase: fills.length * 0.85 });
  }

  function addGlint(parent: THREE.Object3D, x: number, y: number, z: number) {
    if (glints.length >= (lowPower ? 6 : 16)) return;
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glintMap,
        color: 0xffe6b0,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
        fog: true,
      }),
    );
    sprite.position.set(x, y, z);
    sprite.scale.setScalar(0.32);
    parent.add(sprite);
    glints.push({ sprite, phase: glints.length * 1.63, base: 0.26 + (glints.length % 3) * 0.08 });
  }

  function flash(x: number, y: number, z: number, color: number, peak = 16) {
    const i = flashI++ % flashes.length;
    const L = flashes[i]!;
    L.color.setHex(color);
    L.position.set(x, y + 0.25, z);
    L.intensity = peak;
    L.distance = 8 + peak * 0.7;
    L.visible = true;
    flashT[i] = 0.16;
    flashPeak[i] = peak;
    flashDur[i] = peak > 18 ? 0.28 : 0.16;
  }

  function setMuzzle(color: number, peak = 10) {
    muzzle.color.setHex(color);
    muzzlePeak = peak;
    muzzleT = 0.08;
    muzzle.intensity = peak;
    muzzle.visible = true;
  }

  function tick(now: number, dt: number, reduced: boolean, camera: THREE.Camera) {
    const cheap = lowPower || isStruggling() || reduced;
    muzzleT = Math.max(0, muzzleT - dt);
    if (muzzleT > 0) {
      camera.getWorldDirection(_fwd);
      muzzle.position.copy(camera.position).addScaledVector(_fwd, 0.55);
      muzzle.position.y += 0.08;
      muzzle.intensity = muzzlePeak * (muzzleT / 0.08);
    } else {
      muzzle.intensity = 0;
    }
    for (let i = 0; i < flashes.length; i++) {
      flashT[i] = Math.max(0, flashT[i]! - dt);
      const L = flashes[i]!;
      if (flashT[i]! > 0) {
        L.intensity = flashPeak[i]! * (flashT[i]! / flashDur[i]!);
        L.visible = true;
      } else {
        L.intensity = 0;
        L.visible = false;
      }
    }
    if (sea) {
      if (cheap) {
        cheapSkip += 1;
        if (cheapSkip % 3 !== 0) return 1.08;
      }
      const angle = seaProgress * Math.PI;
      sun.position.set(Math.sin(angle) * 92, Math.cos(angle) * 92, 40);
      sunCore.position.copy(sun.position);
      corona.position.copy(sun.position);
      halo.position.copy(sun.position);
      sting.position.copy(sun.position);
      sunLamp.position.copy(sun.position);
    } else if (cheap) {
      cheapSkip += 1;
      if (cheapSkip % 3 !== 0) return 1.08;
    } else {
      const az = now * 0.018;
      const el = 0.82 + 0.06 * Math.sin(now * 0.05);
      const sr = 92;
      sun.position.set(Math.cos(az) * sr * Math.cos(el), Math.sin(el) * 96, Math.sin(az) * sr * Math.cos(el));
      sunCore.position.copy(sun.position);
      corona.position.copy(sun.position);
      halo.position.copy(sun.position);
      sting.position.copy(sun.position);
      sunLamp.position.copy(sun.position);
    }
    const slow = cheap ? 0 : 1;
    const breathe = 0.5 + 0.5 * Math.sin(now * 0.38);
    const flicker = cheap ? 0 : 0.5 + 0.5 * Math.sin(now * 3.1) * Math.sin(now * 5.7);
    const pulse = breathe * 0.82 + flicker * 0.18;
    sunCore.scale.setScalar(1 + 0.04 * pulse);
    corona.scale.setScalar((space ? 32 : 48) + (space ? 6 : 10) * pulse);
    halo.scale.setScalar((space ? 54 : 88) + (space ? 10 : 18) * pulse);
    sting.scale.setScalar((space ? 10 : 14) + (space ? 3 : 4) * pulse);

    bounce.position.set(-sun.position.x * 0.35, 22, -sun.position.z * 0.35);
    if (sea) {
      const sunset = THREE.MathUtils.smoothstep(seaProgress, 0.38, 0.52) * (1 - THREE.MathUtils.smoothstep(seaProgress, 0.58, 0.72));
      const night = THREE.MathUtils.smoothstep(seaProgress, 0.67, 0.86);
      _c.setHex(0xfff2d9).lerp(_c2.setHex(0xff9855), sunset).lerp(_c2.setHex(0xb0cfff), night);
      sun.color.copy(_c);
      sun.intensity = (1.58 * (1 - night) + 0.18 * night) * (1 - 0.22 * sunset);
      hemi.color.setHex(0xb9eaff).lerp(_c2.setHex(0xffb47d), sunset).lerp(_c2.setHex(0x718fca), night);
      hemi.groundColor.setHex(0x346c88).lerp(_c2.setHex(0x734b52), sunset).lerp(_c2.setHex(0x101a3a), night);
      hemi.intensity = 1.28 * (1 - night) + 0.52 * night - 0.08 * sunset;
      ambient.color.setHex(0x91c8e2).lerp(_c2.setHex(0xf0a071), sunset).lerp(_c2.setHex(0x314979), night);
      ambient.intensity = 0.30 + 0.08 * (1 - night) + 0.12 * night + 0.02 * sunset;
      rim.color.setHex(0xd4f0ff).lerp(_c2.setHex(0xffa36d), sunset).lerp(_c2.setHex(0x718aff), night);
      rim.intensity = 0.24 + 0.08 * (1 - night) + 0.12 * night;
      bounce.color.setHex(0x246f92).lerp(_c2.setHex(0x8c4e43), sunset).lerp(_c2.setHex(0x263a76), night);
      bounce.intensity = 0.22 + 0.06 * (1 - night) + 0.08 * night;
      fogColor.setHex(0x82c8df).lerp(_c2.setHex(0xd88768), sunset).lerp(_c2.setHex(0x17254a), night);
      bg.copy(fogColor);
      sunCore.visible = false;
      corona.visible = false;
      halo.visible = false;
      sting.visible = false;
      sunLamp.intensity = 0;
    } else if (summitCycle) {
      const night = THREE.MathUtils.smoothstep(seaProgress, 0.4, 0.62);
      sun.color.setHex(0xffb06a).lerp(_c2.setHex(0x9eb6e8), night);
      sun.intensity = 1.55 * (1 - night) + 0.42 * night;
      hemi.color.setHex(0xffc49a).lerp(_c2.setHex(0x8aa4d4), night);
      hemi.groundColor.setHex(0x6a4038).lerp(_c2.setHex(0x1a2748), night);
      hemi.intensity = 1.05 * (1 - night) + 0.55 * night;
      ambient.color.setHex(0xf0a070).lerp(_c2.setHex(0x31456e), night);
      ambient.intensity = 0.32 * (1 - night) + 0.22 * night;
      rim.color.setHex(0xffa36d).lerp(_c2.setHex(0x7f92d8), night);
      rim.intensity = 0.28 * (1 - night) + 0.18 * night;
      bounce.color.setHex(0x8c4e43).lerp(_c2.setHex(0x24386a), night);
      bounce.intensity = 0.26 * (1 - night) + 0.16 * night;
      fogColor.setHex(0xc46a48).lerp(_c2.setHex(0x1a2744), night);
      bg.copy(fogColor);
      sunLamp.intensity = 0;
      sunCore.visible = false;
      corona.visible = false;
      halo.visible = false;
      sting.visible = false;
    } else if (pozoCycle) {
      const warm = THREE.MathUtils.smoothstep(seaProgress, 0.42, 0.55) *
        (1 - THREE.MathUtils.smoothstep(seaProgress, 0.58, 0.7));
      const night = THREE.MathUtils.smoothstep(seaProgress, 0.67, 0.86);
      sun.color.setHex(0x9bdcff).lerp(_c2.setHex(0xffa15e), warm).lerp(_c2.setHex(0x647ac7), night);
      sun.intensity = (1.45 * (1 - night) + 0.48 * night) * (1 - 0.18 * warm);
      hemi.color.setHex(0xb8e5ff).lerp(_c2.setHex(0xffbd8a), warm).lerp(_c2.setHex(0x6675b8), night);
      hemi.groundColor.setHex(0x3e5c86).lerp(_c2.setHex(0x75423c), warm).lerp(_c2.setHex(0x11162f), night);
      hemi.intensity = 0.92 * (1 - night) + 0.58 * night + 0.08 * warm;
      ambient.color.setHex(0x607fbd).lerp(_c2.setHex(0xa55248), warm).lerp(_c2.setHex(0x242e6d), night);
      ambient.intensity = 0.24 + 0.04 * (1 - night) + 0.06 * night;
      rim.color.setHex(0x5ed9f4).lerp(_c2.setHex(0xff784e), warm).lerp(_c2.setHex(0x627bff), night);
      rim.intensity = 0.2 + 0.06 * (1 - night) + 0.08 * night;
      bounce.color.setHex(0x28638b).lerp(_c2.setHex(0x9c443d), warm).lerp(_c2.setHex(0x303c86), night);
      bounce.intensity = 0.24 + 0.04 * (1 - night) + 0.06 * night;
      fogColor.setHex(0x172a4b).lerp(_c2.setHex(0x54252c), warm).lerp(_c2.setHex(0x080d25), night);
      bg.copy(fogColor);
      sunLamp.intensity = 0;
      sunCore.visible = false;
      corona.visible = false;
      halo.visible = false;
      sting.visible = false;
    } else {
      sunLamp.intensity = moon ? 8 + 2.4 * pulse : space ? 5 + 2 * pulse : 8 + 4 * pulse;
      bounce.intensity = (moon ? 0.34 : 0.22) + 0.08 * (1 - pulse);
      (corona.material as THREE.SpriteMaterial).opacity = space ? 0.7 + 0.08 * pulse : 0.92 + 0.08 * pulse;
      (halo.material as THREE.SpriteMaterial).opacity = space ? 0.32 + 0.12 * pulse : 0.55 + 0.2 * pulse;
      (sting.material as THREE.SpriteMaterial).opacity = 0.85 + 0.15 * pulse;

      ambient.intensity = (moon ? 0.4 : 0.2) + 0.05 * breathe;
      rim.intensity = (moon ? 0.4 : 0.16) + 0.06 * breathe;
      if (moon) {
        sun.color.setHex(0xfff6e8);
        sun.intensity = 1.72 + 0.1 * pulse;
        hemi.intensity = 1.18;
      } else if (space) {
        sun.color.setHex(0xfff4dd);
        sun.intensity = 1.5 + 0.08 * pulse;
        hemi.intensity = 0.9;
      } else if (lave) {
        _c.setHex(0xff8a42);
        _c2.setHex(0xffe1b8);
        sun.color.copy(_c).lerp(_c2, 0.62 + 0.22 * breathe);
        sun.intensity = 1.36 + 0.14 * pulse;
        fogColor.setHex(0x431b12).lerp(_c2.setHex(0x672915), 0.12 + 0.1 * breathe);
        bg.copy(fogColor).multiplyScalar(0.58);
        hemi.color.setHex(0xffcfaa);
        hemi.groundColor.setHex(0x3a1b10);
        hemi.intensity = 0.82;
      } else {
        _c.setHex(0xff7a32);
        _c2.setHex(0xfff1c0);
        sun.color.copy(_c).lerp(_c2, 0.55 + 0.35 * breathe);
        sun.intensity = 1.28 + 0.18 * pulse;
        fogColor.setHex(0x24100c).lerp(_c2.setHex(0x3a1810), 0.18 + 0.16 * breathe);
        bg.copy(fogColor).multiplyScalar(0.62);
        hemi.color.copy(sun.color);
        hemi.intensity = 0.72 + 0.1 * pulse;
      }
    }

    mats.floor.emissiveIntensity = 0.18 + 0.08 * pulse;
    mats.console.emissiveIntensity = 0.2 + 0.1 * pulse;
    mats.rune.emissiveIntensity = 0.7 + 0.45 * (0.5 + 0.5 * Math.sin(now * 2.4));
    mats.ruin.emissiveIntensity = 0.1 + 0.1 * flicker;
    mats.skull.emissiveIntensity = 0.22 + 0.2 * (0.5 + 0.5 * Math.sin(now * 1.7));
    mats.pad.emissiveIntensity = 0.7 + 0.5 * (0.5 + 0.5 * Math.sin(now * 4.2));
    mats.ion.emissiveIntensity = 1.35 + 0.55 * (0.5 + 0.5 * Math.sin(now * 3.4));
    mats.ember.emissiveIntensity = 1.15 + 0.45 * flicker;

    for (let i = 0; i < pads.length; i++) {
      const p = 0.5 + 0.5 * Math.sin(now * 3.6 + padPhase[i]!);
      pads[i]!.intensity = 1.4 + 1.8 * p * (0.65 + 0.35 * slow);
    }

    for (const fill of fills) {
      const breatheFill = 0.84 + 0.16 * Math.sin(now * 1.25 + fill.phase);
      fill.lamp.intensity = fill.base * breatheFill;
    }

    if (!cheap) {
      for (const glint of glints) {
        const tw = Math.pow(Math.max(0, 0.5 + 0.5 * Math.sin(now * 3.6 + glint.phase)), 5);
        const mat = glint.sprite.material as THREE.SpriteMaterial;
        mat.opacity = 0.08 + 0.92 * tw;
        glint.sprite.scale.setScalar(glint.base * (0.65 + tw));
      }
    }

    if (!lowPower && renderer?.shadowMap.enabled) {
      shadowWait += dt;
      if (shadowWait >= 2.8) {
        shadowWait = 0;
        sun.shadow.needsUpdate = true;
        renderer.shadowMap.needsUpdate = true;
      }
    }

    return 1.08 + 0.04 * pulse;
  }

  function dispose() {
    scene.remove(hemi, sun, sun.target, bounce, rim, ambient, muzzle, sunCore, corona, halo, sting, sunLamp);
    sunCore.geometry.dispose();
    (sunCore.material as THREE.Material).dispose();
    (corona.material as THREE.Material).dispose();
    (halo.material as THREE.Material).dispose();
    (sting.material as THREE.Material).dispose();
    sunGlowMap.dispose();
    glintMap.dispose();
    for (const glint of glints) (glint.sprite.material as THREE.Material).dispose();
    for (const L of flashes) scene.remove(L);
    for (const L of pads) L.removeFromParent();
  }

  if (renderer) renderer.shadowMap.needsUpdate = true;
  return { tick, setTimeOfDay, flash, setMuzzle, addPad, addFill, addGlint, dispose };
}
