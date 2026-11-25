import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useT } from '../../lib/i18n';

const ZOOM = 2.5;

/**
 * 全屏看照片：点一下照片放大到 2.5 倍（以点的位置为中心，可拖动查看小字），再点一下缩回；
 * 点照片以外的地方或右上角的 ✕ 关闭。以前只能缩放到屏幕大小，长小票上的字看不清。
 */
export function PhotoViewer({ url, onClose }: { url: string; onClose: () => void }) {
  const [zoomed, setZoomed] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const t = useT();

  function toggleZoom(e: React.MouseEvent<HTMLImageElement>) {
    e.stopPropagation();
    if (zoomed) return setZoomed(false);
    // 点在照片的什么位置（0–1），放大后把这一点滚到屏幕中间
    const box = e.currentTarget.getBoundingClientRect();
    const fx = (e.clientX - box.left) / box.width;
    const fy = (e.clientY - box.top) / box.height;
    setZoomed(true);
    requestAnimationFrame(() => {
      const el = scroller.current;
      const img = el?.querySelector('img');
      if (!el || !img) return;
      el.scrollTo({
        left: img.offsetLeft + img.offsetWidth * fx - el.clientWidth / 2,
        top: img.offsetTop + img.offsetHeight * fy - el.clientHeight / 2,
      });
    });
  }

  // 挂到 body：留在页面里会被顶部导航压住（✕ 点不到），也盖不满整屏
  return createPortal(
    <div
      className="photo-viewer fade-in fixed inset-0 z-50"
      style={{ background: 'rgba(0,0,0,.92)' }}
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      // 别让外层的下拉刷新、左滑返回跟着响应
      onTouchStart={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
    >
      <div
        ref={scroller}
        className={`h-full w-full overscroll-contain ${zoomed ? 'overflow-auto' : 'flex items-center justify-center overflow-hidden p-4'}`}
      >
        <img
          src={url}
          onClick={toggleZoom}
          className={
            zoomed ? 'block max-w-none' : 'zoom-in max-h-full max-w-full rounded-lg object-contain'
          }
          style={zoomed ? { width: `${ZOOM * 100}%`, cursor: 'zoom-out' } : { cursor: 'zoom-in' }}
          alt=""
        />
      </div>
      <button
        onClick={onClose}
        aria-label={t('dismiss')}
        className="absolute right-3 flex h-11 w-11 items-center justify-center rounded-full"
        style={{
          top: 'max(env(safe-area-inset-top), 0.75rem)',
          background: 'rgba(0,0,0,.62)',
          color: '#fff',
          border: '1px solid rgba(255,255,255,.25)',
        }}
      >
        <X className="icon-lg" aria-hidden="true" />
      </button>
      <p
        className="pointer-events-none absolute inset-x-0 bottom-0 pb-[max(env(safe-area-inset-bottom),0.75rem)] text-center text-xs"
        style={{ color: 'rgba(255,255,255,.7)', textShadow: '0 1px 2px rgba(0,0,0,.8)' }}
      >
        {t(zoomed ? 'tapToZoomOut' : 'tapToZoom')}
      </p>
    </div>,
    document.body,
  );
}
