import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { HasilSalinJadwal } from "./hasil-salin-jadwal";

const namaToko = new Map([
  [1, "Toko Kuta"],
  [2, "Toko Ubud"],
  [3, "Toko Sanur"],
  [4, "Toko Seminyak"],
]);

const baris = (html: string, idToko: number) =>
  new RegExp(`<tr[^>]*data-hasil-salin-toko="${idToko}".*?</tr>`).exec(html)?.[0] ?? "";

describe("HasilSalinJadwal", () => {
  it("menampilkan hasil per toko dengan ikon + teks (DESIGN §7) beserta keterangan", () => {
    const html = renderToStaticMarkup(
      <HasilSalinJadwal
        jalur="usulan"
        namaToko={namaToko}
        hasil={[
          { idToko: 1, status: "berhasil" },
          { idToko: 2, status: "ditolak", pesan: "Pola dua mingguan wajib memiliki tanggal jangkar." },
          {
            idToko: 3,
            status: "usulanMenunggu",
            pesan: "Toko ini masih punya usulan jadwal yang menunggu persetujuan admin.",
          },
          { idToko: 4, status: "belumPasti", pesan: "Hasil belum pasti karena terjadi gangguan saat menyimpan toko ini." },
        ]}
      />,
    );

    expect(html).toContain("1 dari 4 toko berhasil.");
    expect(html).toContain("lucide-triangle-alert");

    const berhasil = baris(html, 1);
    expect(berhasil).toContain("Toko Kuta");
    expect(berhasil).toContain('data-hasil-salin="berhasil"');
    expect(berhasil).toContain("lucide-circle-check");
    expect(berhasil).toContain("Berhasil");
    expect(berhasil).toContain("Usulan dibuat dan menunggu persetujuan admin.");

    const ditolak = baris(html, 2);
    expect(ditolak).toContain("Toko Ubud");
    expect(ditolak).toContain("lucide-circle-x");
    expect(ditolak).toContain("Ditolak");
    expect(ditolak).toContain("Pola dua mingguan wajib memiliki tanggal jangkar.");

    const tertahan = baris(html, 3);
    expect(tertahan).toContain("lucide-clipboard-list");
    expect(tertahan).toContain("Sudah ada usulan menunggu");
    expect(tertahan).toContain("Toko ini masih punya usulan jadwal yang menunggu persetujuan admin.");

    const belumPasti = baris(html, 4);
    expect(belumPasti).toContain("lucide-triangle-alert");
    expect(belumPasti).toContain("Belum pasti");
  });

  it("di Pusat semua berhasil → ringkasan berhasil dan keterangan jadwal aktif", () => {
    const html = renderToStaticMarkup(
      <HasilSalinJadwal
        jalur="langsung"
        namaToko={namaToko}
        hasil={[
          { idToko: 1, status: "berhasil" },
          { idToko: 2, status: "berhasil" },
        ]}
      />,
    );
    expect(html).toContain("2 dari 2 toko berhasil.");
    expect(html).not.toContain("lucide-triangle-alert");
    expect(baris(html, 2)).toContain("Jadwal aktif toko sesuai pengaturan ini.");
  });
});
