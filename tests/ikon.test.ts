import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// DESIGN §6: ikon lucide-react, stroke 2, ukuran 20 px (size-5) di zona kerja dan 28 px (size-7) di zona suasana.
// Penjaga sumber: setiap ikon lucide yang diimpor langsung dan dipakai sebagai elemen JSX
// harus ber-className size-5 (size-7 di berkas zona suasana) dan tidak memakai strokeWidth selain 2.
// Ikon yang dirender lewat variabel (mis. `Ikon` di BadgeStatus) dijaga test komponennya sendiri.

function berkasTsx(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter(
      (e) =>
        e.isFile() && e.name.endsWith(".tsx") && !e.name.endsWith(".test.tsx"),
    )
    .map((e) => join(e.parentPath, e.name));
}

function pemakaianIkon(sumber: string): { nama: string; tag: string }[] {
  const impor = sumber.match(
    /import\s*\{([^}]*)\}\s*from\s*"lucide-react"/,
  )?.[1];
  if (!impor) return [];
  const nama = impor
    .split(",")
    .map((n) => n.trim())
    .filter((n) => n && !n.startsWith("type "));
  return nama.flatMap((n) =>
    [...sumber.matchAll(new RegExp(`<${n}\\b[^>]*>`, "g"))].map((m) => ({
      nama: n,
      tag: m[0],
    })),
  );
}

// Berkas yang seluruh layarnya zona suasana (DESIGN §1), relatif terhadap src/.
const berkasZonaSuasana = new Set([join("app", "pengiriman-gudang", "[id]", "rencana-final", "[idRencana]", "page.tsx")]);

const akar = join(import.meta.dirname, "..", "src");
const semuaPemakaian = berkasTsx(akar).flatMap((berkas) =>
  pemakaianIkon(readFileSync(berkas, "utf8")).map((p) => ({
    berkas: berkas.slice(akar.length + 1),
    ...p,
  })),
);

describe("ikon lucide (DESIGN §6)", () => {
  it("penjaga menemukan ikon untuk diperiksa", () => {
    expect(semuaPemakaian.map((p) => p.nama)).toEqual(
      expect.arrayContaining(["ChevronDownIcon", "CheckIcon", "Menu", "X"]),
    );
  });

  it("berkas zona suasana yang terdaftar ada dan memakai ikon", () => {
    for (const berkas of berkasZonaSuasana) {
      expect(semuaPemakaian.some((p) => p.berkas === berkas)).toBe(true);
    }
  });

  it.each(
    semuaPemakaian.map((p) => [
      `${p.berkas} <${p.nama}>`,
      p.tag,
      berkasZonaSuasana.has(p.berkas) ? "7" : "5",
    ]),
  )(
    "%s berukuran sesuai zona, stroke 2",
    (_, tag, ukuran) => {
      expect(tag).toMatch(new RegExp(`className="[^"]*\\bsize-${ukuran}\\b`));
      expect(tag).not.toMatch(new RegExp(`\\bsize-(?!${ukuran}\\b)\\d`));
      const stroke = tag.match(/strokeWidth=\{([^}]*)\}/)?.[1];
      if (stroke !== undefined) expect(stroke).toBe("2");
    },
  );
});
