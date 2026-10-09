import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { buatPenggunaUji } from "@/server/auth/uji-bantu";
import { db } from "@/server/db";
import { entriLibur } from "@/server/db/schema";
import { aktifkanSnapshotLibur, muatTinjauSnapshotLibur } from "@/server/libur/aktivasi";
import { buatSnapshotUji, entriSnapshotUji, kejadianTahunUji, snapshotTahunUji, tahunLiburUji } from "@/server/libur/uji-bantu";

// PRD B3: snapshot aktif → arsip (tidak dihapus) dalam satu transaksi; persetujuan pertama disimpan sekali;
// aktivasi ulang adalah kejadian tersendiri; data yang berubah setelah ditinjau harus ditinjau ulang.

let idAdmin: string;
let idAdminLain: string;

beforeAll(async () => {
  idAdmin = (await buatPenggunaUji("admin")).id;
  idAdminLain = (await buatPenggunaUji("admin")).id;
});

const tahunBaru = (tahun: number) => ({ tanggal: `${tahun}-01-01`, keterangan: "Tahun Baru", jenis: "libur nasional" as const });
const natal = (tahun: number) => ({ tanggal: `${tahun}-12-25`, keterangan: "Natal", jenis: "libur nasional" as const });

async function versi(idSnapshot: number) {
  const tinjau = await muatTinjauSnapshotLibur(idSnapshot);
  if (!tinjau) throw new Error(`snapshot ${idSnapshot} tidak ada`);
  return tinjau.versi;
}

async function statusTahun(tahun: number) {
  return (await snapshotTahunUji(tahun)).map((s) => [s.id, s.status]);
}

