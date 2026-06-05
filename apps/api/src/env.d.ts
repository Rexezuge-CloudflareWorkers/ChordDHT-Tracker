export {};

declare global {
  interface StableBaseEnv {
    STABLE_BASE_MEMBERS: string;
    STABLE_BASE_MIN_SIZE: string;
  }

  type Env = CloudflareEnv & StableBaseEnv;
}
