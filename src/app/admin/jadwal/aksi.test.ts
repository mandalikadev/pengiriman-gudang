import { eq } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { AksesDitolakError } from "@/server/auth/kewenangan";
import { buatPenggunaUji, kepalaPenggunaUji, masukUji } from "@/server/auth/uji-bantu";
import { db } from "@/server/db";
import { hubunganTokoGudang, jadwalToko, pengirimanDiLuarJadwal } from "@/server/db/schema";
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

import { batalkanPengiriman, setujuiPengiriman, tolakPengiriman } from "./aksi";

// T113 — PRD A5 ▶ Revisi 2026-10-13: admin menyetujui atau menolak usulan pengiriman di luar jadwal (syarat diperiksa
// ulang saat disetujui) dan membatalkan pengiriman yang berlaku. Hari ini tetap Kamis 2026-10-15 (WIB).

let cibubur: number;

beforeAll(async () => {
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

async function masukAdmin() {
  const admin = await kepalaPenggunaUji("admin");
  kepala.cookie = admin.cookie;
  return admin;
}

/** Toko uji Cibubur dengan jadwal tetap BOTANI (2× seminggu Senin H, Kamis H−1) dan satu usulan di luar jadwal. */
async function usulanBotani(isian: Partial<typeof pengirimanDiLuarJadwal.$inferInsert> = {}) {
  const t = await buatTokoUji();
  await db.insert(hubunganTokoGudang).values({ tokoId: t.id, gudangId: cibubur });
  const pembuat = await buatPenggunaUji("admin");
  await db.insert(jadwalToko).values({
    tokoId: t.id,
    pola: "2x-seminggu",
    hariKirim: [
      { hari: "Senin", persiapanHari: 0 },
      { hari: "Kamis", persiapanHari: 1 },
    ],
    dibuatOleh: pembuat.id,
  });
  const operator = await buatPenggunaUji("viewer");
  await tugaskanOperator({ idPengguna: operator.id, idGudang: cibubur, hakTindakan: ["kelola-usulan-jadwal"] });
  const [p] = await db
    .insert(pengirimanDiLuarJadwal)
    .values({
      gudangId: cibubur,
      tokoId: t.id,
      jenis: "tambahan",
      tanggalKirim: "2026-10-20",
      persiapanHari: 1,
      alasan: "permintaan mendesak",
      diusulkanOleh: operator.id,
      ...isian,
    })
    .returning();
  return { toko: t, usulan: p, operator };
}

const baca = async (id: number) => (await db.select().from(pengirimanDiLuarJadwal).where(eq(pengirimanDiLuarJadwal.id, id)))[0];

describe("hanya admin yang memutuskan (diperiksa di server)", () => {
  it("operator berhak di gudang itu ditolak tanpa mengubah usulan", async () => {
    const { usulan, operator } = await usulanBotani();
    kepala.cookie = await masukUji(operator.email);
    await expect(setujuiPengiriman({ id: usulan.id })).rejects.toBeInstanceOf(AksesDitolakError);
    await expect(tolakPengiriman({ id: usulan.id, alasan: "x" })).rejects.toBeInstanceOf(AksesDitolakError);
    await expect(batalkanPengiriman({ id: usulan.id, alasan: "x" })).rejects.toBeInstanceOf(AksesDitolakError);
    expect((await baca(usulan.id)).status).toBe("menunggu");
  });
});

describe("admin menyetujui atau menolak", () => {
  it("setujui → Berlaku dengan pemutus dan waktu tercatat", async () => {
    const { usulan } = await usulanBotani();
    const admin = await masukAdmin();

    await expect(setujuiPengiriman({ id: usulan.id })).resolves.toEqual({ keadaan: "berhasil" });
    expect(kepala.dimuatUlang).toEqual(["/admin/jadwal", `/pengiriman-gudang/${cibubur}`, `/usulan-jadwal/${cibubur}`]);
    const p = await baca(usulan.id);
    expect(p).toMatchObject({ status: "berlaku", diputuskanOleh: admin.id, alasanPenolakan: null });
    expect(p.diputuskanPada).toBeInstanceOf(Date);

    await expect(setujuiPengiriman({ id: usulan.id })).resolves.toEqual({
      keadaan: "gagal",
      pesan: "Usulan ini tidak lagi menunggu. Muat ulang halaman untuk melihat statusnya.",
    });
  });

  it("tolak dengan alasan → Ditolak dengan alasan; tolak tanpa alasan ditolak", async () => {
    const { usulan } = await usulanBotani();
    const admin = await masukAdmin();

    await expect(tolakPengiriman({ id: usulan.id, alasan: "  " })).resolves.toEqual({ keadaan: "gagal", pesan: "Isi alasan penolakan." });
    await expect(tolakPengiriman({ id: usulan.id })).resolves.toEqual({ keadaan: "gagal", pesan: "Isi alasan penolakan." });
    expect((await baca(usulan.id)).status).toBe("menunggu");

    await expect(tolakPengiriman({ id: usulan.id, alasan: "stok gudang kosong" })).resolves.toEqual({ keadaan: "berhasil" });
    const p = await baca(usulan.id);
    expect(p).toMatchObject({ status: "ditolak", alasanPenolakan: "stok gudang kosong", diputuskanOleh: admin.id });
    expect(p.diputuskanPada).toBeInstanceOf(Date);
  });

  it("syarat yang tidak lagi terpenuhi saat persetujuan (tanggal rutin sudah final) → persetujuan ditolak dengan pesan", async () => {
    const { toko, usulan } = await usulanBotani({ jenis: "pindah", tanggalRutinDipindah: "2026-10-19", persiapanHari: 0 });
    const admin = await masukAdmin();
    await rencanaFinalUji({ idGudang: cibubur, idToko: toko.id, tanggalKirim: "2026-10-19", idPengguna: admin.id });

    await expect(setujuiPengiriman({ id: usulan.id })).resolves.toEqual({
      keadaan: "gagal",
      pesan: "Usulan tidak bisa disetujui. Syarat tidak terpenuhi: tanggal rutin Senin, 19-10-2026 sudah punya rencana final untuk toko ini.",
    });
    expect((await baca(usulan.id)).status).toBe("menunggu");
  });

  it("tanggal kirim yang sudah lewat saat persetujuan → persetujuan ditolak", async () => {
    const { usulan } = await usulanBotani();
    await masukAdmin();
    vi.setSystemTime(new Date("2026-10-21T09:00:00+07:00"));
    await expect(setujuiPengiriman({ id: usulan.id })).resolves.toMatchObject({
      keadaan: "gagal",
      pesan: expect.stringContaining("tanggal kirim Selasa, 20-10-2026 sudah lewat"),
    });
  });
});

describe("admin membatalkan pengiriman yang berlaku", () => {
  const berlaku = (idAdmin: string) => ({ status: "berlaku" as const, diputuskanOleh: idAdmin, diputuskanPada: new Date() });

  it("berlaku → Dibatalkan dengan alasan, pembatal, dan waktunya; alasan wajib", async () => {
    const pemutus = await buatPenggunaUji("admin");
    const { usulan } = await usulanBotani(berlaku(pemutus.id));
    const admin = await masukAdmin();

    await expect(batalkanPengiriman({ id: usulan.id, alasan: "" })).resolves.toEqual({ keadaan: "gagal", pesan: "Isi alasan pembatalan." });
    await expect(batalkanPengiriman({ id: usulan.id, alasan: "toko renovasi" })).resolves.toEqual({ keadaan: "berhasil" });
    const p = await baca(usulan.id);
    expect(p).toMatchObject({ status: "dibatalkan", alasanPembatalan: "toko renovasi", dibatalkanOleh: admin.id, diputuskanOleh: pemutus.id });
    expect(p.dibatalkanPada).toBeInstanceOf(Date);
  });

  it("ditolak jika tanggal sudah lewat atau sudah ada rencana final; usulan menunggu tidak bisa dibatalkan", async () => {
    const pemutus = await buatPenggunaUji("admin");
    const lewat = await usulanBotani({ ...berlaku(pemutus.id), tanggalKirim: "2026-10-13" });
    const final = await usulanBotani(berlaku(pemutus.id));
    const menunggu = await usulanBotani();
    const admin = await masukAdmin();
    await rencanaFinalUji({ idGudang: cibubur, idToko: final.toko.id, tanggalKirim: "2026-10-20", idPengguna: admin.id });

    await expect(batalkanPengiriman({ id: lewat.usulan.id, alasan: "batal" })).resolves.toEqual({
      keadaan: "gagal",
      pesan: "Tidak bisa dibatalkan: tanggal kirim Selasa, 13-10-2026 sudah lewat.",
    });
    await expect(batalkanPengiriman({ id: final.usulan.id, alasan: "batal" })).resolves.toEqual({
      keadaan: "gagal",
      pesan: "Tidak bisa dibatalkan: toko ini sudah punya rencana final untuk Selasa, 20-10-2026.",
    });
    await expect(batalkanPengiriman({ id: menunggu.usulan.id, alasan: "batal" })).resolves.toEqual({
      keadaan: "gagal",
      pesan: "Hanya pengiriman yang berlaku yang bisa dibatalkan.",
    });
    expect((await baca(lewat.usulan.id)).status).toBe("berlaku");
    expect((await baca(final.usulan.id)).status).toBe("berlaku");
  });
});
