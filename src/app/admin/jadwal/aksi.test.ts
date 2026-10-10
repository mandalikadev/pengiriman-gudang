import { asc, eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { AksesDitolakError } from "@/server/auth/kewenangan";
import { buatPenggunaUji, kepalaPenggunaUji } from "@/server/auth/uji-bantu";
import { db } from "@/server/db";
import { hubunganTokoGudang, jadwalToko, usulanJadwal } from "@/server/db/schema";
import { jadwalTokoGudang } from "@/server/gudang/jadwal";
import { tugaskanOperator } from "@/server/gudang/penugasan";
import { buatTokoUji, idGudangUji } from "@/server/gudang/uji-bantu";
import { daftarUsulanMenunggu, usulkanJadwalToko, usulkanNonaktifJadwalToko } from "@/server/gudang/usulan-jadwal";

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

import { setujuiUsulan, tolakUsulan } from "./aksi";

let pusat: number;
let cibubur: number;
let idPengusul: string;

beforeAll(async () => {
  pusat = await idGudangUji("Pusat");
  cibubur = await idGudangUji("Gudang Cibubur");
  idPengusul = (await buatPenggunaUji("viewer")).id;
});

beforeEach(() => {
  kepala.cookie = "";
  kepala.muatUlangGagal = false;
  kepala.dimuatUlang = [];
});

async function tokoCibubur() {
  const t = await buatTokoUji();
  await db.insert(hubunganTokoGudang).values({ tokoId: t.id, gudangId: cibubur });
  return t;
}

async function jadwalAwal(idToko: number) {
  const [baris] = await db
    .insert(jadwalToko)
    .values({ tokoId: idToko, pola: "mingguan", hariKirim: [{ hari: "Selasa", persiapanHari: 1 }], dibuatOleh: idPengusul })
    .returning();
  return baris;
}

/** Usulan perubahan menjadi 2× seminggu Senin (H−2) + Kamis (H). */
async function usulkanSeninKamis(idToko: number) {
  await usulkanJadwalToko({
    idGudang: cibubur,
    idToko,
    masukan: {
      pola: "2x-seminggu",
      hariKirim: [
        { hari: "Senin", persiapan: "H-2" },
        { hari: "Kamis", persiapan: "H" },
      ],
      tanggalJangkar: null,
    },
    idPengguna: idPengusul,
  });
  const [usulan] = await db.select().from(usulanJadwal).where(eq(usulanJadwal.tokoId, idToko));
  return usulan;
}

const riwayatJadwal = (idToko: number) =>
  db.select().from(jadwalToko).where(eq(jadwalToko.tokoId, idToko)).orderBy(asc(jadwalToko.id));
const bacaUsulan = async (id: number) => (await db.select().from(usulanJadwal).where(eq(usulanJadwal.id, id)))[0];

async function masukAdmin() {
  const admin = await kepalaPenggunaUji("admin");
  kepala.cookie = admin.cookie;
  return admin;
}

describe("hanya admin yang bisa menyetujui atau menolak (diperiksa di server)", () => {
  it("operator berhak di gudang itu ditolak, tanpa mengubah usulan maupun jadwal", async () => {
    const t = await tokoCibubur();
    const awal = await jadwalAwal(t.id);
    const usulan = await usulkanSeninKamis(t.id);
    const operator = await kepalaPenggunaUji("viewer");
    await tugaskanOperator({ idPengguna: operator.id, idGudang: cibubur, hakTindakan: ["kelola-usulan-jadwal"] });
    kepala.cookie = operator.cookie;

    await expect(setujuiUsulan({ idUsulan: usulan.id })).rejects.toBeInstanceOf(AksesDitolakError);
    await expect(tolakUsulan({ idUsulan: usulan.id, alasan: "Tidak sesuai" })).rejects.toBeInstanceOf(AksesDitolakError);
    expect(await bacaUsulan(usulan.id)).toEqual(usulan);
    expect(await riwayatJadwal(t.id)).toEqual([awal]);
  });

  it("pengguna yang belum masuk diarahkan ke halaman masuk", async () => {
    const t = await tokoCibubur();
    const usulan = await usulkanSeninKamis(t.id);
    await expect(setujuiUsulan({ idUsulan: usulan.id })).rejects.toMatchObject({ digest: expect.stringContaining("/masuk") });
    expect((await bacaUsulan(usulan.id)).status).toBe("menunggu");
  });
});

describe("admin menyetujui usulan", () => {
  it("jadwal aktif berganti dalam satu transaksi; versi berganti (sinyal T61); usulan mencatat penyetuju", async () => {
    const t = await tokoCibubur();
    const awal = await jadwalAwal(t.id);
    const usulan = await usulkanSeninKamis(t.id);
    const admin = await masukAdmin();

    await expect(setujuiUsulan({ idUsulan: usulan.id })).resolves.toEqual({ keadaan: "berhasil" });
    expect(kepala.dimuatUlang).toEqual(["/admin/jadwal", `/pengiriman-gudang/${cibubur}`]);

    const semua = await riwayatJadwal(t.id);
    expect(semua).toHaveLength(2);
    expect(semua[0]).toMatchObject({ id: awal.id, status: "nonaktif", dinonaktifkanOleh: admin.id });
    expect(semua[1]).toMatchObject({
      pola: "2x-seminggu",
      hariKirim: [
        { hari: "Senin", persiapanHari: 2 },
        { hari: "Kamis", persiapanHari: 0 },
      ],
      status: "aktif",
    });

    const jadwal = (await jadwalTokoGudang(cibubur)).find((d) => d.id === t.id)?.jadwal;
    expect(jadwal?.versi).toBe(semua[1].id);
    expect(jadwal?.versi).not.toBe(awal.id);

    const sesudah = await bacaUsulan(usulan.id);
    expect(sesudah).toMatchObject({ status: "disetujui", diputuskanOleh: admin.id, alasanPenolakan: null });
    expect(sesudah.diputuskanPada).toBeInstanceOf(Date);
    expect((await daftarUsulanMenunggu()).some((u) => u.id === usulan.id)).toBe(false);
  });

  it("usulan buat menjadi jadwal aktif pertama toko", async () => {
    const t = await tokoCibubur();
    const usulan = await usulkanSeninKamis(t.id);
    expect(usulan.jenis).toBe("buat");
    await masukAdmin();

    await expect(setujuiUsulan({ idUsulan: usulan.id })).resolves.toEqual({ keadaan: "berhasil" });
    expect(await riwayatJadwal(t.id)).toMatchObject([{ pola: "2x-seminggu", status: "aktif" }]);
  });

  it("usulan nonaktifkan menonaktifkan jadwal aktif; toko tidak lagi punya jadwal aktif", async () => {
    const t = await tokoCibubur();
    await jadwalAwal(t.id);
    await usulkanNonaktifJadwalToko({ idGudang: cibubur, idToko: t.id, idPengguna: idPengusul });
    const [usulan] = await db.select().from(usulanJadwal).where(eq(usulanJadwal.tokoId, t.id));
    const admin = await masukAdmin();

    await expect(setujuiUsulan({ idUsulan: usulan.id })).resolves.toEqual({ keadaan: "berhasil" });
    expect(await riwayatJadwal(t.id)).toMatchObject([{ status: "nonaktif", dinonaktifkanOleh: admin.id }]);
    expect((await jadwalTokoGudang(cibubur)).find((d) => d.id === t.id)?.jadwal).toBeNull();
  });

  it("usulan yang sudah diputuskan tidak bisa diputuskan lagi", async () => {
    const t = await tokoCibubur();
    const usulan = await usulkanSeninKamis(t.id);
    await masukAdmin();
    await setujuiUsulan({ idUsulan: usulan.id });

    const pesan = "Usulan ini sudah diputuskan. Muat ulang halaman untuk melihat usulan terbaru.";
    await expect(setujuiUsulan({ idUsulan: usulan.id })).resolves.toEqual({ keadaan: "gagal", pesan });
    await expect(tolakUsulan({ idUsulan: usulan.id, alasan: "Terlambat" })).resolves.toEqual({ keadaan: "gagal", pesan });
    expect(await riwayatJadwal(t.id)).toHaveLength(1);
    await expect(setujuiUsulan({ idUsulan: 2_000_000_000 })).resolves.toEqual({
      keadaan: "gagal",
      pesan: "Usulan jadwal tidak ditemukan.",
    });
  });

  it("toko yang sudah dipindah ke Pusat tidak bisa disetujui lewat usulan", async () => {
    const t = await tokoCibubur();
    const usulan = await usulkanSeninKamis(t.id);
    await db.update(hubunganTokoGudang).set({ gudangId: pusat }).where(eq(hubunganTokoGudang.tokoId, t.id));
    await masukAdmin();

    await expect(setujuiUsulan({ idUsulan: usulan.id })).resolves.toMatchObject({ keadaan: "gagal" });
    expect(await riwayatJadwal(t.id)).toEqual([]);
    expect((await bacaUsulan(usulan.id)).status).toBe("menunggu");
  });

  it("tersimpan tetapi gagal memuat ulang tampilan", async () => {
    const t = await tokoCibubur();
    const usulan = await usulkanSeninKamis(t.id);
    await masukAdmin();
    kepala.muatUlangGagal = true;

    await expect(setujuiUsulan({ idUsulan: usulan.id })).resolves.toEqual({ keadaan: "tersimpanGagalMuatUlang" });
    expect((await bacaUsulan(usulan.id)).status).toBe("disetujui");
  });
});

describe("admin menolak usulan", () => {
  it("penolakan mencatat alasan, penyetuju, dan waktu; jadwal aktif tidak berubah", async () => {
    const t = await tokoCibubur();
    const awal = await jadwalAwal(t.id);
    const usulan = await usulkanSeninKamis(t.id);
    const admin = await masukAdmin();

    await expect(tolakUsulan({ idUsulan: usulan.id, alasan: "  Kamis gudang tutup  " })).resolves.toEqual({ keadaan: "berhasil" });
    expect(kepala.dimuatUlang).toEqual(["/admin/jadwal", `/pengiriman-gudang/${cibubur}`]);
    const sesudah = await bacaUsulan(usulan.id);
    expect(sesudah).toMatchObject({ status: "ditolak", alasanPenolakan: "Kamis gudang tutup", diputuskanOleh: admin.id });
    expect(sesudah.diputuskanPada).toBeInstanceOf(Date);
    expect(await riwayatJadwal(t.id)).toEqual([awal]);
  });

  it("alasan wajib diisi", async () => {
    const t = await tokoCibubur();
    const usulan = await usulkanSeninKamis(t.id);
    await masukAdmin();

    for (const alasan of ["", "   ", undefined]) {
      await expect(tolakUsulan({ idUsulan: usulan.id, alasan })).resolves.toEqual({
        keadaan: "gagal",
        pesan: "Isi alasan penolakan.",
      });
    }
    expect((await bacaUsulan(usulan.id)).status).toBe("menunggu");
  });

  it("setelah ditolak, operator bisa mengusulkan lagi untuk toko itu", async () => {
    const t = await tokoCibubur();
    const usulan = await usulkanSeninKamis(t.id);
    await masukAdmin();
    await tolakUsulan({ idUsulan: usulan.id, alasan: "Belum sesuai" });

    await usulkanSeninKamis(t.id);
    expect(await db.select().from(usulanJadwal).where(eq(usulanJadwal.tokoId, t.id))).toHaveLength(2);
  });
});
