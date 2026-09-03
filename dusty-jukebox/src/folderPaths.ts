export interface FolderMeta { name: string; parentId?: string; }
export type FolderGetFn = (folderId: string) => Promise<FolderMeta | null>;

export class FolderPathResolver {
  private readonly cache = new Map<string, Promise<FolderMeta | null>>();
  // Promise cache intentionally evicts rejected requests so a later catalog load
  // can retry them. Within one resolver instance, however, retrying a known
  // failed ancestor for every sibling path can stall a large catalog load.
  private readonly failedFolderErrors = new Map<string, unknown>();
  // Settled results actually returned by getFolder(), keyed by folderId. Used by
  // resolvedEntries() so a caller (main.ts loadCatalog) can persist newly resolved
  // folders back into the folders cache tab (folderCache.ts) as a best-effort
  // backfill, without needing to re-derive them from the cache Promise map above.
  private readonly settled = new Map<string, FolderMeta>();
  constructor(private readonly getFolder: FolderGetFn, rootFolderIds: string | Iterable<string>) { this.rootFolderIds = new Set(typeof rootFolderIds === "string" ? [rootFolderIds] : rootFolderIds); }
  private readonly rootFolderIds: Set<string>;
  private get(id: string): Promise<FolderMeta | null> {
    if (this.failedFolderErrors.has(id)) return Promise.reject(this.failedFolderErrors.get(id));
    const existing = this.cache.get(id); if (existing) return existing;
    const pending = this.getFolder(id).then((meta) => {
      if (meta) this.settled.set(id, meta);
      return meta;
    }).catch((error) => {
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
  // Folders actually fetched via getFolder() (i.e. not answered from a folder cache
  // that a caller may have layered in front of getFolder itself) since this resolver
  // was constructed. Only meaningful once all in-flight resolve() calls have settled.
  resolvedEntries(): Map<string, FolderMeta> {
    return new Map(this.settled);
  }
}
