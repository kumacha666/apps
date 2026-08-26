export interface FolderMeta { name: string; parentId?: string; }
export type FolderGetFn = (folderId: string) => Promise<FolderMeta | null>;

export class FolderPathResolver {
  private readonly cache = new Map<string, Promise<FolderMeta | null>>();
  // Promise cache intentionally evicts rejected requests so a later catalog load
  // can retry them. Within one resolver instance, however, retrying a known
  // failed ancestor for every sibling path can stall a large catalog load.
  private readonly failedFolderErrors = new Map<string, unknown>();
  constructor(private readonly getFolder: FolderGetFn, rootFolderIds: string | Iterable<string>) { this.rootFolderIds = new Set(typeof rootFolderIds === "string" ? [rootFolderIds] : rootFolderIds); }
  private readonly rootFolderIds: Set<string>;
  private get(id: string): Promise<FolderMeta | null> {
    if (this.failedFolderErrors.has(id)) return Promise.reject(this.failedFolderErrors.get(id));
    const existing = this.cache.get(id); if (existing) return existing;
    const pending = this.getFolder(id).catch((error) => {
      this.cache.delete(id);
      this.failedFolderErrors.set(id, error);
      throw error;
    });
    this.cache.set(id, pending); return pending;
  }
  async resolve(parentId: string): Promise<string> {
    const names: string[] = []; const seen = new Set<string>(); let id: string | undefined = parentId;
    while (id && !this.rootFolderIds.has(id) && !seen.has(id)) { seen.add(id); const meta = await this.get(id); if (!meta) break; names.unshift(meta.name); id = meta.parentId; }
    return names.join(" / ");
  }
}
