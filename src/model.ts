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

/** 绑定在某一张图片上的工作成果（方案、主体标记、画框），按图片身份存档，切回时可恢复。 */
export interface ImageWork {
  imageName: string;
  subject: { x: number; y: number } | null;
  crop: CropVariant;
  variants: CropVariant[];
  updatedAt: number;
}

/** 非当前图片的工作存档，键为 imageKey。只存裁切数据，不重复存图片本体。 */
export interface WorkStash {
  version: 1;
  entries: Record<string, ImageWork>;
}

/** 一次等待用户确认的换图请求。 */
export interface PendingSwitch {
  image: ImageAsset;
  restores: ImageWork | null;
}

export interface ViewState {
  phase: Phase;
  document: FrameDocument;
  compareOpen: boolean;
  notice: string;
  error: string | null;
  pendingSwitch: PendingSwitch | null;
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

export const EMPTY_STASH: WorkStash = { version: 1, entries: {} };
