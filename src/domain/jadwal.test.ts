import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseTanggalBisnis, type KategoriDasar } from "./kalender";
import { cakupanPengiriman, hitungKebutuhanKirim } from "./pengiriman";
import {
  kirimanSebelumnyaBelumSampai,
  kirimanSebelumnyaBelumSampaiToko,
  periksaJadwal,
  tanggalKirimBerikutnya,
  tanggalKirimMenurutJadwal,
  tanggalKirimMenurutToko,
  tanggalKirimSebelumnya,
  tanggalKirimToko,
  tanggalKirimTokoBerikutnya,
  tanggalKirimTokoSebelumnya,
  type Jadwal,
  type MasukanJadwal,
} from "./jadwal";

function jadwalValid(masukan: MasukanJadwal): Jadwal {
  const hasil = periksaJadwal(masukan);
  if (hasil.keadaan !== "valid") {
    throw new Error(`jadwal contoh harus valid: ${hasil.pesan.join("; ")}`);
  }
  return hasil.jadwal;
}

function cek(jadwal: Jadwal, tanggal: string) {
  return tanggalKirimMenurutJadwal(jadwal, parseTanggalBisnis(tanggal));
}

const golden = JSON.parse(readFileSync(join(import.meta.dirname, "../../tests/golden/jumlah-kirim.json"), "utf8")) as {
  rataRata: Record<KategoriDasar, number>;
  kasusCakupan: { tanggalKirim: string; persiapanHari: number; panjangCakupan: number; tanggalCakupan: { tanggal: string }[]; kebutuhan: number };
};

/** Cakupan dan kebutuhan pengiriman `tanggal` menurut jadwal (p dan L dari jadwal), produk otomatis tanpa stok. */
function cakupanMenurutJadwal(jadwal: Jadwal, tanggal: string, rataRata: Partial<Record<KategoriDasar, number>>) {
  const hasil = cek(jadwal, tanggal);
  if (!hasil.kirim) throw new Error(`${tanggal} harus tanggal kirim`);
  const kirim = hitungKebutuhanKirim({
    tanggalKirim: parseTanggalBisnis(tanggal),
    persiapanHari: hasil.persiapanHari,
    panjangCakupan: hasil.panjangCakupan,
    toko: "UJI",
    daftarPerubahan: [],
    rataRata,
    produk: { kode: "PW110P-GOR", kategori: "PARFUM WANITA" },
    stokAkhir: null,
    persenBuffer: 20,
  });
  return {
    persiapanHari: hasil.persiapanHari,
    panjangCakupan: hasil.panjangCakupan,
    cakupan: kirim.cakupan.map((t) => t.tanggal),
    kebutuhan: kirim.kebutuhan.tersedia ? kirim.kebutuhan.kebutuhan : null,
  };
}

describe("panjang cakupan L = jarak ke tanggal kirim berikutnya (PRD A6 ▶ Revisi 2026-10-12, UAT ketiga)", () => {
  // SMB: 2× seminggu Senin (H), Kamis (H−1); rata-rata PW110P-GOR Senin–Kamis 5, Jumat 5, Sabtu 8, Minggu 7.
  const smb = jadwalValid({
    pola: "2x-seminggu",
    hariKirim: [
      { hari: "Senin", persiapan: "H" },
      { hari: "Kamis", persiapan: "H-1" },
    ],
    tanggalJangkar: null,
  });
  const rataRataSmb = { "Senin–Kamis": 5, Jumat: 5, Sabtu: 8, Minggu: 7 };

  it("SMB kirim Senin 2026-10-19 → p = 0, L = 3, cakupan Senin–Rabu 19–21 Okt, kebutuhan 15", () => {
    expect(cakupanMenurutJadwal(smb, "2026-10-19", rataRataSmb)).toEqual({
      persiapanHari: 0,
      panjangCakupan: 3,
      cakupan: ["2026-10-19", "2026-10-20", "2026-10-21"],
      kebutuhan: 15,
    });
  });

  it("SMB kirim Kamis 2026-10-22 → p = 1, L = 4, cakupan Rabu–Minggu 21–25 Okt (melintasi akhir minggu), kebutuhan 30", () => {
    expect(cakupanMenurutJadwal(smb, "2026-10-22", rataRataSmb)).toEqual({
      persiapanHari: 1,
      panjangCakupan: 4,
      cakupan: ["2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"],
      kebutuhan: 30,
    });
  });

  it("LWB 3× seminggu Senin/Rabu/Jumat (H−1) → Senin L = 2, Rabu L = 2, Jumat L = 3", () => {
    const lwb = jadwalValid({
      pola: "3x-seminggu",
      hariKirim: [
        { hari: "Senin", persiapan: "H-1" },
        { hari: "Rabu", persiapan: "H-1" },
        { hari: "Jumat", persiapan: "H-1" },
      ],
      tanggalJangkar: null,
    });
    expect(cek(lwb, "2026-10-12")).toEqual({ kirim: true, persiapanHari: 1, panjangCakupan: 2 });
    expect(cek(lwb, "2026-10-14")).toEqual({ kirim: true, persiapanHari: 1, panjangCakupan: 2 });
    expect(cek(lwb, "2026-10-16")).toEqual({ kirim: true, persiapanHari: 1, panjangCakupan: 3 });
    expect(cakupanMenurutJadwal(lwb, "2026-10-16", rataRataSmb).cakupan).toEqual(["2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"]);
  });

  it("1× seminggu Senin H−2 (golden jumlah-kirim.json) → L = 7, cakupan dan kebutuhan 56 tetap", () => {
    const mingguan = jadwalValid({ pola: "mingguan", hariKirim: [{ hari: "Senin", persiapan: "H-2" }], tanggalJangkar: null });
    const { kasusCakupan } = golden;
    expect(cakupanMenurutJadwal(mingguan, kasusCakupan.tanggalKirim, golden.rataRata)).toEqual({
      persiapanHari: kasusCakupan.persiapanHari,
      panjangCakupan: kasusCakupan.panjangCakupan,
      cakupan: kasusCakupan.tanggalCakupan.map((t) => t.tanggal),
      kebutuhan: kasusCakupan.kebutuhan,
    });
  });

  it("dua mingguan BXC Rabu (H−1), jangkar 2026-10-14 → L = 14, cakupan 13–27 Okt", () => {
    const bxc = jadwalValid({ pola: "dua-mingguan", hariKirim: [{ hari: "Rabu", persiapan: "H-1" }], tanggalJangkar: "2026-10-14" });
    expect(cek(bxc, "2026-10-14")).toEqual({ kirim: true, persiapanHari: 1, panjangCakupan: 14 });
    const { cakupan } = cakupanMenurutJadwal(bxc, "2026-10-14", rataRataSmb);
    expect(cakupan).toHaveLength(15);
    expect([cakupan[0], cakupan[14]]).toEqual(["2026-10-13", "2026-10-27"]);
    expect(cek(bxc, "2026-10-28")).toEqual({ kirim: true, persiapanHari: 1, panjangCakupan: 14 });
  });

  it("dua mingguan Senin + Kamis, jangkar pekan 2026-10-12 → Senin 12 Okt L = 3; Kamis 15 Okt L = 11 (berikutnya Senin 26 Okt)", () => {
    const duaHari = jadwalValid({
      pola: "dua-mingguan",
      hariKirim: [
        { hari: "Senin", persiapan: "H" },
        { hari: "Kamis", persiapan: "H" },
      ],
      tanggalJangkar: "2026-10-12",
    });
    expect(cek(duaHari, "2026-10-12")).toEqual({ kirim: true, persiapanHari: 0, panjangCakupan: 3 });
    expect(cek(duaHari, "2026-10-15")).toEqual({ kirim: true, persiapanHari: 0, panjangCakupan: 11 });
    const { cakupan } = cakupanMenurutJadwal(duaHari, "2026-10-15", rataRataSmb);
    expect([cakupan[0], cakupan[cakupan.length - 1]]).toEqual(["2026-10-15", "2026-10-25"]);
  });
});

