import { useState, useSyncExternalStore } from 'react';
import { archiveSession, cropForRatio, hasImageWork, imageKey, makeVariant, moveCrop, resizeCrop, takeSession, toSession } from './domain';
import { DEFAULT_CROP, EMPTY_DOCUMENT, type FrameDocument, type GuideKey, type ImageAsset, type ImageSession, type Ratio, type ViewState } from './model';
import type { FrameRepository } from './repository';
import type { ImageService } from './service';

type Listener = () => void;

export class FrameSenseViewModel {
  private state: ViewState = { phase: 'loading', document: structuredClone(EMPTY_DOCUMENT), recent: [], pendingImage: null, compareOpen: false, notice: '', error: null };
  private readonly listeners = new Set<Listener>();

  constructor(private readonly repository: FrameRepository, private readonly imageService: ImageService) {}

  getSnapshot = (): ViewState => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private patch(next: Partial<ViewState>): void {
    this.state = { ...this.state, ...next };
    this.listeners.forEach((listener) => listener());
  }

  private persist(document: FrameDocument, notice: string, recent: ImageSession[] = this.state.recent): void {
    this.patch({ document, recent, phase: 'editing', notice, error: null });
    try {
      this.repository.save({ version: 1, document, recent });
    } catch {
      this.patch({ phase: 'error', error: '本地保存失败，但当前编辑仍保留在页面中。请检查浏览器存储权限。' });
    }
  }

  async initialize(): Promise<void> {
    this.patch({ phase: 'loading', notice: '正在恢复上次工作状态…', error: null });
    try {
      const snapshot = this.repository.load();
      const hasImage = snapshot.document.image !== null;
      this.patch({
        document: snapshot.document,
        recent: snapshot.recent,
        phase: hasImage ? 'editing' : 'ready',
        notice: hasImage ? '已恢复上次工作状态' : '欢迎来到 FrameSense，先载入示例或导入图片。',
      });
    } catch {
      this.patch({ phase: 'error', notice: '未能读取历史状态，可继续新建工作。', error: '本地数据读取失败。' });
    }
  }

  async importImage(file: File): Promise<void> {
    this.patch({ phase: 'loading', notice: '正在载入图片…', error: null, pendingImage: null });
    try {
      const image = await this.imageService.readFile(file);
      this.requestImageSwitch(image);
    } catch (error) {
      this.patch({ phase: 'error', error: error instanceof Error ? error.message : '图片载入失败。' });
    }
  }

  loadDemo(): void {
    this.requestImageSwitch(this.imageService.demo());
  }

  /** 换图入口：同图忽略；当前图上有方案或主体时先挂起等待确认；其余情况直接切换。 */
  private requestImageSwitch(image: ImageAsset): void {
    const current = this.state.document;
    if (current.image && imageKey(current.image) === imageKey(image)) {
      this.patch({ phase: 'editing', pendingImage: null, notice: `工作台上已经是「${image.name}」，方案与标记保持不变。`, error: null });
      return;
    }
    if (current.image && hasImageWork(current)) {
      this.patch({ phase: 'editing', pendingImage: image, notice: '换图前请确认当前方案与主体标记的处理方式。', error: null });
      return;
    }
    this.applyImage(image);
  }

  confirmImageSwitch(): void {
    const image = this.state.pendingImage;
    if (!image) return;
    this.applyImage(image);
  }

  cancelImageSwitch(): void {
    if (!this.state.pendingImage) return;
    const name = this.state.document.image?.name;
    this.patch({ pendingImage: null, notice: `已取消换图，继续编辑「${name ?? '当前图片'}」。` });
  }

  /** 从"最近图片"切回某张图，恢复它名下的方案、主体和裁切。 */
  restoreSession(key: string): void {
    const session = this.state.recent.find((item) => imageKey(item.image) === key);
    if (!session) return;
    this.applyImage(session.image);
  }

