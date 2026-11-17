// Factories for everything that moves: the player ship, enemies, bullets,
// particles, pickups and floating score text. Factories only — behaviour lives in world.js.
import { ENEMY_TYPES, PLAYER, VIEW } from './config.js';

export function createPlayer() {
  return {
    x: VIEW.width / 2,
    y: VIEW.height / 2,
    vx: 0,
    vy: 0,
    angle: -Math.PI / 2,
    radius: PLAYER.radius,
    hp: PLAYER.maxHp,
    maxHp: PLAYER.maxHp,
    speedMul: 1,
    damageMul: 1,
    fireMul: 1,
    streams: 1,
    pierce: 0,
    fireTimer: 0,
    invulnTimer: 0,
    overchargeTimer: 0,
    hasShield: false,
    shieldReady: false,
    shieldCooldown: 0,
    alive: true,
  };
}

/** An enemy of `type` at (x, y), scaled for the wave. `id` is a running counter. */
export function createEnemy(type, x, y, wave, id) {
  const stats = ENEMY_TYPES[type];
  return {
    id,
    type,
    x,
    y,
    vx: 0,
    vy: 0,
    angle: 0,
    radius: stats.radius,
    hp: stats.hp + stats.hpPerWave * (wave - 1),
    maxHp: stats.hp + stats.hpPerWave * (wave - 1),
    speed: stats.speed + stats.speedPerWave * (wave - 1),
    score: stats.score,
    touch: stats.touch,
    color: stats.color,
    shape: stats.shape,
    wobble: Math.random() * Math.PI * 2,
    burstTimer: 2,
    spawnTimer: 4,
    shootTimer: 1.5 + Math.random(),
    dashTimer: 1.2 + Math.random(),
    dashState: 'roam',
    dashVx: 0,
    dashVy: 0,
    flash: 0,
    spawnIn: 0.4,
  };
}

export function createBullet(x, y, vx, vy, damage, pierce, friendly) {
  return { x, y, vx, vy, damage, pierce, friendly, radius: friendly ? PLAYER.bulletRadius : 7, life: 1.4 };
}

export function createParticle(x, y, vx, vy, life, size, color) {
  return { x, y, vx, vy, life, maxLife: life, size, color };
}

export function createPickup(x, y, kind) {
  return { x, y, kind, radius: 12, vx: 0, vy: 0, life: 12, bob: Math.random() * Math.PI * 2 };
}

export function createFloater(x, y, text, color) {
  return { x, y, text, color, life: 1.1, maxLife: 1.1 };
}

/** A burst of `count` particles flying out of (x, y) in the given colour. */
export function spawnBurst(particles, x, y, color, count, speed) {
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const velocity = speed * (0.3 + Math.random() * 0.7);
    particles.push(
      createParticle(x, y, Math.cos(angle) * velocity, Math.sin(angle) * velocity, 0.4 + Math.random() * 0.5, 2 + Math.random() * 3, color),
    );
  }
}
