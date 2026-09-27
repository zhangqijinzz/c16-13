import type { CropVariant, FrameDocument, ImageAsset, ImageWork, Ratio, WorkStash } from './model';
import { DEFAULT_CROP } from './model';

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

/** 单张图片的稳定身份：同名同尺寸且源长度一致的图片视为同一张。 */
export function imageKey(image: ImageAsset): string {
  return `${image.name}::${image.width}x${image.height}::${image.src.length}`;
}

export function isDefaultCrop(crop: CropVariant): boolean {
  return crop.x === DEFAULT_CROP.x && crop.y === DEFAULT_CROP.y && crop.width === DEFAULT_CROP.width && crop.height === DEFAULT_CROP.height && crop.ratio === DEFAULT_CROP.ratio;
}

/** 当前图片上是否存在换图时需要交代的成果（方案、主体标记或调整过的画框）。 */
export function hasImageWork(document: FrameDocument): boolean {
  return document.variants.length > 0 || document.subject !== null || !isDefaultCrop(document.crop);
}

export const MAX_REMEMBERED_IMAGES = 12;

/** 把当前图片的工作成果存入存档，超出上限时丢弃最久未动的条目。 */
export function rememberWork(stash: WorkStash, image: ImageAsset, work: ImageWork): WorkStash {
  const entries: Record<string, ImageWork> = { ...stash.entries, [imageKey(image)]: work };
  const keys = Object.keys(entries);
  if (keys.length > MAX_REMEMBERED_IMAGES) {
    keys.sort((a, b) => entries[a].updatedAt - entries[b].updatedAt);
    keys.slice(0, keys.length - MAX_REMEMBERED_IMAGES).forEach((key) => delete entries[key]);
  }
  return { version: 1, entries };
}

/** 取出某张图片存档的工作成果（取出后即归当前文档所有，存档中移除）。 */
export function takeWork(stash: WorkStash, image: ImageAsset): { stash: WorkStash; work: ImageWork | null } {
  const key = imageKey(image);
  const work = stash.entries[key];
  if (!work) return { stash, work: null };
  const entries = { ...stash.entries };
  delete entries[key];
  return { stash: { version: 1, entries }, work };
}

export function isWorkStash(value: unknown): value is WorkStash {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<WorkStash>;
  return candidate.version === 1 && typeof candidate.entries === 'object' && candidate.entries !== null;
}
