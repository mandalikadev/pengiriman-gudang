import { asc, eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { AksesDitolakError } from "@/server/auth/kewenangan";
import { buatPenggunaUji, kepalaPenggunaUji, masukUji } from "@/server/auth/uji-bantu";
import { db } from "@/server/db";
import { hubunganTokoGudang, jadwalToko, usulanJadwal } from "@/server/db/schema";
import { daftarHakTindakan } from "@/server/gudang/hak-tindakan";
import { jadwalTokoGudang } from "@/server/gudang/jadwal";
import { tugaskanOperator } from "@/server/gudang/penugasan";
import { buatTokoUji, idGudangUji } from "@/server/gudang/uji-bantu";
import { usulanTerakhirPerToko } from "@/server/gudang/usulan-jadwal";

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

import { simpanJadwal, usulkanJadwal, usulkanNonaktifJadwal } from "./aksi";

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

/** Jadwal aktif yang sudah ada sebelumnya (mis. hasil persetujuan terdahulu). */
async function jadwalAwal(idToko: number) {
  const pembuat = await buatPenggunaUji("admin");
  const [baris] = await db
    .insert(jadwalToko)
    .values({ tokoId: idToko, pola: "mingguan", hariKirim: [{ hari: "Selasa", persiapanHari: 1 }], dibuatOleh: pembuat.id })
    .returning();
  return baris;
}

const riwayatJadwal = (idToko: number) =>
  db.select().from(jadwalToko).where(eq(jadwalToko.tokoId, idToko)).orderBy(asc(jadwalToko.id));
const daftarUsulan = (idToko: number) =>
  db.select().from(usulanJadwal).where(eq(usulanJadwal.tokoId, idToko)).orderBy(asc(usulanJadwal.id));

const seninKamis = (idGudang: number, idToko: number) => ({
  idGudang,
  idToko,
  pola: "2x-seminggu",
  hariKirim: [
    { hari: "Kamis", persiapan: "H" },
    { hari: "Senin", persiapan: "H-2" },
  ],
  tanggalJangkar: null,
});

describe("operator gudang selain Pusat mengusulkan jadwal", () => {
  let idOperator: string;

  beforeEach(async () => {
    idOperator = (await masukOperator(bali, ["kelola-usulan-jadwal"])).id;
  });

  it("usulan menunggu tidak mengubah jadwal aktif", async () => {
    const t = await tokoDiGudang(bali);
    const awal = await jadwalAwal(t.id);

    await expect(usulkanJadwal(seninKamis(bali, t.id))).resolves.toEqual({ keadaan: "berhasil" });
    // T98: halaman Pengiriman Gudang dan kedua halaman jadwal sama-sama segar setelah simpan.
    expect(kepala.dimuatUlang).toEqual([`/pengiriman-gudang/${bali}`, `/usulan-jadwal/${bali}`, `/admin/jadwal-toko/${bali}`]);

    // Jadwal aktif dan versinya tetap.
    expect(await riwayatJadwal(t.id)).toEqual([awal]);
    expect((await jadwalTokoGudang(bali)).find((d) => d.id === t.id)?.jadwal).toMatchObject({
      versi: awal.id,
      pola: "mingguan",
      hariKirim: [{ hari: "Selasa", persiapanHari: 1 }],
    });

    const [usulan] = await daftarUsulan(t.id);
    expect(usulan).toMatchObject({
      jenis: "ubah",
      pola: "2x-seminggu",
      // Urut Senin–Minggu; persiapan H−2 = 2 hari, H = 0 hari.
      hariKirim: [
        { hari: "Senin", persiapanHari: 2 },
        { hari: "Kamis", persiapanHari: 0 },
      ],
      tanggalJangkar: null,
      status: "menunggu",
      diusulkanOleh: idOperator,
      diputuskanOleh: null,
      diputuskanPada: null,
      alasanPenolakan: null,
    });
    expect(usulan.diusulkanPada).toBeInstanceOf(Date);
  });

  it("toko tanpa jadwal aktif → jenis buat; jadwal aktif tetap tidak ada", async () => {
    const t = await tokoDiGudang(bali);
    await expect(
      usulkanJadwal({
        idGudang: bali,
        idToko: t.id,
        pola: "dua-mingguan",
        hariKirim: [{ hari: "Senin", persiapan: "H-1" }],
        tanggalJangkar: "2026-06-10",
      }),
    ).resolves.toEqual({ keadaan: "berhasil" });

    expect(await daftarUsulan(t.id)).toMatchObject([{ jenis: "buat", pola: "dua-mingguan", tanggalJangkar: "2026-06-10" }]);
    expect(await riwayatJadwal(t.id)).toEqual([]);
  });

  it("usulan 1× sebulan berhasil dan menunggu persetujuan; jadwal aktif tetap (T92)", async () => {
    const t = await tokoDiGudang(bali);
    const awal = await jadwalAwal(t.id);
    await expect(
      usulkanJadwal({ idGudang: bali, idToko: t.id, pola: "1x-sebulan", hariKirim: [{ hari: "Senin", persiapan: "H" }], tanggalJangkar: null }),
    ).resolves.toEqual({ keadaan: "berhasil" });

    expect(await daftarUsulan(t.id)).toMatchObject([
      { jenis: "ubah", pola: "1x-sebulan", hariKirim: [{ hari: "Senin", persiapanHari: 0 }], tanggalJangkar: null, status: "menunggu", diusulkanOleh: idOperator },
    ]);
    expect(await riwayatJadwal(t.id)).toEqual([awal]);
  });

  it("usulan penonaktifan → jenis nonaktifkan tanpa isi; jadwal aktif tetap aktif", async () => {
    const t = await tokoDiGudang(bali);
    const awal = await jadwalAwal(t.id);

    await expect(usulkanNonaktifJadwal({ idGudang: bali, idToko: t.id })).resolves.toEqual({ keadaan: "berhasil" });
    expect(await daftarUsulan(t.id)).toMatchObject([
      { jenis: "nonaktifkan", pola: null, hariKirim: null, tanggalJangkar: null, status: "menunggu" },
    ]);
    expect(await riwayatJadwal(t.id)).toEqual([awal]);
  });

  it("penonaktifan ditolak jika toko tidak punya jadwal aktif", async () => {
    const t = await tokoDiGudang(bali);
    await expect(usulkanNonaktifJadwal({ idGudang: bali, idToko: t.id })).resolves.toEqual({
      keadaan: "gagal",
      pesan: "Toko ini tidak punya jadwal aktif. Muat ulang halaman untuk melihat jadwal terbaru.",
    });
    expect(await daftarUsulan(t.id)).toEqual([]);
  });

  it("satu usulan menunggu per toko", async () => {
    const t = await tokoDiGudang(bali);
    await jadwalAwal(t.id);
    await usulkanJadwal(seninKamis(bali, t.id));

    const pesan = "Toko ini masih punya usulan jadwal yang menunggu persetujuan admin.";
    await expect(
      usulkanJadwal({ ...seninKamis(bali, t.id), pola: "mingguan", hariKirim: [{ hari: "Rabu", persiapan: "H" }] }),
    ).resolves.toEqual({ keadaan: "gagal", pesan });
    await expect(usulkanNonaktifJadwal({ idGudang: bali, idToko: t.id })).resolves.toEqual({ keadaan: "gagal", pesan });
    expect(await daftarUsulan(t.id)).toHaveLength(1);

    // Database juga menolak usulan menunggu kedua.
    await expect(
      db.insert(usulanJadwal).values({ tokoId: t.id, jenis: "nonaktifkan", diusulkanOleh: idOperator }),
    ).rejects.toMatchObject({ cause: { constraint_name: "usulan_jadwal_satu_menunggu" } });
  });

  it("usulan yang sama dengan jadwal aktif ditolak", async () => {
    const t = await tokoDiGudang(bali);
    await jadwalAwal(t.id);
    await expect(
      usulkanJadwal({ idGudang: bali, idToko: t.id, pola: "mingguan", hariKirim: [{ hari: "Selasa", persiapan: "H-1" }], tanggalJangkar: null }),
    ).resolves.toEqual({
      keadaan: "gagal",
      pesan: "Usulan sama dengan jadwal aktif. Ubah dulu pola, hari kirim, atau tanggal jangkar.",
    });
    expect(await daftarUsulan(t.id)).toEqual([]);
  });

  it("isian ditolak dengan pesan dari domain (T54), tanpa menulis data", async () => {
    const t = await tokoDiGudang(bali);
    await expect(
      usulkanJadwal({ ...seninKamis(bali, t.id), pola: "mingguan" }),
    ).resolves.toEqual({ keadaan: "gagal", pesan: "Pola mingguan membutuhkan tepat 1 hari kirim, dipilih 2." });
    await expect(
      usulkanJadwal({ ...seninKamis(bali, t.id), pola: "dua-mingguan", hariKirim: [{ hari: "Senin", persiapan: "H" }] }),
    ).resolves.toEqual({ keadaan: "gagal", pesan: "Pola dua mingguan wajib memiliki tanggal jangkar." });
    expect(await daftarUsulan(t.id)).toEqual([]);
  });

  it("toko yang tidak terhubung ke gudang itu ditolak", async () => {
    const t = await tokoDiGudang(bandung);
    await expect(usulkanJadwal(seninKamis(bali, t.id))).resolves.toEqual({
      keadaan: "gagal",
      pesan: "Toko tidak terhubung ke gudang ini. Muat ulang halaman, lalu pilih lagi.",
    });
    expect(await daftarUsulan(t.id)).toEqual([]);
  });

  it("status usulan terakhir per toko untuk halaman Pengiriman Gudang", async () => {
    const t = await tokoDiGudang(bali);
    const tanpaUsulan = await tokoDiGudang(bali);
    await usulkanJadwal(seninKamis(bali, t.id));

    const status = await usulanTerakhirPerToko(bali);
    expect(status.get(t.id)).toMatchObject({ jenis: "buat", status: "menunggu", diusulkanOleh: "Uji viewer", alasanPenolakan: null });
    expect(status.has(tanpaUsulan.id)).toBe(false);
  });

  it("tersimpan tetapi gagal memuat ulang tampilan", async () => {
    const t = await tokoDiGudang(bali);
    kepala.muatUlangGagal = true;
    await expect(usulkanJadwal(seninKamis(bali, t.id))).resolves.toEqual({ keadaan: "tersimpanGagalMuatUlang" });
    expect(await daftarUsulan(t.id)).toHaveLength(1);
  });
});

describe("kewenangan membuat usulan (diperiksa di server)", () => {
  it("admin tanpa penugasan berhak tidak bisa membuat usulan", async () => {
    const t = await tokoDiGudang(bali);
    kepala.cookie = (await kepalaPenggunaUji("admin")).cookie;

    await expect(usulkanJadwal(seninKamis(bali, t.id))).rejects.toBeInstanceOf(AksesDitolakError);
    await expect(usulkanNonaktifJadwal({ idGudang: bali, idToko: t.id })).rejects.toBeInstanceOf(AksesDitolakError);
    expect(await daftarUsulan(t.id)).toEqual([]);
  });

  it("admin yang ditugaskan di gudang itu tanpa kelola-usulan-jadwal juga ditolak", async () => {
    const admin = await buatPenggunaUji("admin");
    const t = await tokoDiGudang(bali);
    await tugaskanOperator({ idPengguna: admin.id, idGudang: bali, hakTindakan: ["input-stok"] });
    kepala.cookie = await masukUji(admin.email);

    await expect(usulkanJadwal(seninKamis(bali, t.id))).rejects.toBeInstanceOf(AksesDitolakError);
    expect(await daftarUsulan(t.id)).toEqual([]);
  });

  it("operator tanpa kelola-usulan-jadwal, atau berhak di gudang lain, ditolak", async () => {
    const t = await tokoDiGudang(bali);
    await masukOperator(
      bali,
      daftarHakTindakan.filter((h) => h !== "kelola-usulan-jadwal"),
    );
    await expect(usulkanJadwal(seninKamis(bali, t.id))).rejects.toBeInstanceOf(AksesDitolakError);

    await masukOperator(bandung, ["kelola-usulan-jadwal"]);
    await expect(usulkanJadwal(seninKamis(bali, t.id))).rejects.toBeInstanceOf(AksesDitolakError);
    expect(await daftarUsulan(t.id)).toEqual([]);
  });

  it("pengguna yang belum masuk diarahkan ke halaman masuk", async () => {
    const t = await tokoDiGudang(bali);
    await expect(usulkanJadwal(seninKamis(bali, t.id))).rejects.toMatchObject({ digest: expect.stringContaining("/masuk") });
    expect(await daftarUsulan(t.id)).toEqual([]);
  });
});

describe("operator Pusat tetap mengubah langsung (T55 tidak terpengaruh)", () => {
  it("simpan jadwal Pusat langsung menjadi jadwal aktif, tanpa usulan", async () => {
    const t = await tokoDiGudang(pusat);
    await masukOperator(pusat, ["kelola-usulan-jadwal"]);

    await expect(simpanJadwal(seninKamis(pusat, t.id))).resolves.toEqual({ keadaan: "berhasil" });
    expect(await riwayatJadwal(t.id)).toMatchObject([{ pola: "2x-seminggu", status: "aktif" }]);
    expect(await daftarUsulan(t.id)).toEqual([]);
  });

  it("gudang Pusat tidak memakai usulan", async () => {
    const t = await tokoDiGudang(pusat);
    await masukOperator(pusat, ["kelola-usulan-jadwal"]);

    const pesan = "Jadwal gudang Pusat diatur langsung, tanpa usulan.";
    await expect(usulkanJadwal(seninKamis(pusat, t.id))).resolves.toEqual({ keadaan: "gagal", pesan });
    await expect(usulkanNonaktifJadwal({ idGudang: pusat, idToko: t.id })).resolves.toEqual({ keadaan: "gagal", pesan });
    expect(await daftarUsulan(t.id)).toEqual([]);
    expect(await riwayatJadwal(t.id)).toEqual([]);
  });
});
