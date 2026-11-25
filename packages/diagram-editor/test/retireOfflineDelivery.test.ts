import { describe, expect, it, vi } from 'vitest';
import { retireOfflineDelivery } from '../src/retireOfflineDelivery';

describe('retireOfflineDelivery', () => {
  it('unregisters only the same-origin Coral scope and deletes only Coral shell caches', async () => {
    const coral = { scope: 'https://example.test/coral/', unregister: vi.fn().mockResolvedValue(true) };
    const peer = { scope: 'https://example.test/peer/', unregister: vi.fn().mockResolvedValue(true) };
    const foreign = { scope: 'https://other.test/coral/', unregister: vi.fn().mockResolvedValue(true) };
    const remove = vi.fn().mockResolvedValue(true);
    await retireOfflineDelivery({
      origin: 'https://example.test',
      registrations: async () => [coral, peer, foreign],
      cacheNames: async () => ['coral-shell-0.2.5-a', 'transformers-cache', 'other'],
      deleteCache: remove,
    });
    expect(coral.unregister).toHaveBeenCalledOnce();
    expect(peer.unregister).not.toHaveBeenCalled();
    expect(foreign.unregister).not.toHaveBeenCalled();
    expect(remove).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledWith('coral-shell-0.2.5-a');
  });

  it('is best-effort when APIs or individual operations fail', async () => {
    await expect(retireOfflineDelivery()).resolves.toBeUndefined();
    await expect(retireOfflineDelivery({
      origin: 'https://example.test',
      registrations: async () => [{
        scope: 'https://example.test/coral/',
        unregister: vi.fn().mockRejectedValue(new Error('denied')),
      }],
      cacheNames: async () => ['coral-shell-old'],
      deleteCache: vi.fn().mockRejectedValue(new Error('denied')),
    })).resolves.toBeUndefined();
  });
});
