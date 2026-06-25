export const SFX = new Proxy({}, {
  get: () => () => {},
});