  /**
   * 切换图片：辅助层偏好延续到新图；当前图的方案、主体、裁切以图名归档可退回；
   * 新图若有自己的归档则恢复，否则从空白构图开始，不残留上一张图的状态。
   */
  private applyImage(image: ImageAsset): void {
    const current = this.state.document;
    let recent = this.state.recent;
    const currentSession = toSession(current);
    if (currentSession && imageKey(currentSession.image) !== imageKey(image)) {
      recent = archiveSession(recent, currentSession);
    }
    const taken = takeSession(recent, image);
    const session = taken.session;
    recent = taken.recent;
    const document: FrameDocument = {
      version: 1,
      image,
      guides: { ...current.guides },
      subject: session?.subject ?? null,
      crop: session ? { ...session.crop } : { ...DEFAULT_CROP },
      variants: session ? session.variants.map((variant) => ({ ...variant })) : [],
    };
    this.patch({ pendingImage: null, compareOpen: false });
    this.persist(document, this.switchNotice(image, current, session, currentSession !== null), recent);
  }

  private switchNotice(image: ImageAsset, previous: FrameDocument, restored: ImageSession | null, archived: boolean): string {
    const parts: string[] = [];
    if (restored && (restored.variants.length > 0 || restored.subject)) {
      const work = [`${restored.variants.length} 个方案`, restored.subject ? '主体标记' : ''].filter(Boolean).join('和');
      parts.push(`已切换到「${image.name}」，恢复了之前的 ${work}`);
    } else if (previous.image) {
      parts.push(`已切换到「${image.name}」，从空白构图开始`);
    } else {
      parts.push(`已载入「${image.name}」，可以开始构图`);
    }
    parts.push('辅助层设置已保留');
    if (archived && previous.image) {
      const work = previous.variants.length > 0 ? `${previous.variants.length} 个方案` : '构图进度';
      parts.push(`「${previous.image.name}」的${work}已存入最近图片，可随时切回`);
    }
    return `${parts.join('；')}。`;
  }

  toggleGuide(guide: GuideKey): void {
    const document = { ...this.state.document, guides: { ...this.state.document.guides, [guide]: !this.state.document.guides[guide] } };
    this.persist(document, '辅助层已更新。');
  }

  setRatio(ratio: Ratio): void {
    const image = this.state.document.image;
    if (!image) return;
    const crop = cropForRatio(ratio, image.width / image.height, this.state.document.crop);
    this.persist({ ...this.state.document, crop }, `${ratio === 'free' ? '自由' : ratio} 裁切已应用。`);
  }

  moveCrop(dx: number, dy: number): void {
    this.persist({ ...this.state.document, crop: moveCrop(this.state.document.crop, dx, dy) }, '裁切位置已调整。');
  }

  resizeCrop(width: number, height: number): void {
    this.persist({ ...this.state.document, crop: resizeCrop(this.state.document.crop, width, height) }, '裁切范围已调整。');
  }

  markSubject(x: number, y: number): void {
    this.persist({ ...this.state.document, subject: { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) } }, '主体标记已更新。');
  }

  saveVariant(): void {
    const id = `variant-${Date.now()}`;
    const variant = makeVariant(this.state.document.crop, id);
    const document = { ...this.state.document, variants: [...this.state.document.variants, variant].slice(-8) };
    this.persist(document, `已保存裁切方案 ${document.variants.length}。`);
  }

  selectVariant(id: string): void {
    const variant = this.state.document.variants.find((item) => item.id === id);
    if (!variant) return;
    this.persist({ ...this.state.document, crop: { ...variant, id: 'current' } }, '已切换到保存的裁切方案。');
  }

  toggleCompare(): void {
    this.patch({ compareOpen: !this.state.compareOpen });
  }
}

export function useFrameSenseViewModel(repository: FrameRepository, imageService: ImageService): [FrameSenseViewModel, ViewState] {
  const [viewModel] = useState(() => new FrameSenseViewModel(repository, imageService));
  const state = useSyncExternalStore(viewModel.subscribe, viewModel.getSnapshot, viewModel.getSnapshot);
  return [viewModel, state];
}
