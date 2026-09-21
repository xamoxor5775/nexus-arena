import * as THREE from "three";

const _c = new THREE.Color();
const _c2 = new THREE.Color();
const _fwd = new THREE.Vector3();

export type PulseMat = THREE.MeshStandardMaterial;

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
): ArenaLights {
  const hemi = new THREE.HemisphereLight(0xff9a72, 0x3a2218, 1.28);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xff7a40, 1.5);
  sun.position.set(48, 78, 62);
  scene.add(sun);

  const bounce = new THREE.DirectionalLight(0x6a2030, 0.48);
  bounce.position.set(-32, 24, -26);
  scene.add(bounce);

  const ambient = new THREE.AmbientLight(0x5a4034, 0.52);
  scene.add(ambient);

  const fill = new THREE.PointLight(0xff8a62, 14, 56, 1.7);
  fill.position.set(0, 8, 0);
  scene.add(fill);

  const muzzle = new THREE.PointLight(0xffe0a0, 0, 14, 1.8);
  scene.add(muzzle);

  const flashes: THREE.PointLight[] = [];
  const flashT = [0, 0, 0];
  const flashPeak = [0, 0, 0];
  const flashDur = [0.18, 0.18, 0.22];
  let flashI = 0;
  for (let i = 0; i < 3; i++) {
    const L = new THREE.PointLight(0xffaa66, 0, 22, 1.7);
    L.visible = false;
    scene.add(L);
    flashes.push(L);
  }

  const pads: THREE.PointLight[] = [];
  const padPhase: number[] = [];

  const sunCore = new THREE.Mesh(
    new THREE.SphereGeometry(7, 12, 10),
    new THREE.MeshBasicMaterial({ color: 0xffd090, fog: false, depthWrite: false, toneMapped: false }),
  );
  sunCore.position.set(48, 78, 62);
  sunCore.frustumCulled = false;
  scene.add(sunCore);

  const corona = new THREE.Mesh(
    new THREE.SphereGeometry(14, 10, 8),
    new THREE.MeshBasicMaterial({
      color: 0xff6a32,
      fog: false,
      depthWrite: false,
      toneMapped: false,
      transparent: true,
      opacity: 0.22,
    }),
  );
  corona.position.copy(sunCore.position);
  corona.frustumCulled = false;
  scene.add(corona);

  scene.fog = new THREE.Fog(0x3a140e, 70, 190);
  scene.background = new THREE.Color(0x2a0e0a);

  let muzzleT = 0;
  let muzzlePeak = 0;
  const fogColor = scene.fog.color;
  const bg = scene.background as THREE.Color;

  function addPad(parent: THREE.Object3D, x: number, z: number) {
    if (pads.length >= 4) return;
    const glow = new THREE.PointLight(0x7ff5e4, 2.8, 10, 1.8);
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

    const az = now * 0.07;
    const el = 0.78 + 0.1 * Math.sin(now * 0.09);
    const sr = 92;
    sun.position.set(Math.cos(az) * sr * Math.cos(el), Math.sin(el) * 96, Math.sin(az) * sr * Math.cos(el));
    sunCore.position.copy(sun.position);
    corona.position.copy(sun.position);
    const s = 1 + 0.08 * pulse;
    sunCore.scale.setScalar(s);
    corona.scale.setScalar(0.92 + 0.18 * pulse);

    _c.setHex(0xff5a28);
    _c2.setHex(0xffd090);
    sun.color.copy(_c).lerp(_c2, 0.4 + 0.45 * breathe);
    sun.intensity = 1.42 + 0.32 * pulse;
    bounce.intensity = 0.38 + 0.16 * (1 - pulse);
    bounce.position.set(-sun.position.x * 0.35, 22, -sun.position.z * 0.35);
    (sunCore.material as THREE.MeshBasicMaterial).color.copy(sun.color);
    (corona.material as THREE.MeshBasicMaterial).opacity = 0.16 + 0.14 * pulse;

    hemi.color.copy(sun.color);
    hemi.intensity = 1.22 + 0.22 * pulse;
    ambient.intensity = 0.48 + 0.1 * breathe;

    fill.color.copy(sun.color);
    fill.intensity = 13 + 6 * pulse;
    fill.position.set(Math.sin(now * 0.21) * 10, 7.5, Math.cos(now * 0.17) * 10);

    fogColor.setHex(0x2e100c).lerp(_c2.setHex(0x5a2214), 0.22 + 0.28 * breathe);
    bg.copy(fogColor).multiplyScalar(0.72);

    mats.floor.emissiveIntensity = 0.28 + 0.18 * pulse;
    mats.console.emissiveIntensity = 0.24 + 0.18 * pulse;
    mats.rune.emissiveIntensity = 0.7 + 0.45 * (0.5 + 0.5 * Math.sin(now * 2.4));
    mats.ruin.emissiveIntensity = 0.1 + 0.1 * flicker;
    mats.skull.emissiveIntensity = 0.22 + 0.2 * (0.5 + 0.5 * Math.sin(now * 1.7));
    mats.pad.emissiveIntensity = 0.7 + 0.5 * (0.5 + 0.5 * Math.sin(now * 4.2));
    mats.ion.emissiveIntensity = 1.35 + 0.55 * (0.5 + 0.5 * Math.sin(now * 3.4));
    mats.ember.emissiveIntensity = 1.15 + 0.45 * flicker;

    for (let i = 0; i < pads.length; i++) {
      const p = 0.5 + 0.5 * Math.sin(now * 3.6 + padPhase[i]!);
      pads[i]!.intensity = 1.6 + 2.4 * p * (0.65 + 0.35 * slow);
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

    return 1.28 + 0.1 * pulse;
  }

  function dispose() {
    scene.remove(hemi, sun, bounce, ambient, fill, muzzle, sunCore, corona);
    sunCore.geometry.dispose();
    corona.geometry.dispose();
    (sunCore.material as THREE.Material).dispose();
    (corona.material as THREE.Material).dispose();
    for (const L of flashes) scene.remove(L);
  }

  return { tick, flash, setMuzzle, addPad, dispose };
}