describe("tanggalKirimBerikutnya — tanggal kirim pertama sesudah tanggal itu menurut jadwal", () => {
  const smb = jadwalValid({
    pola: "2x-seminggu",
    hariKirim: [
      { hari: "Senin", persiapan: "H" },
      { hari: "Kamis", persiapan: "H-1" },
    ],
    tanggalJangkar: null,
  });
  const berikutnya = (jadwal: Jadwal, tanggal: string) => tanggalKirimBerikutnya(jadwal, parseTanggalBisnis(tanggal));

  it("dari tanggal kirim: hari kirim berikutnya, melintasi akhir minggu", () => {
    expect(berikutnya(smb, "2026-10-19")).toBe("2026-10-22");
    expect(berikutnya(smb, "2026-10-22")).toBe("2026-10-26");
  });

  it("dari tanggal yang bukan tanggal kirim: hari kirim terdekat sesudahnya", () => {
    expect(berikutnya(smb, "2026-10-25")).toBe("2026-10-26");
    expect(berikutnya(smb, "2026-10-20")).toBe("2026-10-22");
  });

  it("mingguan: tujuh hari kemudian", () => {
    const mingguan = jadwalValid({ pola: "mingguan", hariKirim: [{ hari: "Sabtu", persiapan: "H" }], tanggalJangkar: null });
    expect(berikutnya(mingguan, "2026-10-17")).toBe("2026-10-24");
  });

  it("dua mingguan: melewati pekan non-kirim", () => {
    const bxc = jadwalValid({ pola: "dua-mingguan", hariKirim: [{ hari: "Rabu", persiapan: "H-1" }], tanggalJangkar: "2026-10-14" });
    expect(berikutnya(bxc, "2026-10-14")).toBe("2026-10-28");
    expect(berikutnya(bxc, "2026-10-21")).toBe("2026-10-28");
    const duaHari = jadwalValid({
      pola: "dua-mingguan",
      hariKirim: [
        { hari: "Senin", persiapan: "H" },
        { hari: "Kamis", persiapan: "H" },
      ],
      tanggalJangkar: "2026-10-12",
    });
    expect(berikutnya(duaHari, "2026-10-15")).toBe("2026-10-26");
    expect(berikutnya(duaHari, "2026-10-19")).toBe("2026-10-26");
  });
});

