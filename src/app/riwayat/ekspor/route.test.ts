import { eq } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";

import { formatWaktu } from "@/app/admin/impor/format";
import { buatPenggunaUji, kepalaPenggunaUji } from "@/server/auth/uji-bantu";
import { db } from "@/server/db";
import { barisRencanaFinal, gudang as tabelGudang, pengirimanDiLuarJadwal, rencanaFinal } from "@/server/db/schema";
import type { HakTindakan } from "@/server/gudang/hak-tindakan";
import { tugaskanOperator } from "@/server/gudang/penugasan";
import { buatGudangUji, buatTokoUji, hapusGudangUji, rencanaFinalUji } from "@/server/gudang/uji-bantu";

const kepala = vi.hoisted(() => ({ cookie: "" }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(kepala.cookie ? { cookie: kepala.cookie } : {}),
}));

import HalamanRiwayat from "../page";

import { GET } from "./route";

// T129 (PRD A7 ▶ Keputusan 2026-10-14): ekspor .xlsx dari halaman Riwayat untuk tab yang dibuka dan seluruh hasil filter
// (bukan hanya 50 baris halaman). Admin semua gudang tanpa penugasan; operator hanya baris gudang tempat ia punya hak
// `ekspor`, dengan pemberitahuan sebelum ekspor; viewer dan operator tanpa hak `ekspor` tidak melihat tombol dan
// ditolak (403). Kolom dan urutannya dari issue #283 / PRD.

const JENIS_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const KOLOM_RENCANA_FINAL = [
  "Gudang",
  "Tanggal kirim",
  "Toko",
  "Versi",
  "Berlaku",
  "Jenis pengiriman",
  "Difinalisasi oleh",
  "Waktu finalisasi",
  "Kode produk",
  "Nama produk",
  "Kebutuhan barang",
  "Stok akhir",
  "Buffer (%)",
  "Jumlah kirim",
  "Status",
];
const KOLOM_DI_LUAR_JADWAL = [
  "Gudang",
  "Jenis",
  "Toko",
  "Tanggal kirim",
  "Persiapan",
  "Tanggal rutin yang dipindah",
  "Alasan",
  "Status",
  "Pengusul",
  "Waktu usul",
  "Penyetuju/penolak",
  "Waktu keputusan",
  "Alasan penolakan",
  "Ditarik/dibatalkan oleh",
  "Waktu penarikan/pembatalan",
  "Alasan penarikan/pembatalan",
];

let gudangA: { id: number; nama: string };
let gudangB: { id: number; nama: string };
let tokoX: { id: number; nama: string };
let tokoY: { id: number; nama: string };
const kode = { p1: `T129-${Date.now()}-A`, p2: `T129-${Date.now()}-B` };
const waktu = (hari: number, jam: number) => new Date(Date.UTC(2099, 0, hari, jam));
/** Jumlah pengiriman di luar jadwal toko X di gudang A: lebih dari satu halaman tabel (50 baris). */
const JUMLAH_DITOLAK_X = 52;

const siap = (kodeProduk: string, angka: { kebutuhan: number; stokAkhir: number; persenBuffer: number; jumlahKirim: number }) => ({
  kodeProduk,
  namaProduk: `PRODUK ${kodeProduk}`,
  status: "siap" as const,
  tanpaRataRata: null,
  rincian: { rataRata: {}, kebutuhan: null },
  ...angka,
});

let tanggalSementara = 0;
async function buatRencana({
  gudang,
  toko,
  tanggalKirim,
  versi,
  difinalisasiPada,
  baris,
  idPengguna,
}: {
  gudang: { id: number; nama: string };
  toko: { id: number; nama: string };
  tanggalKirim: string;
  versi: number;
  difinalisasiPada: Date;
  baris: Omit<typeof barisRencanaFinal.$inferInsert, "rencanaFinalId">[];
  idPengguna: string;
}) {
  tanggalSementara += 1;
  const id = await rencanaFinalUji({ idGudang: gudang.id, idToko: toko.id, tanggalKirim: `2098-01-${String(tanggalSementara).padStart(2, "0")}`, idPengguna });
  await db
    .update(rencanaFinal)
    .set({
      namaGudang: gudang.nama,
      namaToko: toko.nama,
      tanggalKirim,
      versi,
      alasanFinalisasiUlang: versi === 1 ? null : "Stok salah ketik",
      namaPemfinalisasi: "Uji T129",
      difinalisasiPada,
    })
    .where(eq(rencanaFinal.id, id));
  await db.insert(barisRencanaFinal).values(baris.map((b) => ({ ...b, rencanaFinalId: id })));
  return id;
}

