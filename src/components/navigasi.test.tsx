import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

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
});

describe("Navigasi untuk admin", () => {
  it("menambahkan tautan Pengguna hanya jika diminta (admin)", () => {
    const html = renderToStaticMarkup(<Navigasi tampilkanPengguna />);
    const tautan = [...html.matchAll(/<a [^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/g)].map((m) => [m[1], m[2]]);
    expect(tautan).toEqual([
      ["/", "Beranda"],
      ["/admin/pengguna", "Pengguna"],
      ["/", "Beranda"],
      ["/admin/pengguna", "Pengguna"],
    ]);
  });
});
