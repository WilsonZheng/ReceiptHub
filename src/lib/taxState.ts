// 税务页的本机状态：你的情况（档案）、已完成的待办、已核对的票据提醒。
// 带订阅：在税务页标记完成后，导航角标和顶部横幅立刻更新。
import { useSyncExternalStore } from 'react';
import { getGstFrequency, setGstFrequency } from './settings';
import type { TaxProfile } from './taxCalendar';

const PROFILE_KEY = 'rh.tax.profile';
const DONE_KEY = 'rh.tax.done';
const ACK_KEY = 'rh.tax.ack';

type StoredProfile = Omit<TaxProfile, 'gstFreq'>;
const DEFAULT_PROFILE: StoredProfile = {
  hasAgent: false,
  provisional: 'unsure',
  payeEmployer: false,
  annualReturnMonth: null,
};

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}
function readSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 存储不可用时只在本次会话生效 */
  }
}

let version = 0;
const listeners = new Set<() => void>();
function emit() {
  version++;
  listeners.forEach((fn) => fn());
}
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
/** 任何税务状态变化都会让使用者重新渲染 */
export const useTaxStateVersion = () => useSyncExternalStore(subscribe, () => version);

export function getTaxProfile(): TaxProfile {
  return { ...read(PROFILE_KEY, DEFAULT_PROFILE), gstFreq: getGstFrequency() };
}
export function updateTaxProfile(patch: Partial<TaxProfile>) {
  const { gstFreq, ...rest } = patch;
  if (gstFreq) setGstFrequency(gstFreq);
  if (Object.keys(rest).length)
    write(PROFILE_KEY, { ...read(PROFILE_KEY, DEFAULT_PROFILE), ...rest });
  emit();
}

export const getDoneTasks = () => readSet(DONE_KEY);
export function setTaskDone(id: string, done: boolean) {
  const s = readSet(DONE_KEY);
  if (done) s.add(id);
  else s.delete(id);
  write(DONE_KEY, [...s]);
  emit();
}

export const getAckedChecks = () => readSet(ACK_KEY);
export function ackCheck(id: string) {
  const s = readSet(ACK_KEY);
  s.add(id);
  write(ACK_KEY, [...s]);
  emit();
}
