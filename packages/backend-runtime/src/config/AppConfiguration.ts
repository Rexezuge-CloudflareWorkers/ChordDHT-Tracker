import { EnvParser } from './EnvParser';
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

/**
 * Injectable instance view over environment configuration.
 *
 * `ConfigurationManager` statics remain as a thin facade delegating here for
 * backward compatibility. New code should accept `AppConfiguration` (or the
 * namespaced groups) via constructor injection so env parsing is stubbable.
 *
 * Each method takes no env — the env is captured at construction time.
 */
class AppConfiguration {
  constructor(private readonly env: unknown) {}

  public static fromEnv(env: unknown): AppConfiguration {
    return new AppConfiguration(env);
  }

  // ─── Tracker ring ───
  public getMaxNodes(): number {
    return EnvParser.positiveInt(this.env, 'MAX_NODES', DEFAULT_MAX_NODES);
  }

  public getStaleThresholdSeconds(): number {
    return EnvParser.positiveInt(this.env, 'STALE_THRESHOLD_SECONDS', DEFAULT_STALE_THRESHOLD_SECONDS);
  }

  public getCleanupAfterHours(): number {
    return EnvParser.positiveInt(this.env, 'STALE_CLEANUP_AFTER_HOURS', DEFAULT_STALE_CLEANUP_AFTER_HOURS);
  }

  // ─── vNode policy ───
  public getMaxVNodesPerAnchor(): number {
    return EnvParser.positiveInt(this.env, 'MAX_VNODES_PER_ANCHOR', DEFAULT_MAX_VNODES_PER_ANCHOR);
  }

  public getMinAnchorRatio(): number {
    const raw = EnvParser.string(this.env, 'MIN_ANCHOR_RATIO', DEFAULT_MIN_ANCHOR_RATIO);
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : Number(DEFAULT_MIN_ANCHOR_RATIO);
  }

  // ─── Stable base ───
  public getStableBaseMembers(): string {
    return EnvParser.string(this.env, 'STABLE_BASE_MEMBERS', DEFAULT_STABLE_BASE_MEMBERS);
  }

  public getStableBaseMembersList(): string[] {
    return this.getStableBaseMembers()
      .split(',')
      .map((member: string): string => member.trim())
      .filter((member: string): boolean => member.length > 0);
  }

  public getStableBaseMinSize(): number {
    return EnvParser.positiveInt(this.env, 'STABLE_BASE_MIN_SIZE', DEFAULT_STABLE_BASE_MIN_SIZE);
  }

  // ─── Misc ───
  public isServeSpaFromWorker(): boolean {
    return EnvParser.boolean(this.env, 'SERVE_SPA_FROM_WORKER', DEFAULT_SERVE_SPA_FROM_WORKER);
  }
}

export { AppConfiguration };