describe("tanggalKirimMenurutJadwal — dua mingguan (PRD A5 ▶ Keputusan pekan jangkar)", () => {
  const jadwal = jadwalValid({
    pola: "dua-mingguan",
    hariKirim: [{ hari: "Senin", persiapan: "H-1" }],
    tanggalJangkar: "2026-06-10",
  });

  it("jangkar Rabu 2026-06-10, hari Senin → kirim 2026-06-08 dan 2026-06-22, bukan 2026-06-15", () => {
    expect(cek(jadwal, "2026-06-08")).toEqual({ kirim: true, persiapanHari: 1, panjangCakupan: 14 });
    expect(cek(jadwal, "2026-06-22")).toEqual({ kirim: true, persiapanHari: 1, panjangCakupan: 14 });
    expect(cek(jadwal, "2026-06-15")).toEqual({ kirim: false });
  });

  it("berulang setiap 14 hari: 2026-07-06 kirim, 2026-06-29 tidak", () => {
    expect(cek(jadwal, "2026-07-06").kirim).toBe(true);
    expect(cek(jadwal, "2026-06-29").kirim).toBe(false);
  });

  it("pola berlaku ke belakang dari jangkar: 2026-05-25 kirim, 2026-06-01 tidak (PRD A5 ▶ Keputusan 2026-10-10)", () => {
    expect(cek(jadwal, "2026-05-25")).toEqual({ kirim: true, persiapanHari: 1, panjangCakupan: 14 });
    expect(cek(jadwal, "2026-06-01")).toEqual({ kirim: false });
  });

  it("jauh sebelum jangkar tetap mengikuti pola 14 hari: 2026-05-11 kirim, 2026-05-18 tidak", () => {
    expect(cek(jadwal, "2026-05-11").kirim).toBe(true);
    expect(cek(jadwal, "2026-05-18").kirim).toBe(false);
  });

  it("hari selain hari kirim di pekan jangkar bukan tanggal kirim", () => {
    expect(cek(jadwal, "2026-06-10").kirim).toBe(false);
  });

  it("dua hari kirim di pekan jangkar, masing-masing dengan persiapannya; L = jarak ke hari kirim berikutnya", () => {
    const duaHari = jadwalValid({
      pola: "dua-mingguan",
      hariKirim: [
        { hari: "Selasa", persiapan: "H" },
        { hari: "Sabtu", persiapan: "H-2" },
      ],
      tanggalJangkar: "2026-06-10",
    });
    // Selasa → Sabtu pekan yang sama (4 hari); Sabtu → Selasa pekan kirim berikutnya, melewati pekan non-kirim (10 hari).
    expect(cek(duaHari, "2026-06-09")).toEqual({ kirim: true, persiapanHari: 0, panjangCakupan: 4 });
    expect(cek(duaHari, "2026-06-13")).toEqual({ kirim: true, persiapanHari: 2, panjangCakupan: 10 });
    expect(cek(duaHari, "2026-06-20").kirim).toBe(false);
    expect(cek(duaHari, "2026-06-27")).toEqual({ kirim: true, persiapanHari: 2, panjangCakupan: 10 });
  });
});

describe("tanggalKirimMenurutJadwal — 3× seminggu", () => {
  const jadwal = jadwalValid({
    pola: "3x-seminggu",
    hariKirim: [
      { hari: "Senin", persiapan: "H-2" },
      { hari: "Rabu", persiapan: "H" },
      { hari: "Jumat", persiapan: "H-1" },
    ],
    tanggalJangkar: null,
  });

  it("Senin/Rabu/Jumat → L = 2, 2, 3 (jarak ke hari kirim berikutnya), p sesuai hari masing-masing", () => {
    expect(cek(jadwal, "2026-06-08")).toEqual({ kirim: true, persiapanHari: 2, panjangCakupan: 2 });
    expect(cek(jadwal, "2026-06-10")).toEqual({ kirim: true, persiapanHari: 0, panjangCakupan: 2 });
    expect(cek(jadwal, "2026-06-12")).toEqual({ kirim: true, persiapanHari: 1, panjangCakupan: 3 });
  });

  it("hari lain bukan tanggal kirim; berlaku setiap pekan", () => {
    expect(cek(jadwal, "2026-06-09")).toEqual({ kirim: false });
    expect(cek(jadwal, "2026-06-14")).toEqual({ kirim: false });
    expect(cek(jadwal, "2026-06-15").kirim).toBe(true);
  });
});

describe("tanggalKirimMenurutJadwal — mingguan dan 2× seminggu", () => {
  it("mingguan Sabtu → setiap Sabtu, L = 7", () => {
    const jadwal = jadwalValid({ pola: "mingguan", hariKirim: [{ hari: "Sabtu", persiapan: "H" }], tanggalJangkar: null });
    expect(cek(jadwal, "2026-06-13")).toEqual({ kirim: true, persiapanHari: 0, panjangCakupan: 7 });
    expect(cek(jadwal, "2026-06-20")).toEqual({ kirim: true, persiapanHari: 0, panjangCakupan: 7 });
    expect(cek(jadwal, "2026-06-12").kirim).toBe(false);
  });

  it("2× seminggu Selasa/Kamis → Selasa L = 2, Kamis L = 5 (melintasi akhir minggu)", () => {
    const jadwal = jadwalValid({
      pola: "2x-seminggu",
      hariKirim: [
        { hari: "Selasa", persiapan: "H-1" },
        { hari: "Kamis", persiapan: "H-2" },
      ],
      tanggalJangkar: null,
    });
    expect(cek(jadwal, "2026-06-09")).toEqual({ kirim: true, persiapanHari: 1, panjangCakupan: 2 });
    expect(cek(jadwal, "2026-06-11")).toEqual({ kirim: true, persiapanHari: 2, panjangCakupan: 5 });
  });
});

