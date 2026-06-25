export const SFX: Record<string, (...args: unknown[]) => void> = new Proxy({} as Record<string, (...args: unknown[]) => void>, {
  get: () => () => {},
});
