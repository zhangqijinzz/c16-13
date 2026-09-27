import { describe, expect, it } from 'vitest';
import { LocalFrameRepository } from '../repository';
import { EMPTY_DOCUMENT, EMPTY_SNAPSHOT, type FrameSnapshot } from '../model';
import type { StorageService } from '../service';

class MemoryStorage implements StorageService {
  value: string | null = null;
  read() { return this.value; }
  write(value: string) { this.value = value; }
}

const demoImage = { src: 'data:image/svg+xml,demo', width: 1200, height: 800, name: 'demo.svg' };

describe('LocalFrameRepository', () => {
  it('saves and reloads the snapshot with recent sessions', () => {
    const storage = new MemoryStorage();
    const repository = new LocalFrameRepository(storage);
    const snapshot: FrameSnapshot = {
      version: 1,
      document: { ...structuredClone(EMPTY_DOCUMENT), subject: { x: 0.4, y: 0.6 } },
      recent: [{ image: demoImage, subject: null, crop: { id: 'current', x: 0.1, y: 0.1, width: 0.5, height: 0.5, ratio: '1:1' }, variants: [] }],
    };
    repository.save(snapshot);
    const loaded = repository.load();
    expect(loaded.document.subject).toEqual({ x: 0.4, y: 0.6 });
    expect(loaded.recent).toHaveLength(1);
    expect(loaded.recent[0].image.name).toBe('demo.svg');
  });

  it('migrates a legacy bare document into a snapshot with empty recent', () => {
    const storage = new MemoryStorage();
    storage.value = JSON.stringify({ ...structuredClone(EMPTY_DOCUMENT), image: demoImage });
    const loaded = new LocalFrameRepository(storage).load();
    expect(loaded.version).toBe(1);
    expect(loaded.document.image?.name).toBe('demo.svg');
    expect(loaded.recent).toEqual([]);
  });

  it('falls back to a usable empty snapshot for damaged data', () => {
    const storage = new MemoryStorage();
    storage.value = '{ damaged';
    const snapshot = new LocalFrameRepository(storage).load();
    expect(snapshot).toEqual(structuredClone(EMPTY_SNAPSHOT));
    expect(snapshot.document.image).toBeNull();
    expect(snapshot.recent).toEqual([]);
  });
});
