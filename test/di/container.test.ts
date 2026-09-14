import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Container } from '@chord-dht-tracker/backend-runtime/di';
import type { Token } from '@chord-dht-tracker/backend-runtime/di';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Container', () => {
  it('memoizes factory bindings as singletons via get', () => {
    const container = new Container();
    const NumberToken = Symbol('Number') as Token<number>;
    const factory = vi.fn(() => 42);
    container.bind(NumberToken, factory);

    expect(container.get(NumberToken)).toBe(42);
    expect(container.get(NumberToken)).toBe(42);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('returns bound values and reports bindings via has', () => {
    const container = new Container();
    const ValueToken = Symbol('Value') as Token<string>;
    const MissingToken = Symbol('Missing') as Token<string>;

    expect(container.has(ValueToken)).toBe(false);
    container.bindValue(ValueToken, 'hello');
    expect(container.has(ValueToken)).toBe(true);
    expect(container.get(ValueToken)).toBe('hello');
    expect(container.has(MissingToken)).toBe(false);
  });

  it('resolve creates a fresh instance per call', () => {
    const container = new Container();
    const ServiceToken = Symbol('Service') as Token<{ id: number }>;
    let next = 0;
    container.bind(ServiceToken, () => ({ id: next++ }));

    const first = container.resolve(ServiceToken);
    const second = container.resolve(ServiceToken);

    expect(first).not.toBe(second);
    expect([first.id, second.id].sort()).toEqual([0, 1]);
  });

  it('resolve falls back to get for value bindings', () => {
    const container = new Container();
    const ValueToken = Symbol('Value') as Token<string>;
    container.bindValue(ValueToken, 'stable');

    expect(container.resolve(ValueToken)).toBe('stable');
  });

  it('throws for unbound tokens', () => {
    const container = new Container();
    const MissingToken = Symbol('Missing') as Token<string>;

    expect(() => container.get(MissingToken)).toThrow(/no binding/);
  });

  it('createChild inherits bindings without sharing later overrides', () => {
    const parent = new Container();
    const SharedToken = Symbol('Shared') as Token<string>;
    const ChildToken = Symbol('Child') as Token<string>;
    parent.bindValue(SharedToken, 'parent-value');

    const child = parent.createChild();
    expect(child.get(SharedToken)).toBe('parent-value');

    child.bindValue(ChildToken, 'child-only');
    expect(child.get(ChildToken)).toBe('child-only');
    expect(parent.has(ChildToken)).toBe(false);
  });
});
