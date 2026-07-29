import { createGroundShader } from "./ground-shader.js";
import { SynthAudio } from "./audio.js";

const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
const startButton = document.querySelector("#start-button");
const restartButton = document.querySelector("#restart-button");
const muteButton = document.querySelector("#mute-button");
const pauseButton = document.querySelector("#pause-button");

const W = 1280;
const H = 720;
const STEP = 1 / 120;
const ROAD_HALF_WIDTH = 30;
const BODY_CLEARANCE = 58;
const TERRAIN_SPACING = 310;
const RUN_SEED = 7412026;
const CONTACT_LOCAL = [
  { name: "rear", x: -54, y: 39, radius: 19 },
  { name: "front", x: 58, y: 39, radius: 18 },
];
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const testMode = new URLSearchParams(location.search).has("test");

const colors = {
  ink: "#14233b",
  nearInk: "#08101c",
  white: "#fffdf4",
  yellow: "#ffd83d",
  orange: "#f36b38",
  lime: "#b7db35",
  cyan: "#79b7c9",
  coffee: "#7b4526",
  red: "#d93a31",
  dirt: "#b85f2c",
  dirtDark: "#6b3728",
};

const assetPaths = {
  racer: "./assets/racer-sheet.png",
  far: "./assets/far-skyline.png",
  mid: "./assets/mid-office.png",
  terrain: "./assets/terrain-atlas.png",
  vfx: "./assets/vfx-sheet.png",
  pickups: "./assets/pickup-sheet.png",
};

const images = {};
let groundShader = null;
let roadPattern = null;
let dirtPattern = null;
let assetsReady = false;
const audio = new SynthAudio();
muteButton.setAttribute("aria-label", audio.muted ? "Unmute audio" : "Mute audio");
muteButton.setAttribute("aria-pressed", audio.muted ? "true" : "false");

function loadImage(src) {
  const image = new Image();
  image.src = src;
  return image.decode().then(() => image);
}

const assetsPromise = Promise.all(
  Object.entries(assetPaths).map(async ([key, path]) => {
    images[key] = await loadImage(path);
  }),
).then(() => {
  groundShader = createGroundShader(images.terrain);
  roadPattern = ctx.createPattern(groundShader.canvas, "repeat");
  dirtPattern = makeAtlasPattern(images.terrain, 1, 0, 2, 2, 384);
  assetsReady = true;
});

function makeAtlasPattern(image, col, row, cols, rows, size) {
  const tile = document.createElement("canvas");
  tile.width = size;
  tile.height = size;
  const tileCtx = tile.getContext("2d");
  const sw = image.width / cols;
  const sh = image.height / rows;
  tileCtx.drawImage(image, col * sw, row * sh, sw, sh, 0, 0, size, size);
  return ctx.createPattern(tile, "repeat");
}

function mulberry32(seed) {
  return function random() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let random = mulberry32(RUN_SEED);
let deterministicRemainder = 0;
let simulationSteps = 0;
const terrainPoints = [];

function terrainControlY(index) {
  if (index < 2) return 490 - index * 9;
  const broad = Math.sin(index * 1.19) * 88;
  const long = Math.sin(index * 0.43 + 1.3) * 42;
  const rhythm = index % 9 === 5 ? -52 : index % 9 === 7 ? 42 : 0;
  return Math.max(265, Math.min(550, 440 + broad + long + rhythm));
}

for (let i = -4; i < 420; i += 1) {
  terrainPoints.push({ x: i * TERRAIN_SPACING, y: terrainControlY(i) });
}

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

function terrainY(x) {
  const raw = x / TERRAIN_SPACING;
  const baseIndex = Math.floor(raw);
  const t = raw - baseIndex;
  const offset = baseIndex + 4;
  const a = terrainPoints[Math.max(0, offset - 1)]?.y ?? 480;
  const b = terrainPoints[Math.max(0, offset)]?.y ?? 480;
  const c = terrainPoints[Math.min(terrainPoints.length - 1, offset + 1)]?.y ?? 480;
  const d = terrainPoints[Math.min(terrainPoints.length - 1, offset + 2)]?.y ?? 480;
  return catmull(a, b, c, d, t);
}

function terrainSlope(x) {
  return (terrainY(x + 3) - terrainY(x - 3)) / 6;
}

function angleDelta(target, current) {
  let delta = target - current;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function damp(current, target, halfLife, dt) {
  return target + (current - target) * Math.pow(0.5, dt / halfLife);
}

const state = {
  mode: "menu",
  paused: false,
  elapsed: 0,
  runTime: 0,
  score: 0,
  best: Number(localStorage.getItem("chair-rally-best") || 0),
  distance: 0,
  battery: 72,
  coffee: 0,
  combo: 0,
  comboTimer: 0,
  trickText: "",
  trickSub: "",
  trickTimer: 0,
  trickScale: 1,
  landTimer: 0,
  criticalTimer: 0,
  stallTimer: 0,
  shake: 0,
  shakeAngle: 0,
  flash: 0,
  player: {
    x: 220,
    y: 390,
    vx: 0,
    vy: 0,
    angle: 0,
    av: 0,
    grounded: true,
    wasGrounded: true,
    airTime: 0,
    airStartY: 0,
    airPeakY: 0,
    rotationAccum: 0,
    impactSpeed: 0,
    rearContact: false,
    frontContact: false,
    groundGrace: 0.075,
    takeoffFired: false,
  },
  camera: {
    x: 220,
    y: 420,
    zoom: 1.02,
    targetX: 220,
    targetY: 420,
    targetZoom: 1.02,
    roll: 0,
  },
  collectibles: [],
  nextCollectibleX: 700,
  effects: [],
  inputs: {
    left: false,
    right: false,
    keys: { left: false, right: false },
    pointers: new Map(),
  },
};

function resetGame() {
  random = mulberry32(RUN_SEED);
  deterministicRemainder = 0;
  simulationSteps = 0;
  const p = state.player;
  const startX = 220;
  const slope = Math.atan(terrainSlope(startX));
  Object.assign(state, {
    mode: "playing",
    paused: false,
    elapsed: 0,
    runTime: 0,
    score: 0,
    distance: 0,
    battery: 72,
    coffee: 0,
    combo: 0,
    comboTimer: 0,
    trickText: "ROLL OUT",
    trickSub: "AFTER HOURS",
    trickTimer: 1.15,
    trickScale: 1.35,
    landTimer: 0,
    criticalTimer: 0,
    stallTimer: 0,
    shake: 0,
    shakeAngle: 0,
    flash: 0,
    collectibles: [],
    nextCollectibleX: 680,
    effects: [],
  });
  Object.assign(p, {
    x: startX,
    y: terrainY(startX) - BODY_CLEARANCE,
    vx: 110,
    vy: 0,
    angle: slope,
    av: 0,
    grounded: true,
    wasGrounded: true,
    airTime: 0,
    airStartY: 0,
    airPeakY: 0,
    rotationAccum: 0,
    impactSpeed: 0,
    rearContact: true,
    frontContact: true,
    groundGrace: 0.075,
    takeoffFired: false,
  });
  Object.assign(state.camera, {
    x: startX,
    y: p.y,
    zoom: 1.02,
    targetX: startX,
    targetY: p.y,
    targetZoom: 1.02,
    roll: 0,
  });
  state.inputs.left = false;
  state.inputs.right = false;
  state.inputs.keys.left = false;
  state.inputs.keys.right = false;
  state.inputs.pointers.clear();
  ensureCollectibles();
  startButton.hidden = true;
  restartButton.hidden = true;
  pauseButton.hidden = false;
  audio.start().catch(() => {});
  audio.sfx("ui");
}

function ensureCollectibles() {
  while (state.nextCollectibleX < state.player.x + 4800) {
    const index = Math.round(state.nextCollectibleX / 430);
    const isHazard = index % 7 === 5;
    const isCoffee = index % 5 === 2;
    const isBattery = index % 4 === 0;
    const type = isHazard ? "binder" : isCoffee ? "coffee" : isBattery ? "battery" : "checkpoint";
    const x = state.nextCollectibleX;
    const pathY = terrainY(x);
    const airOffset = index % 5 === 3 ? 155 : 98;
    state.collectibles.push({
      id: `${index}-${type}`,
      type,
      x,
      y: pathY - airOffset,
      collected: false,
      phase: random() * Math.PI * 2,
      scale: type === "binder" ? 0.28 : 0.245,
    });
    if (index % 9 === 8) {
      state.collectibles.push({
        id: `${index}-checkpoint`,
        type: "checkpoint",
        x: x + 145,
        y: terrainY(x + 145) - 125,
        collected: false,
        phase: random() * Math.PI * 2,
        scale: 0.235,
      });
    }
    state.nextCollectibleX += 900 + random() * 210;
  }
}

function endGame(reason) {
  if (state.mode !== "playing") return;
  state.distance = Math.max(state.distance, (state.player.x - 220) / 12);
  state.mode = "over";
  state.paused = false;
  state.endReason = reason;
  state.best = Math.max(state.best, Math.floor(state.distance));
  localStorage.setItem("chair-rally-best", String(state.best));
  restartButton.hidden = false;
  pauseButton.hidden = true;
  state.inputs.left = false;
  state.inputs.right = false;
  state.inputs.keys.left = false;
  state.inputs.keys.right = false;
  state.inputs.pointers.clear();
  audio.setState({ speed: 0, air: 0, coffee: 0, paused: true });
  audio.sfx(reason === "crash" ? "crash" : "ui");
}

function registerPointer(event) {
  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * W;
  const y = ((event.clientY - rect.top) / rect.height) * H;
  if (y < 112 || state.mode !== "playing" || state.paused) return;
  const side = x < W * 0.44 ? "left" : "right";
  state.inputs.pointers.set(event.pointerId, side);
  updatePointerInputs();
}

function releasePointer(event) {
  state.inputs.pointers.delete(event.pointerId);
  updatePointerInputs();
}

function updatePointerInputs() {
  state.inputs.left = state.inputs.keys.left || [...state.inputs.pointers.values()].includes("left");
  state.inputs.right = state.inputs.keys.right || [...state.inputs.pointers.values()].includes("right");
}

canvas.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  canvas.setPointerCapture?.(event.pointerId);
  registerPointer(event);
});
canvas.addEventListener("pointerup", releasePointer);
canvas.addEventListener("pointercancel", releasePointer);
canvas.addEventListener("lostpointercapture", releasePointer);

