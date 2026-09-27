export type GuideKey = 'thirds' | 'center' | 'diagonal' | 'golden';
export type Phase = 'loading' | 'ready' | 'editing' | 'error';
export type Ratio = 'free' | '1:1' | '4:5' | '16:9';

export interface ImageAsset {
  src: string;
  width: number;
  height: number;
  name: string;
}

export interface CropVariant {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  ratio: string;
}

export interface FrameDocument {
  version: 1;
  image: ImageAsset | null;
  guides: Record<GuideKey, boolean>;
  subject: { x: number; y: number } | null;
  crop: CropVariant;
  variants: CropVariant[];
}

/** 绑定在某一张图片上的工作：方案、主体标记和裁切位置。随图片归档，可整体退回。 */
export interface ImageSession {
  image: ImageAsset;
  subject: { x: number; y: number } | null;
  crop: CropVariant;
  variants: CropVariant[];
}

/** 持久化单元：当前文档 + 其他图片的归档会话。辅助层偏好跟随当前文档延续到每一张图。 */
export interface FrameSnapshot {
  version: 1;
  document: FrameDocument;
  recent: ImageSession[];
}

export interface ViewState {
  phase: Phase;
  document: FrameDocument;
  recent: ImageSession[];
  /** 已载入但尚未确认切换的图片；非空时界面应先说明后果再等用户确认。 */
  pendingImage: ImageAsset | null;
  compareOpen: boolean;
  notice: string;
  error: string | null;
}

export const DEFAULT_CROP: CropVariant = {
  id: 'current',
  x: 0,
  y: 0,
  width: 1,
  height: 1,
  ratio: 'free',
};

export const EMPTY_DOCUMENT: FrameDocument = {
  version: 1,
  image: null,
  guides: { thirds: true, center: false, diagonal: false, golden: false },
  subject: null,
  crop: DEFAULT_CROP,
  variants: [],
};

export const EMPTY_SNAPSHOT: FrameSnapshot = {
  version: 1,
  document: EMPTY_DOCUMENT,
  recent: [],
};
