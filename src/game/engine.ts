import * as THREE from "three";
import { ArenaAudio } from "./audio";
import { buildArena, makeItemMesh, type ArenaData } from "./arena";
import { projectileTexture } from "./textures";
import { buildLave } from "./lave";
import { buildSummit } from "./summit";
import {
  AIR_ACCEL,
  AIR_WISH_CAP,
  BEST_KEY,
  BOT_COLORS,
  BOT_COLOR_CSS,
  BOT_NAMES,
  COYOTE,
  CREDITS_KEY,
  CROUCH_EYE,
  CROUCH_H,
  EYE,
  FRICTION,
  GRAVITY,
  GROUND_ACCEL,
  GROUND_SNAP,
  JUMP_BUF,
  JUMP_VEL,
  MAX_AIR,
  MAX_GROUND,
  PLAYER_H,
  PLAYER_HW,
  POWER_META,
  ROUND_SECONDS,
  STARTING_GRENADES,
  SPRINT,
  STEP_HEIGHT,
  STOP_SPEED,
  WEAPON_META,
  WEAPON_ORDER,
  isPower,
} from "./constants";
import { animateFighter, crackFighter, makeBotMesh, resetFighterMesh, shatterFighter } from "./fighterMesh";
import { ParticleField, TraumaShake } from "./fx";
import { BeamBatch, InstancePool } from "./instancing";
import { GameInput } from "./input";
import { FrameLoop } from "./loop";
import { localSnapshot, RemoteSync, type RemoteSnapshot } from "./network";
import { accelerateWish, blockedAt, bodyBox, depenetrate, moveBody, overlaps, rayAABB, raycastWorld } from "./physics";
import { createArenaRenderer, type ArenaRenderer } from "./renderer";
import type { ArenaId, ControlsProbe, HudSnapshot, KillFeedItem, PowerId, Screen, Settings, ShopItemId, WeaponId } from "./types";
import { adsPose, restPose } from "./viewmodel";
import { debugSpool } from "@/lib/debug-spool";

export type { RemoteSnapshot } from "./network";

const _look = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _wish = new THREE.Vector3();
const _origin = new THREE.Vector3();
const _dir = new THREE.Vector3();

type Fighter = {
  id: string;
  name: string;
  isPlayer: boolean;
  isRemote: boolean;
  color: number;
  colorCss: string;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  yaw: number;
  pitch: number;
  health: number;
  armor: number;
  mag: Record<WeaponId, number>;
  reserve: Record<WeaponId, number>;
  owned: Set<WeaponId>;
  weapon: WeaponId;
  lastShot: number;
  reloadUntil: number;
  alive: boolean;
  respawnAt: number;
  protectUntil: number;
  frags: number;
  deaths: number;
  grounded: boolean;
  wasGrounded: boolean;
  coyote: number;
  jumpBuf: number;
  landT: number;
  height: number;
  mesh: THREE.Group | null;
  wishX: number;
  wishY: number;
  wishJump: boolean;
  wantsFire: boolean;
  nextThink: number;
  targetId: string | null;
  strafe: number;
  wp: number;
  skill: number;
  powers: Record<PowerId, number>;
  blinkCharges: number;
  airJumps: number;
  grenades: number;
  portalUntil: number;
  heatUntil: number;
  gliding: boolean;
  dodgeUntil: number;
  reactUntil: number;
  strafeUntil: number;
};

type Proj = {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  owner: string;
  weapon: WeaponId;
  ttl: number;
  dmg: number;
  splash: number;
  knock: number;
  radius: number;
  slot: number;
  pool: "rocket" | "ion";
  pixel: boolean;
};

type WorldItem = {
  id: string;
  kind: ArenaData["items"][number]["kind"];
  x: number;
  y: number;
  z: number;
  respawn: number;
  ready: boolean;
  readyAt: number;
  mesh: THREE.Group;
};

export type EngineHooks = {
  onHud: (h: HudSnapshot) => void;
  onScreen: (s: Screen) => void;
  onLock: (locked: boolean) => void;
};