describe("periksaJadwal — validasi", () => {
  it("menolak dua mingguan tanpa tanggal jangkar", () => {
    const hasil = periksaJadwal({ pola: "dua-mingguan", hariKirim: [{ hari: "Senin", persiapan: "H" }], tanggalJangkar: null });
    expect(hasil).toEqual({ keadaan: "tidakValid", pesan: ["Pola dua mingguan wajib memiliki tanggal jangkar."] });
  });

  it("menolak tanggal jangkar yang tidak valid", () => {
    const hasil = periksaJadwal({ pola: "dua-mingguan", hariKirim: [{ hari: "Senin", persiapan: "H" }], tanggalJangkar: "2026-02-30" });
    expect(hasil).toEqual({ keadaan: "tidakValid", pesan: ['Tanggal jangkar tidak valid: "2026-02-30".'] });
  });

  it("menolak jumlah hari yang tidak sesuai pola", () => {
    expect(periksaJadwal({ pola: "mingguan", hariKirim: [], tanggalJangkar: null })).toEqual({
      keadaan: "tidakValid",
      pesan: ["Pola mingguan membutuhkan tepat 1 hari kirim, dipilih 0."],
    });
    expect(
      periksaJadwal({
        pola: "2x-seminggu",
        hariKirim: [{ hari: "Senin", persiapan: "H" }],
        tanggalJangkar: null,
      }),
    ).toEqual({ keadaan: "tidakValid", pesan: ["Pola 2× seminggu membutuhkan tepat 2 hari kirim, dipilih 1."] });
    expect(
      periksaJadwal({
        pola: "3x-seminggu",
        hariKirim: [
          { hari: "Senin", persiapan: "H" },
          { hari: "Rabu", persiapan: "H" },
        ],
        tanggalJangkar: null,
      }),
    ).toEqual({ keadaan: "tidakValid", pesan: ["Pola 3× seminggu membutuhkan tepat 3 hari kirim, dipilih 2."] });
    expect(periksaJadwal({ pola: "dua-mingguan", hariKirim: [], tanggalJangkar: "2026-06-10" })).toEqual({
      keadaan: "tidakValid",
      pesan: ["Pola dua mingguan membutuhkan minimal 1 hari kirim, dipilih 0."],
    });
  });

  it("menolak hari kirim yang dipilih dua kali", () => {
    const hasil = periksaJadwal({
      pola: "2x-seminggu",
      hariKirim: [
        { hari: "Senin", persiapan: "H" },
        { hari: "Senin", persiapan: "H-1" },
      ],
      tanggalJangkar: null,
    });
    expect(hasil).toEqual({ keadaan: "tidakValid", pesan: ["Hari Senin dipilih lebih dari sekali."] });
  });

  it("mengumpulkan semua pesan sekaligus", () => {
    const hasil = periksaJadwal({
      pola: "dua-mingguan",
      hariKirim: [
        { hari: "Senin", persiapan: "H" },
        { hari: "Senin", persiapan: "H-1" },
      ],
      tanggalJangkar: null,
    });
    expect(hasil).toEqual({
      keadaan: "tidakValid",
      pesan: ["Hari Senin dipilih lebih dari sekali.", "Pola dua mingguan wajib memiliki tanggal jangkar."],
    });
  });
});

