// Boot and the one loop: input is read every frame, the world advances in fixed
// 1/60 s steps, and the renderer paints what is there. The game moves between
// six screens: title, play, upgrade, paused, game over and victory.
//
// ?seed=N fixes the spawn pattern. ?shot=title|play|boss|over (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createSoundBank } from './audio.js';
import { createWorld, EVENT_OVER, EVENT_UPGRADE_READY, EVENT_WIN } from './world.js';
import {
  ACTION_CONFIRM,
  ACTION_MUTE,
  ACTION_PAUSE,
  ACTION_RESTART,
  ACTION_UPGRADE_1,
  ACTION_UPGRADE_2,
  ACTION_UPGRADE_3,
  createInput,
} from './input.js';
import {
  SCREEN_OVER,
  SCREEN_PAUSED,
  SCREEN_PLAY,
  SCREEN_TITLE,
  SCREEN_UPGRADE,
  SCREEN_WIN,
  createRenderer,
  pickUpgradeCard,
} from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const sounds = createSoundBank();
const world = createWorld(createRandom(seed), sounds);
const renderer = createRenderer(canvas);

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();

  // Screen readers (and anyone watching the page's text) hear the screen changes.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    sounds.unlock();
    world.startRun();
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Playing. Survive 10 waves.');
  }

  function endRun(won) {
    screen = won ? SCREEN_WIN : SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    announce(won ? `Victory. Score ${world.state.score}.` : `Game over. Score ${world.state.score}. Best ${best}.`);
  }

  function chooseUpgrade(index) {
    if (screen !== SCREEN_UPGRADE) return;
    sounds.unlock();
    world.applyUpgrade(index);
    screen = SCREEN_PLAY;
    announce(`Wave ${world.state.wave}.`);
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      const muted = sounds.toggleMute();
      announce(muted ? 'Sound off.' : 'Sound on.');
    }
    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_CONFIRM) startGame();
    } else if (screen === SCREEN_PLAY) {
      if (actions & ACTION_PAUSE) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      }
    } else if (screen === SCREEN_PAUSED) {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    } else if (screen === SCREEN_UPGRADE) {
      if (actions & ACTION_UPGRADE_1) chooseUpgrade(0);
      else if (actions & ACTION_UPGRADE_2) chooseUpgrade(1);
      else if (actions & ACTION_UPGRADE_3) chooseUpgrade(2);
    } else if (screen === SCREEN_OVER || screen === SCREEN_WIN) {
      if (actions & (ACTION_CONFIRM | ACTION_RESTART)) startGame();
    }
    // A click on an upgrade card picks it; anywhere else on the upgrade screen does nothing.
    if (screen === SCREEN_UPGRADE) {
      const click = input.takeClick();
      if (click) {
        const card = pickUpgradeCard(click.x, click.y);
        if (card >= 0) chooseUpgrade(card);
      }
    } else {
      input.takeClick();
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, { mx: 0, my: 0, aimX: 0, aimY: 0, firing: false });
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    const direction = input.direction();
    const aim = input.aim();
    const events = world.step(STEP, {
      mx: direction.x,
      my: direction.y,
      aimX: aim.x,
      aimY: aim.y,
      firing: input.firing(),
    });
    if (events & EVENT_WIN) endRun(true);
    else if (events & EVENT_OVER) endRun(false);
    else if (events & EVENT_UPGRADE_READY) screen = SCREEN_UPGRADE;
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best);
  }

  // Leaving the tab pauses a running game rather than letting the swarm close in unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  world.reset();
  announce('NEONVOID. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
