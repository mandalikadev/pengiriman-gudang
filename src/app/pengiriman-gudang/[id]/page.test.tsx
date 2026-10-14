import { eq } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { buatPenggunaUji, kepalaPenggunaUji } from "@/server/auth/uji-bantu";
import { db } from "@/server/db";
import { hubunganTokoGudang, jadwalToko, pengirimanDiLuarJadwal, periodeSumberGudang, toko } from "@/server/db/schema";
import { tugaskanOperator } from "@/server/gudang/penugasan";
import { bacaPeriodeSumber, tetapkanPeriodeSumber } from "@/server/gudang/periode-sumber";
import { buatTokoUji, idGudangUji } from "@/server/gudang/uji-bantu";
import { siapkanBulanTersediaUji } from "@/server/laporan/uji-bantu";
import { tanpaBantuanIstilah } from "@/components/uji-bantu-bantuan-istilah";

const kepala = vi.hoisted(() => ({ cookie: "" }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(kepala.cookie ? { cookie: kepala.cookie } : {}),
}));
vi.mock("next/navigation", async (asli) => ({
  ...(await asli<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
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

/**
 * Isi halaman tanpa bagian Draft rencana: kepala sebelum Draft rencana, lalu Jadwal toko dan Periode sumber sesudahnya
 * (T118, DESIGN §11.5).
 */
function sebelumBagianDraft(html: string) {
  const awal = html.indexOf("data-draft-rencana");
  const akhir = html.indexOf('aria-labelledby="jadwal-judul"');
  if (awal === -1 || akhir < awal) throw new Error("Bagian Draft rencana atau Jadwal toko tidak ditemukan di halaman.");
  return html.slice(0, awal) + html.slice(akhir);
}

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

  it("operator tanpa hak tindakan di gudang X bisa membuka X (hanya-baca, toko terhubung di tabel jadwal) dan ditolak di Y", async () => {
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
    // T118: tabel "Toko terhubung" dihapus; status toko tampil di tabel Jadwal toko.
    expect(html).toMatch(new RegExp(`data-jadwal-toko="${aktif.id}".*?${aktif.nama}.*?data-status-toko="aktif"[^>]*>.*?data-status="aktif"`));
    expect(html).toMatch(new RegExp(`data-jadwal-toko="${nonaktif.id}".*?${nonaktif.nama}.*?data-status-toko="nonaktif"[^>]*>.*?Nonaktif`));
    expect(html).not.toContain("Toko terhubung");
    expect(html).not.toContain(lain.nama);
    // Tanpa kontrol ubah.
    expect(tanpaBantuanIstilah(html)).not.toMatch(/<(button|input|select|form)\b/);
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
      expect(tanpaBantuanIstilah(html)).not.toMatch(/<(button|input|select|form)\b/);
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
    // Hanya-baca: tanpa kontrol ubah di halaman (form hitung draft untuk hak hitung-kebutuhan diuji di draft.test.tsx).
    expect(tanpaBantuanIstilah(sebelumBagianDraft(html))).not.toMatch(/<(button|input|select|form)\b/);
    // Semua bulan punya data aktif → tanpa penanda bulan hilang.
    expect(html).not.toContain("data-bulan-hilang");
    expect(html).not.toContain("Tidak ada data aktif");
  });

  it("bulan tanpa data aktif ditandai ikon + teks, terpisah dari bulan yang dipakai; siapa/kapan tetap tampil", async () => {
    const admin = await buatPenggunaUji("admin");
    // Disimpan langsung: meniru bulan yang dulu tersedia tetapi datanya kini tidak aktif.
    const tanpaData = "2990-05";
    await db.insert(periodeSumberGudang).values({ gudangId: cibubur, bulan: [tanpaData, april], ditetapkanOleh: admin.id });
    const operator = await kepalaPenggunaUji("viewer");
    await tugaskanOperator({ idPengguna: operator.id, idGudang: cibubur, hakTindakan: [] });
    kepala.cookie = operator.cookie;

    const html = await buka(cibubur);
    const kartu = /data-periode-sumber.*?Ditetapkan oleh.*?<\/p>/.exec(html)?.[0] ?? "";
    expect([...kartu.matchAll(/data-bulan="([^"]+)"/g)].map((m) => m[1])).toEqual([april]);
    expect([...kartu.matchAll(/data-bulan-hilang="([^"]+)"/g)].map((m) => m[1])).toEqual([tanpaData]);
    // Ikon + teks (DESIGN §7) pada bulan yang hilang, memakai Badge T07.
    expect(kartu).toMatch(
      /data-bulan-hilang="2990-05"[^>]*>.*?<span data-slot="badge"[^>]*>\s*<svg[^>]*lucide-triangle-alert.*?<\/svg>Mei 2990 — Tidak ada data aktif<\/span>/,
    );
    expect(kartu).toContain("Perhitungan memakai bulan yang masih punya data aktif.");
    expect(kartu).toContain("Ditetapkan oleh <span class=\"font-semibold text-foreground\">Uji admin</span> pada");
    expect(tanpaBantuanIstilah(html)).not.toMatch(/<(button|input|select|form)\b/);
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

  /** Tautan ke halaman pengiriman di luar jadwal (T113) dan halaman jadwal lama: [href, teks]. */
  const tautanJadwal = (html: string) =>
    [...html.matchAll(/<a [^>]*href="(\/(?:usulan|salin)-jadwal\/\d+)"[^>]*>(.*?)<\/a>/g)].map((m) => [
      m[1],
      m[2]!.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
    ]);

  const barisJadwal = (html: string, idToko: number) =>
    new RegExp(`<tr[^>]*data-jadwal-toko="${idToko}".*?</tr>`).exec(html)?.[0] ?? "";

  it("operator Pusat dengan kelola-usulan-jadwal melihat jadwal aktif setiap toko dan tautan ke halaman jadwal, tanpa form", async () => {
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
    // T121 (DESIGN §11.6): kolom Diatur berisi tanggal singkat; waktu lengkap lewat title saat disorot.
    expect(aktif).toMatch(/Uji viewer, <time dateTime="[^"]+" title="\w+, \d{2}-\d{2}-\d{4} pukul \d{2}\.\d{2} WIB">\w+, \d{2}-\d{2}-\d{4}<\/time>/);
    // Jadwal lama yang nonaktif (Selasa) tidak tampil sebagai jadwal aktif. Diperiksa lewat hari kirim, bukan nama hari
    // saja: kolom Diatur memuat nama hari jadwal dibuat, yang bisa Selasa.
    expect(aktif).not.toContain("Selasa (H");

    const kosong = barisJadwal(html, tanpaJadwal.id);
    expect(kosong).toContain('data-status="belumAdaJadwal"');
    expect(kosong).toContain("Belum ada jadwal");
    expect(kosong).toContain("lucide-circle-dashed");

    // T98: form pindah ke halaman sendiri; halaman ini menautkannya untuk pengguna berhak.
    expect(sebelumBagianDraft(html)).not.toMatch(/<form\b/);
    expect(html).not.toContain("data-salin-jadwal");
    expect(html).not.toContain("Simpan jadwal");
    expect(tautanJadwal(html)).toEqual([[`/usulan-jadwal/${pusat}`, "Kirim di luar jadwal"]]);
    // T112: halaman Salin jadwal operator dihapus, jadi tidak ditautkan lagi.
    expect(html).not.toContain("/salin-jadwal");
  });

  it("jadwal 1× sebulan tampil dengan label pola \"1× sebulan\" tanpa tanggal jangkar (T92)", async () => {
    const pembuat = await buatPenggunaUji("viewer");
    const t = await buatTokoUji();
    await db.insert(hubunganTokoGudang).values({ tokoId: t.id, gudangId: pusat });
    await db.insert(jadwalToko).values({ tokoId: t.id, pola: "1x-sebulan", hariKirim: [{ hari: "Selasa", persiapanHari: 1 }], dibuatOleh: pembuat.id });
    kepala.cookie = (await kepalaPenggunaUji("admin")).cookie;

    const baris = barisJadwal(await buka(pusat), t.id);
    expect(baris).toMatch(/1× sebulan<\/td><td[^>]*>Selasa \(H−1\)<\/td><td[^>]*>—<\/td>/);
  });

  it("jadwal dengan hari Minggu tampil dengan urutan hari Senin–Minggu (T106)", async () => {
    const pembuat = await buatPenggunaUji("viewer");
    const t = await buatTokoUji();
    await db.insert(hubunganTokoGudang).values({ tokoId: t.id, gudangId: pusat });
    await db.insert(jadwalToko).values({
      tokoId: t.id,
      pola: "2x-seminggu",
      hariKirim: [
        { hari: "Kamis", persiapanHari: 0 },
        { hari: "Minggu", persiapanHari: 1 },
      ],
      dibuatOleh: pembuat.id,
    });
    kepala.cookie = (await kepalaPenggunaUji("admin")).cookie;

    expect(barisJadwal(await buka(pusat), t.id)).toMatch(/2× seminggu<\/td><td[^>]*>Kamis \(H\), Minggu \(H−1\)<\/td>/);
  });

  it("operator Pusat tanpa kelola-usulan-jadwal melihat jadwal hanya-baca", async () => {
    const { berjadwal } = await siapkanTokoPusat();
    const operator = await kepalaPenggunaUji("viewer");
    await tugaskanOperator({ idPengguna: operator.id, idGudang: pusat, hakTindakan: ["input-stok", "hitung-kebutuhan"] });
    kepala.cookie = operator.cookie;

    const html = await buka(pusat);
    expect(barisJadwal(html, berjadwal.id)).toContain("Senin (H−2), Kamis (H)");
    expect(html).not.toContain("Kirim di luar jadwal");
    expect(tautanJadwal(html)).toEqual([]);
    // Form hitung draft untuk hak hitung-kebutuhan (T58) diuji di draft.test.tsx.
    expect(tanpaBantuanIstilah(sebelumBagianDraft(html))).not.toMatch(/<(button|input|select|form)\b/);
  });

  it("admin tanpa penugasan melihat jadwal Pusat hanya-baca", async () => {
    const { berjadwal } = await siapkanTokoPusat();
    kepala.cookie = (await kepalaPenggunaUji("admin")).cookie;

    const html = await buka(pusat);
    expect(barisJadwal(html, berjadwal.id)).toContain("Dua mingguan");
    expect(tanpaBantuanIstilah(html)).not.toMatch(/<(button|input|select|form)\b/);
    expect(tautanJadwal(html)).toEqual([]);
  });

  // T113 — PRD A5 ▶ Revisi 2026-10-13, Catatan aktivitas: tabel jadwal = jadwal tetap ditambah pengiriman di luar jadwal
  // yang akan datang (menunggu dan berlaku) beserta statusnya.
  it("gudang selain Pusat: tabel jadwal menampilkan pengiriman di luar jadwal yang akan datang; tautan Kirim di luar jadwal", async () => {
    const [a, b] = [await buatTokoUji(), await buatTokoUji()];
    await db.insert(hubunganTokoGudang).values([
      { tokoId: a.id, gudangId: cibubur },
      { tokoId: b.id, gudangId: cibubur },
    ]);
    const operator = await kepalaPenggunaUji("viewer");
    await tugaskanOperator({ idPengguna: operator.id, idGudang: cibubur, hakTindakan: ["kelola-usulan-jadwal"] });
    const admin = await buatPenggunaUji("admin");
    const isi = { gudangId: cibubur, tokoId: a.id, persiapanHari: 1 as const, alasan: "uji", diusulkanOleh: operator.id };
    const [menunggu, berlaku, lewat, ditolak] = await db
      .insert(pengirimanDiLuarJadwal)
      .values([
        { ...isi, jenis: "pindah", tanggalKirim: "2099-01-06", tanggalRutinDipindah: "2099-01-05" },
        { ...isi, jenis: "tambahan", tanggalKirim: "2099-01-08", status: "berlaku", diputuskanOleh: admin.id, diputuskanPada: new Date() },
        { ...isi, jenis: "tambahan", tanggalKirim: "2020-01-07", status: "berlaku", diputuskanOleh: admin.id, diputuskanPada: new Date() },
        { ...isi, jenis: "tambahan", tanggalKirim: "2099-01-09", status: "ditolak", alasanPenolakan: "x", diputuskanOleh: admin.id, diputuskanPada: new Date() },
      ])
      .returning();
    kepala.cookie = operator.cookie;

    const html = await buka(cibubur);
    expect(html).toContain("Di luar jadwal (akan datang)");
    const baris = barisJadwal(html, a.id);
    expect(baris).toContain(`data-pengiriman="${menunggu.id}"`);
    expect(baris).toContain("Selasa, 06-01-2099 (H−1) · Pindahan dari Senin, 05-01-2099");
    expect(baris).toContain('data-status-pengiriman="menunggu"');
    expect(baris).toContain(`data-pengiriman="${berlaku.id}"`);
    expect(baris).toContain("Kamis, 08-01-2099 (H−1) · Tambahan");
    expect(baris).toContain('data-status-pengiriman="berlaku"');
    expect(baris.indexOf(`data-pengiriman="${menunggu.id}"`)).toBeLessThan(baris.indexOf(`data-pengiriman="${berlaku.id}"`));
    expect(baris).not.toContain(`data-pengiriman="${lewat.id}"`);
    expect(baris).not.toContain(`data-pengiriman="${ditolak.id}"`);
    expect(barisJadwal(html, b.id)).not.toContain("data-pengiriman=");

    expect(sebelumBagianDraft(html)).not.toMatch(/<form\b/);
    expect(tautanJadwal(html)).toEqual([[`/usulan-jadwal/${cibubur}`, "Kirim di luar jadwal"]]);
    expect(html).not.toContain("/salin-jadwal");
  });

  it("operator tanpa kelola-usulan-jadwal dan admin melihat tabel jadwal hanya-baca, tanpa tautan Kirim di luar jadwal", async () => {
    const t = await buatTokoUji();
    await db.insert(hubunganTokoGudang).values({ tokoId: t.id, gudangId: cibubur });
    const operator = await kepalaPenggunaUji("viewer");
    await tugaskanOperator({ idPengguna: operator.id, idGudang: cibubur, hakTindakan: ["input-stok"] });
    for (const cookie of [operator.cookie, (await kepalaPenggunaUji("admin")).cookie]) {
      kepala.cookie = cookie;
      const html = await buka(cibubur);
      expect(html).toContain("Di luar jadwal (akan datang)");
      expect(html).not.toContain("Kirim di luar jadwal");
      expect(tanpaBantuanIstilah(html)).not.toMatch(/<(button|input|select|form)\b/);
      expect(tautanJadwal(html)).toEqual([]);
    }
  });
});