export class NexusArena {
  input = new GameInput();
  settings: Settings;
  private canvas: HTMLCanvasElement;
  private hooks: EngineHooks;
  private view: ArenaRenderer;
  private loop = new FrameLoop();
  private net = new RemoteSync();
  private audio = new ArenaAudio();
  private arena!: ArenaData;
  private arenaId: ArenaId = "pozo";
  private fx = new ParticleField();
  private shake = new TraumaShake();
  private fighters: Fighter[] = [];
  private player!: Fighter;
  private projectiles: Proj[] = [];
  private beamBatch = new BeamBatch(24);
  private items: WorldItem[] = [];
  private recoil = 0;
  private eyeY = EYE;
  private running = false;
  private disposed = false;
  private screen: Screen = "menu";
  private locked = false;
  private hadLock = false;
  private countdown: number | null = null;
  private matchOn = false;
  private orbitT = 0.8;
  private pickupMsg: string | null = null;
  private pickupT = 0;
  private hitmarker = 0;
  private hurt = 0;
  private killFeed: KillFeedItem[] = [];
  private feedSeq = 0;
  private winner: string | null = null;
  private roundSeconds = 0;
  private credits = 35;
  private score = 0;
  private hudClock = 0;
  private muzzle = 0;
  private chutes = new Map<string, THREE.Group>();
  private adsT = 0;
  private frameFails = 0;
  private streak = 0;
  private streakUntil = 0;
  private firstBlood = true;
  private reducedMotion = false;
  private landDip = 0;
  private swayX = 0;
  private swayY = 0;
  private fovKick = 0;
  private nextStepAt = 0;
  private rocketGeo = new THREE.CapsuleGeometry(0.105, 0.32, 3, 8);
  private ionGeo = new THREE.OctahedronGeometry(0.125, 0);
  private rockets = new InstancePool(
    this.rocketGeo,
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: projectileTexture("rocket"),
      emissive: 0xff572f,
      emissiveMap: projectileTexture("rocket"),
      emissiveIntensity: 0.72,
      metalness: 0.52,
      roughness: 0.3,
      toneMapped: false,
      fog: false,
    }),
    16,
  );
  private ions = new InstancePool(
    this.ionGeo,
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: projectileTexture("ion"),
      emissive: 0x3bdbe8,
      emissiveMap: projectileTexture("ion"),
      emissiveIntensity: 0.9,
      metalness: 0.42,
      roughness: 0.24,
      toneMapped: false,
      fog: false,
    }),
    16,
  );

  constructor(canvas: HTMLCanvasElement, settings: Settings, hooks: EngineHooks) {
    this.canvas = canvas;
    this.settings = { ...settings };
    this.hooks = hooks;
    this.reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    this.view = createArenaRenderer(canvas, settings.fov);
    this.arena = buildArena(this.view.scene, this.view.renderer);
    this.view.scene.add(this.fx.mesh);
    this.rockets.mesh.frustumCulled = false;
    this.ions.mesh.frustumCulled = false;
    this.view.scene.add(this.rockets.mesh, this.ions.mesh);
    this.view.scene.add(this.beamBatch.mesh);

    this.player = this.makeFighter("you", settings.name, 0xece8de, "#ece8de", true);
    this.fighters.push(this.player);
    this.spawn(this.player);

    for (let i = 0; i < 4; i++) {
      const bot = this.makeFighter(
        `bot${i}`,
        BOT_NAMES[i]!,
        BOT_COLORS[i]!,
        BOT_COLOR_CSS[i]!,
        false,
      );
      bot.skill = 0.72 + i * 0.07;
      bot.mesh = makeBotMesh(bot.color, i);
      this.view.scene.add(bot.mesh);
      this.fighters.push(bot);
      this.spawn(bot);
    }

    this.mountItems();

    this.input.attach(canvas);
    this.view.resize();
    window.addEventListener("resize", this.resize);

    document.addEventListener("pointerlockchange", this.onLock);
    this.bindControlsTest();
    this.audio.startDrone();
    this.setBotsVisible(this.settings.bots);
    this.credits = this.loadCredits();
    this.emitHud();
    debugSpool.info("engine", "arena lista", { bots: this.settings.bots, low: this.reducedMotion });
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.loop.start();
    this.view.renderer.setAnimationLoop(this.frame);
  }

  dispose() {
    this.disposed = true;
    this.running = false;
    this.view.renderer.setAnimationLoop(null);
    this.unlock();
    this.input.detach();
    window.removeEventListener("resize", this.resize);
    document.removeEventListener("pointerlockchange", this.onLock);
    this.audio.stopDrone();
    for (const chute of this.chutes.values()) {
      this.view.scene.remove(chute);
      chute.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        mesh.geometry?.dispose();
        const mat = mesh.material;
        if (mat && !Array.isArray(mat)) mat.dispose();
      });
    }
    this.chutes.clear();
    this.arena.dispose();
    this.fx.dispose();
    this.rockets.dispose();
    this.ions.dispose();
    this.beamBatch.dispose();
    this.rocketGeo.dispose();
    this.ionGeo.dispose();
    this.view.dispose();
    if (window.__controlsTest) delete window.__controlsTest;
  }

  setSettings(s: Settings) {
    const next = s.mode === "duel" ? { ...s, bots: 1, fragLimit: 8, arena: "pozo" as const } : s;
    this.settings = { ...next };
    this.view.setWorldFov(next.fov);
    this.audio.setVolume(next.volume);
    this.player.name = next.name || "Raven";
    this.setBotsVisible(next.bots);
  }

  private mountItems() {
    for (const pad of this.arena.items) {
      const mesh = makeItemMesh(pad.kind);
      mesh.position.set(pad.x, pad.y + 0.35, pad.z);
      this.view.scene.add(mesh);
      this.items.push({
        id: pad.id,
        kind: pad.kind,
        x: pad.x,
        y: pad.y,
        z: pad.z,
        respawn: pad.respawn,
        ready: true,
        readyAt: 0,
        mesh,
      });
    }
  }

  private clearItems() {
    for (const it of this.items) {
      this.view.scene.remove(it.mesh);
      it.mesh.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        obj.geometry.dispose();
        const m = obj.material;
        if (Array.isArray(m)) for (const mat of m) mat.dispose();
        else m.dispose();
      });
    }
    this.items = [];
  }

  private ensureArena(id: ArenaId) {
    const next: ArenaId = id === "cumbre" || id === "lave" ? id : "pozo";
    if (this.arenaId === next) return;
    this.clearItems();
    this.arena.dispose();
    this.arena =
      next === "cumbre"
        ? buildSummit(this.view.scene, this.view.renderer)
        : next === "lave"
          ? buildLave(this.view.scene, this.view.renderer)
          : buildArena(this.view.scene, this.view.renderer);
    this.arenaId = next;
    this.mountItems();
  }

  beginMatch() {
    this.audio.unlock();
    if (this.settings.mode === "duel") {
      this.settings = { ...this.settings, bots: 1, fragLimit: 8, arena: "pozo" };
    }
    this.setBotsVisible(this.settings.bots);
    try {
      this.ensureArena(this.settings.arena);
    } catch (err) {
      this.matchOn = false;
      this.countdown = null;
      this.setScreen("menu");
      debugSpool.error("engine.arena", err);
      return;
    }
    this.winner = null;
    this.matchOn = true;
    this.killFeed = [];
    this.roundSeconds = ROUND_SECONDS;
    this.score = 0;
    this.streak = 0;
    this.streakUntil = 0;
    this.firstBlood = true;
    this.countdown = 3;
    for (const f of this.fighters) {
      f.frags = 0;
      f.deaths = 0;
      this.resetLoadout(f);
      this.spawn(f);
    }
    this.setScreen("playing");
    const touch = (navigator.maxTouchPoints ?? 0) > 0 || window.matchMedia("(pointer: coarse)").matches;
    if (!touch) this.requestLock();
  }

  pause() {
    if (this.screen !== "playing") return;
    this.unlock();
    this.setScreen("paused");
  }

  resume() {
    if (this.screen !== "paused") return;
    this.setScreen("playing");
    const touch = (navigator.maxTouchPoints ?? 0) > 0 || window.matchMedia("(pointer: coarse)").matches;
    if (!touch) this.requestLock();
  }

  toMenu() {
    this.unlock();
    this.matchOn = false;
    this.countdown = null;
    this.winner = null;
    this.setScreen("menu");
  }

  requestLock() {
    const el = this.canvas as HTMLCanvasElement & {
      requestPointerLock: (opts?: { unadjustedMovement?: boolean }) => Promise<void> | void;
    };
    const done = () => this.audio.unlock();
    try {
      const p = el.requestPointerLock({ unadjustedMovement: true });
      if (p && typeof p.then === "function") p.catch(() => el.requestPointerLock()).finally(done);
      else done();
    } catch {
      try {
        el.requestPointerLock();
      } catch {
        /* mobile */
      }
      done();
    }
  }

  unlock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  setTouchFire(v: boolean) {
    this.input.fireHeld = v;
    if (v) this.input.fireClicked = true;
  }
  setTouchAim(v: boolean) {
    this.input.aimHeld = v;
  }
  setTouchReload() {
    this.input.reloadClicked = true;
  }
  setTouchGrenade() {
    this.input.grenadeClicked = true;
  }
  setTouchJump() {
    this.input.jumpClicked = true;
  }
  setTouchMove(x: number, y: number) {
    this.input.setTouchMove(x, y);
  }
  addTouchLook(dx: number, dy: number) {
    this.input.addLook(dx, dy);
  }
  cycleWeapon(dir: 1 | -1) {
    this.cycle(this.player, dir);
  }

  localNetworkSnapshot(): RemoteSnapshot {
    return localSnapshot(this.player);
  }

  addRemotePlayer(id: string, name: string) {
    const fighterId = `remote:${id}`;
    if (this.fighters.some((fighter) => fighter.id === fighterId)) return;
    const color = 0x7af0e0;
    const remote = this.makeFighter(fighterId, name || "Player", color, "#7af0e0", false, true);
    remote.mesh = makeBotMesh(color, this.fighters.length);
    this.view.scene.add(remote.mesh);
    this.fighters.push(remote);
    this.spawn(remote);
    remote.mesh.visible = true;
  }

  removeRemotePlayer(id: string) {
    const fighterId = `remote:${id}`;
    this.net.remove(id);
    const index = this.fighters.findIndex((fighter) => fighter.id === fighterId);
    if (index < 0) return;
    const fighter = this.fighters[index]!;
    if (fighter.mesh) this.view.scene.remove(fighter.mesh);
    this.fighters.splice(index, 1);
  }

  applyRemoteSnapshot(id: string, snapshot: RemoteSnapshot) {
    this.net.ingest(id, snapshot);
  }

  buyShopItem(_id: ShopItemId): boolean {
    return false;
  }

  private loadCredits() {
    try {
      const n = Number(localStorage.getItem(CREDITS_KEY) || "35");
      if (Number.isFinite(n)) return Math.max(0, Math.min(9999, Math.round(n)));
    } catch {
      /* ignore */
    }
    return 35;
  }

  private saveCredits() {
    try {
      localStorage.setItem(CREDITS_KEY, String(this.credits));
    } catch {
      /* ignore */
    }
  }

  private grant(credits: number, score: number, medal?: string) {
    this.credits += credits;
    this.score += score;
    this.saveCredits();
    if (medal) {
      this.pickupMsg = medal;
      this.pickupT = 1.8;
    }
  }

  private setScreen(s: Screen) {
    this.screen = s;
    this.hooks.onScreen(s);
  }

  private onLock = () => {
    this.locked = document.pointerLockElement === this.canvas;
    this.hooks.onLock(this.locked);
    if (!this.locked && this.hadLock && this.screen === "playing" && this.matchOn && this.countdown === null) {
      this.setScreen("paused");
    }
    this.hadLock = this.locked;
  };

  private resize = () => {
    this.view.resize();
  };

  private makeFighter(
    id: string,
    name: string,
    color: number,
    colorCss: string,
    isPlayer: boolean,
    isRemote = false,
  ): Fighter {
    const mag = { pulse: 40, scatter: 0, torpedo: 0, lance: 0, ion: 0 };
    const reserve = { pulse: 80, scatter: 0, torpedo: 0, lance: 0, ion: 0 };
    return {
      id,
      name,
      isPlayer,
      isRemote,
      color,
      colorCss,
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      yaw: 0,
      pitch: 0,
      health: 100,
      armor: 0,
      mag,
      reserve,
      owned: new Set<WeaponId>(["pulse"]),
      weapon: "pulse",
      lastShot: 0,
      reloadUntil: 0,
      alive: true,
      respawnAt: 0,
      protectUntil: 0,
      frags: 0,
      deaths: 0,
      grounded: false,
      wasGrounded: false,
      coyote: 0,
      jumpBuf: 0,
      landT: 0,
      height: PLAYER_H,
      mesh: null,
      wishX: 0,
      wishY: 0,
      wishJump: false,
      wantsFire: false,
      nextThink: 0,
      targetId: null,
      strafe: 1,
      wp: 0,
      skill: 0.6,
      powers: { rush: 0, blink: 0, volt: 0 },
      blinkCharges: 0,
      airJumps: 0,
      grenades: STARTING_GRENADES,
      portalUntil: 0,
      heatUntil: 0,
      gliding: false,
      dodgeUntil: 0,
      reactUntil: 0,
      strafeUntil: 0,
    };
  }

  private resetLoadout(f: Fighter) {
    f.owned = new Set(["pulse"]);
    f.weapon = "pulse";
    f.mag = { pulse: 40, scatter: 0, torpedo: 0, lance: 0, ion: 0 };
    f.reserve = { pulse: 80, scatter: 0, torpedo: 0, lance: 0, ion: 0 };
    f.health = 100;
    f.armor = 0;
    f.powers = { rush: 0, blink: 0, volt: 0 };
    f.blinkCharges = 0;
    f.airJumps = 0;
    f.grenades = STARTING_GRENADES;
  }

  private setBotsVisible(n: number) {
    let i = 0;
    for (const f of this.fighters) {
      if (f.isPlayer || f.isRemote) continue;
      const on = i < n;
      i++;
      if (!on && f.alive) {
        f.alive = false;
        f.respawnAt = 1e12;
      }
      if (on && f.respawnAt === 1e12) {
        this.resetLoadout(f);
        this.spawn(f);
      }
      if (f.mesh) f.mesh.visible = on && f.alive;
    }
  }

  private spawn(f: Fighter) {
    const others = this.fighters.filter((o) => o.alive && o !== f);
    let best = this.arena.spawns[0]!;
    let bestScore = -1;
    for (const s of this.arena.spawns) {
      let min = 999;
      for (const o of others) min = Math.min(min, Math.hypot(o.pos.x - s.x, o.pos.z - s.z));
      if (min > bestScore) {
        bestScore = min;
        best = s;
      }
    }
    f.pos.set(best.x, best.y, best.z);
    f.vel.set(0, 0, 0);
    f.yaw = best.yaw;
    f.pitch = 0;
    f.alive = true;
    f.health = 100;
    f.armor = Math.max(f.armor, 0);
    f.height = PLAYER_H;
    f.grounded = true;
    f.wasGrounded = true;
    f.landT = 0;
    f.powers = { rush: 0, blink: 0, volt: 0 };
    f.blinkCharges = 0;
    f.airJumps = 0;
    f.portalUntil = 0;
    f.gliding = false;
    f.heatUntil = 0;
    f.protectUntil = performance.now() / 1000 + 1.4;
    if (f.mesh) {
      resetFighterMesh(f.mesh);
      f.mesh.position.copy(f.pos);
      f.mesh.rotation.set(0, f.yaw, 0);
    }
  }

  private frame = (nowMs: number) => {
    if (this.disposed) return;
    try {
      const now = nowMs / 1000;
      const dt = this.loop.begin(nowMs);
      this.input.pollGamepad();
      this.loop.consumeFixed((step) => this.fixed(step, now));
      this.visuals(dt, now);
      this.view.render(this.screen === "playing" && this.player.alive);
      this.hudClock += dt;
      if (this.hudClock > 0.05) {
        this.hudClock = 0;
        this.emitHud();
      }
      this.input.endFrame();
    } catch (err) {
      if (this.frameFails < 24) {
        this.frameFails += 1;
        debugSpool.error("engine.frame", err, { n: this.frameFails });
      }
    }
  };

  private fixed(dt: number, now: number) {
    if (this.countdown !== null && this.screen === "playing") {
      this.countdown -= dt;
      if (this.countdown <= 0) this.countdown = null;
    }

    if (this.screen === "playing" && this.countdown === null && this.matchOn) {
      this.roundSeconds = Math.max(0, this.roundSeconds - dt);
      if (this.roundSeconds <= 0) this.finishRound();
    }

    if (this.screen === "playing" && this.countdown === null) {
      this.readPlayerInput(dt);
    } else if (this.screen !== "playing") {
      this.player.wishX = 0;
      this.player.wishY = 0;
      this.player.wishJump = false;
      this.player.wantsFire = false;
    }

    for (const f of this.fighters) {
      if (!f.isPlayer && !f.isRemote) this.thinkBot(f, now, dt);
      if (!f.alive) {
        if (!f.isRemote && this.matchOn && now >= f.respawnAt && f.respawnAt < 1e11) this.spawn(f);
        if (f.mesh && f.mesh.visible) {
          f.vel.y -= GRAVITY * dt;
          f.vel.x *= 0.92;
          f.vel.z *= 0.92;
          f.pos.x += f.vel.x * dt;
          f.pos.y += f.vel.y * dt;
          f.pos.z += f.vel.z * dt;
          if (f.pos.y < 0) {
            f.pos.y = 0;
            f.vel.y = 0;
          }
          f.mesh.position.copy(f.pos);
          animateFighter(f.mesh, {
            speed: 0,
            grounded: f.pos.y <= 0.05,
            velY: f.vel.y,
            pitch: 0,
            dt,
            firing: false,
            dead: true,
            land: 0,
            protect: false,
          });
        }
        continue;
      }
      if (f.isRemote) {
        const remoteId = f.id.startsWith("remote:") ? f.id.slice("remote:".length) : f.id;
        const snap = this.net.sample(remoteId, dt);
        if (snap) {
          f.pos.set(snap.x, snap.y, snap.z);
          f.yaw = snap.yaw;
          f.pitch = snap.pitch;
          f.health = snap.health;
          f.weapon = snap.weapon;
          f.alive = snap.alive;
        }
        if (f.mesh) {
          f.mesh.visible = f.alive;
          f.mesh.position.copy(f.pos);
          f.mesh.rotation.set(0, f.yaw, 0);
          animateFighter(f.mesh, { speed: 0, grounded: true, velY: 0, pitch: f.pitch, dt, firing: false, dead: !f.alive, land: 0, protect: false });
        }
        continue;
      }
      this.moveFighter(f, dt, now);
      this.pads(f);
      this.teleports(f, now);
      this.hazards(f, now);
      if (!f.alive) continue;
      this.pickItems(f, now);
      if (f.health > 100) f.health = Math.max(100, f.health - 10 * dt);
      if (f.wantsFire && this.countdown === null && this.screen !== "paused" && this.screen !== "ended") {
        if (f.isPlayer && this.screen !== "playing") {
          /* wait */
        } else {
          this.tryFire(f, now);
        }
      }
      if (f.mesh) {
        f.mesh.position.copy(f.pos);
        f.mesh.rotation.set(0, f.yaw, 0);
        const spd = Math.hypot(f.vel.x, f.vel.z);
        animateFighter(f.mesh, {
          speed: spd,
          grounded: f.grounded,
          velY: f.vel.y,
          pitch: f.pitch,
          dt,
          firing: now - f.lastShot < 0.12,
          dead: false,
          land: f.landT,
          protect: now < f.protectUntil,
        });
      }
    }
    this.separate();
    for (const f of this.fighters) {
      if (!f.alive) continue;
      const safe = depenetrate(f.pos.x, f.pos.y, f.pos.z, PLAYER_HW, f.height, this.arena.solids);
      f.pos.set(safe.x, safe.y, safe.z);
    }
    this.updateProjectiles(dt);
    this.beamBatch.update(dt);
    this.checkWinner();
  }

  private readPlayerInput(dt: number) {
    const look = this.input.consumeLook();
    const sens = 0.0022 * this.settings.sens;
    this.player.yaw -= look.dx * sens;
    this.swayX += look.dx * 0.00032;
    this.swayY += look.dy * 0.00028;
    this.player.pitch -= look.dy * sens;
    const lim = Math.PI / 2 - 0.01;
    this.player.pitch = Math.max(-lim, Math.min(lim, this.player.pitch));
    const mv = this.input.moveAxes();
    this.player.wishX = mv.x;
    this.player.wishY = mv.y;
    this.player.wishJump = this.input.jumping();
    this.player.wantsFire = this.input.fireHeld || this.input.fireClicked;
    if (this.input.reloadClicked) this.startReload(this.player, performance.now() / 1000);
    if (this.input.grenadeClicked) this.throwPixelGrenade(this.player);
    if (this.input.slot) {
      const id = WEAPON_ORDER[this.input.slot - 1];
      if (id && this.player.owned.has(id)) this.player.weapon = id;
    }
    if (this.input.nextWeapon) this.cycle(this.player, 1);
    if (this.input.prevWeapon) this.cycle(this.player, -1);
    this.player.jumpBuf = this.player.wishJump ? JUMP_BUF : Math.max(0, this.player.jumpBuf - dt);
  }

  private throwPixelGrenade(f: Fighter) {
    if (!f.isPlayer || f.grenades <= 0) return;
    const slot = this.rockets.spawn(f.pos.x, f.pos.y + this.eyeY, f.pos.z, 0x7af0ff);
    if (slot === null) return;
    this.lookVec(f, _look);
    const origin = new THREE.Vector3(f.pos.x, f.pos.y + this.eyeY, f.pos.z).addScaledVector(_look, 0.45);
    this.projectiles.push({
      pos: origin,
      vel: _look.clone().multiplyScalar(19).add(new THREE.Vector3(0, 6.2, 0)),
      owner: f.id,
      weapon: "torpedo",
      ttl: 1.5,
      dmg: 78,
      splash: 5.2,
      knock: 13,
      radius: 0.18,
      slot,
      pool: "rocket",
      pixel: true,
    });
    f.grenades -= 1;
    this.pickupMsg = `GRANADA PÍXEL · ${f.grenades} RESTANTES`;
    this.pickupT = 1.1;
    this.audio.fire("torpedo");
  }

  private cycle(f: Fighter, dir: 1 | -1) {
    const owned = WEAPON_ORDER.filter((w) => f.owned.has(w));
    if (!owned.length) return;
    const i = owned.indexOf(f.weapon);
    f.weapon = owned[(i + dir + owned.length) % owned.length]!;
  }

  private moveFighter(f: Fighter, dt: number, now: number) {
    const wantCrouch = f.isPlayer && this.input.crouching();
    if (wantCrouch) {
      f.height = CROUCH_H;
    } else if (f.height < PLAYER_H) {
      f.height = blockedAt(f.pos.x, f.pos.y, f.pos.z, PLAYER_HW, PLAYER_H, this.arena.solids)
        ? CROUCH_H
        : PLAYER_H;
    } else {
      f.height = PLAYER_H;
    }
    const crouch = f.height < PLAYER_H - 0.05;
    const rush = now < f.powers.rush;
    const yaw = f.yaw;
    _fwd.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    _right.set(Math.cos(yaw), 0, -Math.sin(yaw));
    _wish.copy(_fwd).multiplyScalar(f.wishY).addScaledVector(_right, f.wishX);
    const wishLen = _wish.length();
    if (wishLen > 1) _wish.multiplyScalar(1 / wishLen);
    const sprint = f.isPlayer && this.input.sprinting() && f.grounded && !crouch;
    const botDrive = !f.isPlayer ? 1.13 + f.skill * 0.07 : 1;
    const maxSp =
      (f.grounded ? MAX_GROUND : MAX_AIR) * (sprint ? SPRINT : 1) * botDrive * (crouch ? 0.58 : 1) * (rush ? 1.55 : 1);

    if (f.grounded) {
      f.coyote = COYOTE;
      f.airJumps = rush ? 1 : 0;
    } else f.coyote = Math.max(0, f.coyote - dt);
    if (!f.isPlayer) f.jumpBuf = f.wishJump ? JUMP_BUF : Math.max(0, f.jumpBuf - dt);

    f.wasGrounded = f.grounded;
    const wantJump = f.wishJump || f.jumpBuf > 0;
    const canJump = (f.grounded || f.coyote > 0) && wantJump;
    if (canJump) {
      f.vel.y = JUMP_VEL * (crouch ? 0.92 : 1) * (rush ? 1.08 : 1);
      f.grounded = false;
      f.coyote = 0;
      f.jumpBuf = 0;
      f.wishJump = false;
      if (f.isPlayer) {
        this.audio.jump();
        this.fovKick = 5;
      }
      this.fx.jump(f.pos.x, f.pos.y + 0.08, f.pos.z);
    } else if (!f.grounded && wantJump) {
      if (now < f.powers.blink && f.blinkCharges > 0) {
        this.blinkTo(f);
        f.jumpBuf = 0;
        f.wishJump = false;
      } else if (f.airJumps > 0) {
        f.airJumps -= 1;
        f.vel.y = JUMP_VEL * 0.9;
        f.jumpBuf = 0;
        f.wishJump = false;
        if (f.isPlayer) this.audio.jump();
        this.fx.boost(f.pos.x, f.pos.y + 0.2, f.pos.z);
      }
    }

    if (f.grounded && f.vel.y <= 0 && !canJump) {
      const speed = Math.hypot(f.vel.x, f.vel.z);
      if (speed > 0.05) {
        const drop = (speed < STOP_SPEED ? STOP_SPEED : speed) * FRICTION * dt;
        const ns = Math.max(0, speed - drop);
        const sc = ns / speed;
        f.vel.x *= sc;
        f.vel.z *= sc;
      } else {
        f.vel.x = 0;
        f.vel.z = 0;
      }
      this.accelerateWishOn(f, _wish, maxSp, GROUND_ACCEL, dt);
    } else {
      f.vel.y -= GRAVITY * dt;
      if (f.gliding) f.vel.y = Math.max(f.vel.y, -4.4);
      const wishSp = Math.min(maxSp, AIR_WISH_CAP * (rush ? 1.55 : 1));
      this.accelerateWishOn(f, _wish, wishSp, AIR_ACCEL, dt);
    }

    const prevVy = f.vel.y;
    const moved = moveBody(
      f.pos.x,
      f.pos.y,
      f.pos.z,
      f.vel.x,
      f.vel.y,
      f.vel.z,
      PLAYER_HW,
      f.height,
      dt,
      this.arena.solids,
      STEP_HEIGHT,
      GROUND_SNAP,
    );
    f.pos.set(moved.x, moved.y, moved.z);
    f.vel.set(moved.vx, moved.vy, moved.vz);
    f.grounded = moved.grounded;
    if (f.gliding && f.grounded) f.gliding = false;

    if (!f.wasGrounded && f.grounded) {
      const impact = Math.min(1, Math.abs(prevVy) / 14);
      f.landT = 0.14 + impact * 0.12;
      if (f.isPlayer) {
        this.landDip = 0.06 + impact * 0.12;
        this.shake.add(0.07 * impact);
        this.audio.land(impact > 0.4);
      }
      this.fx.dust(f.pos.x, f.pos.y + 0.05, f.pos.z, impact);
    }
    if (f.isPlayer && f.grounded) {
      const speed = Math.hypot(f.vel.x, f.vel.z);
      if (speed > 2.1 && now >= this.nextStepAt) {
        this.audio.step(speed, speed > 8.5 || rush);
        this.nextStepAt = now + Math.max(0.24, 0.46 - speed * 0.022);
      }
    } else if (f.isPlayer && !f.grounded) {
      this.nextStepAt = Math.min(this.nextStepAt, now + 0.08);
    }
    f.landT = Math.max(0, f.landT - dt);
    if (f.pos.y < -15) this.kill(f, null, "world", false);
  }

  private accelerateWishOn(f: Fighter, wish: THREE.Vector3, wishSp: number, accel: number, dt: number) {
    accelerateWish(f.vel, wish, wishSp, accel, dt);
  }

  private blinkTo(f: Fighter) {
    f.blinkCharges -= 1;
    this.lookVec(f, _look);
    const sx = f.pos.x;
    const sy = f.pos.y;
    const sz = f.pos.z;
    let nx = sx;
    let ny = sy;
    let nz = sz;
    const step = 0.9;
    for (let i = 0; i < 14; i++) {
      const tx = nx + _look.x * step;
      const ty = ny + _look.y * step * 0.35;
      const tz = nz + _look.z * step;
      if (blockedAt(tx, ty, tz, PLAYER_HW, f.height, this.arena.solids)) break;
      nx = tx;
      ny = ty;
      nz = tz;
    }
    f.pos.set(nx, ny, nz);
    f.vel.y = Math.max(f.vel.y, 2.2);
    f.grounded = false;
    this.fx.blink(sx, sy + 0.9, sz, POWER_META.blink.color);
    this.fx.blink(nx, ny + 0.9, nz, POWER_META.blink.color);
    this.spawnBeam(
      new THREE.Vector3(sx, sy + 1, sz),
      new THREE.Vector3(nx, ny + 1, nz),
      POWER_META.blink.color,
      0.16,
    );
    if (f.isPlayer) {
      this.audio.blink();
      this.fovKick = 8;
      this.shake.add(0.12);
    }
  }

  private chainVolt(from: Fighter, first: Fighter, dmg: number) {
    let best: Fighter | null = null;
    let bestD = 5.4;
    for (const o of this.fighters) {
      if (o === from || o === first || !o.alive) continue;
      const d = first.pos.distanceTo(o.pos);
      if (d < bestD) {
        bestD = d;
        best = o;
      }
    }
    if (!best) return;
    const a = first.pos.clone();
    a.y += first.height * 0.7;
    const b = best.pos.clone();
    b.y += best.height * 0.7;
    this.spawnBeam(a, b, POWER_META.volt.color, 0.14);
    this.fx.volt(b.x, b.y, b.z, POWER_META.volt.color);
    this.arena.lights.flash(b.x, b.y, b.z, POWER_META.volt.color, 12);
    _dir.subVectors(best.pos, first.pos).normalize();
    this.hurtFighter(best, dmg, from, from.weapon, _dir, 3.2, false);
  }

  private pads(f: Fighter) {
    const box = bodyBox(f.pos.x, f.pos.y, f.pos.z, PLAYER_HW, f.height);
    for (const p of this.arena.pads) {
      if (overlaps(box, p.aabb)) {
        f.vel.set(p.vx, p.vy, p.vz);
        f.grounded = false;
        f.gliding = false;
        if (f.isPlayer) this.audio.pad();
        const launched = moveBody(
          f.pos.x,
          f.pos.y,
          f.pos.z,
          f.vel.x,
          f.vel.y,
          f.vel.z,
          PLAYER_HW,
          f.height,
          1 / 120,
          this.arena.solids,
          STEP_HEIGHT,
          0,
        );
        f.pos.set(launched.x, launched.y, launched.z);
        f.vel.set(launched.vx, launched.vy, launched.vz);
        this.fx.pad(p.aabb.minX + (p.aabb.maxX - p.aabb.minX) * 0.5, f.pos.y, p.aabb.minZ + (p.aabb.maxZ - p.aabb.minZ) * 0.5);
      }
    }
  }

  private teleports(f: Fighter, now: number) {
    if (now < f.portalUntil) return;
    const box = bodyBox(f.pos.x, f.pos.y, f.pos.z, PLAYER_HW, f.height);
    for (const gate of this.arena.teleports ?? []) {
      if (!overlaps(box, gate.aabb)) continue;
      f.pos.set(gate.target.x, gate.target.y, gate.target.z);
      const safe = depenetrate(f.pos.x, f.pos.y, f.pos.z, PLAYER_HW, f.height, this.arena.solids);
      f.pos.set(safe.x, safe.y, safe.z);
      f.gliding = gate.chute === true;
      f.vel.set(0, f.gliding ? -1.6 : 0, 0);
      f.grounded = false;
      f.portalUntil = now + 1.1;
      if (gate.target.yaw !== undefined) f.yaw = gate.target.yaw;
      if (f.isPlayer) {
        this.audio.pad();
        this.fx.pad(gate.target.x, gate.target.y + 0.6, gate.target.z);
        if (f.gliding) {
          this.pickupMsg = "PARACAÍDAS";
          this.pickupT = 1.6;
        }
      }
      return;
    }
  }

  /** Riesgo ambiental ligero y telegráfico de Lave; cada zona golpea como máximo dos veces por segundo. */
  private hazards(f: Fighter, now: number) {
    if (now < f.heatUntil) return;
    for (const hazard of this.arena.hazards ?? []) {
      const dx = f.pos.x - hazard.x;
      const dz = f.pos.z - hazard.z;
      if (dx * dx + dz * dz > hazard.radius * hazard.radius) continue;
      f.heatUntil = now + 0.55;
      _dir.set(dx, 0.22, dz).normalize();
      this.hurtFighter(f, hazard.damage, null, "world", _dir, 1.4, false);
      this.fx.shotImpact(f.pos.x, f.pos.y + 0.7, f.pos.z, hazard.color, _dir.x, _dir.y, _dir.z, false, true);
      if (f.isPlayer) {
        this.pickupMsg = "FISURA TÉRMICA · MUÉVETE";
        this.pickupT = 0.45;
      }
      return;
    }
  }

  private pickItems(f: Fighter, now: number) {
    for (const it of this.items) {
      if (!it.ready) {
        if (now >= it.readyAt) {
          it.ready = true;
          it.mesh.visible = true;
        }
        continue;
      }
      const dx = f.pos.x - it.x;
      const dz = f.pos.z - it.z;
      const dy = f.pos.y + 0.9 - it.y;
      if (dx * dx + dz * dz + dy * dy > 1.35) continue;
      let taken = false;
      let msg = "";
      if (it.kind === "health" && f.health < 100) {
        f.health = Math.min(100, f.health + 25);
        taken = true;
        msg = "+25 SALUD";
      } else if (it.kind === "mega") {
        f.health = Math.max(f.health, 100) + 100;
        if (f.health > 200) f.health = 200;
        taken = true;
        msg = "MEGA";
      } else if (it.kind === "armor") {
        if (f.armor < 100) {
          f.armor = Math.min(100, f.armor + 50);
          taken = true;
          msg = "+50 ARMADURA";
        }
      } else if (it.kind === "ammo") {
        const w = f.weapon;
        f.reserve[w] = Math.min(WEAPON_META[w].reserve * 2, f.reserve[w] + WEAPON_META[w].mag);
        taken = true;
        msg = "MUNICION";
      } else if (isPower(it.kind)) {
        const p = it.kind;
        f.powers[p] = now + POWER_META[p].duration;
        if (p === "blink") f.blinkCharges = 3;
        if (p === "rush") f.airJumps = 1;
        taken = true;
        msg = POWER_META[p].label;
        if (f.isPlayer) this.audio.power();
      } else {
        const w = it.kind as WeaponId;
        const first = !f.owned.has(w);
        f.owned.add(w);
        f.reserve[w] = Math.min(WEAPON_META[w].reserve, f.reserve[w] + WEAPON_META[w].mag);
        if (f.mag[w] <= 0) f.mag[w] = WEAPON_META[w].mag;
        if (first) f.weapon = w;
        taken = true;
        msg = WEAPON_META[w].label;
      }
      if (taken) {
        it.ready = false;
        it.readyAt = now + it.respawn;
        it.mesh.visible = false;
        const col = isPower(it.kind) ? POWER_META[it.kind as PowerId].color : 0x7ff5e4;
        this.arena.lights.flash(it.x, it.y + 0.4, it.z, col, 9);
        this.fx.pickup(it.x, it.y + 0.4, it.z, col);
        if (f.isPlayer) {
          this.grant(6, 30);
          if (!isPower(it.kind)) this.audio.pickup();
          this.pickupMsg = msg;
          this.pickupT = 1.4;
        }
      }
    }
  }

  private lookVec(f: Fighter, out: THREE.Vector3) {
    const cy = Math.cos(f.pitch);
    out.set(-Math.sin(f.yaw) * cy, Math.sin(f.pitch), -Math.cos(f.yaw) * cy);
    return out;
  }

  private tryFire(f: Fighter, now: number) {
    const w = f.weapon;
    const meta = WEAPON_META[w];
    if (now < f.reloadUntil) return;
    if (now - f.lastShot < 60 / meta.rpm) return;
    if (f.mag[w] <= 0) {
      if (f.reserve[w] > 0) this.startReload(f, now);
      else if (f.isPlayer) this.audio.empty();
      return;
    }
    f.mag[w] -= 1;
    f.lastShot = now;
    const volt = now < f.powers.volt;
    const dmgMul = volt ? 1.45 : 1;
    if (f.isPlayer) {
      this.audio.fire(w);
      this.recoil += meta.kick * (volt ? 1.15 : 1);
      this.muzzle = volt ? 0.08 : 0.06;
      this.shake.add(meta.kick * (volt ? 2.8 : 2.2));
      this.arena.lights.setMuzzle(volt ? POWER_META.volt.color : meta.color, volt ? 16 : 10);
    }
    this.lookVec(f, _look);
    const eye = f.isPlayer ? this.eyeY : f.height * 0.88;
    _origin.copy(f.pos).add(new THREE.Vector3(0, eye, 0)).addScaledVector(_look, 0.35);
    this.fx.muzzle(_origin.x, _origin.y, _origin.z, _look.x, _look.y, _look.z, volt ? POWER_META.volt.color : meta.color);

    if (meta.kind === "hitscan") {
      let flashed = false;
      for (let i = 0; i < meta.pellets; i++) {
        _dir.copy(_look);
        if (meta.spread > 0) {
          _dir.x += (Math.random() * 2 - 1) * meta.spread;
          _dir.y += (Math.random() * 2 - 1) * meta.spread * 0.7;
          _dir.z += (Math.random() * 2 - 1) * meta.spread;
          _dir.normalize();
        }
        const hit = this.hitscan(_origin, _dir, meta.range, f.id);
        const shotColor = volt ? POWER_META.volt.color : meta.color;
        if (w === "lance" || w === "pulse" || volt || (w === "scatter" && !flashed)) {
          this.spawnBeam(_origin, hit.point, shotColor, w === "lance" ? 0.22 : 0.1);
        }
        this.fx.shotImpact(
          hit.point.x,
          hit.point.y,
          hit.point.z,
          shotColor,
          _dir.x,
          _dir.y,
          _dir.z,
          w === "lance",
          !flashed,
        );
        if (!flashed) {
          this.fx.pixelBurst(hit.point.x, hit.point.y, hit.point.z, shotColor, w === "lance" || w === "scatter" ? "blast" : "tick");
          this.arena.lights.flash(hit.point.x, hit.point.y, hit.point.z, shotColor, w === "lance" ? 18 : 8);
          flashed = true;
        }
        if (hit.fighter) {
          const head = hit.point.y > hit.fighter.pos.y + hit.fighter.height * 0.72;
          const dmg = meta.damage * dmgMul * (head ? 1.6 : 1);
          this.hurtFighter(hit.fighter, dmg, f, w, _dir, meta.knock, head);
          if (volt) this.chainVolt(f, hit.fighter, dmg * 0.4);
          if (f.isPlayer) this.hitmarker = 0.12;
        }
      }
    } else {
      const pool = w === "torpedo" ? this.rockets : this.ions;
      const key = w === "torpedo" ? "rocket" : "ion";
      const col = volt ? POWER_META.volt.color : meta.color;
      const pos = _origin.clone();
      if (w === "torpedo") pos.addScaledVector(_look, 0.95);
      const slot = pool.spawn(pos.x, pos.y, pos.z, col, w === "torpedo" ? 2.35 : 1);
      if (slot === null) return;
      this.projectiles.push({
        pos,
        vel: _look.clone().multiplyScalar(meta.speed),
        owner: f.id,
        weapon: w,
        ttl: 2.8,
        dmg: meta.damage * dmgMul,
        splash: meta.splash,
        knock: meta.knock,
        radius: w === "torpedo" ? 0.14 : 0.09,
        slot,
        pool: key,
        pixel: false,
      });
    }
    if (f.mag[w] <= 0 && f.reserve[w] > 0) this.startReload(f, now);
  }

  private startReload(f: Fighter, now: number) {
    const w = f.weapon;
    const meta = WEAPON_META[w];
    if (f.mag[w] >= meta.mag || f.reserve[w] <= 0) return;
    f.reloadUntil = now + meta.reload;
    const need = meta.mag - f.mag[w];
    const take = Math.min(need, f.reserve[w]);
    f.mag[w] += take;
    f.reserve[w] -= take;
  }

  private hitscan(origin: THREE.Vector3, dir: THREE.Vector3, range: number, skip: string) {
    let best = range;
    let fighter: Fighter | null = null;
    const point = origin.clone().addScaledVector(dir, range);
    const worldT = raycastWorld(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, best, this.arena.solids, 0);
    if (worldT !== null && worldT > 0.01 && worldT < best) {
      best = worldT;
      point.copy(origin).addScaledVector(dir, worldT);
    }
    for (const f of this.fighters) {
      if (!f.alive || f.id === skip) continue;
      const box = bodyBox(f.pos.x, f.pos.y, f.pos.z, PLAYER_HW, f.height);
      const t = rayAABB(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, box, best);
      if (t !== null && t > 0.05 && t < best) {
        best = t;
        fighter = f;
        point.copy(origin).addScaledVector(dir, t);
      }
    }
    return { dist: best, fighter, point };
  }

  private spawnBeam(from: THREE.Vector3, to: THREE.Vector3, color: number, life: number) {
    this.beamBatch.spawn(from, to, color, life);
  }

  private updateProjectiles(dt: number) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i]!;
      p.ttl -= dt;
      const prev = p.pos.clone();
      p.pos.addScaledVector(p.vel, dt);
      if (p.pixel) p.vel.y -= 11 * dt;
      else if (p.weapon === "torpedo") p.vel.y -= 6.5 * dt;
      _dir.copy(p.pos).sub(prev);
      const dist = _dir.length() || 0.001;
      _dir.multiplyScalar(1 / dist);
      const hit = this.hitscan(prev, _dir, dist + p.radius, p.owner);
      const wallT = raycastWorld(
        prev.x,
        prev.y,
        prev.z,
        _dir.x,
        _dir.y,
        _dir.z,
        dist + p.radius,
        this.arena.solids,
        p.radius,
      );
      let explode = p.ttl <= 0;
      let victim: Fighter | null = null;
      if (hit.fighter && hit.dist <= dist + p.radius) {
        explode = true;
        victim = hit.fighter;
      }
      if (wallT !== null && wallT <= dist) {
        explode = true;
        if (!victim || wallT < hit.dist) {
          victim = null;
          hit.point.copy(prev).addScaledVector(_dir, wallT);
        }
      }
      if (explode) {
        const at = victim || wallT !== null ? hit.point : p.pos;
        this.explode(at, p.dmg, p.splash, p.knock, p.owner, p.weapon, victim, p.pixel, p.weapon === "ion" && !p.pixel ? "spark" : "boom");
        (p.pool === "rocket" ? this.rockets : this.ions).hide(p.slot);
        this.projectiles.splice(i, 1);
      } else {
        (p.pool === "rocket" ? this.rockets : this.ions).move(
          p.slot,
          p.pos.x,
          p.pos.y,
          p.pos.z,
          p.vel.x,
          p.vel.y,
          p.vel.z,
          p.weapon === "torpedo" ? 2.35 : 1,
        );
        if (p.pixel) this.fx.pixelTrail(p.pos.x, p.pos.y, p.pos.z);
        else if (p.weapon === "ion") this.fx.bulletTrail(p.pos.x, p.pos.y, p.pos.z, WEAPON_META.ion.color);
        else if (p.weapon === "torpedo") this.fx.rocketTrail(p.pos.x, p.pos.y, p.pos.z, p.vel.x, p.vel.y, p.vel.z);
      }
    }
    this.rockets.flush();
    this.ions.flush();
  }

  private explode(
    at: THREE.Vector3,
    dmg: number,
    splash: number,
    knock: number,
    ownerId: string,
    weapon: WeaponId,
    direct: Fighter | null,
    pixel = false,
    style: "boom" | "spark" = "boom",
  ) {
    const color = pixel ? 0x7af0ff : WEAPON_META[weapon].color;
    if (pixel || style === "boom") this.fx.pixelBurst(at.x, at.y, at.z, color, "boom");
    else this.fx.pixelBurst(at.x, at.y, at.z, color, "tick");
    if (!pixel && style === "boom") this.fx.explode(at.x, at.y, at.z, color);
    this.arena.lights.flash(at.x, at.y, at.z, color, style === "spark" ? 10 : pixel ? 34 : 26);
    if (style === "spark") this.audio.hit();
    else this.audio.explode();
    this.shake.add(style === "spark" ? 0.04 : ownerId === this.player.id ? 0.35 : 0.12);
    const owner = this.fighters.find((f) => f.id === ownerId) ?? null;
    for (const f of this.fighters) {
      if (!f.alive) continue;
      const dx = f.pos.x - at.x;
      const dy = f.pos.y + f.height * 0.5 - at.y;
      const dz = f.pos.z - at.z;
      const dist = Math.hypot(dx, dy, dz);
      const isDirect = direct === f;
      if (!isDirect && dist > splash) continue;
      const fall = isDirect ? 1 : Math.max(0, 1 - dist / splash);
      let dealt = dmg * fall;
      if (f.id === ownerId) dealt *= 0.52;
      const kn = knock * fall * (f.id === ownerId ? 1.25 : 1);
      const nx = dist > 0.05 ? dx / dist : 0;
      const ny = dist > 0.05 ? Math.max(0.22, dy / dist) : 1;
      const nz = dist > 0.05 ? dz / dist : 0;
      const head = isDirect && at.y > f.pos.y + f.height * 0.72;
      this.hurtFighter(f, dealt * (head ? 1.6 : 1), owner, weapon, new THREE.Vector3(nx, ny, nz), kn, head);
    }
  }

  private hurtFighter(
    f: Fighter,
    amount: number,
    attacker: Fighter | null,
    weapon: WeaponId | "world",
    dir: THREE.Vector3,
    knock: number,
    headshot: boolean,
  ) {
    if (!f.alive) return;
    const now = performance.now() / 1000;
    if (now < f.protectUntil && attacker && attacker !== f) return;
    let dmg = amount;
    if (f.armor > 0) {
      const absorbed = Math.min(f.armor, dmg * 0.66);
      f.armor -= absorbed;
      dmg -= absorbed;
    }
    f.health -= dmg;
    f.vel.addScaledVector(dir, knock * 0.28);
    f.vel.y += knock * 0.06;
    if (f.isPlayer) {
      this.hurt = 0.35;
      this.shake.add(0.28);
      this.audio.hurt();
    } else {
      this.audio.hit();
      const mat = f.mesh?.userData.flashMat as THREE.MeshStandardMaterial | undefined;
      if (mat) mat.emissiveIntensity = 1.4;
      if (f.mesh) {
        crackFighter(f.mesh, Math.max(0, f.health) / 100);
        const last = (f.mesh.userData.lastGore as number) ?? 0;
        if (f.health > 0 && f.health < 70 && now - last > 0.16) {
          f.mesh.userData.lastGore = now;
          this.fx.flesh(f.pos.x, f.pos.y + f.height * 0.86, f.pos.z, false);
        }
      }
      if (attacker) {
        f.dodgeUntil = now + 0.9;
        f.strafe = -Math.sign(f.strafe || 1);
      }
    }
    if (f.health <= 0) this.kill(f, attacker, weapon, headshot);
  }

  private kill(f: Fighter, attacker: Fighter | null, weapon: WeaponId | "world", headshot: boolean) {
    if (!f.alive) return;
    f.alive = false;
    f.deaths += 1;
    f.health = 0;
    f.respawnAt = performance.now() / 1000 + 1.85;
    f.vel.y = Math.max(f.vel.y, 2.2);
    f.vel.x *= 1.15;
    f.vel.z *= 1.15;
    if (f.mesh) {
      f.mesh.visible = true;
      f.mesh.userData.deadT = 0;
      f.mesh.userData.breakPart = headshot
        ? "head"
        : (["armL", "armR", "legL", "legR"] as const)[Math.floor(Math.random() * 4)]!;
    }
    if (f.mesh) {
      shatterFighter(f.mesh);
      this.fx.flesh(f.pos.x, f.pos.y + f.height * 0.55, f.pos.z, true);
      this.fx.flesh(f.pos.x, f.pos.y + f.height * 0.9, f.pos.z, true);
    }
    this.fx.death(f.pos.x, f.pos.y + 1, f.pos.z, f.color);
    if (f.isPlayer) this.audio.death();
    else if (!attacker?.isPlayer) this.audio.down();
    if (attacker && attacker !== f) {
      attacker.frags += 1;
      if (attacker.isPlayer) {
        const now = performance.now() / 1000;
        if (now > this.streakUntil) this.streak = 0;
        this.streak += 1;
        this.streakUntil = now + 3.4;
        let cr = headshot ? 22 : 14;
        let pts = headshot ? 180 : 120;
        let medal = headshot ? "HEADSHOT" : "ELIMINACIÓN";
        if (this.firstBlood) {
          this.firstBlood = false;
          cr += 18;
          pts += 80;
          medal = "PRIMERA SANGRE · +BONO";
        }
        if (this.streak === 2) {
          cr += 16;
          pts += 70;
          medal = "DOBLE BAJA";
        } else if (this.streak === 3) {
          cr += 28;
          pts += 120;
          medal = "TRIPLE BAJA";
        } else if (this.streak >= 4) {
          cr += 36;
          pts += 160;
          medal = `MASACRE x${this.streak}`;
        }
        if (attacker.frags === 5) {
          cr += 25;
          medal = "RACHA x5";
        } else if (attacker.frags === 10) {
          cr += 45;
          medal = "RACHA x10";
        }
        this.grant(cr, pts, medal);
        this.audio.frag();
      }
    } else if (f.isPlayer) {
      f.frags = Math.max(0, f.frags - 1);
    }
    this.killFeed.unshift({
      id: ++this.feedSeq,
      attacker: attacker && attacker !== f ? attacker.name : f.name,
      victim: f.name,
      weapon,
      headshot,
    });
    this.killFeed = this.killFeed.slice(0, 5);
  }

  private checkWinner() {
    if (!this.matchOn || this.winner) return;
    for (const f of this.fighters) {
      if (f.frags >= this.settings.fragLimit) {
        this.winner = f.name;
        this.matchOn = false;
        if (f.isPlayer) {
          this.grant(140, 650, "CAMPEÓN");
        }
        this.unlock();
        this.setScreen("ended");
        try {
          if (f.isPlayer) {
            const prev = Number(localStorage.getItem(BEST_KEY) || "0");
            if (f.frags > prev) localStorage.setItem(BEST_KEY, String(f.frags));
          }
        } catch {
          /* ignore */
        }
      }
    }
  }

  private finishRound() {
    if (!this.matchOn) return;
    const ranked = [...this.fighters]
      .filter((f) => f.isPlayer || f.respawnAt !== 1e12)
      .sort((a, b) => b.frags - a.frags || a.deaths - b.deaths);
    this.winner = ranked[0]?.name ?? this.player.name;
    this.matchOn = false;
    if (ranked[0]?.isPlayer) {
      this.grant(140, 650, "CAMPEÓN · +140 CR");
    } else if (ranked[1]?.isPlayer) {
      this.grant(45, 180, "SUBCAMPEÓN · +45 CR");
    }
    this.unlock();
    this.setScreen("ended");
  }

  private separate() {
    for (let i = 0; i < this.fighters.length; i++) {
      const a = this.fighters[i]!;
      if (!a.alive) continue;
      for (let j = i + 1; j < this.fighters.length; j++) {
        const b = this.fighters[j]!;
        if (!b.alive) continue;
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const d = Math.hypot(dx, dz);
        const min = PLAYER_HW * 2.15;
        if (d < 0.001 || d >= min) continue;
        const overlapY = a.pos.y < b.pos.y + b.height && b.pos.y < a.pos.y + a.height;
        if (!overlapY) continue;
        const push = (min - d) * 0.5;
        const nx = dx / d;
        const nz = dz / d;
        a.pos.x -= nx * push;
        a.pos.z -= nz * push;
        b.pos.x += nx * push;
        b.pos.z += nz * push;
        const rvx = b.vel.x - a.vel.x;
        const rvz = b.vel.z - a.vel.z;
        const closing = rvx * nx + rvz * nz;
        if (closing < 0) {
          const bounce = closing * 0.35;
          a.vel.x += nx * bounce;
          a.vel.z += nz * bounce;
          b.vel.x -= nx * bounce;
          b.vel.z -= nz * bounce;
        }
      }
    }
  }

  private thinkBot(f: Fighter, now: number, _dt: number) {
    if (!f.alive) {
      f.wishX = 0;
      f.wishY = 0;
      f.wantsFire = false;
      return;
    }
    if (this.screen === "paused" || this.screen === "ended") {
      f.wishX = 0;
      f.wishY = 0;
      f.wantsFire = false;
      return;
    }
    if (now < f.nextThink) return;
    f.nextThink = now + 0.08 + (1 - f.skill) * 0.08;
    let target: Fighter | null = null;
    let best = 999;
    for (const o of this.fighters) {
      if (o === f || !o.alive) continue;
      const d = f.pos.distanceTo(o.pos);
      if (d < best) {
        best = d;
        target = o;
      }
    }
    if (target?.id !== f.targetId) f.reactUntil = now + 0.18 + (1 - f.skill) * 0.32;
    f.targetId = target?.id ?? null;
    const jitter = 0.045 + (1 - f.skill) * 0.12;

    if (f.gliding) {
      const x = target ? target.pos.x : 0;
      const z = target ? target.pos.z : 0;
      this.aimAt(f, x, f.pos.y, z, jitter * 0.25);
      f.wishY = 1;
      f.wishX = f.strafe * 0.7;
      f.wishJump = false;
      f.wantsFire = false;
      return;
    }

    if (target && target.pos.y > f.pos.y + 2.2) {
      const lift = this.liftRoute(f);
      const direct = Math.hypot(target.pos.x - f.pos.x, target.pos.z - f.pos.z);
      if (lift && lift.d < Math.max(8, direct * 0.9)) {
        this.routeBot(f, lift.x, lift.y, lift.z, jitter * 0.2);
        return;
      }
    }

    if (f.health < 58) {
      const pack = this.nearestReady(f, (kind) => kind === "health" || kind === "mega" || (kind === "armor" && f.armor < 40));
      if (pack && (!target || pack.dist < best * 0.85 || f.health < 32)) {
        this.routeBot(f, pack.x, pack.y, pack.z, jitter * 0.4);
        return;
      }
    }

    if (f.owned.size < 3) {
      const gear = this.nearestReady(f, (kind) => WEAPON_ORDER.includes(kind as WeaponId) && !f.owned.has(kind as WeaponId));
      if (gear && (!target || (!this.botSees(f, target, best) && gear.dist < best))) {
        this.routeBot(f, gear.x, gear.y, gear.z, jitter * 0.35);
        return;
      }
    }

    if (!target) {
      const roam = this.arena.waypoints[f.wp % this.arena.waypoints.length]!;
      this.routeBot(f, roam.x, roam.y, roam.z, 0.02);
      return;
    }

    const eye = f.pos.y + f.height * 0.88;
    const tEye = target.pos.y + target.height * 0.55;
    const lead = f.weapon === "torpedo" ? best / 29 : f.weapon === "ion" ? best / 34 : 0.04;
    const ax = target.pos.x + target.vel.x * lead;
    const ay = tEye + target.vel.y * lead * 0.35;
    const az = target.pos.z + target.vel.z * lead;
    const dy = target.pos.y - f.pos.y;
    const horiz = Math.hypot(target.pos.x - f.pos.x, target.pos.z - f.pos.z);
    const sees = this.botSees(f, target, best);

    if (!sees || Math.abs(dy) > 3.1) {
      this.routeBot(f, target.pos.x, target.pos.y, target.pos.z, jitter * 0.3);
      if (sees && Math.abs(dy) < 4.5) {
        this.aimAt(f, ax, ay, az, jitter);
        f.wantsFire = best < 28;
      }
      return;
    }

    this.pickBotWeapon(f, best);
    this.aimAt(f, ax, ay, az, jitter);
    _origin.set(f.pos.x, eye, f.pos.z);
    _dir.set(ax - f.pos.x, ay - eye, az - f.pos.z);
    const aimDot = _dir.normalize().dot(this.lookVec(f, _look));
    const hurt = f.health < 40;
    const dodging = now < f.dodgeUntil;
    f.wishY = dodging ? 0.25 : hurt ? -0.9 : best > 12 ? 1 : best < 3.8 ? -0.58 : 0.42;
    f.wishX = f.strafe * (dodging ? 1.25 : 0.95 + f.skill * 0.42);
    if (now > f.strafeUntil) {
      f.strafe = -Math.sign(f.strafe || 1);
      f.strafeUntil = now + 0.5 + Math.random() * 0.55;
    }
    f.wishJump = f.grounded && (
      dodging ||
      (dy > 0.72 && horiz < 8) ||
      (best < 13 && Math.random() < 0.16) ||
      (best > 19 && Math.random() < 0.07)
    );
    f.wantsFire = now >= f.reactUntil && aimDot > 0.93 - f.skill * 0.1 && best < WEAPON_META[f.weapon].range;
  }

  private botSees(f: Fighter, target: Fighter, dist: number) {
    const eye = f.pos.y + f.height * 0.88;
    const tEye = target.pos.y + target.height * 0.55;
    _origin.set(f.pos.x, eye, f.pos.z);
    _dir.set(target.pos.x - f.pos.x, tEye - eye, target.pos.z - f.pos.z);
    if (dist < 0.2) return true;
    _dir.multiplyScalar(1 / dist);
    const los = this.hitscan(_origin, _dir, dist, f.id);
    return los.fighter === target || los.dist > dist - 0.45;
  }

  private liftRoute(f: Fighter) {
    const spots: Array<{ x: number; z: number }> = [];
    for (const pad of this.arena.pads) {
      spots.push({ x: (pad.aabb.minX + pad.aabb.maxX) * 0.5, z: (pad.aabb.minZ + pad.aabb.maxZ) * 0.5 });
    }
    for (const gate of this.arena.teleports ?? []) {
      if (!gate.chute) continue;
      spots.push({ x: (gate.aabb.minX + gate.aabb.maxX) * 0.5, z: (gate.aabb.minZ + gate.aabb.maxZ) * 0.5 });
    }
    let best: { x: number; y: number; z: number; d: number } | null = null;
    for (const spot of spots) {
      const d = Math.hypot(spot.x - f.pos.x, spot.z - f.pos.z);
      if (d < 1.8 || d > 24) continue;
      if (!best || d < best.d) best = { x: spot.x, y: 0, z: spot.z, d };
    }
    return best;
  }

  private nearestReady(f: Fighter, match: (kind: string) => boolean) {
    let best: { x: number; y: number; z: number; dist: number } | null = null;
    for (const it of this.items) {
      if (!it.ready || !match(it.kind)) continue;
      const dist = Math.hypot(it.x - f.pos.x, it.z - f.pos.z) + Math.abs(it.y - f.pos.y) * 0.6;
      if (!best || dist < best.dist) best = { x: it.x, y: it.y, z: it.z, dist };
    }
    return best;
  }

  private routeBot(f: Fighter, tx: number, ty: number, tz: number, jitter: number) {
    const wps = this.arena.waypoints;
    let wp = wps[f.wp % wps.length]!;
    let score = Infinity;
    const gap = Math.abs(ty - f.pos.y);
    for (const cand of wps) {
      const step = Math.hypot(cand.x - f.pos.x, cand.z - f.pos.z) + Math.abs(cand.y - f.pos.y) * 0.8;
      const left = Math.hypot(tx - cand.x, tz - cand.z) + Math.abs(ty - cand.y) * (gap > 1.6 ? 2.4 : 1);
      const s = step * 0.55 + left;
      if (s < score) {
        score = s;
        wp = cand;
      }
    }
    const horiz = Math.hypot(wp.x - f.pos.x, wp.z - f.pos.z);
    const climb = wp.y - f.pos.y;
    this.aimAt(f, wp.x, f.pos.y + f.height * 0.9, wp.z, jitter);
    f.wishY = 1;
    f.wishX = horiz < 2.4 ? 0 : 0.34 * f.strafe;
    f.wantsFire = false;
    const canClimb = climb > 0.45 && climb < 2.4 && horiz < 4.2;
    const canBlink = f.blinkCharges > 0 && f.powers.blink > performance.now() / 1000 && climb > 2.2 && horiz < 9;
    f.wishJump = f.grounded ? canClimb || Math.random() < 0.075 : canBlink;
    if (horiz < 1.8 && Math.abs(climb) < 1.25) f.wp = (f.wp + 1) % wps.length;
  }

  private pickBotWeapon(f: Fighter, dist: number) {
    const prefer: WeaponId[] =
      dist < 6 ? ["scatter", "ion", "pulse", "torpedo", "lance"] : dist > 16 ? ["lance", "torpedo", "ion", "pulse", "scatter"] : ["torpedo", "ion", "lance", "scatter", "pulse"];
    for (const w of prefer) {
      if (f.owned.has(w) && (f.mag[w] > 0 || f.reserve[w] > 0)) {
        f.weapon = w;
        return;
      }
    }
  }

  private aimAt(f: Fighter, x: number, y: number, z: number, jitter = 0) {
    const dx = x - f.pos.x;
    const dz = z - f.pos.z;
    const dy = y - (f.pos.y + f.height * 0.88);
    const wantYaw = Math.atan2(-dx, -dz);
    let dyaw = wantYaw - f.yaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    const turn = Math.min(0.38, 0.16 + Math.max(0, 0.1 - jitter) * 1.4);
    f.yaw += dyaw * turn;
    const horiz = Math.hypot(dx, dz);
    const wantPitch = Math.atan2(dy, horiz);
    f.pitch += (wantPitch - f.pitch) * Math.min(0.82, turn);
    if (jitter) {
      f.yaw += (Math.random() * 2 - 1) * jitter;
      f.pitch += (Math.random() * 2 - 1) * jitter * 0.4;
    }
    const lim = Math.PI / 2 - 0.05;
    f.pitch = Math.max(-lim, Math.min(lim, f.pitch));
  }

  private syncChutes(now: number) {
    const live = new Set<string>();
    for (const f of this.fighters) {
      if (!f.gliding || !f.alive) continue;
      live.add(f.id);
      let chute = this.chutes.get(f.id);
      if (!chute) {
        const mat = new THREE.MeshStandardMaterial({
          color: 0x143832,
          emissive: 0x7ff5e4,
          emissiveIntensity: 0.95,
          roughness: 0.32,
          metalness: 0.42,
          side: THREE.DoubleSide,
        });
        const canopy = new THREE.Mesh(new THREE.ConeGeometry(1.5, 0.64, 8), mat);
        canopy.position.y = 0.2;
        const hoop = new THREE.Mesh(new THREE.TorusGeometry(1.18, 0.04, 6, 14), mat);
        hoop.rotation.x = Math.PI / 2;
        hoop.position.y = -0.08;
        chute = new THREE.Group();
        chute.add(canopy, hoop);
        this.view.scene.add(chute);
        this.chutes.set(f.id, chute);
      }
      chute.visible = true;
      chute.position.set(f.pos.x, f.pos.y + f.height + 0.9, f.pos.z);
      chute.rotation.y = f.yaw;
      chute.rotation.z = Math.sin(now * 1.6 + f.pos.x) * 0.07;
    }
    for (const [id, chute] of this.chutes) {
      if (!live.has(id)) chute.visible = false;
    }
  }

  private visuals(dt: number, now: number) {
    const { camera, renderer, gunRoot, gunCam, guns } = this.view;
    renderer.toneMappingExposure = this.arena.lights.tick(now, dt, this.reducedMotion, camera);
    this.arena.update?.(now, dt);
    this.fx.update(dt, camera);
    this.syncChutes(now);
    this.hitmarker = Math.max(0, this.hitmarker - dt);
    this.hurt = Math.max(0, this.hurt - dt);
    this.pickupT = Math.max(0, this.pickupT - dt);
    if (this.pickupT <= 0) this.pickupMsg = null;
    this.recoil *= Math.exp(-9 * dt);
    this.muzzle = Math.max(0, this.muzzle - dt);
    const targetFov = this.settings.fov * (this.input.aimHeld ? 0.84 : 1);
    camera.fov += (targetFov - camera.fov) * (1 - Math.exp(-14 * dt));
    camera.updateProjectionMatrix();
    this.eyeY += ((this.input.crouching() ? CROUCH_EYE : EYE) - this.eyeY) * (1 - Math.exp(-12 * dt));
    this.landDip += (0 - this.landDip) * (1 - Math.exp(-10 * dt));

    for (const it of this.items) {
      if (!it.ready) continue;
      const power = isPower(it.kind);
      const featured = it.mesh.userData.featuredPickup === true;
      it.mesh.rotation.y += dt * (featured ? 2.15 : power ? 2.4 : 1.6);
      it.mesh.position.y = it.y + 0.38 + Math.sin(now * (featured ? 3.6 : power ? 3.2 : 2) + it.x) * (featured ? 0.16 : power ? 0.12 : 0.08);
      if (power) it.mesh.rotation.x = Math.sin(now * 1.6 + it.z) * 0.25;
      if (featured) {
        const mat = it.mesh.userData.pickupMat as THREE.MeshStandardMaterial | undefined;
        if (mat) mat.emissiveIntensity = 1.38 + Math.sin(now * 5 + it.z) * 0.3;
        const s = 1 + Math.sin(now * 3.6 + it.x) * 0.045;
        it.mesh.scale.setScalar(s);
      }
    }

    const underground = this.screen === "playing" || this.screen === "paused";
    const depth = underground ? Math.max(0, Math.min(1, (-0.55 - this.player.pos.y) / 1.7)) : 0;
    this.audio.setCrypt(depth, dt);

    if (this.screen === "menu" || this.screen === "settings" || this.screen === "help" || this.screen === "ended") {
      this.orbitT += dt * 0.12;
      const r = 70;
      camera.position.set(Math.sin(this.orbitT) * r, 24, Math.cos(this.orbitT) * r);
      camera.lookAt(0, 2.2, 0);
      return;
    }

    const shake = this.reducedMotion ? { x: 0, y: 0, z: 0 } : this.shake.sample(dt, this.settings.shake);
    const spd = Math.hypot(this.player.vel.x, this.player.vel.z);
    const glide = this.reducedMotion ? 0 : 0.35 + 0.65 * Math.min(1, spd / 7);
    const floatX = Math.cos(now * 0.85) * 0.004 * glide;
    const floatY = Math.sin(now * 1.15) * 0.006 * glide;
    this.swayX *= Math.exp(-10 * dt);
    this.swayY *= Math.exp(-10 * dt);
    this.fovKick *= Math.exp(-7 * dt);
    const rushing = now < this.player.powers.rush;
    const wantFov = this.settings.fov + this.fovKick + (rushing ? 7 : 0);
    if (Math.abs(camera.fov - wantFov) > 0.05) {
      camera.fov = wantFov;
      camera.updateProjectionMatrix();
    }
    if (rushing && spd > 5) {
      this.fx.rush(this.player.pos.x, this.player.pos.y + 0.4, this.player.pos.z, POWER_META.rush.color);
    }

    camera.position.set(
      this.player.pos.x + shake.x,
      this.player.pos.y + this.eyeY + floatY * 0.35 + shake.y - this.landDip,
      this.player.pos.z + shake.z,
    );
    camera.quaternion.setFromEuler(new THREE.Euler(this.player.pitch, this.player.yaw, 0, "YXZ"));

    const rest = restPose(this.player.weapon);
    const ads = adsPose(this.player.weapon);
    this.adsT += ((this.input.aimHeld ? 1 : 0) - this.adsT) * (1 - Math.exp(-14 * dt));
    const t = this.adsT;
    gunRoot.scale.setScalar(1.62 - 0.42 * t);
    gunCam.fov = 42 - 6 * t;
    gunCam.updateProjectionMatrix();
    gunRoot.position.set(
      rest.x + (ads.x - rest.x) * t + floatX * (1 - t * 0.6) + this.swayX * 0.35 * (1 - t),
      rest.y + (ads.y - rest.y) * t + floatY * (1 - t * 0.5) - this.recoil * (0.42 - t * 0.2),
      rest.z + (ads.z - rest.z) * t - this.recoil * (0.7 - t * 0.25),
    );
    gunRoot.rotation.set(
      -0.04 * t + this.recoil * (0.28 - t * 0.16),
      0.02 * (1 - t) + floatX * 0.4,
      this.recoil * 0.06 * (1 - t),
    );
    for (const [id, g] of guns) {
      g.visible = id === this.player.weapon && this.player.alive && this.screen === "playing";
      g.traverse((obj) => {
        if (obj.name === "vm-sleeve") obj.visible = t < 0.45;
      });
      const muzzle = g.getObjectByName("muzzle");
      if (muzzle) {
        muzzle.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          const m = mesh.material as THREE.MeshBasicMaterial | undefined;
          if (m && m.opacity !== undefined) m.opacity = this.muzzle > 0 ? Math.min(1, this.muzzle * 8) : 0;
        });
        const flashScale = this.muzzle > 0 ? 0.85 + Math.random() * 0.55 : 0.01;
        muzzle.scale.setScalar(flashScale);
      }
    }
  }

  private emitHud() {
    const p = this.player;
    const w = p.weapon;
    const now = performance.now() / 1000;
    const hud: HudSnapshot = {
      health: Math.max(0, Math.round(p.health)),
      armor: Math.max(0, Math.round(p.armor)),
      ammo: p.mag[w],
      reserve: p.reserve[w],
      weapon: w,
      weapons: WEAPON_ORDER.filter((id) => p.owned.has(id)),
      frags: p.frags,
      deaths: p.deaths,
      fragLimit: this.settings.fragLimit,
      countdown: this.countdown === null ? null : Math.ceil(this.countdown),
      pickup: this.pickupMsg,
      hitmarker: this.hitmarker,
      hurt: this.hurt,
      killFeed: this.killFeed,
      scoreboard: this.fighters
        .filter((f) => f.isPlayer || this.fighters.filter((x) => !x.isPlayer).indexOf(f) < this.settings.bots)
        .map((f) => ({
          name: f.name,
          color: f.colorCss,
          frags: f.frags,
          deaths: f.deaths,
          isPlayer: f.isPlayer,
        }))
        .sort((a, b) => b.frags - a.frags || a.deaths - b.deaths),
      winner: this.winner,
      roundSeconds: Math.ceil(this.roundSeconds),
      credits: this.credits,
      score: this.score,
      grenades: p.grenades,
      aiming: this.input.aimHeld,
      streak: now < this.streakUntil ? this.streak : 0,
      locked: this.locked,
      yaw: p.yaw,
      speed: Math.hypot(p.vel.x, p.vel.z),
      alive: p.alive,
      powers: (["rush", "blink", "volt"] as PowerId[])
        .filter((id) => now < p.powers[id])
        .map((id) => ({
          id,
          label: POWER_META[id].label,
          t: Math.max(0, p.powers[id] - now) / POWER_META[id].duration,
          color: POWER_META[id].css,
        })),
    };
    this.hooks.onHud(hud);
  }

  private bindControlsTest() {
    const probe: ControlsProbe = {
      getYaw: () => this.player.yaw,
      getSpeed: () => Math.hypot(this.player.vel.x, this.player.vel.z),
      getPos: () => ({ x: this.player.pos.x, y: this.player.pos.y, z: this.player.pos.z }),
      setKeys: (codes: string[]) => {
        this.input.setInjected(codes);
        if (codes.length && this.screen !== "playing") this.beginMatch();
        this.countdown = null;
      },
    };
    window.__controlsTest = probe;
  }
}

declare global {
  interface Window {
    __controlsTest?: ControlsProbe;
  }
}