describe("pola 1× sebulan (PRD A5 ▶ Keputusan 2026-10-12, A6 ▶ Revisi: L = 30)", () => {
  const selasaH1 = jadwalValid({ pola: "1x-sebulan", hariKirim: [{ hari: "Selasa", persiapan: "H-1" }], tanggalJangkar: null });
  const seninH = jadwalValid({ pola: "1x-sebulan", hariKirim: [{ hari: "Senin", persiapan: "H" }], tanggalJangkar: null });

  it("Selasa (H−1): 2026-10-06 (Selasa pertama Oktober) → kirim, p = 1, L = 30, cakupan 2026-10-05 s.d. 2026-11-04 (31 hari)", () => {
    expect(cek(selasaH1, "2026-10-06")).toEqual({ kirim: true, persiapanHari: 1, panjangCakupan: 30 });
    const { cakupan } = cakupanMenurutJadwal(selasaH1, "2026-10-06", { "Senin–Kamis": 1, Jumat: 1, Sabtu: 1, Minggu: 1 });
    expect(cakupan).toHaveLength(31);
    expect([cakupan[0], cakupan[30]]).toEqual(["2026-10-05", "2026-11-04"]);
  });

  it("Selasa (H−1): 2026-10-13 → tidak kirim; 2026-11-03 (Selasa pertama November) → kirim", () => {
    expect(cek(selasaH1, "2026-10-13")).toEqual({ kirim: false });
    expect(cek(selasaH1, "2026-11-03")).toEqual({ kirim: true, persiapanHari: 1, panjangCakupan: 30 });
  });

  it("Senin (H): 2026-11-02 → kirim; 2026-10-05 → kirim; 2026-10-12 → tidak kirim", () => {
    expect(cek(seninH, "2026-11-02")).toEqual({ kirim: true, persiapanHari: 0, panjangCakupan: 30 });
    expect(cek(seninH, "2026-10-05")).toEqual({ kirim: true, persiapanHari: 0, panjangCakupan: 30 });
    expect(cek(seninH, "2026-10-12")).toEqual({ kirim: false });
  });

  it("hari lain dari hari kirim di pekan pertama bukan tanggal kirim", () => {
    expect(cek(selasaH1, "2026-10-05")).toEqual({ kirim: false });
    expect(cek(selasaH1, "2026-10-07")).toEqual({ kirim: false });
  });

  it("tanggalKirimBerikutnya: kemunculan pertama hari itu di bulan berikutnya (35 hari kemudian bila perlu)", () => {
    expect(tanggalKirimBerikutnya(seninH, parseTanggalBisnis("2026-10-05"))).toBe("2026-11-02");
    expect(tanggalKirimBerikutnya(seninH, parseTanggalBisnis("2026-11-02"))).toBe("2026-12-07");
  });

  it("workbook SMB, Senin H−1, H = 2026-11-02: cakupan 2026-11-01 s.d. 2026-12-01 = Senin–Kamis 18, Jumat 4, Sabtu 4, Minggu 5 hari", () => {
    const smb = jadwalValid({ pola: "1x-sebulan", hariKirim: [{ hari: "Senin", persiapan: "H-1" }], tanggalJangkar: null });
    const hasil = cek(smb, "2026-11-02");
    if (!hasil.kirim) throw new Error("2026-11-02 harus tanggal kirim");
    const kirim = hitungKebutuhanKirim({
      tanggalKirim: parseTanggalBisnis("2026-11-02"),
      persiapanHari: hasil.persiapanHari,
      panjangCakupan: hasil.panjangCakupan,
      toko: "SMB",
      daftarPerubahan: [],
      rataRata: { "Senin–Kamis": 1, Jumat: 1, Sabtu: 1, Minggu: 1 },
      produk: { kode: "PW110P-GOR", kategori: "PARFUM WANITA" },
      stokAkhir: null,
      persenBuffer: 20,
    });
    expect([kirim.cakupan[0]?.tanggal, kirim.cakupan.at(-1)?.tanggal]).toEqual(["2026-11-01", "2026-12-01"]);
    if (!kirim.kebutuhan.tersedia) throw new Error("kebutuhan harus tersedia");
    expect(kirim.kebutuhan.rincian.map(({ kategori, jumlahHari }) => [kategori, jumlahHari])).toEqual([
      ["Senin–Kamis", 18],
      ["Jumat", 4],
      ["Sabtu", 4],
      ["Minggu", 5],
    ]);
  });

  it("periksaJadwal: dua hari ditolak; tanggal jangkar diabaikan", () => {
    expect(
      periksaJadwal({
        pola: "1x-sebulan",
        hariKirim: [
          { hari: "Senin", persiapan: "H" },
          { hari: "Kamis", persiapan: "H" },
        ],
        tanggalJangkar: null,
      }),
    ).toEqual({ keadaan: "tidakValid", pesan: ["Pola 1× sebulan membutuhkan tepat 1 hari kirim, dipilih 2."] });
    expect(periksaJadwal({ pola: "1x-sebulan", hariKirim: [{ hari: "Senin", persiapan: "H-2" }], tanggalJangkar: "2026-10-14" })).toEqual({
      keadaan: "valid",
      jadwal: { pola: "1x-sebulan", hariKirim: [{ hari: "Senin", persiapanHari: 2 }], tanggalJangkar: null },
    });
  });
});

describe("tanggalKirimSebelumnya — tanggal kirim terakhir sebelum tanggal itu menurut jadwal", () => {
  const sebelumnya = (jadwal: Jadwal, tanggal: string) => tanggalKirimSebelumnya(jadwal, parseTanggalBisnis(tanggal));
  const smb = jadwalValid({
    pola: "2x-seminggu",
    hariKirim: [
      { hari: "Senin", persiapan: "H" },
      { hari: "Kamis", persiapan: "H-1" },
    ],
    tanggalJangkar: null,
  });

  it("dari tanggal kirim: hari kirim sebelumnya, melintasi akhir minggu", () => {
    expect(sebelumnya(smb, "2026-10-22")).toBe("2026-10-19");
    expect(sebelumnya(smb, "2026-10-19")).toBe("2026-10-15");
  });

  it("dua mingguan: melewati pekan non-kirim", () => {
    const bxc = jadwalValid({ pola: "dua-mingguan", hariKirim: [{ hari: "Rabu", persiapan: "H-1" }], tanggalJangkar: "2026-10-14" });
    expect(sebelumnya(bxc, "2026-10-28")).toBe("2026-10-14");
  });

  it("1× sebulan: kemunculan pertama hari itu di bulan sebelumnya (35 hari sebelumnya bila perlu)", () => {
    const seninH = jadwalValid({ pola: "1x-sebulan", hariKirim: [{ hari: "Senin", persiapan: "H" }], tanggalJangkar: null });
    expect(sebelumnya(seninH, "2026-12-07")).toBe("2026-11-02");
    expect(sebelumnya(seninH, "2026-11-02")).toBe("2026-10-05");
  });
});

