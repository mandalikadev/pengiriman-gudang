import { asc, eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { AksesDitolakError } from "@/server/auth/kewenangan";
import { buatPenggunaUji, kepalaPenggunaUji } from "@/server/auth/uji-bantu";
import { db } from "@/server/db";
import { hubunganTokoGudang, jadwalToko, usulanJadwal } from "@/server/db/schema";
import { daftarHakTindakan } from "@/server/gudang/hak-tindakan";
import { tugaskanOperator } from "@/server/gudang/penugasan";
import { salinJadwalKeToko } from "@/server/gudang/salin-jadwal";
import { buatTokoUji, idGudangUji } from "@/server/gudang/uji-bantu";
import { setujuiUsulanJadwal, tolakUsulanJadwal } from "@/server/gudang/usulan-jadwal";

const kepala = vi.hoisted(() => ({
  cookie: "",
  muatUlangGagal: false,
  dimuatUlang: [] as string[],
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(kepala.cookie ? { cookie: kepala.cookie } : {}),
}));
vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => {
    if (kepala.muatUlangGagal) throw new Error("gagal memuat ulang");
    kepala.dimuatUlang.push(path);
  },
}));

import { salinJadwal } from "./aksi";

let pusat: number;
let bali: number;
let bandung: number;

beforeAll(async () => {
  pusat = await idGudangUji("Pusat");
  bali = await idGudangUji("Gudang Bali");
  bandung = await idGudangUji("Gudang Bandung");
});

beforeEach(() => {
  kepala.cookie = "";
  kepala.muatUlangGagal = false;
  kepala.dimuatUlang = [];
});

async function tokoDiGudang(idGudang: number) {
  const t = await buatTokoUji();
  await db.insert(hubunganTokoGudang).values({ tokoId: t.id, gudangId: idGudang });
  return t;
}

async function masukOperator(idGudang: number, hakTindakan: (typeof daftarHakTindakan)[number][]) {
  const operator = await kepalaPenggunaUji("viewer");
  await tugaskanOperator({ idPengguna: operator.id, idGudang, hakTindakan });
  kepala.cookie = operator.cookie;
  return operator;
}

const riwayatJadwal = (idToko: number) =>
  db.select().from(jadwalToko).where(eq(jadwalToko.tokoId, idToko)).orderBy(asc(jadwalToko.id));
const daftarUsulan = (idToko: number) =>
  db.select().from(usulanJadwal).where(eq(usulanJadwal.tokoId, idToko)).orderBy(asc(usulanJadwal.id));

/** Satu pengaturan: 2× seminggu Senin (H−2) + Kamis (H). */
const pengaturan = {
  pola: "2x-seminggu",
  hariKirim: [
    { hari: "Kamis", persiapan: "H" },
    { hari: "Senin", persiapan: "H-2" },
  ],
  tanggalJangkar: null,
} as const;

const hariKirimTersimpan = [
  { hari: "Senin", persiapanHari: 2 },
  { hari: "Kamis", persiapanHari: 0 },
] as const satisfies (typeof jadwalToko.$inferInsert)["hariKirim"];

