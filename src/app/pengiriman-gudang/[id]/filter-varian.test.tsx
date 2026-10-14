// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tiruan = vi.hoisted(() => ({ simpanStok: vi.fn(), unggahStok: vi.fn(), segarkan: vi.fn() }));
vi.mock("./aksi-stok", () => ({ simpanStok: tiruan.simpanStok, unggahStok: tiruan.unggahStok }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: tiruan.segarkan, push: () => {} }) }));

import { Table, TableBody, TableCell } from "@/components/ui/table";

import { BarisFilterKosong, BarisVarian, FilterVarian, KontrolFilterVarian, TautanTampilkanTertahan, type BarisFilter } from "./filter-varian";
import { FormStokToko, InputStok } from "./form-stok-toko";

// T117 (DESIGN §11.4): filter tampilan tabel varian satu toko. Semua · Tertahan · Stok kosong · Jumlah kirim > 0 dengan
// jumlahnya, ditambah cari kode atau nama produk. Filter hanya menyembunyikan baris: isian di baris tersembunyi tetap
// ikut tersimpan. "Tampilkan baris tertahan" memasang filter Tertahan.

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const BARIS: (BarisFilter & { stokAkhir: number | null })[] = [
  { kodeProduk: "PW110P-GOR", namaProduk: "GORGEOUS TUBEROSE - 110ML M PARFUM INTENSE", tertahan: true, stokKosong: true, kirimPositif: false, stokAkhir: null },
  { kodeProduk: "A10M-GOR", namaProduk: "GORGEOUS TUBEROSE - 10ML ATOMIZER", tertahan: false, stokKosong: false, kirimPositif: true, stokAkhir: 3 },
  { kodeProduk: "A10M-SAN", namaProduk: "SANTAL - 10ML ATOMIZER", tertahan: true, stokKosong: false, kirimPositif: false, stokAkhir: -2 },
  { kodeProduk: "A10M-NO1", namaProduk: "NO1 GORGEOUS EDITION", tertahan: false, stokKosong: false, kirimPositif: true, stokAkhir: 8 },
  { kodeProduk: "A10M-HOL", namaProduk: null, tertahan: false, stokKosong: false, kirimPositif: false, stokAkhir: 50 },
];

let terpasang: { wadah: HTMLElement; akar: Root } | null = null;

function buka() {
  const wadah = document.createElement("div");
  document.body.append(wadah);
  const akar = createRoot(wadah);
  act(() =>
    akar.render(
      <FilterVarian
        baris={BARIS.map((b) => ({
          kodeProduk: b.kodeProduk,
          namaProduk: b.namaProduk,
          tertahan: b.tertahan,
          stokKosong: b.stokKosong,
          kirimPositif: b.kirimPositif,
        }))}
      >
        <TautanTampilkanTertahan idTabel="tabel-uji" />
        <FormStokToko
          idGudang={3}
          tanggalKirim="2026-06-08"
          tokoId={7}
          namaToko="TOKO UJI"
          stokTersimpan={BARIS.map((b) => ({ kodeProduk: b.kodeProduk, stokAkhir: b.stokAkhir, klasifikasi: "otomatis" }))}
        >
          <KontrolFilterVarian namaToko="TOKO UJI" />
          <Table id="tabel-uji">
            <TableBody>
              {BARIS.map((b) => (
                <BarisVarian key={b.kodeProduk} kodeProduk={b.kodeProduk}>
                  <TableCell>{b.kodeProduk}</TableCell>
                  <TableCell>
                    <InputStok kodeProduk={b.kodeProduk} />
                  </TableCell>
                </BarisVarian>
              ))}
              <BarisFilterKosong jumlahKolom={2} />
            </TableBody>
          </Table>
        </FormStokToko>
      </FilterVarian>,
    ),
  );
  terpasang = { wadah, akar };
  return wadah;
}

afterEach(() => {
  if (terpasang === null) return;
  const { wadah, akar } = terpasang;
  act(() => akar.unmount());
  wadah.remove();
  terpasang = null;
});

beforeEach(() => {
  window.localStorage.clear();
  tiruan.simpanStok.mockReset();
  tiruan.segarkan.mockReset();
});

const tombolFilter = (wadah: HTMLElement, nilai: string) => {
  const tombol = wadah.querySelector<HTMLButtonElement>(`button[data-filter-varian="${nilai}"]`);
  if (tombol === null) throw new Error(`Filter ${nilai} tidak ada.`);
  return tombol;
};

const barisTampil = (wadah: HTMLElement) =>
  [...wadah.querySelectorAll<HTMLTableRowElement>("tr[data-kode-produk]")].filter((tr) => !tr.hidden).map((tr) => tr.dataset.kodeProduk);

const cari = (wadah: HTMLElement) => {
  const isian = wadah.querySelector<HTMLInputElement>('input[type="search"]');
  if (isian === null) throw new Error("Isian cari tidak ada.");
  return isian;
};

