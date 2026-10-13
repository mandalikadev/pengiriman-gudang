import { asc, eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { AksesDitolakError } from "@/server/auth/kewenangan";
import { buatPenggunaUji, kepalaPenggunaUji, masukUji } from "@/server/auth/uji-bantu";
import { db } from "@/server/db";
import { hubunganTokoGudang, jadwalToko } from "@/server/db/schema";
import { daftarHakTindakan } from "@/server/gudang/hak-tindakan";
import { jadwalTokoGudang } from "@/server/gudang/jadwal";
import { tugaskanOperator } from "@/server/gudang/penugasan";
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

import { nonaktifkanJadwal, simpanJadwal } from "./aksi";

let pusat: number;
let bali: number;

beforeAll(async () => {
  pusat = await idGudangUji("Pusat");
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

/** Masuk sebagai operator `idGudang` dengan hak tindakan pilihan. */
async function masukOperator(idGudang: number, hakTindakan: (typeof daftarHakTindakan)[number][]) {
  const operator = await kepalaPenggunaUji("viewer");
  await tugaskanOperator({ idPengguna: operator.id, idGudang, hakTindakan });
  kepala.cookie = operator.cookie;
  return operator;
}

const riwayat = (idToko: number) => db.select().from(jadwalToko).where(eq(jadwalToko.tokoId, idToko)).orderBy(asc(jadwalToko.id));

const seninKamis = (idToko: number) => ({
  idGudang: pusat,
  idToko,
  pola: "2x-seminggu",
  hariKirim: [
    { hari: "Kamis", persiapan: "H" },
    { hari: "Senin", persiapan: "H-2" },
  ],
  tanggalJangkar: null,
});

describe("kewenangan menyimpan jadwal Pusat (diperiksa di server)", () => {
  it("operator Pusat dengan kelola-usulan-jadwal bisa menyimpan; jadwal tersimpan dengan pelaku dan waktu", async () => {
    const t = await tokoDiGudang(pusat);
    const operator = await masukOperator(pusat, ["kelola-usulan-jadwal"]);

    await expect(simpanJadwal(seninKamis(t.id))).resolves.toEqual({ keadaan: "berhasil" });
    // T98: halaman Pengiriman Gudang dan kedua halaman jadwal sama-sama segar setelah simpan.
    expect(kepala.dimuatUlang).toEqual([`/pengiriman-gudang/${pusat}`, `/usulan-jadwal/${pusat}`, `/salin-jadwal/${pusat}`]);

    const [baris] = await riwayat(t.id);
    expect(baris).toMatchObject({
      pola: "2x-seminggu",
      // Urut Senin–Minggu; persiapan H−2 = 2 hari, H = 0 hari.
      hariKirim: [
        { hari: "Senin", persiapanHari: 2 },
        { hari: "Kamis", persiapanHari: 0 },
      ],
      tanggalJangkar: null,
      status: "aktif",
      dibuatOleh: operator.id,
    });
    expect(baris.dibuatPada).toBeInstanceOf(Date);

    const daftar = await jadwalTokoGudang(pusat);
    expect(daftar.find((d) => d.id === t.id)?.jadwal).toMatchObject({ versi: baris.id, diaturOleh: "Uji viewer" });
  });

  it("operator Pusat tanpa kelola-usulan-jadwal ditolak tanpa menulis data", async () => {
    const t = await tokoDiGudang(pusat);
    await masukOperator(
      pusat,
      daftarHakTindakan.filter((h) => h !== "kelola-usulan-jadwal"),
    );

    await expect(simpanJadwal(seninKamis(t.id))).rejects.toBeInstanceOf(AksesDitolakError);
    await expect(nonaktifkanJadwal({ idGudang: pusat, idToko: t.id })).rejects.toBeInstanceOf(AksesDitolakError);
    expect(await riwayat(t.id)).toEqual([]);
  });

  it("admin tanpa penugasan ditolak tanpa menulis data", async () => {
    const t = await tokoDiGudang(pusat);
    kepala.cookie = (await kepalaPenggunaUji("admin")).cookie;

    await expect(simpanJadwal(seninKamis(t.id))).rejects.toBeInstanceOf(AksesDitolakError);
    await expect(nonaktifkanJadwal({ idGudang: pusat, idToko: t.id })).rejects.toBeInstanceOf(AksesDitolakError);
    expect(await riwayat(t.id)).toEqual([]);
  });

  it("hak kelola-usulan-jadwal di gudang lain tidak berlaku di Pusat", async () => {
    const t = await tokoDiGudang(pusat);
    await masukOperator(bali, ["kelola-usulan-jadwal"]);

    await expect(simpanJadwal(seninKamis(t.id))).rejects.toBeInstanceOf(AksesDitolakError);
    expect(await riwayat(t.id)).toEqual([]);
  });

  it("pengguna yang belum masuk diarahkan ke halaman masuk tanpa menulis data", async () => {
    const t = await tokoDiGudang(pusat);
    await expect(simpanJadwal(seninKamis(t.id))).rejects.toMatchObject({ digest: expect.stringContaining("/masuk") });
    expect(await riwayat(t.id)).toEqual([]);
  });

  it("gudang selain Pusat tidak bisa mengubah jadwal langsung, walaupun operatornya berhak", async () => {
    const t = await tokoDiGudang(bali);
    await masukOperator(bali, ["kelola-usulan-jadwal"]);

    await expect(simpanJadwal({ ...seninKamis(t.id), idGudang: bali })).resolves.toEqual({
      keadaan: "gagal",
      pesan: "Jadwal gudang ini tidak bisa diubah langsung. Ajukan usulan jadwal untuk disetujui admin.",
    });
    await expect(nonaktifkanJadwal({ idGudang: bali, idToko: t.id })).resolves.toMatchObject({ keadaan: "gagal" });
    expect(await riwayat(t.id)).toEqual([]);
  });
});

describe("operator Pusat yang berhak mengatur jadwal", () => {
  let idOperator: string;

  beforeEach(async () => {
    idOperator = (await masukOperator(pusat, ["kelola-usulan-jadwal"])).id;
  });

  it("jadwal baru untuk toko yang sudah punya jadwal aktif mengganti yang lama dalam satu transaksi; riwayat tetap", async () => {
    const t = await tokoDiGudang(pusat);
    await simpanJadwal(seninKamis(t.id));
    const [lama] = await riwayat(t.id);

    await expect(
      simpanJadwal({
        idGudang: pusat,
        idToko: t.id,
        pola: "dua-mingguan",
        hariKirim: [{ hari: "Senin", persiapan: "H-1" }],
        tanggalJangkar: "2026-06-10",
      }),
    ).resolves.toEqual({ keadaan: "berhasil" });

    const semua = await riwayat(t.id);
    expect(semua).toHaveLength(2);
    expect(semua[0]).toMatchObject({ id: lama.id, pola: "2x-seminggu", status: "nonaktif", dinonaktifkanOleh: idOperator });
    expect(semua[0].dinonaktifkanPada).toBeInstanceOf(Date);
    expect(semua[1]).toMatchObject({
      pola: "dua-mingguan",
      hariKirim: [{ hari: "Senin", persiapanHari: 1 }],
      tanggalJangkar: "2026-06-10",
      status: "aktif",
      dinonaktifkanOleh: null,
    });

    // Sinyal perubahan: versi jadwal aktif toko berganti.
    const jadwal = (await jadwalTokoGudang(pusat)).find((d) => d.id === t.id)?.jadwal;
    expect(jadwal?.versi).toBe(semua[1].id);
    expect(jadwal?.versi).not.toBe(lama.id);
  });

  it("jadwal 1× sebulan tersimpan dengan satu hari kirim; tanggal jangkar yang dikirim diabaikan (T92)", async () => {
    const t = await tokoDiGudang(pusat);
    await expect(
      simpanJadwal({
        idGudang: pusat,
        idToko: t.id,
        pola: "1x-sebulan",
        hariKirim: [{ hari: "Selasa", persiapan: "H-1" }],
        tanggalJangkar: "2026-10-14",
      }),
    ).resolves.toEqual({ keadaan: "berhasil" });

    expect(await riwayat(t.id)).toMatchObject([
      { pola: "1x-sebulan", hariKirim: [{ hari: "Selasa", persiapanHari: 1 }], tanggalJangkar: null, status: "aktif", dibuatOleh: idOperator },
    ]);
  });

  it("database menolak jadwal aktif kedua untuk toko yang sama", async () => {
    const t = await tokoDiGudang(pusat);
    await simpanJadwal(seninKamis(t.id));

    await expect(
      db.insert(jadwalToko).values({
        tokoId: t.id,
        pola: "mingguan",
        hariKirim: [{ hari: "Selasa", persiapanHari: 0 }],
        dibuatOleh: idOperator,
      }),
    ).rejects.toMatchObject({ cause: { constraint_name: "jadwal_toko_satu_aktif" } });
    expect(await riwayat(t.id)).toHaveLength(1);
  });

  it("menyimpan jadwal yang sama dengan jadwal aktif tidak membuat versi baru", async () => {
    const t = await tokoDiGudang(pusat);
    await simpanJadwal(seninKamis(t.id));
    const sebelum = await riwayat(t.id);

    await expect(
      simpanJadwal({ ...seninKamis(t.id), hariKirim: [...seninKamis(t.id).hariKirim].reverse() }),
    ).resolves.toEqual({ keadaan: "berhasil" });
    expect(await riwayat(t.id)).toEqual(sebelum);
  });

  it("jadwal dengan hari Minggu tersimpan, hari kirim urut Senin–Minggu (PRD A5 ▶ Revisi 2026-10-13)", async () => {
    const t = await tokoDiGudang(pusat);

    await expect(
      simpanJadwal({
        idGudang: pusat,
        idToko: t.id,
        pola: "2x-seminggu",
        hariKirim: [
          { hari: "Minggu", persiapan: "H-1" },
          { hari: "Kamis", persiapan: "H" },
        ],
        tanggalJangkar: null,
      }),
    ).resolves.toEqual({ keadaan: "berhasil" });

    const [baris] = await riwayat(t.id);
    expect(baris).toMatchObject({
      pola: "2x-seminggu",
      hariKirim: [
        { hari: "Kamis", persiapanHari: 0 },
        { hari: "Minggu", persiapanHari: 1 },
      ],
      status: "aktif",
    });
  });

  it("isian ditolak dengan pesan dari domain (T54), tanpa menulis data", async () => {
    const t = await tokoDiGudang(pusat);
    const kasus: [Record<string, unknown>, string][] = [
      [
        { pola: "mingguan", hariKirim: [{ hari: "Senin", persiapan: "H" }, { hari: "Rabu", persiapan: "H" }] },
        "Pola mingguan membutuhkan tepat 1 hari kirim, dipilih 2.",
      ],
      [
        { pola: "dua-mingguan", hariKirim: [{ hari: "Senin", persiapan: "H" }], tanggalJangkar: null },
        "Pola dua mingguan wajib memiliki tanggal jangkar.",
      ],
      [{ pola: "mingguan", hariKirim: [{ hari: "Ahad", persiapan: "H" }] }, "Hari kirim tidak dikenal."],
      [{ pola: "harian" }, "Pilih pola jadwal."],
      [{ idToko: "x" }, "Pilih toko."],
    ];
    for (const [ubah, pesan] of kasus) {
      await expect(simpanJadwal({ ...seninKamis(t.id), ...ubah })).resolves.toEqual({ keadaan: "gagal", pesan });
    }
    expect(await riwayat(t.id)).toEqual([]);
  });

  it("toko yang tidak terhubung ke Pusat ditolak", async () => {
    const t = await tokoDiGudang(bali);
    await expect(simpanJadwal(seninKamis(t.id))).resolves.toEqual({
      keadaan: "gagal",
      pesan: "Toko tidak terhubung ke gudang ini. Muat ulang halaman, lalu pilih lagi.",
    });
    expect(await riwayat(t.id)).toEqual([]);
  });

  it("menonaktifkan jadwal mencatat pelaku dan waktu; toko tidak lagi punya jadwal aktif", async () => {
    const t = await tokoDiGudang(pusat);
    await simpanJadwal(seninKamis(t.id));

    await expect(nonaktifkanJadwal({ idGudang: pusat, idToko: t.id })).resolves.toEqual({ keadaan: "berhasil" });
    const [baris] = await riwayat(t.id);
    expect(baris).toMatchObject({ status: "nonaktif", dinonaktifkanOleh: idOperator });
    expect((await jadwalTokoGudang(pusat)).find((d) => d.id === t.id)?.jadwal).toBeNull();

    await expect(nonaktifkanJadwal({ idGudang: pusat, idToko: t.id })).resolves.toEqual({
      keadaan: "gagal",
      pesan: "Toko ini tidak punya jadwal aktif. Muat ulang halaman untuk melihat jadwal terbaru.",
    });
  });

  it("tersimpan tetapi gagal memuat ulang tampilan", async () => {
    const t = await tokoDiGudang(pusat);
    kepala.muatUlangGagal = true;
    await expect(simpanJadwal(seninKamis(t.id))).resolves.toEqual({ keadaan: "tersimpanGagalMuatUlang" });
    expect(await riwayat(t.id)).toHaveLength(1);
  });
});

describe("hak berasal dari penugasan, bukan peran", () => {
  it("admin yang juga ditugaskan di Pusat dengan hak itu bisa menyimpan", async () => {
    const admin = await buatPenggunaUji("admin");
    const t = await tokoDiGudang(pusat);
    await tugaskanOperator({ idPengguna: admin.id, idGudang: pusat, hakTindakan: ["kelola-usulan-jadwal"] });
    kepala.cookie = await masukUji(admin.email);

    await expect(simpanJadwal(seninKamis(t.id))).resolves.toEqual({ keadaan: "berhasil" });
    expect((await riwayat(t.id))[0].dibuatOleh).toBe(admin.id);
  });
});
