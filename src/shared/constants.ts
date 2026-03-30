/** Shared constants used across services. */

export const BLOCKED_TOPICS = [
  "adult", "porn", "nsfw", "xxx", "erotic", "sex",
];

/** 30-day half-life for interest decay (in milliseconds). */
export const HALF_LIFE_MS = 30 * 24 * 60 * 60 * 1000;

/** Decay lambda derived from the half-life. */
export const DECAY_LAMBDA = Math.LN2 / HALF_LIFE_MS;
