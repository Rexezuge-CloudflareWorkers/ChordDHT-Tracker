import { describe, expect, it, vi } from 'vitest';
import { FixedClock, SystemClock } from '@chord-dht-tracker/shared/utils';
import { CryptoIdGenerator, FixedIdGenerator } from '@chord-dht-tracker/shared/utils';
import { Cursor } from '@chord-dht-tracker/shared/utils';
import { ConsoleLogger, NullLogger } from '@chord-dht-tracker/shared/utils';
import { err, getOrThrow, isOk, mapResult, ok } from '@chord-dht-tracker/shared/utils';
import { TimestampUtil } from '@chord-dht-tracker/shared/utils';
import { CryptoUtil } from '@chord-dht-tracker/shared/utils';

describe('Result', () => {
  it('ok/isOk/mapResult/getOrThrow round-trip success', () => {
    const result = ok(21);
    expect(isOk(result)).toBe(true);
    expect(mapResult(result, (value) => value * 2)).toEqual(ok(42));
    expect(getOrThrow(mapResult(result, (value) => value * 2))).toBe(42);
  });

  it('err/isOk/getOrThrow surface failure', () => {
    const failure = new Error('boom');
    const result = err(failure);
    expect(isOk(result)).toBe(false);
    expect(mapResult(result, (value: never) => value)).toBe(result);
    expect(() => getOrThrow(result)).toThrow('boom');
  });
});

describe('Cursor', () => {
  it('encodes and decodes a payload', () => {
    const cursor = Cursor.encode({ offset: 200, region: 'iad' });
    expect(Cursor.decode<{ offset: number; region: string }>(cursor)).toEqual({ offset: 200, region: 'iad' });
  });

  it('decodes missing cursors to undefined', () => {
    expect(Cursor.decode(undefined)).toBeUndefined();
    expect(Cursor.decode(null)).toBeUndefined();
    expect(Cursor.decode('')).toBeUndefined();
  });

  it('decodes malformed cursors to undefined', () => {
    expect(Cursor.decode('!!!not-base64!!!')).toBeUndefined();
  });

  it('pages with and without a next cursor', () => {
    expect(Cursor.page([1, 2])).toEqual({ items: [1, 2] });
    expect(Cursor.page([1, 2], 'abc')).toEqual({ items: [1, 2], nextCursor: 'abc' });
  });
});

describe('SystemClock/FixedClock', () => {
  it('SystemClock returns Date.now()', () => {
    expect(new SystemClock().nowMs()).toBe(Date.now());
  });

  it('FixedClock is settable and advanceable', () => {
    const clock = new FixedClock(1000);
    expect(clock.nowMs()).toBe(1000);
    clock.setNowMs(2500);
    expect(clock.nowMs()).toBe(2500);
    clock.advanceByMs(500);
    expect(clock.nowMs()).toBe(3000);
  });

  it('FixedClock defaults to zero', () => {
    expect(new FixedClock().nowMs()).toBe(0);
  });
});

describe('IdGenerator', () => {
  it('CryptoIdGenerator returns a UUID', () => {
    expect(new CryptoIdGenerator().randomUUID()).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('FixedIdGenerator replays queued ids then synthesizes', () => {
    const generator = new FixedIdGenerator(['a', '', 'b']);
    expect(generator.randomUUID()).toBe('a');
    expect(generator.randomUUID()).toBe('b');
    expect(generator.randomUUID()).toBe('fixed-uuid-1');
    generator.queueId('c');
    expect(generator.randomUUID()).toBe('c');
    expect(generator.randomUUID()).toBe('fixed-uuid-2');
  });

  it('FixedIdGenerator accepts a single id string', () => {
    const generator = new FixedIdGenerator('only');
    expect(generator.randomUUID()).toBe('only');
    expect(generator.randomUUID()).toBe('fixed-uuid-1');
  });
});

describe('Logger', () => {
  it('ConsoleLogger forwards with and without a prefix', () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const prefixed = new ConsoleLogger('[tracker]');
      prefixed.debug('a');
      prefixed.info('b');
      prefixed.warn('c');
      prefixed.error('d');
      expect(debug).toHaveBeenCalledWith('[tracker]', 'a');
      const plain = new ConsoleLogger();
      plain.debug('x');
      plain.info('y');
      plain.warn('z');
      plain.error('w');
      expect(info).toHaveBeenCalledWith('y');
      expect(warn).toHaveBeenCalledWith('z');
      expect(error).toHaveBeenCalledWith('w');
    } finally {
      debug.mockRestore();
      info.mockRestore();
      warn.mockRestore();
      error.mockRestore();
    }
  });

  it('NullLogger discards everything', () => {
    const logger = new NullLogger();
    expect(() => {
      logger.debug('a');
      logger.info('b');
      logger.warn('c');
      logger.error('d');
    }).not.toThrow();
  });
});

describe('TimestampUtil', () => {
  it('reads the current time in ms and seconds', () => {
    const before = Date.now();
    expect(TimestampUtil.getCurrentUnixTimestampInMilliseconds()).toBeGreaterThanOrEqual(before);
    expect(TimestampUtil.getCurrentUnixTimestampInSeconds()).toBe(Math.floor(Date.now() / 1000));
  });

  it('adds and subtracts time', () => {
    expect(TimestampUtil.addMinutes(1000, 2)).toBe(1000 + 120);
    expect(TimestampUtil.addHours(1000, 2)).toBe(1000 + 7200);
    expect(TimestampUtil.addDays(1000, 2)).toBe(1000 + 172_800);
    expect(TimestampUtil.subtractMinutes(1000, 2)).toBe(1000 - 120);
    expect(TimestampUtil.subtractDays(1000, 2)).toBe(1000 - 172_800);
  });

  it('converts ISO strings to unix seconds', () => {
    expect(TimestampUtil.convertIsoToUnixTimestampInSeconds('2026-09-14T12:00:00.000Z')).toBe(
      Math.floor(new Date('2026-09-14T12:00:00.000Z').getTime() / 1000),
    );
  });
});

describe('CryptoUtil', () => {
  it('hashes SHA-1/SHA-256 deterministically', async () => {
    expect(await CryptoUtil.sha1Hex('abc')).toBe('a9993e364706816aba3e25717850c26c9cd0d89d');
    const sha256 = await CryptoUtil.sha256Hex('abc');
    expect(sha256).toHaveLength(64);
    expect(sha256).toBe(await CryptoUtil.sha256Hex('abc'));
  });

  it('signs HMAC-SHA256 verifiably', async () => {
    const mac = await CryptoUtil.hmacSha256Hex('message', 'secret');
    expect(mac).toHaveLength(64);
    expect(mac).toBe(await CryptoUtil.hmacSha256Hex('message', 'secret'));
  });

  it('encodes base64url without padding or unsafe chars', () => {
    expect(CryptoUtil.toBase64Url(new Uint8Array([251, 255, 190]))).not.toMatch(/[+/=]/);
    expect(CryptoUtil.toBase64Url(new Uint8Array([104, 105]))).toBe('aGk');
  });

  it('generates random url-safe keys', () => {
    const key = CryptoUtil.randomBase64Url(32);
    expect(key).not.toMatch(/[+/=]/);
    expect(key.length).toBeGreaterThan(0);
  });
});
