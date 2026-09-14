import { describe, expect, it } from 'vitest';
import { CursorUtil } from '@chord-dht-tracker/backend-data/utils';
import { EnvParser } from '@chord-dht-tracker/backend-runtime/config';

describe('CursorUtil', () => {
  it('encodes and decodes a payload', () => {
    const cursor = CursorUtil.encode({ limit: 50, offset: 100 });
    expect(CursorUtil.decode<{ limit: number; offset: number }>(cursor)).toEqual({ limit: 50, offset: 100 });
  });

  it('decodes missing or malformed cursors to undefined', () => {
    expect(CursorUtil.decode(undefined)).toBeUndefined();
    expect(CursorUtil.decode('')).toBeUndefined();
    expect(CursorUtil.decode('!!!not-base64!!!')).toBeUndefined();
  });
});

describe('EnvParser', () => {
  it('parses positive ints with default fallback', () => {
    expect(EnvParser.positiveInt({ N: '48' }, 'N', '24')).toBe(48);
    expect(EnvParser.positiveInt({}, 'N', '24')).toBe(24);
    expect(EnvParser.positiveInt({ N: 'abc' }, 'N', '24')).toBe(24);
    expect(EnvParser.positiveInt({ N: '0' }, 'N', '24')).toBe(24);
    expect(EnvParser.positiveInt({ N: '-5' }, 'N', '24')).toBe(24);
  });

  it('parses non-negative ints', () => {
    expect(EnvParser.nonNegativeInt({ N: '0' }, 'N', '6')).toBe(0);
    expect(EnvParser.nonNegativeInt({ N: '7' }, 'N', '6')).toBe(7);
    expect(EnvParser.nonNegativeInt({ N: '-1' }, 'N', '6')).toBe(6);
    expect(EnvParser.nonNegativeInt({}, 'N', '6')).toBe(6);
  });

  it('parses strings and booleans', () => {
    expect(EnvParser.string({ S: 'x' }, 'S', 'd')).toBe('x');
    expect(EnvParser.string({}, 'S', 'd')).toBe('d');
    expect(EnvParser.boolean({ B: 'true' }, 'B', 'false')).toBe(true);
    expect(EnvParser.boolean({ B: 'yes' }, 'B', 'false')).toBe(false);
    expect(EnvParser.boolean({}, 'B', 'true')).toBe(true);
  });
});
