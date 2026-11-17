// Screenshot scenes behind ?shot=title|play|boss|over. Each one plays the real
// rules forward from a fresh world for a fixed number of steps, steered by a
// simple autopilot (keep a shooting range from the nearest enemy, dodge what
// comes close), so the frame is what a real game looks like and the same seed
// always gives the same frame.
import { VIEW } from './config.js';
import { EVENT_OVER, EVENT_WIN } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_UPGRADE, SCREEN_WIN } from './render.js';

const TITLE_SECONDS = 6;
const BOSS_SECONDS = 12;
const OVER_PLAY_SECONDS = 35;
const END_LIMIT_SECONDS = 300;
const SAMPLE = 1 / 60;

/** Steer toward a firing range from the nearest enemy, away from close threats. */
function autopilot(state) {
  const player = state.player;
  if (!player.alive) return { mx: 0, my: 0, aimX: player.x, aimY: player.y - 100, firing: false };
  let target = null;
  let bestDist = Infinity;
  for (const enemy of state.enemies) {
    if (enemy.spawnIn > 0) continue;
    const dist = Math.hypot(enemy.x - player.x, enemy.y - player.y);
    if (dist < bestDist) {
      bestDist = dist;
      target = enemy;
    }
  }
  let mx = 0;
  let my = 0;
  if (target) {
    const dx = target.x - player.x;
    const dy = target.y - player.y;
    const dist = Math.max(1, bestDist);
    // Hold ~260 px away: close in when far, back off when too close.
    const toward = dist > 300 ? 1 : dist < 200 ? -1 : 0;
    mx = (dx / dist) * toward;
    my = (dy / dist) * toward;
    // Sidestep: orbit slowly so the pilot does not stand in a bullet lane.
    mx += (-dy / dist) * 0.5;
    my += (dx / dist) * 0.5;
  }
  // Flee anything about to touch us, and nearby enemy bullets.
  for (const enemy of state.enemies) {
    const dist = Math.hypot(enemy.x - player.x, enemy.y - player.y);
    if (dist < enemy.radius + 90) {
      mx += ((player.x - enemy.x) / dist) * 2;
      my += ((player.y - enemy.y) / dist) * 2;
    }
  }
  for (const bullet of state.enemyBullets) {
    const dist = Math.hypot(bullet.x - player.x, bullet.y - player.y);
    if (dist < 70) {
      mx += ((player.x - bullet.x) / dist) * 1.5;
      my += ((player.y - bullet.y) / dist) * 1.5;
    }
  }
  const length = Math.hypot(mx, my);
  if (length > 1) {
    mx /= length;
    my /= length;
  }
  // Keep inside the arena.
  if (player.x < 90) mx = Math.max(mx, 0.4);
  if (player.x > VIEW.width - 90) mx = Math.min(mx, -0.4);
  if (player.y < 90) my = Math.max(my, 0.4);
  if (player.y > VIEW.height - 90) my = Math.min(my, -0.4);
  return {
    mx,
    my,
    aimX: target ? target.x : player.x,
    aimY: target ? target.y : player.y - 100,
    firing: target !== null && bestDist < 560,
  };
}

/** A pilot that never moves and never fires: the run ends the way a still player would. */
function idlePilot(state) {
  const player = state.player;
  return { mx: 0, my: 0, aimX: player.x, aimY: player.y - 100, firing: false };
}

function simulate(world, seconds, pilot) {
  for (let step = 0; step < seconds / SAMPLE; step += 1) {
    const events = world.step(SAMPLE, pilot(world.state));
    if (events & EVENT_OVER) return true;
  }
  return false;
}

/** Step until `stop` says the frame is ready, or `maxSeconds` passes. */
function simulateUntil(world, maxSeconds, pilot, stop) {
  for (let step = 0; step < maxSeconds / SAMPLE; step += 1) {
    const events = world.step(SAMPLE, pilot(world.state));
    if (events & EVENT_OVER) return true;
    if (stop(world.state)) return false;
  }
  return false;
}

/**
 * Set `world` to the named scene (title, play, boss or over; any other name is
 * title) and return the screen to draw over it and the best score to show.
 */
export function stageShot(name, world) {
  if (name === 'play') {
    world.startRun();
    // Stage at wave 2 and stop the moment the fight is hot: several kills banked
    // while enemies are still on screen, so the frame shows the loop mid-action.
    world.startWaveAt(2);
    simulateUntil(world, 16, autopilot, (state) => state.kills >= 5 && state.enemies.length >= 4);
    return { screen: world.state.player.alive ? SCREEN_PLAY : SCREEN_OVER, best: world.state.score };
  }
  if (name === 'boss') {
    world.startRun();
    // Jump straight to the boss wave and put the VOID CORE on screen at once,
    // centred in the arena so the fight reads at a glance.
    world.startWaveAt(5);
    world.spawnNow('boss');
    const boss = world.state.enemies.find((enemy) => enemy.type === 'boss');
    if (boss) {
      boss.x = 920;
      boss.y = 280;
    }
    simulate(world, BOSS_SECONDS, autopilot);
    return { screen: world.state.player.alive ? SCREEN_PLAY : SCREEN_OVER, best: world.state.score };
  }
  if (name === 'over') {
    world.startRun();
    // Play well first (a real score, real kills), picking upgrades as waves
    // clear, then stop moving: the swarm catches a still pilot within a wave or two.
    let played = 0;
    let died = false;
    while (played < OVER_PLAY_SECONDS && !died) {
      const events = world.step(SAMPLE, autopilot(world.state));
      played += SAMPLE;
      if (events & EVENT_OVER) died = true;
      else if (world.state.waveState === 'upgrade') world.applyUpgrade(0);
    }
    const over = died || simulate(world, END_LIMIT_SECONDS, idlePilot);
    return { screen: over ? SCREEN_OVER : SCREEN_PLAY, best: world.state.score };
  }
  if (name === 'upgrade') {
    // Play until the first wave clears and the upgrade choice appears.
    world.startRun();
    for (let step = 0; step < 120 / SAMPLE; step += 1) {
      const events = world.step(SAMPLE, autopilot(world.state));
      if (world.state.waveState === 'upgrade') break;
      if (events & EVENT_OVER) break;
    }
    return { screen: SCREEN_UPGRADE, best: world.state.score };
  }
  if (name === 'win') {
    // Play the whole run on autopilot until victory (or death).
    world.startRun();
    for (let step = 0; step < 900 / SAMPLE; step += 1) {
      const events = world.step(SAMPLE, autopilot(world.state));
      if (events & EVENT_WIN) return { screen: SCREEN_WIN, best: world.state.score };
      if (events & EVENT_OVER) return { screen: SCREEN_OVER, best: world.state.score };
      if (world.state.waveState === 'upgrade') world.applyUpgrade(0);
    }
    return { screen: SCREEN_PLAY, best: world.state.score };
  }
  world.reset();
  simulate(world, TITLE_SECONDS, () => ({ mx: 0, my: 0, aimX: 0, aimY: 0, firing: false }));
  return { screen: SCREEN_TITLE, best: 0 };
}