beforeAll(async () => {
  gudangA = await buatGudangUji();
  gudangB = await buatGudangUji();
  [tokoX, tokoY] = [await buatTokoUji(), await buatTokoUji()];
  const admin = await buatPenggunaUji("admin");
  const pengusul = await buatPenggunaUji("viewer");

  // Rencana final toko X: gudang A tanggal 04-05 versi 1 (digantikan) dan versi 2, gudang B tanggal 11-05 versi 1.
  await buatRencana({
    gudang: gudangA,
    toko: tokoX,
    tanggalKirim: "2099-05-04",
    versi: 1,
    difinalisasiPada: waktu(1, 3),
    idPengguna: admin.id,
    baris: [
      siap(kode.p1, { kebutuhan: 56, stokAkhir: 20, persenBuffer: 20, jumlahKirim: 48 }),
      {
        kodeProduk: kode.p2,
        namaProduk: null,
        status: "manual",
        kebutuhan: null,
        tanpaRataRata: [],
        stokAkhir: null,
        persenBuffer: null,
        jumlahKirim: null,
        rincian: { rataRata: {}, kebutuhan: null },
      },
    ],
  });
  await buatRencana({
    gudang: gudangA,
    toko: tokoX,
    tanggalKirim: "2099-05-04",
    versi: 2,
    difinalisasiPada: waktu(2, 3),
    idPengguna: admin.id,
    baris: [siap(kode.p1, { kebutuhan: 56, stokAkhir: 18, persenBuffer: 20, jumlahKirim: 50 })],
  });
  await buatRencana({
    gudang: gudangB,
    toko: tokoX,
    tanggalKirim: "2099-05-11",
    versi: 1,
    difinalisasiPada: waktu(3, 3),
    idPengguna: admin.id,
    baris: [siap(kode.p1, { kebutuhan: 10, stokAkhir: 0, persenBuffer: 10, jumlahKirim: 11 })],
  });

  // Pengiriman di luar jadwal toko Y (isian lengkap) dan toko X (lebih dari 50 baris di gudang A, satu di gudang B).
  const dasar = { persiapanHari: 1 as const, alasan: "permintaan mendesak", diusulkanOleh: pengusul.id };
  await db.insert(pengirimanDiLuarJadwal).values([
    {
      ...dasar,
      gudangId: gudangA.id,
      tokoId: tokoY.id,
      jenis: "pindah",
      tanggalKirim: "2099-03-10",
      tanggalRutinDipindah: "2099-03-09",
      status: "dibatalkan",
      diusulkanPada: waktu(1, 1),
      diputuskanOleh: admin.id,
      diputuskanPada: waktu(1, 2),
      dibatalkanOleh: admin.id,
      dibatalkanPada: waktu(1, 4),
      alasanPembatalan: "mal batal tutup",
    },
    { ...dasar, gudangId: gudangB.id, tokoId: tokoY.id, jenis: "tambahan", tanggalKirim: "2099-03-05", status: "ditarik", diusulkanPada: waktu(2, 1), ditarikPada: waktu(2, 2) },
    {
      ...dasar,
      gudangId: gudangA.id,
      tokoId: tokoY.id,
      jenis: "tambahan",
      tanggalKirim: "2099-03-04",
      status: "ditolak",
      diusulkanPada: waktu(3, 1),
      diputuskanOleh: admin.id,
      diputuskanPada: waktu(3, 2),
      alasanPenolakan: "stok gudang kurang",
    },
    ...Array.from({ length: JUMLAH_DITOLAK_X }, (_, i) => ({
      ...dasar,
      gudangId: gudangA.id,
      tokoId: tokoX.id,
      jenis: "tambahan" as const,
      tanggalKirim: i < 30 ? `2099-06-${String(i + 1).padStart(2, "0")}` : `2099-07-${String(i - 29).padStart(2, "0")}`,
      status: "ditolak" as const,
      diusulkanPada: waktu(10, i % 24),
      diputuskanOleh: admin.id,
      diputuskanPada: waktu(11, 0),
      alasanPenolakan: "uji",
    })),
    { ...dasar, gudangId: gudangB.id, tokoId: tokoX.id, jenis: "tambahan", tanggalKirim: "2099-07-01", status: "menunggu", diusulkanPada: waktu(12, 0) },
  ]);
}, 120_000);

