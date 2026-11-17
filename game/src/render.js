// NEONVOID renderer: paints the world on one canvas — neon glow sprites,
// starfield and nebula backdrop, entities, HUD, and every menu screen.
// Glow is pre-rendered to offscreen sprites (cheap), never shadowBlur per frame.
import { COLORS, VIEW } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_UPGRADE = 'upgrade';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

const FONT = '"Arial", "DejaVu Sans", sans-serif';
const TITLE_FONT = '"Arial Black", Arial, sans-serif';

/** Upgrade cards: three boxes in a row, centred. main.js hit-tests clicks here. */
export const CARD = { width: 300, height: 170, gap: 28, y: 300 };

export function upgradeCardRects() {
  const total = CARD.width * 3 + CARD.gap * 2;
  const x0 = (VIEW.width - total) / 2;
  return [0, 1, 2].map((i) => ({ x: x0 + i * (CARD.width + CARD.gap), y: CARD.y, width: CARD.width, height: CARD.height }));
}

/** Which upgrade card (0-2) holds point (x, y), or -1. */
export function pickUpgradeCard(x, y) {
  const rects = upgradeCardRects();
  for (let i = 0; i < rects.length; i += 1) {
    const r = rects[i];
    if (x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height) return i;
  }
  return -1;
}

export function createRenderer(canvas) {
  canvas.width = VIEW.width;
  canvas.height = VIEW.height;
  const ctx = canvas.getContext('2d');

  /** A soft radial glow sprite in one colour, reused for every glowing thing. */
  function makeGlowSprite(color) {
    const size = 128;
    const sprite = document.createElement('canvas');
    sprite.width = size;
    sprite.height = size;
    const g = sprite.getContext('2d');
    const gradient = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, color);
    gradient.addColorStop(0.35, color);
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalAlpha = 0.55;
    g.fillStyle = gradient;
    g.fillRect(0, 0, size, size);
    return sprite;
  }

  const glowSprites = {};
  function glow(color, x, y, size) {
    let sprite = glowSprites[color];
    if (!sprite) {
      sprite = makeGlowSprite(color);
      glowSprites[color] = sprite;
    }
    ctx.drawImage(sprite, x - size / 2, y - size / 2, size, size);
  }

  // Static starfield and nebula blobs, drawn every frame behind the action.
  const stars = [];
  for (let i = 0; i < 140; i += 1) {
    stars.push({ x: Math.random() * VIEW.width, y: Math.random() * VIEW.height, size: Math.random() * 1.8 + 0.4, twinkle: Math.random() * Math.PI * 2 });
  }
  const nebulae = [
    { x: 220, y: 160, radius: 340, color: 'rgba(168, 85, 247, 0.10)' },
    { x: 1080, y: 560, radius: 380, color: 'rgba(255, 45, 149, 0.08)' },
    { x: 980, y: 120, radius: 300, color: 'rgba(34, 211, 238, 0.07)' },
  ];

  function drawBackground(time) {
    const gradient = ctx.createLinearGradient(0, 0, 0, VIEW.height);
    gradient.addColorStop(0, '#0a0618');
    gradient.addColorStop(0.55, '#05060f');
    gradient.addColorStop(1, '#0d0518');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    for (const nebula of nebulae) {
      const drift = Math.sin(time * 0.12 + nebula.x) * 12;
      const g = ctx.createRadialGradient(nebula.x + drift, nebula.y, 0, nebula.x + drift, nebula.y, nebula.radius);
      g.addColorStop(0, nebula.color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(nebula.x - nebula.radius, nebula.y - nebula.radius, nebula.radius * 2, nebula.radius * 2);
    }
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.5;
    for (let x = 0; x <= VIEW.width; x += 80) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, VIEW.height);
      ctx.stroke();
    }
    for (let y = 0; y <= VIEW.height; y += 80) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(VIEW.width, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (const star of stars) {
      const alpha = 0.35 + 0.4 * Math.abs(Math.sin(time * 1.4 + star.twinkle));
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#cfe6ff';
      ctx.fillRect(star.x, star.y, star.size, star.size);
    }
    ctx.globalAlpha = 1;
  }

  function drawPolygon(x, y, radius, sides, rotation) {
    ctx.beginPath();
    for (let i = 0; i < sides; i += 1) {
      const angle = rotation + (i / sides) * Math.PI * 2;
      const px = x + Math.cos(angle) * radius;
      const py = y + Math.sin(angle) * radius;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  function drawEnemy(enemy, time, showHpBar) {
    const spawnAlpha = enemy.spawnIn > 0 ? 1 - enemy.spawnIn / 0.4 : 1;
    ctx.save();
    ctx.globalAlpha = spawnAlpha;
    ctx.globalCompositeOperation = 'lighter';
    glow(enemy.color, enemy.x, enemy.y, enemy.radius * 5);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = enemy.color;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    if (enemy.shape === 'diamond') {
      drawPolygon(enemy.x, enemy.y, enemy.radius, 4, time * 1.5 + enemy.wobble);
      ctx.fill();
      ctx.stroke();
    } else if (enemy.shape === 'dart') {
      const winding = enemy.dashState === 'windup';
      if (winding) {
        ctx.strokeStyle = '#ffffff';
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.moveTo(enemy.x, enemy.y);
        ctx.lineTo(enemy.x + enemy.dashVx * 160, enemy.y + enemy.dashVy * 160);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      drawPolygon(enemy.x, enemy.y, enemy.radius + 4, 3, enemy.angle);
      ctx.fill();
      ctx.stroke();
    } else if (enemy.shape === 'square') {
      ctx.save();
      ctx.translate(enemy.x, enemy.y);
      ctx.rotate(time * 1.2 + enemy.wobble);
      ctx.fillRect(-enemy.radius * 0.8, -enemy.radius * 0.8, enemy.radius * 1.6, enemy.radius * 1.6);
      ctx.strokeRect(-enemy.radius * 0.8, -enemy.radius * 0.8, enemy.radius * 1.6, enemy.radius * 1.6);
      ctx.restore();
      ctx.fillStyle = '#062a33';
      ctx.beginPath();
      ctx.arc(enemy.x, enemy.y, 4, 0, Math.PI * 2);
      ctx.fill();
    } else if (enemy.shape === 'blob') {
      ctx.beginPath();
      ctx.arc(enemy.x - 7, enemy.y, enemy.radius * 0.62, 0, Math.PI * 2);
      ctx.arc(enemy.x + 7, enemy.y, enemy.radius * 0.62, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(enemy.x, enemy.y, enemy.radius * 0.72, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (enemy.shape === 'hexagon') {
      drawPolygon(enemy.x, enemy.y, enemy.radius, 6, time * 0.6);
      ctx.fill();
      ctx.stroke();
      drawPolygon(enemy.x, enemy.y, enemy.radius * 0.45, 6, -time * 0.6);
      ctx.fillStyle = '#1a0d02';
      ctx.fill();
    } else if (enemy.shape === 'core') {
      // Boss: pulsing core, rotating ring, crown spikes.
      const pulse = 1 + Math.sin(time * 4) * 0.06;
      ctx.save();
      ctx.translate(enemy.x, enemy.y);
      ctx.rotate(time * 0.5);
      ctx.strokeStyle = enemy.color;
      ctx.lineWidth = 5;
      ctx.setLineDash([26, 14]);
      ctx.beginPath();
      ctx.arc(0, 0, enemy.radius + 14, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      drawPolygon(enemy.x, enemy.y, enemy.radius * pulse, 8, time * 0.4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(enemy.x, enemy.y, enemy.radius * 0.34 * pulse, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    if (enemy.flash > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, enemy.flash / 0.08);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(enemy.x, enemy.y, enemy.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    if (showHpBar && enemy.maxHp > 40) {
      const width = enemy.radius * 2;
      const ratio = Math.max(0, enemy.hp / enemy.maxHp);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(enemy.x - width / 2, enemy.y - enemy.radius - 14, width, 5);
      ctx.fillStyle = enemy.color;
      ctx.fillRect(enemy.x - width / 2, enemy.y - enemy.radius - 14, width * ratio, 5);
    }
  }

  function drawPlayer(player, time) {
    if (!player.alive) return;
    const blink = player.invulnTimer > 0 && Math.floor(time * 16) % 2 === 0;
    ctx.save();
    if (blink) ctx.globalAlpha = 0.45;
    ctx.globalCompositeOperation = 'lighter';
    glow(COLORS.player, player.x, player.y, 110);
    ctx.globalCompositeOperation = 'source-over';
    // Engine flame.
    const flame = 12 + Math.sin(time * 30) * 4;
    ctx.fillStyle = '#ff9d00';
    ctx.beginPath();
    ctx.moveTo(player.x - Math.cos(player.angle) * 14, player.y - Math.sin(player.angle) * 14);
    ctx.lineTo(player.x - Math.cos(player.angle) * (14 + flame) - Math.sin(player.angle) * 6, player.y - Math.sin(player.angle) * (14 + flame) + Math.cos(player.angle) * 6);
    ctx.lineTo(player.x - Math.cos(player.angle) * (14 + flame) + Math.sin(player.angle) * 6, player.y - Math.sin(player.angle) * (14 + flame) - Math.cos(player.angle) * 6);
    ctx.closePath();
    ctx.fill();
    // Ship: a sharp arrowhead.
    ctx.translate(player.x, player.y);
    ctx.rotate(player.angle);
    ctx.fillStyle = COLORS.player;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(20, 0);
    ctx.lineTo(-12, -12);
    ctx.lineTo(-6, 0);
    ctx.lineTo(-12, 12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = COLORS.playerCore;
    ctx.beginPath();
    ctx.arc(4, 0, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (player.hasShield && player.shieldReady) {
      ctx.save();
      ctx.strokeStyle = 'rgba(125, 211, 252, 0.85)';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([10, 8]);
      ctx.lineDashOffset = -time * 30;
      ctx.beginPath();
      ctx.arc(player.x, player.y, player.radius + 12, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawHud(state, best, screen) {
    const player = state.player;
    ctx.textBaseline = 'alphabetic';
    // Score, big and top-left.
    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.text;
    ctx.font = `900 34px ${FONT}`;
    ctx.fillText(`${state.score.toLocaleString('en-US')}`, 24, 46);
    ctx.font = `700 14px ${FONT}`;
    ctx.fillStyle = COLORS.dim;
    ctx.fillText(`BEST ${Math.max(best, state.score).toLocaleString('en-US')}   •   KILLS ${state.kills}`, 24, 70);
    // Wave, top-centre.
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.text;
    ctx.font = `900 26px ${FONT}`;
    ctx.fillText(`WAVE ${Math.max(1, state.wave)} / 10`, VIEW.width / 2, 42);
    ctx.font = `700 14px ${FONT}`;
    ctx.fillStyle = COLORS.dim;
    const remaining = state.spawnQueue.length + state.enemies.length;
    ctx.fillText(state.waveState === 'fighting' ? `${remaining} HOSTILES LEFT` : 'WAVE CLEAR', VIEW.width / 2, 64);
    // Multiplier badge, top-right.
    if (state.multiplier > 1) {
      ctx.textAlign = 'right';
      ctx.fillStyle = '#facc15';
      ctx.font = `900 26px ${FONT}`;
      ctx.fillText(`x${state.multiplier} COMBO`, VIEW.width - 24, 44);
      ctx.font = `700 13px ${FONT}`;
      ctx.fillStyle = COLORS.dim;
      ctx.fillText('chain kills to raise it', VIEW.width - 24, 66);
    }
    // HP bar, bottom-left, thick enough to read in a thumbnail.
    const barWidth = 260;
    const barHeight = 18;
    const barX = 24;
    const barY = VIEW.height - 40;
    ctx.textAlign = 'left';
    ctx.font = `900 15px ${FONT}`;
    ctx.fillStyle = COLORS.text;
    ctx.fillText('HULL', barX, barY - 8);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(barX, barY, barWidth, barHeight);
    const hpRatio = Math.max(0, player.hp / player.maxHp);
    ctx.fillStyle = hpRatio > 0.5 ? COLORS.health : hpRatio > 0.25 ? '#facc15' : '#ef4444';
    ctx.fillRect(barX, barY, barWidth * hpRatio, barHeight);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(barX, barY, barWidth, barHeight);
    ctx.fillStyle = COLORS.text;
    ctx.font = `700 14px ${FONT}`;
    ctx.fillText(`${Math.ceil(player.hp)} / ${player.maxHp}`, barX + barWidth + 12, barY + 15);
    if (player.hasShield) {
      ctx.fillStyle = player.shieldReady ? '#7dd3fc' : COLORS.dim;
      ctx.fillText(player.shieldReady ? '◉ SHIELD READY' : `◌ SHIELD ${Math.ceil(player.shieldCooldown)}s`, barX, barY + 38);
    }
    if (player.overchargeTimer > 0) {
      ctx.textAlign = 'right';
      ctx.fillStyle = COLORS.overcharge;
      ctx.font = `900 16px ${FONT}`;
      ctx.fillText(`OVERCHARGE ${Math.ceil(player.overchargeTimer)}s`, VIEW.width - 24, VIEW.height - 26);
    }
    // Wave banner: only during play (the upgrade screen announces the clear itself).
    if (screen === SCREEN_PLAY && state.banner) {
      const alpha = Math.min(1, state.banner.timer / 0.4);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff';
      ctx.font = `900 52px ${TITLE_FONT}`;
      ctx.fillText(state.banner.text, VIEW.width / 2, VIEW.height / 2 - 90);
      ctx.font = `700 19px ${FONT}`;
      ctx.fillStyle = COLORS.dim;
      ctx.fillText(state.banner.subtext, VIEW.width / 2, VIEW.height / 2 - 58);
      ctx.restore();
    }
  }

  function dimOverlay(alpha) {
    ctx.fillStyle = `rgba(3, 4, 12, ${alpha})`;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  }

  function drawTitle(state, best) {
    dimOverlay(0.45);
    const pulse = 1 + Math.sin(state.time * 2.2) * 0.02;
    ctx.save();
    ctx.translate(VIEW.width / 2, 218);
    ctx.scale(pulse, pulse);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#a855f7';
    ctx.font = `900 108px ${TITLE_FONT}`;
    ctx.fillText('NEONVOID', 6, 6);
    ctx.fillStyle = '#39ff9c';
    ctx.fillText('NEONVOID', 0, 0);
    ctx.restore();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff2d95';
    ctx.font = `900 30px ${FONT}`;
    ctx.fillText('— ARENA SURVIVAL —', VIEW.width / 2, 268);
    ctx.fillStyle = COLORS.text;
    ctx.font = `700 20px ${FONT}`;
    ctx.fillText('Blast the void swarm. Survive all 10 waves. Slay the VOID CORE.', VIEW.width / 2, 316);
    ctx.font = `700 18px ${FONT}`;
    ctx.fillStyle = COLORS.dim;
    ctx.fillText('WASD / ARROWS — move      MOUSE — aim      HOLD CLICK / SPACE — fire', VIEW.width / 2, 356);
    ctx.fillText('P — pause      M — mute      R — restart      1 / 2 / 3 — pick upgrade', VIEW.width / 2, 384);
    ctx.fillStyle = '#facc15';
    ctx.font = `900 22px ${FONT}`;
    ctx.fillText(`BEST SCORE  ${Math.max(best, 0).toLocaleString('en-US')}`, VIEW.width / 2, 438);
    // Start prompt: always visible, gently pulsing (never blinking off).
    ctx.save();
    ctx.globalAlpha = 0.7 + 0.3 * Math.sin(state.time * 3);
    ctx.fillStyle = '#ffffff';
    ctx.font = `900 26px ${FONT}`;
    ctx.fillText('CLICK OR PRESS SPACE TO START', VIEW.width / 2, 500);
    ctx.restore();
    ctx.fillStyle = COLORS.dim;
    ctx.font = `700 15px ${FONT}`;
    ctx.fillText('Chain kills for combo multipliers • Graze bullets for bonus • Grab health and overcharge drops', VIEW.width / 2, 556);
  }

  function drawUpgrade(state) {
    dimOverlay(0.55);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#facc15';
    ctx.font = `900 44px ${TITLE_FONT}`;
    ctx.fillText(`WAVE ${state.wave} CLEAR`, VIEW.width / 2, 210);
    ctx.fillStyle = COLORS.text;
    ctx.font = `700 20px ${FONT}`;
    ctx.fillText('Choose an upgrade — click a card or press 1 / 2 / 3', VIEW.width / 2, 250);
    const rects = upgradeCardRects();
    state.upgradeChoices.forEach((choice, i) => {
      const r = rects[i];
      ctx.fillStyle = 'rgba(20, 26, 51, 0.92)';
      ctx.fillRect(r.x, r.y, r.width, r.height);
      ctx.strokeStyle = '#39ff9c';
      ctx.lineWidth = 2;
      ctx.strokeRect(r.x, r.y, r.width, r.height);
      ctx.fillStyle = '#facc15';
      ctx.font = `900 22px ${FONT}`;
      ctx.fillText(`[${i + 1}]`, r.x + r.width / 2, r.y + 44);
      ctx.fillStyle = COLORS.text;
      ctx.font = `900 22px ${FONT}`;
      ctx.fillText(choice.label, r.x + r.width / 2, r.y + 84);
      ctx.fillStyle = COLORS.dim;
      ctx.font = `700 17px ${FONT}`;
      ctx.fillText(choice.detail, r.x + r.width / 2, r.y + 118);
    });
  }

  function drawPaused() {
    dimOverlay(0.6);
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.text;
    ctx.font = `900 56px ${TITLE_FONT}`;
    ctx.fillText('PAUSED', VIEW.width / 2, VIEW.height / 2 - 10);
    ctx.font = `700 20px ${FONT}`;
    ctx.fillStyle = COLORS.dim;
    ctx.fillText('Press P or click to resume', VIEW.width / 2, VIEW.height / 2 + 30);
  }

  function drawOver(state, best, won) {
    dimOverlay(0.74);
    ctx.textAlign = 'center';
    if (won) {
      ctx.fillStyle = '#39ff9c';
      ctx.font = `900 64px ${TITLE_FONT}`;
      ctx.fillText('VOID CONQUERED!', VIEW.width / 2, 240);
      ctx.fillStyle = COLORS.text;
      ctx.font = `700 22px ${FONT}`;
      ctx.fillText('You survived all 10 waves and destroyed the VOID CORE.', VIEW.width / 2, 286);
    } else {
      ctx.fillStyle = '#ff2d5e';
      ctx.font = `900 72px ${TITLE_FONT}`;
      ctx.fillText('GAME OVER', VIEW.width / 2, 240);
      ctx.fillStyle = COLORS.text;
      ctx.font = `700 22px ${FONT}`;
      ctx.fillText(`The swarm got you on wave ${Math.max(1, state.wave)}.`, VIEW.width / 2, 286);
    }
    ctx.fillStyle = '#ffffff';
    ctx.font = `900 44px ${FONT}`;
    ctx.fillText(`SCORE  ${state.score.toLocaleString('en-US')}`, VIEW.width / 2, 372);
    ctx.font = `700 20px ${FONT}`;
    ctx.fillStyle = state.score > best ? '#facc15' : COLORS.dim;
    ctx.fillText(
      state.score > best ? '★ NEW BEST SCORE ★' : `BEST  ${Math.max(best, state.score).toLocaleString('en-US')}`,
      VIEW.width / 2,
      412,
    );
    ctx.fillStyle = COLORS.text;
    ctx.font = `700 20px ${FONT}`;
    ctx.fillText(`WAVES CLEARED  ${won ? 10 : Math.max(0, state.wave - 1)}   •   KILLS  ${state.kills}`, VIEW.width / 2, 452);
    // Restart prompt: always visible, gently pulsing (never blinking off).
    ctx.save();
    ctx.globalAlpha = 0.7 + 0.3 * Math.sin(state.time * 3);
    ctx.fillStyle = '#39ff9c';
    ctx.font = `900 26px ${FONT}`;
    ctx.fillText('PRESS R OR CLICK TO PLAY AGAIN', VIEW.width / 2, 522);
    ctx.restore();
  }

  return {
    draw(state, screen, best) {
      const time = state.time;
      ctx.save();
      if (state.shake > 0.3) {
        ctx.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
      }
      drawBackground(time);
      ctx.globalCompositeOperation = 'lighter';
      for (const pickup of state.pickups) {
        const bob = Math.sin(pickup.bob) * 3;
        glow(pickup.kind === 'health' ? COLORS.health : COLORS.overcharge, pickup.x, pickup.y + bob, 60);
      }
      for (const bullet of state.bullets) {
        glow(COLORS.bullet, bullet.x, bullet.y, 26);
      }
      for (const bullet of state.enemyBullets) {
        glow(COLORS.enemyBullet, bullet.x, bullet.y, 34);
      }
      ctx.globalCompositeOperation = 'source-over';
      for (const pickup of state.pickups) {
        const bob = Math.sin(pickup.bob) * 3;
        ctx.fillStyle = pickup.kind === 'health' ? COLORS.health : COLORS.overcharge;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(pickup.x, pickup.y + bob, pickup.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#06210f';
        ctx.font = `900 16px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText(pickup.kind === 'health' ? '+' : '⚡', pickup.x, pickup.y + bob + 6);
      }
      for (const bullet of state.bullets) {
        ctx.strokeStyle = COLORS.bullet;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(bullet.x - bullet.vx * 0.02, bullet.y - bullet.vy * 0.02);
        ctx.lineTo(bullet.x, bullet.y);
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(bullet.x, bullet.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      for (const bullet of state.enemyBullets) {
        ctx.fillStyle = COLORS.enemyBullet;
        ctx.beginPath();
        ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(bullet.x, bullet.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      for (const enemy of state.enemies) drawEnemy(enemy, time, screen !== SCREEN_TITLE);
      drawPlayer(state.player, time);
      for (const particle of state.particles) {
        ctx.globalAlpha = Math.max(0, particle.life / particle.maxLife);
        ctx.fillStyle = particle.color;
        ctx.fillRect(particle.x - particle.size / 2, particle.y - particle.size / 2, particle.size, particle.size);
      }
      ctx.globalAlpha = 1;
      ctx.textAlign = 'center';
      for (const floater of state.floaters) {
        ctx.globalAlpha = Math.max(0, floater.life / floater.maxLife);
        ctx.fillStyle = floater.color;
        ctx.font = `900 18px ${FONT}`;
        ctx.fillText(floater.text, floater.x, floater.y);
      }
      ctx.globalAlpha = 1;
      ctx.restore();

      if (screen === SCREEN_PLAY || screen === SCREEN_UPGRADE || screen === SCREEN_PAUSED) drawHud(state, best, screen);
      if (screen === SCREEN_TITLE) drawTitle(state, best);
      else if (screen === SCREEN_UPGRADE) drawUpgrade(state);
      else if (screen === SCREEN_PAUSED) drawPaused();
      else if (screen === SCREEN_OVER) drawOver(state, best, false);
      else if (screen === SCREEN_WIN) drawOver(state, best, true);
    },
  };
}
