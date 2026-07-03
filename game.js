const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

function resize() {
  canvas.width = innerWidth * devicePixelRatio;
  canvas.height = innerHeight * devicePixelRatio;
  canvas.style.width = innerWidth + 'px';
  canvas.style.height = innerHeight + 'px';
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
}
addEventListener('resize', resize);
resize();

const keys = {};
addEventListener('keydown', e => { keys[e.code] = true; if (e.code === 'KeyR') reset(); });
addEventListener('keyup', e => keys[e.code] = false);

function bindBtn(id, key) {
  const el = document.getElementById(id);
  const down = e => { e.preventDefault(); keys[key] = true; };
  const up = e => { e.preventDefault(); keys[key] = false; };
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('pointerleave', up);
}
bindBtn('gas', 'ArrowRight');
bindBtn('brake', 'ArrowLeft');
bindBtn('leanL', 'KeyA');
bindBtn('leanR', 'KeyD');
document.getElementById('restart').onclick = reset;

const gravity = 0.55;
const wheelRadius = 16;
const suspensionRest = 54;
const suspensionStrength = 0.20;
const suspensionDamping = 0.72;

let terrain = [];
let bike;
let cameraX = 0;
let startTime = performance.now();
let crashed = false;

function buildTerrain() {
  terrain = [];
  let x = -300;
  let y = 370;
  for (let i = 0; i < 260; i++) {
    const amp = 40 + Math.sin(i * 0.19) * 28;
    y = 360 + Math.sin(i * 0.42) * amp + Math.sin(i * 0.11) * 75;
    if (i % 17 === 0) y -= 80;
    if (i % 23 === 0) y += 90;
    terrain.push({ x, y });
    x += 72;
  }
}

function reset() {
  buildTerrain();
  bike = {
    frame: { x: 150, y: 260, vx: 0, vy: 0 },
    rear: { x: 110, y: 305, vx: 0, vy: 0, contact: false },
    front: { x: 190, y: 305, vx: 0, vy: 0, contact: false },
    angle: 0,
    angularVelocity: 0,
    distance: 0
  };
  cameraX = 0;
  startTime = performance.now();
  crashed = false;
}
reset();

function getGround(x) {
  for (let i = 0; i < terrain.length - 1; i++) {
    const a = terrain[i], b = terrain[i + 1];
    if (x >= a.x && x <= b.x) {
      const t = (x - a.x) / (b.x - a.x);
      const y = a.y + (b.y - a.y) * t;
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      return { y, angle, a, b };
    }
  }
  return { y: 1000, angle: 0 };
}

function spring(p, target, rest) {
  const dx = target.x - p.x;
  const dy = target.y - p.y;
  const d = Math.max(0.0001, Math.hypot(dx, dy));
  const diff = d - rest;
  const nx = dx / d;
  const ny = dy / d;
  const force = diff * suspensionStrength;
  p.vx += nx * force;
  p.vy += ny * force;
  target.vx -= nx * force * 0.55;
  target.vy -= ny * force * 0.55;
}

function collideWheel(w) {
  const g = getGround(w.x);
  const penetration = (w.y + wheelRadius) - g.y;
  w.contact = false;
  if (penetration > 0) {
    w.contact = true;
    w.y -= penetration;
    if (w.vy > 0) w.vy *= -0.12;

    const tangent = { x: Math.cos(g.angle), y: Math.sin(g.angle) };
    const normal = { x: -Math.sin(g.angle), y: Math.cos(g.angle) };

    const vAlong = w.vx * tangent.x + w.vy * tangent.y;
    const vNormal = w.vx * normal.x + w.vy * normal.y;

    w.vx = tangent.x * vAlong * 0.985 + normal.x * Math.min(vNormal, 0);
    w.vy = tangent.y * vAlong * 0.985 + normal.y * Math.min(vNormal, 0);
  }
}

function updateBike() {
  if (crashed) return;

  const rear = bike.rear;
  const front = bike.front;
  const frame = bike.frame;

  rear.vy += gravity;
  front.vy += gravity;
  frame.vy += gravity * 0.85;

  const gas = keys.ArrowRight || keys.Space;
  const brake = keys.ArrowLeft;
  const leanLeft = keys.KeyA || keys.ArrowUp;
  const leanRight = keys.KeyD || keys.ArrowDown;

  const rearGround = getGround(rear.x);
  const frontGround = getGround(front.x);

  if (gas && rear.contact) {
    rear.vx += Math.cos(rearGround.angle) * 0.42;
    rear.vy += Math.sin(rearGround.angle) * 0.42;
    bike.angularVelocity += 0.006;
  }
  if (brake && rear.contact) {
    rear.vx *= 0.92;
    bike.angularVelocity -= 0.005;
  }

  if (leanLeft) bike.angularVelocity -= 0.018;
  if (leanRight) bike.angularVelocity += 0.018;

  // Suspension and chassis constraints.
  // Several small iterations keep the motorcycle from "breaking" or stretching
  // when it lands hard or flips over.
  for (let k = 0; k < 4; k++) {
    spring(rear, frame, suspensionRest);
    spring(front, frame, suspensionRest);

    const axleDx = front.x - rear.x;
    const axleDy = front.y - rear.y;
    const axleDist = Math.max(1, Math.hypot(axleDx, axleDy));
    const targetWheelBase = 82;
    const correction = (axleDist - targetWheelBase) * 0.5;
    const nx = axleDx / axleDist;
    const ny = axleDy / axleDist;
    rear.x += nx * correction;
    rear.y += ny * correction;
    front.x -= nx * correction;
    front.y -= ny * correction;

    const midXc = (rear.x + front.x) / 2;
    const midYc = (rear.y + front.y) / 2 - 46;
    frame.x += (midXc - frame.x) * 0.18;
    frame.y += (midYc - frame.y) * 0.18;
  }

  bike.angle = Math.atan2(front.y - rear.y, front.x - rear.x);

  rear.x += rear.vx; rear.y += rear.vy;
  front.x += front.vx; front.y += front.vy;
  frame.x += frame.vx; frame.y += frame.vy;

  collideWheel(rear);
  collideWheel(front);

  rear.vx *= 0.996; rear.vy *= 0.996;
  front.vx *= 0.996; front.vy *= 0.996;
  frame.vx *= 0.993; frame.vy *= 0.993;
  bike.angularVelocity *= 0.985;

  const midX = (rear.x + front.x) / 2;
  const midY = (rear.y + front.y) / 2;
  frame.x += (midX - frame.x) * 0.035;
  frame.y += (midY - 48 - frame.y) * 0.035;

  // Do not crash only because the bike rotated in the air.
  // Crash happens only when rider's head/torso actually hits the ground.
  const headX = frame.x + Math.cos(bike.angle - Math.PI / 2) * 36;
  const headY = frame.y + Math.sin(bike.angle - Math.PI / 2) * 36;
  const bodyX = frame.x + Math.cos(bike.angle - Math.PI / 2) * 18;
  const bodyY = frame.y + Math.sin(bike.angle - Math.PI / 2) * 18;
  const headHit = headY > getGround(headX).y - 5;
  const bodyHit = bodyY > getGround(bodyX).y - 2;
  if ((headHit || bodyHit) && (rear.contact || front.contact)) {
    crashed = true;
  }

  bike.distance = Math.max(bike.distance, midX);
  cameraX += (midX - cameraX - innerWidth * 0.38) * 0.08;
}