afterAll(async () => {
  await hapusGudangUji(gudangA.id, gudangB.id);
});

beforeEach(async () => {
  kepala.cookie = (await kepalaPenggunaUji("admin")).cookie;
});

async function masukOperator(penugasan: { idGudang: number; hakTindakan: HakTindakan[] }[]) {
  const operator = await kepalaPenggunaUji("viewer");
  for (const p of penugasan) await tugaskanOperator({ idPengguna: operator.id, ...p });
  kepala.cookie = operator.cookie;
}

const ekspor = (parameter: Record<string, string>) => GET(new Request(`http://localhost/riwayat/ekspor?${new URLSearchParams(parameter).toString()}`));
const buka = async (parameter: Record<string, string>) => renderToStaticMarkup(await HalamanRiwayat({ searchParams: Promise.resolve(parameter) }));

type Sel = string | number | null;

/** Satu sheet: baris keterangan (label → nilai) di atas judul kolom, judul kolom, dan baris data. */
async function baca(respons: Response, namaSheet: string) {
  expect(respons.status).toBe(200);
  expect(respons.headers.get("content-type")).toBe(JENIS_XLSX);
  const wb = XLSX.read(new Uint8Array(await respons.arrayBuffer()), { type: "array" });
  expect(wb.SheetNames).toEqual([namaSheet]);
  const semua = XLSX.utils.sheet_to_json<Sel[]>(wb.Sheets[namaSheet], { header: 1, defval: null, blankrows: true });
  const kosong = semua.findIndex((b) => b.every((s) => s === null));
  const kepala = semua.slice(0, kosong);
  return {
    judul: kepala[0][0],
    keterangan: Object.fromEntries(kepala.slice(1).map((b) => [String(b[0]), b[1]])),
    kolom: semua[kosong + 1],
    data: semua.slice(kosong + 2),
  };
}

describe("ekspor Riwayat, tab Rencana final", () => {
  it("admin tanpa penugasan: satu baris per produk per rencana final semua gudang, termasuk versi yang digantikan", async () => {
    const isi = await baca(await ekspor({ toko: String(tokoX.id) }), "Riwayat rencana final");
    expect(isi.kolom).toEqual(KOLOM_RENCANA_FINAL);
    expect(isi.data).toEqual([
      [gudangB.nama, "Senin, 11-05-2099", tokoX.nama, 1, "Ya", "Rutin", "Uji T129", formatWaktu(waktu(3, 3)), kode.p1, `PRODUK ${kode.p1}`, 10, 0, 10, 11, "Otomatis"],
      [gudangA.nama, "Senin, 04-05-2099", tokoX.nama, 2, "Ya", "Rutin", "Uji T129", formatWaktu(waktu(2, 3)), kode.p1, `PRODUK ${kode.p1}`, 56, 18, 20, 50, "Otomatis"],
      [
        gudangA.nama,
        "Senin, 04-05-2099",
        tokoX.nama,
        1,
        "Digantikan oleh versi 2",
        "Rutin",
        "Uji T129",
        formatWaktu(waktu(1, 3)),
        kode.p1,
        `PRODUK ${kode.p1}`,
        56,
        20,
        20,
        48,
        "Otomatis",
      ],
      [gudangA.nama, "Senin, 04-05-2099", tokoX.nama, 1, "Digantikan oleh versi 2", "Rutin", "Uji T129", formatWaktu(waktu(1, 3)), kode.p2, "—", "—", "—", "—", "—", "Manual"],
    ]);
  });

  it("baris keterangan: jenis riwayat, filter yang diterapkan, waktu ekspor, dan arti tanda tidak tersedia", async () => {
    const isi = await baca(await ekspor({ toko: String(tokoX.id), dari: "2099-05-01", sampai: "2099-05-31", cari: tokoX.nama }), "Riwayat rencana final");
    expect(isi.judul).toBe("Riwayat rencana final");
    expect(isi.keterangan).toMatchObject({
      "Jenis riwayat": "Rencana final",
      Gudang: "Semua gudang",
      Toko: tokoX.nama,
      "Tanggal kirim": "Jumat, 01-05-2099 sampai Minggu, 31-05-2099",
      "Cari toko": tokoX.nama,
      Keterangan: "— = tidak tersedia atau belum diisi, bukan 0.",
    });
    expect(String(isi.keterangan["Waktu ekspor"])).toMatch(/^\S+, \d{2}-\d{2}-\d{4} pukul \d{2}\.\d{2} WIB$/);
    expect(isi.keterangan).not.toHaveProperty("Tidak ikut diekspor (tanpa hak ekspor)");
  });

  it("mengikuti filter gudang, rentang tanggal kirim, dan cari", async () => {
    const gudang = await baca(await ekspor({ toko: String(tokoX.id), gudang: String(gudangA.id) }), "Riwayat rencana final");
    expect(gudang.data.map((b) => [b[0], b[3], b[8]])).toEqual([
      [gudangA.nama, 2, kode.p1],
      [gudangA.nama, 1, kode.p1],
      [gudangA.nama, 1, kode.p2],
    ]);
    expect(gudang.keterangan.Gudang).toBe(gudangA.nama);
    const rentang = await baca(await ekspor({ toko: String(tokoX.id), dari: "2099-05-05" }), "Riwayat rencana final");
    expect(rentang.data.map((b) => b[0])).toEqual([gudangB.nama]);
    expect(rentang.keterangan["Tanggal kirim"]).toBe("Mulai Selasa, 05-05-2099");
    const cari = await baca(await ekspor({ cari: tokoY.nama }), "Riwayat rencana final");
    expect(cari.data).toEqual([]);
  });
});