window.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") state.inputs.keys.left = true;
  if (event.key === "ArrowRight" || event.key.toLowerCase() === "d" || event.code === "Space") state.inputs.keys.right = true;
  updatePointerInputs();
  if ((event.key === "Enter" || event.code === "Space") && state.mode !== "playing") resetGame();
  if (event.key.toLowerCase() === "p" && state.mode === "playing") togglePause();
  if (event.key.toLowerCase() === "m") toggleMute();
  if (testMode && event.key.toLowerCase() === "b" && state.mode === "playing") state.battery = 0.3;
  if (event.key.toLowerCase() === "f") {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.querySelector("#game-shell").requestFullscreen?.();
  }
});

window.addEventListener("keyup", (event) => {
  if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") state.inputs.keys.left = false;
  if (event.key === "ArrowRight" || event.key.toLowerCase() === "d" || event.code === "Space") state.inputs.keys.right = false;
  updatePointerInputs();
});

startButton.addEventListener("click", resetGame);
restartButton.addEventListener("click", resetGame);
muteButton.addEventListener("click", () => toggleMute());
pauseButton.addEventListener("click", () => togglePause());

function toggleMute() {
  const muted = audio.toggleMute();
  muteButton.setAttribute("aria-label", muted ? "Unmute audio" : "Mute audio");
  muteButton.setAttribute("aria-pressed", muted ? "true" : "false");
}

function togglePause() {
  if (state.mode !== "playing") return;
  state.paused = !state.paused;
  pauseButton.setAttribute("aria-label", state.paused ? "Resume game" : "Pause game");
  pauseButton.setAttribute("aria-pressed", state.paused ? "true" : "false");
  state.inputs.left = false;
  state.inputs.right = false;
  state.inputs.keys.left = false;
  state.inputs.keys.right = false;
  state.inputs.pointers.clear();
  audio.setState({
    speed: Math.abs(state.player.vx),
    air: state.player.airTime,
    coffee: state.coffee,
    battery: state.battery,
    paused: state.paused,
  });
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden && state.mode === "playing" && !state.paused) togglePause();
});

function addEffect(cell, x, y, size, life = 0.55, rotation = 0, screen = false) {
  state.effects.push({
    cell,
    x,
    y,
    size,
    life,
    maxLife: life,
    rotation,
    screen,
  });
}

function triggerTrick(title, sub, points) {
  state.trickText = title;
  state.trickSub = sub;
  state.trickTimer = 1.25;
  state.trickScale = 1.46;
  state.score += points;
  state.combo += 1;
  state.comboTimer = 2;
  audio.sfx("trick");
  addEffect(0, state.player.x - 10, state.player.y - 110, 210, 0.62, -0.08);
}

