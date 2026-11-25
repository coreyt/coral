/** Internal JSON-value boundary for the additive structured DSL clauses. */

export function isJsonSafe(value: unknown, ancestors = new Set<object>()): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object') return false;

  if (ancestors.has(value)) return false;
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const keys = Reflect.ownKeys(value);
      if (keys.some((key) => typeof key !== 'string')) return false;
      if (keys.length !== value.length + 1 || !keys.includes('length')) return false;
      const descriptors = Object.getOwnPropertyDescriptors(value);
      for (let index = 0; index < value.length; index++) {
        const descriptor = descriptors[String(index)];
        if (!descriptor?.enumerable || !('value' in descriptor) || !isJsonSafe(descriptor.value, ancestors)) return false;
      }
      return true;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return false;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Reflect.ownKeys(value).some((key) => typeof key !== 'string')) return false;
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (!descriptor.enumerable || !('value' in descriptor) || !isJsonSafe(descriptor.value, ancestors)) return false;
      if (!Object.prototype.propertyIsEnumerable.call(value, key)) return false;
    }
    return true;
  } catch {
    return false;
  } finally {
    ancestors.delete(value);
  }
}

export function stableJson(value: unknown): string {
  if (!isJsonSafe(value)) throw new TypeError('Value is not JSON-safe');
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') return Object.is(value, -0) ? '0' : String(value);
  if (Array.isArray(value)) return `[${Array.from(value, stableJson).join(',')}]`;
  return `{${Object.keys(value as object).sort().map((key) =>
    `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`
  ).join(',')}}`;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
