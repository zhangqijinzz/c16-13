import type { CropVariant, FrameDocument, FrameSnapshot, ImageAsset, ImageSession, Ratio } from './model';

/** 最近图片归档上限，避免本地存储无限增长。 */
export const MAX_RECENT_SESSIONS = 4;

const clamp = (value: number, min = 0, max = 1): number => Math.min(max, Math.max(min, value));

export function normalizeCrop(crop: CropVariant): CropVariant {
  const width = clamp(crop.width, 0.12, 1);
  const height = clamp(crop.height, 0.12, 1);
  return {
    ...crop,
    x: clamp(crop.x, 0, 1 - width),
    y: clamp(crop.y, 0, 1 - height),
    width,
    height,
  };
}

export function cropForRatio(ratio: Ratio, imageRatio: number, current: CropVariant): CropVariant {
  if (ratio === 'free') return { ...current, ratio };
  const [w, h] = ratio.split(':').map(Number);
  const target = w / h;
  let width = 1;
  let height = 1;
  if (target > imageRatio) height = Math.min(1, imageRatio / target);
  else width = Math.min(1, target / imageRatio);
  return normalizeCrop({
    ...current,
    ratio,
    width,
    height,
    x: (1 - width) / 2,
    y: (1 - height) / 2,
  });
}

export function moveCrop(crop: CropVariant, dx: number, dy: number): CropVariant {
  return normalizeCrop({ ...crop, x: crop.x + dx, y: crop.y + dy });
}

export function resizeCrop(crop: CropVariant, width: number, height: number): CropVariant {
  const nextWidth = width;
  let nextHeight = height;
  if (crop.ratio !== 'free') {
    const [w, h] = crop.ratio.split(':').map(Number);
    nextHeight = nextWidth / (w / h);
  }
  return normalizeCrop({ ...crop, width: nextWidth, height: nextHeight });
}

export function makeVariant(crop: CropVariant, id: string): CropVariant {
  return { ...normalizeCrop(crop), id };
}

export function isFrameDocument(value: unknown): value is FrameDocument {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<FrameDocument>;
  return candidate.version === 1 && typeof candidate.guides === 'object' && candidate.crop !== undefined && Array.isArray(candidate.variants);
}

/** 图片的稳定标识：同名同尺寸视为同一张图，用于归档去重和找回。 */
export function imageKey(image: ImageAsset): string {
  return `${image.name}@${image.width}x${image.height}`;
}

/** 当前图片上是否存在换图后会受影响的成果（方案或主体标记）。 */
export function hasImageWork(document: FrameDocument): boolean {
  return document.variants.length > 0 || document.subject !== null;
}

/** 把当前文档中绑定图片的部分抽成可归档的会话；没有图片时返回 null。 */
export function toSession(document: FrameDocument): ImageSession | null {
  if (!document.image) return null;
  return { image: document.image, subject: document.subject, crop: document.crop, variants: document.variants };
}

/** 会话入档：同图覆盖旧档、最新的排最前、超出上限丢弃最久未用的。 */
export function archiveSession(recent: ImageSession[], session: ImageSession): ImageSession[] {
  const key = imageKey(session.image);
  return [session, ...recent.filter((item) => imageKey(item.image) !== key)].slice(0, MAX_RECENT_SESSIONS);
}

/** 按图取回归档会话；取回的会话会从列表中移除（它将成为当前文档）。 */
export function takeSession(recent: ImageSession[], image: ImageAsset): { session: ImageSession | null; recent: ImageSession[] } {
  const key = imageKey(image);
  const session = recent.find((item) => imageKey(item.image) === key) ?? null;
  return { session, recent: recent.filter((item) => imageKey(item.image) !== key) };
}

function isImageAsset(value: unknown): value is ImageAsset {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ImageAsset>;
  return typeof candidate.src === 'string' && typeof candidate.width === 'number' && typeof candidate.height === 'number' && typeof candidate.name === 'string';
}

export function isImageSession(value: unknown): value is ImageSession {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ImageSession>;
  return isImageAsset(candidate.image) && candidate.crop !== undefined && Array.isArray(candidate.variants);
}

export function isFrameSnapshot(value: unknown): value is FrameSnapshot {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<FrameSnapshot>;
  return candidate.version === 1 && isFrameDocument(candidate.document) && Array.isArray(candidate.recent) && candidate.recent.every(isImageSession);
}