function collect(item) {
  item.collected = true;
  if (item.type === "battery") {
    state.battery = Math.min(100, state.battery + 16);
    state.score += 250;
    state.flash = 0.45;
    state.trickText = "FULL CHARGE";
    state.trickSub = "+250";
    state.trickTimer = 0.85;
    state.trickScale = 1.25;
    addEffect(3, item.x, item.y, 165, 0.55);
    audio.sfx("battery");
  } else if (item.type === "coffee") {
    state.coffee = 4.2;
    state.battery = Math.min(100, state.battery + 6);
    state.score += 350;
    state.trickText = "OVERTIME";
    state.trickSub = "COFFEE TORQUE";
    state.trickTimer = 1;
    state.trickScale = 1.32;
    addEffect(4, item.x, item.y, 180, 0.6);
    audio.sfx("coffee");
  } else if (item.type === "binder") {
    state.battery = Math.max(0, state.battery - 24);
    state.player.vx *= 0.72;
    state.player.vy -= 280;
    state.player.av -= 2.4;
    state.shake = 10;
    state.flash = -0.55;
    state.combo = 0;
    state.trickText = "PAPERWORK";
    state.trickSub = "HARD STOP";
    state.trickTimer = 0.85;
    addEffect(2, item.x, item.y, 180, 0.65);
    audio.sfx("crash");
  } else {
    state.score += 500;
    state.trickText = "YEAH!";
    state.trickSub = "REVIEW PASSED";
    state.trickTimer = 1.1;
    state.trickScale = 1.48;
    addEffect(0, item.x, item.y, 210, 0.68);
    audio.sfx("trick");
  }
}

function sampleChairContacts(p) {
  const cosine = Math.cos(p.angle);
  const sine = Math.sin(p.angle);
  return CONTACT_LOCAL.map((local) => {
    const rx = local.x * cosine - local.y * sine;
    const ry = local.x * sine + local.y * cosine;
    const x = p.x + rx;
    const y = p.y + ry;
    const ground = terrainY(x);
    const slopeAngle = Math.atan(terrainSlope(x));
    const nx = Math.sin(slopeAngle);
    const ny = -Math.cos(slopeAngle);
    const velocityX = p.vx - p.av * ry;
    const velocityY = p.vy + p.av * rx;
    const normalVelocity = velocityX * nx + velocityY * ny;
    const penetration = y + local.radius - ground;
    return {
      ...local,
      rx,
      ry,
      worldX: x,
      worldY: y,
      ground,
      slopeAngle,
      nx,
      ny,
      normalVelocity,
      penetration,
      contact: penetration >= -14 && normalVelocity < 180,
    };
  });
}

function bodyCrashRadius(p) {
  return 24 + Math.abs(Math.sin(p.angle)) * 38;
}

function update(dt) {
  simulationSteps += 1;
  state.elapsed += dt;
  if (state.mode !== "playing" || state.paused) {
    updatePresentation(dt);
    audio.update();
    return;
  }

  state.runTime += dt;
  state.coffee = Math.max(0, state.coffee - dt);
  state.comboTimer = Math.max(0, state.comboTimer - dt);
  if (state.comboTimer <= 0) state.combo = 0;
  state.trickTimer = Math.max(0, state.trickTimer - dt);
  state.trickScale = damp(state.trickScale, 1, 0.085, dt);
  state.landTimer = Math.max(0, state.landTimer - dt);
  state.flash = damp(state.flash, 0, 0.08, dt);
  state.shake = damp(state.shake, 0, reducedMotion ? 0.02 : 0.09, dt);
  state.shakeAngle = damp(state.shakeAngle, 0, 0.1, dt);
  ensureCollectibles();

  const p = state.player;
  p.wasGrounded = p.grounded;
  const rightHeld = state.inputs.right;
  const brake = state.inputs.left;
  const throttle = rightHeld && state.battery > 0;
  const both = rightHeld && brake;
  const boost = state.coffee > 0;
  const gravity = 1740;
  const topSpeed = boost ? 2380 : 1980;
  const driveAccel = boost ? 1960 : 1580;
  const groundBefore = terrainY(p.x);
  const tangentAngle = Math.atan(terrainSlope(p.x));
  const tx = Math.cos(tangentAngle);
  const ty = Math.sin(tangentAngle);

  p.vy += gravity * dt;

  if (p.grounded) {
    let tangential = p.vx * tx + p.vy * ty;
    if (throttle) {
      const falloff = 1 - clamp(Math.abs(tangential) / topSpeed, 0, 0.94);
      tangential += driveAccel * (0.35 + falloff * 0.65) * dt;
      state.battery = Math.max(0, state.battery - (boost ? 7.6 : 6.7) * dt);
    } else {
      state.battery = Math.max(0, state.battery - 0.28 * dt);
    }
    if (brake) tangential = Math.max(0, tangential - (both ? 1820 : 1320) * dt);
    tangential *= Math.pow(throttle ? 0.992 : 0.972, dt * 60);
    tangential = clamp(tangential, -280, topSpeed);
    p.vx = tx * tangential;
    p.vy = ty * tangential + Math.min(p.vy, 90);

    const lean = both ? 0 : throttle ? 0.055 : brake ? -0.14 : 0;
    p.av += angleDelta(tangentAngle + lean, p.angle) * 42 * dt;
    p.av *= Math.pow(0.14, dt);
  } else {
    const airTorque = both ? 15.2 : 12.4;
    if (rightHeld) p.av += airTorque * dt;
    if (brake) p.av -= airTorque * dt;
    p.av *= Math.pow(0.49, dt);
    p.av = clamp(p.av, -7.2, 7.2);
    p.rotationAccum += p.av * dt;
  }

  p.vx *= Math.pow(0.965, dt);
  p.vy *= Math.pow(0.992, dt);
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.angle += p.av * dt;

  const contacts = sampleChairContacts(p);
  const rear = contacts[0];
  const front = contacts[1];
  p.rearContact = rear.contact;
  p.frontContact = front.contact;
  const supporting = contacts.filter((contact) => contact.contact);
  p.grounded = supporting.length > 0;

  if (p.grounded) {
    p.groundGrace = 0.075;
    const correction = clamp(Math.max(0, ...supporting.map((contact) => contact.penetration)), 0, 24);
    if (correction > 0) {
      const normalX = supporting.reduce((sum, contact) => sum + contact.nx, 0) / supporting.length;
      const normalY = supporting.reduce((sum, contact) => sum + contact.ny, 0) / supporting.length;
      p.x += normalX * correction;
      p.y += normalY * correction;
    }

    const contactSpan = front.worldX - rear.worldX;
    const supportAngle =
      Math.abs(contactSpan) > 24
        ? Math.atan2(front.ground - rear.ground, contactSpan)
        : Math.atan(terrainSlope(p.x));
    const normalX = -Math.sin(supportAngle);
    const normalY = Math.cos(supportAngle);
    const landingImpact = Math.max(0, p.vx * normalX + p.vy * normalY);
    const landingTx = Math.cos(supportAngle);
    const landingTy = Math.sin(supportAngle);
    let along = p.vx * landingTx + p.vy * landingTy;
    const alignment = Math.abs(angleDelta(supportAngle, p.angle));
    const genuineLanding = !p.wasGrounded && p.airTime >= 0.06;

    if (genuineLanding) {
      const retention = alignment < 0.4 ? 0.97 : alignment < 0.8 ? 0.86 : 0.72;
      along *= retention;
    }
    p.vx = landingTx * along;
    p.vy = landingTy * along;

    if (genuineLanding) {
      const crashed = handleLanding(landingImpact, alignment);
      if (crashed) {
        updateCamera(dt);
        updatePresentation(dt);
        return;
      }
      p.angle = Math.atan2(Math.sin(p.angle), Math.cos(p.angle));
    } else if (p.airTime < 0.06) {
      p.airTime = 0;
      p.takeoffFired = false;
    }

    const spring = supporting.length === 2 ? 8.2 : 3.2;
    p.av += angleDelta(supportAngle, p.angle) * spring * dt;
    p.angle += angleDelta(supportAngle, p.angle) * clamp(dt * (supporting.length === 2 ? 5.2 : 1.8), 0, 1);
  } else {
    p.groundGrace = Math.max(0, p.groundGrace - dt);
    p.airTime += dt;
    p.airPeakY = Math.min(p.airPeakY, p.y);
    if (p.airTime <= dt * 1.5) {
      p.airStartY = groundBefore;
      p.airPeakY = p.y;
      p.rotationAccum = 0;
    }
    if (p.airTime >= 0.05 && !p.takeoffFired) {
      p.takeoffFired = true;
      audio.sfx("takeoff");
      addEffect(5, p.x - 54, p.y + 35, 100, 0.38, tangentAngle);
    }

    const bodyClearance = bodyCrashRadius(p);
    if (p.y + bodyClearance > terrainY(p.x) + 8 && Math.abs(angleDelta(Math.atan(terrainSlope(p.x)), p.angle)) > 1.15) {
      p.airTime = 0;
      p.rotationAccum = 0;
      endGame("crash");
      updateCamera(dt);
      updatePresentation(dt);
      return;
    }
  }

  state.distance = Math.max(state.distance, (p.x - 220) / 12);
  state.score += Math.max(0, p.vx) * dt * (boost ? 0.052 : 0.032);

  for (const item of state.collectibles) {
    if (item.collected || item.x < p.x - 900) continue;
    const bobY = item.y + Math.sin(state.elapsed * 3.2 + item.phase) * 8;
    const dx = item.x - p.x;
    const dy = bobY - p.y;
    if (dx * dx + dy * dy < 78 * 78) collect(item);
  }
  state.collectibles = state.collectibles.filter((item) => !item.collected && item.x > p.x - 1200);

  if (state.battery <= 0) {
    state.criticalTimer += dt;
    if (Math.abs(p.vx) < 48) state.stallTimer += dt;
    else state.stallTimer = 0;
  } else {
    state.criticalTimer = 0;
    state.stallTimer = 0;
  }
  if (state.stallTimer > 1.25) endGame("battery");
  if (p.y > terrainY(p.x) + 620) endGame("crash");
  if (state.mode !== "playing") {
    updateCamera(dt);
    updatePresentation(dt);
    return;
  }

  updateCamera(dt);
  updatePresentation(dt);
  audio.setState({ speed: Math.abs(p.vx), air: p.airTime, coffee: state.coffee, battery: state.battery, paused: false });
  audio.update();
}

