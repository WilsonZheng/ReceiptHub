import { describe, expect, it } from 'vitest';
import { cropRectFromDisplay, fitWithin, pickKind } from './image';

describe('fitWithin', () => {
  it('scales down long edge to max', () =>
    expect(fitWithin(4000, 3000, 1600)).toEqual({ w: 1600, h: 1200 }));
  it('portrait', () => expect(fitWithin(3000, 4000, 1600)).toEqual({ w: 1200, h: 1600 }));
  it('never upscales', () => expect(fitWithin(800, 600, 1600)).toEqual({ w: 800, h: 600 }));
});

describe('pickKind', () => {
  it('pdf passthrough', () => expect(pickKind('application/pdf')).toBe('pdf'));
  it('images default webp', () => expect(pickKind('image/heic')).toBe('webp'));
});

describe('cropRectFromDisplay', () => {
  it('maps the visible crop frame back to source image pixels', () => {
    expect(
      cropRectFromDisplay({
        sourceW: 1600,
        sourceH: 1200,
        imageRect: { x: 50, y: 20, w: 800, h: 600 },
        cropRect: { x: 250, y: 170, w: 400, h: 300 },
      }),
    ).toEqual({ x: 400, y: 300, w: 800, h: 600 });
  });

  it('clips crop frames that extend beyond the displayed image', () => {
    expect(
      cropRectFromDisplay({
        sourceW: 1000,
        sourceH: 500,
        imageRect: { x: 100, y: 100, w: 500, h: 250 },
        cropRect: { x: 50, y: 150, w: 300, h: 200 },
      }),
    ).toEqual({ x: 0, y: 100, w: 500, h: 400 });
  });
});
