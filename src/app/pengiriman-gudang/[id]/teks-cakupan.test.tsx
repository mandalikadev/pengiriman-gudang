import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TeksCakupan, teksCakupan } from "./teks-cakupan";

// T121 (DESIGN §11.6): teks cakupan ditulis lengkap; p = 0 tanpa bagian persiapan.

const teksTerbaca = (html: string) => html.replace(/<button[^>]*>.*?<\/button>/g, "").replace(/<[^>]+>/g, "").replaceAll("&amp;", "&");

describe("teks cakupan", () => {
  it("p = 1, L = 7 → Cakupan 8 hari: persiapan 1 hari + 7 hari sampai sebelum kiriman berikutnya", () => {
    expect(teksCakupan(1, 7)).toBe("Cakupan 8 hari: persiapan 1 hari + 7 hari sampai sebelum kiriman berikutnya");
    expect(teksTerbaca(renderToStaticMarkup(<TeksCakupan persiapanHari={1} panjangCakupan={7} />))).toBe(
      "Cakupan 8 hari: persiapan 1 hari + 7 hari sampai sebelum kiriman berikutnya",
    );
  });

  it("p = 0, L = 3 → tanpa bagian persiapan", () => {
    expect(teksCakupan(0, 3)).toBe("Cakupan 3 hari: 3 hari sampai sebelum kiriman berikutnya");
    const html = renderToStaticMarkup(<TeksCakupan persiapanHari={0} panjangCakupan={3} />);
    expect(teksTerbaca(html)).toBe("Cakupan 3 hari: 3 hari sampai sebelum kiriman berikutnya");
    expect(html).not.toContain("persiapan");
  });

  it("bantuan istilah di samping Cakupan, persiapan, dan panjang cakupan", () => {
    const html = renderToStaticMarkup(<TeksCakupan persiapanHari={2} panjangCakupan={14} />);
    expect([...html.matchAll(/data-bantuan-istilah="([^"]+)"/g)].map((m) => m[1])).toEqual(["cakupan", "persiapan", "panjangCakupan"]);
  });
});
