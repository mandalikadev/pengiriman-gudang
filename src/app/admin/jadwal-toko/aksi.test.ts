import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { parseTanggalBisnis } from "@/domain/kalender";
import { AksesDitolakError } from "@/server/auth/kewenangan";
import { buatPenggunaUji, kepalaPenggunaUji } from "@/server/auth/uji-bantu";
import { db } from "@/server/db";
import { hubunganTokoGudang, jadwalToko, usulanJadwal } from "@/server/db/schema";
import { bacaDraftRencana, hitungDraftRencana } from "@/server/gudang/draft-rencana";
import { jadwalTokoGudang, riwayatJadwalTetapGudang } from "@/server/gudang/jadwal";
import { tugaskanOperator } from "@/server/gudang/penugasan";
import { salinJadwalKeToko } from "@/server/gudang/salin-jadwal";
import { bersihkanTokoSmbUji, siapkanTokoSmbUji } from "@/server/gudang/uji-bantu-cakupan";
import { buatTokoUji, idGudangUji } from "@/server/gudang/uji-bantu";

const kepala = vi.hoisted(() => ({ cookie: "", muatUlangGagal: false, dimuatUlang: [] as string[] }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(kepala.cookie ? { cookie: kepala.cookie } : {}),
}));
vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => {
    if (kepala.muatUlangGagal) throw new Error("gagal memuat ulang");
    kepala.dimuatUlang.push(path);
  },
}));

import { aturJadwalTetapToko, nonaktifkanJadwalTetapToko, salinJadwalTetap } from "./aksi";

// T112 (PRD A5 ▶ Revisi 2026-10-13): jadwal tetap diatur admin, langsung berlaku tanpa usulan, untuk semua gudang
// termasuk Pusat. Riwayat jadwal tetap tetap tersimpan; salin jadwal menjadi alat admin dengan hasil per toko.

let pusat: number;
let cibubur: number;
let bali: number;

