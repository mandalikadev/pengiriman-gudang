import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./table";

// DESIGN §4 ▶ Revisi dan §11.1: tabel panjang dalam wadah bertinggi terbatas (kira-kira tinggi layar dikurangi
// kepala halaman, minimal 20rem) yang menggulir vertikal dan horizontal; header menempel berlatar bg-muted;
// kolom identitas menempel di kiri berlatar card (baris terpilih accent).

function render(props: Parameters<typeof Table>[0] = {}): { wadah: string[]; tabel: string[] } {
  const html = renderToStaticMarkup(
    <Table aria-label="Contoh" {...props}>
      <TableHeader>
        <TableRow>
          <TableHead>Kode produk</TableHead>
          <TableHead>Nama produk</TableHead>
          <TableHead angka>Jumlah</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell>A</TableCell>
          <TableCell>B</TableCell>
          <TableCell angka>1</TableCell>
        </TableRow>
      </TableBody>
    </Table>,
  );
  const kelas = (tag: string) =>
    (html.match(new RegExp(`<${tag}[^>]*class="([^"]*)"`))?.[1] ?? "").replaceAll("&amp;", "&").replaceAll("&gt;", ">").split(/\s+/);
  return { wadah: kelas("div"), tabel: kelas("table") };
}

const kelasLama = {
  wadah: ["relative", "w-full", "overflow-x-auto", "rounded-2xl", "border", "border-border/60", "bg-card"],
  tabel: ["w-full", "caption-bottom", "text-sm"],
};

describe("Table (DESIGN §4, §11.1)", () => {
  it("tanpa opsi: wadah menggulir horizontal saja, tanpa tinggi terbatas dan tanpa sel menempel", () => {
    const { wadah, tabel } = render();
    expect(wadah).toEqual(expect.arrayContaining(kelasLama.wadah));
    expect(wadah.some((k) => k.startsWith("max-h-"))).toBe(false);
    expect(wadah).not.toContain("overflow-auto");
    expect(tabel).toEqual(kelasLama.tabel);
  });

  it("tabel di dalam kartu tidak memakai bingkai kedua", () => {
    expect(render().wadah).toContain("in-[[data-slot=card]]:border-0");
  });

  it("panjang: wadah bertinggi terbatas (tinggi layar dikurangi kepala halaman, minimal 20rem) dan menggulir dua arah", () => {
    const { wadah } = render({ panjang: true });
    expect(wadah).toContain("overflow-auto");
    expect(wadah).not.toContain("overflow-x-auto");
    expect(wadah).toContain("max-h-[max(20rem,calc(100dvh-10rem))]");
    expect(wadah).toEqual(expect.arrayContaining(["rounded-2xl", "border", "bg-card"]));
  });

  it("panjang: th menempel di atas berlatar bg-muted", () => {
    const { tabel } = render({ panjang: true });
    expect(tabel).toEqual(expect.arrayContaining(["[&_thead_th]:sticky", "[&_thead_th]:top-0", "[&_thead_th]:z-20", "[&_thead_th]:bg-muted"]));
    expect(tabel.some((k) => k.includes(":left-"))).toBe(false);
  });

  it("kolomMenempel 1: kolom pertama menempel di kiri berlatar card, baris terpilih accent", () => {
    const { tabel } = render({ panjang: true, kolomMenempel: 1 });
    expect(tabel).toEqual(
      expect.arrayContaining([
        "[&_tr>:nth-child(1):not([colspan])]:sticky",
        "[&_tr>:nth-child(1):not([colspan])]:left-0",
        "[&_tr>td:nth-child(1):not([colspan])]:bg-card",
        "[&_tr[data-state=selected]>td:nth-child(1):not([colspan])]:bg-accent",
        "[&_tr>th:nth-child(1)]:bg-muted",
        "[&_tr>th:nth-child(1)]:z-30",
      ]),
    );
    expect(tabel.some((k) => k.startsWith("[&_tr>:nth-child(2)"))).toBe(false);
  });

  it("kolomMenempel 2: kolom pertama berlebar tetap, kolom kedua menempel tepat di sebelahnya", () => {
    const { tabel } = render({ panjang: true, kolomMenempel: 2 });
    expect(tabel).toEqual(
      expect.arrayContaining([
        "[&_tr>:nth-child(1):not([colspan])]:sticky",
        "[&_tr>:nth-child(1):not([colspan])]:w-40",
        "[&_tr>:nth-child(1):not([colspan])]:min-w-40",
        "[&_tr>:nth-child(1):not([colspan])]:max-w-40",
        "[&_tr>:nth-child(2):not([colspan])]:sticky",
        "[&_tr>:nth-child(2):not([colspan])]:left-40",
        "[&_tr>td:nth-child(2):not([colspan])]:bg-card",
        "[&_tr[data-state=selected]>td:nth-child(2):not([colspan])]:bg-accent",
        "[&_tr>th:nth-child(2)]:z-30",
      ]),
    );
  });
});
