import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AksesDitolakError } from "@/server/auth/kewenangan";
import { kepalaPenggunaUji } from "@/server/auth/uji-bantu";
import { muatTinjauSnapshotLibur } from "@/server/libur/aktivasi";
import {
  buatSnapshotAktifUji,
  buatSnapshotUji,
  entriSnapshotUji,
  gantiApiHariLibur,
  kejadianTahunUji,
  snapshotTahunUji,
  tahunLiburUji,
} from "@/server/libur/uji-bantu";

const kepala = vi.hoisted(() => ({ cookie: "", muatUlangGagal: false }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(kepala.cookie ? { cookie: kepala.cookie } : {}),
}));
vi.mock("next/cache", () => ({
  revalidatePath: () => {
    if (kepala.muatUlangGagal) throw new Error("gagal memuat ulang");
  },
}));

import { aktifkanSnapshot, sinkronkanLiburTahun } from "./aksi";

beforeEach(() => {
  kepala.cookie = "";
  kepala.muatUlangGagal = false;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Bentuk respons API Hari Libur (PRD B2), termasuk field lain yang tidak dibaca. */
function responsContoh(tahun: number) {
  return {
    status: "success",
    data: [
      { date: `${tahun}-01-01`, description: `Tahun Baru ${tahun} Masehi`, day: "Kamis" },
      { date: `${tahun}-03-20`, description: "Hari Raya Idul Fitri 1447 Hijriah" },
      { date: `${tahun}-03-23`, description: "Cuti Bersama Hari Raya Idul Fitri 1447 Hijriah", is_cuti: false },
    ],
  };
}

describe("non-admin ditolak di server", () => {
  it("viewer ditolak sebelum API dipanggil; tidak ada snapshot maupun kejadian", async () => {
    const tahun = await tahunLiburUji();
    const diminta = gantiApiHariLibur({ isi: responsContoh(tahun) });
    kepala.cookie = (await kepalaPenggunaUji("viewer")).cookie;
    await expect(sinkronkanLiburTahun({ tahun })).rejects.toBeInstanceOf(AksesDitolakError);
    expect(diminta).toEqual([]);
    expect(await snapshotTahunUji(tahun)).toEqual([]);
    expect(await kejadianTahunUji(tahun)).toEqual([]);
  });

  it("pengguna yang belum masuk diarahkan ke halaman masuk", async () => {
    const tahun = await tahunLiburUji();
    gantiApiHariLibur({ isi: responsContoh(tahun) });
    await expect(sinkronkanLiburTahun({ tahun })).rejects.toMatchObject({ digest: expect.stringContaining("/masuk") });
    expect(await snapshotTahunUji(tahun)).toEqual([]);
  });
});

describe("admin menyinkronkan libur", () => {
  let idAdmin: string;
  beforeEach(async () => {
    const admin = await kepalaPenggunaUji("admin");
    kepala.cookie = admin.cookie;
    idAdmin = admin.id;
  });

  it("respons contoh valid → snapshot menunggu persetujuan dengan entri dan usulan jenis yang benar", async () => {
    const tahun = await tahunLiburUji();
    const diminta = gantiApiHariLibur({ isi: responsContoh(tahun) });

    const hasil = await sinkronkanLiburTahun({ tahun });
    expect(diminta).toEqual([`https://api-hari-libur.vercel.app/api?year=${tahun}`]);

    const [snapshot, ...lain] = await snapshotTahunUji(tahun);
    expect(lain).toEqual([]);
    expect(hasil).toEqual({ keadaan: "berhasil", tahun, jumlahLibur: 3 });
    expect(snapshot).toMatchObject({
      tahun,
      status: "menunggu-persetujuan",
      sumber: `https://api-hari-libur.vercel.app/api?year=${tahun}`,
      disinkronkanOleh: idAdmin,
    });
    expect(snapshot.disinkronkanPada).toBeInstanceOf(Date);
    expect(await entriSnapshotUji(snapshot.id)).toEqual([
      { tanggal: `${tahun}-01-01`, keterangan: `Tahun Baru ${tahun} Masehi`, jenis: "libur nasional", jenisUsulan: true },
      { tanggal: `${tahun}-03-20`, keterangan: "Hari Raya Idul Fitri 1447 Hijriah", jenis: "libur nasional", jenisUsulan: true },
      {
        tanggal: `${tahun}-03-23`,
        keterangan: "Cuti Bersama Hari Raya Idul Fitri 1447 Hijriah",
        jenis: "cuti bersama",
        jenisUsulan: true,
      },
    ]);
    expect(await kejadianTahunUji(tahun)).toEqual([
      { jenis: "sinkronisasi-berhasil", snapshotId: snapshot.id, pesan: null, pelaku: idAdmin },
    ]);
  });

  it("sinkronisasi berhasil tidak mengganti snapshot aktif tahun itu", async () => {
    const tahun = await tahunLiburUji();
    const aktif = await buatSnapshotAktifUji(tahun, idAdmin);
    gantiApiHariLibur({ isi: responsContoh(tahun) });

    await expect(sinkronkanLiburTahun({ tahun })).resolves.toMatchObject({ keadaan: "berhasil" });
    const daftar = await snapshotTahunUji(tahun);
    expect(daftar.map((s) => [s.id, s.status])).toEqual([
      [aktif.id, "aktif"],
      [expect.any(Number), "menunggu-persetujuan"],
    ]);
    expect(await entriSnapshotUji(aktif.id)).toHaveLength(1);
  });

  it("tersimpan tetapi gagal memuat ulang tampilan", async () => {
    const tahun = await tahunLiburUji();
    gantiApiHariLibur({ isi: responsContoh(tahun) });
    kepala.muatUlangGagal = true;
    await expect(sinkronkanLiburTahun({ tahun })).resolves.toEqual({
      keadaan: "tersimpanGagalMuatUlang",
      tahun,
      jumlahLibur: 3,
    });
    expect(await snapshotTahunUji(tahun)).toHaveLength(1);
  });

  const kasusGagal: [string, (tahun: number) => Parameters<typeof gantiApiHariLibur>[0], string][] = [
    ["API tidak dapat dihubungi", () => "putus", "API Hari Libur tidak dapat dihubungi atau tidak menjawab tepat waktu."],
    ["API menjawab error", () => ({ status: 503, isi: { message: "down" } }), "API Hari Libur menjawab dengan kode 503."],
    ["respons bukan JSON", () => ({ teks: "<html>galat</html>" }), "Respons API Hari Libur bukan JSON yang valid."],
    [
      "respons dengan `data` kosong (PRD B2, ▶ Keputusan 2026-10-10, T40)",
      () => ({ isi: { data: [] } }),
      "Daftar libur tahun {tahun} kosong; tidak ada tanggal libur yang bisa disimpan.",
    ],
    [
      "respons tidak sesuai format (field provider lama)",
      (tahun) => ({ isi: { data: [{ tanggal: `${tahun}-01-01`, keterangan: "Tahun Baru", is_cuti: false }] } }),
      "Respons API Hari Libur tidak sesuai format: diharapkan daftar `data` berisi `date` dan `description`.",
    ],
    [
      "format tanggal salah",
      (tahun) => ({ isi: { data: [{ date: `01/01/${tahun}`, description: "Tahun Baru" }] } }),
      "Entri ke-1: tanggal \"01/01/{tahun}\" bukan tanggal YYYY-MM-DD yang ada di kalender.",
    ],
    [
      "tahun salah",
      (tahun) => ({ isi: { data: [{ date: `${tahun - 1}-12-25`, description: "Hari Raya Natal" }] } }),
      "Entri ke-1: tanggal {tahun-1}-12-25 bukan tahun {tahun} yang dipilih.",
    ],
    [
      "tanggal duplikat",
      (tahun) => ({
        isi: {
          data: [
            { date: `${tahun}-03-20`, description: "Hari Raya Idul Fitri" },
            { date: `${tahun}-03-20`, description: "Cuti Bersama Idul Fitri" },
          ],
        },
      }),
      "Entri ke-2: tanggal {tahun}-03-20 muncul lebih dari sekali.",
    ],
  ];

  it.each(kasusGagal)("%s → gagal dengan pesan jelas, snapshot aktif tidak berubah, kegagalan tercatat", async (_, jawaban, polaPesan) => {
    const tahun = await tahunLiburUji();
    const pesan = polaPesan
      .replace("{tahun-1}", String(tahun - 1))
      .replaceAll("{tahun}", String(tahun));
    const aktif = await buatSnapshotAktifUji(tahun, idAdmin);
    gantiApiHariLibur(jawaban(tahun));

    await expect(sinkronkanLiburTahun({ tahun })).resolves.toEqual({ keadaan: "gagal", pesan });
    expect(await snapshotTahunUji(tahun)).toEqual([aktif]);
    expect(await entriSnapshotUji(aktif.id)).toEqual([
      { tanggal: `${tahun}-01-01`, keterangan: "Tahun Baru", jenis: "libur nasional", jenisUsulan: true },
    ]);
    expect(await kejadianTahunUji(tahun)).toEqual([
      { jenis: "sinkronisasi-gagal", snapshotId: null, pesan, pelaku: idAdmin },
    ]);
  });

  it("tahun tidak valid → gagal tanpa memanggil API", async () => {
    const diminta = gantiApiHariLibur({ isi: { data: [] } });
    await expect(sinkronkanLiburTahun({ tahun: 26 })).resolves.toEqual({
      keadaan: "gagal",
      pesan: "Isi tahun empat digit.",
    });
    await expect(sinkronkanLiburTahun({ tahun: "2026" })).resolves.toMatchObject({ keadaan: "gagal" });
    expect(diminta).toEqual([]);
  });
});

describe("aktifkanSnapshot (server action)", () => {
  it("viewer ditolak di server sebelum data disentuh", async () => {
    const admin = await kepalaPenggunaUji("admin");
    const tahun = await tahunLiburUji();
    const snapshot = await buatSnapshotUji(tahun, admin.id, "menunggu-persetujuan", []);
    const tinjau = await muatTinjauSnapshotLibur(snapshot.id);
    kepala.cookie = (await kepalaPenggunaUji("viewer")).cookie;

    await expect(aktifkanSnapshot({ idSnapshot: snapshot.id, versi: tinjau?.versi })).rejects.toBeInstanceOf(AksesDitolakError);
    expect((await snapshotTahunUji(tahun)).map((s) => s.status)).toEqual(["menunggu-persetujuan"]);
    expect(await kejadianTahunUji(tahun)).toEqual([]);
  });

  it("admin mengaktifkan; snapshot aktif lama diarsipkan; gagal memuat ulang tetap tersimpan", async () => {
    const admin = await kepalaPenggunaUji("admin");
    kepala.cookie = admin.cookie;
    const tahun = await tahunLiburUji();
    const lama = await buatSnapshotAktifUji(tahun, admin.id);
    const baru = await buatSnapshotUji(tahun, admin.id, "menunggu-persetujuan", []);

    const versi = (await muatTinjauSnapshotLibur(baru.id))?.versi;
    await expect(aktifkanSnapshot({ idSnapshot: baru.id, versi })).resolves.toEqual({ keadaan: "berhasil" });
    expect((await snapshotTahunUji(tahun)).map((s) => [s.id, s.status])).toEqual([
      [lama.id, "diarsipkan"],
      [baru.id, "aktif"],
    ]);

    kepala.muatUlangGagal = true;
    const versiLama = (await muatTinjauSnapshotLibur(lama.id))?.versi;
    await expect(aktifkanSnapshot({ idSnapshot: lama.id, versi: versiLama })).resolves.toEqual({
      keadaan: "tersimpanGagalMuatUlang",
    });
    expect((await snapshotTahunUji(tahun)).map((s) => [s.id, s.status])).toEqual([
      [lama.id, "aktif"],
      [baru.id, "diarsipkan"],
    ]);
  });

  it("isian tidak valid → gagal tanpa perubahan", async () => {
    kepala.cookie = (await kepalaPenggunaUji("admin")).cookie;
    await expect(aktifkanSnapshot({ idSnapshot: "1", versi: "x" })).resolves.toEqual({
      keadaan: "gagal",
      pesan: "Snapshot libur tidak ditemukan.",
    });
    await expect(aktifkanSnapshot({ idSnapshot: 1 })).resolves.toEqual({
      keadaan: "gagal",
      pesan: "Muat ulang halaman dan tinjau ulang sebelum mengaktifkan.",
    });
  });
});
