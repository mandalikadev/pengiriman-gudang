import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CardTitle } from "./card";

// DESIGN §11.8: judul kartu mengikuti urutan heading halaman (h1 → h2 → h3) tanpa melompat.
describe("CardTitle (DESIGN §11.8)", () => {
  it("tanpa level merender <h3>", () => {
    expect(renderToStaticMarkup(<CardTitle>Judul</CardTitle>)).toMatch(/^<h3[\s>]/);
  });

  it("level 2 merender <h2>", () => {
    const html = renderToStaticMarkup(<CardTitle level={2}>Judul</CardTitle>);
    expect(html).toMatch(/^<h2[\s>]/);
    expect(html).toMatch(/<\/h2>$/);
    expect(html).toContain('data-slot="card-title"');
  });

  it("level 4 merender <h4>", () => {
    expect(renderToStaticMarkup(<CardTitle level={4}>Judul</CardTitle>)).toMatch(/^<h4[\s>]/);
  });
});