function handleLanding(impact, alignment) {
  const p = state.player;
  const flips = Math.floor((Math.abs(p.rotationAccum) + 0.55) / (Math.PI * 2));
  const hugeAir = p.airTime >= 1.5 || p.airStartY - p.airPeakY > 330;
  const bigAir = p.airTime >= 0.86;
  const perfect = alignment < 0.34 && impact < 760;
  const bodyFirst = alignment > 1.25 && impact > 670;

  p.impactSpeed = impact;
  state.landTimer = 0.24;
  state.shake = reducedMotion ? 1 : clamp(impact / 95, 2, 9);
  state.shakeAngle = reducedMotion ? 0 : clamp(impact / 9000, 0, 0.006);
  addEffect(2, p.x - 35, terrainY(p.x) - 22, clamp(impact * 0.22, 95, 190), 0.55, Math.atan(terrainSlope(p.x)));
  audio.sfx("landing", clamp(impact / 700, 0.45, 1.2));
  p.airTime = 0;
  p.rotationAccum = 0;

  if (bodyFirst) {
    endGame("crash");
    return true;
  }
  if (flips >= 2) triggerTrick("DOUBLE FLIP", perfect ? "PERFECT REVIEW" : "SIGNED OFF", 2400);
  else if (flips === 1) triggerTrick("CHAIRMAIL", perfect ? "PERFECT LANDING" : "FULL ROTATION", 1200);
  else if (hugeAir) triggerTrick("YEAH!", perfect ? "HUGE AIR · CLEAN DESK" : "HUGE AIR", 850);
  else if (bigAir) triggerTrick("DESK POP", perfect ? "PERFECT LANDING" : "BIG AIR", 420);
  else if (perfect && impact > 260) {
    state.score += 90;
    state.trickText = "CLEAN DESK";
    state.trickSub = "+90";
    state.trickTimer = 0.6;
    state.trickScale = 1.16;
  }
  return false;
}

