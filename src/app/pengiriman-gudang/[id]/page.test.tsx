import { eq } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { buatPenggunaUji, kepalaPenggunaUji } from "@/server/auth/uji-bantu";
import { db } from "@/server/db";
import { hubunganTokoGudang, jadwalToko, periodeSumberGudang, toko } from "@/server/db/schema";
import { tugaskanOperator } from "@/server/gudang/penugasan";
import { bacaPeriodeSumber, tetapkanPeriodeSumber } from "@/server/gudang/periode-sumber";
import { buatTokoUji, idGudangUji } from "@/server/gudang/uji-bantu";
import { siapkanBulanTersediaUji } from "@/server/laporan/uji-bantu";

const kepala = vi.hoisted(() => ({ cookie: "" }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(kepala.cookie ? { cookie: kepala.cookie } : {}),
}));

import HalamanRingkasan from "../../ringkasan/page";
import HalamanPengirimanGudang from "./page";

let jabodetabek: number;
let cibubur: number;

beforeAll(async () => {
  jabodetabek = await idGudangUji("Gudang Jabodetabek");
  cibubur = await idGudangUji("Gudang Cibubur");
});

beforeEach(() => {
  kepala.cookie = "";
});

const buka = async (id: number | string) =>
  renderToStaticMarkup(await HalamanPengirimanGudang({ params: Promise.resolve({ id: String(id) }) }));

const ditolak = (id: number | string) =>
  expect(HalamanPengirimanGudang({ params: Promise.resolve({ id: String(id) }) })).rejects.toMatchObject({
    digest: expect.stringContaining("404"),
  });

describe("/pengiriman-gudang/[id]", () => {
  it("belum masuk → diarahkan ke halaman masuk", async () => {
    await expect(HalamanPengirimanGudang({ params: Promise.resolve({ id: String(cibubur) }) })).rejects.toMatchObject({
      digest: expect.stringContaining("/masuk"),
    });
  });

  it("operator tanpa hak tindakan di gudang X bisa membuka X (hanya-baca, daftar toko terhubung) dan ditolak di Y", async () => {
    const aktif = await buatTokoUji();
    const nonaktif = await buatTokoUji();
    await db.insert(hubunganTokoGudang).values([
      { tokoId: aktif.id, gudangId: jabodetabek },
      { tokoId: nonaktif.id, gudangId: jabodetabek },
    ]);
    await db.update(toko).set({ aktif: false }).where(eq(toko.id, nonaktif.id));
    const lain = await buatTokoUji();
    await db.insert(hubunganTokoGudang).values({ tokoId: lain.id, gudangId: cibubur });

    const operator = await kepalaPenggunaUji("viewer");
    await tugaskanOperator({ idPengguna: operator.id, idGudang: jabodetabek, hakTindakan: [] });
    kepala.cookie = operator.cookie;

    const html = await buka(jabodetabek);
    expect(html).toContain("Pengiriman Gudang — Gudang Jabodetabek");
    expect(html).toContain("data-hanya-baca");
    expect(html).toContain("Hanya-baca: Anda bisa melihat halaman ini, tetapi tidak punya hak tindakan di gudang ini.");
    expect(html).toMatch(new RegExp(`data-id-toko="${aktif.id}".*?${aktif.nama}.*?data-status="aktif"`));
    expect(html).toMatch(new RegExp(`data-id-toko="${nonaktif.id}".*?${nonaktif.nama}.*?Nonaktif`));
    expect(html).not.toContain(lain.nama);
    // Tanpa kontrol ubah.
    expect(html).not.toMatch(/<(button|input|select|form)\b/);
    // Zona kerja: judul halaman text-2xl md:text-3xl, tanpa blob.
    expect(html).toContain("text-2xl font-bold md:text-3xl");
    expect(html).not.toContain("blur-3xl");

    await ditolak(cibubur);
  });

  it("operator dengan hak tindakan tidak mendapat keterangan hanya-baca", async () => {
    const operator = await kepalaPenggunaUji("viewer");
    await tugaskanOperator({ idPengguna: operator.id, idGudang: cibubur, hakTindakan: ["hitung-kebutuhan"] });
    kepala.cookie = operator.cookie;

    const html = await buka(cibubur);
    expect(html).toContain("Pengiriman Gudang — Gudang Cibubur");
    expect(html).not.toContain("data-hanya-baca");
  });

  it("admin tanpa penugasan bisa membuka semua gudang hanya-baca", async () => {
    kepala.cookie = (await kepalaPenggunaUji("admin")).cookie;
    for (const nama of ["Pusat", "Gudang Bali", "Gudang Bandung", "Gudang Cibubur", "Gudang Jabodetabek"]) {
      const html = await buka(await idGudangUji(nama));
      expect(html).toContain(`Pengiriman Gudang — ${nama}`);
      expect(html).toContain("data-hanya-baca");
      expect(html).not.toMatch(/<(button|input|select|form)\b/);
    }
  });

  it("viewer tanpa penugasan ditolak", async () => {
    kepala.cookie = (await kepalaPenggunaUji("viewer")).cookie;
    await ditolak(cibubur);
  });

  it("id gudang tidak dikenal → 404", async () => {
    kepala.cookie = (await kepalaPenggunaUji("admin")).cookie;
    await ditolak("bukan-angka");
    await ditolak(999_999);
  });
});

