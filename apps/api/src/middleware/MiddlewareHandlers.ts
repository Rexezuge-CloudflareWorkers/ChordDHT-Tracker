import { UnauthorizedError } from '@chord-dht-tracker/backend-errors';
import { AuthService } from '@chord-dht-tracker/backend-services/auth';
import type { ServiceEnv } from '@chord-dht-tracker/backend-runtime/config';
import type { Context, Next } from 'hono';

type AdminContext = Context<{ Bindings: Env }>;

class MiddlewareHandlers {
  /**
   * Hono middleware enforcing admin authentication on protected routes.
   * Public tracker routes stay open (admin only unlocks masked fields), so
   * this is applied per-route, not globally.
   */
  public static adminAuthentication() {
    // eslint-disable-next-line unicorn/consistent-function-scoping
    return async (c: AdminContext, next: Next): Promise<Response | void> => {
      await this.requireAdmin(c.req.raw, c.env);
      await next();
    };
  }

  /**
   * Shared admin guard for routes doing inline checks (e.g. admin verify).
   * Throws UnauthorizedError (mapped to the Exception envelope by IBaseRoute)
   * instead of returning ad-hoc error shapes.
   */
  public static async requireAdmin(request: Request, env: ServiceEnv): Promise<void> {
    const auth = new AuthService(env);
    if (!(await auth.isAdmin(request))) {
      throw new UnauthorizedError('Invalid or missing admin token');
    }
  }
}

export { MiddlewareHandlers };