beforeAll(async () => {
  pusat = await idGudangUji("Pusat");
  cibubur = await idGudangUji("Gudang Cibubur");
  bali = await idGudangUji("Gudang Bali");
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

async function masukAdmin() {
  const admin = await kepalaPenggunaUji("admin");
  kepala.cookie = admin.cookie;
  return admin;
}

const riwayatJadwal = (idToko: number) =>
  db.select().from(jadwalToko).where(eq(jadwalToko.tokoId, idToko)).orderBy(asc(jadwalToko.id));
const daftarUsulan = (idToko: number) => db.select().from(usulanJadwal).where(eq(usulanJadwal.tokoId, idToko));

/** 2× seminggu Senin (H−2) + Kamis (H). */
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
];

describe("admin mengatur jadwal tetap", () => {
  for (const [namaGudang, gudangUji] of [
    ["gudang selain Pusat", () => cibubur],
    ["Pusat", () => pusat],
  ] as const) {
    it(`${namaGudang}: langsung aktif tanpa usulan; jadwal lama nonaktif dan tampil di riwayat dengan pengatur dan waktunya`, async () => {
      const idGudang = gudangUji();
      const t = await tokoDiGudang(idGudang);
      const admin = await masukAdmin();

      await expect(aturJadwalTetapToko({ idGudang, idToko: t.id, pola: "mingguan", hariKirim: [{ hari: "Rabu", persiapan: "H-1" }], tanggalJangkar: null })).resolves.toEqual({
        keadaan: "berhasil",
      });
      expect(kepala.dimuatUlang).toEqual([`/admin/jadwal-toko/${idGudang}`, `/pengiriman-gudang/${idGudang}`, `/usulan-jadwal/${idGudang}`]);
      await expect(aturJadwalTetapToko({ idGudang, idToko: t.id, ...pengaturan })).resolves.toEqual({ keadaan: "berhasil" });

      const [lama, baru] = await riwayatJadwal(t.id);
      expect(lama).toMatchObject({ status: "nonaktif", pola: "mingguan", dibuatOleh: admin.id, dinonaktifkanOleh: admin.id });
      expect(baru).toMatchObject({ status: "aktif", pola: "2x-seminggu", hariKirim: hariKirimTersimpan, dibuatOleh: admin.id });
      expect(await daftarUsulan(t.id)).toEqual([]);

      const aktif = (await jadwalTokoGudang(idGudang)).find((x) => x.id === t.id)?.jadwal;
      expect(aktif).toMatchObject({ versi: baru.id, pola: "2x-seminggu" });

      const riwayat = (await riwayatJadwalTetapGudang(idGudang)).get(t.id);
      expect(riwayat).toEqual([
        {
          id: baru.id,
          pola: "2x-seminggu",
          hariKirim: hariKirimTersimpan,
          tanggalJangkar: null,
          diaturOleh: "Uji admin",
          diaturPada: baru.dibuatPada,
          berakhir: null,
        },
        {
          id: lama.id,
          pola: "mingguan",
          hariKirim: [{ hari: "Rabu", persiapanHari: 1 }],
          tanggalJangkar: null,
          diaturOleh: "Uji admin",
          diaturPada: lama.dibuatPada,
          berakhir: { jenis: "diganti", oleh: "Uji admin", pada: baru.dibuatPada },
        },
      ]);
    });
  }

  it("toko yang tidak terhubung ke gudang itu ditolak tanpa menulis", async () => {
    const t = await tokoDiGudang(bali);
    await masukAdmin();
    await expect(aturJadwalTetapToko({ idGudang: cibubur, idToko: t.id, ...pengaturan })).resolves.toEqual({
      keadaan: "gagal",
      pesan: "Toko tidak terhubung ke gudang ini. Muat ulang halaman, lalu pilih lagi.",
    });
    expect(await riwayatJadwal(t.id)).toEqual([]);
  });

  it("aturan jadwal tidak valid → gagal dengan pesan domain", async () => {
    const t = await tokoDiGudang(cibubur);
    await masukAdmin();
    await expect(
      aturJadwalTetapToko({ idGudang: cibubur, idToko: t.id, pola: "dua-mingguan", hariKirim: [{ hari: "Senin", persiapan: "H" }], tanggalJangkar: null }),
    ).resolves.toEqual({ keadaan: "gagal", pesan: "Pola dua mingguan wajib memiliki tanggal jangkar." });
  });

  it("tersimpan tetapi gagal memuat ulang → keadaan kelima", async () => {
    const t = await tokoDiGudang(cibubur);
    await masukAdmin();
    kepala.muatUlangGagal = true;
    await expect(aturJadwalTetapToko({ idGudang: cibubur, idToko: t.id, ...pengaturan })).resolves.toEqual({
      keadaan: "tersimpanGagalMuatUlang",
    });
  });
});

describe("admin menonaktifkan jadwal tetap", () => {
  const SENIN = parseTanggalBisnis("2026-10-19");
  let bandung: number;
  let toko: { id: number; nama: string };
  let idOperator: string;

  beforeAll(async () => {
    bandung = await idGudangUji("Gudang Bandung");
    idOperator = (await buatPenggunaUji("viewer")).id;
    ({ toko } = await siapkanTokoSmbUji({ idGudang: bandung, idAdmin: (await buatPenggunaUji("admin")).id }));
  }, 120_000);

  afterAll(async () => {
    await bersihkanTokoSmbUji({ idGudang: bandung, idToko: toko.id });
  });

  it("toko tanpa jadwal aktif; draft yang memuat toko itu ditandai perlu dihitung ulang; riwayat mencatat penonaktifan", async () => {
    await expect(hitungDraftRencana({ idGudang: bandung, tanggalKirim: SENIN, idPengguna: idOperator })).resolves.toMatchObject({
      keadaan: "berhasil",
    });
    const draft = await bacaDraftRencana(bandung, SENIN);
    expect(draft?.toko.map((t) => t.id)).toContain(toko.id);
    expect(draft?.perluDihitungUlang).toEqual([]);

    const admin = await masukAdmin();
    await expect(nonaktifkanJadwalTetapToko({ idGudang: bandung, idToko: toko.id })).resolves.toEqual({ keadaan: "berhasil" });

    expect((await jadwalTokoGudang(bandung)).find((t) => t.id === toko.id)?.jadwal).toBeNull();
    expect((await bacaDraftRencana(bandung, SENIN))?.perluDihitungUlang).toContain("jadwal");

    const [satu] = await riwayatJadwal(toko.id);
    expect(satu).toMatchObject({ status: "nonaktif", dinonaktifkanOleh: admin.id });
    expect((await riwayatJadwalTetapGudang(bandung)).get(toko.id)).toMatchObject([
      { id: satu.id, berakhir: { jenis: "dinonaktifkan", oleh: "Uji admin", pada: satu.dinonaktifkanPada } },
    ]);

    // Toko tanpa jadwal aktif tidak bisa dinonaktifkan lagi.
    await expect(nonaktifkanJadwalTetapToko({ idGudang: bandung, idToko: toko.id })).resolves.toEqual({
      keadaan: "gagal",
      pesan: "Toko ini tidak punya jadwal aktif. Muat ulang halaman untuk melihat jadwal terbaru.",
    });
  });
});

describe("salin jadwal admin ke beberapa toko", () => {
  it("3 toko langsung memakai jadwal itu; toko yang tidak terhubung ke gudang itu ditolak dengan pesan", async () => {
    const admin = await masukAdmin();
    const [a, b, c] = [await tokoDiGudang(cibubur), await tokoDiGudang(cibubur), await tokoDiGudang(cibubur)];
    const lain = await tokoDiGudang(bali);

    await expect(salinJadwalTetap({ idGudang: cibubur, daftarIdToko: [a.id, lain.id, b.id, c.id], ...pengaturan })).resolves.toEqual({
      keadaan: "berhasil",
      hasil: [
        { idToko: a.id, status: "berhasil" },
        { idToko: lain.id, status: "ditolak", pesan: "Toko tidak terhubung ke gudang ini. Muat ulang halaman, lalu pilih lagi." },
        { idToko: b.id, status: "berhasil" },
        { idToko: c.id, status: "berhasil" },
      ],
    });
    for (const t of [a, b, c]) {
      expect(await riwayatJadwal(t.id)).toMatchObject([{ status: "aktif", pola: "2x-seminggu", hariKirim: hariKirimTersimpan, dibuatOleh: admin.id }]);
      expect(await daftarUsulan(t.id)).toEqual([]);
    }
    expect(await riwayatJadwal(lain.id)).toEqual([]);
    expect(kepala.dimuatUlang).toEqual([`/admin/jadwal-toko/${cibubur}`, `/pengiriman-gudang/${cibubur}`, `/usulan-jadwal/${cibubur}`]);
  });

  it("tanpa toko terpilih → gagal tanpa menulis", async () => {
    await masukAdmin();
    await expect(salinJadwalTetap({ idGudang: cibubur, daftarIdToko: [], ...pengaturan })).resolves.toEqual({
      keadaan: "gagal",
      pesan: "Pilih minimal satu toko.",
    });
  });

  it("pengaturan tidak valid → setiap toko ditolak validasi, tidak ada yang dimuat ulang", async () => {
    await masukAdmin();
    const [a, b] = [await tokoDiGudang(cibubur), await tokoDiGudang(cibubur)];
    const pesan = "Pola dua mingguan wajib memiliki tanggal jangkar.";
    await expect(
      salinJadwalTetap({ idGudang: cibubur, daftarIdToko: [a.id, b.id], pola: "dua-mingguan", hariKirim: [{ hari: "Senin", persiapan: "H" }], tanggalJangkar: null }),
    ).resolves.toEqual({
      keadaan: "berhasil",
      hasil: [
        { idToko: a.id, status: "ditolak", pesan },
        { idToko: b.id, status: "ditolak", pesan },
      ],
    });
    expect(kepala.dimuatUlang).toEqual([]);
  });

  it("galat tak terduga pada satu toko → belum pasti untuk toko itu, toko lain tetap diproses", async () => {
    const idPengguna = (await buatPenggunaUji("admin")).id;
    const [a, b] = [await tokoDiGudang(bali), await tokoDiGudang(bali)];
    // Id di luar rentang integer PostgreSQL membuat kueri toko itu gagal.
    const idRusak = 2 ** 40;
    const hasil = await salinJadwalKeToko({ idGudang: bali, daftarIdToko: [a.id, idRusak, b.id, a.id], masukan: pengaturan, idPengguna });
    expect(hasil).toEqual([
      { idToko: a.id, status: "berhasil" },
      { idToko: idRusak, status: "belumPasti", pesan: expect.stringContaining("belum pasti") },
      { idToko: b.id, status: "berhasil" },
    ]);
  });
});

describe("kewenangan: hanya admin", () => {
  it("operator berhak jadwal dan viewer ditolak di server sebelum menulis", async () => {
    const t = await tokoDiGudang(pusat);
    const operator = await kepalaPenggunaUji("viewer");
    await tugaskanOperator({ idPengguna: operator.id, idGudang: pusat, hakTindakan: ["kelola-usulan-jadwal"] });
    const viewer = await kepalaPenggunaUji("viewer");

    for (const cookie of [operator.cookie, viewer.cookie]) {
      kepala.cookie = cookie;
      await expect(aturJadwalTetapToko({ idGudang: pusat, idToko: t.id, ...pengaturan })).rejects.toBeInstanceOf(AksesDitolakError);
      await expect(nonaktifkanJadwalTetapToko({ idGudang: pusat, idToko: t.id })).rejects.toBeInstanceOf(AksesDitolakError);
      await expect(salinJadwalTetap({ idGudang: pusat, daftarIdToko: [t.id], ...pengaturan })).rejects.toBeInstanceOf(AksesDitolakError);
    }
    expect(await riwayatJadwal(t.id)).toEqual([]);
  });
});
