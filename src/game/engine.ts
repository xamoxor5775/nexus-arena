import * as THREE from "three";
import { ArenaAudio } from "./audio";
import { buildArena, makeItemMesh, type ArenaData } from "./arena";
import { projectileTexture, isLoDevice, isStruggling, pozoParachuteTexture, waitForTextureLoads } from "./textures";
import { buildLave } from "./lave";
import { buildLaberinto } from "./laberinto";
import { buildMoon } from "./moon";
import { buildSummit } from "./summit";
import { buildMar } from "./mar";
import { buildReactorArena } from "./reactor-arena";
import { preloadPozoSkyMoon } from "./pozoSkyMoon";
import { preloadPozoCatacombActors } from "./pozoCatacombActors";
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
  levelFromXp,
  prizeForPlace,
  MAX_AIR,
  MAX_GROUND,
  PLAYER_H,
  PLAYER_HW,
  CAREER_KEY,
  POWER_META,
  POWER_ORDER,
  PRIZE_LABEL,
  SKINS,
  TEAM_META,
  XP_PER_LEVEL,
  ROUND_SECONDS,
  SCOPE,
  STARTING_GRENADES,
  SPRINT,
  STEP_HEIGHT,
  STOP_SPEED,
  MELEE_ORDER,
  WEAPON_META,
  WEAPON_ORDER,
  isMelee,
  isPower,
  isWeaponId,
} from "./constants";
import { packViewportScale, preloadWeaponPack, setPackAim } from "./weaponPack";
import { preloadBotModels } from "./sentinelGltf";
import { animateFighter, crackFighter, makeBotMesh, resetFighterMesh, setFighterWeapon, shatterFighter } from "./fighterMesh";
import { ParticleField, TraumaShake } from "./fx";
import { BeamBatch, InstancePool } from "./instancing";
import { GameInput } from "./input";
import { FrameLoop } from "./loop";
import { localSnapshot, RemoteSync, type RemoteSnapshot } from "./network";
import { accelerateWish, blockedAt, bodyBox, depenetrate, moveBody, overlaps, rayAABB, raycastWorld } from "./physics";
import { normalizeQuality } from "./graphics";
import { createArenaRenderer, type ArenaRenderer } from "./renderer";
import type { ArenaId, ControlsProbe, HudSnapshot, KillFeedItem, PowerId, RoundPrize, Screen, Settings, ShopItemId, TeamId, ViewMode, WeaponId } from "./types";
import { adsPose, restPose } from "./viewmodel";
import { debugSpool } from "@/lib/debug-spool";

export type { RemoteSnapshot } from "./network";
import type { AcceptedHit, AcceptedKill } from "./pvp";

/** Kit per bot slot: Gladiador night-vision, Operadora scifi-polly, Ingeniero artloll, Nyx modern-soldier. */
const BOT_KITS = [11, 12, 13, 14] as const;
const _look = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _wish = new THREE.Vector3();
const _origin = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _crush = new THREE.Vector3();

/*
 * Tercera persona: cámara "sobre el hombro" detrás y por encima del jugador.
 * Offsets en metros, relativos a los ojos y a la orientación de la cámara.
 */
const TP_DIST = 3.1; // detrás de la cabeza
const TP_DIST_AIM = 1.8; // apuntando con clic derecho (armas sin telescopio)
const TP_SIDE = 0.62; // hacia el hombro derecho
const TP_UP = 0.34; // por encima de los ojos
const TP_PAD = 0.22; // margen que se deja contra paredes / techo
const TP_BODY_MIN = 0.8; // si la cámara queda más cerca, el cuerpo propio se oculta (taparía la mira)
const TP_AIM_RANGE = 260; // alcance del rayo cámara → mira para elegir el punto de impacto
/** Kit del cuerpo propio en tercera persona: modelo con rig animado y arma visible (no lo usan los bots). */
const PLAYER_KIT = 7;
const _tpBack = new THREE.Vector3();
const _tpRight = new THREE.Vector3();
const _tpWant = new THREE.Vector3();
const _tpEye = new THREE.Vector3();
const _tpRay = new THREE.Vector3();
const _tpTmp = new THREE.Vector3();
const _tpEuler = new THREE.Euler(0, 0, 0, "YXZ");