describe("aktivasi snapshot libur (integrasi)", () => {
  it("snapshot menjadi aktif dan snapshot aktif lama menjadi arsip tanpa dihapus; tercatat sebagai persetujuan", async () => {
    const tahun = await tahunLiburUji();
    const lama = await buatSnapshotUji(tahun, idAdmin, "aktif", [tahunBaru(tahun)]);
    const baru = await buatSnapshotUji(tahun, idAdmin, "menunggu-persetujuan", [tahunBaru(tahun), natal(tahun)]);

    await expect(aktifkanSnapshotLibur(baru.id, await versi(baru.id), idAdmin)).resolves.toEqual({ keadaan: "berhasil" });

    expect(await statusTahun(tahun)).toEqual([
      [lama.id, "diarsipkan"],
      [baru.id, "aktif"],
    ]);
    expect(await entriSnapshotUji(lama.id)).toHaveLength(1);
    expect(await kejadianTahunUji(tahun)).toEqual([{ jenis: "persetujuan", snapshotId: baru.id, pesan: null, pelaku: idAdmin }]);
  });

  it("satu transaksi: jika pencatatan gagal di tengah aktivasi, arsip dan aktivasi dibatalkan bersama", async () => {
    const tahun = await tahunLiburUji();
    const lama = await buatSnapshotUji(tahun, idAdmin, "aktif", [tahunBaru(tahun)]);
    const baru = await buatSnapshotUji(tahun, idAdmin, "menunggu-persetujuan", [natal(tahun)]);

    // Pelaku yang tidak ada melanggar foreign key pada langkah terakhir (pencatatan kejadian).
    await expect(aktifkanSnapshotLibur(baru.id, await versi(baru.id), `tidak-ada-${randomUUID()}`)).rejects.toThrow();

    expect(await statusTahun(tahun)).toEqual([
      [lama.id, "aktif"],
      [baru.id, "menunggu-persetujuan"],
    ]);
    expect(await kejadianTahunUji(tahun)).toEqual([]);
  });

  it("tahun tanpa snapshot aktif: snapshot langsung aktif; snapshot menunggu persetujuan lain di tahun itu tidak diubah", async () => {
    const tahun = await tahunLiburUji();
    const a = await buatSnapshotUji(tahun, idAdmin, "menunggu-persetujuan", [tahunBaru(tahun)]);
    const b = await buatSnapshotUji(tahun, idAdmin, "menunggu-persetujuan", [natal(tahun)]);

    await expect(aktifkanSnapshotLibur(b.id, await versi(b.id), idAdmin)).resolves.toEqual({ keadaan: "berhasil" });
    expect(await statusTahun(tahun)).toEqual([
      [a.id, "menunggu-persetujuan"],
      [b.id, "aktif"],
    ]);
  });

  it("aktivasi ulang snapshot arsip tercatat sebagai kejadian baru; data persetujuan pertama tetap", async () => {
    const tahun = await tahunLiburUji();
    const a = await buatSnapshotUji(tahun, idAdmin, "menunggu-persetujuan", [tahunBaru(tahun)]);
    const b = await buatSnapshotUji(tahun, idAdmin, "menunggu-persetujuan", [tahunBaru(tahun), natal(tahun)]);

    await aktifkanSnapshotLibur(a.id, await versi(a.id), idAdmin);
    const persetujuanPertama = (await muatTinjauSnapshotLibur(a.id))?.persetujuanPertama;
    expect(persetujuanPertama).toMatchObject({ oleh: "Uji admin", pada: expect.any(Date) });

    await aktifkanSnapshotLibur(b.id, await versi(b.id), idAdminLain);
    expect(await statusTahun(tahun)).toEqual([
      [a.id, "diarsipkan"],
      [b.id, "aktif"],
    ]);

    await expect(aktifkanSnapshotLibur(a.id, await versi(a.id), idAdminLain)).resolves.toEqual({ keadaan: "berhasil" });
    expect(await statusTahun(tahun)).toEqual([
      [a.id, "aktif"],
      [b.id, "diarsipkan"],
    ]);
    expect(await kejadianTahunUji(tahun)).toEqual([
      { jenis: "persetujuan", snapshotId: a.id, pesan: null, pelaku: idAdmin },
      { jenis: "persetujuan", snapshotId: b.id, pesan: null, pelaku: idAdminLain },
      { jenis: "aktivasi-ulang", snapshotId: a.id, pesan: null, pelaku: idAdminLain },
    ]);

    const tinjau = await muatTinjauSnapshotLibur(a.id);
    expect(tinjau?.persetujuanPertama).toEqual(persetujuanPertama);
    expect(tinjau?.riwayat.map((r) => r.jenis)).toEqual(["persetujuan", "aktivasi-ulang"]);
  });

  it("snapshot yang berubah setelah ditinjau tidak bisa diaktifkan tanpa tinjau ulang", async () => {
    const tahun = await tahunLiburUji();
    const lama = await buatSnapshotUji(tahun, idAdmin, "aktif", [tahunBaru(tahun)]);
    const baru = await buatSnapshotUji(tahun, idAdmin, "menunggu-persetujuan", [tahunBaru(tahun), natal(tahun)]);
    const versiDitinjau = await versi(baru.id);

    await db
      .update(entriLibur)
      .set({ keterangan: "Hari Raya Natal" })
      .where(and(eq(entriLibur.snapshotId, baru.id), eq(entriLibur.tanggal, `${tahun}-12-25`)));

    await expect(aktifkanSnapshotLibur(baru.id, versiDitinjau, idAdmin)).resolves.toEqual({
      keadaan: "gagal",
      pesan: "Snapshot berubah setelah ditinjau. Muat ulang halaman dan tinjau ulang sebelum mengaktifkan.",
    });
    expect(await statusTahun(tahun)).toEqual([
      [lama.id, "aktif"],
      [baru.id, "menunggu-persetujuan"],
    ]);
    expect(await kejadianTahunUji(tahun)).toEqual([]);

    // Setelah ditinjau ulang (versi baru), aktivasi berhasil.
    await expect(aktifkanSnapshotLibur(baru.id, await versi(baru.id), idAdmin)).resolves.toEqual({ keadaan: "berhasil" });
  });

  it("daftar aktif pembanding berubah setelah ditinjau → perbedaan yang ditinjau sudah usang, aktivasi ditolak", async () => {
    const tahun = await tahunLiburUji();
    const a = await buatSnapshotUji(tahun, idAdmin, "menunggu-persetujuan", [tahunBaru(tahun)]);
    const b = await buatSnapshotUji(tahun, idAdmin, "menunggu-persetujuan", [natal(tahun)]);
    const versiB = await versi(b.id);

    await aktifkanSnapshotLibur(a.id, await versi(a.id), idAdmin);
    await expect(aktifkanSnapshotLibur(b.id, versiB, idAdmin)).resolves.toMatchObject({ keadaan: "gagal" });
    expect(await statusTahun(tahun)).toEqual([
      [a.id, "aktif"],
      [b.id, "menunggu-persetujuan"],
    ]);
  });

  it("snapshot yang sudah aktif atau tidak ada tidak diaktifkan lagi", async () => {
    const tahun = await tahunLiburUji();
    const aktif = await buatSnapshotUji(tahun, idAdmin, "aktif", [tahunBaru(tahun)]);
    await expect(aktifkanSnapshotLibur(aktif.id, await versi(aktif.id), idAdmin)).resolves.toEqual({
      keadaan: "gagal",
      pesan: "Snapshot ini sudah aktif.",
    });
    await expect(aktifkanSnapshotLibur(2_147_483_647, "x", idAdmin)).resolves.toEqual({
      keadaan: "gagal",
      pesan: "Snapshot libur tidak ditemukan.",
    });
    expect(await kejadianTahunUji(tahun)).toEqual([]);
  });
});

