import * as THREE from "three";
import { ArenaAudio } from "./audio";
import { buildArena, makeItemMesh, type ArenaData } from "./arena";
import { blockedAt, bodyBox, depenetrate, moveBody, overlaps, rayAABB, raycastWorld } from "./collision";
import {
  AIR_ACCEL,
  AIR_WISH_CAP,
  BEST_KEY,
  BOT_COLORS,
  BOT_COLOR_CSS,
  BOT_NAMES,
  COYOTE,
  CROUCH_EYE,
  CROUCH_H,
  EYE,
  FRICTION,
  GRAVITY,
  GROUND_ACCEL,
  GROUND_SNAP,
  JUMP_BUF,
  JUMP_VEL,
  MAX_ACCUM,
  MAX_AIR,
  MAX_GROUND,
  PLAYER_H,
  PLAYER_HW,
  POWER_META,
  SPRINT,
  STEP,
  STEP_HEIGHT,
  STOP_SPEED,
  WEAPON_META,
  WEAPON_ORDER,
  isPower,
} from "./constants";
import { animateFighter, makeBotMesh, resetFighterMesh } from "./fighterMesh";
import { ParticleField, TraumaShake } from "./fx";
import { BeamBatch, InstancePool } from "./instancing";
import { GameInput } from "./input";
import type { AABB, ControlsProbe, HudSnapshot, KillFeedItem, PowerId, Screen, Settings, WeaponId } from "./types";
import { buildViewmodel, restPose } from "./viewmodel";

const _look = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _wish = new THREE.Vector3();
const _origin = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _accDir = new THREE.Vector3();

