const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
const startButton = document.querySelector("#start-button");
const againButton = document.querySelector("#again-button");

const W = 430;
const H = 932;
const ROUND_SECONDS = 20;
const DT = 1 / 60;
const palette = {
  ink: "#172033",
  paper: "#f2eadb",
  cream: "#fff6df",
  orange: "#f36b38",
  lime: "#b7d84b",
  sage: "#798b5f",
  blue: "#6b8baa",
  red: "#da3a31",
};

const characterSheet = new Image();
characterSheet.src = "./assets/character-sheet.png";
const propsSheet = new Image();
propsSheet.src = "./assets/props-sheet.png";

const propDefs = [
  { name: "coffee", col: 0, row: 0, points: 2, radius: 35, boost: true },
  { name: "desk phone", col: 1, row: 0, points: -1, radius: 42, hazard: true },
  { name: "stapler", col: 2, row: 0, points: -1, radius: 37, hazard: true },
  { name: "notebook", col: 0, row: 1, points: 1, radius: 38 },
  { name: "green pen", col: 1, row: 1, points: 3, radius: 28, boost: true },
  { name: "plant", col: 2, row: 1, points: 2, radius: 40 },
  { name: "office chair", col: 0, row: 2, points: 2, radius: 43 },
  { name: "paper plane", col: 1, row: 2, points: 1, radius: 32 },
  { name: "donut", col: 2, row: 2, points: 2, radius: 36, boost: true },
  { name: "paper ball", col: 0, row: 3, points: 1, radius: 31 },
  { name: "fan", col: 1, row: 3, points: 2, radius: 38 },
  { name: "contract", col: 2, row: 3, points: 2, radius: 41 },
];

const state = {
  mode: "menu",
  score: 0,
  best: Number(localStorage.getItem("hold-please-best") || 0),
  combo: 0,
  maxCombo: 0,
  signal: 3,
  time: ROUND_SECONDS,
  launchCooldown: 0,
  boostTimer: 0,
  hitWindow: 0,
  flash: 0,
  shake: 0,
  banner: "",
  bannerTimer: 0,
  player: { x: W / 2, y: 710, vx: 0, vy: 0, r: 49, rot: 0, spin: 0 },
  props: [],
  sparks: [],
  elapsed: 0,
};

let last = performance.now();
let deterministic = false;

function resetGame() {
  state.mode = "playing";
  state.score = 0;
  state.combo = 0;
  state.maxCombo = 0;
  state.signal = 3;
  state.time = ROUND_SECONDS;
  state.launchCooldown = 0;
  state.boostTimer = 0;
  state.hitWindow = 0;
  state.flash = 0;
  state.shake = 0;
  state.banner = "STAY ON THE LINE";
  state.bannerTimer = 1.2;
  state.elapsed = 0;
  Object.assign(state.player, { x: W / 2, y: 710, vx: 0, vy: -40, rot: 0, spin: 0 });
  state.props = [];
  state.sparks = [];
  const seed = [0, 4, 7, 2, 9, 5, 11];
  seed.forEach((defIndex, i) => spawnProp(defIndex, i));
  startButton.hidden = true;
  againButton.hidden = true;
}

function spawnProp(defIndex = Math.floor(Math.random() * propDefs.length), slot = 0) {
  const def = propDefs[defIndex];
  const x = 48 + Math.random() * (W - 96);
  const y = 160 + ((slot * 91 + Math.random() * 70) % 470);
  state.props.push({
    ...def,
    x,
    y,
    homeX: x,
    homeY: y,
    vx: (Math.random() - 0.5) * 90,
    vy: (Math.random() - 0.5) * 60,
    rot: (Math.random() - 0.5) * 0.5,
    spin: (Math.random() - 0.5) * 1.4,
    active: true,
    respawn: 0,
    scale: 0.72 + Math.random() * 0.13,
  });
}

