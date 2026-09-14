import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChordDHTTrackerWorker } from '@/workers';
import { createD1 } from '../mocks/d1';
import { createEnv } from '../mocks/env';
import { okStmt } from '../dao/helpers';

const NODE_A = 'a'.repeat(40);
const NODE_B = 'b'.repeat(40);

function bindArgs(stmt: D1PreparedStatement, call = 0): unknown[] {
  return ((stmt.bind as unknown as ReturnType<typeof vi.fn>).mock.calls as unknown[][])[call];
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /tracker/nodes/seeds query handling', () => {
  it('clamps the count parameter to 1..20', async () => {
    for (const [param, expected] of [['100', 20], ['0', 1], ['oops', 5]] as const) {
      const seedsStmt = okStmt({ allResults: [] });
      const db = createD1(seedsStmt, okStmt({ firstResult: { count: 0 } }));

      const worker = new ChordDHTTrackerWorker();
      const res = await worker.fetch(
        new Request(`http://localhost/tracker/nodes/seeds?count=${param}`),
        createEnv(db),
        {} as ExecutionContext,
      );

      expect(res.status).toBe(200);
      const args = bindArgs(seedsStmt);
      expect(args[args.length - 1]).toBe(expected);
    }
  });

  it('ignores invalid ids in the exclude parameter', async () => {
    const seedsStmt = okStmt({ allResults: [] });
    const db = createD1(seedsStmt, okStmt({ firstResult: { count: 0 } }));

    const worker = new ChordDHTTrackerWorker();
    const res = await worker.fetch(
      new Request(`http://localhost/tracker/nodes/seeds?exclude=not-an-id,${NODE_B}`),
      createEnv(db),
      {} as ExecutionContext,
    );

    expect(res.status).toBe(200);
    const calls = (db.prepare as unknown as ReturnType<typeof vi.fn>).mock.calls as unknown as string[][];
    expect(calls[0][0]).toContain('NOT IN');
    expect(bindArgs(seedsStmt).slice(1, -1)).toEqual([NODE_B]);
  });

  it('omits the exclusion clause when no exclude id is valid', async () => {
    const db = createD1(
      okStmt({ allResults: [] }),
      okStmt({ firstResult: { count: 0 } }),
    );

    const worker = new ChordDHTTrackerWorker();
    const res = await worker.fetch(
      new Request('http://localhost/tracker/nodes/seeds?exclude=nope'),
      createEnv(db),
      {} as ExecutionContext,
    );

    expect(res.status).toBe(200);
    const calls = (db.prepare as unknown as ReturnType<typeof vi.fn>).mock.calls as unknown as string[][];
    expect(calls[0][0]).not.toContain('NOT IN');
  });

  it('attaches stored certificates and skips malformed ones', async () => {
    const cert = { version: 1, node_id: NODE_A };
    const db = createD1(
      okStmt({
        allResults: [
          { node_id: NODE_A, uri: 'https://node1.example.com', cert_json: JSON.stringify(cert) },
          { node_id: NODE_B, uri: 'https://node2.example.com', cert_json: '{broken' },
        ],
      }),
      okStmt({ firstResult: { count: 2 } }),
    );

    const worker = new ChordDHTTrackerWorker();
    const res = await worker.fetch(
      new Request('http://localhost/tracker/nodes/seeds?include_cert=true'),
      createEnv(db),
      {} as ExecutionContext,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      seeds: Array<{ node_id: string; certificate?: unknown }>;
      total_known: number;
    };
    expect(body.total_known).toBe(2);
    expect(body.seeds[0].certificate).toEqual(cert);
    expect(body.seeds[1]).not.toHaveProperty('certificate');
  });

  it('defaults to five seeds without query parameters', async () => {
    const seedsStmt = okStmt({ allResults: [] });
    const db = createD1(seedsStmt, okStmt({ firstResult: { count: 0 } }));

    const worker = new ChordDHTTrackerWorker();
    const res = await worker.fetch(
      new Request('http://localhost/tracker/nodes/seeds'),
      createEnv(db),
      {} as ExecutionContext,
    );

    expect(res.status).toBe(200);
    const args = bindArgs(seedsStmt);
    expect(args[args.length - 1]).toBe(5);
  });
});
