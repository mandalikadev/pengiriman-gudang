import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { buatPenggunaUji, kepalaPenggunaUji } from "@/server/auth/uji-bantu";
import { db } from "@/server/db";
import { hubunganTokoGudang, jadwalToko } from "@/server/db/schema";
import { tugaskanOperator } from "@/server/gudang/penugasan";
import { buatTokoUji, idGudangUji } from "@/server/gudang/uji-bantu";
import { usulkanJadwalToko, usulkanNonaktifJadwalToko } from "@/server/gudang/usulan-jadwal";

const kepala = vi.hoisted(() => ({ cookie: "" }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(kepala.cookie ? { cookie: kepala.cookie } : {}),
}));

import HalamanPersetujuanJadwal from "./page";

let bandung: number;

beforeAll(async () => {
  bandung = await idGudangUji("Gudang Bandung");
});

beforeEach(() => {
  kepala.cookie = "";
});

const buka = async () => renderToStaticMarkup(await HalamanPersetujuanJadwal());
const kartu = (html: string, toko: string) => new RegExp(`<li data-usulan="\\d+">(?:(?!</li>).)*?${toko}.*?</li>`).exec(html)?.[0] ?? "";
const baris = (html: string, bagian: string) => new RegExp(`<tr[^>]*data-bagian="${bagian}".*?</tr>`).exec(html)?.[0] ?? "";

describe("/admin/jadwal", () => {
  it("belum masuk → diarahkan ke halaman masuk", async () => {
    await expect(HalamanPersetujuanJadwal()).rejects.toMatchObject({ digest: expect.stringContaining("/masuk") });
  });

  it("viewer dan operator berhak → 404", async () => {
    kepala.cookie = (await kepalaPenggunaUji("viewer")).cookie;
    await expect(HalamanPersetujuanJadwal()).rejects.toMatchObject({ digest: expect.stringContaining("404") });

    const operator = await kepalaPenggunaUji("viewer");
    await tugaskanOperator({ idPengguna: operator.id, idGudang: bandung, hakTindakan: ["kelola-usulan-jadwal"] });
    kepala.cookie = operator.cookie;
    await expect(HalamanPersetujuanJadwal()).rejects.toMatchObject({ digest: expect.stringContaining("404") });
  });

  it("admin melihat usulan menunggu beserta rincian beda dengan jadwal aktif, dan tombol Setujui/Tolak", async () => {
    const pengusul = await buatPenggunaUji("viewer");
    const [berjadwal, baru] = [await buatTokoUji(), await buatTokoUji()];
    await db.insert(hubunganTokoGudang).values([
      { tokoId: berjadwal.id, gudangId: bandung },
      { tokoId: baru.id, gudangId: bandung },
    ]);
    await db.insert(jadwalToko).values({
      tokoId: berjadwal.id,
      pola: "mingguan",
      hariKirim: [{ hari: "Senin", persiapanHari: 2 }],
      dibuatOleh: pengusul.id,
    });
    await usulkanJadwalToko({
      idGudang: bandung,
      idToko: berjadwal.id,
      masukan: { pola: "dua-mingguan", hariKirim: [{ hari: "Senin", persiapan: "H-2" }], tanggalJangkar: "2026-06-10" },
      idPengguna: pengusul.id,
    });
    await usulkanJadwalToko({
      idGudang: bandung,
      idToko: baru.id,
      masukan: { pola: "mingguan", hariKirim: [{ hari: "Rabu", persiapan: "H" }], tanggalJangkar: null },
      idPengguna: pengusul.id,
    });

    kepala.cookie = (await kepalaPenggunaUji("admin")).cookie;
    const html = await buka();
    // Zona kerja: judul halaman text-2xl md:text-3xl, tanpa blob.
    expect(html).toContain('<h1 class="text-2xl font-bold md:text-3xl">Persetujuan jadwal</h1>');
    expect(html).not.toContain("blur-3xl");

    const ubah = kartu(html, berjadwal.nama);
    expect(ubah).toContain("Gudang Bandung");
    expect(ubah).toContain('data-status-usulan="menunggu"');
    expect(ubah).toContain("Menunggu persetujuan");
    expect(ubah).toContain("lucide-clipboard-list");
    expect(ubah).toContain("Ubah jadwal");
    expect(ubah).toMatch(/Diusulkan Uji viewer, \w+, \d{2}-\d{2}-\d{4} pukul \d{2}\.\d{2} WIB/);
    expect(baris(ubah, "Pola")).toMatch(/Mingguan.*Dua mingguan.*Berubah/);
    expect(baris(ubah, "Hari kirim \\(persiapan\\)")).toMatch(/Senin \(H−2\).*Senin \(H−2\).*Sama/);
    expect(baris(ubah, "Tanggal jangkar")).toMatch(/—.*Rabu, 10-06-2026.*Berubah/);
    expect(ubah).toContain("Setujui");
    expect(ubah).toContain("Alasan penolakan");
    expect(ubah).toContain("Tolak");

    const buat = kartu(html, baru.nama);
    expect(buat).toContain("Buat jadwal");
    expect(buat).toContain("Toko ini belum punya jadwal aktif.");
    expect(baris(buat, "Pola")).toMatch(/—.*Mingguan.*Berubah/);
  });

  it("usulan nonaktifkan: kolom usulan tanpa jadwal", async () => {
    const pengusul = await buatPenggunaUji("viewer");
    const t = await buatTokoUji();
    await db.insert(hubunganTokoGudang).values({ tokoId: t.id, gudangId: bandung });
    await db.insert(jadwalToko).values({
      tokoId: t.id,
      pola: "mingguan",
      hariKirim: [{ hari: "Jumat", persiapanHari: 0 }],
      dibuatOleh: pengusul.id,
    });
    await usulkanNonaktifJadwalToko({ idGudang: bandung, idToko: t.id, idPengguna: pengusul.id });

    kepala.cookie = (await kepalaPenggunaUji("admin")).cookie;
    const isi = kartu(await buka(), t.nama);
    expect(isi).toContain("Nonaktifkan jadwal");
    expect(isi).toContain("Jika disetujui, toko ini tidak lagi punya jadwal aktif.");
    expect(baris(isi, "Hari kirim \\(persiapan\\)")).toMatch(/Jumat \(H\).*—.*Berubah/);
  });
});
