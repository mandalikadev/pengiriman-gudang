import { eq } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { buatPenggunaUji, kepalaPenggunaUji } from "@/server/auth/uji-bantu";
import { db } from "@/server/db";
import { hubunganTokoGudang, jadwalToko, periodeSumberGudang, toko, usulanJadwal } from "@/server/db/schema";
import { tugaskanOperator } from "@/server/gudang/penugasan";
import { bacaPeriodeSumber, tetapkanPeriodeSumber } from "@/server/gudang/periode-sumber";
import { buatTokoUji, idGudangUji } from "@/server/gudang/uji-bantu";
import { tolakUsulanJadwal, usulkanJadwalToko, usulkanNonaktifJadwalToko } from "@/server/gudang/usulan-jadwal";
import { siapkanBulanTersediaUji } from "@/server/laporan/uji-bantu";

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

/** Isi halaman sebelum bagian Draft rencana (bagian terakhir halaman). */
function sebelumBagianDraft(html: string) {
  const posisi = html.indexOf("data-draft-rencana");
  if (posisi === -1) throw new Error("Penanda bagian Draft rencana (data-draft-rencana) tidak ditemukan di halaman.");
  return html.slice(0, posisi);
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
    // Hanya-baca: tanpa kontrol ubah di halaman (form hitung draft untuk hak hitung-kebutuhan diuji di draft.test.tsx).
    expect(sebelumBagianDraft(html)).not.toMatch(/<(button|input|select|form)\b/);
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

  /** Tautan ke halaman Usulkan/Atur jadwal toko dan Salin jadwal (T98): [href, teks]. */
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
    expect(aktif).toMatch(/Uji viewer, \w+, \d{2}-\d{2}-\d{4} pukul \d{2}\.\d{2} WIB/);
    // Jadwal lama yang nonaktif (Selasa) tidak tampil sebagai jadwal aktif. Diperiksa lewat hari kirim, bukan nama hari
    // saja: kolom Diatur memuat nama hari jadwal dibuat, yang bisa Selasa.
    expect(aktif).not.toContain("Selasa (H");

    const kosong = barisJadwal(html, tanpaJadwal.id);
    expect(kosong).toContain('data-status="belumAdaJadwal"');
    expect(kosong).toContain("Belum ada jadwal");
    expect(kosong).toContain("lucide-circle-dashed");

    // T98: kedua form pindah ke halaman sendiri; halaman ini menautkannya untuk pengguna berhak.
    expect(sebelumBagianDraft(html)).not.toMatch(/<form\b/);
    expect(html).not.toContain("data-salin-jadwal");
    expect(html).not.toContain("Simpan jadwal");
    expect(tautanJadwal(html)).toEqual([
      [`/usulan-jadwal/${pusat}`, "Atur jadwal toko"],
      [`/salin-jadwal/${pusat}`, "Salin jadwal ke beberapa toko"],
    ]);
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
    expect(html).not.toContain("Atur jadwal toko");
    expect(tautanJadwal(html)).toEqual([]);
    // Form hitung draft untuk hak hitung-kebutuhan (T58) diuji di draft.test.tsx.
    expect(sebelumBagianDraft(html)).not.toMatch(/<(button|input|select|form)\b/);
  });

  it("admin tanpa penugasan melihat jadwal Pusat hanya-baca", async () => {
    const { berjadwal } = await siapkanTokoPusat();
    kepala.cookie = (await kepalaPenggunaUji("admin")).cookie;

    const html = await buka(pusat);
    expect(barisJadwal(html, berjadwal.id)).toContain("Dua mingguan");
    expect(html).not.toMatch(/<(button|input|select|form)\b/);
    expect(tautanJadwal(html)).toEqual([]);
  });

  it("gudang selain Pusat: operator dengan kelola-usulan-jadwal mendapat tautan usulan dan melihat status usulan per toko", async () => {
    const [menunggu, ditolak, tanpaUsulan] = [await buatTokoUji(), await buatTokoUji(), await buatTokoUji()];
    await db.insert(hubunganTokoGudang).values([
      { tokoId: menunggu.id, gudangId: cibubur },
      { tokoId: ditolak.id, gudangId: cibubur },
      { tokoId: tanpaUsulan.id, gudangId: cibubur },
    ]);
    const operator = await kepalaPenggunaUji("viewer");
    await tugaskanOperator({ idPengguna: operator.id, idGudang: cibubur, hakTindakan: ["kelola-usulan-jadwal"] });
    const admin = await buatPenggunaUji("admin");
    const masukan = { pola: "mingguan", hariKirim: [{ hari: "Rabu", persiapan: "H" }], tanggalJangkar: null } as const;
    await usulkanJadwalToko({ idGudang: cibubur, idToko: menunggu.id, masukan, idPengguna: operator.id });
    await usulkanJadwalToko({ idGudang: cibubur, idToko: ditolak.id, masukan, idPengguna: operator.id });
    const [usulanDitolak] = await db.select().from(usulanJadwal).where(eq(usulanJadwal.tokoId, ditolak.id));
    await tolakUsulanJadwal({ idUsulan: usulanDitolak.id, alasan: "Rabu armada penuh", idPengguna: admin.id });
    kepala.cookie = operator.cookie;

    const html = await buka(cibubur);
    expect(html).toContain("Usulan terakhir");
    // Usulan menunggu tidak menggantikan jadwal aktif.
    const barisMenunggu = barisJadwal(html, menunggu.id);
    expect(barisMenunggu).toContain("Belum ada jadwal");
    expect(barisMenunggu).toContain('data-status-usulan="menunggu"');
    expect(barisMenunggu).toContain("Menunggu persetujuan");
    expect(barisMenunggu).toContain("Buat jadwal");
    expect(barisMenunggu).toMatch(/Diusulkan Uji viewer, \w+, \d{2}-\d{2}-\d{4} pukul \d{2}\.\d{2} WIB/);

    const barisDitolak = barisJadwal(html, ditolak.id);
    expect(barisDitolak).toContain('data-status-usulan="ditolak"');
    expect(barisDitolak).toContain("lucide-circle-x");
    expect(barisDitolak).toContain("Alasan penolakan: Rabu armada penuh");

    expect(barisJadwal(html, tanpaUsulan.id)).not.toContain("data-status-usulan");

    // T98: form usulan dan salin jadwal pindah ke halaman sendiri; halaman ini menautkannya.
    expect(sebelumBagianDraft(html)).not.toMatch(/<form\b/);
    expect(html).not.toContain("Kirim usulan");
    expect(tautanJadwal(html)).toEqual([
      [`/usulan-jadwal/${cibubur}`, "Usulkan jadwal toko"],
      [`/salin-jadwal/${cibubur}`, "Salin jadwal ke beberapa toko"],
    ]);
  });

  it("gudang selain Pusat: operator tanpa kelola-usulan-jadwal dan admin melihat status usulan hanya-baca", async () => {
    const t = await buatTokoUji();
    await db.insert(hubunganTokoGudang).values({ tokoId: t.id, gudangId: cibubur });
    const pengusul = await buatPenggunaUji("viewer");
    await usulkanNonaktifJadwalToko({ idGudang: cibubur, idToko: t.id, idPengguna: pengusul.id });

    const operator = await kepalaPenggunaUji("viewer");
    await tugaskanOperator({ idPengguna: operator.id, idGudang: cibubur, hakTindakan: ["input-stok"] });
    for (const cookie of [operator.cookie, (await kepalaPenggunaUji("admin")).cookie]) {
      kepala.cookie = cookie;
      const html = await buka(cibubur);
      expect(html).toContain("Usulan terakhir");
      expect(html).not.toContain("Usulkan jadwal toko");
      expect(html).not.toMatch(/<(button|input|select|form)\b/);
      expect(tautanJadwal(html)).toEqual([]);
    }
  });

  it("gudang Pusat tidak menampilkan kolom usulan", async () => {
    await siapkanTokoPusat();
    const operator = await kepalaPenggunaUji("viewer");
    await tugaskanOperator({ idPengguna: operator.id, idGudang: pusat, hakTindakan: ["kelola-usulan-jadwal"] });
    kepala.cookie = operator.cookie;

    const html = await buka(pusat);
    expect(html).not.toContain("Usulan terakhir");
    expect(html).not.toContain("Usulkan jadwal toko");
  });
});
