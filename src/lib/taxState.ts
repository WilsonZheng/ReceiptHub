// 税务页的本机状态：你的情况（档案）、已完成的待办、已核对的票据提醒。
// 带订阅：在税务页标记完成后，导航角标和顶部横幅立刻更新。
import { useSyncExternalStore } from 'react';
import { getGstFrequency, setGstFrequency } from './settings';
import type { TaxProfile } from './taxCalendar';
import { periodAt, type Period } from './periods';

const PROFILE_KEY = 'rh.tax.profile';
const DONE_KEY = 'rh.tax.done';
const ACK_KEY = 'rh.tax.ack';
const SINCE_KEY = 'rh.tax.since'; // 本机第一次算税务待办的日期：逾期事项往回显示到这天之前 60 天

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

/** 第一次调用时记下今天；之后一直返回那一天 */
export function getTaxSince(today: string): string {
  try {
    const saved = localStorage.getItem(SINCE_KEY);
    if (saved && /^\d{4}-\d{2}-\d{2}$/.test(saved)) return saved;
    localStorage.setItem(SINCE_KEY, today);
  } catch {
    /* 存储不可用：按今天算，等于旧行为（往回 60 天） */
  }
  return today;
}

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

/** 日期所在的 GST 期在税务页标了「已完成」（已经申报）时返回那一期，否则 null */
export function filedGstPeriodOf(dateIso: string): Period | null {
  const per = periodAt(dateIso, 'gst', getGstFrequency());
  return getDoneTasks().has(`gst:${per.endYm}`) ? per : null;
}

/**
 * 这一期之后第一个还没申报的 GST 期。已报期里补出来的开支记到这一期的第一天、原始日期写进备注
 * ——和会计代记开支的做法一致：IRD 允许在之后的申报里补抵扣漏掉的进项。
 */
export function nextOpenGstPeriod(dateIso: string): Period {
  const freq = getGstFrequency();
  const done = getDoneTasks();
  for (let k = 1; k < 48; k++) {
    const per = periodAt(dateIso, 'gst', freq, k);
    if (!done.has(`gst:${per.endYm}`)) return per;
  }
  return periodAt(dateIso, 'gst', freq, 1);
}
