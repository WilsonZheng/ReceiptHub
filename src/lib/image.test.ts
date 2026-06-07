import { describe, expect, it } from 'vitest';
import { fitWithin, pickKind } from './image';

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
