import {
  DEFAULT_MAX_NODES,
  DEFAULT_MAX_VNODES_PER_ANCHOR,
  DEFAULT_MIN_ANCHOR_RATIO,
  DEFAULT_SERVE_SPA_FROM_WORKER,
  DEFAULT_STABLE_BASE_MEMBERS,
  DEFAULT_STABLE_BASE_MIN_SIZE,
  DEFAULT_STALE_CLEANUP_AFTER_HOURS,
  DEFAULT_STALE_THRESHOLD_SECONDS,
} from './ConfigurationDefaults';
import { EnvParser } from './EnvParser';

class ConfigurationManager {
  // ─── Namespace groups ────────────────────────────────────────────────────────

  public static readonly tracker = {
    getMaxNodes: (env: unknown): number => EnvParser.positiveInt(env, 'MAX_NODES', DEFAULT_MAX_NODES),
    getStaleThresholdSeconds: (env: unknown): number =>
      EnvParser.positiveInt(env, 'STALE_THRESHOLD_SECONDS', DEFAULT_STALE_THRESHOLD_SECONDS),
    getCleanupAfterHours: (env: unknown): number =>
      EnvParser.positiveInt(env, 'STALE_CLEANUP_AFTER_HOURS', DEFAULT_STALE_CLEANUP_AFTER_HOURS),
    isServeSpaFromWorker: (env: unknown): boolean =>
      EnvParser.boolean(env, 'SERVE_SPA_FROM_WORKER', DEFAULT_SERVE_SPA_FROM_WORKER),
  };

  public static readonly vnodePolicy = {
    getMaxVNodesPerAnchor: (env: unknown): number =>
      EnvParser.positiveInt(env, 'MAX_VNODES_PER_ANCHOR', DEFAULT_MAX_VNODES_PER_ANCHOR),
    getMinAnchorRatio: (env: unknown): number => ConfigurationManager.getMinAnchorRatio(env),
  };

  public static readonly stableBase = {
    getMembers: (env: unknown): string => EnvParser.string(env, 'STABLE_BASE_MEMBERS', DEFAULT_STABLE_BASE_MEMBERS),
    getMembersList: (env: unknown): string[] =>
      EnvParser.string(env, 'STABLE_BASE_MEMBERS', DEFAULT_STABLE_BASE_MEMBERS)
        .split(',')
        .map((member: string): string => member.trim())
        .filter((member: string): boolean => member.length > 0),
    getMinSize: (env: unknown): number => EnvParser.positiveInt(env, 'STABLE_BASE_MIN_SIZE', DEFAULT_STABLE_BASE_MIN_SIZE),
  };

  // ─── Flat API (backward-compatible, delegates to namespace groups) ────────────

  public static getMaxNodes(env: unknown): number { return this.tracker.getMaxNodes(env); }
  public static getStaleThresholdSeconds(env: unknown): number { return this.tracker.getStaleThresholdSeconds(env); }
  public static getCleanupAfterHours(env: unknown): number { return this.tracker.getCleanupAfterHours(env); }
  public static getMaxVNodesPerAnchor(env: unknown): number { return this.vnodePolicy.getMaxVNodesPerAnchor(env); }
  public static getMinAnchorRatio(env: unknown): number {
    const raw = EnvParser.string(env, 'MIN_ANCHOR_RATIO', DEFAULT_MIN_ANCHOR_RATIO);
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : Number(DEFAULT_MIN_ANCHOR_RATIO);
  }
  public static getStableBaseMembers(env: unknown): string { return this.stableBase.getMembers(env); }
  public static getStableBaseMembersList(env: unknown): string[] { return this.stableBase.getMembersList(env); }
  public static getStableBaseMinSize(env: unknown): number { return this.stableBase.getMinSize(env); }
  public static isServeSpaFromWorker(env: unknown): boolean { return this.tracker.isServeSpaFromWorker(env); }
}

export { ConfigurationManager };