describe('kirimanSebelumnyaBelumSampai — peringatan "kiriman sebelumnya belum sampai" (PRD A6 ▶ Keputusan 2026-10-12, UAT ketiga)', () => {
  const belumSampai = (jadwal: Jadwal, tanggal: string) => kirimanSebelumnyaBelumSampai(jadwal, parseTanggalBisnis(tanggal));

  it("LWB 3× seminggu Senin/Rabu/Jumat H−1: kirim Rabu 2026-10-21, sebelumnya Senin 19 (jarak 2), p = 1 → tidak ada peringatan", () => {
    const lwb = jadwalValid({
      pola: "3x-seminggu",
      hariKirim: [
        { hari: "Senin", persiapan: "H-1" },
        { hari: "Rabu", persiapan: "H-1" },
        { hari: "Jumat", persiapan: "H-1" },
      ],
      tanggalJangkar: null,
    });
    expect(belumSampai(lwb, "2026-10-21")).toBeNull();
  });

  it("3× seminggu Senin (H−1), Selasa (H−1), Jumat (H): kirim Selasa 2026-10-20, sebelumnya Senin 19 (jarak 1), p = 1 → peringatan kiriman 2026-10-19", () => {
    const jadwal = jadwalValid({
      pola: "3x-seminggu",
      hariKirim: [
        { hari: "Senin", persiapan: "H-1" },
        { hari: "Selasa", persiapan: "H-1" },
        { hari: "Jumat", persiapan: "H" },
      ],
      tanggalJangkar: null,
    });
    expect(belumSampai(jadwal, "2026-10-20")).toBe("2026-10-19");
  });

  it("SMB 2× seminggu Senin (H), Kamis (H−1): kirim Kamis 2026-10-22, sebelumnya Senin 19 (jarak 3), p = 1 → tidak ada peringatan", () => {
    const smb = jadwalValid({
      pola: "2x-seminggu",
      hariKirim: [
        { hari: "Senin", persiapan: "H" },
        { hari: "Kamis", persiapan: "H-1" },
      ],
      tanggalJangkar: null,
    });
    expect(belumSampai(smb, "2026-10-22")).toBeNull();
  });

  it("1× seminggu dan dua mingguan dengan p ≤ 2 → tidak pernah ada peringatan", () => {
    const mingguan = jadwalValid({ pola: "mingguan", hariKirim: [{ hari: "Senin", persiapan: "H-2" }], tanggalJangkar: null });
    expect(belumSampai(mingguan, "2026-10-19")).toBeNull();
    const duaMingguan = jadwalValid({ pola: "dua-mingguan", hariKirim: [{ hari: "Rabu", persiapan: "H-2" }], tanggalJangkar: "2026-10-14" });
    expect(belumSampai(duaMingguan, "2026-10-28")).toBeNull();
  });
});

describe("hari Minggu sebagai hari kirim (PRD A5 ▶ Revisi 2026-10-13, pemilik)", () => {
  it("periksaJadwal menerima Minggu untuk semua pola", () => {
    expect(periksaJadwal({ pola: "mingguan", hariKirim: [{ hari: "Minggu", persiapan: "H-1" }], tanggalJangkar: null })).toEqual({
      keadaan: "valid",
      jadwal: { pola: "mingguan", hariKirim: [{ hari: "Minggu", persiapanHari: 1 }], tanggalJangkar: null },
    });
    expect(
      periksaJadwal({
        pola: "3x-seminggu",
        hariKirim: [
          { hari: "Senin", persiapan: "H" },
          { hari: "Rabu", persiapan: "H" },
          { hari: "Minggu", persiapan: "H-2" },
        ],
        tanggalJangkar: null,
      }).keadaan,
    ).toBe("valid");
  });

  it("mingguan Minggu (H−1) → setiap Minggu tanggal kirim, persiapan Sabtu, L = 7", () => {
    const jadwal = jadwalValid({ pola: "mingguan", hariKirim: [{ hari: "Minggu", persiapan: "H-1" }], tanggalJangkar: null });
    expect(cek(jadwal, "2026-10-18")).toEqual({ kirim: true, persiapanHari: 1, panjangCakupan: 7 });
    expect(cek(jadwal, "2026-10-25")).toEqual({ kirim: true, persiapanHari: 1, panjangCakupan: 7 });
    expect(cek(jadwal, "2026-11-01")).toEqual({ kirim: true, persiapanHari: 1, panjangCakupan: 7 });
    expect(cek(jadwal, "2026-10-17")).toEqual({ kirim: false });
    expect(cek(jadwal, "2026-10-19")).toEqual({ kirim: false });
    const { cakupan } = cakupanMenurutJadwal(jadwal, "2026-10-18", { "Senin–Kamis": 1, Jumat: 1, Sabtu: 1, Minggu: 1 });
    // Cakupan dimulai dari hari persiapan Sabtu 2026-10-17 sampai Sabtu 2026-10-24.
    expect([cakupan[0], cakupan.at(-1)]).toEqual(["2026-10-17", "2026-10-24"]);
  });

  it("2× seminggu Kamis (H) dan Minggu (H) → L Kamis = 3, L Minggu = 4", () => {
    const jadwal = jadwalValid({
      pola: "2x-seminggu",
      hariKirim: [
        { hari: "Kamis", persiapan: "H" },
        { hari: "Minggu", persiapan: "H" },
      ],
      tanggalJangkar: null,
    });
    expect(cek(jadwal, "2026-10-15")).toEqual({ kirim: true, persiapanHari: 0, panjangCakupan: 3 });
    expect(cek(jadwal, "2026-10-18")).toEqual({ kirim: true, persiapanHari: 0, panjangCakupan: 4 });
  });

  it("dua mingguan Minggu, jangkar 2026-10-14 → 2026-10-18 dan 2026-11-01 tanggal kirim; 2026-10-25 bukan", () => {
    const jadwal = jadwalValid({ pola: "dua-mingguan", hariKirim: [{ hari: "Minggu", persiapan: "H" }], tanggalJangkar: "2026-10-14" });
    expect(cek(jadwal, "2026-10-18")).toEqual({ kirim: true, persiapanHari: 0, panjangCakupan: 14 });
    expect(cek(jadwal, "2026-11-01")).toEqual({ kirim: true, persiapanHari: 0, panjangCakupan: 14 });
    expect(cek(jadwal, "2026-10-25")).toEqual({ kirim: false });
    expect(cek(jadwal, "2026-10-11")).toEqual({ kirim: false });
  });

  it("1× sebulan Minggu → 2026-11-01 dan 2026-12-06 tanggal kirim, L = 30", () => {
    const jadwal = jadwalValid({ pola: "1x-sebulan", hariKirim: [{ hari: "Minggu", persiapan: "H" }], tanggalJangkar: null });
    expect(cek(jadwal, "2026-11-01")).toEqual({ kirim: true, persiapanHari: 0, panjangCakupan: 30 });
    expect(cek(jadwal, "2026-12-06")).toEqual({ kirim: true, persiapanHari: 0, panjangCakupan: 30 });
    expect(cek(jadwal, "2026-11-08")).toEqual({ kirim: false });
    expect(tanggalKirimBerikutnya(jadwal, parseTanggalBisnis("2026-11-01"))).toBe("2026-12-06");
  });

  it("peringatan kiriman sebelumnya belum sampai berlaku untuk Minggu: Sabtu (H) lalu Minggu (H−1)", () => {
    const jadwal = jadwalValid({
      pola: "2x-seminggu",
      hariKirim: [
        { hari: "Sabtu", persiapan: "H" },
        { hari: "Minggu", persiapan: "H-1" },
      ],
      tanggalJangkar: null,
    });
    expect(kirimanSebelumnyaBelumSampai(jadwal, parseTanggalBisnis("2026-10-18"))).toBe("2026-10-17");
  });
});

