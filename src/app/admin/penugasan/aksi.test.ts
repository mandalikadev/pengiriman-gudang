import { and, eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { AksesDitolakError } from "@/server/auth/kewenangan";
import { buatPenggunaUji, kepalaPenggunaUji } from "@/server/auth/uji-bantu";
import { db } from "@/server/db";
import { penugasanOperator } from "@/server/db/schema";
import type { HakTindakan } from "@/server/gudang/hak-tindakan";
import { idGudangUji } from "@/server/gudang/uji-bantu";

const kepala = vi.hoisted(() => ({ cookie: "", muatUlangGagal: false }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(kepala.cookie ? { cookie: kepala.cookie } : {}),
}));
vi.mock("next/cache", () => ({
  revalidatePath: () => {
    if (kepala.muatUlangGagal) throw new Error("gagal memuat ulang");
  },
}));

import { cabutPenugasanOperator, simpanHakTindakan, tugaskanOperator } from "./aksi";

let bali: number;
let bandung: number;

async function hakDi(idPengguna: string, idGudang: number) {
  const baris = await db
    .select({ hak: penugasanOperator.hakTindakan })
    .from(penugasanOperator)
    .where(and(eq(penugasanOperator.userId, idPengguna), eq(penugasanOperator.gudangId, idGudang)));
  return baris.map((b) => b.hak);
}

beforeAll(async () => {
  bali = await idGudangUji("Gudang Bali");
  bandung = await idGudangUji("Gudang Bandung");
});

beforeEach(() => {
  kepala.cookie = "";
  kepala.muatUlangGagal = false;
});

describe("non-admin ditolak di server", () => {
  it("viewer tidak bisa menugaskan, mengubah, atau mencabut penugasan", async () => {
    const target = await buatPenggunaUji("viewer");
    kepala.cookie = (await kepalaPenggunaUji("admin")).cookie;
    await tugaskanOperator({ idPengguna: target.id, idGudang: bali, hakTindakan: ["ekspor"] });

    kepala.cookie = (await kepalaPenggunaUji("viewer")).cookie;
    await expect(
      tugaskanOperator({ idPengguna: target.id, idGudang: bandung, hakTindakan: ["ekspor"] }),
    ).rejects.toBeInstanceOf(AksesDitolakError);
    await expect(
      simpanHakTindakan({ idPengguna: target.id, idGudang: bali, hakTindakan: ["finalisasi"] }),
    ).rejects.toBeInstanceOf(AksesDitolakError);
    await expect(cabutPenugasanOperator({ idPengguna: target.id, idGudang: bali })).rejects.toBeInstanceOf(
      AksesDitolakError,
    );
    expect(await hakDi(target.id, bali)).toEqual([["ekspor"]]);
    expect(await hakDi(target.id, bandung)).toEqual([]);
  });

  it("operator dengan semua hak tindakan tetap tidak bisa mengelola penugasan", async () => {
    const operator = await kepalaPenggunaUji("viewer");
    kepala.cookie = (await kepalaPenggunaUji("admin")).cookie;
    await tugaskanOperator({
      idPengguna: operator.id,
      idGudang: bali,
      hakTindakan: ["kelola-usulan-jadwal", "input-stok", "hitung-kebutuhan", "finalisasi", "ekspor"],
    });

    kepala.cookie = operator.cookie;
    await expect(cabutPenugasanOperator({ idPengguna: operator.id, idGudang: bali })).rejects.toBeInstanceOf(
      AksesDitolakError,
    );
  });

  it("pengguna yang belum masuk diarahkan ke halaman masuk", async () => {
    const target = await buatPenggunaUji("viewer");
    await expect(
      tugaskanOperator({ idPengguna: target.id, idGudang: bali, hakTindakan: ["ekspor"] }),
    ).rejects.toMatchObject({ digest: expect.stringContaining("/masuk") });
    expect(await hakDi(target.id, bali)).toEqual([]);
  });
});

