# ChordDHT-Tracker — Backend Errors

Scope: `packages/backend-errors/**`. Parent index: `../../AGENTS.md`.

Error taxonomy shared by the API worker: `BadRequestError` (400), `UnauthorizedError` (401), `ForbiddenError` (403), `NotFoundError` (404, use for missing resources), `MethodNotAllowedError` (405), `ConflictError` (409, e.g. ID / version collisions), `RateLimitedError` (429, node rate limiter), `InternalServerError` (500), `ServiceUnavailableError` (503, e.g. unconfigured CA key), `DatabaseError`, `IServiceError` (+ `model/ErrorResponse.ts` `{ Exception: { Type, Message } }` shape). Depends only on `hono` for `ContentfulStatusCode`. Keep this package free of `@chord-dht-tracker/*` imports.