function launchToward(x, y) {
  if (state.mode !== "playing" || state.launchCooldown > 0) return;
  const p = state.player;
  const dx = x - p.x;
  const dy = y - p.y;
  const len = Math.max(1, Math.hypot(dx, dy));
  const power = state.boostTimer > 0 ? 650 : 535;
  p.vx += (dx / len) * power;
  p.vy += (dy / len) * power;
  const speed = Math.hypot(p.vx, p.vy);
  if (speed > 780) {
    p.vx = (p.vx / speed) * 780;
    p.vy = (p.vy / speed) * 780;
  }
  p.spin += (dx >= 0 ? 1 : -1) * 3.8;
  state.launchCooldown = 0.16;
  state.hitWindow = 1.15;
  state.shake = 4;
}

function pointerToGame(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * W,
    y: ((event.clientY - rect.top) / rect.height) * H,
  };
}

canvas.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  const point = pointerToGame(event);
  if (state.mode === "playing") launchToward(point.x, point.y);
});

startButton.addEventListener("click", resetGame);
againButton.addEventListener("click", resetGame);

window.addEventListener("keydown", (event) => {
  if (event.key.toLowerCase() === "f") {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.querySelector("#game-shell").requestFullscreen?.();
  }
  if ((event.key === " " || event.key === "Enter") && state.mode !== "playing") resetGame();
  if (state.mode === "playing") {
    const targets = {
      ArrowLeft: [40, state.player.y],
      ArrowRight: [W - 40, state.player.y],
      ArrowUp: [state.player.x, 120],
      ArrowDown: [state.player.x, H - 80],
    };
    if (targets[event.key]) launchToward(...targets[event.key]);
  }
});

function update(dt) {
  if (state.mode !== "playing") return;
  state.elapsed += dt;
  state.time = Math.max(0, state.time - dt);
  state.launchCooldown = Math.max(0, state.launchCooldown - dt);
  state.boostTimer = Math.max(0, state.boostTimer - dt);
  state.hitWindow = Math.max(0, state.hitWindow - dt);
  state.bannerTimer = Math.max(0, state.bannerTimer - dt);
  state.flash = Math.max(0, state.flash - dt * 2.4);
  state.shake *= Math.pow(0.04, dt);

  const p = state.player;
  p.vy += 510 * dt;
  p.vx *= Math.pow(0.72, dt);
  p.vy *= Math.pow(0.91, dt);
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.rot += p.spin * dt;
  p.spin *= Math.pow(0.52, dt);

  collideWall(p, 26, W - 26, 115, H - 48, 0.78);

  for (const prop of state.props) {
    if (!prop.active) {
      prop.respawn -= dt;
      if (prop.respawn <= 0) {
        prop.active = true;
        prop.x = 50 + Math.random() * (W - 100);
        prop.y = 155 + Math.random() * 430;
        prop.vx = (Math.random() - 0.5) * 100;
        prop.vy = (Math.random() - 0.5) * 80;
      }
      continue;
    }
    prop.vy += 52 * dt;
    prop.x += prop.vx * dt;
    prop.y += prop.vy * dt;
    prop.rot += prop.spin * dt;
    prop.vx *= Math.pow(0.91, dt);
    prop.vy *= Math.pow(0.94, dt);
    collideWall(prop, 16, W - 16, 125, H - 55, 0.9);

    const dx = prop.x - p.x;
    const dy = prop.y - p.y;
    const minDist = p.r + prop.radius * prop.scale * 0.68;
    if (state.hitWindow > 0 && dx * dx + dy * dy < minDist * minDist) hitProp(prop, dx, dy);
  }

  state.sparks.forEach((spark) => {
    spark.life -= dt;
    spark.x += spark.vx * dt;
    spark.y += spark.vy * dt;
    spark.vy += 280 * dt;
    spark.rot += spark.spin * dt;
  });
  state.sparks = state.sparks.filter((spark) => spark.life > 0);

  if (state.time <= 0 || state.signal <= 0) endGame();
}

