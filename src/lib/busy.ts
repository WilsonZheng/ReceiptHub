// "正在编辑"计数：有未保存的输入时（例如详情页编辑中），不自动套用新版本，避免刷新丢内容
let holds = 0;
export function holdBusy(): () => void {
  holds++;
  let released = false;
  return () => {
    if (!released) holds--;
    released = true;
  };
}
export const isBusy = () => holds > 0;

/**
 * 打开相机/文件选择器期间也算"忙"：iOS 弹出选择器时页面会变成 hidden，
 * 这时候套用新版本会刷新页面，刚选的照片就丢了。选完（onChange）或回到页面后释放；取消选择时靠 focus 兜底
 */
export function holdBusyWhilePicking(): () => void {
  const release = holdBusy();
  const onFocus = () => setTimeout(done, 1500);
  const timer = setTimeout(done, 180_000);
  function done() {
    window.removeEventListener('focus', onFocus);
    clearTimeout(timer);
    release();
  }
  window.addEventListener('focus', onFocus);
  return done;
}
