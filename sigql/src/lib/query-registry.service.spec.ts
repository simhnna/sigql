import { describe, it, expect, vi } from 'vitest';
import { Observable } from 'rxjs';
import { QueryRegistry } from './query-registry.service';

// QueryRegistry has no constructor dependencies, so we can instantiate directly
// to avoid zone-related issues in Angular TestBed for pure RxJS tests.
function createRegistry() {
  return new QueryRegistry();
}

describe('QueryRegistry', () => {
  describe('getTrigger', () => {
    it('returns an observable that can be subscribed to', () => {
      const registry = createRegistry();
      const trigger$ = registry.getTrigger('MyQuery');
      expect(trigger$).toBeInstanceOf(Observable);
    });

    it('the same trigger fires for multiple subscribers', () => {
      const registry = createRegistry();
      let countA = 0;
      let countB = 0;
      registry.getTrigger('MyQuery').subscribe(() => countA++);
      registry.getTrigger('MyQuery').subscribe(() => countB++);
      registry.refetch(['MyQuery']);
      expect(countA).toBe(1);
      expect(countB).toBe(1);
    });
  });

  describe('registerFetcher / unregisterFetcher', () => {
    it('registered fetcher is called by refetchAndWait', async () => {
      const registry = createRegistry();
      const fetcher = vi.fn(() => Promise.resolve('result'));
      registry.registerFetcher('MyQuery', fetcher);
      await registry.refetchAndWait(['MyQuery']);
      expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it('unregistered fetcher is no longer called', async () => {
      const registry = createRegistry();
      const fetcher = vi.fn(() => Promise.resolve('result'));
      registry.registerFetcher('MyQuery', fetcher);
      registry.unregisterFetcher('MyQuery', fetcher);
      await registry.refetchAndWait(['MyQuery']);
      expect(fetcher).not.toHaveBeenCalled();
    });
  });

  describe('refetch', () => {
    it('emits on the trigger for registered names', () => {
      const registry = createRegistry();
      let count = 0;
      registry.getTrigger('MyQuery').subscribe(() => count++);
      registry.refetch(['MyQuery']);
      expect(count).toBe(1);
    });

    it('does nothing for unknown names', () => {
      const registry = createRegistry();
      expect(() => registry.refetch(['UnknownQuery'])).not.toThrow();
    });

    it('warns in dev mode when a name has no registered consumers', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const registry = createRegistry();
        registry.refetch(['UnknownQuery']);
        expect(warn).toHaveBeenCalledOnce();
        expect(warn.mock.calls[0][0]).toContain("refetch('UnknownQuery')");
      } finally {
        warn.mockRestore();
      }
    });

    it('does not warn when a fetcher is registered for the name', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const registry = createRegistry();
        registry.registerFetcher('MyQuery', () => Promise.resolve());
        registry.refetch(['MyQuery']);
        expect(warn).not.toHaveBeenCalled();
      } finally {
        warn.mockRestore();
      }
    });

    it('emits on multiple triggers at once', () => {
      const registry = createRegistry();
      let aCount = 0;
      let bCount = 0;
      registry.getTrigger('QueryA').subscribe(() => aCount++);
      registry.getTrigger('QueryB').subscribe(() => bCount++);
      registry.refetch(['QueryA', 'QueryB']);
      expect(aCount).toBe(1);
      expect(bCount).toBe(1);
    });
  });

  describe('refetchAndWait', () => {
    it('calls all registered fetchers', async () => {
      const registry = createRegistry();
      const fetcher1 = vi.fn(() => Promise.resolve('a'));
      const fetcher2 = vi.fn(() => Promise.resolve('b'));
      registry.registerFetcher('MyQuery', fetcher1);
      registry.registerFetcher('MyQuery', fetcher2);

      await expect(registry.refetchAndWait(['MyQuery'])).resolves.toBeUndefined();

      expect(fetcher1).toHaveBeenCalledTimes(1);
      expect(fetcher2).toHaveBeenCalledTimes(1);
    });

    it('completes immediately when no fetchers are registered', async () => {
      const registry = createRegistry();
      await expect(registry.refetchAndWait(['UnknownQuery'])).resolves.toBeUndefined();
    });

    it('also fires the trigger so active watchers re-fetch', async () => {
      const registry = createRegistry();
      let count = 0;
      registry.getTrigger('MyQuery').subscribe(() => count++);
      registry.registerFetcher('MyQuery', () => Promise.resolve('x'));
      await registry.refetchAndWait(['MyQuery']);
      expect(count).toBe(1);
    });
  });

  describe('getGeneration', () => {
    it('starts at 0', () => {
      const registry = createRegistry();
      expect(registry.getGeneration('MyQuery')()).toBe(0);
    });

    it('increments by 1 each time refetch() targets the name', () => {
      const registry = createRegistry();
      const generation = registry.getGeneration('MyQuery');
      registry.refetch(['MyQuery']);
      expect(generation()).toBe(1);
      registry.refetch(['MyQuery']);
      expect(generation()).toBe(2);
    });

    it('is independent per name', () => {
      const registry = createRegistry();
      const a = registry.getGeneration('QueryA');
      const b = registry.getGeneration('QueryB');
      registry.refetch(['QueryA']);
      expect(a()).toBe(1);
      expect(b()).toBe(0);
    });

    it('is unaffected by refetching unrelated names', () => {
      const registry = createRegistry();
      const generation = registry.getGeneration('MyQuery');
      registry.refetch(['UnknownQuery']);
      expect(generation()).toBe(0);
    });
  });
});
