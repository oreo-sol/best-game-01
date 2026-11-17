// NEONVOID simulation: waves, enemy AI, bullets, collisions, pickups, score.
// The world advances in fixed 1/60 s steps from a pilot (movement, aim, fire).
// It owns no drawing and no DOM: main.js reads state and render.js paints it.
import { COLORS, ENEMY_TYPES, PLAYER, UPGRADES, VIEW, WIN_WAVE, waveRoster } from './config.js';
import { createBullet, createEnemy, createFloater, createPickup, createPlayer, spawnBurst } from './entities.js';

export const EVENT_HIT = 1;
export const EVENT_KILL = 2;
export const EVENT_WAVE_CLEAR = 4;
export const EVENT_OVER = 8;
export const EVENT_WIN = 16;
export const EVENT_PICKUP = 32;
export const EVENT_BOSS = 64;
export const EVENT_UPGRADE_READY = 128;

const SPAWN_INTERVAL = 0.45;
const MAX_ALIVE = 16;
const STREAK_WINDOW = 2.5;

function distance(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

export function createWorld(random, sounds) {
  const state = {
    mode: 'attract',
    waveState: 'fighting',
    wave: 0,
    score: 0,
    kills: 0,
    streak: 0,
    streakTimer: 0,
    multiplier: 1,
    player: createPlayer(),
    bullets: [],
    enemyBullets: [],
    enemies: [],
    particles: [],
    pickups: [],
    floaters: [],
    spawnQueue: [],
    spawnTimer: 0,
    upgradeChoices: [],
    banner: null,
    shake: 0,
    hitStopTimer: 0,
    time: 0,
    nextId: 1,
    bossWarned: false,
  };

  function showBanner(text, subtext, seconds) {
    state.banner = { text, subtext, timer: seconds, max: seconds };
  }

  function addShake(amount) {
    state.shake = Math.min(18, state.shake + amount);
  }

  function addScore(base, x, y, label) {
    const gained = base * state.multiplier;
    state.score += gained;
    state.floaters.push(createFloater(x, y, label ?? `+${gained}`, '#e6f1ff'));
  }

  /** A point on a random arena edge, just inside the border. */
  function edgeSpawnPoint() {
    const side = random.int(0, 3);
    const margin = 40;
    if (side === 0) return { x: random.range(margin, VIEW.width - margin), y: margin };
    if (side === 1) return { x: random.range(margin, VIEW.width - margin), y: VIEW.height - margin };
    if (side === 2) return { x: margin, y: random.range(margin, VIEW.height - margin) };
    return { x: VIEW.width - margin, y: random.range(margin, VIEW.height - margin) };
  }

  function spawnEnemy(type) {
    const point = edgeSpawnPoint();
    const enemy = createEnemy(type, point.x, point.y, state.wave, state.nextId);
    state.nextId += 1;
    state.enemies.push(enemy);
    spawnBurst(state.particles, point.x, point.y, enemy.color, 8, 120);
    if (type === 'boss') {
      showBanner('VOID CORE', 'Destroy the boss', 2.2);
      sounds.bossWarn();
    }
  }

  function startWave(wave) {
    state.wave = wave;
    state.waveState = 'fighting';
    state.spawnQueue = waveRoster(wave);
    // Shuffle the queue so the wave never arrives in the same order.
    for (let i = state.spawnQueue.length - 1; i > 0; i -= 1) {
      const j = random.int(0, i);
      [state.spawnQueue[i], state.spawnQueue[j]] = [state.spawnQueue[j], state.spawnQueue[i]];
    }
    state.spawnTimer = 0.6;
    state.bossWarned = state.spawnQueue.includes('boss');
    showBanner(`WAVE ${wave}`, wave % 5 === 0 ? 'Boss wave — good luck' : `${state.spawnQueue.length} hostiles incoming`, 1.8);
    sounds.waveStart();
  }

  function rollUpgradeChoices() {
    const pool = [...UPGRADES];
    const choices = [];
    while (choices.length < 3 && pool.length > 0) {
      choices.push(pool.splice(random.int(0, pool.length - 1), 1)[0]);
    }
    state.upgradeChoices = choices;
  }

  function hurtPlayer(amount, x, y) {
    const player = state.player;
    if (!player.alive || player.invulnTimer > 0) return 0;
    if (player.hasShield && player.shieldReady) {
      player.shieldReady = false;
      player.shieldCooldown = 12;
      player.invulnTimer = 0.6;
      spawnBurst(state.particles, player.x, player.y, '#7dd3fc', 22, 260);
      state.floaters.push(createFloater(player.x, player.y - 30, 'SHIELD BLOCKED', '#7dd3fc'));
      sounds.playerHit();
      return EVENT_HIT;
    }
    player.hp -= amount;
    player.invulnTimer = PLAYER.invulnSeconds;
    addShake(9);
    state.hitStopTimer = 0.05;
    spawnBurst(state.particles, x, y, '#ff5d5d', 16, 220);
    sounds.playerHit();
    if (player.hp <= 0) {
      player.hp = 0;
      player.alive = false;
      addShake(16);
      state.hitStopTimer = 0.12;
      spawnBurst(state.particles, player.x, player.y, COLORS.player, 60, 380);
      spawnBurst(state.particles, player.x, player.y, '#ffffff', 30, 260);
      sounds.gameOver();
      return EVENT_HIT | EVENT_OVER;
    }
    return EVENT_HIT;
  }

  function killEnemy(enemy, index) {
    state.enemies.splice(index, 1);
    state.kills += 1;
    state.streak += 1;
    state.streakTimer = STREAK_WINDOW;
    state.multiplier = Math.min(5, 1 + Math.floor(state.streak / 6));
    addScore(enemy.score, enemy.x, enemy.y);
    spawnBurst(state.particles, enemy.x, enemy.y, enemy.color, enemy.type === 'boss' ? 60 : 16, enemy.type === 'boss' ? 380 : 240);
    sounds.enemyDie();
    if (enemy.type === 'boss') {
      addShake(14);
      state.hitStopTimer = 0.1;
      state.floaters.push(createFloater(enemy.x, enemy.y - 50, 'VOID CORE DESTROYED', COLORS.boss));
    }
    if (enemy.type === 'splitter') {
      for (let i = 0; i < 3; i += 1) {
        const angle = (i / 3) * Math.PI * 2 + random.range(-0.4, 0.4);
        const mini = createEnemy('mini', enemy.x + Math.cos(angle) * 20, enemy.y + Math.sin(angle) * 20, state.wave, state.nextId);
        state.nextId += 1;
        mini.vx = Math.cos(angle) * 140;
        mini.vy = Math.sin(angle) * 140;
        state.enemies.push(mini);
      }
    }
    const roll = random.next();
    if (roll < 0.1) state.pickups.push(createPickup(enemy.x, enemy.y, 'health'));
    else if (roll < 0.16) state.pickups.push(createPickup(enemy.x, enemy.y, 'overcharge'));
  }

  function firePlayerBullets() {
    const player = state.player;
    const spread = player.streams;
    const interval = PLAYER.fireInterval / player.fireMul / (player.overchargeTimer > 0 ? 1.6 : 1);
    player.fireTimer -= 1 / 60;
    if (player.fireTimer > 0) return;
    player.fireTimer = interval;
    const baseAngle = player.angle;
    for (let i = 0; i < spread; i += 1) {
      const offset = (i - (spread - 1) / 2) * 0.14;
      const angle = baseAngle + offset;
      const noseX = player.x + Math.cos(angle) * (player.radius + 6);
      const noseY = player.y + Math.sin(angle) * (player.radius + 6);
      state.bullets.push(
        createBullet(noseX, noseY, Math.cos(angle) * PLAYER.bulletSpeed, Math.sin(angle) * PLAYER.bulletSpeed, PLAYER.bulletDamage * player.damageMul, player.pierce, true),
      );
    }
    spawnBurst(state.particles, player.x + Math.cos(baseAngle) * 20, player.y + Math.sin(baseAngle) * 20, COLORS.bullet, 2, 60);
    sounds.shoot();
  }

  /** Steer one enemy for a step. Returns nothing; mutates velocity/position. */
  function steerEnemy(enemy, dt) {
    const player = state.player;
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const dist = Math.max(1, Math.hypot(dx, dy));
    const ux = dx / dist;
    const uy = dy / dist;
    enemy.wobble += dt * 3;
    if (enemy.type === 'chaser' || enemy.type === 'mini') {
      enemy.vx = ux * enemy.speed;
      enemy.vy = uy * enemy.speed;
    } else if (enemy.type === 'dasher') {
      enemy.dashTimer -= dt;
      if (enemy.dashState === 'roam') {
        enemy.vx = ux * enemy.speed + Math.cos(enemy.wobble) * 40;
        enemy.vy = uy * enemy.speed + Math.sin(enemy.wobble) * 40;
        if (enemy.dashTimer <= 0 && dist < 420 && dist > 120) {
          enemy.dashState = 'windup';
          enemy.dashTimer = 0.45;
          enemy.dashVx = ux;
          enemy.dashVy = uy;
        }
      } else if (enemy.dashState === 'windup') {
        enemy.vx *= 0.9;
        enemy.vy *= 0.9;
        if (enemy.dashTimer <= 0) {
          enemy.dashState = 'dash';
          enemy.dashTimer = 0.32;
          enemy.vx = enemy.dashVx * enemy.speed * 4.2;
          enemy.vy = enemy.dashVy * enemy.speed * 4.2;
        }
      } else {
        if (enemy.dashTimer <= 0) {
          enemy.dashState = 'roam';
          enemy.dashTimer = random.range(1.2, 2.2);
        }
      }
    } else if (enemy.type === 'shooter') {
      enemy.shootTimer -= dt;
      const want = 300;
      const toward = dist > want + 40 ? 1 : dist < want - 40 ? -1 : 0;
      enemy.vx = ux * enemy.speed * toward + -uy * Math.sin(enemy.wobble) * 50;
      enemy.vy = uy * enemy.speed * toward + ux * Math.sin(enemy.wobble) * 50;
      if (enemy.shootTimer <= 0 && dist < 560 && enemy.spawnIn <= 0) {
        enemy.shootTimer = random.range(1.6, 2.4);
        state.enemyBullets.push(createBullet(enemy.x, enemy.y, ux * 175, uy * 175, 10, 0, false));
        spawnBurst(state.particles, enemy.x, enemy.y, COLORS.enemyBullet, 4, 80);
      }
    } else if (enemy.type === 'splitter' || enemy.type === 'tank') {
      enemy.vx = ux * enemy.speed;
      enemy.vy = uy * enemy.speed;
    } else if (enemy.type === 'boss') {
      enemy.vx = ux * enemy.speed;
      enemy.vy = uy * enemy.speed;
      enemy.burstTimer -= dt;
      enemy.spawnTimer -= dt;
      if (enemy.burstTimer <= 0 && enemy.spawnIn <= 0) {
        enemy.burstTimer = 2.2;
        const count = 12;
        for (let i = 0; i < count; i += 1) {
          const angle = (i / count) * Math.PI * 2 + enemy.wobble;
          state.enemyBullets.push(createBullet(enemy.x, enemy.y, Math.cos(angle) * 150, Math.sin(angle) * 150, 10, 0, false));
        }
        addShake(4);
      }
      if (enemy.spawnTimer <= 0 && state.enemies.length < MAX_ALIVE) {
        enemy.spawnTimer = 5;
        for (let i = 0; i < 2; i += 1) {
          const mini = createEnemy('mini', enemy.x + random.range(-60, 60), enemy.y + random.range(-60, 60), state.wave, state.nextId);
          state.nextId += 1;
          state.enemies.push(mini);
        }
      }
    }
    enemy.x += enemy.vx * dt;
    enemy.y += enemy.vy * dt;
    enemy.angle = Math.atan2(enemy.vy, enemy.vx);
  }

  function updateParticles(dt) {
    for (let i = state.particles.length - 1; i >= 0; i -= 1) {
      const p = state.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        state.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - 2.4 * dt;
      p.vy *= 1 - 2.4 * dt;
    }
    for (let i = state.floaters.length - 1; i >= 0; i -= 1) {
      const f = state.floaters[i];
      f.life -= dt;
      f.y -= 34 * dt;
      if (f.life <= 0) state.floaters.splice(i, 1);
    }
  }

  function updatePickups(dt) {
    const player = state.player;
    for (let i = state.pickups.length - 1; i >= 0; i -= 1) {
      const pickup = state.pickups[i];
      pickup.life -= dt;
      pickup.bob += dt * 5;
      if (pickup.life <= 0) {
        state.pickups.splice(i, 1);
        continue;
      }
      const dist = distance(pickup.x, pickup.y, player.x, player.y);
      if (player.alive && dist < 120) {
        const pull = 420 * (1 - dist / 120) + 120;
        pickup.x += ((player.x - pickup.x) / dist) * pull * dt;
        pickup.y += ((player.y - pickup.y) / dist) * pull * dt;
      }
      if (player.alive && dist < player.radius + pickup.radius + 6) {
        if (pickup.kind === 'health') {
          player.hp = Math.min(player.maxHp, player.hp + 25);
          state.floaters.push(createFloater(player.x, player.y - 28, '+25 HP', COLORS.health));
        } else {
          player.overchargeTimer = 8;
          state.floaters.push(createFloater(player.x, player.y - 28, 'OVERCHARGE!', COLORS.overcharge));
        }
        spawnBurst(state.particles, pickup.x, pickup.y, pickup.kind === 'health' ? COLORS.health : COLORS.overcharge, 10, 140);
        sounds.pickup();
        state.pickups.splice(i, 1);
      }
    }
  }

  return {
    state,

    /** Title-screen backdrop: a few enemies drifting, no player, no danger. */
    reset() {
      state.mode = 'attract';
      state.waveState = 'fighting';
      state.wave = 0;
      state.score = 0;
      state.kills = 0;
      state.streak = 0;
      state.streakTimer = 0;
      state.multiplier = 1;
      state.player = createPlayer();
      state.player.alive = false;
      state.bullets = [];
      state.enemyBullets = [];
      state.enemies = [];
      state.particles = [];
      state.pickups = [];
      state.floaters = [];
      state.spawnQueue = [];
      state.upgradeChoices = [];
      state.banner = null;
      state.shake = 0;
      state.hitStopTimer = 0;
      state.time = 0;
      const types = ['chaser', 'dasher', 'shooter', 'splitter', 'tank', 'mini'];
      for (let i = 0; i < 9; i += 1) {
        const enemy = createEnemy(types[i % types.length], random.range(80, VIEW.width - 80), random.range(80, VIEW.height - 80), 1, state.nextId);
        state.nextId += 1;
        enemy.spawnIn = 0;
        enemy.vx = random.range(-40, 40);
        enemy.vy = random.range(-40, 40);
        state.enemies.push(enemy);
      }
    },

    /** Start a fresh run at wave 1. */
    startRun() {
      state.mode = 'play';
      state.score = 0;
      state.kills = 0;
      state.streak = 0;
      state.streakTimer = 0;
      state.multiplier = 1;
      state.player = createPlayer();
      state.bullets = [];
      state.enemyBullets = [];
      state.enemies = [];
      state.particles = [];
      state.pickups = [];
      state.floaters = [];
      state.time = 0;
      startWave(1);
    },

    /** Apply upgrade `index` from the offered choices, then start the next wave. */
    applyUpgrade(index) {
      const choice = state.upgradeChoices[index];
      if (!choice) return;
      choice.apply(state.player);
      state.floaters.push(createFloater(state.player.x, state.player.y - 34, choice.label, '#facc15'));
      sounds.upgrade();
      startWave(state.wave + 1);
    },

    /** Start a given wave at once (used by the boss screenshot scene). */
    startWaveAt(wave) {
      state.spawnQueue = [];
      state.enemies = [];
      startWave(wave);
    },

    /** Spawn one enemy of `type` right now, pulling it out of the queue. */
    spawnNow(type) {
      const index = state.spawnQueue.indexOf(type);
      if (index >= 0) state.spawnQueue.splice(index, 1);
      spawnEnemy(type);
    },

    enemiesRemaining() {
      return state.spawnQueue.length + state.enemies.length;
    },

    /** Advance the world one fixed step. `pilot` is {mx, my, aimX, aimY, firing}. */
    step(dt, pilot) {
      state.time += dt;
      if (state.banner) {
        state.banner.timer -= dt;
        if (state.banner.timer <= 0) state.banner = null;
      }
      state.shake = Math.max(0, state.shake * (1 - 5 * dt));
      if (state.hitStopTimer > 0) {
        state.hitStopTimer -= dt;
        return 0;
      }
      if (state.mode === 'attract') {
        for (const enemy of state.enemies) {
          enemy.x += enemy.vx * dt;
          enemy.y += enemy.vy * dt;
          if (enemy.x < 20 || enemy.x > VIEW.width - 20) enemy.vx *= -1;
          if (enemy.y < 20 || enemy.y > VIEW.height - 20) enemy.vy *= -1;
          enemy.wobble += dt;
        }
        updateParticles(dt);
        return 0;
      }

      const player = state.player;
      let events = 0;

      if (state.streakTimer > 0) {
        state.streakTimer -= dt;
        if (state.streakTimer <= 0) {
          state.streak = 0;
          state.multiplier = 1;
        }
      }
      if (player.hasShield && !player.shieldReady) {
        player.shieldCooldown -= dt;
        if (player.shieldCooldown <= 0) {
          player.shieldReady = true;
          state.floaters.push(createFloater(player.x, player.y - 30, 'SHIELD READY', '#7dd3fc'));
        }
      }
      if (player.overchargeTimer > 0) player.overchargeTimer -= dt;
      if (player.invulnTimer > 0) player.invulnTimer -= dt;

      if (player.alive && state.waveState === 'fighting') {
        // Tight, responsive movement: velocity chases the input direction fast.
        const speed = PLAYER.speed * player.speedMul;
        const targetVx = pilot.mx * speed;
        const targetVy = pilot.my * speed;
        const blend = Math.min(1, 18 * dt);
        player.vx += (targetVx - player.vx) * blend;
        player.vy += (targetVy - player.vy) * blend;
        player.x = Math.min(VIEW.width - 24, Math.max(24, player.x + player.vx * dt));
        player.y = Math.min(VIEW.height - 24, Math.max(24, player.y + player.vy * dt));
        player.angle = Math.atan2(pilot.aimY - player.y, pilot.aimX - player.x);
        if (Math.hypot(player.vx, player.vy) > 60 && random.chance(0.5)) {
          state.particles.push({
            x: player.x - Math.cos(player.angle) * 16,
            y: player.y - Math.sin(player.angle) * 16,
            vx: -player.vx * 0.2 + random.range(-20, 20),
            vy: -player.vy * 0.2 + random.range(-20, 20),
            life: 0.3,
            maxLife: 0.3,
            size: 2.5,
            color: COLORS.player,
          });
        }
        if (pilot.firing) firePlayerBullets();
        else player.fireTimer = Math.max(0, player.fireTimer - dt);
      }

      // Spawn the wave's queue in a trickle.
      if (state.waveState === 'fighting' && state.spawnQueue.length > 0 && state.enemies.length < MAX_ALIVE) {
        state.spawnTimer -= dt;
        if (state.spawnTimer <= 0) {
          state.spawnTimer = SPAWN_INTERVAL;
          spawnEnemy(state.spawnQueue.shift());
        }
      }

      // Enemies steer, then gently push apart so they never stack.
      for (const enemy of state.enemies) {
        if (enemy.spawnIn > 0) enemy.spawnIn -= dt;
        if (enemy.flash > 0) enemy.flash -= dt;
        if (enemy.spawnIn <= 0) steerEnemy(enemy, dt);
      }
      for (let i = 0; i < state.enemies.length; i += 1) {
        for (let j = i + 1; j < state.enemies.length; j += 1) {
          const a = state.enemies[i];
          const b = state.enemies[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.hypot(dx, dy);
          const min = a.radius + b.radius;
          if (dist > 0 && dist < min) {
            const push = (min - dist) / 2;
            const ux = dx / dist;
            const uy = dy / dist;
            a.x -= ux * push;
            a.y -= uy * push;
            b.x += ux * push;
            b.y += uy * push;
          }
        }
      }

      // Player bullets fly and hit enemies.
      for (let i = state.bullets.length - 1; i >= 0; i -= 1) {
        const bullet = state.bullets[i];
        bullet.x += bullet.vx * dt;
        bullet.y += bullet.vy * dt;
        bullet.life -= dt;
        let dead = bullet.life <= 0 || bullet.x < -20 || bullet.x > VIEW.width + 20 || bullet.y < -20 || bullet.y > VIEW.height + 20;
        if (!dead) {
          for (let j = state.enemies.length - 1; j >= 0; j -= 1) {
            const enemy = state.enemies[j];
            if (enemy.spawnIn > 0) continue;
            if (distance(bullet.x, bullet.y, enemy.x, enemy.y) < bullet.radius + enemy.radius) {
              enemy.hp -= bullet.damage;
              enemy.flash = 0.08;
              spawnBurst(state.particles, bullet.x, bullet.y, enemy.color, 4, 140);
              if (enemy.hp <= 0) {
                killEnemy(enemy, j);
                events |= EVENT_KILL;
              }
              if (bullet.pierce > 0) {
                bullet.pierce -= 1;
              } else {
                dead = true;
              }
              break;
            }
          }
        }
        if (dead) state.bullets.splice(i, 1);
      }

      // Enemy bullets fly; grazing one (close miss) pays a small bonus.
      for (let i = state.enemyBullets.length - 1; i >= 0; i -= 1) {
        const bullet = state.enemyBullets[i];
        bullet.x += bullet.vx * dt;
        bullet.y += bullet.vy * dt;
        bullet.life -= dt;
        let dead = bullet.life <= 0 || bullet.x < -30 || bullet.x > VIEW.width + 30 || bullet.y < -30 || bullet.y > VIEW.height + 30;
        if (!dead && player.alive) {
          const dist = distance(bullet.x, bullet.y, player.x, player.y);
          if (dist < bullet.radius + player.radius) {
            events |= hurtPlayer(bullet.damage, bullet.x, bullet.y);
            dead = true;
          } else if (!bullet.grazed && dist < player.radius + 26) {
            bullet.grazed = true;
            addScore(10, bullet.x, bullet.y - 10, 'GRAZE +10');
          }
        }
        if (dead) state.enemyBullets.splice(i, 1);
      }

      // Touch damage from enemies.
      if (player.alive) {
        for (const enemy of state.enemies) {
          if (enemy.spawnIn > 0) continue;
          if (distance(enemy.x, enemy.y, player.x, player.y) < enemy.radius + player.radius - 2) {
            events |= hurtPlayer(enemy.touch, enemy.x, enemy.y);
            // Shove the enemy back so one touch is not a chain of hits.
            const dx = enemy.x - player.x;
            const dy = enemy.y - player.y;
            const dist = Math.max(1, Math.hypot(dx, dy));
            enemy.x = player.x + (dx / dist) * (enemy.radius + player.radius + 6);
            enemy.y = player.y + (dy / dist) * (enemy.radius + player.radius + 6);
            break;
          }
        }
      }

      updatePickups(dt);
      updateParticles(dt);

      // Wave cleared: banner, then the upgrade choice (or victory on wave 10).
      if (state.waveState === 'fighting' && state.spawnQueue.length === 0 && state.enemies.length === 0 && player.alive) {
        const bonus = 100 * state.wave;
        state.score += bonus;
        state.floaters.push(createFloater(VIEW.width / 2, VIEW.height / 2 - 60, `WAVE BONUS +${bonus}`, '#facc15'));
        if (state.wave >= WIN_WAVE) {
          state.waveState = 'victory';
          sounds.victory();
          return events | EVENT_WIN;
        }
        state.waveState = 'upgrade';
        rollUpgradeChoices();
        showBanner(`WAVE ${state.wave} CLEAR`, 'Choose an upgrade', 2.4);
        sounds.upgrade();
        return events | EVENT_WAVE_CLEAR | EVENT_UPGRADE_READY;
      }

      if (!player.alive) return events | EVENT_OVER;
      return events;
    },
  };
}