describe("salin jadwal ke beberapa toko — gudang selain Pusat", () => {
  let idOperator: string;

  beforeEach(async () => {
    idOperator = (await masukOperator(bali, ["kelola-usulan-jadwal"])).id;
  });

  it("salin ke 3 toko → 3 usulan terpisah yang disetujui/ditolak masing-masing", async () => {
    const [a, b, c] = [await tokoDiGudang(bali), await tokoDiGudang(bali), await tokoDiGudang(bali)];

    await expect(
      salinJadwal({
        idGudang: bali,
        daftarIdToko: [a.id, b.id, c.id],
        ...pengaturan,
      }),
    ).resolves.toEqual({
      keadaan: "berhasil",
      hasil: [
        { idToko: a.id, status: "berhasil" },
        { idToko: b.id, status: "berhasil" },
        { idToko: c.id, status: "berhasil" },
      ],
    });
    // T98: halaman Pengiriman Gudang dan kedua halaman jadwal sama-sama segar setelah simpan.
    expect(kepala.dimuatUlang).toEqual([`/pengiriman-gudang/${bali}`, `/usulan-jadwal/${bali}`, `/salin-jadwal/${bali}`]);

    // Setiap toko mendapat usulannya sendiri; jadwal aktif belum berubah.
    const usulan = [];
    for (const t of [a, b, c]) {
      const daftar = await daftarUsulan(t.id);
      expect(daftar).toHaveLength(1);
      expect(daftar[0]).toMatchObject({
        jenis: "buat",
        pola: "2x-seminggu",
        hariKirim: hariKirimTersimpan,
        status: "menunggu",
        diusulkanOleh: idOperator,
      });
      expect(await riwayatJadwal(t.id)).toEqual([]);
      usulan.push(daftar[0]);
    }
    expect(new Set(usulan.map((u) => u.id)).size).toBe(3);

    // Admin memutuskan setiap usulan sendiri-sendiri.
    const admin = await buatPenggunaUji("admin");
    await expect(setujuiUsulanJadwal({ idUsulan: usulan[0].id, idPengguna: admin.id })).resolves.toMatchObject({
      keadaan: "berhasil",
    });
    await expect(
      tolakUsulanJadwal({
        idUsulan: usulan[1].id,
        alasan: "Toko sedang renovasi",
        idPengguna: admin.id,
      }),
    ).resolves.toMatchObject({ keadaan: "berhasil" });

    expect(await daftarUsulan(a.id)).toMatchObject([{ status: "disetujui" }]);
    expect(await daftarUsulan(b.id)).toMatchObject([{ status: "ditolak", alasanPenolakan: "Toko sedang renovasi" }]);
    expect(await daftarUsulan(c.id)).toMatchObject([{ status: "menunggu" }]);

    expect(await riwayatJadwal(a.id)).toMatchObject([
      { status: "aktif", pola: "2x-seminggu", hariKirim: hariKirimTersimpan },
    ]);
    expect(await riwayatJadwal(b.id)).toEqual([]);
    expect(await riwayatJadwal(c.id)).toEqual([]);
  });

  it("satu toko gagal tidak membatalkan toko lain; hasil per toko dikembalikan", async () => {
    const pertama = await tokoDiGudang(bali);
    const tertahan = await tokoDiGudang(bali);
    const lain = await tokoDiGudang(bandung);
    const terakhir = await tokoDiGudang(bali);
    // `tertahan` masih punya usulan menunggu.
    await db.insert(usulanJadwal).values({
      tokoId: tertahan.id,
      jenis: "nonaktifkan",
      diusulkanOleh: idOperator,
    });

    const jawab = await salinJadwal({
      idGudang: bali,
      daftarIdToko: [pertama.id, tertahan.id, lain.id, terakhir.id],
      ...pengaturan,
    });
    expect(jawab).toEqual({
      keadaan: "berhasil",
      hasil: [
        { idToko: pertama.id, status: "berhasil" },
        {
          idToko: tertahan.id,
          status: "usulanMenunggu",
          pesan: "Toko ini masih punya usulan jadwal yang menunggu persetujuan admin.",
        },
        {
          idToko: lain.id,
          status: "ditolak",
          pesan: "Toko tidak terhubung ke gudang ini. Muat ulang halaman, lalu pilih lagi.",
        },
        { idToko: terakhir.id, status: "berhasil" },
      ],
    });

    expect(await daftarUsulan(pertama.id)).toMatchObject([{ status: "menunggu", pola: "2x-seminggu" }]);
    expect(await daftarUsulan(terakhir.id)).toMatchObject([{ status: "menunggu", pola: "2x-seminggu" }]);
    expect(await daftarUsulan(tertahan.id)).toMatchObject([{ jenis: "nonaktifkan", status: "menunggu" }]);
    expect(await daftarUsulan(lain.id)).toEqual([]);
  });

  it("usulan yang sama dengan jadwal aktif ditolak untuk toko itu saja", async () => {
    const sama = await tokoDiGudang(bali);
    const beda = await tokoDiGudang(bali);
    const pembuat = await buatPenggunaUji("admin");
    await db.insert(jadwalToko).values({
      tokoId: sama.id,
      pola: "2x-seminggu",
      hariKirim: hariKirimTersimpan,
      dibuatOleh: pembuat.id,
    });

    await expect(
      salinJadwal({
        idGudang: bali,
        daftarIdToko: [sama.id, beda.id],
        ...pengaturan,
      }),
    ).resolves.toEqual({
      keadaan: "berhasil",
      hasil: [
        {
          idToko: sama.id,
          status: "ditolak",
          pesan: "Usulan sama dengan jadwal aktif. Ubah dulu pola, hari kirim, atau tanggal jangkar.",
        },
        { idToko: beda.id, status: "berhasil" },
      ],
    });
  });

  it("pengaturan tidak valid → setiap toko ditolak validasi dengan pesan domain, tanpa usulan", async () => {
    const [a, b] = [await tokoDiGudang(bali), await tokoDiGudang(bali)];
    const jawab = await salinJadwal({
      idGudang: bali,
      daftarIdToko: [a.id, b.id],
      pola: "dua-mingguan",
      hariKirim: [{ hari: "Senin", persiapan: "H" }],
      tanggalJangkar: null,
    });
    const pesan = "Pola dua mingguan wajib memiliki tanggal jangkar.";
    expect(jawab).toEqual({
      keadaan: "berhasil",
      hasil: [
        { idToko: a.id, status: "ditolak", pesan },
        { idToko: b.id, status: "ditolak", pesan },
      ],
    });
    expect(await daftarUsulan(a.id)).toEqual([]);
    expect(await daftarUsulan(b.id)).toEqual([]);
    // Tidak ada yang tersimpan → tidak perlu memuat ulang.
    expect(kepala.dimuatUlang).toEqual([]);
  });

  it("toko yang sama dipilih dua kali diproses sekali", async () => {
    const t = await tokoDiGudang(bali);
    await expect(
      salinJadwal({
        idGudang: bali,
        daftarIdToko: [t.id, t.id],
        ...pengaturan,
      }),
    ).resolves.toEqual({
      keadaan: "berhasil",
      hasil: [{ idToko: t.id, status: "berhasil" }],
    });
    expect(await daftarUsulan(t.id)).toHaveLength(1);
  });

  it("tanpa toko terpilih → gagal tanpa menulis", async () => {
    await expect(salinJadwal({ idGudang: bali, daftarIdToko: [], ...pengaturan })).resolves.toEqual({
      keadaan: "gagal",
      pesan: "Pilih minimal satu toko.",
    });
  });

  it("tersimpan tetapi gagal memuat ulang → keadaan kelima beserta hasil per toko", async () => {
    const t = await tokoDiGudang(bali);
    kepala.muatUlangGagal = true;
    await expect(salinJadwal({ idGudang: bali, daftarIdToko: [t.id], ...pengaturan })).resolves.toEqual({
      keadaan: "tersimpanGagalMuatUlang",
      hasil: [{ idToko: t.id, status: "berhasil" }],
    });
  });
});

