import { describe, expect, it } from "vitest";

import { tanggalWib } from "./format";

describe("tanggalWib", () => {
  it("memakai tanggal kalender WIB (UTC+7), bukan UTC", () => {
    expect(tanggalWib(new Date("2026-10-08T16:59:59Z"))).toBe("2026-10-08");
    expect(tanggalWib(new Date("2026-10-08T17:00:00Z"))).toBe("2026-10-09");
  });
});
