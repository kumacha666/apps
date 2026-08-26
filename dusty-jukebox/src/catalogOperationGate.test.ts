import { describe, expect, test } from "vitest";
import { CatalogOperationGate } from "./catalogOperationGate";

describe("CatalogOperationGate", () => {
  test("スキャンまたはカタログ読込中はもう一方の開始を拒否し、完了後に再開できる", () => {
    const gate = new CatalogOperationGate();

    expect(gate.tryAcquire()).toBe(true);
    expect(gate.tryAcquire()).toBe(false);
    gate.release();
    expect(gate.tryAcquire()).toBe(true);
  });
});
