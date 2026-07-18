import { Injectable, isDevMode, signal, Signal, WritableSignal } from '@angular/core';
import { Observable, Subject } from 'rxjs';

type Fetcher = () => Promise<unknown>;

@Injectable({ providedIn: 'root' })
export class QueryRegistry {
  private readonly triggers = new Map<string, Subject<void>>();
  private readonly fetchers = new Map<string, Set<Fetcher>>();
  private readonly generations = new Map<string, WritableSignal<number>>();

  private getOrCreate(name: string): Subject<void> {
    if (!this.triggers.has(name)) {
      this.triggers.set(name, new Subject<void>());
    }
    return this.triggers.get(name)!;
  }

  private getOrCreateGeneration(name: string): WritableSignal<number> {
    if (!this.generations.has(name)) {
      this.generations.set(name, signal(0));
    }
    return this.generations.get(name)!;
  }

  getTrigger(name: string): Observable<void> {
    return this.getOrCreate(name).asObservable();
  }

  /** Reactive generation counter for `name`, incremented every time `refetch()`/`refetchAndWait()` targets it. */
  getGeneration(name: string): Signal<number> {
    return this.getOrCreateGeneration(name);
  }

  registerFetcher(name: string, fn: Fetcher): void {
    if (!this.fetchers.has(name)) {
      this.fetchers.set(name, new Set());
    }
    this.fetchers.get(name)!.add(fn);
  }

  unregisterFetcher(name: string, fn: Fetcher): void {
    const set = this.fetchers.get(name);
    if (!set) return;
    set.delete(fn);
    if (set.size === 0) {
      this.fetchers.delete(name);
      this.triggers.delete(name);
      this.generations.delete(name);
    }
  }

  refetch(names: string[]): void {
    for (const name of names) {
      if (isDevMode() && !this.fetchers.has(name)) {
        console.warn(
          `[sigql] refetch('${name}') matched no active queries. ` +
            'Check the name for typos, and note that only named operations (not anonymous or ' +
            'string-only queries without an explicit operationName) participate in refetching.',
        );
      }
      this.triggers.get(name)?.next();
      this.generations.get(name)?.update((g) => g + 1);
    }
  }

  async refetchAndWait(names: string[]): Promise<void> {
    // Trigger first: watch()'s subscribers synchronously start their re-fetch off this call,
    // so the fetchers collected below can just await that same in-flight request instead of
    // starting a redundant second one.
    this.refetch(names);

    const all: Promise<unknown>[] = [];
    for (const name of names) {
      this.fetchers.get(name)?.forEach((fn) => all.push(fn()));
    }
    if (all.length) await Promise.all(all);
  }
}