describe("ekspor Riwayat, tab Di luar jadwal", () => {
  it("admin tanpa penugasan: satu baris per pengiriman dengan kolom catatan aktivitas, terbaru di atas", async () => {
    const isi = await baca(await ekspor({ tab: "di-luar-jadwal", toko: String(tokoY.id) }), "Riwayat di luar jadwal");
    expect(isi.judul).toBe("Riwayat di luar jadwal");
    expect(isi.keterangan["Jenis riwayat"]).toBe("Di luar jadwal");
    expect(isi.kolom).toEqual(KOLOM_DI_LUAR_JADWAL);
    expect(isi.data).toEqual([
      [
        gudangA.nama,
        "Tambahan",
        tokoY.nama,
        "Rabu, 04-03-2099",
        "H−1",
        "—",
        "permintaan mendesak",
        "Ditolak",
        "Uji viewer",
        formatWaktu(waktu(3, 1)),
        "Uji admin",
        formatWaktu(waktu(3, 2)),
        "stok gudang kurang",
        "—",
        "—",
        "—",
      ],
      [gudangB.nama, "Tambahan", tokoY.nama, "Kamis, 05-03-2099", "H−1", "—", "permintaan mendesak", "Ditarik", "Uji viewer", formatWaktu(waktu(2, 1)), "—", "—", "—", "Uji viewer", formatWaktu(waktu(2, 2)), "—"],
      [
        gudangA.nama,
        "Pindah",
        tokoY.nama,
        "Selasa, 10-03-2099",
        "H−1",
        "Senin, 09-03-2099",
        "permintaan mendesak",
        "Dibatalkan",
        "Uji viewer",
        formatWaktu(waktu(1, 1)),
        "Uji admin",
        formatWaktu(waktu(1, 2)),
        "—",
        "Uji admin",
        formatWaktu(waktu(1, 4)),
        "mal batal tutup",
      ],
    ]);
  });

  it("mencakup seluruh hasil filter, bukan hanya 50 baris halaman yang dibuka", async () => {
    const html = await buka({ tab: "di-luar-jadwal", toko: String(tokoX.id) });
    expect([...html.matchAll(/<tr[^>]*data-pengiriman="/g)]).toHaveLength(50);
    const isi = await baca(await ekspor({ tab: "di-luar-jadwal", toko: String(tokoX.id) }), "Riwayat di luar jadwal");
    expect(isi.data).toHaveLength(JUMLAH_DITOLAK_X + 1);
    const gudangSaja = await baca(await ekspor({ tab: "di-luar-jadwal", toko: String(tokoX.id), gudang: String(gudangA.id) }), "Riwayat di luar jadwal");
    expect(gudangSaja.data).toHaveLength(JUMLAH_DITOLAK_X);
    const cari = await baca(await ekspor({ tab: "di-luar-jadwal", cari: tokoY.nama }), "Riwayat di luar jadwal");
    expect(cari.data.map((b) => b[2])).toEqual([tokoY.nama, tokoY.nama, tokoY.nama]);
  });
});

describe("hak ekspor Riwayat", () => {
  it("halaman: tombol ekspor tab yang dibuka dengan filter yang diterapkan (tanpa halaman)", async () => {
    const html = await buka({ toko: String(tokoX.id), dari: "2099-05-01", halaman: "1" });
    expect(html).toContain(`data-ekspor-url="/riwayat/ekspor?toko=${tokoX.id}&amp;dari=2099-05-01"`);
    expect(html).not.toContain("data-gudang-tidak-ikut-ekspor");
    const diLuarJadwal = await buka({ tab: "di-luar-jadwal", toko: String(tokoY.id), cari: "x y", halaman: "2" });
    expect(diLuarJadwal).toContain(`data-ekspor-url="/riwayat/ekspor?tab=di-luar-jadwal&amp;toko=${tokoY.id}&amp;cari=x+y"`);
  });

  it("operator dengan hak ekspor hanya di gudang A: file berisi baris gudang A saja dan halaman memberi tahu sebelum ekspor", async () => {
    await masukOperator([
      { idGudang: gudangA.id, hakTindakan: ["ekspor"] },
      { idGudang: gudangB.id, hakTindakan: ["finalisasi"] },
    ]);
    const pesan = `${gudangB.nama} tidak ikut diekspor karena Anda tidak punya hak ekspor di sana.`;

    const html = await buka({ toko: String(tokoX.id) });
    expect(html).toContain(`data-ekspor-url="/riwayat/ekspor?toko=${tokoX.id}"`);
    expect(/<p[^>]*data-gudang-tidak-ikut-ekspor[^>]*>.*?<\/p>/.exec(html)?.[0]).toContain(pesan);
    const rencana = await baca(await ekspor({ toko: String(tokoX.id) }), "Riwayat rencana final");
    expect(rencana.data.map((b) => b[0])).toEqual([gudangA.nama, gudangA.nama, gudangA.nama]);
    expect(rencana.keterangan["Tidak ikut diekspor (tanpa hak ekspor)"]).toBe(gudangB.nama);

    expect(await buka({ tab: "di-luar-jadwal", toko: String(tokoX.id) })).toContain(pesan);
    const diLuarJadwal = await baca(await ekspor({ tab: "di-luar-jadwal", toko: String(tokoX.id) }), "Riwayat di luar jadwal");
    expect(diLuarJadwal.data).toHaveLength(JUMLAH_DITOLAK_X);
    expect(new Set(diLuarJadwal.data.map((b) => b[0]))).toEqual(new Set([gudangA.nama]));

    // Hasil filter tanpa baris gudang B: tidak ada pemberitahuan.
    expect(await buka({ toko: String(tokoX.id), gudang: String(gudangA.id) })).not.toContain("data-gudang-tidak-ikut-ekspor");
  });

  it("viewer dan operator tanpa hak ekspor: tanpa tombol, route membalas 403; tanpa sesi 401", async () => {
    for (const masuk of [
      async () => (kepala.cookie = (await kepalaPenggunaUji("viewer")).cookie),
      async () => masukOperator([{ idGudang: gudangA.id, hakTindakan: ["finalisasi", "input-stok"] }]),
    ]) {
      await masuk();
      expect(await buka({ toko: String(tokoX.id) })).not.toContain('data-ekspor-url="/riwayat/ekspor');
      expect(await buka({ tab: "di-luar-jadwal", toko: String(tokoX.id) })).not.toContain('data-ekspor-url="/riwayat/ekspor');
      expect((await ekspor({ toko: String(tokoX.id) })).status).toBe(403);
      expect((await ekspor({ tab: "di-luar-jadwal" })).status).toBe(403);
    }
    kepala.cookie = "";
    expect((await ekspor({})).status).toBe(401);
  });

  it("gudang nonaktif tidak memberi hak ekspor", async () => {
    const nonaktif = await buatGudangUji();
    try {
      await masukOperator([{ idGudang: nonaktif.id, hakTindakan: ["ekspor"] }]);
      await db.update(tabelGudang).set({ aktif: false }).where(eq(tabelGudang.id, nonaktif.id));
      expect((await ekspor({ toko: String(tokoX.id) })).status).toBe(403);
    } finally {
      await hapusGudangUji(nonaktif.id);
    }
  });
});
