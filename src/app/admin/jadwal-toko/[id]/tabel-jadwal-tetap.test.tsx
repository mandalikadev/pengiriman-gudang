// @vitest-environment jsdom
import { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tiruan = vi.hoisted(() => ({
  aturJadwalTetapToko: vi.fn(),
  nonaktifkanJadwalTetapToko: vi.fn(),
  salinJadwalTetap: vi.fn(),
}));
vi.mock("../aksi", () => tiruan);

import {
  bukaDialogKonfirmasi,
  dialogKonfirmasi,
  judulDialogKonfirmasi,
  lepasTerpasang,
  pasangUntukUji,
  pilihDiDialogKonfirmasi,
} from "@/components/ui/uji-bantu-dialog-konfirmasi";
import { parseTanggalBisnis } from "@/domain/kalender";

import { RiwayatJadwalTetap } from "./riwayat-jadwal-tetap";
import { TabelJadwalTetap, type TokoJadwalTetap } from "./tabel-jadwal-tetap";

// T112 (PRD A5 ▶ Revisi 2026-10-13; DESIGN §11.2, §11.3): "Atur jadwal" membuka panel samping berisi form jadwal tetap
// dan riwayatnya; menonaktifkan meminta konfirmasi; salin jadwal dibuka dari halaman yang sama.

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const DIATUR = new Date("2026-10-13T03:05:00Z");
const DIGANTI = new Date("2026-10-14T02:10:00Z");

const botani: TokoJadwalTetap = {
  id: 11,
  nama: "BOTANI",
  aktif: true,
  jadwal: {
    versi: 31,
    pola: "2x-seminggu",
    hariKirim: [
      { hari: "Senin", persiapanHari: 0 },
      { hari: "Kamis", persiapanHari: 1 },
    ],
    tanggalJangkar: null,
    diaturOleh: "Admin Uji",
    diaturPada: DIGANTI,
  },
  riwayat: [
    {
      id: 31,
      pola: "2x-seminggu",
      hariKirim: [
        { hari: "Senin", persiapanHari: 0 },
        { hari: "Kamis", persiapanHari: 1 },
      ],
      tanggalJangkar: null,
      diaturOleh: "Admin Uji",
      diaturPada: DIGANTI,
      berakhir: null,
    },
    {
      id: 30,
      pola: "dua-mingguan",
      hariKirim: [{ hari: "Rabu", persiapanHari: 1 }],
      tanggalJangkar: parseTanggalBisnis("2026-10-14"),
      diaturOleh: "Admin Lama",
      diaturPada: DIATUR,
      berakhir: { jenis: "diganti", oleh: "Admin Uji", pada: DIGANTI },
    },
  ],
};
const tanpaJadwal: TokoJadwalTetap = { id: 12, nama: "SMB", aktif: false, jadwal: null, riwayat: [] };

beforeEach(() => {
  for (const f of Object.values(tiruan)) f.mockReset();
});

afterEach(() => {
  lepasTerpasang();
});

const panel = () => document.querySelector<HTMLElement>('[data-slot="dialog-isi"]');

function klik(wadah: ParentNode, selektor: string) {
  const elemen = wadah.querySelector<HTMLElement>(selektor);
  if (elemen === null) throw new Error(`${selektor} tidak ada.`);
  act(() => elemen.click());
}

describe("TabelJadwalTetap", () => {
  it("tabel menampilkan pola, hari kirim + persiapan, jangkar, diatur oleh/pada, dan status toko", () => {
    const wadah = pasangUntukUji(<TabelJadwalTetap idGudang={2} daftarToko={[botani, tanpaJadwal]} />);
    const baris = wadah.querySelector('tr[data-jadwal-toko="11"]')?.textContent ?? "";
    expect(baris).toContain("BOTANI");
    expect(baris).toContain("Aktif");
    expect(baris).toContain("2× seminggu");
    expect(baris).toContain("Senin (H), Kamis (H−1)");
    expect(baris).toContain("Admin Uji, Rabu, 14-10-2026");
    expect(wadah.querySelector('tr[data-jadwal-toko="11"] time')?.getAttribute("title")).toBe("Rabu, 14-10-2026 pukul 09.10 WIB");

    const kosong = wadah.querySelector('tr[data-jadwal-toko="12"]')?.textContent ?? "";
    expect(kosong).toContain("Nonaktif");
    expect(kosong).toContain("Belum ada jadwal");
    expect(panel()).toBeNull();
  });

  it('"Atur jadwal" membuka panel samping berisi form jadwal tetap terisi jadwal aktif dan riwayatnya', () => {
    const wadah = pasangUntukUji(<TabelJadwalTetap idGudang={2} daftarToko={[botani, tanpaJadwal]} />);
    klik(wadah, '[data-atur-jadwal="11"]');

    const isi = panel();
    expect(isi?.getAttribute("data-bentuk")).toBe("samping");
    expect(isi?.textContent).toContain("Jadwal tetap BOTANI");
    const centang = [...(isi?.querySelectorAll<HTMLInputElement>('input[name="hariKirim"]') ?? [])].filter((c) => c.checked);
    expect(centang.map((c) => c.value)).toEqual(["Senin", "Kamis"]);
    expect(isi?.querySelectorAll("[data-riwayat-jadwal]")).toHaveLength(2);
    expect(isi?.textContent).toContain("Simpan jadwal");
    expect(isi?.textContent).toContain("Nonaktifkan jadwal");
  });

  it("Simpan jadwal memanggil aksi admin dengan isian panel", async () => {
    tiruan.aturJadwalTetapToko.mockResolvedValue({ keadaan: "berhasil" });
    const wadah = pasangUntukUji(<TabelJadwalTetap idGudang={2} daftarToko={[botani]} />);
    klik(wadah, '[data-atur-jadwal="11"]');
    const form = panel()?.querySelector("form");
    await act(async () => {
      form?.requestSubmit();
    });
    expect(tiruan.aturJadwalTetapToko).toHaveBeenCalledWith({
      idGudang: 2,
      idToko: 11,
      pola: "2x-seminggu",
      hariKirim: [
        { hari: "Senin", persiapan: "H" },
        { hari: "Kamis", persiapan: "H-1" },
      ],
      tanggalJangkar: null,
    });
    expect(panel()?.textContent).toContain("Berhasil disimpan");
  });

  it("Nonaktifkan jadwal meminta konfirmasi; Batal tidak memanggil aksi, Nonaktifkan memanggilnya", async () => {
    tiruan.nonaktifkanJadwalTetapToko.mockResolvedValue({ keadaan: "berhasil" });
    const wadah = pasangUntukUji(<TabelJadwalTetap idGudang={2} daftarToko={[botani]} />);
    klik(wadah, '[data-atur-jadwal="11"]');

    bukaDialogKonfirmasi(panel() ?? wadah, "Nonaktifkan jadwal");
    expect(judulDialogKonfirmasi()).toBe("Nonaktifkan jadwal tetap BOTANI?");
    await pilihDiDialogKonfirmasi("Batal");
    expect(tiruan.nonaktifkanJadwalTetapToko).not.toHaveBeenCalled();

    bukaDialogKonfirmasi(panel() ?? wadah, "Nonaktifkan jadwal");
    await pilihDiDialogKonfirmasi("Nonaktifkan");
    expect(dialogKonfirmasi()).toBeNull();
    expect(tiruan.nonaktifkanJadwalTetapToko).toHaveBeenCalledWith({ idGudang: 2, idToko: 11 });
  });

  it("toko tanpa jadwal: panel tanpa tombol Nonaktifkan jadwal", () => {
    const wadah = pasangUntukUji(<TabelJadwalTetap idGudang={2} daftarToko={[tanpaJadwal]} />);
    klik(wadah, '[data-atur-jadwal="12"]');
    expect(panel()?.textContent).not.toContain("Nonaktifkan jadwal");
    expect(panel()?.textContent).toContain("Toko ini belum pernah punya jadwal tetap.");
  });

  it("Salin jadwal ke beberapa toko membuka panel dengan pilihan toko, lima pola, dan hari Senin–Minggu", async () => {
    tiruan.salinJadwalTetap.mockResolvedValue({
      keadaan: "berhasil",
      hasil: [
        { idToko: 11, status: "berhasil" },
        { idToko: 12, status: "ditolak", pesan: "Toko tidak terhubung ke gudang ini. Muat ulang halaman, lalu pilih lagi." },
      ],
    });
    const wadah = pasangUntukUji(<TabelJadwalTetap idGudang={2} daftarToko={[botani, tanpaJadwal]} />);
    klik(wadah, "[data-buka-salin-jadwal]");

    const isi = panel();
    expect(isi?.textContent).toContain("Salin jadwal ke beberapa toko");
    expect([...(isi?.querySelectorAll<HTMLInputElement>('input[name="toko"]') ?? [])].map((c) => c.value)).toEqual(["11", "12"]);
    const pola = [...(isi?.querySelectorAll("select") ?? [])].find((s) => s.querySelector('option[value="mingguan"]') !== null);
    expect([...(pola?.options ?? [])].map((o) => o.value)).toEqual(["mingguan", "2x-seminggu", "3x-seminggu", "dua-mingguan", "1x-sebulan"]);
    expect([...(isi?.querySelectorAll<HTMLInputElement>('input[name="hariKirim"]') ?? [])].map((c) => c.value)).toEqual([
      "Senin",
      "Selasa",
      "Rabu",
      "Kamis",
      "Jumat",
      "Sabtu",
      "Minggu",
    ]);

    klik(isi ?? wadah, 'input[name="toko"][value="11"]');
    klik(isi ?? wadah, 'input[name="toko"][value="12"]');
    klik(isi ?? wadah, 'input[name="hariKirim"][value="Selasa"]');
    await act(async () => {
      isi?.querySelector("form")?.requestSubmit();
    });
    expect(tiruan.salinJadwalTetap).toHaveBeenCalledWith({
      idGudang: 2,
      daftarIdToko: [11, 12],
      pola: "mingguan",
      hariKirim: [{ hari: "Selasa", persiapan: "H" }],
      tanggalJangkar: null,
    });
    expect(panel()?.textContent).toContain("1 dari 2 toko berhasil.");
    expect(panel()?.querySelector('[data-hasil-salin-toko="12"]')?.textContent).toContain("Ditolak");
  });

  it("tanpa toko terhubung: keadaan kosong dengan langkah berikutnya, tanpa tombol salin", () => {
    const wadah = pasangUntukUji(<TabelJadwalTetap idGudang={2} daftarToko={[]} />);
    expect(wadah.textContent).toContain("Belum ada toko yang terhubung ke gudang ini.");
    expect(wadah.querySelector("[data-buka-salin-jadwal]")).toBeNull();
  });
});

describe("RiwayatJadwalTetap", () => {
  it("terbaru di atas: pola dan hari, diatur oleh dan kapan, diganti/dinonaktifkan oleh dan kapan", () => {
    const html = renderToStaticMarkup(
      <RiwayatJadwalTetap
        riwayat={[
          { ...botani.riwayat[0]!, berakhir: { jenis: "dinonaktifkan", oleh: "Admin Uji", pada: new Date("2026-10-15T01:00:00Z") } },
          botani.riwayat[1]!,
        ]}
      />,
    );
    const entri = [...html.matchAll(/<li[^>]*data-riwayat-jadwal="(\d+)"[^>]*>(.*?)<\/li>/g)].map((m) => [
      m[1],
      m[2]!.replace(/<[^>]+>/g, " ").replace(/<!-- -->/g, "").replace(/\s+/g, " ").trim(),
    ]);
    expect(entri.map(([id]) => id)).toEqual(["31", "30"]);
    expect(entri[0]![1]).toContain("Dinonaktifkan 2× seminggu Senin (H), Kamis (H−1)");
    expect(entri[0]![1]).toContain("Diatur oleh Admin Uji, Rabu, 14-10-2026 pukul 09.10 WIB");
    expect(entri[0]![1]).toContain("Dinonaktifkan oleh Admin Uji, Kamis, 15-10-2026 pukul 08.00 WIB");
    expect(entri[1]![1]).toContain("Diganti Dua mingguan Rabu (H−1) Tanggal jangkar: Rabu, 14-10-2026");
    expect(entri[1]![1]).toContain("Diatur oleh Admin Lama, Selasa, 13-10-2026 pukul 10.05 WIB");
    expect(entri[1]![1]).toContain("Diganti oleh Admin Uji, Rabu, 14-10-2026 pukul 09.10 WIB");
    expect(html).toContain("lucide-archive");
  });
});
