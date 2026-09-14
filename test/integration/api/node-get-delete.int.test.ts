import { beforeAll, describe, expect, it } from 'vitest';
import { adminHeaders, api, freshNode, registerNode, setupIntegration } from '../helpers/setup';

beforeAll(async () => {
  await setupIntegration();
});

describe('GET /tracker/nodes/:node_id', () => {
  it('rejects a malformed node_id', async () => {
    const res = await api('/tracker/nodes/not-hex');
    expect(res.status).toBe(400);
    expect(((await res.json()) as { Exception: { Type: string; Message: string } }).Exception.Type).toBe('BadRequest');
  });

  it('returns 404 for an unknown node', async () => {
    const { node_id } = freshNode();
    const res = await api(`/tracker/nodes/${node_id}`);
    expect(res.status).toBe(404);
    expect(((await res.json()) as { Exception: { Type: string; Message: string } }).Exception.Type).toBe('NotFound');
  });

  it('rejects an uppercase node_id', async () => {
    const res = await api(`/tracker/nodes/${'A'.repeat(40)}`);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { Exception: { Type: string } }).Exception.Type).toBe('BadRequest');
  });

  it('stays masked for wrong-token and malformed Authorization callers', async () => {
    const { node_id } = freshNode();
    await registerNode(node_id, `https://node-${node_id.slice(0, 8)}.example`);
    for (const authorization of [
      'Bearer wrong-secret',
      'Bearer ',
      'Token wrong-secret',
      'bearer wrong-secret',
    ]) {
      const res = await api(`/tracker/nodes/${node_id}`, { headers: { Authorization: authorization } });
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.node_id).toBe(node_id);
      for (const [key, value] of Object.entries(body)) {
        if (key === 'node_id') continue;
        expect(value, `expected ${key} masked for ${authorization}`).toBeNull();
      }
    }
  });

  it('masks fields for unauthenticated callers and shows full data to admins', async () => {
    const { node_id, uri } = freshNode();
    await registerNode(node_id, uri, { region: 'r9' });

    const masked = (await (await api(`/tracker/nodes/${node_id}`)).json()) as Record<string, unknown>;
    expect(masked.node_id).toBe(node_id);
    for (const [key, value] of Object.entries(masked)) {
      if (key === 'node_id') continue;
      expect(value, `expected ${key} to be masked`).toBeNull();
    }

    const full = (await (await api(`/tracker/nodes/${node_id}`, { headers: adminHeaders() })).json()) as Record<
      string,
      unknown
    >;
    expect(full.uri).toBe(uri);
    expect(full.status).toBe('ACTIVE');
    expect(full.region).toBe('r9');
  });
});

describe('DELETE /tracker/nodes/:node_id', () => {
  it('rejects a malformed node_id', async () => {
    const res = await api('/tracker/nodes/not-hex', { method: 'DELETE' });
    expect(res.status).toBe(400);
  });

  it('rejects an uppercase node_id on DELETE', async () => {
    const res = await api(`/tracker/nodes/${'B'.repeat(40)}`, { method: 'DELETE' });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { Exception: { Type: string } }).Exception.Type).toBe('BadRequest');
  });

  it('returns 404 for an unknown node', async () => {
    const { node_id } = freshNode();
    const res = await api(`/tracker/nodes/${node_id}`, { method: 'DELETE' });
    expect(res.status).toBe(404);
    expect(((await res.json()) as { Exception: { Type: string; Message: string } }).Exception.Type).toBe('NotFound');
  });

  it('deregisters a node so subsequent reads 404', async () => {
    const { node_id, uri } = freshNode();
    await registerNode(node_id, uri);

    const deleted = await api(`/tracker/nodes/${node_id}`, { method: 'DELETE' });
    expect(deleted.status).toBe(200);
    expect(await deleted.json()).toEqual({ deregistered: true, node_id });

    expect((await api(`/tracker/nodes/${node_id}`, { headers: adminHeaders() })).status).toBe(404);
    expect((await api(`/tracker/nodes/${node_id}`, { method: 'DELETE' })).status).toBe(404);
  });
});
