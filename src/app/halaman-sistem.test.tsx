// @vitest-environment jsdom
import { readdirSync } from "node:fs";
import { join } from "node:path";

import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import HalamanError from "./error";
import Memuat from "./loading";
import HalamanTidakDitemukan from "./not-found";

// T120 (DESIGN §11.7, ADR-0010): halaman tidak ditemukan, error, dan memuat berbahasa Indonesia, bertema terang di
// dalam kerangka aplikasi (sidebar di layout tetap tampil).

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("halaman tidak ditemukan", () => {
  const html = renderToStaticMarkup(<HalamanTidakDitemukan />);

  it("judul Indonesia, satu kalimat penjelasan, dan tautan ke Beranda", () => {
    expect(html).toContain("<h1");
    expect(html).toContain("Halaman tidak ditemukan</h1>");
    expect(html).toContain("tidak tersedia untuk akun Anda");
    expect(html).toMatch(/<a[^>]*href="\/"[^>]*>.*Kembali ke Beranda<\/a>/);
  });

  it("bertema terang: memakai token tema aplikasi, tanpa kelas mode gelap", () => {
    expect(html).not.toMatch(/\bdark:/);
    expect(html).toContain("bg-primary");
  });

  it("satu-satunya halaman tidak ditemukan: tidak ada not-found lain yang menggantikannya untuk notFound()", () => {
    const akarApp = join(process.cwd(), "src", "app");
    const berkas = readdirSync(akarApp, { recursive: true, encoding: "utf8" }).filter((p) =>
      /(^|[/\\])not-found\.(tsx|ts|jsx|js)$/.test(p),
    );
    expect(berkas).toEqual(["not-found.tsx"]);
  });
});

describe("halaman error", () => {
  it("judul Indonesia, penjelasan, tautan ke Beranda, dan tombol Coba lagi yang memuat ulang bagian itu", () => {
    const retry = vi.fn();
    const wadah = document.createElement("div");
    document.body.append(wadah);
    const akar = createRoot(wadah);
    act(() => akar.render(<HalamanError error={new Error("gagal di server component")} retry={retry} />));

    expect(wadah.querySelector("h1")?.textContent).toBe("Terjadi kesalahan");
    expect(wadah.textContent).toContain("Halaman ini gagal dimuat.");
    // Pesan error teknis tidak ditampilkan ke pengguna.
    expect(wadah.textContent).not.toContain("gagal di server component");
    expect(wadah.querySelector('a[href="/"]')?.textContent).toBe("Kembali ke Beranda");
    expect(wadah.innerHTML).not.toMatch(/\bdark:/);

    const tombol = [...wadah.querySelectorAll("button")].find((b) => b.textContent === "Coba lagi");
    expect(tombol).toBeDefined();
    act(() => tombol!.click());
    expect(retry).toHaveBeenCalledTimes(1);

    act(() => akar.unmount());
    wadah.remove();
  });
});

describe("kerangka memuat", () => {
  it("status memuat berbahasa Indonesia dengan blok kerangka bertoken, tanpa gerak jika reduced-motion", () => {
    const html = renderToStaticMarkup(<Memuat />);
    expect(html).toContain('role="status"');
    expect(html).toContain("Memuat halaman…");
    expect(html).toContain("bg-muted");
    expect(html).toContain("motion-safe:animate-pulse");
    expect(html).not.toMatch(/\bdark:/);
  });
});
