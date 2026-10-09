import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
vi.mock("@/app/keluar/aksi", () => ({ keluar: async () => undefined }));

const { Navigasi } = await import("./navigasi");

describe("Navigasi", () => {
  const html = renderToStaticMarkup(<Navigasi />);

  it("hanya berisi tautan Beranda (desktop dan menu tarik)", () => {
    const tautan = [...html.matchAll(/<a [^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/g)].map((m) => [m[1], m[2]]);
    expect(tautan).toEqual([
      ["/", "Beranda"],
      ["/", "Beranda"],
    ]);
  });

  it("tautan dan tombol menu punya fokus yang terlihat", () => {
    const elemen = [...html.matchAll(/<(a|button) [^>]*class="([^"]*)"/g)];
    expect(elemen.length).toBe(3);
    for (const [, , kelas] of elemen) {
      expect(kelas).toContain("focus-visible:ring-2");
      expect(kelas).toContain("focus-visible:ring-ring");
    }
  });

  it("tombol menu tarik bisa dipakai keyboard dan memberi tahu keadaannya", () => {
    expect(html).toMatch(/<button type="button"[^>]*aria-expanded="false"[^>]*aria-controls="[^"]+"/);
    expect(html).toContain('aria-label="Buka menu"');
  });

  it("logo dan wordmark memakai font dasar Nunito, bukan Fraunces (DESIGN §3)", () => {
    expect(html).toContain(">MANDALIKA</span>");
    expect(html).not.toContain("font-heading");
  });

  it("halaman aktif ditandai aria-current", () => {
    expect(html).toContain('aria-current="page"');
  });

  it("tanpa pengguna yang masuk: tidak ada tombol Keluar", () => {
    expect(html).not.toContain("Keluar");
  });
});

describe("Navigasi untuk pengguna yang sudah masuk", () => {
  const html = renderToStaticMarkup(<Navigasi sudahMasuk />);
  const tombolKeluar = [...html.matchAll(/<button type="submit"[^>]*class="([^"]*)"[^>]*>(.*?)<\/button>/g)];

  it("tombol Keluar tampil di bar desktop dan di menu tarik, masing-masing di dalam form", () => {
    expect(tombolKeluar).toHaveLength(2);
    for (const [, , isi] of tombolKeluar) expect(isi).toContain("Keluar");
    expect([...html.matchAll(/<form[^>]*>\s*<button type="submit"/g)]).toHaveLength(2);
  });

  it("tombol Keluar punya fokus yang terlihat dan tinggi sentuh yang sama dengan item navigasi", () => {
    for (const [, kelas] of tombolKeluar) {
      expect(kelas).toContain("focus-visible:ring-2");
      expect(kelas).toContain("focus-visible:ring-ring");
      expect(kelas).toContain("min-h-11");
    }
  });

  it("ikon tombol Keluar 20 px, stroke 2, disembunyikan dari pembaca layar (DESIGN §6)", () => {
    for (const [, , isi] of tombolKeluar) {
      expect(isi).toMatch(/<svg[^>]*stroke-width="2"[^>]*aria-hidden="true"|<svg[^>]*aria-hidden="true"[^>]*stroke-width="2"/);
      expect(isi).toContain("size-5");
    }
  });

  it("tidak mengubah tautan navigasi", () => {
    const tautan = [...html.matchAll(/<a [^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/g)].map((m) => m[1]);
    expect(tautan).toEqual(["/", "/"]);
  });
});

describe("Navigasi untuk admin", () => {
  it("menambahkan tautan Pengguna, Gudang, Penugasan, dan Impor hanya jika diminta (admin)", () => {
    const html = renderToStaticMarkup(<Navigasi tampilkanAdmin />);
    const tautan = [...html.matchAll(/<a [^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/g)].map((m) => [m[1], m[2]]);
    expect(tautan).toEqual([
      ["/", "Beranda"],
      ["/admin/pengguna", "Pengguna"],
      ["/admin/gudang", "Gudang"],
      ["/admin/penugasan", "Penugasan"],
      ["/admin/impor", "Impor"],
      ["/", "Beranda"],
      ["/admin/pengguna", "Pengguna"],
      ["/admin/gudang", "Gudang"],
      ["/admin/penugasan", "Penugasan"],
      ["/admin/impor", "Impor"],
    ]);
  });
});
