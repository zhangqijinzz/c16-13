import { describe, expect, it } from 'vitest';
import { archiveSession, cropForRatio, hasImageWork, imageKey, MAX_RECENT_SESSIONS, moveCrop, resizeCrop, takeSession, toSession } from '../domain';
import { DEFAULT_CROP, EMPTY_DOCUMENT, type ImageAsset, type ImageSession } from '../model';

const image = (name: string): ImageAsset => ({ src: `data:image/svg+xml,${name}`, width: 1200, height: 800, name });
const session = (name: string, variants = 0): ImageSession => ({
  image: image(name),
  subject: null,
  crop: { ...DEFAULT_CROP },
  variants: Array.from({ length: variants }, (_, index) => ({ ...DEFAULT_CROP, id: `v-${index}` })),
});

describe('crop domain rules', () => {
  it('fits a 1:1 crop inside a wide image and centers it', () => {
    const crop = cropForRatio('1:1', 1.5, DEFAULT_CROP);
    expect(crop.width).toBeCloseTo(2 / 3);
    expect(crop.height).toBe(1);
    expect(crop.x).toBeCloseTo(1 / 6);
  });

  it('clamps movement to the image boundary', () => {
    const crop = moveCrop({ ...DEFAULT_CROP, width: 0.5, height: 0.5 }, 0.9, -0.9);
    expect(crop.x).toBe(0.5);
    expect(crop.y).toBe(0);
  });

  it('keeps a selected ratio while resizing', () => {
    const crop = resizeCrop({ ...DEFAULT_CROP, ratio: '16:9', width: 0.5, height: 0.28125 }, 0.8, 0.8);
    expect(crop.width).toBe(0.8);
    expect(crop.height).toBeCloseTo(0.45);
  });
});

describe('image session archive rules', () => {
  it('identifies images by name and dimensions', () => {
    expect(imageKey(image('a.jpg'))).toBe(imageKey(image('a.jpg')));
    expect(imageKey(image('a.jpg'))).not.toBe(imageKey(image('b.jpg')));
    expect(imageKey(image('a.jpg'))).not.toBe(imageKey({ ...image('a.jpg'), width: 800 }));
  });

  it('detects image-bound work from variants or subject', () => {
    expect(hasImageWork(structuredClone(EMPTY_DOCUMENT))).toBe(false);
    expect(hasImageWork({ ...structuredClone(EMPTY_DOCUMENT), subject: { x: 0.5, y: 0.5 } })).toBe(true);
    expect(hasImageWork({ ...structuredClone(EMPTY_DOCUMENT), variants: [{ ...DEFAULT_CROP, id: 'v' }] })).toBe(true);
  });

  it('extracts a session only when an image is loaded', () => {
    expect(toSession(structuredClone(EMPTY_DOCUMENT))).toBeNull();
    const document = { ...structuredClone(EMPTY_DOCUMENT), image: image('a.jpg'), subject: { x: 0.2, y: 0.3 } };
    expect(toSession(document)?.image.name).toBe('a.jpg');
    expect(toSession(document)?.subject).toEqual({ x: 0.2, y: 0.3 });
  });

  it('archives newest first, replaces the same image, and caps the list', () => {
    let recent: ImageSession[] = [];
    recent = archiveSession(recent, session('a.jpg', 1));
    recent = archiveSession(recent, session('b.jpg', 2));
    expect(recent.map((item) => item.image.name)).toEqual(['b.jpg', 'a.jpg']);
    recent = archiveSession(recent, session('a.jpg', 3));
    expect(recent.map((item) => item.image.name)).toEqual(['a.jpg', 'b.jpg']);
    expect(recent[0].variants).toHaveLength(3);
    for (const name of ['c.jpg', 'd.jpg', 'e.jpg', 'f.jpg']) recent = archiveSession(recent, session(name));
    expect(recent).toHaveLength(MAX_RECENT_SESSIONS);
    expect(recent.some((item) => item.image.name === 'a.jpg')).toBe(false);
  });

  it('takes a session out of the archive by image', () => {
    const recent = [session('a.jpg', 1), session('b.jpg', 2)];
    const found = takeSession(recent, image('b.jpg'));
    expect(found.session?.variants).toHaveLength(2);
    expect(found.recent.map((item) => item.image.name)).toEqual(['a.jpg']);
    const missing = takeSession(recent, image('zzz.jpg'));
    expect(missing.session).toBeNull();
    expect(missing.recent).toHaveLength(2);
  });
});
