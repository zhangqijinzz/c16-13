import { isFrameDocument, isFrameSnapshot } from './domain';
import { EMPTY_SNAPSHOT, type FrameSnapshot } from './model';
import type { StorageService } from './service';

export interface FrameRepository {
  load(): FrameSnapshot;
  save(snapshot: FrameSnapshot): void;
}

export class LocalFrameRepository implements FrameRepository {
  constructor(private readonly storage: StorageService) {}

  load(): FrameSnapshot {
    const raw = this.storage.read();
    if (!raw) return structuredClone(EMPTY_SNAPSHOT);
    try {
      const parsed: unknown = JSON.parse(raw);
      if (isFrameSnapshot(parsed)) return parsed;
      // 兼容旧版：只存了单个文档、没有最近图片归档。
      if (isFrameDocument(parsed)) return { version: 1, document: parsed, recent: [] };
      return structuredClone(EMPTY_SNAPSHOT);
    } catch {
      return structuredClone(EMPTY_SNAPSHOT);
    }
  }

  save(snapshot: FrameSnapshot): void {
    this.storage.write(JSON.stringify(snapshot));
  }
}