describe("admin mengelola penugasan", () => {
  beforeEach(async () => {
    kepala.cookie = (await kepalaPenggunaUji("admin")).cookie;
  });

  it("menugaskan pengguna ke gudang dengan hak tindakan pilihan (urutan PRD, tanpa duplikat)", async () => {
    const target = await buatPenggunaUji("viewer");
    await expect(
      tugaskanOperator({ idPengguna: target.id, idGudang: bali, hakTindakan: ["ekspor", "input-stok", "ekspor"] }),
    ).resolves.toEqual({ keadaan: "berhasil" });
    expect(await hakDi(target.id, bali)).toEqual([["input-stok", "ekspor"]]);
  });

  it("satu pengguna bisa ditugaskan di beberapa gudang dengan hak berbeda", async () => {
    const target = await buatPenggunaUji("viewer");
    await tugaskanOperator({ idPengguna: target.id, idGudang: bali, hakTindakan: ["input-stok"] });
    await tugaskanOperator({ idPengguna: target.id, idGudang: bandung, hakTindakan: ["finalisasi"] });
    expect(await hakDi(target.id, bali)).toEqual([["input-stok"]]);
    expect(await hakDi(target.id, bandung)).toEqual([["finalisasi"]]);
  });

  it("menugaskan dua kali di gudang yang sama → gagal; hak lama tetap", async () => {
    const target = await buatPenggunaUji("viewer");
    await tugaskanOperator({ idPengguna: target.id, idGudang: bali, hakTindakan: ["input-stok"] });
    await expect(
      tugaskanOperator({ idPengguna: target.id, idGudang: bali, hakTindakan: ["ekspor"] }),
    ).resolves.toEqual({
      keadaan: "gagal",
      pesan: "Pengguna ini sudah ditugaskan di gudang tersebut. Ubah hak tindakannya di daftar penugasan.",
    });
    expect(await hakDi(target.id, bali)).toEqual([["input-stok"]]);
  });

  it("mengubah hak tindakan mengganti seluruh daftarnya", async () => {
    const target = await buatPenggunaUji("viewer");
    await tugaskanOperator({ idPengguna: target.id, idGudang: bali, hakTindakan: ["input-stok"] });
    await expect(
      simpanHakTindakan({ idPengguna: target.id, idGudang: bali, hakTindakan: ["hitung-kebutuhan", "finalisasi"] }),
    ).resolves.toEqual({ keadaan: "berhasil" });
    expect(await hakDi(target.id, bali)).toEqual([["hitung-kebutuhan", "finalisasi"]]);
  });

  it("mencabut penugasan menghapusnya", async () => {
    const target = await buatPenggunaUji("viewer");
    await tugaskanOperator({ idPengguna: target.id, idGudang: bali, hakTindakan: ["input-stok"] });
    await expect(cabutPenugasanOperator({ idPengguna: target.id, idGudang: bali })).resolves.toEqual({
      keadaan: "berhasil",
    });
    expect(await hakDi(target.id, bali)).toEqual([]);
  });

  it("mengubah atau mencabut penugasan yang tidak ada → gagal", async () => {
    const target = await buatPenggunaUji("viewer");
    const pesan = "Penugasan tidak ditemukan. Muat ulang halaman untuk melihat daftar terbaru.";
    await expect(
      simpanHakTindakan({ idPengguna: target.id, idGudang: bali, hakTindakan: ["ekspor"] }),
    ).resolves.toEqual({ keadaan: "gagal", pesan });
    await expect(cabutPenugasanOperator({ idPengguna: target.id, idGudang: bali })).resolves.toEqual({
      keadaan: "gagal",
      pesan,
    });
  });

  it("isian tidak valid → gagal dengan pesan, tanpa menulis data", async () => {
    const target = await buatPenggunaUji("viewer");
    await expect(
      tugaskanOperator({ idPengguna: target.id, idGudang: bali, hakTindakan: ["hapus-semua"] }),
    ).resolves.toMatchObject({ keadaan: "gagal" });
    await expect(
      tugaskanOperator({ idPengguna: "tidak-ada", idGudang: bali, hakTindakan: ["ekspor"] }),
    ).resolves.toEqual({ keadaan: "gagal", pesan: "Pengguna tidak ditemukan." });
    await expect(
      tugaskanOperator({ idPengguna: target.id, idGudang: -1, hakTindakan: ["ekspor"] }),
    ).resolves.toEqual({ keadaan: "gagal", pesan: "Gudang tidak ditemukan." });
    await expect(tugaskanOperator({ idPengguna: "", idGudang: bali, hakTindakan: [] })).resolves.toMatchObject({
      keadaan: "gagal",
    });
    await expect(tugaskanOperator({ idPengguna: target.id, idGudang: "x" })).resolves.toMatchObject({
      keadaan: "gagal",
    });
    expect(await hakDi(target.id, bali)).toEqual([]);
  });

  it("tersimpan tetapi gagal memuat ulang tampilan", async () => {
    kepala.muatUlangGagal = true;
    const target = await buatPenggunaUji("viewer");
    await expect(
      tugaskanOperator({ idPengguna: target.id, idGudang: bali, hakTindakan: ["ekspor"] }),
    ).resolves.toEqual({ keadaan: "tersimpanGagalMuatUlang" });
    expect(await hakDi(target.id, bali)).toEqual([["ekspor"]]);
  });
});

describe("database hanya menerima hak tindakan PRD A3", () => {
  it("hak tindakan yang tidak dikenal ditolak database", async () => {
    const target = await buatPenggunaUji("viewer");
    await expect(
      db.insert(penugasanOperator).values({
        userId: target.id,
        gudangId: bali,
        hakTindakan: ["admin" as unknown as HakTindakan],
      }),
    ).rejects.toThrow();
  });
});
