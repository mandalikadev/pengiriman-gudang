import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const direktoriGolden = join(import.meta.dirname, "golden");
const berkasGolden = readdirSync(direktoriGolden).filter((nama) => nama.endsWith(".json"));

describe("fixture golden", () => {
  it("direktori golden berisi fixture", () => {
    expect(berkasGolden.length).toBeGreaterThan(0);
  });

  it.each(berkasGolden)("%s adalah JSON valid dan punya field sumber", (nama) => {
    const isi: unknown = JSON.parse(readFileSync(join(direktoriGolden, nama), "utf8"));

    expect(isi).toBeTypeOf("object");
    expect(isi).not.toBeNull();
    expect(isi).toHaveProperty("sumber");
    expect((isi as { sumber: unknown }).sumber).toBeTypeOf("string");
    expect((isi as { sumber: string }).sumber.trim()).not.toBe("");
  });
});