// T113 — PRD A5 ▶ Revisi 2026-10-13: tanggal kirim toko = jadwal tetap − tanggal rutin yang dipindah + tanggal
// pengiriman di luar jadwal yang berlaku. Contoh BOTANI: 2× seminggu Senin (H) dan Kamis (H−1).
describe("tanggalKirimToko", () => {
  const botani = jadwalValid({
    pola: "2x-seminggu",
    hariKirim: [
      { hari: "Senin", persiapan: "H" },
      { hari: "Kamis", persiapan: "H-1" },
    ],
    tanggalJangkar: null,
  });
  const t = parseTanggalBisnis;
  const pekan = [t("2026-10-19"), t("2026-10-25")] as const;

  it("tanpa pengiriman di luar jadwal = tanggal menurut jadwal tetap", () => {
    expect(tanggalKirimToko(botani, [], ...pekan)).toEqual(["2026-10-19", "2026-10-22"]);
  });

  it("tambahan Selasa 20-10-2026 berlaku: Senin, Selasa, Kamis", () => {
    const tambahan = [{ tanggalKirim: t("2026-10-20"), persiapanHari: 1 as const, tanggalRutinDipindah: null }];
    expect(tanggalKirimToko(botani, tambahan, ...pekan)).toEqual(["2026-10-19", "2026-10-20", "2026-10-22"]);
  });

  it("pindah Senin 19-10-2026 ke Selasa 20-10-2026: Senin tidak lagi tanggal kirim", () => {
    const pindah = [{ tanggalKirim: t("2026-10-20"), persiapanHari: 0 as const, tanggalRutinDipindah: t("2026-10-19") }];
    expect(tanggalKirimToko(botani, pindah, ...pekan)).toEqual(["2026-10-20", "2026-10-22"]);
  });

  it("pengiriman di luar rentang tidak ikut; toko tanpa jadwal tetap hanya punya tanggal di luar jadwal", () => {
    const tambahan = [
      { tanggalKirim: t("2026-10-20"), persiapanHari: 1 as const, tanggalRutinDipindah: null },
      { tanggalKirim: t("2026-10-27"), persiapanHari: 1 as const, tanggalRutinDipindah: null },
    ];
    expect(tanggalKirimToko(null, tambahan, ...pekan)).toEqual(["2026-10-20"]);
    expect(tanggalKirimToko(botani, [], t("2026-10-20"), t("2026-10-20"))).toEqual([]);
  });
});

