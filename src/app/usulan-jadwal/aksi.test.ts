import { existsSync } from "node:fs";
import { join } from "node:path";

import { asc, eq } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { AksesDitolakError } from "@/server/auth/kewenangan";
import { buatPenggunaUji, kepalaPenggunaUji } from "@/server/auth/uji-bantu";
import { db } from "@/server/db";
import { hubunganTokoGudang, jadwalToko, pengirimanDiLuarJadwal } from "@/server/db/schema";
import type { HakTindakan } from "@/server/gudang/hak-tindakan";
import { tugaskanOperator } from "@/server/gudang/penugasan";
import { buatTokoUji, idGudangUji, rencanaFinalUji } from "@/server/gudang/uji-bantu";

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

import * as aksi from "./aksi";

const { batalkanPengirimanPusat, tarikPengiriman, usulkanPengiriman } = aksi;

// T113 — PRD A5 ▶ Revisi 2026-10-13: operator mengusulkan pengiriman di luar jadwal (tambahan atau pindah) untuk satu
// toko pada satu tanggal, tanpa mengubah jadwal tetap. Hari ini dibuat tetap Kamis 2026-10-15 (WIB) agar contoh BOTANI
// di PRD (Senin 19-10, Selasa 20-10) selalu di masa depan.

let pusat: number;
let cibubur: number;

beforeAll(async () => {
  pusat = await idGudangUji("Pusat");
  cibubur = await idGudangUji("Gudang Cibubur");
});

beforeEach(() => {
  kepala.cookie = "";
  kepala.muatUlangGagal = false;
  kepala.dimuatUlang = [];
  vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-15T09:00:00+07:00") });
});

afterEach(() => {
  vi.useRealTimers();
});

async function masukOperator(idGudang: number, hakTindakan: HakTindakan[] = ["kelola-usulan-jadwal"]) {
  const operator = await kepalaPenggunaUji("viewer");
  await tugaskanOperator({ idPengguna: operator.id, idGudang, hakTindakan });
  kepala.cookie = operator.cookie;
  return operator;
}

/** Toko uji dengan jadwal tetap BOTANI: 2× seminggu Senin (H) dan Kamis (H−1). */
async function tokoBotani(idGudang: number, { berjadwal = true } = {}) {
  const t = await buatTokoUji();
  await db.insert(hubunganTokoGudang).values({ tokoId: t.id, gudangId: idGudang });
  if (berjadwal) {
    const admin = await buatPenggunaUji("admin");
    await db.insert(jadwalToko).values({
      tokoId: t.id,
      pola: "2x-seminggu",
      hariKirim: [
        { hari: "Senin", persiapanHari: 0 },
        { hari: "Kamis", persiapanHari: 1 },
      ],
      dibuatOleh: admin.id,
    });
  }
  return t;
}

const pengirimanToko = (idToko: number) =>
  db.select().from(pengirimanDiLuarJadwal).where(eq(pengirimanDiLuarJadwal.tokoId, idToko)).orderBy(asc(pengirimanDiLuarJadwal.id));
const jadwalTetapToko = (idToko: number) => db.select().from(jadwalToko).where(eq(jadwalToko.tokoId, idToko)).orderBy(asc(jadwalToko.id));

const tambahan = (idGudang: number, idToko: number, ubah: Record<string, unknown> = {}) => ({
  idGudang,
  idToko,
  jenis: "tambahan",
  tanggalKirim: "2026-10-20",
  persiapan: "H-1",
  tanggalRutinDipindah: null,
  alasan: "permintaan mendesak",
  ...ubah,
});

const pindah = (idGudang: number, idToko: number, ubah: Record<string, unknown> = {}) =>
  tambahan(idGudang, idToko, { jenis: "pindah", tanggalRutinDipindah: "2026-10-19", persiapan: "H", ...ubah });