describe("muatTinjauSnapshotLibur: perbedaan terhadap snapshot aktif", () => {
  it("menampilkan entri, perbedaan (ditambah/dihapus/berubah), dan snapshot aktif pembanding", async () => {
    const tahun = await tahunLiburUji();
    const lama = await buatSnapshotUji(tahun, idAdmin, "aktif", [
      tahunBaru(tahun),
      { tanggal: `${tahun}-03-20`, keterangan: "Idul Fitri", jenis: "libur nasional" },
      { tanggal: `${tahun}-03-23`, keterangan: "Cuti Bersama Idul Fitri", jenis: "cuti bersama" },
    ]);
    const baru = await buatSnapshotUji(tahun, idAdmin, "menunggu-persetujuan", [
      tahunBaru(tahun),
      { tanggal: `${tahun}-03-23`, keterangan: "Cuti Bersama Idul Fitri", jenis: "libur nasional" },
      natal(tahun),
    ]);

    const tinjau = await muatTinjauSnapshotLibur(baru.id);
    expect(tinjau).toMatchObject({
      id: baru.id,
      tahun,
      status: "menunggu-persetujuan",
      sumber: "uji",
      disinkronkanOleh: "Uji admin",
      idSnapshotAktif: lama.id,
      persetujuanPertama: null,
      riwayat: [],
    });
    expect(tinjau?.entri).toEqual([tahunBaru(tahun), { tanggal: `${tahun}-03-23`, keterangan: "Cuti Bersama Idul Fitri", jenis: "libur nasional" }, natal(tahun)]);
    expect(tinjau?.perubahan?.map((p) => [p.perubahan, p.tanggal])).toEqual([
      ["dihapus", `${tahun}-03-20`],
      ["berubah", `${tahun}-03-23`],
      ["ditambah", `${tahun}-12-25`],
    ]);
  });

  it("snapshot yang sedang aktif tidak dibandingkan dengan dirinya sendiri", async () => {
    const tahun = await tahunLiburUji();
    const aktif = await buatSnapshotUji(tahun, idAdmin, "aktif", [tahunBaru(tahun)]);
    expect(await muatTinjauSnapshotLibur(aktif.id)).toMatchObject({ idSnapshotAktif: aktif.id, perubahan: null });
    expect(await muatTinjauSnapshotLibur(2_147_483_647)).toBeNull();
  });
});
