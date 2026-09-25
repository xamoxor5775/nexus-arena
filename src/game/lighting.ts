import * as THREE from "three";

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
  flash: (x: number, y: number, z: number, color: number, peak?: number) => void;
  setMuzzle: (color: number, peak?: number) => void;
  addPad: (parent: THREE.Object3D, x: number, z: number) => void;
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
): ArenaLights {
  const lowPower =
    typeof window !== "undefined" &&
    (window.matchMedia?.("(pointer: coarse)").matches || window.innerWidth < 720);

  const hemi = new THREE.HemisphereLight(0xffb080, 0x2a1812, 0.78);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffc070, 1.35);
  sun.position.set(48, 78, 62);
  sun.castShadow = true;
  sun.shadow.mapSize.set(lowPower ? 512 : 1024, lowPower ? 512 : 1024);
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

  const bounce = new THREE.DirectionalLight(0x6a2030, 0.28);
  bounce.position.set(-32, 24, -26);
  bounce.castShadow = false;
  scene.add(bounce);

  const rim = new THREE.DirectionalLight(0xffc090, 0.28);
  rim.position.set(12, 18, -40);
  rim.castShadow = false;
  scene.add(rim);

  const ambient = new THREE.AmbientLight(0x5a4034, 0.22);
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

  const sunGlowMap = makeSunGlowTex();
  const sunCore = new THREE.Mesh(
    new THREE.SphereGeometry(3.2, 32, 24),
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

  const corona = makeSunSprite(sunGlowMap, 0xffe8a8, 52);
  const halo = makeSunSprite(sunGlowMap, 0xff6a28, 96);
  const sting = makeSunSprite(sunGlowMap, 0xfff8ee, 18);
  corona.position.copy(sunCore.position);
  halo.position.copy(sunCore.position);
  sting.position.copy(sunCore.position);
  scene.add(corona, halo, sting);

  const sunLamp = new THREE.PointLight(0xffc070, 10, 180, 1.55);
  sunLamp.castShadow = false;
  sunLamp.position.copy(sunCore.position);
  scene.add(sunLamp);

  scene.fog = new THREE.Fog(0x2a100c, 55, 165);
  scene.background = new THREE.Color(0x1a0a08);

  let muzzleT = 0;
  let muzzlePeak = 0;
  let shadowWait = 0;
  const fogColor = scene.fog.color;
  const bg = scene.background as THREE.Color;

  function addPad(parent: THREE.Object3D, x: number, z: number) {
    if (pads.length >= 2) return;
    const glow = new THREE.PointLight(0x7ff5e4, 2.2, 9, 1.8);
    glow.castShadow = false;
    glow.position.set(x, 0.55, z);
    parent.add(glow);
    pads.push(glow);
    padPhase.push(pads.length * 1.37);
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
    const slow = reduced ? 0 : 1;
    const breathe = 0.5 + 0.5 * Math.sin(now * 0.38);
    const flicker = reduced ? 0 : 0.5 + 0.5 * Math.sin(now * 3.1) * Math.sin(now * 5.7);
    const pulse = breathe * 0.82 + flicker * 0.18;

    const az = now * 0.018;
    const el = 0.82 + 0.06 * Math.sin(now * 0.05);
    const sr = 92;
    sun.position.set(Math.cos(az) * sr * Math.cos(el), Math.sin(el) * 96, Math.sin(az) * sr * Math.cos(el));
    sunCore.position.copy(sun.position);
    corona.position.copy(sun.position);
    halo.position.copy(sun.position);
    sting.position.copy(sun.position);
    sunLamp.position.copy(sun.position);
    const s = 1 + 0.04 * pulse;
    sunCore.scale.setScalar(s);
    corona.scale.setScalar(48 + 10 * pulse);
    halo.scale.setScalar(88 + 18 * pulse);
    sting.scale.setScalar(14 + 4 * pulse);

    _c.setHex(0xff7a32);
    _c2.setHex(0xfff1c0);
    sun.color.copy(_c).lerp(_c2, 0.55 + 0.35 * breathe);
    sun.intensity = 1.28 + 0.18 * pulse;
    sunLamp.intensity = 8 + 4 * pulse;
    bounce.intensity = 0.22 + 0.08 * (1 - pulse);
    bounce.position.set(-sun.position.x * 0.35, 22, -sun.position.z * 0.35);
    (sunCore.material as THREE.MeshBasicMaterial).color.setHex(0xfff8e4);
    (corona.material as THREE.SpriteMaterial).opacity = 0.92 + 0.08 * pulse;
    (halo.material as THREE.SpriteMaterial).opacity = 0.55 + 0.2 * pulse;
    (sting.material as THREE.SpriteMaterial).opacity = 0.85 + 0.15 * pulse;

    hemi.color.copy(sun.color);
    hemi.intensity = 0.72 + 0.1 * pulse;
    ambient.intensity = 0.2 + 0.05 * breathe;
    rim.intensity = 0.16 + 0.06 * breathe;

    fogColor.setHex(0x24100c).lerp(_c2.setHex(0x3a1810), 0.18 + 0.16 * breathe);
    bg.copy(fogColor).multiplyScalar(0.62);

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

    shadowWait += dt;
    if (shadowWait >= (lowPower ? 0.7 : 0.4)) {
      shadowWait = 0;
      sun.shadow.needsUpdate = true;
      if (renderer) renderer.shadowMap.needsUpdate = true;
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
    for (const L of flashes) scene.remove(L);
    for (const L of pads) L.removeFromParent();
  }

  if (renderer) renderer.shadowMap.needsUpdate = true;
  return { tick, flash, setMuzzle, addPad, dispose };
}