describe("salin jadwal ke beberapa toko — gudang Pusat", () => {
  it("jadwal langsung berlaku di setiap toko; toko dari gudang lain ditolak tanpa membatalkan yang lain", async () => {
    const operator = await masukOperator(pusat, ["kelola-usulan-jadwal"]);
    const a = await tokoDiGudang(pusat);
    const lain = await tokoDiGudang(bali);
    const b = await tokoDiGudang(pusat);

    await expect(
      salinJadwal({
        idGudang: pusat,
        daftarIdToko: [a.id, lain.id, b.id],
        ...pengaturan,
      }),
    ).resolves.toEqual({
      keadaan: "berhasil",
      hasil: [
        { idToko: a.id, status: "berhasil" },
        {
          idToko: lain.id,
          status: "ditolak",
          pesan: "Toko tidak terhubung ke gudang ini. Muat ulang halaman, lalu pilih lagi.",
        },
        { idToko: b.id, status: "berhasil" },
      ],
    });

    for (const t of [a, b]) {
      expect(await riwayatJadwal(t.id)).toMatchObject([
        {
          status: "aktif",
          pola: "2x-seminggu",
          hariKirim: hariKirimTersimpan,
          dibuatOleh: operator.id,
        },
      ]);
      expect(await daftarUsulan(t.id)).toEqual([]);
    }
    expect(await riwayatJadwal(lain.id)).toEqual([]);
  });
});

describe("kewenangan salin jadwal", () => {
  it("tanpa hak kelola-usulan-jadwal di gudang itu → ditolak sebelum menulis", async () => {
    const t = await tokoDiGudang(bali);
    await masukOperator(bali, []);
    await expect(salinJadwal({ idGudang: bali, daftarIdToko: [t.id], ...pengaturan })).rejects.toBeInstanceOf(
      AksesDitolakError,
    );

    await masukOperator(bandung, ["kelola-usulan-jadwal"]);
    await expect(salinJadwal({ idGudang: bali, daftarIdToko: [t.id], ...pengaturan })).rejects.toBeInstanceOf(
      AksesDitolakError,
    );

    const admin = await kepalaPenggunaUji("admin");
    kepala.cookie = admin.cookie;
    await expect(salinJadwal({ idGudang: bali, daftarIdToko: [t.id], ...pengaturan })).rejects.toBeInstanceOf(
      AksesDitolakError,
    );

    expect(await daftarUsulan(t.id)).toEqual([]);
  });
});

describe("salinJadwalKeToko", () => {
  it("galat tak terduga pada satu toko → hasil belum pasti untuk toko itu, toko lain tetap diproses", async () => {
    const idPengguna = (await buatPenggunaUji("viewer")).id;
    const a = await tokoDiGudang(bali);
    const b = await tokoDiGudang(bali);
    // Id di luar rentang integer PostgreSQL membuat kueri toko itu gagal.
    const idRusak = 2 ** 40;

    const hasil = await salinJadwalKeToko({
      idGudang: bali,
      daftarIdToko: [a.id, idRusak, b.id],
      masukan: {
        pola: "2x-seminggu",
        hariKirim: [
          { hari: "Kamis", persiapan: "H" },
          { hari: "Senin", persiapan: "H-2" },
        ],
        tanggalJangkar: null,
      },
      idPengguna,
    });
    expect(hasil).toEqual([
      { idToko: a.id, status: "berhasil" },
      {
        idToko: idRusak,
        status: "belumPasti",
        pesan: expect.stringContaining("belum pasti"),
      },
      { idToko: b.id, status: "berhasil" },
    ]);
    expect(await daftarUsulan(a.id)).toHaveLength(1);
    expect(await daftarUsulan(b.id)).toHaveLength(1);
  });
});