type Fighter = {
  id: string;
  name: string;
  isPlayer: boolean;
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
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private gunScene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private gunCam: THREE.PerspectiveCamera;
  private audio = new ArenaAudio();
  private arena!: ArenaData;
  private fx = new ParticleField();
  private shake = new TraumaShake();
  private fighters: Fighter[] = [];
  private player!: Fighter;
  private projectiles: Proj[] = [];
  private beamBatch = new BeamBatch(24);
  private items: WorldItem[] = [];
  private guns = new Map<WeaponId, THREE.Group>();
  private gunRoot = new THREE.Group();
  private recoil = 0;
  private bob = 0;
  private eyeY = EYE;
  private acc = 0;
  private last = 0;
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
  private hudClock = 0;
  private muzzle = 0;
  private reducedMotion = false;
  private landDip = 0;
  private swayX = 0;
  private swayY = 0;
  private fovKick = 0;
  private rocketGeo = new THREE.SphereGeometry(0.12, 8, 8);
  private ionGeo = new THREE.SphereGeometry(0.08, 8, 8);
  private rockets = new InstancePool(
    this.rocketGeo,
    new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, fog: false }),
    16,
  );
  private ions = new InstancePool(
    this.ionGeo,
    new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, fog: false }),
    16,
  );

  constructor(canvas: HTMLCanvasElement, settings: Settings, hooks: EngineHooks) {
    this.canvas = canvas;
    this.settings = { ...settings };
    this.hooks = hooks;
    this.reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
      alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.setSize(canvas.clientWidth || 1, canvas.clientHeight || 1, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.32;
    this.renderer.autoClear = false;

    this.camera = new THREE.PerspectiveCamera(settings.fov, 1, 0.05, 420);
    this.gunCam = new THREE.PerspectiveCamera(42, 1, 0.04, 8);
    this.gunCam.layers.set(1);

    this.arena = buildArena(this.scene);
    this.scene.add(this.fx.mesh);
    this.scene.add(this.rockets.mesh, this.ions.mesh);
    this.scene.add(this.beamBatch.mesh);

    for (const id of WEAPON_ORDER) {
      const g = buildViewmodel(id);
      g.visible = false;
      this.guns.set(id, g);
      this.gunRoot.add(g);
    }
    this.gunScene.add(this.gunRoot);
    this.gunRoot.scale.setScalar(1.36);
    this.gunScene.add(new THREE.HemisphereLight(0xfff6ee, 0x1a1612, 0.55));
    const gl = new THREE.DirectionalLight(0xfff4e4, 2.85);
    gl.position.set(0.7, 1.25, 0.85);
    this.gunScene.add(gl);
    const grim = new THREE.DirectionalLight(0x7af0e0, 0.62);
    grim.position.set(-1.1, 0.25, -0.55);
    this.gunScene.add(grim);
    const gfill = new THREE.DirectionalLight(0xffc09a, 0.48);
    gfill.position.set(0.15, -0.7, 0.55);
    this.gunScene.add(gfill);
    const gtop = new THREE.DirectionalLight(0xf2f6ff, 0.5);
    gtop.position.set(0, 1.6, 0.2);
    this.gunScene.add(gtop);

    this.player = this.makeFighter("you", settings.name, 0xece8de, "#ece8de", true);
    this.fighters.push(this.player);
    this.spawn(this.player, true);

    for (let i = 0; i < 4; i++) {
      const bot = this.makeFighter(
        `bot${i}`,
        BOT_NAMES[i]!,
        BOT_COLORS[i]!,
        BOT_COLOR_CSS[i]!,
        false,
      );
      bot.skill = 0.45 + i * 0.12;
      bot.mesh = makeBotMesh(bot.color, i);
      this.scene.add(bot.mesh);
      this.fighters.push(bot);
      this.spawn(bot, true);
    }

    for (const pad of this.arena.items) {
      const mesh = makeItemMesh(pad.kind);
      mesh.position.set(pad.x, pad.y + 0.35, pad.z);
      this.scene.add(mesh);
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

    this.input.attach(canvas);
    this.resize();
    window.addEventListener("resize", this.resize);

    document.addEventListener("pointerlockchange", this.onLock);
    this.bindControlsTest();
    this.audio.startDrone();
    this.setBotsVisible(this.settings.bots);
    this.emitHud();
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.renderer.setAnimationLoop(this.frame);
  }

  dispose() {
    this.disposed = true;
    this.running = false;
    this.renderer.setAnimationLoop(null);
    this.unlock();
    this.input.detach();
    window.removeEventListener("resize", this.resize);
    document.removeEventListener("pointerlockchange", this.onLock);
    this.audio.stopDrone();
    this.arena.dispose();
    this.fx.dispose();
    this.rockets.dispose();
    this.ions.dispose();
    this.beamBatch.dispose();
    this.rocketGeo.dispose();
    this.ionGeo.dispose();
    this.renderer.dispose();
    if (window.__controlsTest) delete window.__controlsTest;
  }

  setSettings(s: Settings) {
    this.settings = { ...s };
    this.camera.fov = s.fov;
    this.camera.updateProjectionMatrix();
    this.audio.setVolume(s.volume);
    this.player.name = s.name || "Raven";
    this.setBotsVisible(s.bots);
  }

  beginMatch() {
    this.audio.unlock();
    this.winner = null;
    this.matchOn = true;
    this.killFeed = [];
    this.countdown = 3;
    for (const f of this.fighters) {
      f.frags = 0;
      f.deaths = 0;
      this.resetLoadout(f);
      this.spawn(f, true);
    }
    this.setScreen("playing");
    this.requestLock();
  }

  pause() {
    if (this.screen !== "playing") return;
    this.unlock();
    this.setScreen("paused");
  }

  resume() {
    if (this.screen !== "paused") return;
    this.setScreen("playing");
    this.requestLock();
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
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    this.gunCam.aspect = w / Math.max(1, h);
    this.gunCam.updateProjectionMatrix();
  };

  private makeFighter(
    id: string,
    name: string,
    color: number,
    colorCss: string,
    isPlayer: boolean,
  ): Fighter {
    const mag = { pulse: 40, scatter: 0, torpedo: 0, lance: 0, ion: 0 };
    const reserve = { pulse: 80, scatter: 0, torpedo: 0, lance: 0, ion: 0 };
    return {
      id,
      name,
      isPlayer,
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
  }

  private setBotsVisible(n: number) {
    let i = 0;
    for (const f of this.fighters) {
      if (f.isPlayer) continue;
      const on = i < n;
      i++;
      if (!on && f.alive) {
        f.alive = false;
        f.respawnAt = 1e12;
      }
      if (on && f.respawnAt === 1e12) {
        this.resetLoadout(f);
        this.spawn(f, true);
      }
      if (f.mesh) f.mesh.visible = on && f.alive;
    }
  }

  private spawn(f: Fighter, instant: boolean) {
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
    f.protectUntil = performance.now() / 1000 + 1.4;
    if (f.mesh) {
      resetFighterMesh(f.mesh);
      f.mesh.position.copy(f.pos);
      f.mesh.rotation.set(0, f.yaw, 0);
    }
  }

  private frame = (nowMs: number) => {
    if (this.disposed) return;
    const now = nowMs / 1000;
    let dt = (nowMs - this.last) / 1000;
    this.last = nowMs;
    dt = Math.min(dt, 0.1);
    this.acc += dt;
    if (this.acc > MAX_ACCUM) this.acc = MAX_ACCUM;
    this.input.pollGamepad();

    while (this.acc >= STEP) {
      this.fixed(STEP, now);
      this.acc -= STEP;
    }
    this.visuals(dt, now);
    this.render();
    this.hudClock += dt;
    if (this.hudClock > 0.05) {
      this.hudClock = 0;
      this.emitHud();
    }
    this.input.endFrame();
  };

  private fixed(dt: number, now: number) {
    if (this.countdown !== null && this.screen === "playing") {
      this.countdown -= dt;
      if (this.countdown <= 0) this.countdown = null;
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
      if (!f.isPlayer) this.thinkBot(f, now, dt);
      if (!f.alive) {
        if (this.matchOn && now >= f.respawnAt && f.respawnAt < 1e11) this.spawn(f, false);
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
      this.moveFighter(f, dt, now);
      this.pads(f);
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
    if (this.input.slot) {
      const id = WEAPON_ORDER[this.input.slot - 1];
      if (id && this.player.owned.has(id)) this.player.weapon = id;
    }
    if (this.input.nextWeapon) this.cycle(this.player, 1);
    if (this.input.prevWeapon) this.cycle(this.player, -1);
    this.player.jumpBuf = this.player.wishJump ? JUMP_BUF : Math.max(0, this.player.jumpBuf - dt);
    void dt;
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
    const maxSp =
      (f.grounded ? MAX_GROUND : MAX_AIR) * (sprint ? SPRINT : 1) * (crouch ? 0.58 : 1) * (rush ? 1.55 : 1);

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
      this.accelerate(f, _wish, maxSp, GROUND_ACCEL, dt);
    } else {
      f.vel.y -= GRAVITY * dt;
      const wishSp = Math.min(maxSp, AIR_WISH_CAP * (rush ? 1.55 : 1));
      this.accelerate(f, _wish, wishSp, AIR_ACCEL, dt);
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
    f.landT = Math.max(0, f.landT - dt);
    if (f.pos.y < -8) this.kill(f, null, "world", false);
  }

  private accelerate(f: Fighter, wish: THREE.Vector3, wishSp: number, accel: number, dt: number) {
    if (wishSp <= 0 || wish.lengthSq() < 0.0001) return;
    _accDir.copy(wish).normalize();
    const current = f.vel.x * _accDir.x + f.vel.z * _accDir.z;
    const add = wishSp - current;
    if (add <= 0) return;
    let acc = accel * dt * wishSp;
    if (acc > add) acc = add;
    f.vel.x += _accDir.x * acc;
    f.vel.z += _accDir.z * acc;
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
      if (blockedAt(tx, Math.max(0, ty), tz, PLAYER_HW, f.height, this.arena.solids)) break;
      nx = tx;
      ny = Math.max(0, ty);
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

  private chainVolt(from: Fighter, first: Fighter, dmg: number, now: number) {
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
    void now;
  }

  private pads(f: Fighter) {
    const box = bodyBox(f.pos.x, f.pos.y, f.pos.z, PLAYER_HW, f.height);
    for (const p of this.arena.pads) {
      if (overlaps(box, p.aabb)) {
        f.vel.set(p.vx, p.vy, p.vz);
        f.grounded = false;
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
        if (w === "lance" || w === "pulse" || volt) {
          this.spawnBeam(_origin, hit.point, volt ? POWER_META.volt.color : meta.color, w === "lance" ? 0.22 : 0.07);
        }
        const sparks = w === "lance" ? 10 : w === "scatter" ? 2 : 5;
        this.fx.impact(hit.point.x, hit.point.y, hit.point.z, volt ? POWER_META.volt.color : meta.color, w === "lance");
        if (!flashed) {
          this.arena.lights.flash(hit.point.x, hit.point.y, hit.point.z, volt ? POWER_META.volt.color : meta.color, w === "lance" ? 18 : 8);
          flashed = true;
        }
        if (hit.fighter) {
          const head = hit.point.y > hit.fighter.pos.y + hit.fighter.height * 0.72;
          const dmg = meta.damage * dmgMul * (head && w === "lance" ? 1.35 : 1);
          this.hurtFighter(hit.fighter, dmg, f, w, _dir, meta.knock, head && w === "lance");
          if (volt) this.chainVolt(f, hit.fighter, dmg * 0.4, now);
          if (f.isPlayer) this.hitmarker = 0.12;
        }
      }
    } else {
      const pool = w === "torpedo" ? this.rockets : this.ions;
      const key = w === "torpedo" ? "rocket" : "ion";
      const col = volt ? POWER_META.volt.color : meta.color;
      const slot = pool.spawn(_origin.x, _origin.y, _origin.z, col);
      if (slot === null) return;
      this.projectiles.push({
        pos: _origin.clone(),
        vel: _dir.copy(_look).multiplyScalar(meta.speed),
        owner: f.id,
        weapon: w,
        ttl: 2.8,
        dmg: meta.damage * dmgMul,
        splash: meta.splash,
        knock: meta.knock,
        radius: w === "torpedo" ? 0.14 : 0.09,
        slot,
        pool: key,
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
      if (p.weapon === "torpedo") p.vel.y -= 3.2 * dt;
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
        this.explode(at, p.dmg, p.splash, p.knock, p.owner, p.weapon, victim);
        (p.pool === "rocket" ? this.rockets : this.ions).hide(p.slot);
        this.projectiles.splice(i, 1);
      } else {
        (p.pool === "rocket" ? this.rockets : this.ions).move(p.slot, p.pos.x, p.pos.y, p.pos.z);
        if (p.weapon === "ion") this.fx.trail(p.pos.x, p.pos.y, p.pos.z, WEAPON_META.ion.color);
        else if (p.weapon === "torpedo") this.fx.trail(p.pos.x, p.pos.y, p.pos.z, WEAPON_META.torpedo.color);
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
  ) {
    this.fx.explode(at.x, at.y, at.z, WEAPON_META[weapon].color);
    this.arena.lights.flash(at.x, at.y, at.z, WEAPON_META[weapon].color, 26);
    this.audio.explode();
    this.shake.add(ownerId === this.player.id ? 0.35 : 0.12);
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
      this.hurtFighter(f, dealt, owner, weapon, new THREE.Vector3(nx, ny, nz), kn, false);
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
    }
    this.fx.death(f.pos.x, f.pos.y + 1, f.pos.z, f.color);
    this.audio.death();
    if (attacker && attacker !== f) {
      attacker.frags += 1;
      if (attacker.isPlayer) this.audio.frag();
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
    f.nextThink = now + 0.12 + Math.random() * 0.08;
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
    f.targetId = target?.id ?? null;
    if (f.health < 45) {
      const pack = this.items.find((it) => it.ready && (it.kind === "health" || it.kind === "mega"));
      if (pack) {
        this.aimAt(f, pack.x, pack.y + 0.4, pack.z);
        f.wishY = 1;
        f.wishX = 0;
        f.wishJump = Math.random() < 0.05;
        f.wantsFire = false;
        this.pickBotWeapon(f, best);
        return;
      }
    }
    if (!target) {
      const wp = this.arena.waypoints[f.wp % this.arena.waypoints.length]!;
      this.aimAt(f, wp.x, wp.y + 1, wp.z);
      f.wishY = 1;
      if (Math.hypot(f.pos.x - wp.x, f.pos.z - wp.z) < 1.6) f.wp += 1;
      return;
    }
    this.pickBotWeapon(f, best);
    const eye = f.pos.y + f.height * 0.88;
    const tEye = target.pos.y + target.height * 0.8;
    _origin.set(f.pos.x, eye, f.pos.z);
    _dir.set(target.pos.x - f.pos.x, tEye - eye, target.pos.z - f.pos.z);
    const dist = _dir.length();
    _dir.multiplyScalar(1 / Math.max(0.01, dist));
    const los = this.hitscan(_origin, _dir, dist, f.id);
    const sees = los.fighter === target || los.dist > dist - 0.4;
    this.aimAt(f, target.pos.x, tEye, target.pos.z, 0.12 + (1 - f.skill) * 0.2);
    if (sees) {
      f.wishY = dist > 11 ? 1 : dist < 3.2 ? -0.6 : 0.35;
      f.wishX = f.strafe * (0.7 + Math.random() * 0.3);
      if (Math.random() < 0.08) f.strafe *= -1;
      f.wishJump = Math.random() < 0.035 || (f.grounded && dist < 8 && Math.random() < 0.03);
      const aimDot = _dir.dot(this.lookVec(f, _look));
      f.wantsFire = aimDot > 0.88 - f.skill * 0.12;
    } else {
      const wp = this.arena.waypoints[f.wp % this.arena.waypoints.length]!;
      this.aimAt(f, wp.x, wp.y + 1, wp.z);
      f.wishY = 1;
      f.wishX = 0.2 * f.strafe;
      f.wantsFire = false;
      if (Math.hypot(f.pos.x - wp.x, f.pos.z - wp.z) < 1.8) f.wp = (f.wp + 1 + Math.floor(Math.random() * 3)) % this.arena.waypoints.length;
      f.wishJump = Math.random() < 0.05;
    }
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
    f.yaw += dyaw * 0.35;
    const horiz = Math.hypot(dx, dz);
    const wantPitch = Math.atan2(dy, horiz);
    f.pitch += (wantPitch - f.pitch) * 0.3;
    if (jitter) {
      f.yaw += (Math.random() * 2 - 1) * jitter;
      f.pitch += (Math.random() * 2 - 1) * jitter * 0.4;
    }
    const lim = Math.PI / 2 - 0.05;
    f.pitch = Math.max(-lim, Math.min(lim, f.pitch));
  }

  private visuals(dt: number, now: number) {
    this.renderer.toneMappingExposure = this.arena.lights.tick(now, dt, this.reducedMotion, this.camera);
    this.fx.update(dt, this.camera);
    this.hitmarker = Math.max(0, this.hitmarker - dt);
    this.hurt = Math.max(0, this.hurt - dt);
    this.pickupT = Math.max(0, this.pickupT - dt);
    if (this.pickupT <= 0) this.pickupMsg = null;
    this.recoil = Math.max(0, this.recoil - dt * 1.8);
    this.muzzle = Math.max(0, this.muzzle - dt);
    this.eyeY += ((this.input.crouching() ? CROUCH_EYE : EYE) - this.eyeY) * (1 - Math.exp(-12 * dt));
    this.landDip += (0 - this.landDip) * (1 - Math.exp(-10 * dt));

    for (const it of this.items) {
      if (!it.ready) continue;
      const power = isPower(it.kind);
      it.mesh.rotation.y += dt * (power ? 2.4 : 1.6);
      it.mesh.position.y = it.y + 0.38 + Math.sin(now * (power ? 3.2 : 2) + it.x) * (power ? 0.12 : 0.08);
      if (power) it.mesh.rotation.x = Math.sin(now * 1.6 + it.z) * 0.25;
    }

    if (this.screen === "menu" || this.screen === "settings" || this.screen === "help" || this.screen === "ended") {
      this.orbitT += dt * 0.12;
      const r = 70;
      this.camera.position.set(Math.sin(this.orbitT) * r, 24, Math.cos(this.orbitT) * r);
      this.camera.lookAt(0, 2.2, 0);
      return;
    }

    const shake = this.reducedMotion ? { x: 0, y: 0, z: 0 } : this.shake.sample(dt, this.settings.shake);
    const spd = Math.hypot(this.player.vel.x, this.player.vel.z);
    if (this.player.grounded && spd > 1.2) this.bob += dt * spd * 1.8;
    const bobX = Math.sin(this.bob) * 0.018 * (spd > 1 ? 1 : 0);
    const bobY = Math.abs(Math.sin(this.bob * 2)) * 0.02 * (spd > 1 ? 1 : 0);
    this.swayX *= Math.exp(-10 * dt);
    this.swayY *= Math.exp(-10 * dt);
    this.fovKick *= Math.exp(-7 * dt);
    const rushing = now < this.player.powers.rush;
    const wantFov = this.settings.fov + this.fovKick + (rushing ? 7 : 0);
    if (Math.abs(this.camera.fov - wantFov) > 0.05) {
      this.camera.fov = wantFov;
      this.camera.updateProjectionMatrix();
    }
    if (rushing && spd > 5) {
      this.fx.rush(this.player.pos.x, this.player.pos.y + 0.4, this.player.pos.z, POWER_META.rush.color);
    }

    this.camera.position.set(
      this.player.pos.x + shake.x,
      this.player.pos.y + this.eyeY + bobY + shake.y - this.landDip,
      this.player.pos.z + shake.z,
    );
    this.camera.quaternion.setFromEuler(new THREE.Euler(this.player.pitch, this.player.yaw, 0, "YXZ"));

    const rest = restPose(this.player.weapon);
    this.gunRoot.position.set(
      rest.x + bobX + this.swayX,
      rest.y - this.recoil * 0.85 + bobY - this.swayY,
      rest.z - this.recoil * 1.5,
    );
    this.gunRoot.rotation.set(this.recoil * 0.55 + this.swayY * 0.5, 0.05 + this.swayX * 0.6, this.recoil * 0.16);
    for (const [id, g] of this.guns) {
      g.visible = id === this.player.weapon && this.player.alive && this.screen === "playing";
      const muzzle = g.getObjectByName("muzzle") as THREE.Mesh | undefined;
      if (muzzle) {
        const m = muzzle.material as THREE.MeshBasicMaterial;
        m.opacity = this.muzzle > 0 ? 1 : 0;
      }
    }
  }

  private render() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    const bufW = Math.floor(w * this.renderer.getPixelRatio());
    const bufH = Math.floor(h * this.renderer.getPixelRatio());
    if (this.renderer.domElement.width !== bufW || this.renderer.domElement.height !== bufH) {
      this.resize();
    }
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    if (this.screen === "playing" && this.player.alive) {
      this.renderer.clearDepth();
      this.renderer.render(this.gunScene, this.gunCam);
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