function ketik(elemen: HTMLInputElement, nilai: string) {
  const setel = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  act(() => {
    setel?.call(elemen, nilai);
    elemen.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("filter tampilan tabel varian", () => {
  it("setiap filter menampilkan jumlahnya; awalnya Semua dengan seluruh baris", () => {
    const wadah = buka();
    const label = [...wadah.querySelectorAll("button[data-filter-varian]")].map((b) => [
      b.textContent,
      b.getAttribute("aria-pressed"),
    ]);
    expect(label).toEqual([
      ["Semua(5)", "true"],
      ["Tertahan(2)", "false"],
      ["Stok kosong(1)", "false"],
      ["Jumlah kirim > 0(2)", "false"],
    ]);
    expect(barisTampil(wadah)).toEqual(BARIS.map((b) => b.kodeProduk));
  });

  it("Tertahan menampilkan tepat baris yang punya masalah; Stok kosong dan Jumlah kirim > 0 menyaring sesuai namanya", () => {
    const wadah = buka();
    act(() => tombolFilter(wadah, "tertahan").click());
    expect(tombolFilter(wadah, "tertahan").getAttribute("aria-pressed")).toBe("true");
    expect(tombolFilter(wadah, "semua").getAttribute("aria-pressed")).toBe("false");
    expect(barisTampil(wadah)).toEqual(["PW110P-GOR", "A10M-SAN"]);

    act(() => tombolFilter(wadah, "stokKosong").click());
    expect(barisTampil(wadah)).toEqual(["PW110P-GOR"]);

    act(() => tombolFilter(wadah, "kirimPositif").click());
    expect(barisTampil(wadah)).toEqual(["A10M-GOR", "A10M-NO1"]);

    act(() => tombolFilter(wadah, "semua").click());
    expect(barisTampil(wadah)).toHaveLength(BARIS.length);
  });

  it('cari "GOR" menyaring berdasarkan kode atau nama produk, tanpa membedakan huruf besar, bersama filter yang dipilih', () => {
    const wadah = buka();
    ketik(cari(wadah), "gor");
    // A10M-NO1 cocok lewat namanya; A10M-SAN dan A10M-HOL (tanpa nama) tidak cocok.
    expect(barisTampil(wadah)).toEqual(["PW110P-GOR", "A10M-GOR", "A10M-NO1"]);
    act(() => tombolFilter(wadah, "tertahan").click());
    expect(barisTampil(wadah)).toEqual(["PW110P-GOR"]);
    // Jumlah per filter tetap jumlah seluruh toko.
    expect(tombolFilter(wadah, "semua").textContent).toBe("Semua(5)");
  });

  it("tidak ada baris yang cocok: keadaan kosong dengan ikon + teks dan langkah berikutnya", () => {
    const wadah = buka();
    expect(wadah.querySelector("[data-filter-kosong]")).toBeNull();
    ketik(cari(wadah), "tidak-ada");
    expect(barisTampil(wadah)).toEqual([]);
    const kosong = wadah.querySelector("[data-filter-kosong]");
    expect(kosong?.querySelector("svg.lucide-search-x")).not.toBeNull();
    expect(kosong?.textContent).toBe("Tidak ada baris yang cocok. Pilih filter Semua atau ubah kata pencarian.");
  });

  it("Enter di isian cari tidak mengirim form stok", async () => {
    const wadah = buka();
    const isian = cari(wadah);
    const tekan = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    await act(async () => {
      isian.dispatchEvent(tekan);
    });
    expect(tekan.defaultPrevented).toBe(true);
    expect(tiruan.simpanStok).not.toHaveBeenCalled();
  });

  it("isian di baris yang tersembunyi oleh filter tetap ikut tersimpan saat Simpan stok", async () => {
    tiruan.simpanStok.mockResolvedValue({ keadaan: "berhasil" });
    const wadah = buka();
    const isianHol = wadah.querySelector<HTMLInputElement>('input[aria-label="Stok akhir A10M-HOL"]')!;
    ketik(isianHol, "12");
    ketik(wadah.querySelector<HTMLInputElement>('input[aria-label="Stok akhir PW110P-GOR"]')!, "4");
    act(() => tombolFilter(wadah, "tertahan").click());
    expect(barisTampil(wadah)).not.toContain("A10M-HOL");

    await act(async () => {
      wadah.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
    });
    expect(tiruan.simpanStok).toHaveBeenCalledWith({
      idGudang: 3,
      tanggalKirim: "2026-06-08",
      tokoId: 7,
      stok: [
        { kodeProduk: "PW110P-GOR", stokAkhir: 4 },
        { kodeProduk: "A10M-HOL", stokAkhir: 12 },
      ],
    });
  });

  it('"Tampilkan baris tertahan" memasang filter Tertahan dan mengosongkan pencarian', () => {
    const wadah = buka();
    ketik(cari(wadah), "NO1");
    const tautan = wadah.querySelector<HTMLButtonElement>("[data-tampilkan-tertahan]");
    expect(tautan?.textContent).toBe("Tampilkan baris tertahan");
    act(() => tautan?.click());
    expect(tombolFilter(wadah, "tertahan").getAttribute("aria-pressed")).toBe("true");
    expect(cari(wadah).value).toBe("");
    expect(barisTampil(wadah)).toEqual(["PW110P-GOR", "A10M-SAN"]);
  });
});
