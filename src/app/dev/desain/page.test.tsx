import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import HalamanContohDesain from "./page";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("/dev/desain", () => {
  it("404 di luar mode development", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => HalamanContohDesain()).toThrow(/NEXT_HTTP_ERROR_FALLBACK;404/);
  });

  it("di mode development menampilkan komponen contoh", () => {
    vi.stubEnv("NODE_ENV", "development");
    const html = renderToStaticMarkup(HalamanContohDesain());
    for (const varian of ["default", "secondary", "outline", "ghost", "destructive"]) {
      expect(html).toContain(`${varian} · sm`);
    }
    expect(html).toContain("h-12 rounded-full");
    expect(html).toContain("h-9 rounded-xl");
    expect(html).toContain("text-right tabular-nums");
    expect(html.match(/data-status=/g)?.length).toBeGreaterThanOrEqual(18);
    expect(html.match(/data-keadaan=/g)?.length).toBeGreaterThanOrEqual(5);
  });
});