function updateCamera(dt) {
  const p = state.player;
  const cam = state.camera;
  const speed = Math.max(0, p.vx);
  const lookAhead = 75 + clamp(speed / 1760, 0, 1) * 260 + p.vx * 0.11;
  const landingX = p.x + lookAhead + Math.max(0, p.vx) * Math.min(0.28, p.airTime * 0.14);
  const landingY = terrainY(landingX) - 78;
  const verticalBlend = p.grounded ? 0.42 : p.vy > 0 ? 0.58 : 0.34;
  cam.targetX = p.x + lookAhead;
  cam.targetY = p.y * (1 - verticalBlend) + landingY * verticalBlend;

  const speedZoom = 1.06 - clamp(speed / 1900, 0, 1) * 0.19;
  const airZoom = clamp(p.airTime / 1.7, 0, 1) * 0.12;
  const heightZoom = clamp((p.airStartY - p.y) / 430, 0, 1) * 0.08;
  const spanX = Math.abs(landingX - p.x) + 360;
  const spanY = Math.abs(landingY - p.y) + 280;
  const boundsZoom = Math.min((W * 0.78) / spanX, (H * 0.68) / spanY);
  const rawZoom = clamp(Math.min(speedZoom - Math.max(airZoom, heightZoom), boundsZoom), 0.76, 1.08);
  cam.targetZoom += clamp(rawZoom - cam.targetZoom, -0.05, 0.05);

  cam.x = damp(cam.x, cam.targetX, 0.18, dt);
  cam.y = damp(cam.y, cam.targetY, p.grounded ? 0.22 : 0.28, dt);
  cam.zoom = damp(cam.zoom, cam.targetZoom, 0.29, dt);
  const screenX = W * 0.42 + (p.x - cam.x) * cam.zoom;
  const minScreenX = W * 0.3;
  const maxScreenX = W * 0.39;
  if (screenX < minScreenX) {
    const desiredX = p.x + (W * 0.42 - minScreenX) / cam.zoom;
    cam.x = damp(cam.x, desiredX, 0.08, dt);
  } else if (screenX > maxScreenX) {
    const desiredX = p.x + (W * 0.42 - maxScreenX) / cam.zoom;
    cam.x = damp(cam.x, desiredX, 0.08, dt);
  }
  const targetRoll = reducedMotion || !p.grounded ? 0 : clamp(Math.atan(terrainSlope(p.x)) * 0.055, -0.022, 0.022);
  cam.roll = damp(cam.roll, targetRoll, 0.22, dt);
}

function updatePresentation(dt) {
  for (const effect of state.effects) effect.life -= dt;
  state.effects = state.effects.filter((effect) => effect.life > 0);
}

function roundedRect(x, y, width, height, radius, fill, stroke = null, lineWidth = 0) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

function draw3DText(text, x, y, size, face = colors.white, options = {}) {
  const {
    align = "center",
    rotation = 0,
    stroke = 8,
    extrusion = Math.max(5, size * 0.1),
    alpha = 1,
    font = "Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif",
  } = options;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.font = `900 ${size}px ${font}`;
  ctx.lineJoin = "round";
  ctx.strokeStyle = colors.ink;
  ctx.lineWidth = stroke + 3;
  ctx.strokeText(text, extrusion * 0.7, extrusion);
  ctx.fillStyle = colors.ink;
  ctx.fillText(text, extrusion * 0.7, extrusion);
  ctx.strokeStyle = colors.nearInk;
  ctx.lineWidth = stroke;
  ctx.strokeText(text, 0, 0);
  ctx.fillStyle = face;
  ctx.fillText(text, 0, 0);
  ctx.globalAlpha *= 0.3;
  ctx.strokeStyle = colors.white;
  ctx.lineWidth = 1.5;
  ctx.strokeText(text, -1, -2);
  ctx.restore();
}

function drawFarBackground() {
  ctx.fillStyle = "#80b6c6";
  ctx.fillRect(0, 0, W, H);
  if (!images.far) return;
  const image = images.far;
  const drawH = H * 0.98;
  const drawW = (image.width / image.height) * drawH;
  const travel = reducedMotion ? 0 : state.camera.x * 0.015;
  let x = -(travel % drawW);
  while (x > 0) x -= drawW;
  for (; x < W; x += drawW) ctx.drawImage(image, x, -8, drawW, drawH);
}

function drawMidground() {
  if (!images.mid) return;
  const image = images.mid;
  const drawH = H * 0.61;
  const drawW = (image.width / image.height) * drawH;
  const travel = reducedMotion ? 0 : state.camera.x * 0.085;
  let x = -(travel % drawW);
  while (x > 0) x -= drawW;
  ctx.save();
  ctx.globalAlpha = 0.96;
  for (; x < W + drawW; x += drawW) ctx.drawImage(image, x, H * 0.26, drawW, drawH);
  ctx.restore();
}

function drawNearRidge() {
  const travel = reducedMotion ? 0 : state.camera.x * 0.18;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, H);
  for (let x = -40; x <= W + 40; x += 24) {
    const world = x + travel;
    const y = 520 + Math.sin(world / 190) * 34 + Math.sin(world / 73) * 11;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fillStyle = "rgb(16 37 61 / 48%)";
  ctx.fill();
  ctx.restore();
}

function visibleWorldBounds() {
  const half = W / Math.max(0.6, state.camera.zoom) * 0.78;
  return [state.camera.x - half, state.camera.x + half];
}

function buildTerrainPath(fromX, toX, depth = H * 3, offsetY = 0) {
  const path = new Path2D();
  path.moveTo(fromX, terrainY(fromX) + offsetY);
  for (let x = fromX; x <= toX + 20; x += 18) path.lineTo(x, terrainY(x) + offsetY);
  path.lineTo(toX + 50, depth);
  path.lineTo(fromX - 50, depth);
  path.closePath();
  return path;
}

function buildRoadPath(fromX, toX) {
  const path = new Path2D();
  path.moveTo(fromX, terrainY(fromX));
  for (let x = fromX; x <= toX + 20; x += 14) path.lineTo(x, terrainY(x));
  return path;
}

function drawTerrain() {
  const [fromX, toX] = visibleWorldBounds();
  const shadowPath = buildTerrainPath(fromX - 100, toX + 100, H * 4, 78);
  ctx.fillStyle = "rgb(10 22 40 / 42%)";
  ctx.fill(shadowPath);

  const groundPath = buildTerrainPath(fromX - 100, toX + 100, H * 4);
  ctx.save();
  ctx.fillStyle = dirtPattern || colors.dirt;
  ctx.globalAlpha = 0.98;
  ctx.fill(groundPath);
  ctx.restore();

  const road = buildRoadPath(fromX - 100, toX + 100);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = colors.nearInk;
  ctx.lineWidth = ROAD_HALF_WIDTH * 2 + 20;
  ctx.stroke(road);
  ctx.strokeStyle = colors.yellow;
  ctx.lineWidth = ROAD_HALF_WIDTH * 2 + 10;
  ctx.stroke(road);
  ctx.strokeStyle = roadPattern || colors.ink;
  ctx.lineWidth = ROAD_HALF_WIDTH * 2;
  ctx.stroke(road);

  ctx.setLineDash([34, 32]);
  ctx.lineDashOffset = -state.camera.x * 0.28;
  ctx.strokeStyle = "rgb(255 253 244 / 72%)";
  ctx.lineWidth = 4;
  ctx.stroke(road);
  ctx.setLineDash([]);
}

function drawAtlasSprite(image, cols, rows, cell, x, y, size, rotation = 0, alpha = 1) {
  if (!image) return;
  const col = cell % cols;
  const row = Math.floor(cell / cols);
  const sw = image.width / cols;
  const sh = image.height / rows;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.drawImage(image, col * sw, row * sh, sw, sh, -size / 2, -size / 2, size, size);
  ctx.restore();
}

