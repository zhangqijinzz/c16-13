import { beforeEach, describe, expect, it } from 'vitest';
import { FrameSenseViewModel } from '../viewModel';
import { imageKey } from '../domain';
import { EMPTY_SNAPSHOT, type FrameSnapshot, type ImageAsset } from '../model';
import type { FrameRepository } from '../repository';
import type { ImageService } from '../service';

class MemoryRepository implements FrameRepository {
  snapshot: FrameSnapshot = structuredClone(EMPTY_SNAPSHOT);
  fail = false;
  load() { return structuredClone(this.snapshot); }
  save(snapshot: FrameSnapshot) { if (this.fail) throw new Error('no storage'); this.snapshot = structuredClone(snapshot); }
}

class FakeImageService implements ImageService {
  asset: ImageAsset = { src: 'data:image/svg+xml,test', width: 1200, height: 800, name: 'test.svg' };
  readFile() { return Promise.resolve(this.asset); }
  demo() { return this.asset; }
}

const anyFile = {} as File;
const photo: ImageAsset = { src: 'data:image/jpeg,photo', width: 3000, height: 2000, name: '我的照片.jpg' };

describe('FrameSenseViewModel', () => {
  let repository: MemoryRepository;
  let imageService: FakeImageService;
  let vm: FrameSenseViewModel;
  beforeEach(() => {
    repository = new MemoryRepository();
    imageService = new FakeImageService();
    vm = new FrameSenseViewModel(repository, imageService);
  });

  it('initializes empty and loads a demo image', async () => {
    await vm.initialize();
    expect(vm.getSnapshot().phase).toBe('ready');
    vm.loadDemo();
    expect(vm.getSnapshot().document.image?.name).toBe('test.svg');
    expect(repository.snapshot.document.image).not.toBeNull();
  });

  it('restores recent sessions from the persisted snapshot', async () => {
    repository.snapshot.recent = [{ image: photo, subject: { x: 0.5, y: 0.5 }, crop: { id: 'current', x: 0, y: 0, width: 1, height: 1, ratio: 'free' }, variants: [] }];
    await vm.initialize();
    expect(vm.getSnapshot().recent).toHaveLength(1);
    expect(vm.getSnapshot().recent[0].image.name).toBe('我的照片.jpg');
  });

  it('updates guides, subject, ratio, and variants', () => {
    vm.loadDemo();
    vm.toggleGuide('center');
    vm.markSubject(0.2, 0.8);
    vm.setRatio('1:1');
    vm.saveVariant();
    expect(vm.getSnapshot().document.guides.center).toBe(true);
    expect(vm.getSnapshot().document.subject).toEqual({ x: 0.2, y: 0.8 });
    expect(vm.getSnapshot().document.crop.ratio).toBe('1:1');
    expect(vm.getSnapshot().document.variants).toHaveLength(1);
  });

  it('keeps edits in memory and reports persistence failure', () => {
    repository.fail = true;
    vm.loadDemo();
    expect(vm.getSnapshot().phase).toBe('error');
    expect(vm.getSnapshot().document.image).not.toBeNull();
    expect(vm.getSnapshot().error).toContain('本地保存失败');
  });

  it('carries guide preferences over to a newly imported image', async () => {
    vm.loadDemo();
    vm.toggleGuide('center');
    imageService.asset = photo;
    await vm.importImage(anyFile);
    const state = vm.getSnapshot();
    expect(state.document.image?.name).toBe('我的照片.jpg');
    expect(state.document.guides.center).toBe(true);
    expect(state.document.variants).toEqual([]);
    expect(state.document.subject).toBeNull();
  });

  it('asks before switching when the current image has saved work', async () => {
    vm.loadDemo();
    vm.markSubject(0.3, 0.4);
    vm.saveVariant();
    imageService.asset = photo;
    await vm.importImage(anyFile);
    const state = vm.getSnapshot();
    expect(state.pendingImage?.name).toBe('我的照片.jpg');
    expect(state.document.image?.name).toBe('test.svg');
    expect(state.document.variants).toHaveLength(1);
    expect(state.document.subject).toEqual({ x: 0.3, y: 0.4 });
  });

  it('confirming the switch archives the old work and starts the new image clean', async () => {
    vm.loadDemo();
    vm.toggleGuide('golden');
    vm.markSubject(0.3, 0.4);
    vm.saveVariant();
    imageService.asset = photo;
    await vm.importImage(anyFile);
    vm.confirmImageSwitch();
    const state = vm.getSnapshot();
    expect(state.pendingImage).toBeNull();
    expect(state.document.image?.name).toBe('我的照片.jpg');
    expect(state.document.variants).toEqual([]);
    expect(state.document.subject).toBeNull();
    expect(state.document.guides.golden).toBe(true);
    expect(state.recent).toHaveLength(1);
    expect(state.recent[0].image.name).toBe('test.svg');
    expect(state.recent[0].variants).toHaveLength(1);
    expect(state.recent[0].subject).toEqual({ x: 0.3, y: 0.4 });
    expect(repository.snapshot.recent).toHaveLength(1);
  });

  it('cancelling the switch keeps the current document untouched', async () => {
    vm.loadDemo();
    vm.saveVariant();
    imageService.asset = photo;
    await vm.importImage(anyFile);
    vm.cancelImageSwitch();
    const state = vm.getSnapshot();
    expect(state.pendingImage).toBeNull();
    expect(state.document.image?.name).toBe('test.svg');
    expect(state.document.variants).toHaveLength(1);
    expect(state.recent).toEqual([]);
  });

  it('restores archived work when switching back to a previous image', async () => {
    vm.loadDemo();
    vm.markSubject(0.3, 0.4);
    vm.saveVariant();
    imageService.asset = photo;
    await vm.importImage(anyFile);
    vm.confirmImageSwitch();
    vm.restoreSession(imageKey({ src: 'data:image/svg+xml,test', width: 1200, height: 800, name: 'test.svg' }));
    const state = vm.getSnapshot();
    expect(state.document.image?.name).toBe('test.svg');
    expect(state.document.variants).toHaveLength(1);
    expect(state.document.subject).toEqual({ x: 0.3, y: 0.4 });
    expect(state.recent).toHaveLength(1);
    expect(state.recent[0].image.name).toBe('我的照片.jpg');
  });

  it('restores an archived session when its image is imported again', async () => {
    vm.loadDemo();
    vm.saveVariant();
    imageService.asset = photo;
    await vm.importImage(anyFile);
    vm.confirmImageSwitch();
    imageService.asset = { src: 'data:image/svg+xml,test', width: 1200, height: 800, name: 'test.svg' };
    await vm.importImage(anyFile);
    const state = vm.getSnapshot();
    expect(state.document.image?.name).toBe('test.svg');
    expect(state.document.variants).toHaveLength(1);
    expect(state.recent.map((session) => session.image.name)).toEqual(['我的照片.jpg']);
  });

  it('treats re-importing the active image as a no-op', async () => {
    vm.loadDemo();
    vm.saveVariant();
    await vm.importImage(anyFile);
    const state = vm.getSnapshot();
    expect(state.pendingImage).toBeNull();
    expect(state.document.image?.name).toBe('test.svg');
    expect(state.document.variants).toHaveLength(1);
    expect(state.recent).toEqual([]);
  });
});