type Fighter = {
  id: string;
  name: string;
  isPlayer: boolean;
  isRemote: boolean;
  /** Peer id for remote humans (id without "remote:"), cached to avoid per-frame string slicing. */
  peerId: string;
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
  team: TeamId;
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
  threatId: string | null;
  threatUntil: number;
  holdUntil: number;
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

type LiveFlag = {
  team: TeamId;
  home: THREE.Vector3;
  pos: THREE.Vector3;
  carrierId: string | null;
  returnAt: number;
  mesh: THREE.Group;
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
  onArenaCycleStart?: (epochMs: number) => void;
  /** The local player hit a remote human: report it to the victim (victim-authoritative). */
  onRemoteHit?: (victimPeerId: string, hit: AcceptedHit) => void;
  /** The local player died: broadcast so every peer credits the killer. */
  onLocalDeath?: (death: { killer: string | null; killerName: string | null; weapon: WeaponId | "world"; headshot: boolean }) => void;
  /** The player pressed T: persist the new camera view in the settings store. */
  onViewMode?: (mode: ViewMode) => void;
};

const REMOTE_PREFIX = "remote:";
const peerIdOf = (f: Fighter) => f.peerId;
const _netDir = new THREE.Vector3();
/** Redraw interval of the (hidden) arena behind the opaque menu panel. */
const MENU_COVERED_FRAME_S = 0.25;

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
  private arenaCycleEpochMs: number | null = null;
  private fx = new ParticleField();
  private shake = new TraumaShake();
  private fighters: Fighter[] = [];
  private player!: Fighter;
  private projectiles: Proj[] = [];
  private beamBatch = new BeamBatch(24);
  private items: WorldItem[] = [];
  private flags: LiveFlag[] = [];
  private teamScore = { ion: 0, ember: 0 };
  private lastGun: WeaponId = "pulse";
  private recoil = 0;
  private eyeY = EYE;
  private running = false;
  private disposed = false;
  private screen: Screen = "menu";
  private locked = false;
  private hadLock = false;
  private countdown: number | null = null;
  /** True once entry frames are smooth enough for 3-2-1 to run. */
  private countdownLive = false;
  private countdownPaused = false;
  private steadyFrames = 0;
  private entryMark = 0;
  private entryHitchMs = 0;
  private entryReleased = false;
  private worldPrimed = false;
  /** Menu screens cover the canvas with an opaque panel: the world is redrawn only a few times per second. */
  private coveredAcc = 0;
  private wasCovered = false;
  private primeFrames = 0;
  private matchOn = false;
  private orbitT = 0.8;
  private pickupMsg: string | null = null;
  private pickupT = 0;
  private hitmarker = 0;
  private hurt = 0;
  private deathT = 0;
  private crushT = -1;
  private crushFrom = new THREE.Vector3();
  private killFeed: KillFeedItem[] = [];
  private feedSeq = 0;
  private winner: string | null = null;
  private endCuePlayed = false;
  private reloadCue: { at: number; weapon: WeaponId } | null = null;
  private roundSeconds = 0;
  private credits = 35;
  private score = 0;
  private careerXp = 0;
  private careerWins = 0;
  private nextPrize: RoundPrize | null = null;
  private prizeText: string | null = null;
  private leveled = false;
  private careerSettled = false;
  private hudClock = 0;
  private muzzle = 0;
  private chutes = new Map<string, THREE.Group>();
  private adsT = 0;
  private frameFails = 0;
  private streak = 0;
  private streakUntil = 0;
  private firstBlood = true;
  private reducedMotion = false;
  private remoteHumans = 0;
  private landDip = 0;
  private swayX = 0;
  private swayY = 0;
  private fovKick = 0;
  private scopeZoom: Partial<Record<WeaponId, number>> = {};
  /** Cuerpo propio (solo visible en tercera persona). No es f.mesh: así kill/spawn/bots no lo tocan. */
  private selfMesh: THREE.Group | null = null;
  /** 0 = primera persona, 1 = tercera persona (transición suave). */
  private tpBlend = 0;
  /** Fracción libre del brazo de cámara (colisión): baja de golpe, vuelve suave. */
  private tpFrac = 1;
  private tpDist = TP_DIST;
  /** Distancia real cámara-cabeza del último frame. */
  private tpCamDist = 0;
  /** Posición de cámara (sin temblor) del último frame: origen del rayo de la mira. */
  private tpCam = new THREE.Vector3();
  private tpPivot = new THREE.Vector3();
  private tpPivotReady = false;
  private laser!: THREE.Line;
  private laserDot!: THREE.Mesh;
  private nextStepAt = 0;
  private rocketGeo = new THREE.CapsuleGeometry(0.105, 0.32, 3, 8);
  private ionGeo = new THREE.CapsuleGeometry(0.038, 0.36, 2, 6);
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
    new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, fog: false }),
    24,
  );

  constructor(canvas: HTMLCanvasElement, settings: Settings, hooks: EngineHooks) {
    this.canvas = canvas;
    this.settings = { ...settings };
    this.hooks = hooks;
    this.reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    this.loadCareer();
    const skin = SKINS[settings.skin] ?? SKINS.cian;
    this.view = createArenaRenderer(canvas, settings.fov, skin.color, normalizeQuality(settings.quality));
    this.arena = buildArena(this.view.scene, this.view.renderer);
    this.view.applyQuality();
    // Roster models start after the arena images are already queued.
    preloadBotModels();
    this.view.scene.add(this.fx.mesh);
    this.rockets.mesh.frustumCulled = false;
    this.ions.mesh.frustumCulled = false;
    this.view.scene.add(this.rockets.mesh, this.ions.mesh);
    this.view.scene.add(this.beamBatch.mesh);
    this.mountLaser();

    this.player = this.makeFighter("you", settings.name, skin.color, skin.css, true);
    this.fighters.push(this.player);
    this.selfMesh = makeBotMesh(skin.color, PLAYER_KIT);
    this.selfMesh.visible = false;
    this.view.scene.add(this.selfMesh);
    this.spawn(this.player);

    for (let i = 0; i < 4; i++) {
      const bot = this.makeFighter(
        `bot${i}`,
        BOT_NAMES[i]!,
        BOT_COLORS[i]!,
        BOT_COLOR_CSS[i]!,
        false,
      );
      bot.skill = 0.8 + i * 0.06;
      // Gladiador: night-vision (11), Operadora: scifi-polly (12), Ingeniero: artloll (13), Nyx: modern-soldier (14)
      bot.mesh = makeBotMesh(bot.color, BOT_KITS[i] ?? i);
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
    this.applyBotCap();
    this.credits = this.loadCredits();
    try {
      const prev = this.arenaId;
      this.ensureArena(this.settings.arena);
      if (this.arenaId !== prev) {
        for (const f of this.fighters) this.spawn(f);
      }
    } catch (err) {
      debugSpool.error("engine.arena", err);
    }
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
    if (this.selfMesh) this.view.scene.remove(this.selfMesh);
    this.view.scene.remove(this.laser, this.laserDot);
    this.laser.geometry.dispose();
    (this.laser.material as THREE.Material).dispose();
    this.laserDot.geometry.dispose();
    (this.laserDot.material as THREE.Material).dispose();
    this.chutes.clear();
    this.clearFlags();
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
    const next = s.mode === "duel" ? { ...s, bots: 1, fragLimit: 8 } : s;
    this.settings = { ...next };
    this.view.setWorldFov(next.fov);
    this.view.setQuality(normalizeQuality(next.quality));
    this.audio.setVolume(next.volume);
    this.player.name = next.name || "Raven";
    const skin = SKINS[next.skin] ?? SKINS.cian;
    if (this.player.color !== skin.color) {
      this.player.color = skin.color;
      this.player.colorCss = skin.css;
      this.view.rebuildGuns(skin.color);
    }
    this.applyBotCap();
    if (this.screen !== "playing" && this.screen !== "paused" && next.arena !== this.arenaId) {
      try {
        this.ensureArena(next.arena);
        for (const f of this.fighters) this.spawn(f);
      } catch (err) {
        debugSpool.error("engine.arena", err);
      }
    }
  }

  async prepareArena(onProgress?: (value: number) => void) {
    onProgress?.(0.08);
    this.ensureArena(this.settings.arena);
    onProgress?.(0.22);
    const models = Promise.allSettled([
      preloadBotModels(),
      preloadWeaponPack(),
      ...(this.settings.arena === "pozo" ? [preloadPozoSkyMoon(), preloadPozoCatacombActors()] : []),
    ]);
    const modelDeadline = new Promise<void>((resolve) => window.setTimeout(resolve, 6500));
    await Promise.all([
      Promise.race([models.then(() => undefined), modelDeadline]),
      waitForTextureLoads(6500, (value) => onProgress?.(0.22 + value * 0.7)),
    ]);
    onProgress?.(1);
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
    const next: ArenaId =
      id === "mar" || id === "cumbre" || id === "lave" || id === "luna" || id === "laberinto" || id === "reactor" ? id : "pozo";
    if (this.arenaId === next) return;
    this.clearItems();
    this.clearFlags();
    this.arena.dispose();
    this.arena =
      next === "reactor"
        ? buildReactorArena(this.view.scene, this.view.renderer)
        : next === "mar"
        ? buildMar(this.view.scene, this.view.renderer)
        : next === "cumbre"
        ? buildSummit(this.view.scene, this.view.renderer)
        : next === "lave"
          ? buildLave(this.view.scene, this.view.renderer)
          : next === "luna"
            ? buildMoon(this.view.scene, this.view.renderer)
            : next === "laberinto"
              ? buildLaberinto(this.view.scene, this.view.renderer)
              : buildArena(this.view.scene, this.view.renderer);
    this.arenaId = next;
    if ((next === "mar" || next === "pozo" || next === "cumbre") && this.arenaCycleEpochMs !== null) {
      this.arena.startCycle?.(this.arenaCycleEpochMs);
    }
    this.mountItems();
    this.view.applyQuality();
  }

  private arenaG() {
    return this.arena.gravity ?? GRAVITY;
  }

  private arenaJump() {
    return this.arena.jumpVel ?? JUMP_VEL;
  }

  private inWater(f: Fighter) {
    for (const w of this.arena.water ?? []) {
      const dx = f.pos.x - w.x;
      const dz = f.pos.z - w.z;
      if (dx * dx + dz * dz > w.radius * w.radius) continue;
      const feet = f.pos.y;
      const head = f.pos.y + f.height;
      if (head > w.y && feet < w.y + w.height) return true;
    }
    return false;
  }

  private isCtf() {
    return this.settings.mode === "ctf";
  }

  private assignTeams() {
    this.player.team = "ion";
    let i = 0;
    for (const f of this.fighters) {
      if (f.isPlayer) continue;
      const on = this.fighters.filter((x) => !x.isPlayer).indexOf(f) < this.settings.bots;
      if (!on) {
        f.team = "ember";
        continue;
      }
      f.team = i % 2 === 0 ? "ion" : "ember";
      i++;
    }
  }

  private makeFlagMesh(team: TeamId) {
    const meta = TEAM_META[team];
    const g = new THREE.Group();
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.05, 2.2, 6),
      new THREE.MeshLambertMaterial({ color: 0xc8c4b8 }),
    );
    pole.position.y = 1.1;
    const cloth = new THREE.Mesh(
      new THREE.PlaneGeometry(0.95, 0.62),
      new THREE.MeshLambertMaterial({
        color: meta.color,
        emissive: meta.color,
        emissiveIntensity: 0.55,
        side: THREE.DoubleSide,
      }),
    );
    cloth.position.set(0.48, 1.72, 0);
    g.add(pole, cloth);
    return g;
  }

  private mountFlags() {
    this.clearFlags();
    if (!this.isCtf()) return;
    for (const pad of this.arena.flags ?? []) {
      const mesh = this.makeFlagMesh(pad.team);
      mesh.position.set(pad.x, pad.y, pad.z);
      this.view.scene.add(mesh);
      this.flags.push({
        team: pad.team,
        home: new THREE.Vector3(pad.x, pad.y, pad.z),
        pos: new THREE.Vector3(pad.x, pad.y, pad.z),
        carrierId: null,
        returnAt: 0,
        mesh,
      });
    }
  }

  private clearFlags() {
    for (const fl of this.flags) {
      this.view.scene.remove(fl.mesh);
      fl.mesh.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        obj.geometry.dispose();
        const m = obj.material;
        if (Array.isArray(m)) for (const mat of m) mat.dispose();
        else m.dispose();
      });
    }
    this.flags = [];
  }

  private flagAtHome(fl: LiveFlag) {
    return !fl.carrierId && fl.pos.distanceTo(fl.home) < 0.45;
  }

  beginMatch() {
    this.audio.unlock();
    if (this.settings.mode === "duel") {
      this.settings = { ...this.settings, bots: 1, fragLimit: 8 };
    }
    if (this.settings.mode === "ctf") {
      this.settings = { ...this.settings, arena: "luna", bots: Math.min(4, Math.max(3, this.settings.bots)) };
    }
    this.applyBotCap();
    try {
      this.ensureArena(this.settings.arena);
    } catch (err) {
      this.matchOn = false;
      this.countdown = null;
      this.setScreen("menu");
      debugSpool.error("engine.arena", err);
      return;
    }
    if (this.arenaId === "mar" || this.arenaId === "pozo" || this.arenaId === "cumbre") {
      const epochMs = Date.now();
      this.arenaCycleEpochMs = epochMs;
      this.arena.startCycle?.(epochMs);
      this.hooks.onArenaCycleStart?.(epochMs);
    }
    this.winner = null;
    this.endCuePlayed = false;
    this.reloadCue = null;
    this.matchOn = true;
    this.killFeed = [];
    this.roundSeconds = ROUND_SECONDS;
    this.score = 0;
    this.leveled = false;
    this.careerSettled = false;
    this.streak = 0;
    this.streakUntil = 0;
    this.firstBlood = true;
    this.teamScore = { ion: 0, ember: 0 };
    this.assignTeams();
    this.mountFlags();
    for (const f of this.fighters) {
      f.frags = 0;
      f.deaths = 0;
      this.resetLoadout(f);
      this.fullLoadout(f);
      this.spawn(f);
    }
    this.applyPrize();
    this.armEntryCountdown();
    this.setScreen("playing");
    const touch = (navigator.maxTouchPoints ?? 0) > 0 || window.matchMedia("(pointer: coarse)").matches;
    if (!touch) this.requestLock();
  }

  syncArenaCycleStart(epochMs: number) {
    if (!Number.isFinite(epochMs) || Math.abs(Date.now() - epochMs) > 15 * 60_000) return;
    this.arenaCycleEpochMs = epochMs;
    if (this.arenaId === "mar" || this.arenaId === "pozo" || this.arenaId === "cumbre") this.arena.startCycle?.(epochMs);
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
    this.endCuePlayed = false;
    this.reloadCue = null;
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
    const label = name || "Piloto";
    const existing = this.fighters.find((fighter) => fighter.id === fighterId);
    if (existing) {
      existing.name = label;
      return;
    }
    const color = 0x7af0e0;
    const remote = this.makeFighter(fighterId, label, color, "#7af0e0", false, true);
    // explicit remote kit: same as before (5, 6, then procedural) - never the bot roster models
    const slot = this.fighters.length;
    remote.mesh = makeBotMesh(color, slot >= 4 && slot <= 6 ? slot : slot % 4);
    this.view.scene.add(remote.mesh);
    this.fighters.push(remote);
    if (this.matchOn) this.fullLoadout(remote);
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

  /**
   * A remote human reports hitting the local player (already validated,
   * deduped and clamped by PvpInbox). We are authoritative over our own
   * health: hurtFighter ignores it when dead or respawn-protected, and a
   * lethal hit goes through kill() → onLocalDeath → `kill` broadcast.
   */
  applyNetworkHit(shooterPeerId: string, hit: AcceptedHit): boolean {
    if (!this.matchOn || !this.player.alive) return false;
    // Entry countdown (3-2-1, which may wait for smooth frames): the local
    // player is frozen and cannot fight back, so remote hits are ignored.
    if (this.countdown !== null) return false;
    const attacker = this.fighters.find((f) => f.id === `${REMOTE_PREFIX}${shooterPeerId}`);
    if (!attacker) return false;
    _netDir.set(hit.dir[0], hit.dir[1], hit.dir[2]);
    this.hurtFighter(this.player, hit.damage, attacker, hit.weapon, _netDir, hit.knock, hit.headshot);
    return true;
  }

  /** A remote human announced its own death: killfeed + frags on this client. */
  applyNetworkKill(kill: AcceptedKill): boolean {
    const victim = this.fighters.find((f) => f.id === `${REMOTE_PREFIX}${kill.victim}`);
    if (!victim) return false;
    let killer: Fighter | null = null;
    if (kill.killer === "self") killer = this.player;
    else if (kill.killer) killer = this.fighters.find((f) => f.id === `${REMOTE_PREFIX}${kill.killer}`) ?? null;
    // The victim's unreliable snapshot may already have flagged it dead; the
    // kill must still be credited exactly once, so run kill() regardless.
    victim.alive = true;
    this.kill(victim, killer, kill.weapon, kill.headshot, killer ? undefined : (kill.killerName ?? undefined));
    // Short guard so a late pre-death snapshot cannot revive the replica.
    victim.respawnAt = performance.now() / 1000 + 0.35;
    return true;
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
    if (s !== "playing" && s !== "paused" && this.settings.arena !== this.arenaId) {
      try {
        this.ensureArena(this.settings.arena);
        for (const f of this.fighters) this.spawn(f);
      } catch (err) {
        debugSpool.error("engine.arena", err);
      }
    }
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
    const mag = { pulse: 40, scatter: 0, torpedo: 0, lance: 0, ion: 0, fauces: 0, knife: 0, bate: 0, martillo: 0 };
    const reserve = { pulse: 80, scatter: 0, torpedo: 0, lance: 0, ion: 0, fauces: 0, knife: 0, bate: 0, martillo: 0 };
    return {
      id,
      name,
      isPlayer,
      isRemote,
      peerId: isRemote && id.startsWith(REMOTE_PREFIX) ? id.slice(REMOTE_PREFIX.length) : id,
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
      team: "ion",
      powers: { rush: 0, blink: 0, volt: 0, leap: 0 },
      blinkCharges: 0,
      airJumps: 0,
      grenades: STARTING_GRENADES,
      portalUntil: 0,
      heatUntil: 0,
      gliding: false,
      dodgeUntil: 0,
      reactUntil: 0,
      strafeUntil: 0,
      threatId: null,
      threatUntil: 0,
      holdUntil: 0,
    };
  }

  private loadCareer() {
    try {
      const raw = localStorage.getItem(CAREER_KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as { xp?: number; prize?: RoundPrize | null; wins?: number };
      this.careerXp = Math.max(0, data.xp ?? 0);
      this.careerWins = Math.max(0, data.wins ?? 0);
      this.nextPrize = data.prize ?? null;
      this.prizeText = data.prize ? PRIZE_LABEL[data.prize] : null;
    } catch {
      /* ignore */
    }
  }

  private saveCareer() {
    try {
      localStorage.setItem(CAREER_KEY, JSON.stringify({ xp: this.careerXp, prize: this.nextPrize, wins: this.careerWins }));
    } catch {
      /* ignore */
    }
  }

  private giveWeapon(f: Fighter, w: WeaponId) {
    if (isMelee(w)) {
      for (const melee of MELEE_ORDER) {
        if (melee !== w) f.owned.delete(melee);
      }
    }
    const meta = WEAPON_META[w];
    f.owned.add(w);
    f.mag[w] = meta.mag;
    f.reserve[w] = Math.max(f.reserve[w], meta.reserve);
    f.weapon = w;
    if (f.isPlayer && !isMelee(w)) this.lastGun = w;
  }

  private applyPrize() {
    const prize = this.nextPrize;
    if (!prize) return;
    this.nextPrize = null;
    this.prizeText = null;
    this.saveCareer();
    const p = this.player;
    const now = performance.now() / 1000;
    if (prize === "armor") p.armor = 50;
    else if (prize === "scatter") this.giveWeapon(p, "scatter");
    else if (prize === "torpedo") this.giveWeapon(p, "torpedo");
    else {
      p.powers.rush = now + 12;
      p.airJumps = 1;
    }
    this.pickupMsg = PRIZE_LABEL[prize].replace("Próxima ronda: ", "");
    this.pickupT = 2.4;
  }

  private closeRound(playerWon = false) {
    if (this.careerSettled) return;
    this.careerSettled = true;
    if (playerWon) this.careerWins += 1;
    const before = levelFromXp(this.careerXp);
    this.careerXp += Math.max(0, this.score);
    this.leveled = levelFromXp(this.careerXp) > before;
    const ranked = [...this.fighters]
      .filter((f) => f.isPlayer || f.respawnAt !== 1e12)
      .sort((a, b) => b.frags - a.frags || a.deaths - b.deaths);
    const place = Math.max(1, ranked.findIndex((f) => f.isPlayer) + 1);
    this.nextPrize = prizeForPlace(place);
    this.prizeText = PRIZE_LABEL[this.nextPrize];
    this.saveCareer();
  }

  private resetLoadout(f: Fighter) {
    f.owned = new Set(["pulse"]);
    f.weapon = "pulse";
    f.mag = { pulse: 40, scatter: 0, torpedo: 0, lance: 0, ion: 0, fauces: 0, knife: 0, bate: 0, martillo: 0 };
    f.reserve = { pulse: 80, scatter: 0, torpedo: 0, lance: 0, ion: 0, fauces: 0, knife: 0, bate: 0, martillo: 0 };
    f.health = 100;
    f.armor = 0;
    f.powers = { rush: 0, blink: 0, volt: 0, leap: 0 };
    f.blinkCharges = 0;
    f.airJumps = 0;
    f.grenades = STARTING_GRENADES;
  }

  private fullLoadout(f: Fighter) {
    const start: WeaponId[] = ["pulse", "scatter", "knife"];
    f.owned = new Set(start);
    f.weapon = "pulse";
    f.mag = { pulse: 0, scatter: 0, torpedo: 0, lance: 0, ion: 0, fauces: 0, knife: 0, bate: 0, martillo: 0 };
    f.reserve = { pulse: 0, scatter: 0, torpedo: 0, lance: 0, ion: 0, fauces: 0, knife: 0, bate: 0, martillo: 0 };
    for (const w of start) {
      f.mag[w] = WEAPON_META[w].mag;
      f.reserve[w] = WEAPON_META[w].reserve;
    }
  }

  setRemoteHumans(n: number) {
    this.remoteHumans = Math.max(0, Math.floor(n));
    this.applyBotCap();
  }

  private applyBotCap() {
    const humans = 1 + this.remoteHumans;
    let n = this.settings.bots;
    if (this.settings.mode === "duel") n = 1;
    else if (humans >= 2) n = Math.min(n, Math.max(0, 4 - humans));
    this.setBotsVisible(n);
  }

  private setBotsVisible(n: number) {
    let i = 0;
    for (const f of this.fighters) {
      if (f.isPlayer || f.isRemote) continue;
      const on = i < n;
      i++;
      if (!on && f.respawnAt !== 1e12) {
        // 1e12 marca "bot desactivado": spawn() lo ignora y el marcador lo oculta.
        f.alive = false;
        f.respawnAt = 1e12;
      }
      if (on && f.respawnAt === 1e12) {
        f.respawnAt = 0;
        this.resetLoadout(f);
        this.fullLoadout(f);
        this.spawn(f);
      }
      if (f.mesh) f.mesh.visible = on && f.alive;
    }
  }

  private spawn(f: Fighter) {
    // Bots desactivados por el tope (duelo / humanos remotos) no reaparecen.
    if (f.respawnAt === 1e12 && !f.isPlayer && !f.isRemote) return;
    const others = this.fighters.filter((o) => o.alive && o !== f);
    const teamPool = this.arena.spawns.filter((s) => s.team === f.team);
    const list = this.isCtf() && teamPool.length ? teamPool : this.arena.spawns;
    let best = list[0] ?? this.arena.spawns[0]!;
    let bestScore = -1;
    for (const s of list) {
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
    f.powers = { rush: 0, blink: 0, volt: 0, leap: 0 };
    f.blinkCharges = 0;
    f.airJumps = 0;
    f.portalUntil = 0;
    f.gliding = false;
    f.heatUntil = 0;
    f.protectUntil = performance.now() / 1000 + 1.4;
    if (f.isPlayer) {
      this.deathT = 0;
      this.crushT = -1;
      this.hurt = 0;
      this.eyeY = EYE;
      this.tpPivotReady = false;
      if (this.selfMesh) {
        resetFighterMesh(this.selfMesh);
        this.selfMesh.visible = false;
        this.selfMesh.position.copy(f.pos);
        this.selfMesh.rotation.set(0, f.yaw, 0);
      }
    }
    if (f.mesh) {
      resetFighterMesh(f.mesh);
      f.mesh.position.copy(f.pos);
      f.mesh.rotation.set(0, f.yaw, 0);
    }
  }

  private frame = (nowMs: number) => {
    if (this.disposed) return;
    const now = nowMs / 1000;
    const dt = this.loop.begin(nowMs);
    this.noteEntry(dt);
    try {
      this.input.pollGamepad();
      this.loop.consumeFixed((step) => this.fixed(step, now));
    } catch (err) {
      if (this.frameFails < 8) {
        this.frameFails += 1;
        debugSpool.error("engine.fixed", err, { n: this.frameFails });
      }
    }
    // Menu/Ajustes/Ayuda/Arsenal draw an opaque full-screen panel over the canvas, so rendering the
    // orbiting arena at full rate only burned GPU/CPU (menu lag, fans, slow UI on weak GPUs).
    // Keep the scene warm at ~4 fps there; the dynamic-resolution controller is not fed those frames.
    const covered = this.worldPrimed && this.menuCovered();
    let drawWorld = true;
    if (covered) {
      this.coveredAcc += dt;
      drawWorld = this.coveredAcc >= MENU_COVERED_FRAME_S;
      if (drawWorld) this.coveredAcc = 0;
      this.wasCovered = true;
    } else if (this.wasCovered) {
      this.wasCovered = false;
      this.coveredAcc = 0;
      this.view.resetFrameClock();
    }
    if (drawWorld) {
      try {
        this.visuals(covered ? MENU_COVERED_FRAME_S : dt, now);
      } catch (err) {
        if (this.frameFails < 8) {
          this.frameFails += 1;
          debugSpool.error("engine.visuals", err, { n: this.frameFails });
        }
      }
    }
    try {
      if (drawWorld) {
        this.view.render(this.screen === "playing" && this.player.alive && this.tpBlend < 0.3);
        if (!covered) this.view.noteFrame(dt);
      }
    } catch (err) {
      if (this.frameFails < 8) {
        this.frameFails += 1;
        debugSpool.error("engine.render", err, { n: this.frameFails });
      }
    }
    if (this.input.viewToggle && this.screen === "playing") this.toggleView();
    this.hudClock += dt;
    if (this.hudClock > 0.05) {
      this.hudClock = 0;
      try {
        this.emitHud();
      } catch {
        /* HUD no debe frenar el juego */
      }
    }
    this.input.endFrame();
  };

  private menuCovered() {
    return this.screen === "menu" || this.screen === "settings" || this.screen === "help" || this.screen === "skin";
  }

  /** Paint the player view once so the arena is on screen before 3-2-1 is visible. */
  private warmPlayerView() {
    const camera = this.view.camera;
    camera.position.set(this.player.pos.x, this.player.pos.y + this.eyeY, this.player.pos.z);
    camera.quaternion.setFromEuler(new THREE.Euler(this.player.pitch, this.player.yaw, 0, "YXZ"));
    camera.updateMatrixWorld();
    try {
      this.view.renderer.compile(this.view.scene, camera);
      this.view.renderer.compile(this.view.gunScene, this.view.gunCam);
      this.view.render(true);
    } catch (err) {
      debugSpool.error("engine.warm", err);
    }
  }

  private armEntryCountdown() {
    this.countdownLive = false;
    this.countdownPaused = false;
    this.steadyFrames = 0;
    this.entryHitchMs = 0;
    this.warmPlayerView();
    this.entryMark = performance.now();
    this.countdown = 3;
  }

  private releaseEntryLoad() {
    if (this.entryReleased) return;
    this.entryReleased = true;
    preloadWeaponPack();
    window.dispatchEvent(new CustomEvent("nexus-entry-warm"));
  }

  private noteEntry(dt: number) {
    if (!this.worldPrimed && this.screen !== "playing") {
      this.primeFrames += 1;
      if (this.primeFrames >= 2) {
        this.warmPlayerView();
        this.worldPrimed = true;
      }
    }
    if (this.countdown === null || this.screen !== "playing") {
      this.countdownPaused = false;
      return;
    }
    const hitch = dt > 0.05;
    if (!this.countdownLive) {
      this.steadyFrames = hitch ? 0 : this.steadyFrames + 1;
      if (this.steadyFrames >= 3 || performance.now() - this.entryMark > 2800) {
        this.countdownLive = true;
        this.releaseEntryLoad();
      }
      return;
    }
    if (hitch && this.entryHitchMs < 1500) {
      this.entryHitchMs += dt * 1000;
      this.countdownPaused = true;
    } else {
      this.countdownPaused = false;
    }
  }

  private fixed(dt: number, now: number) {
    if (this.countdown !== null && !this.countdownLive) return;
    if (this.countdown !== null && this.screen === "playing") {
      if (!this.countdownPaused) {
        this.countdown -= dt;
        if (this.countdown <= 0) this.countdown = null;
      }
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
      if (!f.isPlayer && !f.isRemote) {
        this.thinkBot(f, now, dt);
        if (this.arena.botLedgeGuard) this.guardLedge(f);
      }
      if (!f.alive) {
        if (f.isPlayer && this.crushT >= 0) {
          this.crushT += dt;
          f.pos.copy(this.crushPose(this.crushT));
          f.vel.set(0, 0, 0);
        }
        if (!f.isRemote && this.matchOn && now >= f.respawnAt && f.respawnAt < 1e11) this.spawn(f);
        if (f.isRemote) {
          // Respawn is victim-driven: revive the replica when its own snapshot says alive.
          // latest() no interpola ni asigna objetos: basta para saber si ya reapareció.
          const snap = this.net.latest(f.peerId);
          if (snap?.alive && now >= f.respawnAt) {
            f.alive = true;
            f.health = snap.health;
            f.vel.set(0, 0, 0);
            f.pos.set(snap.x, snap.y, snap.z);
            if (f.mesh) resetFighterMesh(f.mesh);
          }
        }
        if (f.alive) continue;
        if (f.isPlayer && this.crushT >= 0) {
          if (f.mesh && f.mesh.visible) {
            f.mesh.position.copy(f.pos);
            f.mesh.rotation.y += dt * 8;
          }
          continue;
        }
        f.vel.y -= this.arenaG() * (this.inWater(f) ? 0.38 : 1) * dt;
        f.vel.x *= Math.exp(-2.8 * dt);
        f.vel.z *= Math.exp(-2.8 * dt);
        const moved = moveBody(
          f.pos.x,
          f.pos.y,
          f.pos.z,
          f.vel.x,
          f.vel.y,
          f.vel.z,
          PLAYER_HW,
          Math.max(0.42, f.height * 0.45),
          dt,
          this.arena.solids,
          STEP_HEIGHT,
          GROUND_SNAP,
        );
        f.pos.set(moved.x, moved.y, moved.z);
        f.vel.set(moved.vx, moved.vy, moved.vz);
        if (f.pos.y < (this.arena.killY ?? -15)) {
          f.pos.y = this.arena.killY ?? -15;
          f.vel.y = 0;
        }
        if (f.mesh && f.mesh.visible) {
          f.mesh.position.copy(f.pos);
          animateFighter(f.mesh, {
            speed: 0,
            grounded: moved.grounded,
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
        const snap = this.net.sample(f.peerId, dt);
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
    this.tickFlags(now);
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

  private zoomFor(id: WeaponId) {
    const spec = SCOPE[id];
    if (!spec) return 1;
    return this.scopeZoom[id] ?? (spec.min + spec.max) * 0.5;
  }

  private mountLaser() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3));
    this.laser = new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({ color: 0xff3b32, transparent: true, opacity: 0.92 }),
    );
    this.laser.frustumCulled = false;
    this.laser.visible = false;
    this.laserDot = new THREE.Mesh(
      new THREE.CircleGeometry(0.055, 12),
      new THREE.MeshBasicMaterial({ color: 0xff2a22, depthTest: true }),
    );
    this.laserDot.visible = false;
    this.view.scene.add(this.laser, this.laserDot);
  }

  private readPlayerInput(dt: number) {
    if (!this.player.alive) {
      this.player.wishX = 0;
      this.player.wishY = 0;
      this.player.wishJump = false;
      this.player.wantsFire = false;
      this.player.jumpBuf = 0;
      return;
    }
    const look = this.input.consumeLook();
    const spec = SCOPE[this.player.weapon];
    const zooming = this.input.aimHeld && !!spec;
    const zoom = zooming ? this.zoomFor(this.player.weapon) : 1;
    const sens = (0.0022 * this.settings.sens * (this.input.aimHeld && !spec ? 0.72 : 1)) / zoom;
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
    if (this.reloadCue) {
      const cueNow = performance.now() / 1000;
      if (cueNow >= this.reloadCue.at) {
        if (cueNow - this.reloadCue.at < 0.5 && this.player.alive && this.player.weapon === this.reloadCue.weapon) this.audio.reloadDone();
        this.reloadCue = null;
      }
    }
    if (this.input.grenadeClicked) this.throwPixelGrenade(this.player);
    if (this.input.slot) {
      const id = WEAPON_ORDER[this.input.slot - 1];
      if (id && this.player.owned.has(id)) {
        this.player.weapon = id;
        this.lastGun = id;
      }
    }
    if (this.input.meleeToggle) {
      const melee = MELEE_ORDER.find((id) => this.player.owned.has(id));
      if (melee) {
        if (isMelee(this.player.weapon)) this.player.weapon = this.lastGun;
        else this.player.weapon = melee;
      }
    }
    if (zooming && spec && this.input.wheel) {
      const step = (spec.max - spec.min) / 6;
      const cur = this.zoomFor(this.player.weapon);
      const next = this.input.wheel < 0 ? Math.min(spec.max, cur + step) : Math.max(spec.min, cur - step);
      this.scopeZoom[this.player.weapon] = next;
    } else {
      if (this.input.nextWeapon || this.input.wheel > 0) this.cycle(this.player, 1);
      if (this.input.prevWeapon || this.input.wheel < 0) this.cycle(this.player, -1);
    }
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
    this.audio.grenade();
  }

  private cycle(f: Fighter, dir: 1 | -1) {
    const guns = WEAPON_ORDER.filter((w) => f.owned.has(w));
    const melee = MELEE_ORDER.find((w) => f.owned.has(w));
    const owned = melee ? [...guns, melee] : guns;
    if (!owned.length) return;
    const i = owned.indexOf(f.weapon);
    f.weapon = owned[(i + dir + owned.length) % owned.length]!;
    if (!isMelee(f.weapon)) this.lastGun = f.weapon;
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
    const leap = now < f.powers.leap;
    const yaw = f.yaw;
    _fwd.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    _right.set(Math.cos(yaw), 0, -Math.sin(yaw));
    _wish.copy(_fwd).multiplyScalar(f.wishY).addScaledVector(_right, f.wishX);
    const wishLen = _wish.length();
    if (wishLen > 1) _wish.multiplyScalar(1 / wishLen);
    const sprint = f.isPlayer && this.input.sprinting() && f.grounded && !crouch;
    const botDrive = !f.isPlayer ? Math.max(0.35, Math.min(1, this.settings.botSpeed ?? 0.58)) : 1;
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
      f.vel.y = this.arenaJump() * (crouch ? 0.92 : 1) * (rush ? 1.08 : 1) * (leap ? 1.72 : 1);
      f.grounded = false;
      f.coyote = 0;
      f.jumpBuf = 0;
      f.wishJump = false;
      if (leap) f.gliding = false;
      if (f.isPlayer) {
        this.audio.jump();
        this.fovKick = leap ? 9 : 5;
      }
      if (leap) this.fx.boost(f.pos.x, f.pos.y + 0.2, f.pos.z);
      this.fx.jump(f.pos.x, f.pos.y + 0.08, f.pos.z);
    } else if (!f.grounded && wantJump) {
      if (now < f.powers.blink && f.blinkCharges > 0) {
        this.blinkTo(f);
        f.jumpBuf = 0;
        f.wishJump = false;
      } else if (f.airJumps > 0) {
        f.airJumps -= 1;
        f.vel.y = this.arenaJump() * 0.9;
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
      const wet = this.inWater(f);
      f.vel.y -= this.arenaG() * (wet ? 0.38 : 1) * dt;
      if (wet) {
        f.vel.x *= Math.exp(-1.7 * dt);
        f.vel.z *= Math.exp(-1.7 * dt);
        if (f.vel.y < -3.4) f.vel.y = -3.4;
      }
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
    if (f.pos.y < (this.arena.killY ?? -15)) this.kill(f, null, "world", false);
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
        f.gliding = p.chute === true;
        if (f.isPlayer) {
          this.audio.pad();
          if (p.chute) {
            this.pickupMsg = "PARACAÍDAS";
            this.pickupT = 1.4;
          }
        }
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

  /** Fisura térmica: lava que quema al pisarla. Se puede saltar por encima. */
  private insideHazard(f: Fighter, hazard: { x: number; y: number; z: number; radius: number; hx?: number; hz?: number }) {
    if (f.pos.y > hazard.y + 1.15) return false;
    const dx = f.pos.x - hazard.x;
    const dz = f.pos.z - hazard.z;
    if (hazard.hx && hazard.hz) return Math.abs(dx) <= hazard.hx && Math.abs(dz) <= hazard.hz;
    return dx * dx + dz * dz <= hazard.radius * hazard.radius;
  }

  private hazards(f: Fighter, now: number) {
    if (now < f.heatUntil) return;
    for (const hazard of this.arena.hazards ?? []) {
      if (!this.insideHazard(f, hazard)) continue;
      if (hazard.crush) {
        this.crushFighter(f, hazard.x, hazard.y, hazard.z);
        return;
      }
      f.heatUntil = now + 0.42;
      const dx = f.pos.x - hazard.x;
      const dz = f.pos.z - hazard.z;
      _dir.set(dx || 0.15, 0.55, dz || 0.1).normalize();
      f.vel.x += _dir.x * 3.4;
      f.vel.z += _dir.z * 3.4;
      f.vel.y = Math.max(f.vel.y, 3.6);
      this.hurtFighter(f, hazard.damage, null, "world", _dir, 2.2, false);
      this.fx.boost(f.pos.x, f.pos.y + 0.2, f.pos.z);
      this.fx.burnSmoke(f.pos.x, f.pos.y + 0.35, f.pos.z);
      this.fx.shotImpact(f.pos.x, f.pos.y + 0.55, f.pos.z, hazard.color, _dir.x, _dir.y, _dir.z, false, true);
      if (f.isPlayer) {
        this.pickupMsg = hazard.label ?? "LAVA · TE QUEMAS";
        this.pickupT = 0.85;
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
        const meta = isWeaponId(w) ? WEAPON_META[w] : undefined;
        if (!meta) continue;
        f.reserve[w] = Math.min(meta.reserve * 2, (f.reserve[w] ?? 0) + meta.mag);
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
      } else if (isWeaponId(it.kind)) {
        const w = it.kind;
        const meta = WEAPON_META[w];
        const first = !f.owned.has(w);
        f.owned.add(w);
        f.reserve[w] = Math.min(meta.reserve, (f.reserve[w] ?? 0) + meta.mag);
        if ((f.mag[w] ?? 0) <= 0) f.mag[w] = meta.mag;
        if (first) f.weapon = w;
        taken = true;
        msg = meta.label;
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
    if (f.isPlayer && f.alive && this.tpBlend > 0.001) this.aimThroughCrosshair(f, out);
    return out;
  }

  /**
   * Tercera persona: la mira está en el centro de la pantalla, pero los ojos no
   * están en la cámara. Lanza un rayo desde la cámara por la mira (arena + rivales),
   * toma el punto de impacto y deja `look` apuntando de los ojos a ese punto, para que
   * balas, proyectiles, granadas y blink vayan donde marca la mira.
   */
  private aimThroughCrosshair(f: Fighter, look: THREE.Vector3) {
    _tpEye.set(f.pos.x, f.pos.y + this.eyeY, f.pos.z);
    // Arranca el rayo a la altura de la cabeza: lo que hay entre la cámara y el jugador no cuenta.
    const t0 = Math.max(0, _tpTmp.subVectors(_tpEye, this.tpCam).dot(look));
    _tpRay.copy(this.tpCam).addScaledVector(look, t0);
    const hit = this.hitscan(_tpRay, look, TP_AIM_RANGE, f.id);
    _tpTmp.subVectors(hit.point, _tpEye);
    const d = _tpTmp.length();
    // Muy cerca (pegado a una pared) la corrección se vuelve inestable: se dispara recto.
    if (d > 1.2) look.copy(_tpTmp).multiplyScalar(1 / d);
  }

  private thirdPerson() {
    return this.settings.viewMode === "third";
  }

  private toggleView() {
    const next: ViewMode = this.thirdPerson() ? "first" : "third";
    this.settings = { ...this.settings, viewMode: next };
    this.pickupMsg = next === "third" ? "VISTA · TERCERA PERSONA" : "VISTA · PRIMERA PERSONA";
    this.pickupT = 1.2;
    this.hooks.onViewMode?.(next);
  }

  /** Visual muzzle point: the third-person body's gun when it is on screen, else the eye origin. */
  private shotFrom(f: Fighter, origin: THREE.Vector3, look: THREE.Vector3, out: THREE.Vector3) {
    out.copy(origin);
    if (!f.isPlayer || this.tpBlend < 0.5 || !this.selfMesh?.visible) return out;
    const gun = this.selfMesh.getObjectByName("worldGun");
    if (!gun || !gun.visible) return out;
    gun.getWorldPosition(out).addScaledVector(look, 0.22);
    return out;
  }

  private tryFire(f: Fighter, now: number) {
    const w = f.weapon;
    const meta = isWeaponId(w) ? WEAPON_META[w] : undefined;
    if (!meta) return;
    if (meta.kind === "melee") {
      if (now - f.lastShot < 60 / meta.rpm) return;
      f.lastShot = now;
      this.swingMelee(f, w);
      return;
    }
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
    const fxFrom = this.shotFrom(f, _origin, _look, new THREE.Vector3());
    if (w === "ion" && !volt) this.fx.ionMuzzle(fxFrom.x, fxFrom.y, fxFrom.z, _look.x, _look.y, _look.z);
    else this.fx.muzzle(fxFrom.x, fxFrom.y, fxFrom.z, _look.x, _look.y, _look.z, volt ? POWER_META.volt.color : meta.color);

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
        if (w === "lance" || w === "pulse" || volt || ((w === "scatter" || w === "fauces") && !flashed)) {
          this.spawnBeam(fxFrom, hit.point, shotColor, w === "lance" ? 0.22 : 0.1);
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
          this.fx.pixelBurst(hit.point.x, hit.point.y, hit.point.z, shotColor, w === "lance" || w === "scatter" || w === "fauces" ? "blast" : "tick");
          this.arena.lights.flash(hit.point.x, hit.point.y, hit.point.z, shotColor, w === "lance" || w === "fauces" ? 18 : 8);
          flashed = true;
        }
        if (hit.fighter) {
          const head = hit.point.y > hit.fighter.pos.y + hit.fighter.height * 0.72;
          let fall = 1;
          if (w === "scatter") {
            const t = THREE.MathUtils.smoothstep(hit.dist, 6, meta.range);
            fall = 1 - 0.65 * t;
          } else if (w === "fauces") {
            const t = THREE.MathUtils.smoothstep(hit.dist, 4, meta.range);
            fall = 1 - 0.3 * t;
          }
          const dmg = meta.damage * fall * dmgMul * (head ? 1.6 : 1);
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

  private swingMelee(f: Fighter, w: WeaponId) {
    const meta = WEAPON_META[w];
    const now = performance.now() / 1000;
    const volt = now < f.powers.volt;
    const dmgMul = volt ? 1.45 : 1;
    if (f.isPlayer) {
      this.audio.fire(w);
      this.recoil += meta.kick;
      this.shake.add(meta.kick * 1.2);
    }
    this.lookVec(f, _look);
    const eye = f.isPlayer ? this.eyeY * 0.62 : f.height * 0.55;
    _origin.copy(f.pos).setY(f.pos.y + eye);
    let bestF: Fighter | null = null;
    let bestD = meta.range;
    const bestPoint = new THREE.Vector3();
    const bestDir = new THREE.Vector3();
    const fan = w === "knife" ? [-0.2, 0, 0.2] : [-0.5, -0.18, 0.18, 0.5];
    for (const off of fan) {
      const c = Math.cos(off);
      const s = Math.sin(off);
      _dir.set(_look.x * c + _look.z * s, _look.y * 0.35, -_look.x * s + _look.z * c).normalize();
      const hit = this.hitscan(_origin, _dir, meta.range, f.id);
      if (hit.fighter && hit.dist < bestD) {
        bestD = hit.dist;
        bestF = hit.fighter;
        bestPoint.copy(hit.point);
        bestDir.copy(_dir);
      }
    }
    if (!bestF) return;
    const head = bestPoint.y > bestF.pos.y + bestF.height * 0.72;
    const dmg = meta.damage * dmgMul * (head ? 1.6 : 1);
    this.hurtFighter(bestF, dmg, f, w, bestDir, meta.knock, head);
    this.fx.pixelBurst(bestPoint.x, bestPoint.y, bestPoint.z, meta.color, "blast");
    this.arena.lights.flash(bestPoint.x, bestPoint.y, bestPoint.z, meta.color, w === "knife" ? 6 : 14);
    if (f.isPlayer) {
      this.hitmarker = 0.14;
      this.audio.hit();
    }
  }

  private startReload(f: Fighter, now: number) {
    const w = f.weapon;
    const meta = isWeaponId(w) ? WEAPON_META[w] : undefined;
    if (!meta) return;
    if ((f.mag[w] ?? 0) >= meta.mag || (f.reserve[w] ?? 0) <= 0) return;
    f.reloadUntil = now + meta.reload;
    if (f.isPlayer) {
      this.audio.reload();
      this.reloadCue = { at: now + meta.reload, weapon: w };
    }
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
        else if (p.weapon === "ion") this.fx.ionTrail(p.pos.x, p.pos.y, p.pos.z, p.vel.x, p.vel.y, p.vel.z);
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
    if (style === "spark") this.fx.ionPop(at.x, at.y, at.z);
    else this.fx.pixelBurst(at.x, at.y, at.z, color, "boom");
    if (!pixel && style === "boom") this.fx.explode(at.x, at.y, at.z, color);
    this.arena.lights.flash(at.x, at.y, at.z, color, style === "spark" ? 10 : pixel ? 34 : 26);
    if (style === "spark") this.audio.ionZap();
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
    if (this.isCtf() && attacker && attacker !== f && attacker.team === f.team) return;
    const now = performance.now() / 1000;
    if (f.isRemote) {
      // Remote humans own their health: only the local player's hits are
      // reported (to the victim); nothing is applied or killed locally.
      if (attacker?.isPlayer && weapon !== "world" && amount > 0) {
        this.hooks.onRemoteHit?.(peerIdOf(f), {
          weapon,
          damage: amount,
          headshot,
          dir: [dir.x, dir.y, dir.z],
          knock,
        });
        this.audio.hit();
        const mat = f.mesh?.userData.flashMat as THREE.MeshStandardMaterial | undefined;
        if (mat) mat.emissiveIntensity = 1.4;
      }
      return;
    }
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
        f.threatId = attacker.id;
        f.threatUntil = now + 4.5;
        f.dodgeUntil = now + 0.9;
        f.strafe = -Math.sign(f.strafe || 1);
      }
    }
    if (f.health <= 0) {
      this.dropFlag(f);
      this.kill(f, attacker, weapon, headshot);
    }
  }

  private crushFighter(f: Fighter, x: number, y: number, z: number) {
    if (!f.alive) return;
    _dir.set(0, 1, 0);
    this.hurtFighter(f, 999, null, "world", _dir, 0, false);
    this.fx.burst(x, y + 0.4, z, 18, 0xff4a18, 9, 0.45, 0.16, 2.4);
    if (!f.isPlayer) return;
    this.crushT = 0;
    this.crushFrom.set(x, y + 0.2, z);
    f.respawnAt = performance.now() / 1000 + 3.9;
    this.pickupMsg = "TRITURADO · AL ESPACIO";
    this.pickupT = 2.4;
    this.shake.add(1);
    this.hurt = 1;
  }

  private crushPose(t: number) {
    const x = this.crushFrom.x;
    const z = this.crushFrom.z;
    const y0 = this.crushFrom.y;
    if (t < 0.36) {
      return _crush.set(x + Math.sin(t * 78) * 0.16, y0 + Math.sin(t * 46) * 0.08, z + Math.cos(t * 64) * 0.08);
    }
    const u = Math.min(1, (t - 0.36) / 2.2);
    const accel = 1 - (1 - u) * (1 - u);
    const y = y0 + (96 - y0) * accel;
    const spin = t * 4.8;
    const spread = accel * 16;
    return _crush.set(x + Math.cos(spin) * spread, y, z + Math.sin(spin) * spread);
  }

  private kill(f: Fighter, attacker: Fighter | null, weapon: WeaponId | "world", headshot: boolean, killerLabel?: string) {
    if (!f.alive) return;
    f.alive = false;
    f.deaths += 1;
    f.health = 0;
    f.respawnAt = performance.now() / 1000 + 1.85;
    if (f.isPlayer) {
      const bx = Math.sin(f.yaw);
      const bz = Math.cos(f.yaw);
      f.vel.x = f.vel.x * 0.28 + bx * 6.4;
      f.vel.z = f.vel.z * 0.28 + bz * 6.4;
      f.vel.y = Math.max(f.vel.y * 0.35, 2.6);
      this.hurt = 1;
      this.deathT = 0;
      this.shake.add(0.62);
    } else {
      f.vel.y = Math.max(f.vel.y, 2.2);
      f.vel.x *= 1.15;
      f.vel.z *= 1.15;
    }
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
        if (headshot) this.audio.headshot();
        else this.audio.frag();
      }
    } else if (f.isPlayer || (f.isRemote && !killerLabel)) {
      f.frags = Math.max(0, f.frags - 1);
    }
    if (f.isPlayer) {
      const killer = attacker && attacker !== f ? attacker : null;
      this.hooks.onLocalDeath?.({
        killer: killer?.isRemote ? peerIdOf(killer) : null,
        killerName: killer ? killer.name : null,
        weapon,
        headshot,
      });
    }
    this.killFeed.unshift({
      id: ++this.feedSeq,
      attacker: attacker && attacker !== f ? attacker.name : (killerLabel ?? f.name),
      victim: f.name,
      weapon,
      headshot,
    });
    this.killFeed = this.killFeed.slice(0, 5);
  }

  /** Fanfarria de fin de partida (una sola vez por partida). place: 1 campeón, 2 subcampeón, 0 derrota. */
  private playEndCue(place: 0 | 1 | 2) {
    if (this.endCuePlayed) return;
    this.endCuePlayed = true;
    this.reloadCue = null;
    if (place === 1) this.audio.victory(1);
    else if (place === 2) this.audio.victory(2);
    else this.audio.defeat();
  }

  private playerPlace(): 0 | 1 | 2 {
    const ranked = [...this.fighters]
      .filter((f) => f.isPlayer || f.respawnAt !== 1e12)
      .sort((a, b) => b.frags - a.frags || a.deaths - b.deaths);
    const i = ranked.findIndex((f) => f.isPlayer);
    return i === 0 ? 1 : i === 1 ? 2 : 0;
  }

  private checkWinner() {
    if (!this.matchOn || this.winner) return;
    if (this.isCtf()) {
      const limit = this.settings.capLimit || 3;
      if (this.teamScore.ion >= limit) this.endByTeam("ion");
      else if (this.teamScore.ember >= limit) this.endByTeam("ember");
      return;
    }
    for (const f of this.fighters) {
      if (f.frags >= this.settings.fragLimit) {
        this.winner = f.name;
        this.matchOn = false;
        if (f.isPlayer) {
          this.grant(140, 650, "CAMPEÓN");
        }
        this.playEndCue(f.isPlayer ? 1 : this.playerPlace() === 2 ? 2 : 0);
        this.closeRound(f.isPlayer);
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

  private endByTeam(team: TeamId) {
    const meta = TEAM_META[team];
    this.winner = `Equipo ${meta.label}`;
    this.matchOn = false;
    if (this.player.team === team) this.grant(140, 650, "CAPTURA · CAMPEÓN");
    this.playEndCue(this.player.team === team ? 1 : 0);
    this.closeRound(this.player.team === team);
    this.unlock();
    this.setScreen("ended");
  }

  private finishRound() {
    if (!this.matchOn) return;
    if (this.isCtf()) {
      const team: TeamId =
        this.teamScore.ion === this.teamScore.ember
          ? this.player.team
          : this.teamScore.ion > this.teamScore.ember
            ? "ion"
            : "ember";
      this.endByTeam(team);
      return;
    }
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
    this.playEndCue(ranked[0]?.isPlayer ? 1 : ranked[1]?.isPlayer ? 2 : 0);
    this.closeRound(ranked[0]?.isPlayer === true);
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

  private dropFlag(carrier: Fighter) {
    for (const fl of this.flags) {
      if (fl.carrierId !== carrier.id) continue;
      fl.carrierId = null;
      fl.pos.set(carrier.pos.x, carrier.pos.y, carrier.pos.z);
      fl.returnAt = performance.now() / 1000 + 18;
      fl.mesh.position.copy(fl.pos);
      if (carrier.isPlayer) {
        this.pickupMsg = "BANDERA SUELTA";
        this.pickupT = 1.4;
      }
    }
  }

  private tickFlags(now: number) {
    if (!this.isCtf() || !this.matchOn) return;
    for (const fl of this.flags) {
      if (fl.carrierId) {
        const carrier = this.fighters.find((f) => f.id === fl.carrierId && f.alive);
        if (!carrier) {
          fl.carrierId = null;
          fl.returnAt = now + 18;
        } else {
          fl.pos.set(carrier.pos.x, carrier.pos.y, carrier.pos.z);
          fl.mesh.position.set(carrier.pos.x, carrier.pos.y, carrier.pos.z);
          fl.mesh.rotation.y = carrier.yaw;
        }
        continue;
      }
      if (!this.flagAtHome(fl) && fl.returnAt > 0 && now >= fl.returnAt) {
        fl.pos.copy(fl.home);
        fl.returnAt = 0;
        fl.mesh.position.copy(fl.home);
        fl.mesh.rotation.y = 0;
        this.pickupMsg = `BANDERA ${TEAM_META[fl.team].label.toUpperCase()} DEVUELTA`;
        this.pickupT = 1.5;
      }
      fl.mesh.position.copy(fl.pos);
    }

    for (const f of this.fighters) {
      if (!f.alive) continue;
      const carrying = this.flags.find((fl) => fl.carrierId === f.id) ?? null;
      for (const fl of this.flags) {
        const d = Math.hypot(f.pos.x - fl.pos.x, f.pos.z - fl.pos.z);
        const near = d < 1.45 && Math.abs(f.pos.y - fl.pos.y) < 2.2;
        if (!near) continue;
        if (fl.team !== f.team && !fl.carrierId && !carrying) {
          fl.carrierId = f.id;
          fl.returnAt = 0;
          if (f.isPlayer) {
            this.pickupMsg = `BANDERA ${TEAM_META[fl.team].label.toUpperCase()}`;
            this.pickupT = 1.6;
            this.audio.pad();
          }
        } else if (fl.team === f.team && !fl.carrierId && !this.flagAtHome(fl)) {
          fl.pos.copy(fl.home);
          fl.returnAt = 0;
          fl.mesh.position.copy(fl.home);
          if (f.isPlayer) {
            this.pickupMsg = "BANDERA DEVUELTA";
            this.pickupT = 1.4;
            this.audio.pad();
          }
        }
      }
      if (!carrying) continue;
      const own = this.flags.find((fl) => fl.team === f.team);
      if (!own || !this.flagAtHome(own)) continue;
      const homeD = Math.hypot(f.pos.x - own.home.x, f.pos.z - own.home.z);
      if (homeD > 1.7 || Math.abs(f.pos.y - own.home.y) > 2.4) continue;
      const stolen = this.flags.find((fl) => fl.carrierId === f.id);
      if (!stolen) continue;
      stolen.carrierId = null;
      stolen.pos.copy(stolen.home);
      stolen.returnAt = 0;
      stolen.mesh.position.copy(stolen.home);
      stolen.mesh.rotation.y = 0;
      this.teamScore[f.team] += 1;
      this.pickupMsg = `CAPTURA ${TEAM_META[f.team].label.toUpperCase()}`;
      this.pickupT = 2;
      if (f.isPlayer) this.grant(80, 280, "CAPTURA");
      this.audio.frag();
      this.checkWinner();
    }
  }

  /** True when there is floor (solid top or jump pad) under (x, z) near height y. */
  private groundUnder(x: number, z: number, y: number) {
    for (const s of this.arena.solids) {
      if (x < s.minX || x > s.maxX || z < s.minZ || z > s.maxZ) continue;
      if (s.maxY <= y + 0.6 && s.maxY >= y - 2.4) return true;
    }
    for (const p of this.arena.pads) {
      if (x >= p.aabb.minX && x <= p.aabb.maxX && z >= p.aabb.minZ && z <= p.aabb.maxZ) return true;
    }
    return false;
  }

  /** Keeps grounded bots from walking off ledges into pits (Reactor coolant pit). */
  private guardLedge(f: Fighter) {
    if (!f.alive || !f.grounded || (f.wishX === 0 && f.wishY === 0)) return;
    const fx = -Math.sin(f.yaw), fz = -Math.cos(f.yaw);
    const rx = Math.cos(f.yaw), rz = -Math.sin(f.yaw);
    const ahead = 1.15;
    const safe = (dx: number, dz: number) => {
      const len = Math.hypot(dx, dz);
      return len < 1e-4 || this.groundUnder(f.pos.x + (dx / len) * ahead, f.pos.z + (dz / len) * ahead, f.pos.y);
    };
    if (safe(fx * f.wishY + rx * f.wishX, fz * f.wishY + rz * f.wishX)) return;
    const fwdOk = f.wishY === 0 || safe(fx * f.wishY, fz * f.wishY);
    const sideOk = f.wishX === 0 || safe(rx * f.wishX, rz * f.wishX);
    if (!fwdOk) f.wishY = 0;
    if (!sideOk) {
      f.strafe = -f.strafe;
      f.wishX = 0;
    }
    if (!fwdOk && !sideOk) {
      f.wishJump = false;
      f.wp = (f.wp + 1 + Math.floor(Math.random() * 5)) % Math.max(1, this.arena.waypoints.length);
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
    const threat = now < f.threatUntil ? this.fighters.find((o) => o.id === f.threatId && o.alive && (!this.isCtf() || o.team !== f.team)) : null;
    if (threat) {
      const d = f.pos.distanceTo(threat.pos);
      if (d < 34) {
        target = threat;
        best = d;
      }
    }
    if (!target) {
      for (const o of this.fighters) {
        if (o === f || !o.alive) continue;
        if (this.isCtf() && o.team === f.team) continue;
        const d = f.pos.distanceTo(o.pos);
        const weak = o.health < 45 ? 6 : 0;
        const score = d - weak;
        if (score < best) {
          best = d;
          target = o;
        }
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

    const burn = (this.arena.hazards ?? []).find((h) => this.insideHazard(f, h));
    if (burn) {
      const ax = f.pos.x + Math.sign(f.pos.x - burn.x || 1) * 4;
      const az = f.pos.z + Math.sign(f.pos.z - burn.z || 1) * 4;
      this.aimAt(f, ax, f.pos.y, az, 0.02);
      f.wishY = 1;
      f.wishX = 0;
      f.wishJump = f.grounded;
      f.wantsFire = false;
      return;
    }

    if (this.isCtf()) {
      const stolen = this.flags.find((fl) => fl.carrierId === f.id);
      const own = this.flags.find((fl) => fl.team === f.team);
      const enemy = this.flags.find((fl) => fl.team !== f.team);
      if (stolen && own) {
        this.routeBot(f, own.home.x, own.home.y, own.home.z, jitter * 0.2);
        if (target && this.botSees(f, target, best)) this.coverFire(f, target, best, now, jitter);
        return;
      }
      if (own?.carrierId) {
        const thief = this.fighters.find((o) => o.id === own.carrierId && o.alive);
        if (thief) {
          const td = f.pos.distanceTo(thief.pos);
          this.routeBot(f, thief.pos.x, thief.pos.y, thief.pos.z, jitter * 0.2);
          if (this.botSees(f, thief, td)) this.coverFire(f, thief, td, now, jitter);
          return;
        }
      }
      if (enemy && !enemy.carrierId) {
        this.routeBot(f, enemy.pos.x, enemy.pos.y, enemy.pos.z, jitter * 0.25);
        if (target && this.botSees(f, target, best)) this.coverFire(f, target, best, now, jitter);
        return;
      }
    }

    if (target && Math.abs(target.pos.y - f.pos.y) > 1.8) {
      const lift = this.liftRoute(f, target.pos.y);
      const direct = Math.hypot(target.pos.x - f.pos.x, target.pos.z - f.pos.z);
      if (lift && lift.d < Math.max(10, direct * 1.05)) {
        this.routeBot(f, lift.x, lift.y, lift.z, jitter * 0.2);
        return;
      }
    }

    if (f.health < 52) {
      const pack = this.nearestReady(f, (kind) => kind === "health" || kind === "mega" || (kind === "armor" && f.armor < 40));
      const cover = target ? this.coverSpot(f, target) : null;
      const useCover = !!(cover && (f.health < 38 || (target && this.botSees(f, target, best))) && (!pack || cover.d <= pack.dist * 1.15));
      const dest = useCover && cover ? cover : pack;
      const dist = dest ? ("dist" in dest ? dest.dist : dest.d) : 999;
      if (dest && (!target || dist < best * 0.95 || f.health < 34)) {
        this.routeBot(f, dest.x, dest.y, dest.z, jitter * 0.35);
        if (target && this.botSees(f, target, best)) this.coverFire(f, target, best, now, jitter);
        else if (f.reserve[f.weapon] > 0 && f.mag[f.weapon] < WEAPON_META[f.weapon].mag * 0.5) this.startReload(f, now);
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
      const flank = this.flankSpot(f, target);
      const peek = flank ?? this.peekSpot(f, target);
      const gx = peek ? peek.x : target.pos.x;
      const gy = peek ? peek.y : target.pos.y;
      const gz = peek ? peek.z : target.pos.z;
      this.routeBot(f, gx, gy, gz, jitter * 0.28);
      if (sees && Math.abs(dy) < 4.5) this.coverFire(f, target, best, now, jitter);
      else if (f.mag[f.weapon] < WEAPON_META[f.weapon].mag * 0.35 && f.reserve[f.weapon] > 0) this.startReload(f, now);
      return;
    }

    this.pickBotWeapon(f, best);
    const hurt = f.health < 40;
    const aimY = f.weapon === "lance" || f.weapon === "pulse" ? target.pos.y + target.height * 0.82 : ay;
    this.aimAt(f, ax, aimY, az, jitter * (hurt ? 1.15 : 0.85));
    _origin.set(f.pos.x, eye, f.pos.z);
    _dir.set(ax - f.pos.x, aimY - eye, az - f.pos.z);
    const aimDot = _dir.normalize().dot(this.lookVec(f, _look));
    const dodging = now < f.dodgeUntil;
    const w = f.weapon;
    const weak = target.health < 38;
    const high = f.pos.y > target.pos.y + 1.35 && sees;
    const hold =
      weak ? 1 :
      high && w !== "scatter" && w !== "fauces" && WEAPON_META[w].kind !== "melee" ? (now < f.holdUntil ? 0 : 0.15) :
      w === "lance" ? (best < 12 ? -1 : best > 22 ? 0.45 : 0) :
      WEAPON_META[w].kind === "melee" ? (best > 2.2 ? 1 : 0) :
      w === "scatter" ? (best > 8 ? 1 : best < 3.2 ? -0.35 : 0.5) :
      w === "fauces" ? (best > 8 ? 1 : best < 2.2 ? -0.1 : 0.15) :
      w === "torpedo" ? (best < 7 ? -1 : best > 16 ? 0.55 : 0.05) :
      w === "ion" ? (best < 7 ? -0.45 : best > 16 ? 0.55 : 0.2) :
      best > 14 ? 0.7 : best < 4 ? -0.25 : 0.3;
    if (high && now > f.holdUntil) f.holdUntil = now + 1.1 + f.skill * 0.6;
    f.wishY = dodging ? 0.2 : hurt && !weak ? -0.8 : hold;
    if (now > f.strafeUntil) {
      f.strafe = this.openStrafe(f);
      f.strafeUntil = now + 0.85 + Math.random() * 0.55;
    }
    f.wishX = f.strafe * (dodging ? 1.4 : 0.9 + f.skill * 0.32);
    const teammate = this.crowded(f);
    if (teammate) f.wishX += teammate;
    const jumpH = this.jumpHeight();
    f.wishJump = f.grounded && dy > 0.85 && horiz < Math.max(6.5, jumpH) && dy < jumpH * 0.96;
    if (!f.grounded && f.blinkCharges > 0 && now < f.powers.blink && (hurt || dodging) && best < 9) f.wishJump = true;
    const tooClose = w === "torpedo" && best < 5.5 && f.grounded;
    const melee = WEAPON_META[w].kind === "melee";
    f.wantsFire = !tooClose && now >= f.reactUntil && (melee ? aimDot > 0.55 : aimDot > 0.945 - f.skill * 0.07) && best < WEAPON_META[w].range;
  }

  private crowded(f: Fighter) {
    for (const o of this.fighters) {
      if (o === f || !o.alive || o.isPlayer) continue;
      const dx = f.pos.x - o.pos.x;
      const dz = f.pos.z - o.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.4 && d < 3.2) return Math.sign(dx * Math.cos(f.yaw) + dz * -Math.sin(f.yaw) || 1) * 0.55;
    }
    return 0;
  }

  private coverFire(f: Fighter, target: Fighter, best: number, now: number, jitter: number) {
    const lead = f.weapon === "torpedo" ? best / 29 : f.weapon === "ion" ? best / 34 : 0.04;
    this.aimAt(f, target.pos.x + target.vel.x * lead, target.pos.y + target.height * 0.55, target.pos.z + target.vel.z * lead, jitter);
    const tooClose = f.weapon === "torpedo" && best < 5.5 && f.grounded;
    f.wantsFire = !tooClose && now >= f.reactUntil && best < Math.min(28, WEAPON_META[f.weapon].range);
  }

  private openStrafe(f: Fighter) {
    const eye = f.pos.y + f.height * 0.7;
    const rx = Math.cos(f.yaw);
    const rz = -Math.sin(f.yaw);
    const reach = (sx: number, sz: number) => {
      const hit = raycastWorld(f.pos.x, eye, f.pos.z, sx, 0, sz, 3.4, this.arena.solids, 0.2);
      return hit === null ? 3.4 : hit;
    };
    const right = reach(rx, rz);
    const left = reach(-rx, -rz);
    if (Math.abs(right - left) < 0.35) return -Math.sign(f.strafe || 1);
    return right > left ? 1 : -1;
  }

  private coverSpot(f: Fighter, target: Fighter) {
    const tEye = target.pos.y + target.height * 0.55;
    let best: { x: number; y: number; z: number; d: number } | null = null;
    for (const cand of this.arena.waypoints) {
      const d = Math.hypot(cand.x - f.pos.x, cand.z - f.pos.z) + Math.abs(cand.y - f.pos.y) * 0.5;
      if (d < 2.4 || d > 18) continue;
      _origin.set(cand.x, cand.y + 1.5, cand.z);
      _dir.set(target.pos.x - cand.x, tEye - (cand.y + 1.5), target.pos.z - cand.z);
      const dist = _dir.length();
      if (dist < 2) continue;
      _dir.multiplyScalar(1 / dist);
      const hit = this.hitscan(_origin, _dir, dist, f.id);
      const covered = hit.fighter !== target && hit.dist < dist - 0.8;
      if (!covered) continue;
      if (!best || d < best.d) best = { x: cand.x, y: cand.y, z: cand.z, d };
    }
    return best;
  }

  private flankSpot(f: Fighter, target: Fighter) {
    const tEye = target.pos.y + target.height * 0.55;
    const tx = target.pos.x - f.pos.x;
    const tz = target.pos.z - f.pos.z;
    let best: { x: number; y: number; z: number; d: number; lat: number } | null = null;
    for (const cand of this.arena.waypoints) {
      const d = Math.hypot(cand.x - f.pos.x, cand.z - f.pos.z);
      if (d < 3 || d > 18) continue;
      const cx = cand.x - f.pos.x;
      const cz = cand.z - f.pos.z;
      const lat = Math.abs(tx * cz - tz * cx);
      if (lat < 8) continue;
      _origin.set(cand.x, cand.y + 1.5, cand.z);
      _dir.set(target.pos.x - cand.x, tEye - (cand.y + 1.5), target.pos.z - cand.z);
      const dist = _dir.length();
      if (dist < 2 || dist > 28) continue;
      _dir.multiplyScalar(1 / dist);
      const hit = this.hitscan(_origin, _dir, dist, f.id);
      if (hit.fighter !== target && hit.dist < dist - 0.7) continue;
      if (!best || lat > best.lat) best = { x: cand.x, y: cand.y, z: cand.z, d, lat };
    }
    return best;
  }

  private peekSpot(f: Fighter, target: Fighter) {
    const tEye = target.pos.y + target.height * 0.55;
    let best: { x: number; y: number; z: number; d: number } | null = null;
    for (const cand of this.arena.waypoints) {
      const d = Math.hypot(cand.x - f.pos.x, cand.z - f.pos.z);
      if (d < 2 || d > 16) continue;
      _origin.set(cand.x, cand.y + 1.5, cand.z);
      _dir.set(target.pos.x - cand.x, tEye - (cand.y + 1.5), target.pos.z - cand.z);
      const dist = _dir.length();
      if (dist < 1 || dist > 32) continue;
      _dir.multiplyScalar(1 / dist);
      const hit = this.hitscan(_origin, _dir, dist, f.id);
      if (hit.fighter !== target && hit.dist < dist - 0.7) continue;
      if (!best || d < best.d) best = { x: cand.x, y: cand.y, z: cand.z, d };
    }
    return best;
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

  private jumpHeight() {
    const v = this.arenaJump();
    const g = Math.max(0.8, this.arenaG());
    return (v * v) / (2 * g);
  }

  private liftRoute(f: Fighter, wantY: number) {
    const spots: Array<{ x: number; y: number; z: number }> = [];
    const needUp = wantY > f.pos.y + 1.2;
    for (const pad of this.arena.pads) {
      if (!needUp) continue;
      spots.push({
        x: (pad.aabb.minX + pad.aabb.maxX) * 0.5,
        y: pad.aabb.minY,
        z: (pad.aabb.minZ + pad.aabb.maxZ) * 0.5,
      });
    }
    for (const gate of this.arena.teleports ?? []) {
      const helps = Math.abs(gate.target.y - wantY) + 1.6 < Math.abs(f.pos.y - wantY);
      if (!helps) continue;
      spots.push({
        x: (gate.aabb.minX + gate.aabb.maxX) * 0.5,
        y: gate.aabb.minY,
        z: (gate.aabb.minZ + gate.aabb.maxZ) * 0.5,
      });
    }
    let best: { x: number; y: number; z: number; d: number } | null = null;
    for (const spot of spots) {
      const d = Math.hypot(spot.x - f.pos.x, spot.z - f.pos.z) + Math.abs(spot.y - f.pos.y) * 0.4;
      if (d > 42) continue;
      if (!best || d < best.d) best = { x: spot.x, y: spot.y, z: spot.z, d };
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
    const leap = performance.now() / 1000 < f.powers.leap;
    const jumpH = this.jumpHeight() * (leap ? 1.72 : 1);
    const canClimb = climb > 0.45 && climb < jumpH * 0.96 && horiz < Math.max(4.2, jumpH * 0.65);
    const canBlink = f.blinkCharges > 0 && f.powers.blink > performance.now() / 1000 && climb > 2.2 && horiz < 9;
    f.wishJump = f.grounded ? canClimb : canBlink;
    if (horiz < 1.8 && Math.abs(climb) < 1.25) f.wp = (f.wp + 1) % wps.length;
  }

  private pickBotWeapon(f: Fighter, dist: number) {
    const melee = MELEE_ORDER.find((id) => f.owned.has(id));
    const close = dist < 2.6 && melee ? [melee] : [];
    const prefer: WeaponId[] =
      dist < 6
        ? [...close, "fauces", "scatter", "ion", "pulse", "torpedo", "lance"]
        : dist > 16
          ? ["lance", "torpedo", "ion", "pulse", "scatter", "fauces"]
          : ["torpedo", "ion", "lance", "fauces", "scatter", "pulse"];
    for (const w of prefer) {
      if (f.owned.has(w) && (isMelee(w) || f.mag[w] > 0 || f.reserve[w] > 0)) {
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
        const chuteTexture = pozoParachuteTexture();
        const mat = new THREE.MeshStandardMaterial({
          map: chuteTexture,
          color: 0xffffff,
          emissive: 0x7ff5e4,
          emissiveMap: chuteTexture,
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

  private syncLaser(camera: THREE.PerspectiveCamera, on: boolean) {
    this.laser.visible = on && this.screen === "playing";
    this.laserDot.visible = this.laser.visible;
    if (!this.laser.visible) return;
    this.lookVec(this.player, _look);
    _origin.set(this.player.pos.x, this.player.pos.y + this.eyeY, this.player.pos.z).addScaledVector(_look, 0.45);
    const range = (isWeaponId(this.player.weapon) ? WEAPON_META[this.player.weapon] : WEAPON_META.pulse).range;
    const hit = this.hitscan(_origin, _look, range, this.player.id);
    const attr = this.laser.geometry.getAttribute("position") as THREE.BufferAttribute;
    attr.setXYZ(0, _origin.x, _origin.y, _origin.z);
    attr.setXYZ(1, hit.point.x, hit.point.y, hit.point.z);
    attr.needsUpdate = true;
    this.laserDot.position.copy(hit.point);
    this.laserDot.lookAt(camera.position);
    const scale = Math.max(0.7, Math.min(2.4, hit.dist * 0.03));
    this.laserDot.scale.setScalar(scale);
  }

  private visuals(dt: number, now: number) {
    const { camera, renderer, gunRoot, gunCam, guns } = this.view;
    const exp = this.arena.lights.tick(now, dt, this.reducedMotion, camera);
    const dying = this.screen === "playing" && !this.player.alive;
    renderer.toneMappingExposure = dying ? exp * 0.58 : exp;
    this.arena.update?.(now, dt);
    this.fx.update(dt, camera);
    this.syncChutes(now);
    this.hitmarker = Math.max(0, this.hitmarker - dt);
    this.hurt = Math.max(0, this.hurt - dt);
    if (dying) {
      this.deathT += dt;
      this.hurt = Math.max(this.hurt, 0.95);
    }
    this.pickupT = Math.max(0, this.pickupT - dt);
    if (this.pickupT <= 0) this.pickupMsg = null;
    this.recoil *= Math.exp(-9 * dt);
    this.muzzle = Math.max(0, this.muzzle - dt);
    if (!dying) {
      this.eyeY += ((this.input.crouching() ? CROUCH_EYE : EYE) - this.eyeY) * (1 - Math.exp(-12 * dt));
    }
    this.landDip += (0 - this.landDip) * (1 - Math.exp(-10 * dt));

    const cheapFx = isLoDevice() || isStruggling();
    for (const it of this.items) {
      if (!it.ready) continue;
      if (cheapFx) {
        it.mesh.rotation.y += dt * 1.15;
        it.mesh.position.y = it.y + 0.38;
        continue;
      }
      const power = isPower(it.kind);
      const featured = it.mesh.userData.featuredPickup === true;
      const flat = it.mesh.userData.flatPickup === true;
      it.mesh.rotation.y += dt * (featured ? 2.15 : power ? 2.4 : 1.6);
      it.mesh.position.y = it.y + 0.38 + Math.sin(now * (featured ? 3.6 : power ? 3.2 : 2) + it.x) * (featured ? 0.16 : power ? 0.12 : 0.08);
      if (power && !flat) it.mesh.rotation.x = Math.sin(now * 1.6 + it.z) * 0.25;
      if (featured) {
        const mat = it.mesh.userData.pickupMat as THREE.MeshStandardMaterial | undefined;
        const crate = it.mesh.userData.cratePickup === true;
        if (mat) mat.emissiveIntensity = crate
          ? 0.3 + Math.sin(now * 3 + it.z) * 0.08
          : 1.38 + Math.sin(now * 5 + it.z) * 0.3;
        const s = 1 + Math.sin(now * 3.6 + it.x) * 0.045;
        it.mesh.scale.setScalar(s);
      }
    }

    const underground = this.screen === "playing" || this.screen === "paused";
    const depth = underground ? Math.max(0, Math.min(1, (-0.55 - this.player.pos.y) / 1.7)) : 0;
    this.audio.setCrypt(depth, dt);

    if (this.screen === "menu" || this.screen === "settings" || this.screen === "help" || this.screen === "ended" || this.screen === "skin") {
      this.laser.visible = false;
      this.laserDot.visible = false;
      if (this.selfMesh) this.selfMesh.visible = false;
      this.tpPivotReady = false;
      this.orbitT += dt * 0.12;
      const luna = this.arenaId === "luna";
      const maze = this.arenaId === "laberinto";
      const mar = this.arenaId === "mar";
      const orbit = this.arena.menuOrbit;
      const r = orbit?.radius ?? (maze ? 62 : luna ? 56 : mar ? 48 : 70);
      camera.position.set(Math.sin(this.orbitT) * r, orbit?.height ?? (maze ? 28 : luna ? 26 : mar ? 20 : 24), Math.cos(this.orbitT) * r);
      camera.lookAt(0, orbit?.lookY ?? (maze ? 10 : luna ? 6 : mar ? 1 : 2.2), 0);
      return;
    }

    const shake = this.reducedMotion ? { x: 0, y: 0, z: 0 } : this.shake.sample(dt, this.settings.shake);
    const spd = Math.hypot(this.player.vel.x, this.player.vel.z);
    const glide = this.reducedMotion ? 0 : 0.35 + 0.65 * Math.min(1, spd / 7);
    const floatX = Math.cos(now * 0.85) * 0.004 * glide;
    const floatY = Math.sin(now * 1.15) * 0.006 * glide;
    this.swayX *= Math.exp(-10 * dt);
    this.swayY *= Math.exp(-7 * dt);
    this.fovKick *= Math.exp(-7 * dt);
    const rushing = now < this.player.powers.rush;
    const scopeSpec = SCOPE[this.player.weapon];
    const zooming = this.input.aimHeld && !!scopeSpec && this.player.alive;
    const zoom = zooming ? this.zoomFor(this.player.weapon) : 1;
    const iron = this.input.aimHeld && !scopeSpec ? 0.86 : 1;
    const baseFov = this.settings.fov + this.fovKick + (rushing && !zooming ? 7 : 0);
    const wantFov = Math.max(8, (baseFov * iron) / zoom);
    camera.fov += (wantFov - camera.fov) * (1 - Math.exp(-12 * dt));
    camera.updateProjectionMatrix();
    this.syncLaser(camera, zooming && !dying);
    if (rushing && spd > 5 && !dying) {
      this.fx.rush(this.player.pos.x, this.player.pos.y + 0.4, this.player.pos.z, POWER_META.rush.color);
    }

    if (dying && this.crushT >= 0) {
      const bite = this.crushT < 0.36;
      const up = bite ? 0 : Math.min(1, (this.crushT - 0.36) / 2.2);
      this.hurt = Math.max(this.hurt, bite ? 1 : 0.72);
      camera.position.set(
        this.player.pos.x + Math.sin(now * 9) * (bite ? 0.22 : 0.08),
        this.player.pos.y + (bite ? 0.42 : 1.35),
        this.player.pos.z + (bite ? 0.15 : -0.2),
      );
      const pitch = bite ? 0.95 : -1.05 + up * 1.7;
      const roll = Math.sin(now * (bite ? 28 : 6)) * (bite ? 0.55 : 0.22);
      camera.quaternion.setFromEuler(new THREE.Euler(pitch, this.player.yaw + this.crushT * 2.4, roll, "YXZ"));
    } else if (dying) {
      const fall = 1 - Math.pow(1 - Math.min(1, this.deathT / 0.62), 3);
      this.eyeY += (0.28 - this.eyeY) * Math.min(1, 1 - Math.exp(-7 * dt));
      const pitch = this.player.pitch + (1.12 - this.player.pitch) * fall;
      const roll = (this.reducedMotion ? 0.18 : 0.52) * fall;
      camera.position.set(
        this.player.pos.x + shake.x,
        this.player.pos.y + this.eyeY + shake.y,
        this.player.pos.z + shake.z,
      );
      camera.quaternion.setFromEuler(new THREE.Euler(pitch, this.player.yaw, roll, "YXZ"));
    } else {
      camera.position.set(
        this.player.pos.x + shake.x,
        this.player.pos.y + this.eyeY + floatY * 0.35 + shake.y - this.landDip,
        this.player.pos.z + shake.z,
      );
      camera.quaternion.setFromEuler(new THREE.Euler(this.player.pitch, this.player.yaw, 0, "YXZ"));
    }

    // Tercera persona: el telescopio y la muerte por trituración vuelven a primera persona.
    const tpWant = this.thirdPerson() && !zooming && !(dying && this.crushT >= 0);
    this.tpBlend += ((tpWant ? 1 : 0) - this.tpBlend) * (1 - Math.exp(-(tpWant ? 8 : 14) * dt));
    if (tpWant && this.tpBlend > 0.995) this.tpBlend = 1;
    if (!tpWant && this.tpBlend < 0.005) this.tpBlend = 0;
    if (this.tpBlend > 0) {
      this.placeThirdPersonCamera(camera, dt, dying, shake);
    } else {
      this.tpCam.copy(camera.position);
      this.tpCamDist = 0;
      this.tpPivotReady = false;
    }
    this.syncSelfMesh(dt, now, dying);

    const rest = restPose(this.player.weapon);
    const ads = adsPose(this.player.weapon);
    this.adsT += ((this.input.aimHeld ? 1 : 0) - this.adsT) * (1 - Math.exp(-14 * dt));
    const t = this.adsT;
    const viewportScale = packViewportScale(this.player.weapon, gunCam.aspect);
    gunRoot.scale.setScalar((1.22 - 0.2 * t) * viewportScale);
    gunCam.fov = 50 - 8 * t;
    gunCam.updateProjectionMatrix();
    gunRoot.position.set(
      (rest.x + (ads.x - rest.x) * t + floatX * (1 - t * 0.6) + this.swayX * 0.35 * (1 - t)) * viewportScale,
      rest.y + (ads.y - rest.y) * t + floatY * (1 - t * 0.5) - this.recoil * (0.42 - t * 0.2),
      rest.z + (ads.z - rest.z) * t - this.recoil * (0.7 - t * 0.25),
    );
    gunRoot.position.y *= (0.65 + 0.35 * viewportScale) * (1 - t) + viewportScale * t;
    gunRoot.rotation.set(
      -0.04 * t + this.recoil * (0.28 - t * 0.16),
      0.02 * (1 - t) + floatX * 0.4 + (isMelee(this.player.weapon) ? Math.sin(Math.min(1, this.recoil) * Math.PI) * 0.85 : 0),
      this.recoil * 0.06 * (1 - t),
    );
    for (const [id, g] of guns) {
      if (id === this.player.weapon) setPackAim(g, id, t);
      const scoped = id === this.player.weapon && !!SCOPE[id] && t > 0.82;
      g.visible = id === this.player.weapon && this.player.alive && this.screen === "playing" && !scoped && this.tpBlend < 0.3;
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

  /**
   * Over-the-shoulder chase camera. The first-person pose has already been set
   * on `camera` (eye position + yaw/pitch); this moves it back/right/up along
   * the camera's own axes, scaled by tpBlend so toggling slides smoothly.
   * Collision: a ray from the head to the wanted spot against arena solids;
   * the arm snaps in when blocked and eases back out when free.
   */
  private placeThirdPersonCamera(camera: THREE.PerspectiveCamera, dt: number, dying: boolean, shake: { x: number; y: number; z: number }) {
    const p = this.player;
    const b = this.tpBlend;
    // Pivote = cabeza, suavizado (los escalones y el aterrizaje no sacuden la cámara).
    const headY = dying ? 1.15 : this.eyeY - this.landDip;
    _tpWant.set(p.pos.x, p.pos.y + headY, p.pos.z);
    if (!this.tpPivotReady || this.tpPivot.distanceToSquared(_tpWant) > 9) {
      this.tpPivot.copy(_tpWant);
      this.tpPivotReady = true;
      this.tpFrac = 1;
    } else {
      const kxz = 1 - Math.exp(-26 * dt);
      const ky = 1 - Math.exp(-14 * dt);
      this.tpPivot.x += (_tpWant.x - this.tpPivot.x) * kxz;
      this.tpPivot.z += (_tpWant.z - this.tpPivot.z) * kxz;
      this.tpPivot.y += (_tpWant.y - this.tpPivot.y) * ky;
    }
    if (dying) {
      // Vista de la caída: algo más alta y mirando hacia el cuerpo.
      _tpEuler.set(Math.min(-0.42, p.pitch), p.yaw, 0);
      camera.quaternion.setFromEuler(_tpEuler);
    }
    const wantDist = this.input.aimHeld && !dying ? TP_DIST_AIM : TP_DIST;
    this.tpDist += (wantDist - this.tpDist) * (1 - Math.exp(-10 * dt));
    _tpBack.set(0, 0, 1).applyQuaternion(camera.quaternion);
    _tpRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
    // Brazo completo de la cámara (desde la cabeza).
    _tpWant
      .copy(_tpBack)
      .multiplyScalar(this.tpDist * b)
      .addScaledVector(_tpRight, TP_SIDE * b);
    _tpWant.y += TP_UP * b;
    const len = _tpWant.length();
    let allowed = 1;
    if (len > 0.01) {
      _tpTmp.copy(_tpWant).multiplyScalar(1 / len);
      const o = this.tpPivot;
      const hit = raycastWorld(o.x, o.y, o.z, _tpTmp.x, _tpTmp.y, _tpTmp.z, len + TP_PAD, this.arena.solids, 0);
      if (hit !== null) allowed = Math.max(0, (hit - TP_PAD) / len);
      // Rozando una pared en paralelo el rayo central no basta: se acorta hasta que el punto quede libre.
      for (let i = 0; i < 6 && allowed > 0.02; i++) {
        const d = len * allowed;
        if (!blockedAt(o.x + _tpTmp.x * d, o.y + _tpTmp.y * d - 0.12, o.z + _tpTmp.z * d, 0.12, 0.24, this.arena.solids)) break;
        allowed *= 0.72;
      }
    }
    // Entra de golpe (nunca atraviesa la pared), sale suave.
    if (allowed < this.tpFrac) this.tpFrac = allowed;
    else this.tpFrac += (allowed - this.tpFrac) * (1 - Math.exp(-5 * dt));
    camera.position.copy(this.tpPivot).addScaledVector(_tpWant, this.tpFrac);
    this.tpCam.copy(camera.position);
    this.tpCamDist = len * this.tpFrac;
    camera.position.x += shake.x;
    camera.position.y += shake.y;
    camera.position.z += shake.z;
  }

  /** Local player body for third person, animated with the bot rig (run / shoot / death). */
  private syncSelfMesh(dt: number, now: number, dying: boolean) {
    const mesh = this.selfMesh;
    if (!mesh) return;
    const p = this.player;
    const show =
      this.tpBlend > 0.25 &&
      this.tpCamDist > TP_BODY_MIN &&
      (this.screen === "playing" || this.screen === "paused") &&
      (p.alive || (dying && this.crushT < 0));
    mesh.visible = show;
    if (!show) return;
    mesh.position.copy(p.pos);
    mesh.rotation.y = p.yaw;
    setFighterWeapon(mesh, p.weapon);
    animateFighter(mesh, {
      speed: p.alive ? Math.hypot(p.vel.x, p.vel.z) : 0,
      grounded: p.grounded,
      velY: p.vel.y,
      pitch: p.pitch,
      dt,
      firing: p.alive && now - p.lastShot < 0.12,
      dead: !p.alive,
      land: p.landT,
      protect: now < p.protectUntil,
    });
  }

  private emitHud() {
    const p = this.player;
    const w = isWeaponId(p.weapon) ? p.weapon : "pulse";
    const now = performance.now() / 1000;
    const hud: HudSnapshot = {
      health: Math.max(0, Math.round(p.health)),
      armor: Math.max(0, Math.round(p.armor)),
      ammo: p.mag[w] ?? 0,
      reserve: p.reserve[w] ?? 0,
      weapon: w,
      weapons: [...WEAPON_ORDER.filter((id) => p.owned.has(id)), ...MELEE_ORDER.filter((id) => p.owned.has(id))],
      frags: p.frags,
      deaths: p.deaths,
      fragLimit: this.settings.fragLimit,
      mode: this.settings.mode,
      capLimit: this.settings.capLimit || 3,
      teamScore: { ...this.teamScore },
      flags: this.flags.map((fl) => ({
        team: fl.team,
        state: fl.carrierId ? "carried" : this.flagAtHome(fl) ? "home" : "dropped",
        carrier: this.fighters.find((x) => x.id === fl.carrierId)?.name ?? null,
      })),
      playerTeam: this.isCtf() ? this.player.team : null,
      carrying: this.flags.find((fl) => fl.carrierId === p.id)?.team ?? null,
      countdown: this.countdown === null ? null : Math.ceil(this.countdown),
      pickup: this.pickupMsg,
      hitmarker: this.hitmarker,
      hurt: this.hurt,
      killFeed: this.killFeed,
      scoreboard: this.fighters
        .filter((f) => f.isPlayer || f.isRemote || f.respawnAt !== 1e12)
        .map((f) => ({
          name: f.name,
          color: f.colorCss,
          frags: f.frags,
          deaths: f.deaths,
          isPlayer: f.isPlayer,
          team: this.isCtf() ? f.team : undefined,
        }))
        .sort((a, b) => b.frags - a.frags || a.deaths - b.deaths),
      winner: this.winner,
      roundSeconds: Math.ceil(this.roundSeconds),
      credits: this.credits,
      score: this.score,
      level: levelFromXp(this.careerXp),
      xp: this.careerXp % XP_PER_LEVEL,
      xpNeed: XP_PER_LEVEL,
      prize: this.prizeText,
      leveled: this.leveled,
      grenades: p.grenades,
      aiming: this.input.aimHeld,
      scope: this.input.aimHeld && this.player.alive && SCOPE[p.weapon] ? this.zoomFor(p.weapon) : null,
      streak: now < this.streakUntil ? this.streak : 0,
      locked: this.locked,
      yaw: p.yaw,
      speed: Math.hypot(p.vel.x, p.vel.z),
      alive: p.alive,
      powers: POWER_ORDER
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
