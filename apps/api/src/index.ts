import { ChordDHTTrackerWorker } from '@/workers';

const worker = new ChordDHTTrackerWorker();

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return worker.fetch(request, env, ctx);
  },
};
