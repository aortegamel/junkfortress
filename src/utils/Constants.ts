export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

export const GROUND_Y = 660;

export const CORE_X = 150;
export const CORE_Y = 610;
export const CORE_SIZE = 90;

export const PLAYER_SPAWN_X = 250;
export const PLAYER_SPAWN_Y = 620;
export const PLAYER_MIN_X = 60;
export const PLAYER_MAX_X = 700;
export const PLAYER_SPEED = 220;

export const ZOMBIE_SPAWN_X = 1180;
export const ZOMBIE_STOP_X = 320;

export const BUILD_ZONE = {
 x: 60,
 y: 60,
 width: 640,
 height: 600,
};

export const CORE_RECT = {
 x: CORE_X - CORE_SIZE / 2,
 y: CORE_Y - CORE_SIZE / 2,
 width: CORE_SIZE,
 height: CORE_SIZE,
};

export const COLLISION = {
 PLAYER: 0x0001,
 ZOMBIE: 0x0002,
 PLAYER_BULLET: 0x0004,
 ZOMBIE_BULLET: 0x0008,
 BUILD_OBJECT: 0x0010,
 CORE: 0x0020,
 GROUND: 0x0040,
 ALL: 0xffffffff,
} as const;

export const BULLET_MAX_RICOCHETS = 3;
export const BULLET_LIFETIME_MS = 4000;
export const BULLET_CLEANUP_MARGIN = 100;
export const MAX_ACTIVE_BULLETS = 400;

export const RICOCHET_SPEED_DECAY = 0.8;
export const RICOCHET_DAMAGE_DECAY = 0.85;

export const CHAIN_MAX_LENGTH = 220;
export const CHAIN_MAX_HP = 60;
export const CHAIN_SEGMENT_THICKNESS = 8;
export const NAIL_MAX_LENGTH = 24;
export const GROUND_ANCHOR_ID = '__ground__';
export const CONTACT_EPSILON = 4;

export const MAX_BODY_VELOCITY = 1800;

/**
 * Matter integrates velocity in px per 16.67ms step, but every gameplay speed here is authored in
 * px/sec. Anything handed to a Matter body must be divided by this first (or the body moves 60x).
 */
export const STEPS_PER_SECOND = 60;

export const CRUSH_MIN_VY = 200;
export const CRUSH_COOLDOWN_MS = 250;
export const CRUSH_SPEED_THRESHOLD = 150;
export const CRUSH_DAMAGE_FACTOR = 0.05;
export const CRUSH_DAMAGE_MAX = 2500;

/**
 * Propane blast. A tank is 46 px wide, so two tanks can never rest closer than 46 px apart, and
 * explosionDamage(46) is 231 against the tank's 180 hp: the nearest tank always chain-detonates.
 * The 200 px radius is read off play: the horde closes at roughly 29 px/s, so it stands 140-220 px
 * out when a lane tank cooks off, and a 120 px blast reached none of them. Zombies (60 hp) die out
 * to 160 px; a plank (200 hp) only breaks within 73 px, so a tank in your own fort stays usable.
 */
export const BLAST_RADIUS = 200;
export const BLAST_DAMAGE = 300;
export const BLAST_IMPULSE = 10;
export const BLAST_SHAKE = 14;
export const BLAST_SHAKE_MS = 220;

export const GROUND_HEIGHT = GAME_HEIGHT - GROUND_Y;
