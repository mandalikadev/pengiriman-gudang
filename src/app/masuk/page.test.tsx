import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("./aksi", () => ({ masuk: async () => null }));

import HalamanMasuk from "./page";

describe("/masuk", () => {
  const html = renderToStaticMarkup(<HalamanMasuk />);

  it("form email dan kata sandi, tanpa tautan daftar", () => {
    expect(html).toContain('name="email"');
    expect(html).toContain('name="sandi"');
    expect(html).toContain('type="password"');
    expect(html).not.toMatch(/daftar/i);
  });

  it("zona suasana: maksimal dua blob dan judul besar (DESIGN §1)", () => {
    expect(html.match(/blur-3xl/g)?.length).toBe(2);
    expect(html).toContain("text-4xl");
  });
});
