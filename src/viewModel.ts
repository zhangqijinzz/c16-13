import { useState, useSyncExternalStore } from 'react';
import { cropForRatio, hasImageWork, imageKey, makeVariant, moveCrop, rememberWork, resizeCrop, takeWork } from './domain';
import { DEFAULT_CROP, EMPTY_DOCUMENT, EMPTY_STASH, type FrameDocument, type GuideKey, type ImageAsset, type Ratio, type ViewState, type WorkStash } from './model';
import type { FrameRepository } from './repository';
import type { ImageService } from './service';

type Listener = () => void;

export class FrameSenseViewModel {
  private state: ViewState = { phase: 'loading', document: structuredClone(EMPTY_DOCUMENT), compareOpen: false, notice: '', error: null, pendingSwitch: null };
  private stash: WorkStash = structuredClone(EMPTY_STASH);
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

  private persist(document: FrameDocument, notice: string): void {
    this.patch({ document, phase: 'editing', notice, error: null });
    try {
      this.repository.save(document);
    } catch {
      this.patch({ phase: 'error', error: '本地保存失败，但当前编辑仍保留在页面中。请检查浏览器存储权限。' });
    }
  }

  async initialize(): Promise<void> {
    this.patch({ phase: 'loading', notice: '正在恢复上次工作状态…', error: null });
    try {
      const document = this.repository.load();
      this.stash = this.repository.loadWork();
      this.patch({ document, phase: document.image ? 'editing' : 'ready', notice: document.image ? '已恢复上次工作状态' : '欢迎来到 FrameSense，先载入示例或导入图片。' });
    } catch {
      this.patch({ phase: 'error', notice: '未能读取历史状态，可继续新建工作。', error: '本地数据读取失败。' });
    }
  }

  async importImage(file: File): Promise<void> {
    this.patch({ phase: 'loading', notice: '正在载入图片…', error: null });
    try {
      const image = await this.imageService.readFile(file);
      this.requestSwitch(image);
    } catch (error) {
      this.patch({ phase: 'error', error: error instanceof Error ? error.message : '图片载入失败。' });
    }
  }

  loadDemo(): void {
    this.requestSwitch(this.imageService.demo());
  }

  /**
   * 换图入口：辅助层偏好始终延续；当前图片上的方案、主体标记和画框调整
   * 会留在原图名下，切回时自动恢复。当前图上有成果时先征得用户确认。
   */
  private requestSwitch(image: ImageAsset): void {
    const current = this.state.document;
    if (current.image && imageKey(current.image) === imageKey(image)) {
      this.patch({ phase: 'editing', notice: `「${image.name}」已经在工作台上，方案与标记保持不变。`, error: null });
      return;
    }
    if (current.image && hasImageWork(current)) {
      const restores = this.stash.entries[imageKey(image)] ?? null;
      this.patch({ phase: 'editing', pendingSwitch: { image, restores }, notice: '', error: null });
      return;
    }
    this.applySwitch(image);
  }

  confirmSwitch(): void {
    const pending = this.state.pendingSwitch;
    if (!pending) return;
    this.applySwitch(pending.image);
  }

  cancelSwitch(): void {
    if (!this.state.pendingSwitch) return;
    this.patch({ pendingSwitch: null, notice: '已取消切换，当前图片的方案与标记保持不变。' });
  }

  private applySwitch(image: ImageAsset): void {
    const current = this.state.document;
    let stash = this.stash;
    if (current.image && hasImageWork(current)) {
      stash = rememberWork(stash, current.image, {
        imageName: current.image.name,
        subject: current.subject,
        crop: current.crop,
        variants: current.variants,
        updatedAt: Date.now(),
      });
    }
    const taken = takeWork(stash, image);
    stash = taken.stash;
    const work = taken.work;
    const document: FrameDocument = {
      version: 1,
      image,
      guides: { ...current.guides },
      subject: work?.subject ?? null,
      crop: work ? work.crop : structuredClone(DEFAULT_CROP),
      variants: work ? work.variants : [],
    };
    this.stash = stash;
    const notice = work
      ? `已切换到「${image.name}」，恢复这张图片上次的裁切进度；辅助层设置已延续。`
      : `已切换到「${image.name}」，可以开始构图；辅助层设置已延续。`;
    this.patch({ document, phase: 'editing', compareOpen: false, pendingSwitch: null, notice, error: null });
    try {
      this.repository.save(document);
      this.repository.saveWork(stash);
    } catch {
      this.patch({ phase: 'error', error: '本地保存失败，但当前编辑仍保留在页面中。请检查浏览器存储权限。' });
    }
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