function collideWall(body, left, right, top, bottom, bounce) {
  const r = body.r || body.radius * body.scale * 0.55;
  if (body.x - r < left) {
    body.x = left + r;
    body.vx = Math.abs(body.vx) * bounce;
    body.spin += 1.1;
  } else if (body.x + r > right) {
    body.x = right - r;
    body.vx = -Math.abs(body.vx) * bounce;
    body.spin -= 1.1;
  }
  if (body.y - r < top) {
    body.y = top + r;
    body.vy = Math.abs(body.vy) * bounce;
  } else if (body.y + r > bottom) {
    body.y = bottom - r;
    body.vy = -Math.abs(body.vy) * bounce;
    body.spin += body.vx * 0.003;
  }
}

function hitProp(prop, dx, dy) {
  const p = state.player;
  const len = Math.max(1, Math.hypot(dx, dy));
  const impact = Math.max(320, Math.hypot(p.vx, p.vy));
  prop.vx = (dx / len) * impact * 0.85 + p.vx * 0.35;
  prop.vy = (dy / len) * impact * 0.85 + p.vy * 0.35;
  prop.spin += (Math.random() - 0.5) * 9;
  p.vx -= (dx / len) * 105;
  p.vy -= (dy / len) * 105;
  prop.active = false;
  prop.respawn = 0.55 + Math.random() * 0.55;
  state.shake = prop.hazard ? 13 : 8;
  state.flash = prop.hazard ? -0.75 : 0.5;

  if (prop.hazard) {
    state.signal -= 1;
    state.combo = 0;
    state.banner = prop.name === "stapler" ? "HARD STOP" : "WRONG LINE";
    state.bannerTimer = 0.75;
  } else {
    state.combo += 1;
    state.maxCombo = Math.max(state.maxCombo, state.combo);
    const multiplier = 1 + Math.min(4, Math.floor(state.combo / 3));
    state.score += prop.points * multiplier;
    if (prop.boost) {
      state.boostTimer = 2.5;
      state.banner = prop.name === "coffee" ? "DOUBLE SHOT" : prop.name === "donut" ? "SNACK BREAK" : "PEN MODE";
      state.bannerTimer = 0.65;
    } else if (state.combo === 5 || state.combo === 10 || state.combo === 15) {
      state.banner = `${state.combo} HIT CALL`;
      state.bannerTimer = 0.65;
    }
  }

  for (let i = 0; i < 7; i += 1) {
    state.sparks.push({
      x: prop.x,
      y: prop.y,
      vx: (Math.random() - 0.5) * 280,
      vy: -60 - Math.random() * 230,
      life: 0.35 + Math.random() * 0.35,
      rot: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 7,
      def: propDefs[prop.hazard ? 2 : 9],
    });
  }
}

function endGame() {
  if (state.mode !== "playing") return;
  state.mode = "over";
  state.best = Math.max(state.best, state.score);
  localStorage.setItem("hold-please-best", String(state.best));
  againButton.hidden = false;
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

function drawBackground() {
  ctx.fillStyle = palette.paper;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#e1d7c5";
  ctx.fillRect(0, 105, W, H - 105);
  ctx.strokeStyle = "#c6baa5";
  ctx.lineWidth = 2;
  for (let y = 126; y < H; y += 58) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y - 34);
    ctx.stroke();
  }
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = palette.ink;
  for (let x = 24; x < W; x += 52) {
    ctx.fillRect(x, 108, 2, H - 108);
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = palette.ink;
  ctx.fillRect(0, 0, W, 105);
  ctx.fillStyle = palette.orange;
  ctx.fillRect(0, 101, W, 4);
}

function drawCharacter(pose = 0, x = state.player.x, y = state.player.y, rotation = state.player.rot, scale = 0.38) {
  if (!characterSheet.complete) return;
  const cell = characterSheet.width / 2;
  const col = pose % 2;
  const row = Math.floor(pose / 2);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  const size = cell * scale;
  ctx.drawImage(characterSheet, col * cell, row * cell, cell, cell, -size / 2, -size / 2, size, size);
  ctx.restore();
}

function drawProp(prop, alpha = 1, overrideScale = null) {
  if (!propsSheet.complete) return;
  const cellW = propsSheet.width / 3;
  const cellH = propsSheet.height / 4;
  const scale = overrideScale ?? prop.scale;
  const size = Math.min(cellW, cellH) * scale * 0.42;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(prop.x, prop.y);
  ctx.rotate(prop.rot);
  ctx.drawImage(
    propsSheet,
    prop.col * cellW,
    prop.row * cellH,
    cellW,
    cellH,
    -size * 0.67,
    -size * 0.5,
    size * 1.34,
    size,
  );
  ctx.restore();
}

