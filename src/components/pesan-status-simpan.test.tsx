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
    ["belumDisimpan", "Ada perubahan yang belum disimpan", "text-muted-foreground"],
    ["menyimpan", "Sedang menyimpan", "text-info"],
    ["berhasil", "Berhasil disimpan", "text-success"],
    ["gagal", "Gagal", "text-destructive"],
    ["tersimpanGagalMuatUlang", "Perubahan tersimpan. Muat ulang halaman untuk melihatnya.", "text-warning"],
  ] as const)("%s menampilkan ikon + teks \"%s\"", (keadaan, teks, warna) => {
    const html = renderToStaticMarkup(<PesanStatusSimpan keadaan={keadaan} />);
    expect(html).toContain(`<span>${teks}</span>`);
    // DESIGN §7: token menentukan warna ikon, bukan warna teks; teks memakai foreground.
    const kelasSvg = html.match(/<svg[^>]*class="([^"]*)"/)?.[1].split(/\s+/) ?? [];
    const kelasP = html.match(/^<p[^>]*class="([^"]*)"/)?.[1].split(/\s+/) ?? [];
    expect(kelasSvg).toContain(warna);
    // DESIGN §6: ikon 20 px di zona kerja.
    expect(kelasSvg).toContain("size-5");
    expect(kelasP).toContain("text-foreground");
    expect(kelasP).not.toContain(warna);
  });

  it("ikon DESIGN §7 untuk keadaan yang tercantum di tabel", () => {
    expect(renderToStaticMarkup(<PesanStatusSimpan keadaan="belumDisimpan" />)).toContain("lucide-pencil-line");
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