function drawWheel(x, y) {
  ctx.beginPath();
  ctx.arc(x, y, wheelRadius, 0, Math.PI * 2);
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, 4, 0, Math.PI * 2);
  ctx.fillStyle = '#000';
  ctx.fill();
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * wheelRadius, y + Math.sin(a) * wheelRadius);
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function drawBike() {
  const r = bike.rear, f = bike.front, p = bike.frame;
  drawWheel(r.x - cameraX, r.y);
  drawWheel(f.x - cameraX, f.y);

  ctx.strokeStyle = '#222';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(r.x - cameraX, r.y);
  ctx.lineTo(p.x - cameraX, p.y);
  ctx.lineTo(f.x - cameraX, f.y);
  ctx.lineTo(r.x - cameraX, r.y);
  ctx.stroke();

  ctx.strokeStyle = '#cc0000';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(p.x - cameraX - 18, p.y - 5);
  ctx.lineTo(p.x - cameraX + 24, p.y - 7);
  ctx.stroke();

  const bodyX = p.x - cameraX;
  const bodyY = p.y - 31;
  ctx.strokeStyle = '#1d4ed8';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(bodyX, bodyY);
  ctx.lineTo(bodyX + 10, bodyY + 30);
  ctx.stroke();

  ctx.strokeStyle = '#555';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(bodyX + 8, bodyY + 27);
  ctx.lineTo(f.x - cameraX - 3, f.y - 18);
  ctx.moveTo(bodyX + 6, bodyY + 29);
  ctx.lineTo(r.x - cameraX + 5, r.y - 17);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(bodyX - 2, bodyY - 13, 9, 0, Math.PI * 2);
  ctx.fillStyle = '#f4c542';
  ctx.fill();
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.strokeStyle = '#333';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(f.x - cameraX - 5, f.y - 18);
  ctx.lineTo(f.x - cameraX + 14, f.y - 30);
  ctx.stroke();
}

function drawTerrain() {
  ctx.strokeStyle = '#00b900';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < terrain.length; i++) {
    const x = terrain[i].x - cameraX;
    const y = terrain[i].y;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  ctx.beginPath();
  for (let i = 0; i < terrain.length - 1; i++) {
    if (i % 2 !== 0) continue;
    const a = terrain[i], b = terrain[i + 1];
    const x1 = a.x - cameraX;
    const y1 = a.y;
    const x2 = b.x - cameraX;
    const y2 = b.y + 90;
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
  }
  ctx.stroke();

  ctx.beginPath();
  for (let i = 0; i < terrain.length; i++) {
    const x = terrain[i].x - cameraX;
    const y = terrain[i].y + 90;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

function drawUI() {
  const seconds = ((performance.now() - startTime) / 1000).toFixed(2);
  ctx.fillStyle = '#111';
  ctx.font = '22px monospace';
  ctx.textAlign = 'right';
  ctx.fillText(seconds, innerWidth - 14, innerHeight - 14);

  ctx.textAlign = 'left';
  ctx.font = '15px Arial';
  ctx.fillText('← brake | → gas | A/D lean | R restart', 14, 28);
  ctx.fillText('Distance: ' + Math.floor(bike.distance / 10) + ' m', 14, 50);

  if (crashed) {
    ctx.fillStyle = 'rgba(255,255,255,.8)';
    ctx.fillRect(0, innerHeight / 2 - 65, innerWidth, 130);
    ctx.fillStyle = '#111';
    ctx.textAlign = 'center';
    ctx.font = '34px Arial';
    ctx.fillText('CRASH!', innerWidth / 2, innerHeight / 2 - 10);
    ctx.font = '18px Arial';
    ctx.fillText('Press Restart', innerWidth / 2, innerHeight / 2 + 28);
  }
}

function loop() {
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  updateBike();
  drawTerrain();
  drawBike();
  drawUI();
  requestAnimationFrame(loop);
}
loop();
