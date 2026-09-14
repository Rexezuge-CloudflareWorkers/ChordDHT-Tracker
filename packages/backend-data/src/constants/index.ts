// Tracker storage defaults, moved verbatim from apps/api/src/db.ts.
// These are fallbacks when the corresponding Worker vars are absent or invalid.
export const DEFAULT_MAX_VNODES_PER_ANCHOR = 8;
export const DEFAULT_MIN_ANCHOR_RATIO = 0.2;
export const DEFAULT_STABLE_BASE_MIN_SIZE = 6;
// Must exceed the slowest client heartbeat interval (quiet mode: 300s) with
// margin for ticker granularity, clock skew, and one missed heartbeat.
export const DEFAULT_STALE_THRESHOLD_SECS = 600;
// Physical deletion happens much later than the STALE flag: STALE is display-only
// (default 600s), cleanup removes rows only after hours of no heartbeat.
export const DEFAULT_STALE_CLEANUP_AFTER_HOURS = 24;
// D1 limits bound variables per statement; logical-vnode fan-out stays under it.
export const VNODE_ANCHOR_CHUNK_SIZE = 90;
