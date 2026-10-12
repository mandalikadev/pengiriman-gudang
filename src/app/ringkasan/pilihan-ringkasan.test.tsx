// @vitest-environment jsdom
import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

// `next/form` asli butuh router App Router. Tiruan ini meniru navigasinya: Terapkan (submit) menulis isian form ke URL.
const tiruan = vi.hoisted(() => ({ navigasi: vi.fn<(url: string) => void>() }));
vi.mock("next/form", () => ({
  default: ({ action, ...props }: ComponentProps<"form"> & { action: string }) => (
    <form
      {...props}
      onSubmit={(e) => {
        e.preventDefault();
        const isian = new URLSearchParams();
        for (const [nama, nilai] of new FormData(e.currentTarget)) isian.append(nama, String(nilai));
        tiruan.navigasi(`${action}?${isian.toString()}`);
      }}
    />
  ),
}));

import { PilihanRingkasan } from "./pilihan-ringkasan";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const TOKO = [
  { id: 11, nama: "PMS" },
  { id: 12, nama: "GOR" },
  { id: 13, nama: "BALI" },
];
const KATEGORI = ["15ML GLITTER/LEATHER", "30ML", "TESTER"];

let terpasang: { wadah: HTMLElement; akar: Root } | null = null;

function buka(terapan: { toko?: string[]; kategoriProduk?: string[] } = {}) {
  const wadah = document.createElement("div");
  document.body.append(wadah);
  const akar = createRoot(wadah);
  act(() =>
    akar.render(
      <PilihanRingkasan
        bulanTersedia={[{ kode: "2026-06", label: "Juni 2026" }]}
        opsiFilter={{ toko: TOKO, kategoriProduk: KATEGORI, produk: [] }}
        terapan={{ bulan: ["2026-06"], toko: terapan.toko ?? [], kategoriProduk: terapan.kategoriProduk ?? [], produk: [] }}
      />,
    ),
  );
  terpasang = { wadah, akar };
  return wadah;
}

afterEach(() => {
  if (terpasang !== null) {
    const { wadah, akar } = terpasang;
    act(() => akar.unmount());
    wadah.remove();
    terpasang = null;
  }
  tiruan.navigasi.mockReset();
});

function tombol(wadah: HTMLElement, label: string) {
  const elemen = wadah.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (elemen === null) throw new Error(`Tombol "${label}" tidak ada.`);
  return elemen;
}

const klik = (elemen: HTMLElement) => act(() => elemen.click());

/** Nilai yang tercentang untuk satu nama isian (toko / kategoriProduk / bulan). */
const tercentang = (wadah: HTMLElement, nama: string) =>
  [...wadah.querySelectorAll<HTMLInputElement>(`input[type="checkbox"][name="${nama}"]`)].filter((i) => i.checked).map((i) => i.value);

function terapkan(wadah: HTMLElement) {
  const elemen = [...wadah.querySelectorAll("button")].find((b) => b.textContent === "Terapkan");
  if (elemen === undefined) throw new Error("Tombol Terapkan tidak ada.");
  klik(elemen);
}

const urlTerakhir = () => new URL(String(tiruan.navigasi.mock.lastCall?.[0]), "http://lokal");

describe("PilihanRingkasan: Pilih semua dan Kosongkan (T87, PRD A2 ▶ Keputusan 2026-10-12)", () => {
  it('"Pilih semua toko" mencentang semua toko; "Kosongkan" menghapus centangnya', () => {
    const wadah = buka({ toko: ["12"] });
    expect(tercentang(wadah, "toko")).toEqual(["12"]);

    klik(tombol(wadah, "Pilih semua toko"));
    expect(tercentang(wadah, "toko")).toEqual(["11", "12", "13"]);

    klik(tombol(wadah, "Kosongkan pilihan toko"));
    expect(tercentang(wadah, "toko")).toEqual([]);
  });

  it('"Pilih semua kategori produk" dan "Kosongkan" hanya mengubah grup kategori produk', () => {
    const wadah = buka({ toko: ["13"] });

    klik(tombol(wadah, "Pilih semua kategori produk"));
    expect(tercentang(wadah, "kategoriProduk")).toEqual(KATEGORI);
    expect(tercentang(wadah, "toko")).toEqual(["13"]);
    expect(tercentang(wadah, "bulan")).toEqual(["2026-06"]);

    klik(tombol(wadah, "Kosongkan pilihan kategori produk"));
    expect(tercentang(wadah, "kategoriProduk")).toEqual([]);
    expect(tercentang(wadah, "toko")).toEqual(["13"]);
    expect(tercentang(wadah, "bulan")).toEqual(["2026-06"]);
  });

  it("tombol bertipe button: URL dan hasil belum berubah sebelum Terapkan", () => {
    const wadah = buka();
    for (const label of ["Pilih semua toko", "Kosongkan pilihan toko", "Pilih semua kategori produk", "Kosongkan pilihan kategori produk"]) {
      expect(tombol(wadah, label).type).toBe("button");
      klik(tombol(wadah, label));
    }
    klik(tombol(wadah, "Pilih semua toko"));
    expect(tiruan.navigasi).not.toHaveBeenCalled();
  });

  it("setelah Terapkan, parameter toko dan kategori produk terkirim sesuai pilihan tombol", () => {
    const wadah = buka({ toko: ["12"], kategoriProduk: ["30ML"] });
    klik(tombol(wadah, "Pilih semua toko"));
    klik(tombol(wadah, "Kosongkan pilihan kategori produk"));
    expect(tiruan.navigasi).not.toHaveBeenCalled();

    terapkan(wadah);
    expect(tiruan.navigasi).toHaveBeenCalledTimes(1);
    const url = urlTerakhir();
    expect(url.pathname).toBe("/ringkasan");
    expect(url.searchParams.getAll("bulan")).toEqual(["2026-06"]);
    expect(url.searchParams.getAll("toko")).toEqual(["11", "12", "13"]);
    expect(url.searchParams.getAll("kategoriProduk")).toEqual([]);

    // Kosongkan toko lalu Terapkan → tanpa parameter toko (semua toko, seperti tanpa centang).
    klik(tombol(wadah, "Kosongkan pilihan toko"));
    klik(tombol(wadah, "Pilih semua kategori produk"));
    terapkan(wadah);
    expect(urlTerakhir().searchParams.getAll("toko")).toEqual([]);
    expect(urlTerakhir().searchParams.getAll("kategoriProduk")).toEqual(KATEGORI);
  });

  it("centang manual setelah Pilih semua tetap berlaku", () => {
    const wadah = buka();
    klik(tombol(wadah, "Pilih semua toko"));
    const gor = wadah.querySelector<HTMLInputElement>('input[name="toko"][value="12"]');
    if (gor === null) throw new Error("Chip GOR tidak ada.");
    klik(gor);
    expect(tercentang(wadah, "toko")).toEqual(["11", "13"]);
  });
});
