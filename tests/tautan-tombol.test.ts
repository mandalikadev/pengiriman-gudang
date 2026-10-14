import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// DESIGN §11.8 (T122): satu gaya tautan-tombol dipakai bersama (`tautanTombolVariants` di components/ui/button.tsx).
// Penjaga sumber: string kelas tautan-tombol lama ("inline-flex min-h-11 … rounded-full px-4 font-semibold …") tidak
// lagi disalin di berkas lain.

const akarSrc = join(process.cwd(), "src");
const berkasGaya = join("components", "ui", "button.tsx");

function berkasSumber(): string[] {
  return readdirSync(akarSrc, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile() && /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name))
    .map((e) => join(e.parentPath, e.name));
}

/** Salinan gaya tautan-tombol: pil `rounded-full px-4 font-semibold` dengan target sentuh `min-h-*`. */
const SALINAN = /min-h-\d+[^"`]*rounded-full px-4 font-semibold|rounded-full px-4 font-semibold[^"`]*min-h-\d+/;

describe("gaya tautan-tombol bersama (DESIGN §11.8)", () => {
  it("berkas gaya bersama memuat gayanya", () => {
    expect(readFileSync(join(akarSrc, berkasGaya), "utf8")).toMatch(/export const tautanTombolVariants/);
  });

  it("tidak ada salinan string kelas tautan-tombol di luar components/ui/button.tsx", () => {
    const salinan = berkasSumber()
      .filter((path) => relative(akarSrc, path) !== berkasGaya)
      .flatMap((path) =>
        readFileSync(path, "utf8")
          .split("\n")
          .map((baris, i) => ({ baris, nomor: i + 1 }))
          .filter(({ baris }) => SALINAN.test(baris))
          .map(({ nomor }) => `${relative(akarSrc, path)}:${nomor}`),
      );
    expect(salinan).toEqual([]);
  });
});
