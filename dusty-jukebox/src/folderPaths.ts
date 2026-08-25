export interface FolderMeta { name: string; parentId?: string; }
export type FolderGetFn = (folderId: string) => Promise<FolderMeta | null>;

export class FolderPathResolver {
  private readonly cache = new Map<string, Promise<FolderMeta | null>>();
  constructor(private readonly getFolder: FolderGetFn, private readonly rootFolderId: string) {}
  private get(id: string): Promise<FolderMeta | null> {
    const existing = this.cache.get(id); if (existing) return existing;
    const pending = this.getFolder(id).catch((error) => { this.cache.delete(id); throw error; });
    this.cache.set(id, pending); return pending;
  }
  async resolve(parentId: string): Promise<string> {
    const names: string[] = []; const seen = new Set<string>(); let id: string | undefined = parentId;
    while (id && id !== this.rootFolderId && !seen.has(id)) { seen.add(id); const meta = await this.get(id); if (!meta) break; names.unshift(meta.name); id = meta.parentId; }
    return names.join(" / ");
  }
}