describe("operator gudang selain Pusat mengusulkan pengiriman di luar jadwal", () => {
  it("Tambahan BOTANI Selasa 2026-10-20 (H−1) → Menunggu; jadwal tetap tidak berubah", async () => {
    const t = await tokoBotani(cibubur);
    const jadwalAwal = await jadwalTetapToko(t.id);
    const operator = await masukOperator(cibubur);

    await expect(usulkanPengiriman(tambahan(cibubur, t.id))).resolves.toEqual({ keadaan: "berhasil" });
    expect(kepala.dimuatUlang).toEqual([`/usulan-jadwal/${cibubur}`, `/pengiriman-gudang/${cibubur}`, "/admin/jadwal"]);

    const [p] = await pengirimanToko(t.id);
    expect(p).toMatchObject({
      gudangId: cibubur,
      jenis: "tambahan",
      tanggalKirim: "2026-10-20",
      persiapanHari: 1,
      tanggalRutinDipindah: null,
      alasan: "permintaan mendesak",
      status: "menunggu",
      diusulkanOleh: operator.id,
      diputuskanOleh: null,
      diputuskanPada: null,
    });
    expect(await jadwalTetapToko(t.id)).toEqual(jadwalAwal);
  });

  it("Pindah Senin 19-10 ke Selasa 20-10 tersimpan dengan tanggal rutin yang dipindah", async () => {
    const t = await tokoBotani(cibubur);
    await masukOperator(cibubur);

    await expect(usulkanPengiriman(pindah(cibubur, t.id))).resolves.toEqual({ keadaan: "berhasil" });
    expect(await pengirimanToko(t.id)).toMatchObject([
      { jenis: "pindah", tanggalKirim: "2026-10-20", tanggalRutinDipindah: "2026-10-19", persiapanHari: 0, status: "menunggu" },
    ]);
  });

  it("satu toko boleh punya beberapa usulan dengan tanggal berbeda", async () => {
    const t = await tokoBotani(cibubur);
    await masukOperator(cibubur);
    await expect(usulkanPengiriman(tambahan(cibubur, t.id))).resolves.toEqual({ keadaan: "berhasil" });
    await expect(usulkanPengiriman(tambahan(cibubur, t.id, { tanggalKirim: "2026-10-21" }))).resolves.toEqual({ keadaan: "berhasil" });
    expect(await pengirimanToko(t.id)).toHaveLength(2);
  });
});

