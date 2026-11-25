import { describe, expect, it } from 'vitest';
import { parseStrictJson } from '../src/json.js';

describe('strict JSON helper', () => {
  it('matches JSON.parse for valid input without duplicates', () => {
    const raw = '{"a":1,"b":[true,null,"x\\n",-1.5e3],"c":{"d":{}}}';
    const result = parseStrictJson(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual(JSON.parse(raw));
    expect(result.duplicates).toEqual([]);
    expect(result.keys.map(({ path }) => path)).toEqual(['a', 'b', 'c', 'c.d']);
  });

  it('rejects invalid JSON exactly as JSON.parse does', () => {
    expect(parseStrictJson('{"a":1,}')).toEqual({ ok: false, reason: 'syntax' });
    expect(parseStrictJson('{a:1}')).toEqual({ ok: false, reason: 'syntax' });
  });

  it('reports escaped-equal keys with raw ranges and keeps the first value', () => {
    const raw = '{"a":1,"\\u0061":2}';
    const result = parseStrictJson(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({ a: 1 });
    expect(result.duplicates).toEqual([[
      { key: 'a', path: 'a', segments: ['a'], start: 1, end: 4 },
      { key: 'a', path: 'a', segments: ['a'], start: 7, end: 15 },
    ]]);
    expect(raw.slice(7, 15)).toBe('"\\u0061"');
  });

  it('stores __proto__ as an own property and reports a repeated __proto__', () => {
    const single = parseStrictJson('{"__proto__":{"x":1}}');
    expect(single.ok).toBe(true);
    if (!single.ok) return;
    const value = single.value as Record<string, unknown>;
    expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
    expect(Object.prototype.hasOwnProperty.call(value, '__proto__')).toBe(true);
    expect(value).toEqual(JSON.parse('{"__proto__":{"x":1}}'));

    const repeated = parseStrictJson('{"__proto__":1,"__proto__":2}');
    expect(repeated.ok && repeated.duplicates.map((group) => group.map(({ key }) => key))).toEqual([['__proto__', '__proto__']]);
    expect(repeated.ok && Object.getOwnPropertyDescriptor(repeated.value, '__proto__')?.value).toBe(1);
  });

  it('writes array paths with brackets', () => {
    const result = parseStrictJson('{"ports":[{"id":"p","properties":{"k":1,"k":2}}]}');
    expect(result.ok && result.duplicates[0].map(({ path }) => path)).toEqual([
      'ports[0].properties.k', 'ports[0].properties.k',
    ]);
  });

  it('keeps dotted keys distinct from nested object paths', () => {
    const result = parseStrictJson('{"a":{"b":1},"a.b":{"x":2}}');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.keys.map(({ path, segments }) => ({ path, segments }))).toEqual([
      { path: 'a', segments: ['a'] },
      { path: 'a.b', segments: ['a', 'b'] },
      { path: 'a.b', segments: ['a.b'] },
      { path: 'a.b.x', segments: ['a.b', 'x'] },
    ]);
  });

  it('returns depth for deep nesting without throwing', () => {
    const raw = '['.repeat(10_000) + ']'.repeat(10_000);
    expect(parseStrictJson(raw)).toEqual({ ok: false, reason: 'depth' });
  });

  it('computes key offsets after escaped and non-BMP strings', () => {
    const raw = '{"s":"\\"😀\\\\","k":1,"k":2}';
    const result = parseStrictJson(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [first, second] = result.duplicates[0];
    expect(raw.slice(first.start, first.end)).toBe('"k"');
    expect(raw.slice(second.start, second.end)).toBe('"k"');
    expect(first.start).toBeLessThan(second.start);
  });

  it('reports three occurrences in one group', () => {
    const result = parseStrictJson('{"a":1,"a":2,"a":3}');
    expect(result.ok && result.duplicates.map((group) => group.length)).toEqual([3]);
  });
});