function drawCollectibles() {
  for (const item of state.collectibles) {
    if (item.collected) continue;
    if (Math.abs(item.x - state.camera.x) > W / state.camera.zoom) continue;
    const y = item.y + Math.sin(state.elapsed * 3.2 + item.phase) * 8;
    const cell = item.type === "battery" ? 0 : item.type === "coffee" ? 1 : item.type === "binder" ? 2 : 3;
    const pulse = 1 + Math.sin(state.elapsed * 5 + item.phase) * 0.035;
    drawAtlasSprite(images.pickups, 2, 2, cell, item.x, y, 627 * item.scale * pulse, 0, 1);
  }
}

function drawEffects(screenSpace) {
  for (const effect of state.effects) {
    if (effect.screen !== screenSpace) continue;
    const progress = 1 - effect.life / effect.maxLife;
    const alpha = Math.sin(Math.min(1, progress) * Math.PI);
    const size = effect.size * (0.72 + progress * 0.48);
    drawAtlasSprite(images.vfx, 3, 3, effect.cell, effect.x, effect.y, size, effect.rotation, alpha);
  }
}

function drawDebugArrow(fromX, fromY, toX, toY, color, label = "") {
  const angle = Math.atan2(toY - fromY, toX - fromX);
  const head = 11;
  ctx.save();
  ctx.strokeStyle = colors.nearInk;
  ctx.lineWidth = 9;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.strokeStyle = colors.nearInk;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(toX - Math.cos(angle - 0.55) * head, toY - Math.sin(angle - 0.55) * head);
  ctx.lineTo(toX - Math.cos(angle + 0.55) * head, toY - Math.sin(angle + 0.55) * head);
  ctx.closePath();
  ctx.stroke();
  ctx.fill();
  if (label) {
    ctx.font = "900 15px Impact, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.lineWidth = 5;
    ctx.strokeStyle = colors.nearInk;
    ctx.strokeText(label, toX + 9, toY - 6);
    ctx.fillStyle = color;
    ctx.fillText(label, toX + 9, toY - 6);
  }
  ctx.restore();
}

