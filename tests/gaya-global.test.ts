import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const akar = process.cwd();
const css = readFileSync(join(akar, "src/app/globals.css"), "utf8");

function berkasKomponen(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entri) => {
    const path = join(dir, entri.name);
    if (entri.isDirectory()) return berkasKomponen(path);
    return /\.tsx?$/.test(entri.name) && !/\.test\.tsx?$/.test(entri.name) ? [path] : [];
  });
}

describe("gaya global", () => {
  it("prefers-reduced-motion mematikan scale, translate, dan animasi", () => {
    const blok = css.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?\})\s*\}/);
    expect(blok, "blok @media (prefers-reduced-motion: reduce) harus ada").not.toBeNull();
    const isi = blok![1];
    expect(isi).toMatch(/scale:\s*none\s*!important/);
    expect(isi).toMatch(/translate:\s*none\s*!important/);
    expect(isi).toMatch(/animation:\s*none\s*!important/);
  });

  it("tekstur kertas adalah satu lapisan fixed tanpa pointer-events, multiply, opacity 3%", () => {
    const blok = css.match(/\.tekstur-kertas\s*\{([^}]*)\}/);
    expect(blok).not.toBeNull();
    const isi = blok![1];
    expect(isi).toMatch(/position:\s*fixed/);
    expect(isi).toMatch(/pointer-events:\s*none/);
    expect(isi).toMatch(/mix-blend-mode:\s*multiply/);
    expect(isi).toMatch(/opacity:\s*0?\.03/);
  });

  it("bayangan shadow-soft dan shadow-float sesuai DESIGN §4", () => {
    expect(css).toMatch(/--shadow-soft:\s*0 4px 20px -2px rgba\(93,\s*112,\s*82,\s*0\.15\)/);
    expect(css).toMatch(/--shadow-float:\s*0 10px 40px -10px rgba\(193,\s*140,\s*93,\s*0\.2\)/);
  });

  it("tidak ada nilai hex di komponen dan halaman", () => {
    const pelanggaran = berkasKomponen(join(akar, "src"))
      .filter((path) => !path.includes(`${join("src", "domain")}`))
      .flatMap((path) =>
        [...readFileSync(path, "utf8").matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map(
          (m) => `${relative(akar, path)}: ${m[0]}`,
        ),
      );
    expect(pelanggaran).toEqual([]);
  });

  it("tidak ada warna palet bawaan Tailwind di komponen dan halaman (semua warna lewat token DESIGN §2)", () => {
    const paletBawaan =
      /\b(?:text|bg|border|ring|ring-offset|fill|stroke|from|via|to|outline|decoration|shadow|accent|caret|divide|placeholder)-(?:white|black|(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3})\b/g;
    const pelanggaran = berkasKomponen(join(akar, "src"))
      .filter((path) => !path.includes(`${join("src", "domain")}`))
      .flatMap((path) =>
        [...readFileSync(path, "utf8").matchAll(paletBawaan)].map((m) => `${relative(akar, path)}: ${m[0]}`),
      );
    expect(pelanggaran).toEqual([]);
  });
});
