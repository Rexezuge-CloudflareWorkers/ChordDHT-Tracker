import { Hono } from 'hono';
import { nodesRoute } from './routes/nodes';
import { heartbeatRoute } from './routes/heartbeat';
import { statsRoute } from './routes/stats';
import { healthRoute } from './routes/health';

const app = new Hono<{ Bindings: Env }>();

app.route('/tracker/nodes', nodesRoute);
app.route('/tracker/nodes', heartbeatRoute);
app.route('/tracker', statsRoute);
app.route('/tracker', healthRoute);

export default app;
