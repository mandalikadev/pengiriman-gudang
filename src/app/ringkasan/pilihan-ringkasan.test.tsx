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

/** Buka dengan opsi produk dan pilihan terapan lengkap. */
function bukaLengkap(terapan: { toko?: string[]; kategoriProduk?: string[]; produk?: string[] } = {}) {
  const wadah = document.createElement("div");
  document.body.append(wadah);
  const akar = createRoot(wadah);
  act(() =>
    akar.render(
      <PilihanRingkasan
        bulanTersedia={[{ kode: "2026-06", label: "Juni 2026" }]}
        opsiFilter={{ toko: TOKO, kategoriProduk: KATEGORI, produk: [{ kode: "15GL-GOR", nama: "15ML GLITTER - GORGEOUS" }, { kode: "30-MRF", nama: null }] }}
        terapan={{ bulan: ["2026-06"], toko: terapan.toko ?? [], kategoriProduk: terapan.kategoriProduk ?? [], produk: terapan.produk ?? [] }}
      />,
    ),
  );
  terpasang = { wadah, akar };
  return wadah;
}

const kelasDari = (elemen: Element | null) => (elemen?.getAttribute("class") ?? "").split(/\s+/);

describe("PilihanRingkasan: cincin fokus chip (T122, DESIGN §11.8, WCAG 2.4.7)", () => {
  it("chip produk (hasil cari dan terpilih) menampilkan cincin fokus saat checkbox-nya difokus keyboard", () => {
    const wadah = bukaLengkap({ produk: ["30-MRF"] });
    const cari = wadah.querySelector<HTMLInputElement>('input[type="search"]');
    if (cari === null) throw new Error("Kotak cari produk tidak ada.");
    act(() => {
      const setel = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setel?.call(cari, "gor");
      cari.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const hasil = wadah.querySelector('[aria-label="Hasil pencarian produk"] input[value="15GL-GOR"]');
    const terpilih = wadah.querySelector('[aria-label="Produk terpilih"] input[value="30-MRF"]');
    for (const isian of [hasil, terpilih]) {
      const label = isian?.closest("label") ?? null;
      expect(label).not.toBeNull();
      expect(kelasDari(label)).toEqual(
        expect.arrayContaining(["has-[:focus-visible]:ring-2", "has-[:focus-visible]:ring-ring", "has-[:focus-visible]:ring-offset-2"]),
      );
    }
  });

  it("chip bulan, toko, dan kategori: terpilih bg-accent text-accent-foreground, dengan cincin fokus", () => {
    const wadah = bukaLengkap();
    for (const nama of ["bulan", "toko", "kategoriProduk"]) {
      const label = wadah.querySelector(`input[name="${nama}"]`)?.closest("label") ?? null;
      expect(kelasDari(label)).toEqual(
        expect.arrayContaining(["has-[:checked]:bg-accent", "has-[:checked]:text-accent-foreground", "has-[:focus-visible]:ring-2", "has-[:focus-visible]:ring-ring"]),
      );
    }
  });
});

describe("PilihanRingkasan: tombol Filter (n) di layar < 640 px (T122, DESIGN §11.8)", () => {
  const tombolFilter = (wadah: HTMLElement) => {
    const elemen = [...wadah.querySelectorAll("button")].find((b) => b.textContent?.startsWith("Filter ("));
    if (elemen === undefined) throw new Error('Tombol "Filter (n)" tidak ada.');
    return elemen;
  };
  const dialog = (wadah: HTMLElement) => wadah.querySelector<HTMLElement>('[role="dialog"]');

  it("n = jumlah pilihan filter toko, kategori produk, dan produk yang diterapkan; tombol hanya di layar < 640 px, kartu di layar lebar", () => {
    expect(tombolFilter(bukaLengkap()).textContent).toBe("Filter (0)");
    act(() => terpasang?.akar.unmount());
    terpasang?.wadah.remove();
    terpasang = null;

    const wadah = bukaLengkap({ toko: ["11", "12"], kategoriProduk: ["30ML"], produk: ["15GL-GOR"] });
    const tombolEl = tombolFilter(wadah);
    expect(tombolEl.textContent).toBe("Filter (4)");
    expect(kelasDari(tombolEl.closest("[data-tombol-filter-ponsel]"))).toContain("sm:hidden");
    expect(kelasDari(wadah.querySelector("[data-kartu-pilihan-ringkasan]"))).toContain("max-sm:hidden");
    expect(dialog(wadah)).toBeNull();
  });

  it("tombol membuka panel berisi form yang sama; pilihan di panel diterapkan lewat Terapkan", () => {
    const wadah = bukaLengkap({ toko: ["12"] });
    klik(tombolFilter(wadah));
    const panel = dialog(wadah);
    expect(panel).not.toBeNull();
    expect(panel?.getAttribute("data-bentuk")).toBe("samping");
    expect(panel?.querySelector("h2")?.textContent).toBe("Filter Ringkasan");
    // Judul form di panel melanjutkan judul panel (h2 → h3).
    expect(panel?.querySelector("h3")?.textContent).toBe("Bulan laporan");

    const pilihSemua = panel?.querySelector<HTMLButtonElement>('button[aria-label="Pilih semua toko"]');
    if (!pilihSemua) throw new Error("Tombol Pilih semua toko tidak ada di panel.");
    klik(pilihSemua);
    const terapkanPanel = [...(panel?.querySelectorAll("button") ?? [])].find((b) => b.textContent === "Terapkan");
    if (terapkanPanel === undefined) throw new Error("Tombol Terapkan tidak ada di panel.");
    klik(terapkanPanel);
    expect(tiruan.navigasi).toHaveBeenCalledTimes(1);
    expect(urlTerakhir().searchParams.getAll("toko")).toEqual(["11", "12", "13"]);
  });

  it("pilihan di panel tetap ada setelah panel ditutup (kartu dan panel memakai pilihan yang sama)", () => {
    const wadah = bukaLengkap();
    klik(tombolFilter(wadah));
    const gor = dialog(wadah)?.querySelector<HTMLInputElement>('input[name="toko"][value="12"]');
    if (!gor) throw new Error("Chip GOR tidak ada di panel.");
    klik(gor);
    const tutup = [...(dialog(wadah)?.querySelectorAll("button") ?? [])].find((b) => b.textContent?.trim() === "Tutup");
    if (tutup === undefined) throw new Error("Tombol Tutup tidak ada.");
    klik(tutup);
    expect(dialog(wadah)).toBeNull();
    expect(tercentang(wadah, "toko")).toEqual(["12"]);
  });
});