describe("syarat PRD A5 diperiksa saat diusulkan (masing-masing ditolak dengan pesan)", () => {
  const kasus: [string, (idToko: number) => Record<string, unknown>, RegExp][] = [
    ["tanggal lampau", (id) => tambahan(cibubur, id, { tanggalKirim: "2026-10-14" }), /tanggal kirim Rabu, 14-10-2026 sudah lewat/],
    ["tanggal yang sudah tanggal kirim rutin", (id) => tambahan(cibubur, id, { tanggalKirim: "2026-10-19" }), /Senin, 19-10-2026 sudah menjadi tanggal kirim toko ini/],
    ["pindah dari tanggal yang bukan tanggal rutin", (id) => pindah(cibubur, id, { tanggalRutinDipindah: "2026-10-21", tanggalKirim: "2026-10-24" }), /Rabu, 21-10-2026 bukan tanggal kirim rutin/],
    ["alasan kosong", (id) => tambahan(cibubur, id, { alasan: "   " }), /^Isi alasan\.$/],
  ];
  for (const [nama, isian, pesan] of kasus) {
    it(nama, async () => {
      const t = await tokoBotani(cibubur);
      await masukOperator(cibubur);
      const hasil = await usulkanPengiriman(isian(t.id));
      expect(hasil).toMatchObject({ keadaan: "gagal", pesan: expect.stringMatching(pesan) });
      expect(await pengirimanToko(t.id)).toEqual([]);
    });
  }

  it("pindah dari tanggal rutin yang sudah punya rencana final", async () => {
    const t = await tokoBotani(cibubur);
    const operator = await masukOperator(cibubur);
    await rencanaFinalUji({ idGudang: cibubur, idToko: t.id, tanggalKirim: "2026-10-19", idPengguna: operator.id });

    await expect(usulkanPengiriman(pindah(cibubur, t.id))).resolves.toEqual({
      keadaan: "gagal",
      pesan: "Syarat tidak terpenuhi: tanggal rutin Senin, 19-10-2026 sudah punya rencana final untuk toko ini.",
    });
    expect(await pengirimanToko(t.id)).toEqual([]);
  });

  it("toko tanpa jadwal tetap", async () => {
    const t = await tokoBotani(cibubur, { berjadwal: false });
    await masukOperator(cibubur);
    await expect(usulkanPengiriman(tambahan(cibubur, t.id))).resolves.toEqual({
      keadaan: "gagal",
      pesan: "Syarat tidak terpenuhi: toko ini tidak punya jadwal tetap aktif.",
    });
    expect(await pengirimanToko(t.id)).toEqual([]);
  });

  it("usulan ganda untuk toko + tanggal yang sama; juga tanggal rutin yang sudah dipindah usulan lain", async () => {
    const t = await tokoBotani(cibubur);
    await masukOperator(cibubur);
    await expect(usulkanPengiriman(pindah(cibubur, t.id))).resolves.toEqual({ keadaan: "berhasil" });

    await expect(usulkanPengiriman(tambahan(cibubur, t.id))).resolves.toEqual({
      keadaan: "gagal",
      pesan: "Syarat tidak terpenuhi: toko ini sudah punya usulan pengiriman di luar jadwal pada Selasa, 20-10-2026.",
    });
    await expect(usulkanPengiriman(pindah(cibubur, t.id, { tanggalKirim: "2026-10-21" }))).resolves.toEqual({
      keadaan: "gagal",
      pesan: "Syarat tidak terpenuhi: tanggal rutin Senin, 19-10-2026 sudah dipindah oleh pengiriman lain.",
    });
    expect(await pengirimanToko(t.id)).toHaveLength(1);
  });

  it("database menolak dua pengiriman menunggu/berlaku untuk toko + tanggal kirim yang sama", async () => {
    const t = await tokoBotani(cibubur);
    const operator = await buatPenggunaUji("viewer");
    const baris = { gudangId: cibubur, tokoId: t.id, jenis: "tambahan" as const, tanggalKirim: "2026-10-20", persiapanHari: 1 as const, alasan: "uji", diusulkanOleh: operator.id };
    await db.insert(pengirimanDiLuarJadwal).values(baris);
    await expect(db.insert(pengirimanDiLuarJadwal).values(baris)).rejects.toThrow();
    // Status tanpa isian yang sesuai ditolak kendala database.
    await expect(db.insert(pengirimanDiLuarJadwal).values({ ...baris, tanggalKirim: "2026-10-21", status: "ditolak" })).rejects.toThrow();
  });
});

describe("gudang Pusat", () => {
  it("usulan langsung Berlaku tanpa persetujuan; operator Pusat bisa membatalkan dengan alasan", async () => {
    const t = await tokoBotani(pusat);
    const operator = await masukOperator(pusat);

    await expect(usulkanPengiriman(tambahan(pusat, t.id))).resolves.toEqual({ keadaan: "berhasil" });
    const [p] = await pengirimanToko(t.id);
    expect(p).toMatchObject({ status: "berlaku", diusulkanOleh: operator.id, diputuskanOleh: null });

    await expect(batalkanPengirimanPusat({ idGudang: pusat, id: p.id, alasan: "" })).resolves.toEqual({
      keadaan: "gagal",
      pesan: "Isi alasan pembatalan.",
    });
    await expect(batalkanPengirimanPusat({ idGudang: pusat, id: p.id, alasan: "toko tutup" })).resolves.toEqual({ keadaan: "berhasil" });
    const [batal] = await pengirimanToko(t.id);
    expect(batal).toMatchObject({ status: "dibatalkan", alasanPembatalan: "toko tutup", dibatalkanOleh: operator.id });
    expect(batal.dibatalkanPada).toBeInstanceOf(Date);
  });

  it("operator gudang selain Pusat tidak bisa membatalkan pengiriman berlaku", async () => {
    const t = await tokoBotani(cibubur);
    const admin = await buatPenggunaUji("admin");
    const [p] = await db
      .insert(pengirimanDiLuarJadwal)
      .values({ gudangId: cibubur, tokoId: t.id, jenis: "tambahan", tanggalKirim: "2026-10-20", persiapanHari: 1, alasan: "uji", status: "berlaku", diusulkanOleh: admin.id, diputuskanOleh: admin.id, diputuskanPada: new Date() })
      .returning();
    await masukOperator(cibubur);

    await expect(batalkanPengirimanPusat({ idGudang: cibubur, id: p.id, alasan: "ingin batal" })).resolves.toEqual({
      keadaan: "gagal",
      pesan: "Pengiriman di luar jadwal gudang ini hanya bisa dibatalkan admin.",
    });
    expect((await pengirimanToko(t.id))[0].status).toBe("berlaku");
  });
});

