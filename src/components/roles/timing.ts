/**
 * Durations the Journey's view (useRolesView) and its stage (RolesStage) share. They are here, outside the stage,
 * so the section can wait on them without loading the stage's three.js chunk.
 */

/** Milliseconds a journey takes to grow out of its slot, and to shrink back into it. */
export const EXPAND_MS = 900
/** Milliseconds a journey dissolves into glyphs, with its copy fading, before the page changes under it. */
export const LEAVE_MS = 450
/** Milliseconds a world takes to form from glyphs: a role's journey after a switch, and a row's world on first show. */
export const FORM_MS = 1100
