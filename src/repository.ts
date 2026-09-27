import { isFrameDocument, isWorkStash } from './domain';
import { EMPTY_DOCUMENT, EMPTY_STASH, type FrameDocument, type WorkStash } from './model';
import { STORAGE_KEY, WORK_STORAGE_KEY, type StorageService } from './service';

export interface FrameRepository {
  load(): FrameDocument;
  save(document: FrameDocument): void;
  loadWork(): WorkStash;
  saveWork(stash: WorkStash): void;
}

export class LocalFrameRepository implements FrameRepository {
  constructor(private readonly storage: StorageService) {}

  load(): FrameDocument {
    const raw = this.storage.read(STORAGE_KEY);
    if (!raw) return structuredClone(EMPTY_DOCUMENT);
    try {
      const parsed: unknown = JSON.parse(raw);
      return isFrameDocument(parsed) ? parsed : structuredClone(EMPTY_DOCUMENT);
    } catch {
      return structuredClone(EMPTY_DOCUMENT);
    }
  }

  save(document: FrameDocument): void {
    this.storage.write(STORAGE_KEY, JSON.stringify(document));
  }

  loadWork(): WorkStash {
    const raw = this.storage.read(WORK_STORAGE_KEY);
    if (!raw) return structuredClone(EMPTY_STASH);
    try {
      const parsed: unknown = JSON.parse(raw);
      return isWorkStash(parsed) ? parsed : structuredClone(EMPTY_STASH);
    } catch {
      return structuredClone(EMPTY_STASH);
    }
  }

  saveWork(stash: WorkStash): void {
    this.storage.write(WORK_STORAGE_KEY, JSON.stringify(stash));
  }
}