describe("menarik usulan", () => {
  it("pengusul menarik usulan menunggu → Ditarik; pengguna lain tidak bisa menarik", async () => {
    const t = await tokoBotani(cibubur);
    const pengusul = await masukOperator(cibubur);
    await usulkanPengiriman(tambahan(cibubur, t.id));
    const [p] = await pengirimanToko(t.id);

    await masukOperator(cibubur);
    await expect(tarikPengiriman({ idGudang: cibubur, id: p.id })).resolves.toEqual({
      keadaan: "gagal",
      pesan: "Hanya pengusul yang bisa menarik usulan ini.",
    });
    expect((await pengirimanToko(t.id))[0].status).toBe("menunggu");

    kepala.cookie = pengusul.cookie;
    await expect(tarikPengiriman({ idGudang: cibubur, id: p.id })).resolves.toEqual({ keadaan: "berhasil" });
    const [ditarik] = await pengirimanToko(t.id);
    expect(ditarik).toMatchObject({ status: "ditarik", diputuskanOleh: null });
    expect(ditarik.ditarikPada).toBeInstanceOf(Date);

    // Setelah ditarik, tanggal itu bisa diusulkan lagi.
    await expect(usulkanPengiriman(tambahan(cibubur, t.id))).resolves.toEqual({ keadaan: "berhasil" });
  });
});

describe("kewenangan (diperiksa di server)", () => {
  it("operator tanpa hak kelola-usulan-jadwal dan admin tanpa penugasan ditolak tanpa menulis data", async () => {
    const t = await tokoBotani(cibubur);
    await masukOperator(cibubur, ["input-stok"]);
    await expect(usulkanPengiriman(tambahan(cibubur, t.id))).rejects.toBeInstanceOf(AksesDitolakError);
    kepala.cookie = (await kepalaPenggunaUji("admin")).cookie;
    await expect(usulkanPengiriman(tambahan(cibubur, t.id))).rejects.toBeInstanceOf(AksesDitolakError);
    expect(await pengirimanToko(t.id)).toEqual([]);
  });

  it("hak di gudang lain tidak berlaku: toko gudang Cibubur diusulkan lewat Pusat ditolak", async () => {
    const t = await tokoBotani(cibubur);
    await masukOperator(pusat);
    await expect(usulkanPengiriman(tambahan(pusat, t.id))).resolves.toEqual({
      keadaan: "gagal",
      pesan: "Syarat tidak terpenuhi: toko tidak terhubung ke gudang ini.",
    });
  });

  it("tersimpan tetapi gagal memuat ulang tampilan", async () => {
    const t = await tokoBotani(cibubur);
    await masukOperator(cibubur);
    kepala.muatUlangGagal = true;
    await expect(usulkanPengiriman(tambahan(cibubur, t.id))).resolves.toEqual({ keadaan: "tersimpanGagalMuatUlang" });
  });
});

describe("alur lama dihapus: operator tidak bisa lagi membuat atau mengubah jadwal tetap", () => {
  it("aksi operator hanya usulan, tarik, dan batal pengiriman di luar jadwal; aksi jadwal lama tidak ada", () => {
    expect(Object.keys(aksi).sort()).toEqual(["batalkanPengirimanPusat", "tarikPengiriman", "usulkanPengiriman"]);
    expect(existsSync(join(import.meta.dirname, "../pengiriman-gudang/[id]/aksi.ts"))).toBe(false);
    expect(existsSync(join(import.meta.dirname, "../../server/gudang/usulan-jadwal.ts"))).toBe(false);
  });
});