function drawPlayerColliders(p = state.player, { showGround = true, showVelocity = true } = {}) {
  const contacts = sampleChairContacts(p);
  const bodyRadius = bodyCrashRadius(p);
  const bodyActive =
    !p.grounded &&
    p.y + bodyRadius > terrainY(p.x) + 8 &&
    Math.abs(angleDelta(Math.atan(terrainSlope(p.x)), p.angle)) > 1.15;

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.strokeStyle = colors.nearInk;
  ctx.lineWidth = 13;
  ctx.beginPath();
  ctx.moveTo(contacts[0].worldX, contacts[0].worldY);
  ctx.lineTo(contacts[1].worldX, contacts[1].worldY);
  ctx.stroke();
  ctx.strokeStyle = colors.yellow;
  ctx.lineWidth = 6;
  ctx.stroke();

  ctx.setLineDash([10, 7]);
  ctx.fillStyle = bodyActive ? "rgb(217 58 49 / 34%)" : "rgb(255 216 61 / 16%)";
  ctx.strokeStyle = colors.nearInk;
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.arc(p.x, p.y, bodyRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = bodyActive ? colors.red : colors.yellow;
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.setLineDash([]);

  for (const contact of contacts) {
    const active = contact.contact;
    ctx.fillStyle = active ? "rgb(183 219 53 / 42%)" : "rgb(121 183 201 / 24%)";
    ctx.strokeStyle = colors.nearInk;
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.arc(contact.worldX, contact.worldY, contact.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = active ? colors.lime : colors.cyan;
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.fillStyle = active ? colors.lime : colors.white;
    ctx.strokeStyle = colors.nearInk;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(contact.worldX, contact.worldY, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    if (showGround) {
      const contactY = contact.ground;
      ctx.strokeStyle = active ? colors.lime : colors.cyan;
      ctx.lineWidth = 3;
      ctx.setLineDash(active ? [] : [7, 7]);
      ctx.beginPath();
      ctx.moveTo(contact.worldX, contact.worldY + contact.radius);
      ctx.lineTo(contact.worldX, contactY);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = active ? colors.lime : colors.cyan;
      ctx.strokeStyle = colors.nearInk;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.rect(contact.worldX - 5, contactY - 5, 10, 10);
      ctx.fill();
      ctx.stroke();
      drawDebugArrow(
        contact.worldX,
        contactY,
        contact.worldX + contact.nx * 58,
        contactY + contact.ny * 58,
        active ? colors.lime : colors.cyan,
        "N",
      );
    }

    const contactLabel = `${contact.name.toUpperCase()} ${active ? "ON" : "OFF"}`;
    const labelY = contact.worldY + contact.radius + 18;
    ctx.font = "900 14px Impact, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 5;
    ctx.strokeStyle = colors.nearInk;
    ctx.strokeText(contactLabel, contact.worldX, labelY);
    ctx.fillStyle = active ? colors.lime : colors.cyan;
    ctx.fillText(contactLabel, contact.worldX, labelY);
  }

  ctx.strokeStyle = colors.white;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(p.x - 13, p.y);
  ctx.lineTo(p.x + 13, p.y);
  ctx.moveTo(p.x, p.y - 13);
  ctx.lineTo(p.x, p.y + 13);
  ctx.stroke();
  ctx.fillStyle = colors.nearInk;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
  ctx.fill();

  if (showVelocity) {
    const speed = Math.hypot(p.vx, p.vy);
    const arrowLength = clamp(speed * 0.095, 70, 170);
    const speedScale = arrowLength / Math.max(1, speed);
    drawDebugArrow(
      p.x,
      p.y,
      p.x + p.vx * speedScale,
      p.y + p.vy * speedScale,
      colors.orange,
      "VELOCITY",
    );
  }

  ctx.font = "900 15px Impact, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.lineWidth = 5;
  ctx.strokeStyle = colors.nearInk;
  ctx.strokeText("BODY PROBE", p.x, p.y - bodyRadius - 24);
  ctx.fillStyle = bodyActive ? colors.red : colors.yellow;
  ctx.fillText("BODY PROBE", p.x, p.y - bodyRadius - 24);
  ctx.restore();
}

function beginWorldCamera() {
  const cam = state.camera;
  const shake = reducedMotion ? 0 : state.shake;
  const sx = Math.sin(state.elapsed * 163) * shake;
  const sy = Math.cos(state.elapsed * 191) * shake * 0.64;
  ctx.save();
  ctx.translate(W * 0.42 + sx, H * 0.58 + sy);
  ctx.rotate(cam.roll + Math.sin(state.elapsed * 137) * state.shakeAngle);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x, -cam.y);
}

function endWorldCamera() {
  ctx.restore();
}

function drawMeter(x, y, width, value, face, label) {
  ctx.save();
  ctx.translate(x, y);
  ctx.transform(1, 0, -0.12, 1, 0, 0);
  roundedRect(0, 7, width, 38, 8, colors.ink);
  roundedRect(0, 0, width, 38, 8, colors.white, colors.nearInk, 5);
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(7, 7, width - 14, 24, 4);
  ctx.clip();
  ctx.fillStyle = "#263653";
  ctx.fillRect(7, 7, width - 14, 24);
  ctx.fillStyle = face;
  ctx.fillRect(7, 7, (width - 14) * clamp(value / 100, 0, 1), 24);
  ctx.restore();
  ctx.restore();
  draw3DText(label, x + width / 2, y - 14, 21, colors.white, { stroke: 4, extrusion: 3 });
}

function drawHud() {
  draw3DText(`${Math.floor(state.distance)}`, 70, 54, 45, colors.white, { align: "left", stroke: 7, extrusion: 5 });
  draw3DText("M", 168, 57, 25, colors.yellow, { align: "left", stroke: 5, extrusion: 3 });
  drawMeter(232, 39, 210, state.battery, state.battery < 24 ? colors.red : colors.yellow, "BATTERY");
  drawMeter(474, 39, 160, (state.coffee / 4.2) * 100, colors.coffee, "COFFEE");
  draw3DText(`${Math.floor(state.score)}`, 1045, 54, 39, colors.yellow, { align: "right", stroke: 7, extrusion: 5 });
  draw3DText("SCORE", 1052, 20, 19, colors.white, { align: "right", stroke: 4, extrusion: 2 });

  roundedRect(1092, 26, 74, 52, 12, colors.white, colors.nearInk, 5);
  ctx.fillStyle = colors.ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "900 17px Impact, sans-serif";
  ctx.fillText(state.paused ? "PLAY" : "PAUSE", 1129, 52);
  roundedRect(1180, 26, 74, 52, 12, audio.muted ? colors.ink : colors.yellow, colors.nearInk, 5);
  ctx.fillStyle = audio.muted ? colors.white : colors.ink;
  ctx.fillText(audio.muted ? "MUTED" : "SOUND", 1217, 52);

  if (state.combo > 1) {
    draw3DText(`${state.combo}X CHAIN`, W / 2, 105, 26, colors.yellow, { stroke: 6, extrusion: 4 });
  }
  if (state.battery < 24) {
    const pulse = 0.65 + Math.sin(state.elapsed * 7) * 0.2;
    draw3DText("LOW BATTERY", 338, 109, 22, colors.white, { stroke: 5, extrusion: 3, alpha: pulse });
  }
}

function drawControls() {
  const activeLeft = state.inputs.left;
  const activeRight = state.inputs.right;
  ctx.save();
  ctx.globalAlpha = 0.58;
  ctx.fillStyle = activeLeft ? colors.yellow : colors.ink;
  ctx.beginPath();
  ctx.moveTo(0, H);
  ctx.lineTo(270, H);
  ctx.lineTo(220, H - 76);
  ctx.lineTo(0, H - 54);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = activeRight ? colors.yellow : colors.ink;
  ctx.beginPath();
  ctx.moveTo(W, H);
  ctx.lineTo(W - 315, H);
  ctx.lineTo(W - 250, H - 76);
  ctx.lineTo(W, H - 54);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  draw3DText("BRAKE · LEAN", 28, H - 34, 23, activeLeft ? colors.ink : colors.white, { align: "left", stroke: 5, extrusion: 3 });
  draw3DText("GO · LEAN", W - 28, H - 34, 23, activeRight ? colors.ink : colors.yellow, { align: "right", stroke: 5, extrusion: 3 });
}

function drawTrickCallout() {
  if (state.trickTimer <= 0) return;
  const alpha = clamp(state.trickTimer * 2.2, 0, 1);
  ctx.save();
  ctx.translate(W * 0.55, H * 0.29);
  ctx.scale(state.trickScale, state.trickScale);
  draw3DText(state.trickText, 0, 0, state.trickText === "YEAH!" ? 62 : 45, colors.yellow, {
    stroke: 9,
    extrusion: 8,
    rotation: -0.055,
    alpha,
  });
  draw3DText(state.trickSub, 4, 53, 20, colors.white, { stroke: 5, extrusion: 3, rotation: -0.025, alpha });
  ctx.restore();
}

function drawMenu() {
  drawFarBackground();
  drawMidground();
  drawNearRidge();
  ctx.fillStyle = "rgb(8 16 28 / 18%)";
  ctx.fillRect(0, 0, W, H);
  drawPlayerColliders(
    {
      x: 935,
      y: 370,
      vx: 850,
      vy: -210,
      angle: -0.14,
      av: 0.7,
      grounded: false,
    },
    { showGround: false },
  );
  ctx.save();
  ctx.translate(70, 125);
  ctx.rotate(-0.035);
  ctx.fillStyle = colors.yellow;
  ctx.strokeStyle = colors.nearInk;
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.roundRect(0, 0, 650, 285, 28);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  draw3DText("CHAIR RALLY", 390, 205, 78, colors.white, { stroke: 12, extrusion: 11, rotation: -0.035 });
  draw3DText("OVERTIME", 390, 293, 76, colors.yellow, { stroke: 12, extrusion: 11, rotation: -0.035 });
  draw3DText("THE PERFORMANCE REVIEW IS DOWNHILL", 390, 356, 23, colors.ink, { stroke: 0, extrusion: 0, rotation: -0.035 });
  roundedRect(455, 562, 370, 85, 18, colors.ink);
  roundedRect(455, 552, 370, 85, 18, colors.orange, colors.nearInk, 7);
  draw3DText("CLOCK IN", 640, 593, 38, colors.white, { stroke: 7, extrusion: 5 });
  draw3DText("HOLD RIGHT TO GO · LEFT TO LEAN BACK", 640, 678, 20, colors.white, { stroke: 5, extrusion: 3 });
}

function drawPause() {
  ctx.fillStyle = "rgb(8 16 28 / 68%)";
  ctx.fillRect(0, 0, W, H);
  draw3DText("ON HOLD", W / 2, H / 2 - 32, 80, colors.yellow, { stroke: 12, extrusion: 10 });
  draw3DText("TAP PLAY OR PRESS P", W / 2, H / 2 + 64, 26, colors.white, { stroke: 6, extrusion: 4 });
  roundedRect(1092, 26, 74, 52, 12, colors.yellow, colors.nearInk, 5);
  roundedRect(1180, 26, 74, 52, 12, audio.muted ? colors.ink : colors.white, colors.nearInk, 5);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "900 17px Impact, sans-serif";
  ctx.fillStyle = colors.ink;
  ctx.fillText("PLAY", 1129, 52);
  ctx.fillStyle = audio.muted ? colors.white : colors.ink;
  ctx.fillText(audio.muted ? "MUTED" : "SOUND", 1217, 52);
}

function resultCopy() {
  if (state.endReason === "crash") return ["CHAIRMAN DOWN", "THE FLOOR WON"];
  if (state.distance > 1000) return ["EXECUTIVE MILEAGE", "UNREASONABLY BILLABLE"];
  if (state.distance > 500) return ["SOLID OVERTIME", "NO FOLLOW-UP QUESTIONS"];
  return ["OUT OF OFFICE", "BATTERY DECLINED"];
}

function drawGameOver() {
  ctx.fillStyle = "rgb(8 16 28 / 68%)";
  ctx.fillRect(0, 0, W, H);
  const [title, sub] = resultCopy();
  ctx.save();
  ctx.translate(W / 2, H / 2 - 25);
  ctx.rotate(-0.025);
  ctx.fillStyle = colors.white;
  ctx.strokeStyle = colors.nearInk;
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.roundRect(-365, -230, 730, 410, 28);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  draw3DText(title, W / 2, 235, 62, state.endReason === "crash" ? colors.red : colors.yellow, { stroke: 10, extrusion: 9, rotation: -0.025 });
  draw3DText(sub, W / 2, 302, 24, colors.ink, { stroke: 0, extrusion: 0, rotation: -0.025 });
  draw3DText(`${Math.floor(state.distance)} M`, W / 2, 396, 84, colors.ink, { stroke: 0, extrusion: 0, rotation: -0.025 });
  draw3DText(`BEST ${state.best} M  ·  SCORE ${Math.floor(state.score)}`, W / 2, 470, 24, colors.ink, { stroke: 0, extrusion: 0, rotation: -0.025 });
  roundedRect(455, 562, 370, 85, 18, colors.ink);
  roundedRect(455, 552, 370, 85, 18, colors.orange, colors.nearInk, 7);
  draw3DText("RUN IT BACK", W / 2, 593, 36, colors.white, { stroke: 7, extrusion: 5 });
}

function render() {
  if (!assetsReady || state.mode === "menu") {
    drawMenu();
    return;
  }

  groundShader?.update(state.elapsed, state.camera.x, state.coffee > 0 ? 1 : 0);
  drawFarBackground();
  drawMidground();
  drawNearRidge();
  beginWorldCamera();
  drawTerrain();
  drawCollectibles();
  drawEffects(false);
  drawPlayerColliders();
  endWorldCamera();

  if (state.flash !== 0) {
    ctx.globalAlpha = Math.abs(state.flash) * 0.16;
    ctx.fillStyle = state.flash > 0 ? colors.yellow : colors.red;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }

  drawHud();
  draw3DText("PHYSICS VIEW", 780, 43, 21, colors.yellow, { stroke: 5, extrusion: 3 });
  drawControls();
  if (!state.paused) drawTrickCallout();
  drawEffects(true);
  if (state.paused) drawPause();
  if (state.mode === "over") drawGameOver();
}

let last = performance.now();
let accumulator = 0;
let deterministic = false;

function frame(now) {
  const delta = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!deterministic) {
    accumulator += delta;
    let steps = 0;
    while (accumulator >= STEP && steps < 8) {
      update(STEP);
      accumulator -= STEP;
      steps += 1;
    }
  }
  render();
  requestAnimationFrame(frame);
}

window.advanceTime = (ms) => {
  deterministic = true;
  deterministicRemainder += Math.max(0, ms) / 1000;
  while (deterministicRemainder >= STEP) {
    update(STEP);
    deterministicRemainder -= STEP;
  }
  render();
};

window.render_game_to_text = () =>
  JSON.stringify({
    coordinateSystem: "world x increases right; world y increases down; canvas 1280x720",
    mode: state.mode,
    paused: state.paused,
    player: {
      x: Math.round(state.player.x),
      y: Math.round(state.player.y),
      vx: Math.round(state.player.vx),
      vy: Math.round(state.player.vy),
      angle: Number(state.player.angle.toFixed(3)),
      angularVelocity: Number(state.player.av.toFixed(3)),
      grounded: state.player.grounded,
      rearContact: state.player.rearContact,
      frontContact: state.player.frontContact,
      groundGrace: Number(state.player.groundGrace.toFixed(3)),
      airTime: Number(state.player.airTime.toFixed(2)),
      terrainY: Number(terrainY(state.player.x).toFixed(2)),
      terrainSlope: Number(terrainSlope(state.player.x).toFixed(3)),
      debugRender: "colliders-only",
      colliders: sampleChairContacts(state.player).map((contact) => ({
        name: contact.name,
        centerX: Number(contact.worldX.toFixed(2)),
        centerY: Number(contact.worldY.toFixed(2)),
        radius: contact.radius,
        penetration: Number(contact.penetration.toFixed(2)),
        normalVelocity: Number(contact.normalVelocity.toFixed(2)),
        active: contact.contact,
      })),
      bodyProbeRadius: Number(bodyCrashRadius(state.player).toFixed(2)),
    },
    input: {
      leftBrakeLeanBack: state.inputs.left,
      rightGoLeanForward: state.inputs.right,
    },
    resources: {
      battery: Number(state.battery.toFixed(1)),
      coffeeSeconds: Number(state.coffee.toFixed(2)),
    },
    camera: {
      x: Math.round(state.camera.x),
      y: Math.round(state.camera.y),
      zoom: Number(state.camera.zoom.toFixed(3)),
      targetX: Number(state.camera.targetX.toFixed(2)),
      targetY: Number(state.camera.targetY.toFixed(2)),
      targetZoom: Number(state.camera.targetZoom.toFixed(3)),
    },
    visibleCollectibles: state.collectibles
      .filter((item) => !item.collected && Math.abs(item.x - state.camera.x) < 1100)
      .map((item) => ({ type: item.type, x: Math.round(item.x), y: Math.round(item.y) })),
    distanceMeters: Math.floor(state.distance),
    score: Math.floor(state.score),
    combo: state.combo,
    trick: state.trickTimer > 0 ? state.trickText : null,
    shaderGround: Boolean(groundShader?.isShader),
    muted: audio.muted,
    simulationSteps,
  });

assetsPromise.finally(() => render());
requestAnimationFrame(frame);
