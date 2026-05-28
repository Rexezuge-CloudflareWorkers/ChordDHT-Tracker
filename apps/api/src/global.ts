// Makes `Env` available as a global type alias for the generated `CloudflareEnv`.
// The `export {}` turns this into a module, which allows `declare global {}` to work.
declare global {
  type Env = CloudflareEnv;
}

export {};