function drawHud() {
  ctx.textBaseline = "middle";
  ctx.fillStyle = palette.cream;
  ctx.font = "900 16px Inter, system-ui";
  ctx.textAlign = "left";
  ctx.fillText("HOLD PLEASE", 22, 31);
  ctx.fillStyle = palette.orange;
  ctx.font = "900 33px Inter, system-ui";
  ctx.fillText(String(state.score).padStart(3, "0"), 20, 69);

  ctx.textAlign = "center";
  ctx.fillStyle = palette.cream;
  ctx.font = "900 27px Inter, system-ui";
  ctx.fillText(Math.ceil(state.time).toString(), W / 2, 52);

  ctx.textAlign = "right";
  ctx.font = "800 12px Inter, system-ui";
  ctx.fillStyle = "#aab1bd";
  ctx.fillText("CALL SIGNAL", W - 20, 29);
  for (let i = 0; i < 3; i += 1) {
    roundedRect(W - 104 + i * 30, 48, 21, 27, 6, i < state.signal ? palette.lime : "#41495a");
  }

  if (state.combo >= 2) {
    roundedRect(18, 121, 114, 39, 12, palette.cream, palette.ink, 3);
    ctx.fillStyle = palette.ink;
    ctx.textAlign = "center";
    ctx.font = "900 15px Inter, system-ui";
    ctx.fillText(`${state.combo} HIT COMBO`, 75, 141);
  }
  if (state.boostTimer > 0) {
    roundedRect(W - 132, 121, 114, 39, 12, palette.lime, palette.ink, 3);
    ctx.fillStyle = palette.ink;
    ctx.textAlign = "center";
    ctx.font = "900 14px Inter, system-ui";
    ctx.fillText("BOOSTED", W - 75, 141);
  }
}

function drawCallToAction(label) {
  const x = 80;
  const y = 832;
  roundedRect(x, y + 8, W - x * 2, 62, 18, palette.ink);
  roundedRect(x, y, W - x * 2, 62, 18, palette.orange, palette.ink, 4);
  ctx.fillStyle = palette.ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "1000 17px Inter, system-ui";
  ctx.fillText(label, W / 2, y + 31);
}

function drawMenu() {
  drawBackground();
  ctx.save();
  ctx.translate(W / 2, 324);
  ctx.rotate(-0.06);
  roundedRect(-183, -138, 366, 276, 25, palette.orange, palette.ink, 6);
  ctx.fillStyle = palette.ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "1000 55px Inter, system-ui";
  ctx.fillText("HOLD", 0, -55);
  ctx.fillText("PLEASE", 0, 5);
  ctx.font = "900 15px Inter, system-ui";
  ctx.fillText("THE OFFICE IS CALLING", 0, 82);
  ctx.restore();
  drawCharacter(0, W / 2, 635, -0.02, 0.57);
  roundedRect(46, 740, 338, 66, 18, palette.cream, palette.ink, 4);
  ctx.fillStyle = palette.ink;
  ctx.textAlign = "center";
  ctx.font = "900 17px Inter, system-ui";
  ctx.fillText("TAP TO PUNT. HIT PROPS.", W / 2, 763);
  ctx.font = "800 13px Inter, system-ui";
  ctx.fillText("AVOID STAPLERS. LAST 20 SECONDS.", W / 2, 787);
  drawCallToAction("TAKE THE CALL");
}

function getVerdict() {
  if (state.signal <= 0) return ["CALL DROPPED", "THE STAPLER WON"];
  if (state.score >= 65) return ["CIRCLE BACK KING", "ABSOLUTELY NO NOTES"];
  if (state.score >= 40) return ["THIS COULD WORK", "SOMEHOW STILL EMPLOYED"];
  if (state.score >= 20) return ["SOLID SYNERGY", "CHAOTIC BUT BILLABLE"];
  return ["PLEASE HOLD", "WE LOST THE AGENDA"];
}

