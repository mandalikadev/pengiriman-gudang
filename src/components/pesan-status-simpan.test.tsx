import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PesanStatusSimpan, semuaKeadaanSimpan } from "./pesan-status-simpan";

describe("PesanStatusSimpan (CODING_STANDARDS: lima keadaan simpan)", () => {
  it("punya tepat lima keadaan", () => {
    expect(semuaKeadaanSimpan).toEqual([
      "belumDisimpan",
      "menyimpan",
      "berhasil",
      "gagal",
      "tersimpanGagalMuatUlang",
    ]);
  });

  it.each([
    ["belumDisimpan", "Belum disimpan", "text-muted-foreground"],
    ["menyimpan", "Sedang menyimpan", "text-info"],
    ["berhasil", "Berhasil disimpan", "text-success"],
    ["gagal", "Gagal", "text-destructive"],
    ["tersimpanGagalMuatUlang", "Perubahan tersimpan. Muat ulang halaman untuk melihatnya.", "text-warning"],
  ] as const)("%s menampilkan ikon + teks \"%s\"", (keadaan, teks, warna) => {
    const html = renderToStaticMarkup(<PesanStatusSimpan keadaan={keadaan} />);
    expect(html).toContain(`<span>${teks}</span>`);
    expect(html).toContain("<svg");
    expect(html).toContain(warna);
  });

  it("ikon DESIGN §7 untuk keadaan yang tercantum di tabel", () => {
    expect(renderToStaticMarkup(<PesanStatusSimpan keadaan="menyimpan" />)).toContain("lucide-loader-circle");
    expect(renderToStaticMarkup(<PesanStatusSimpan keadaan="berhasil" />)).toContain("lucide-circle-check");
    expect(renderToStaticMarkup(<PesanStatusSimpan keadaan="gagal" />)).toContain("lucide-circle-x");
    expect(renderToStaticMarkup(<PesanStatusSimpan keadaan="tersimpanGagalMuatUlang" />)).toContain(
      "lucide-refresh-ccw",
    );
  });

  it("gagal diumumkan sebagai alert dan menampilkan keterangan", () => {
    const html = renderToStaticMarkup(<PesanStatusSimpan keadaan="gagal" pesan="Koneksi terputus." />);
    expect(html).toContain('role="alert"');
    expect(html).toContain("Koneksi terputus.");
  });

  it("keadaan lain diumumkan sebagai status", () => {
    expect(renderToStaticMarkup(<PesanStatusSimpan keadaan="berhasil" />)).toContain('role="status"');
  });
});
