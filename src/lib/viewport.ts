// iOS standalone PWA 启动时 100dvh 经常用过期视口值计算（要等一次交互才重算），
// 导致底部导航悬空。window.innerHeight 首帧就是准确的——用它写死像素值。
// 刻意不监听 visualViewport.resize：iOS 键盘弹出会改 visualViewport 但不改 innerHeight，
// 用 innerHeight 可避免键盘弹出时整个布局跟着抖。
export function initViewportHeight(): void {
  if (typeof window === 'undefined') return;
  const set = () =>
    document.documentElement.style.setProperty('--app-h', `${window.innerHeight}px`);
  set();
  window.addEventListener('resize', set);
  window.addEventListener('orientationchange', set);
}
