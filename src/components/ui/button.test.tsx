import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Button, tautanTombolVariants } from "./button";

// DESIGN §6 ▶ Revisi (2026-10-13 sore) dan §9: tombol `default` setinggi 44 px (h-11); `sm` h-9 hanya di tabel dan
// baris filter. DESIGN §11.8: satu gaya tautan-tombol bersama.

function kelas(html: string): string[] {
  return (html.match(/class="([^"]*)"/)?.[1] ?? "").split(/\s+/);
}

describe("Button (DESIGN §6 ▶ Revisi)", () => {
  it("ukuran default setinggi 44 px (h-11)", () => {
    const k = kelas(renderToStaticMarkup(<Button>Simpan</Button>));
    expect(k).toContain("h-11");
    expect(k).not.toContain("h-10");
  });

  it("ukuran sm tetap h-9 (tabel dan baris filter)", () => {
    expect(kelas(renderToStaticMarkup(<Button size="sm">Cari</Button>))).toContain("h-9");
  });
});

describe("tautanTombolVariants (DESIGN §11.8)", () => {
  it("bawaan: target sentuh 44 px, pil, cincin fokus terlihat, nada primary", () => {
    const k = tautanTombolVariants().split(/\s+/);
    expect(k).toEqual(
      expect.arrayContaining(["inline-flex", "min-h-11", "rounded-full", "px-4", "font-semibold", "focus-visible:ring-2", "focus-visible:ring-ring", "text-primary", "hover:bg-primary/10"]),
    );
  });

  it("chip terpilih memakai bg-accent text-accent-foreground", () => {
    const k = tautanTombolVariants({ nada: "terpilih" }).split(/\s+/);
    expect(k).toEqual(expect.arrayContaining(["bg-accent", "text-accent-foreground"]));
    expect(k).not.toContain("text-primary");
  });

  it("di baris terpilih (latar accent) memakai accent-foreground", () => {
    const k = tautanTombolVariants({ nada: "barisTerpilih" }).split(/\s+/);
    expect(k).toEqual(expect.arrayContaining(["text-accent-foreground", "hover:bg-accent-foreground/10"]));
  });

  it("garis bawah dan ukuran ringkas (baris tabel ringkas) bisa dipilih", () => {
    const k = tautanTombolVariants({ garisBawah: true, ukuran: "ringkas" }).split(/\s+/);
    expect(k).toEqual(expect.arrayContaining(["underline", "underline-offset-4", "min-h-9"]));
    expect(k).not.toContain("min-h-11");
  });
});
