// The scan and catalog-read paths both touch the same index/sync tabs.  This
// small synchronous gate supplements disabled controls, so programmatic or
// duplicate event entry cannot start the other operation in the same tab.
export class CatalogOperationGate {
  private active = false;

  tryAcquire(): boolean {
    if (this.active) return false;
    this.active = true;
    return true;
  }

  release(): void {
    this.active = false;
  }
}
