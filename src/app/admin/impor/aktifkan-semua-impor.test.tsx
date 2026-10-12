// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tiruan = vi.hoisted(() => ({ aktifkanSemuaImporSiap: vi.fn(), segarkan: vi.fn() }));
vi.mock("./aksi", () => ({ aktifkanSemuaImporSiap: tiruan.aktifkanSemuaImporSiap }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: tiruan.segarkan, push: () => {} }) }));

import { AktifkanSemuaImpor } from "./aktifkan-semua-impor";

// T86 (PRD A1 ▶ Keputusan 2026-10-12, UAT kedua): tombol "Aktifkan semua yang siap" di Daftar impor.

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let terpasang: { wadah: HTMLElement; akar: Root } | null = null;

beforeEach(() => {
  tiruan.aktifkanSemuaImporSiap.mockReset();
  tiruan.segarkan.mockReset();
});

afterEach(() => {
  if (terpasang) {
    const { akar, wadah } = terpasang;
    act(() => akar.unmount());
    wadah.remove();
    terpasang = null;
  }
});

function pasang(jumlahSiap: number) {
  const wadah = document.createElement("div");
  document.body.append(wadah);
  const akar = createRoot(wadah);
  act(() => akar.render(<AktifkanSemuaImpor jumlahSiap={jumlahSiap} />));
  terpasang = { wadah, akar };
  return wadah;
}

function tombol(wadah: HTMLElement) {
  const t = [...wadah.querySelectorAll("button")].find((b) => b.textContent?.startsWith("Aktifkan semua yang siap"));
  if (!t) throw new Error("tombol tidak ada");
  return t;
}

const LEWATI = "Ada lebih dari satu impor siap untuk bulan ini; aktifkan satu per satu dari halaman tinjau.";
const dasar = { namaFile: "penjualan.xlsx", tahunImpor: 2026 };

describe("AktifkanSemuaImpor", () => {
  it("tombol menyebut jumlah impor yang siap", () => {
    const t = tombol(pasang(3));
    expect(t.textContent).toBe("Aktifkan semua yang siap (3)");
    expect(t.disabled).toBe(false);
  });

  it("tidak bisa ditekan jika jumlahnya 0", () => {
    const t = tombol(pasang(0));
    expect(t.textContent).toBe("Aktifkan semua yang siap (0)");
    expect(t.disabled).toBe(true);
  });

  it("setelah ditekan menampilkan hasil per impor (sheet, bulan impor, keadaan + alasan) beserta jumlah per keadaan", async () => {
    tiruan.aktifkanSemuaImporSiap.mockResolvedValue({
      keadaan: "berhasil",
      impor: [
        { ...dasar, idImpor: 1, namaSheet: "JUNI (S)", bulanImpor: 6, keadaan: "dilewati", pesan: LEWATI },
        { ...dasar, idImpor: 2, namaSheet: "JUNI (S)", bulanImpor: 6, keadaan: "dilewati", pesan: LEWATI },
        { ...dasar, idImpor: 3, namaSheet: "JULI (S)", bulanImpor: 7, keadaan: "diaktifkan" },
        { ...dasar, idImpor: 4, namaSheet: "AGUSTUS (S)", bulanImpor: 8, keadaan: "gagal", pesan: "Impor ini sudah aktif." },
      ],
    });
    const wadah = pasang(4);

    await act(async () => tombol(wadah).click());

    expect(tiruan.aktifkanSemuaImporSiap).toHaveBeenCalledTimes(1);
    expect(tiruan.segarkan).toHaveBeenCalledTimes(1);
    const hasil = wadah.querySelector('[aria-label="Hasil aktifkan semua per impor"]');
    expect(hasil?.textContent).toContain("1 diaktifkan, 2 dilewati, 1 gagal.");

    const baris = (id: number) => wadah.querySelector(`[data-hasil-aktifkan-impor="${id}"]`);
    expect(baris(3)?.textContent).toContain("JULI (S)");
    expect(baris(3)?.textContent).toContain("Juli 2026");
    expect(baris(3)?.querySelector('[data-keadaan-aktifkan="diaktifkan"]')?.textContent).toBe("Diaktifkan");
    expect(baris(3)?.querySelector(".lucide-circle-check")).not.toBeNull();

    expect(baris(1)?.textContent).toContain("Juni 2026");
    expect(baris(1)?.querySelector('[data-keadaan-aktifkan="dilewati"]')?.textContent).toBe("Dilewati");
    expect(baris(1)?.querySelector(".lucide-triangle-alert")).not.toBeNull();
    expect(baris(1)?.textContent).toContain(LEWATI);

    expect(baris(4)?.querySelector('[data-keadaan-aktifkan="gagal"]')?.textContent).toBe("Gagal");
    expect(baris(4)?.querySelector(".lucide-circle-x")).not.toBeNull();
    expect(baris(4)?.textContent).toContain("Impor ini sudah aktif.");

    expect(wadah.querySelector('[data-keadaan="berhasil"]')?.textContent).toContain("1 impor diaktifkan.");
  });

  it("tidak ada yang diaktifkan → pesan gagal beserta hasil per impor; tampilan tidak dimuat ulang", async () => {
    tiruan.aktifkanSemuaImporSiap.mockResolvedValue({
      keadaan: "gagal",
      pesan: "Tidak ada impor yang diaktifkan. Lihat keterangan per impor.",
      impor: [
        {
          ...dasar,
          idImpor: 9,
          namaSheet: "JUNI (S)",
          bulanImpor: 6,
          keadaan: "dilewati",
          pesan: "Tidak bisa diaktifkan: ada 2 error. Perbaiki di Excel, lalu unggah ulang.",
        },
      ],
    });
    const wadah = pasang(1);

    await act(async () => tombol(wadah).click());

    expect(tiruan.segarkan).not.toHaveBeenCalled();
    expect(wadah.querySelector('[data-keadaan="gagal"]')?.textContent).toContain("Tidak ada impor yang diaktifkan.");
    expect(wadah.querySelector('[data-hasil-aktifkan-impor="9"]')?.textContent).toContain("ada 2 error");
  });

  it("server tidak menjawab → hasil belum pasti, tanpa pengulangan otomatis", async () => {
    tiruan.aktifkanSemuaImporSiap.mockRejectedValue(new Error("jaringan putus"));
    const wadah = pasang(2);

    await act(async () => tombol(wadah).click());

    expect(tiruan.aktifkanSemuaImporSiap).toHaveBeenCalledTimes(1);
    expect(wadah.querySelector('[data-keadaan="gagal"]')?.textContent).toContain("Hasil belum pasti");
  });

  it("tersimpan tetapi gagal memuat ulang tampilan", async () => {
    tiruan.aktifkanSemuaImporSiap.mockResolvedValue({
      keadaan: "tersimpanGagalMuatUlang",
      impor: [{ ...dasar, idImpor: 5, namaSheet: "JULI (S)", bulanImpor: 7, keadaan: "diaktifkan" }],
    });
    const wadah = pasang(1);

    await act(async () => tombol(wadah).click());

    expect(wadah.querySelector('[data-keadaan="tersimpanGagalMuatUlang"]')).not.toBeNull();
    expect(wadah.querySelector('[data-hasil-aktifkan-impor="5"]')).not.toBeNull();
  });
});