// T114 — PRD A5 ▶ Revisi 2026-10-13 (Ikut perhitungan seperti pengiriman biasa), A6 ▶ Revisi 2026-10-13: tanggal kirim
// berikutnya (L), tanggal kirim sebelumnya (peringatan), dan persiapan per tanggal dibaca dari tanggal kirim toko.
describe("tanggal kirim toko: L dan peringatan memakai jadwal tetap + pengiriman di luar jadwal yang berlaku", () => {
  const t = parseTanggalBisnis;
  const botani = jadwalValid({
    pola: "2x-seminggu",
    hariKirim: [
      { hari: "Senin", persiapan: "H" },
      { hari: "Kamis", persiapan: "H-1" },
    ],
    tanggalJangkar: null,
  });
  const cekToko = (toko: Parameters<typeof tanggalKirimMenurutToko>[0], tanggal: string) =>
    tanggalKirimMenurutToko(toko, t(tanggal));

  describe("contoh BOTANI PRD A5: tambahan Selasa 2026-10-20 (H−1)", () => {
    const tambahan = { tanggalKirim: t("2026-10-20"), persiapanHari: 1 as const, tanggalRutinDipindah: null };
    const toko = { jadwal: botani, diLuarJadwal: [tambahan] };

    it("Senin 2026-10-19: L = 1 (sebelumnya 3)", () => {
      expect(cekToko({ jadwal: botani, diLuarJadwal: [] }, "2026-10-19")).toMatchObject({ kirim: true, panjangCakupan: 3 });
      expect(cekToko(toko, "2026-10-19")).toEqual({ kirim: true, persiapanHari: 0, panjangCakupan: 1, diLuarJadwal: null });
    });

    it("Selasa 2026-10-20: tanggal kirim di luar jadwal, persiapan dari pengiriman itu, L = 2, p = 1 (cakupan 19–21 Oktober)", () => {
      const hasil = cekToko(toko, "2026-10-20");
      expect(hasil).toEqual({ kirim: true, persiapanHari: 1, panjangCakupan: 2, diLuarJadwal: tambahan });
      if (!hasil.kirim) throw new Error("harus tanggal kirim");
      const cakupan = cakupanPengiriman({
        tanggalKirim: t("2026-10-20"),
        persiapanHari: hasil.persiapanHari,
        panjangCakupan: hasil.panjangCakupan,
        toko: "BOTANI",
        daftarPerubahan: [],
      }).map((c) => c.tanggal);
      expect(cakupan).toEqual(["2026-10-19", "2026-10-20", "2026-10-21"]);
    });

    it('Selasa 2026-10-20: peringatan "Kiriman Senin, 19-10-2026 belum sampai saat persiapan"', () => {
      expect(kirimanSebelumnyaBelumSampaiToko(toko, t("2026-10-20"))).toBe("2026-10-19");
    });

    it("Kamis 2026-10-22: tidak berubah (Rabu–Minggu, L = 4, tanpa peringatan)", () => {
      expect(cekToko(toko, "2026-10-22")).toEqual({ kirim: true, persiapanHari: 1, panjangCakupan: 4, diLuarJadwal: null });
      expect(kirimanSebelumnyaBelumSampaiToko(toko, t("2026-10-22"))).toBeNull();
    });

    it("tanggal kirim berikutnya dan sebelumnya melewati tanggal tambahan", () => {
      expect(tanggalKirimTokoBerikutnya(toko, t("2026-10-19"))).toBe("2026-10-20");
      expect(tanggalKirimTokoSebelumnya(toko, t("2026-10-22"))).toBe("2026-10-20");
      expect(tanggalKirimTokoSebelumnya(toko, t("2026-10-20"))).toBe("2026-10-19");
    });
  });

  describe("pindah Senin 2026-10-19 → Selasa 2026-10-20 (H)", () => {
    const pindah = { tanggalKirim: t("2026-10-20"), persiapanHari: 0 as const, tanggalRutinDipindah: t("2026-10-19") };
    const toko = { jadwal: botani, diLuarJadwal: [pindah] };

    it("2026-10-19 bukan tanggal kirim", () => {
      expect(cekToko(toko, "2026-10-19")).toEqual({ kirim: false });
    });

    it("Kamis 2026-10-15: L = 5", () => {
      expect(cekToko(toko, "2026-10-15")).toMatchObject({ kirim: true, panjangCakupan: 5, diLuarJadwal: null });
      expect(tanggalKirimTokoBerikutnya(toko, t("2026-10-15"))).toBe("2026-10-20");
    });

    it("Selasa 2026-10-20: L = 2", () => {
      expect(cekToko(toko, "2026-10-20")).toEqual({ kirim: true, persiapanHari: 0, panjangCakupan: 2, diLuarJadwal: pindah });
      expect(tanggalKirimTokoSebelumnya(toko, t("2026-10-20"))).toBe("2026-10-15");
      expect(kirimanSebelumnyaBelumSampaiToko(toko, t("2026-10-20"))).toBeNull();
    });
  });

  describe("1× sebulan Selasa (H) dengan tambahan Selasa 2026-11-17 (H)", () => {
    const sebulan = jadwalValid({ pola: "1x-sebulan", hariKirim: [{ hari: "Selasa", persiapan: "H" }], tanggalJangkar: null });
    const tambahan = { tanggalKirim: t("2026-11-17"), persiapanHari: 0 as const, tanggalRutinDipindah: null };
    const toko = { jadwal: sebulan, diLuarJadwal: [tambahan] };

    it("kirim 2026-11-03: L = 14 (berakhir sehari sebelum pengiriman di luar jadwal berikutnya)", () => {
      expect(cekToko(toko, "2026-11-03")).toEqual({ kirim: true, persiapanHari: 0, panjangCakupan: 14, diLuarJadwal: null });
    });

    it("kirim 2026-11-17: L = 14 (berikutnya 2026-12-01)", () => {
      expect(cekToko(toko, "2026-11-17")).toEqual({ kirim: true, persiapanHari: 0, panjangCakupan: 14, diLuarJadwal: tambahan });
      expect(tanggalKirimTokoBerikutnya(toko, t("2026-11-17"))).toBe("2026-12-01");
    });

    it("pindah 1× sebulan Senin (H) 2026-11-02 → Rabu 2026-11-04, berikutnya 2026-12-07 (33 hari): L = 30 (keputusan pemilik 2026-10-14)", () => {
      const seninPertama = jadwalValid({ pola: "1x-sebulan", hariKirim: [{ hari: "Senin", persiapan: "H" }], tanggalJangkar: null });
      const pindah = { tanggalKirim: t("2026-11-04"), persiapanHari: 0 as const, tanggalRutinDipindah: t("2026-11-02") };
      const tokoPindah = { jadwal: seninPertama, diLuarJadwal: [pindah] };
      expect(tanggalKirimTokoBerikutnya(tokoPindah, t("2026-11-04"))).toBe("2026-12-07");
      expect(cekToko(tokoPindah, "2026-11-04")).toEqual({ kirim: true, persiapanHari: 0, panjangCakupan: 30, diLuarJadwal: pindah });
    });

    it("tanpa tambahan, 2026-11-03 tetap L = 30", () => {
      expect(cekToko({ jadwal: sebulan, diLuarJadwal: [] }, "2026-11-03")).toMatchObject({ kirim: true, panjangCakupan: 30 });
    });
  });
});
