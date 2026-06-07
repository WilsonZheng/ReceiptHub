import { useEffect, useState } from 'react';
import { liveQuery } from 'dexie';
import { db } from '../data/db';
import { getPat, DATA_REPO } from '../lib/settings';
import { AuthError, GithubClient } from './github';
import { flushOutbox, pullAll } from './engine';

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error';

let authErrorHandler: (() => void) | null = null;
export const onAuthError = (fn: () => void): void => {
  authErrorHandler = fn;
};

const state = { status: 'idle' as SyncStatus, listeners: new Set<() => void>() };
const setStatus = (s: SyncStatus): void => {
  state.status = s;
  state.listeners.forEach((l) => l());
};

let inFlight = false;

export async function syncNow(): Promise<void> {
  const pat = getPat();
  if (!pat || inFlight) return;
  if (!navigator.onLine) {
    setStatus('offline');
    return;
  }
  inFlight = true;
  setStatus('syncing');
  try {
    const client = new GithubClient(pat, DATA_REPO);
    await flushOutbox(client);
    await pullAll(client);
    setStatus('idle');
  } catch (e) {
    setStatus('error');
    if (e instanceof AuthError) authErrorHandler?.();
  } finally {
    inFlight = false;
  }
}

export function useSyncStatus(): { status: SyncStatus; pending: number } {
  const [status, setLocal] = useState(state.status);
  const [pending, setPending] = useState(0);
  useEffect(() => {
    const listener = () => setLocal(state.status);
    state.listeners.add(listener);
    const sub = liveQuery(() => db.outbox.count()).subscribe({ next: setPending });
    const onlineHandler = () => void syncNow();
    window.addEventListener('online', onlineHandler);
    const interval = setInterval(() => void syncNow(), 60_000);
    void syncNow();
    return () => {
      state.listeners.delete(listener);
      sub.unsubscribe();
      window.removeEventListener('online', onlineHandler);
      clearInterval(interval);
    };
  }, []);
  return { status, pending };
}