function drawGameOver() {
  ctx.fillStyle = "rgb(23 32 51 / 76%)";
  ctx.fillRect(0, 0, W, H);
  const [title, sub] = getVerdict();
  roundedRect(28, 180, W - 56, 490, 28, palette.cream, palette.ink, 6);
  drawCharacter(state.signal <= 0 ? 2 : 3, W / 2, 330, -0.04, 0.52);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = palette.ink;
  ctx.font = "1000 31px Inter, system-ui";
  ctx.fillText(title, W / 2, 477);
  ctx.font = "900 14px Inter, system-ui";
  ctx.fillStyle = palette.orange;
  ctx.fillText(sub, W / 2, 510);
  ctx.fillStyle = palette.ink;
  ctx.font = "1000 66px Inter, system-ui";
  ctx.fillText(state.score.toString(), W / 2, 572);
  ctx.font = "800 13px Inter, system-ui";
  ctx.fillText(`BEST ${state.best}  ·  MAX COMBO ${state.maxCombo}`, W / 2, 625);
  drawCallToAction("ONE MORE CALL");
}

function render() {
  if (state.mode === "menu") {
    drawMenu();
    return;
  }

  ctx.save();
  const sx = (Math.random() - 0.5) * state.shake;
  const sy = (Math.random() - 0.5) * state.shake;
  ctx.translate(sx, sy);
  drawBackground();
  state.props.forEach((prop) => {
    if (prop.active) drawProp(prop);
  });
  state.sparks.forEach((spark) => {
    drawProp({ ...spark, ...spark.def, scale: 0.14 }, Math.min(1, spark.life * 3), 0.14);
  });

  const speed = Math.hypot(state.player.vx, state.player.vy);
  const pose = speed > 520 ? 2 : speed > 210 ? 1 : 0;
  drawCharacter(pose);

  if (state.bannerTimer > 0) {
    const width = Math.min(340, 92 + state.banner.length * 12);
    roundedRect((W - width) / 2, 180, width, 54, 14, state.flash < 0 ? palette.red : palette.lime, palette.ink, 4);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = palette.ink;
    ctx.font = "1000 19px Inter, system-ui";
    ctx.fillText(state.banner, W / 2, 207);
  }
  drawHud();
  if (state.flash !== 0) {
    ctx.globalAlpha = Math.abs(state.flash) * 0.2;
    ctx.fillStyle = state.flash > 0 ? palette.lime : palette.red;
    ctx.fillRect(0, 105, W, H - 105);
  }
  ctx.restore();

  if (state.mode === "over") drawGameOver();
}

function frame(now) {
  const delta = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!deterministic) update(delta);
  render();
  requestAnimationFrame(frame);
}

window.render_game_to_text = () =>
  JSON.stringify({
    coordinateSystem: "origin top-left; x increases right; y increases down; canvas 430x932",
    mode: state.mode,
    player: {
      x: Math.round(state.player.x),
      y: Math.round(state.player.y),
      vx: Math.round(state.player.vx),
      vy: Math.round(state.player.vy),
      launchReady: state.launchCooldown <= 0,
      impactWindow: state.hitWindow > 0,
      boosted: state.boostTimer > 0,
    },
    props: state.props
      .filter((prop) => prop.active)
      .map((prop) => ({
        name: prop.name,
        x: Math.round(prop.x),
        y: Math.round(prop.y),
        hazard: Boolean(prop.hazard),
        points: prop.points,
      })),
    score: state.score,
    best: state.best,
    combo: state.combo,
    maxCombo: state.maxCombo,
    signal: state.signal,
    secondsLeft: Number(state.time.toFixed(2)),
  });

window.advanceTime = (ms) => {
  deterministic = true;
  const steps = Math.max(1, Math.round(ms / (1000 / 60)));
  for (let i = 0; i < steps; i += 1) update(DT);
  render();
};

Promise.all([
  characterSheet.decode().catch(() => {}),
  propsSheet.decode().catch(() => {}),
]).finally(() => render());

requestAnimationFrame(frame);
