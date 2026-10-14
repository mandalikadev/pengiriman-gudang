import { asc, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { parseTanggalBisnis, type TanggalBisnis } from "@/domain/kalender";
import { AksesDitolakError } from "@/server/auth/kewenangan";
import { buatPenggunaUji, kepalaPenggunaUji, masukUji } from "@/server/auth/uji-bantu";
import { db } from "@/server/db";
import { draftRencana, jadwalToko, pengirimanDiLuarJadwal } from "@/server/db/schema";
import { bacaDraftRencana, hitungDraftRencana } from "@/server/gudang/draft-rencana";
import { tokoTerhubungUntukDilepas } from "@/server/gudang/hubungan";
import { riwayatJadwalTetapGudang } from "@/server/gudang/jadwal";
import { tugaskanOperator } from "@/server/gudang/penugasan";
import { bacaRencanaFinal, finalisasiRencanaToko } from "@/server/gudang/rencana-final";
import { simpanStokToko } from "@/server/gudang/stok-draft";
import { bersihkanTokoSmbUji, siapkanTokoSmbUji } from "@/server/gudang/uji-bantu-cakupan";
import { gudangTokoUji, idGudangUji, rencanaFinalUji } from "@/server/gudang/uji-bantu";

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

import { lepasToko, tambahTokoKeGudang } from "./aksi";

// T115 (PRD A3 ▶ Revisi 2026-10-13, Hubungan toko–gudang; A5 ▶ Revisi 2026-10-13, Pembatalan otomatis): admin melepas
// toko dari gudangnya. Dalam satu transaksi: hubungan dihapus, jadwal tetap dinonaktifkan, pengiriman di luar jadwal yang
// belum lewat dan belum final dibatalkan dengan alasan "Toko dilepas dari gudang". Draft gudang lama yang memuat toko itu
// perlu dihitung ulang; rencana final lama tidak berubah. Toko uji seperti BOTANI (jadwal tetap 2× seminggu Senin H,
// Kamis H−1) di Gudang Cibubur. Hari ini Kamis 2026-10-15 (WIB).

const SEKARANG = new Date("2026-10-15T09:00:00+07:00");
const HARI_INI = parseTanggalBisnis("2026-10-15");
const SENIN = parseTanggalBisnis("2026-10-19");
const KAMIS = parseTanggalBisnis("2026-10-22");
const ALASAN_LEPAS = "Toko dilepas dari gudang";

let admin: { id: string; cookie: string };
let operator: { id: string; email: string };
let cibubur: number;
let bali: number;
let botani: { id: number; nama: string };
let idJadwalAwal: number;
let idRencanaSenin: number;
/** Pengiriman di luar jadwal BOTANI per keadaan. */
const pengiriman = { tambahanBerlaku: 0, pindahMenunggu: 0, sudahLewat: 0, sudahFinal: 0 };

const sebagai = (cookie: string) => {
  kepala.cookie = cookie;
};
const draft = (tanggalKirim: TanggalBisnis) => bacaDraftRencana(cibubur, tanggalKirim);
const botaniDi = async (tanggalKirim: TanggalBisnis) => (await draft(tanggalKirim))?.toko.find((t) => t.id === botani.id);
const bacaPengiriman = async (id: number) =>
  (await db.select().from(pengirimanDiLuarJadwal).where(eq(pengirimanDiLuarJadwal.id, id)))[0];
const jadwalBotani = () => db.select().from(jadwalToko).where(eq(jadwalToko.tokoId, botani.id)).orderBy(asc(jadwalToko.id));

async function hitung(tanggalKirim: TanggalBisnis) {
  const hasil = await hitungDraftRencana({ idGudang: cibubur, tanggalKirim, idPengguna: operator.id });
  if (hasil.keadaan !== "berhasil") throw new Error(hasil.pesan);
}

async function sisipkanPengiriman(isian: Omit<typeof pengirimanDiLuarJadwal.$inferInsert, "gudangId" | "tokoId" | "alasan" | "diusulkanOleh">) {
  const berlaku = isian.status === "berlaku" ? { diputuskanOleh: admin.id, diputuskanPada: SEKARANG } : {};
  const [p] = await db
    .insert(pengirimanDiLuarJadwal)
    .values({ gudangId: cibubur, tokoId: botani.id, alasan: "Permintaan mendesak", diusulkanOleh: operator.id, ...berlaku, ...isian })
    .returning({ id: pengirimanDiLuarJadwal.id });
  return p.id;
}

beforeAll(async () => {
  admin = await kepalaPenggunaUji("admin");
  operator = await buatPenggunaUji("viewer");
  cibubur = await idGudangUji("Gudang Cibubur");
  bali = await idGudangUji("Gudang Bali");
  let kodeProduk: string;
  ({ toko: botani, kodeProduk } = await siapkanTokoSmbUji({ idGudang: cibubur, idAdmin: admin.id }));
  await tugaskanOperator({
    idPengguna: operator.id,
    idGudang: cibubur,
    hakTindakan: ["kelola-usulan-jadwal", "input-stok", "hitung-kebutuhan", "finalisasi", "ekspor"],
  });
  idJadwalAwal = (await jadwalBotani())[0].id;

  // Rencana final lama: Senin 19-10 sudah difinalisasi sebelum toko dilepas.
  await hitung(SENIN);
  const stok = await simpanStokToko({ idGudang: cibubur, tanggalKirim: SENIN, tokoId: botani.id, stok: [{ kodeProduk, stokAkhir: 3 }] });
  if (stok.keadaan !== "berhasil") throw new Error(stok.pesan);
  const final = await finalisasiRencanaToko({
    idGudang: cibubur,
    tanggalKirim: SENIN,
    tokoId: botani.id,
    idPengguna: operator.id,
    versiDilihat: (await botaniDi(SENIN))?.versi ?? "",
  });
  if (final.keadaan !== "berhasil") throw new Error(final.pesan);
  idRencanaSenin = final.idRencana;

  // Pengiriman di luar jadwal: dua yang akan datang (berlaku dan menunggu), satu yang sudah lewat, satu yang sudah final.
  pengiriman.tambahanBerlaku = await sisipkanPengiriman({ jenis: "tambahan", tanggalKirim: "2026-10-20", persiapanHari: 1, status: "berlaku" });
  pengiriman.pindahMenunggu = await sisipkanPengiriman({
    jenis: "pindah",
    tanggalKirim: "2026-10-27",
    tanggalRutinDipindah: "2026-10-26",
    persiapanHari: 0,
    status: "menunggu",
  });
  pengiriman.sudahLewat = await sisipkanPengiriman({ jenis: "tambahan", tanggalKirim: "2026-10-14", persiapanHari: 1, status: "berlaku" });
  pengiriman.sudahFinal = await sisipkanPengiriman({ jenis: "tambahan", tanggalKirim: "2026-10-17", persiapanHari: 1, status: "berlaku" });
  await rencanaFinalUji({ idGudang: cibubur, idToko: botani.id, tanggalKirim: "2026-10-17", idPengguna: admin.id });

  // Draft Cibubur Kamis 22-10 memuat BOTANI.
  await hitung(KAMIS);
}, 120_000);

beforeEach(() => {
  kepala.cookie = "";
  kepala.muatUlangGagal = false;
  kepala.dimuatUlang = [];
  vi.useFakeTimers({ toFake: ["Date"], now: SEKARANG });
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await db.delete(draftRencana).where(eq(draftRencana.gudangId, cibubur));
  await bersihkanTokoSmbUji({ idGudang: cibubur, idToko: botani.id });
  await db.delete(pengirimanDiLuarJadwal).where(eq(pengirimanDiLuarJadwal.tokoId, botani.id));
});

describe("sebelum dilepas", () => {
  it("BOTANI terhubung ke Cibubur dengan 2 pengiriman di luar jadwal yang akan dibatalkan; draft Kamis 22-10 memuatnya", async () => {
    expect((await tokoTerhubungUntukDilepas(HARI_INI)).get(botani.id)).toEqual({ idGudang: cibubur, jumlahPengirimanDibatalkan: 2 });
    expect(await botaniDi(KAMIS)).toMatchObject({ perluDihitungUlang: [] });
    expect((await draft(KAMIS))?.perluDihitungUlang).toEqual([]);
  });
});

describe("hanya admin yang bisa melepas toko (diperiksa di server)", () => {
  it("viewer dan operator berhak di Cibubur ditolak; hubungan, jadwal, dan pengiriman tidak berubah", async () => {
    sebagai((await kepalaPenggunaUji("viewer")).cookie);
    await expect(lepasToko({ idGudang: cibubur, idToko: botani.id })).rejects.toBeInstanceOf(AksesDitolakError);
    sebagai(await masukUji(operator.email));
    await expect(lepasToko({ idGudang: cibubur, idToko: botani.id })).rejects.toBeInstanceOf(AksesDitolakError);

    expect(await gudangTokoUji(botani.id)).toEqual([cibubur]);
    expect(await jadwalBotani()).toEqual([expect.objectContaining({ id: idJadwalAwal, status: "aktif" })]);
    expect(await bacaPengiriman(pengiriman.tambahanBerlaku)).toMatchObject({ status: "berlaku" });
    expect(await bacaPengiriman(pengiriman.pindahMenunggu)).toMatchObject({ status: "menunggu" });
  });

  it("belum masuk → diarahkan ke halaman masuk", async () => {
    await expect(lepasToko({ idGudang: cibubur, idToko: botani.id })).rejects.toMatchObject({ digest: expect.stringContaining("/masuk") });
    expect(await gudangTokoUji(botani.id)).toEqual([cibubur]);
  });
});

describe("admin melepas BOTANI dari Gudang Cibubur", () => {
  let rencanaSeninSebelum: Awaited<ReturnType<typeof bacaRencanaFinal>>;

  it("gudang yang tidak sesuai hubungan saat ini ditolak tanpa mengubah apa pun", async () => {
    sebagai(admin.cookie);
    await expect(lepasToko({ idGudang: bali, idToko: botani.id })).resolves.toEqual({
      keadaan: "gagal",
      pesan: "Toko tidak terhubung ke gudang ini. Muat ulang halaman, lalu pilih lagi.",
    });
    expect(await gudangTokoUji(botani.id)).toEqual([cibubur]);
    expect(await jadwalBotani()).toEqual([expect.objectContaining({ status: "aktif" })]);
  });

  it("hubungan hilang, jadwal tetap nonaktif (tercatat), pengiriman akan datang Dibatalkan dengan alasan, rencana final lama tetap", async () => {
    rencanaSeninSebelum = await bacaRencanaFinal(cibubur, idRencanaSenin);
    expect(rencanaSeninSebelum).not.toBeNull();
    sebagai(admin.cookie);

    await expect(lepasToko({ idGudang: cibubur, idToko: botani.id })).resolves.toEqual({ keadaan: "berhasil" });

    expect(await gudangTokoUji(botani.id)).toEqual([]);
    expect((await tokoTerhubungUntukDilepas(HARI_INI)).has(botani.id)).toBe(false);
    const [jadwal] = await jadwalBotani();
    expect(jadwal).toMatchObject({ id: idJadwalAwal, status: "nonaktif", dinonaktifkanOleh: admin.id });
    expect(jadwal.dinonaktifkanPada).toBeInstanceOf(Date);
    expect(await jadwalBotani()).toHaveLength(1);

    for (const id of [pengiriman.tambahanBerlaku, pengiriman.pindahMenunggu]) {
      const p = await bacaPengiriman(id);
      // Pembatalan otomatis oleh sistem: tanpa pembatal (PRD A5 ▶ Revisi 2026-10-13).
      expect(p).toMatchObject({ status: "dibatalkan", alasanPembatalan: ALASAN_LEPAS, dibatalkanOleh: null });
      expect(p.dibatalkanPada).toBeInstanceOf(Date);
    }
    // Yang sudah lewat atau sudah punya rencana final tidak disentuh.
    expect(await bacaPengiriman(pengiriman.sudahLewat)).toMatchObject({ status: "berlaku", alasanPembatalan: null });
    expect(await bacaPengiriman(pengiriman.sudahFinal)).toMatchObject({ status: "berlaku", alasanPembatalan: null });

    expect(await bacaRencanaFinal(cibubur, idRencanaSenin)).toEqual(rencanaSeninSebelum);
    expect(kepala.dimuatUlang).toEqual(
      expect.arrayContaining(["/admin/gudang", "/admin/toko", `/pengiriman-gudang/${cibubur}`, "/admin/jadwal"]),
    );
  });

  it("draft Cibubur Kamis 22-10 yang memuat BOTANI ditandai perlu dihitung ulang; setelah dihitung ulang BOTANI keluar", async () => {
    expect((await draft(KAMIS))?.perluDihitungUlang).toEqual(["jadwal"]);
    expect(await botaniDi(KAMIS)).toMatchObject({ perluDihitungUlang: ["jadwal"] });

    await hitung(KAMIS);
    const kamis = await draft(KAMIS);
    expect(kamis?.toko.some((t) => t.id === botani.id)).toBe(false);
    expect(kamis?.tokoDikeluarkan).toContainEqual({ id: botani.id, nama: botani.nama });
    expect(kamis?.perluDihitungUlang).toEqual([]);
    expect(await bacaRencanaFinal(cibubur, idRencanaSenin)).toEqual(rencanaSeninSebelum);
  });

  it("melepas lagi toko yang sudah tidak terhubung ditolak dengan pesan", async () => {
    sebagai(admin.cookie);
    await expect(lepasToko({ idGudang: cibubur, idToko: botani.id })).resolves.toEqual({
      keadaan: "gagal",
      pesan: "Toko tidak terhubung ke gudang ini. Muat ulang halaman, lalu pilih lagi.",
    });
  });

  it("BOTANI lalu bisa ditambahkan ke Gudang Bali lewat tambah toko; riwayat jadwal tetapnya mencatat penonaktifan", async () => {
    sebagai(admin.cookie);
    await expect(tambahTokoKeGudang({ idGudang: bali, idToko: [botani.id] })).resolves.toEqual({
      keadaan: "berhasil",
      hasil: [{ idToko: botani.id, namaToko: botani.nama, status: "berhasil", keterangan: "Ditambahkan ke Gudang Bali." }],
    });
    expect(await gudangTokoUji(botani.id)).toEqual([bali]);
    expect((await riwayatJadwalTetapGudang(bali)).get(botani.id)).toEqual([
      expect.objectContaining({ id: idJadwalAwal, berakhir: expect.objectContaining({ jenis: "dinonaktifkan", oleh: "Uji admin" }) }),
    ]);
    // Toko yang dilepas tidak lagi dibaca sebagai toko Cibubur.
    expect((await riwayatJadwalTetapGudang(cibubur)).has(botani.id)).toBe(false);
  });

  it("tersimpan tetapi halaman gagal dimuat ulang → keadaan kelima", async () => {
    sebagai(admin.cookie);
    kepala.muatUlangGagal = true;
    await expect(lepasToko({ idGudang: bali, idToko: botani.id })).resolves.toEqual({ keadaan: "tersimpanGagalMuatUlang" });
    expect(await gudangTokoUji(botani.id)).toEqual([]);
  });
});

describe("isian tidak valid", () => {
  it("id toko atau gudang yang bukan bilangan bulat ditolak dengan pesan", async () => {
    sebagai(admin.cookie);
    await expect(lepasToko({ idGudang: cibubur, idToko: "BOTANI" })).resolves.toEqual({
      keadaan: "gagal",
      pesan: "Toko tidak ditemukan. Muat ulang halaman.",
    });
    await expect(lepasToko({ idToko: botani.id })).resolves.toEqual({
      keadaan: "gagal",
      pesan: "Gudang tidak ditemukan. Muat ulang halaman.",
    });
  });
});
