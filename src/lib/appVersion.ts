// 当前运行版本：构建日期（本地时区）+ 提交短哈希，例如 "2026.10.07 · 7bcc7a9"
const pad = (n: number) => String(n).padStart(2, '0');

export const APP_COMMIT = __APP_COMMIT__;
export const APP_BUILT_AT = __APP_BUILT_AT__;

export function versionLabel(builtAtIso = APP_BUILT_AT, commit = APP_COMMIT): string {
  const d = new Date(builtAtIso);
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} · ${commit}`;
}

const SEEN_KEY = 'rh.version';
/** 启动时调用：如果上次运行的是别的版本，返回 true（用于"已更新"提示），并记下当前版本 */
export function consumeJustUpdated(): boolean {
  try {
    const prev = localStorage.getItem(SEEN_KEY);
    localStorage.setItem(SEEN_KEY, APP_COMMIT);
    return prev !== null && prev !== APP_COMMIT;
  } catch {
    return false;
  }
}
