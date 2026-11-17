// Keyboard + mouse input, translated into canvas coordinates and one-frame actions.
import { VIEW } from './config.js';

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_RESTART = 4;
export const ACTION_MUTE = 8;
export const ACTION_UPGRADE_1 = 16;
export const ACTION_UPGRADE_2 = 32;
export const ACTION_UPGRADE_3 = 64;

const CONFIRM_KEYS = new Set(['Space', 'Enter']);
const PAUSE_KEYS = new Set(['KeyP', 'Escape']);

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  const mouse = { x: VIEW.width / 2, y: VIEW.height / 2, down: false, clicked: false, clickX: 0, clickY: 0 };

  function canvasPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * VIEW.width,
      y: ((event.clientY - rect.top) / rect.height) * VIEW.height,
    };
  }

  window.addEventListener('keydown', (event) => {
    if (CONFIRM_KEYS.has(event.code)) actions |= ACTION_CONFIRM;
    else if (PAUSE_KEYS.has(event.code)) actions |= ACTION_PAUSE;
    else if (event.code === 'KeyR') actions |= ACTION_RESTART;
    else if (event.code === 'KeyM') actions |= ACTION_MUTE;
    else if (event.code === 'Digit1') actions |= ACTION_UPGRADE_1;
    else if (event.code === 'Digit2') actions |= ACTION_UPGRADE_2;
    else if (event.code === 'Digit3') actions |= ACTION_UPGRADE_3;
    keys.add(event.code);
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
  });
  window.addEventListener('keyup', (event) => keys.delete(event.code));
  window.addEventListener('blur', () => keys.clear());

  canvas.addEventListener('mousemove', (event) => {
    const point = canvasPoint(event);
    mouse.x = point.x;
    mouse.y = point.y;
  });
  canvas.addEventListener('mousedown', (event) => {
    const point = canvasPoint(event);
    mouse.x = point.x;
    mouse.y = point.y;
    mouse.down = true;
    mouse.clicked = true;
    mouse.clickX = point.x;
    mouse.clickY = point.y;
    actions |= ACTION_CONFIRM;
  });
  window.addEventListener('mouseup', () => {
    mouse.down = false;
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    /** WASD / arrow movement as a unit vector (0,0 when idle). */
    direction() {
      let x = 0;
      let y = 0;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
      if (keys.has('KeyW') || keys.has('ArrowUp')) y -= 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) y += 1;
      if (x === 0 && y === 0) return { x: 0, y: 0 };
      const length = Math.hypot(x, y);
      return { x: x / length, y: y / length };
    },
    /** Where the mouse aims, in arena coordinates. */
    aim() {
      return { x: mouse.x, y: mouse.y };
    },
    /** Hold mouse or Space to keep firing. */
    firing() {
      return mouse.down || keys.has('Space');
    },
    /** One-frame actions since the last call; also consumes the click. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** The last click point, if a click happened since the last call. */
    takeClick() {
      if (!mouse.clicked) return null;
      mouse.clicked = false;
      return { x: mouse.clickX, y: mouse.clickY };
    },
  };
}