describe("/pengiriman-gudang/[id]: kartu Periode sumber", () => {
  let pusat: number;
  /** Bulan laporan yang tersedia di data: Februari, April, Juli, Oktober (tahun uji). */
  let [februari, april, juli, oktober] = ["", "", "", ""];

  beforeAll(async () => {
    pusat = await idGudangUji("Pusat");
    const admin = await buatPenggunaUji("admin");
    [februari, april, juli, oktober] = await siapkanBulanTersediaUji(admin.id, [2, 4, 7, 10]);
  }, 60_000);

  it("belum ditetapkan → pesan \"Periode sumber belum ditetapkan admin\" tanpa periode cadangan", async () => {
    await db.delete(periodeSumberGudang).where(eq(periodeSumberGudang.gudangId, pusat));
    const operator = await kepalaPenggunaUji("viewer");
    await tugaskanOperator({ idPengguna: operator.id, idGudang: pusat, hakTindakan: ["hitung-kebutuhan"] });
    kepala.cookie = operator.cookie;

    const html = await buka(pusat);
    expect(html).toMatch(/data-periode-sumber.*Periode sumber penjualan.*data-status="periodeBelumDitetapkan".*Periode sumber belum ditetapkan admin/);
    expect(html).not.toContain("data-bulan=");
    expect(html).not.toContain("Ditetapkan oleh");
  });

  it("menampilkan bulan, siapa, dan kapan hanya-baca; mengubah filter Ringkasan tidak mengubah periode sumber gudang", async () => {
    const admin = await buatPenggunaUji("admin");
    await tetapkanPeriodeSumber({ idGudang: jabodetabek, bulan: [oktober, februari], idPengguna: admin.id });
    const sebelum = await bacaPeriodeSumber(jabodetabek);

    // Operator (dengan hak tindakan) mengubah pilihan bulan dan filter di Ringkasan.
    const operator = await kepalaPenggunaUji("viewer");
    await tugaskanOperator({ idPengguna: operator.id, idGudang: jabodetabek, hakTindakan: ["hitung-kebutuhan"] });
    kepala.cookie = operator.cookie;
    for (const bulan of [[april], [april, juli], [februari, april, juli, oktober]]) {
      const ringkasan = renderToStaticMarkup(await HalamanRingkasan({ searchParams: Promise.resolve({ bulan }) }));
      expect(ringkasan).toContain("bulan dipilih");
    }

    expect(await bacaPeriodeSumber(jabodetabek)).toEqual(sebelum);
    const html = await buka(jabodetabek);
    const kartu = /data-periode-sumber.*?<\/ul>.*?<\/p>/.exec(html)?.[0] ?? "";
    expect([...kartu.matchAll(/data-bulan="([^"]+)"/g)].map((m) => m[1])).toEqual([februari, oktober]);
    expect(kartu).toContain(`Februari ${februari.slice(0, 4)}`);
    expect(kartu).toContain(`Oktober ${oktober.slice(0, 4)}`);
    expect(kartu).toContain("Ditetapkan oleh <span class=\"font-semibold text-foreground\">Uji admin</span> pada");
    expect(kartu).toMatch(/pada \w+, \d{2}-\d{2}-\d{4} pukul \d{2}\.\d{2} WIB/);
    // Hanya-baca: tanpa kontrol ubah di halaman.
    expect(html).not.toMatch(/<(button|input|select|form)\b/);
  });
});

describe("/pengiriman-gudang/[id]: bagian Jadwal", () => {
  let pusat: number;

  beforeAll(async () => {
    pusat = await idGudangUji("Pusat");
  });

  /** Toko Pusat dengan jadwal aktif (dan satu jadwal lama nonaktif), serta toko Pusat tanpa jadwal. */
  async function siapkanTokoPusat() {
    const pembuat = await buatPenggunaUji("viewer");
    const [berjadwal, tanpaJadwal] = [await buatTokoUji(), await buatTokoUji()];
    await db.insert(hubunganTokoGudang).values([
      { tokoId: berjadwal.id, gudangId: pusat },
      { tokoId: tanpaJadwal.id, gudangId: pusat },
    ]);
    await db.insert(jadwalToko).values([
      {
        tokoId: berjadwal.id,
        pola: "mingguan",
        hariKirim: [{ hari: "Selasa", persiapanHari: 0 }],
        status: "nonaktif",
        dibuatOleh: pembuat.id,
        dinonaktifkanOleh: pembuat.id,
        dinonaktifkanPada: new Date(),
      },
      {
        tokoId: berjadwal.id,
        pola: "dua-mingguan",
        hariKirim: [
          { hari: "Senin", persiapanHari: 2 },
          { hari: "Kamis", persiapanHari: 0 },
        ],
        tanggalJangkar: "2026-06-10",
        dibuatOleh: pembuat.id,
      },
    ]);
    return { berjadwal, tanpaJadwal };
  }

  const barisJadwal = (html: string, idToko: number) =>
    new RegExp(`<tr[^>]*data-jadwal-toko="${idToko}".*?</tr>`).exec(html)?.[0] ?? "";

  it("operator Pusat dengan kelola-usulan-jadwal melihat jadwal aktif setiap toko dan form ubah", async () => {
    const { berjadwal, tanpaJadwal } = await siapkanTokoPusat();
    const operator = await kepalaPenggunaUji("viewer");
    await tugaskanOperator({ idPengguna: operator.id, idGudang: pusat, hakTindakan: ["kelola-usulan-jadwal"] });
    kepala.cookie = operator.cookie;

    const html = await buka(pusat);
    expect(html).toMatch(/data-jadwal.*Jadwal.*Setiap toko punya paling banyak satu jadwal aktif/);

    const aktif = barisJadwal(html, berjadwal.id);
    expect(aktif).toContain(berjadwal.nama);
    expect(aktif).toContain('data-status="aktif"');
    expect(aktif).toContain("Dua mingguan");
    expect(aktif).toContain("Senin (H−2), Kamis (H)");
    expect(aktif).toContain("Rabu, 10-06-2026");
    expect(aktif).toMatch(/Uji viewer, \w+, \d{2}-\d{2}-\d{4} pukul \d{2}\.\d{2} WIB/);
    // Jadwal lama yang nonaktif tidak tampil sebagai jadwal aktif.
    expect(aktif).not.toContain("Selasa");

    const kosong = barisJadwal(html, tanpaJadwal.id);
    expect(kosong).toContain('data-status="belumAdaJadwal"');
    expect(kosong).toContain("Belum ada jadwal");
    expect(kosong).toContain("lucide-circle-dashed");

    expect(html).toContain("Atur jadwal toko");
    expect(html).toMatch(/<form\b/);
    expect(html).toContain("Simpan jadwal");
  });

  it("operator Pusat tanpa kelola-usulan-jadwal melihat jadwal hanya-baca", async () => {
    const { berjadwal } = await siapkanTokoPusat();
    const operator = await kepalaPenggunaUji("viewer");
    await tugaskanOperator({ idPengguna: operator.id, idGudang: pusat, hakTindakan: ["input-stok", "hitung-kebutuhan"] });
    kepala.cookie = operator.cookie;

    const html = await buka(pusat);
    expect(barisJadwal(html, berjadwal.id)).toContain("Senin (H−2), Kamis (H)");
    expect(html).not.toContain("Atur jadwal toko");
    expect(html).not.toMatch(/<(button|input|select|form)\b/);
  });

  it("admin tanpa penugasan melihat jadwal Pusat hanya-baca", async () => {
    const { berjadwal } = await siapkanTokoPusat();
    kepala.cookie = (await kepalaPenggunaUji("admin")).cookie;

    const html = await buka(pusat);
    expect(barisJadwal(html, berjadwal.id)).toContain("Dua mingguan");
    expect(html).not.toMatch(/<(button|input|select|form)\b/);
  });

  it("gudang selain Pusat: operator dengan kelola-usulan-jadwal belum mendapat form ubah", async () => {
    const t = await buatTokoUji();
    await db.insert(hubunganTokoGudang).values({ tokoId: t.id, gudangId: cibubur });
    const operator = await kepalaPenggunaUji("viewer");
    await tugaskanOperator({ idPengguna: operator.id, idGudang: cibubur, hakTindakan: ["kelola-usulan-jadwal"] });
    kepala.cookie = operator.cookie;

    const html = await buka(cibubur);
    expect(barisJadwal(html, t.id)).toContain("Belum ada jadwal");
    expect(html).not.toContain("Atur jadwal toko");
    expect(html).not.toMatch(/<(button|input|select|form)\b/);
  });
});
