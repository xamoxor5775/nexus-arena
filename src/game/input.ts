const GAME_CODES = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "KeyR",
  "KeyC",
  "KeyQ",
  "KeyE",
  "Space",
  "ShiftLeft",
  "ShiftRight",
  "Tab",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Digit1",
  "Digit2",
  "Digit3",
  "Digit4",
  "Digit5",
  "KeyP",
]);

function radial(x: number, y: number, dz = 0.16): { x: number; y: number } {
  const m = Math.hypot(x, y);
  if (m < dz) return { x: 0, y: 0 };
  const scale = (m - dz) / (1 - dz) / m;
  return { x: x * scale, y: y * scale };
}

export class GameInput {
  keys = new Set<string>();
  injected: string[] | null = null;
  mouseDx = 0;
  mouseDy = 0;
  fireHeld = false;
  fireClicked = false;
  jumpClicked = false;
  reloadClicked = false;
  nextWeapon = 0;
  prevWeapon = 0;
  slot: number | null = null;
  tabHeld = false;
  touchMoveX = 0;
  touchMoveY = 0;
  lookScale = 1;
  private padLookX = 0;
  private padLookY = 0;
  private padFire = false;

  attach(target: HTMLElement) {
    const onDown = (e: KeyboardEvent) => {
      if (GAME_CODES.has(e.code)) e.preventDefault();
      this.keys.add(e.code);
      if (e.code === "KeyR") this.reloadClicked = true;
      if (e.code === "Space") this.jumpClicked = true;
      if (e.code === "Digit1") this.slot = 1;
      if (e.code === "Digit2") this.slot = 2;
      if (e.code === "Digit3") this.slot = 3;
      if (e.code === "Digit4") this.slot = 4;
      if (e.code === "Digit5") this.slot = 5;
      if (e.code === "KeyQ") this.prevWeapon = 1;
      if (e.code === "KeyE") this.nextWeapon = 1;
    };
    const onUp = (e: KeyboardEvent) => {
      this.keys.delete(e.code);
    };
    const onBlur = () => {
      this.keys.clear();
      this.fireHeld = false;
    };
    const onMouse = (e: MouseEvent) => {
      this.mouseDx += e.movementX;
      this.mouseDy += e.movementY;
    };
    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 0) {
        this.fireHeld = true;
        this.fireClicked = true;
      }
    };
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 0) this.fireHeld = false;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.deltaY > 0) this.nextWeapon = 1;
      else this.prevWeapon = 1;
    };
    const onContext = (e: Event) => e.preventDefault();

    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onBlur);
    target.addEventListener("mousemove", onMouse);
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    target.addEventListener("wheel", onWheel, { passive: false });
    target.addEventListener("contextmenu", onContext);

    this.detach = () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onBlur);
      target.removeEventListener("mousemove", onMouse);
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      target.removeEventListener("wheel", onWheel);
      target.removeEventListener("contextmenu", onContext);
    };
  }

  detach = () => {};

  setInjected(codes: string[]) {
    this.injected = codes;
  }

  setTouchMove(x: number, y: number) {
    this.touchMoveX = Math.max(-1, Math.min(1, x));
    this.touchMoveY = Math.max(-1, Math.min(1, y));
  }

  addLook(dx: number, dy: number) {
    this.mouseDx += dx;
    this.mouseDy += dy;
  }

  has(code: string): boolean {
    if (this.injected) return this.injected.includes(code);
    return this.keys.has(code);
  }

  consumeLook(): { dx: number; dy: number } {
    const dx = this.mouseDx + this.padLookX * 18;
    const dy = this.mouseDy + this.padLookY * 18;
    this.mouseDx = 0;
    this.mouseDy = 0;
    return { dx, dy };
  }

  pollGamepad() {
    this.padLookX = 0;
    this.padLookY = 0;
    const pads = navigator.getGamepads?.() ?? [];
    const pad = pads.find((p) => p && p.mapping === "standard") ?? pads.find(Boolean);
    if (!pad) return;
    const left = radial(pad.axes[0] ?? 0, pad.axes[1] ?? 0);
    const right = radial(pad.axes[2] ?? 0, pad.axes[3] ?? 0, 0.12);
    this.touchMoveX = left.x;
    this.touchMoveY = -left.y;
    this.padLookX = right.x;
    this.padLookY = right.y;
    const rt = pad.buttons[7]?.value ?? 0;
    if (rt > 0.4) {
      if (!this.padFire) this.fireClicked = true;
      this.padFire = true;
      this.fireHeld = true;
    } else if (this.padFire) {
      this.padFire = false;
      this.fireHeld = false;
    }
    if (pad.buttons[0]?.pressed) this.jumpClicked = true;
    if (pad.buttons[2]?.pressed) this.reloadClicked = true;
    if (pad.buttons[4]?.pressed) this.prevWeapon = 1;
    if (pad.buttons[5]?.pressed) this.nextWeapon = 1;
  }

  moveAxes(): { x: number; y: number } {
    let x = this.touchMoveX;
    let y = this.touchMoveY;
    if (this.has("KeyD") || this.has("ArrowRight")) x += 1;
    if (this.has("KeyA") || this.has("ArrowLeft")) x -= 1;
    if (this.has("KeyW") || this.has("ArrowUp")) y += 1;
    if (this.has("KeyS") || this.has("ArrowDown")) y -= 1;
    const m = Math.hypot(x, y);
    if (m > 1) {
      x /= m;
      y /= m;
    }
    return { x, y };
  }

  sprinting(): boolean {
    return this.has("ShiftLeft") || this.has("ShiftRight");
  }

  crouching(): boolean {
    return this.has("KeyC");
  }

  jumping(): boolean {
    return this.has("Space") || this.jumpClicked;
  }

  endFrame() {
    this.fireClicked = false;
    this.jumpClicked = false;
    this.reloadClicked = false;
    this.nextWeapon = 0;
    this.prevWeapon = 0;
    this.slot = null;
    this.tabHeld = this.has("Tab");
  }
}
