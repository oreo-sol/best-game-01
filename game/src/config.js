// NEONVOID tuning: arena size, palette, player stats, enemy stats, wave rules.
// One place for every number a designer would tweak.
export const VIEW = { width: 1280, height: 720 };
export const STEP = 1 / 60;
export const BEST_KEY = 'neonvoid-best';
export const WIN_WAVE = 10;

export const PLAYER = {
  radius: 14,
  speed: 300,
  maxHp: 100,
  fireInterval: 0.14,
  bulletSpeed: 640,
  bulletDamage: 12,
  bulletRadius: 5,
  invulnSeconds: 0.7,
};

export const COLORS = {
  background: '#05060f',
  grid: '#141a33',
  player: '#39ff9c',
  playerCore: '#eafff3',
  bullet: '#a5ffce',
  enemyBullet: '#ff5d8f',
  chaser: '#ff2d95',
  dasher: '#ffd60a',
  shooter: '#22d3ee',
  splitter: '#a3e635',
  tank: '#fb923c',
  boss: '#a855f7',
  health: '#4ade80',
  overcharge: '#facc15',
  text: '#e6f1ff',
  dim: '#8b98b8',
};

/**
 * Enemy roster. hp/speed grow with the wave; score is what a kill is worth.
 * touch is the damage a collision deals to the player.
 * Each type moves and fights differently: chasers hunt, dashers telegraph and
 * lunge, shooters keep their distance and fire, splitters burst into minis.
 */
export const ENEMY_TYPES = {
  chaser: { color: COLORS.chaser, radius: 16, hp: 22, hpPerWave: 4, speed: 95, speedPerWave: 6, score: 50, touch: 12, shape: 'diamond' },
  dasher: { color: COLORS.dasher, radius: 14, hp: 18, hpPerWave: 3, speed: 120, speedPerWave: 7, score: 75, touch: 12, shape: 'dart' },
  shooter: { color: COLORS.shooter, radius: 15, hp: 20, hpPerWave: 4, speed: 80, speedPerWave: 4, score: 90, touch: 10, shape: 'square' },
  splitter: { color: COLORS.splitter, radius: 22, hp: 40, hpPerWave: 8, speed: 60, speedPerWave: 3, score: 80, touch: 14, shape: 'blob' },
  mini: { color: COLORS.chaser, radius: 9, hp: 8, hpPerWave: 1, speed: 170, speedPerWave: 6, score: 25, touch: 8, shape: 'diamond' },
  tank: { color: COLORS.tank, radius: 26, hp: 75, hpPerWave: 12, speed: 55, speedPerWave: 3, score: 150, touch: 20, shape: 'hexagon' },
  boss: { color: COLORS.boss, radius: 48, hp: 650, hpPerWave: 150, speed: 45, speedPerWave: 2, score: 1000, touch: 25, shape: 'core' },
};

/** How many of each enemy a wave fields. Boss waves are every 5th wave. */
export function waveRoster(wave) {
  const roster = [];
  const chasers = 4 + wave;
  const dashers = 1 + Math.floor(wave / 2);
  const shooters = wave >= 2 ? 1 + Math.floor(wave / 3) : 0;
  const splitters = wave >= 3 ? Math.floor(wave / 3) : 0;
  const tanks = Math.floor(wave / 2);
  for (let i = 0; i < chasers; i += 1) roster.push('chaser');
  for (let i = 0; i < dashers; i += 1) roster.push('dasher');
  for (let i = 0; i < shooters; i += 1) roster.push('shooter');
  for (let i = 0; i < splitters; i += 1) roster.push('splitter');
  for (let i = 0; i < tanks; i += 1) roster.push('tank');
  if (wave % 5 === 0) roster.push('boss');
  return roster;
}

/** Upgrade choices offered between waves: id, label, detail, apply. */
export const UPGRADES = [
  { id: 'rapid', label: 'RAPID TRIGGER', detail: '+18% fire rate', apply: (p) => { p.fireMul *= 1.18; } },
  { id: 'heavy', label: 'HEAVY ROUNDS', detail: '+25% bullet damage', apply: (p) => { p.damageMul *= 1.25; } },
  { id: 'thrusters', label: 'ION THRUSTERS', detail: '+12% move speed', apply: (p) => { p.speedMul *= 1.12; } },
  { id: 'hull', label: 'REINFORCED HULL', detail: '+25 max HP, heal 25', apply: (p) => { p.maxHp += 25; p.hp = Math.min(p.maxHp, p.hp + 25); } },
  { id: 'split', label: 'SPLIT SHOT', detail: '+1 bullet stream (max 3)', apply: (p) => { p.streams = Math.min(3, p.streams + 1); } },
  { id: 'pierce', label: 'PIERCING ROUNDS', detail: 'Bullets pass through +1 enemy', apply: (p) => { p.pierce += 1; } },
  { id: 'aegis', label: 'AEGIS SHIELD', detail: 'Blocks one hit, recharges in 12s', apply: (p) => { p.hasShield = true; p.shieldReady = true; p.shieldCooldown = 0; } },
];
