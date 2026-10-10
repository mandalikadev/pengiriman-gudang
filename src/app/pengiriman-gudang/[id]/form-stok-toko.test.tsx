// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tiruan = vi.hoisted(() => ({ simpanStok: vi.fn(), segarkan: vi.fn() }));
vi.mock("./aksi-stok", () => ({ simpanStok: tiruan.simpanStok }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: tiruan.segarkan, push: () => {} }) }));

import { pesanBelumPasti } from "@/components/keadaan-simpan";

import { FormStokToko, InputStok } from "./form-stok-toko";
import { kunciIsianLokal } from "./isian-lokal";

// T59: perlindungan draft. Isian stok yang belum disimpan dipulihkan setelah muat ulang (atau gangguan akses) sampai
// berhasil disimpan; meninggalkan halaman dengan isian yang belum disimpan memunculkan peringatan.

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const KUNCI = kunciIsianLokal(3, "2026-06-08", 7);
const STOK_TERSIMPAN = [
  { kodeProduk: "UJI-A", stokAkhir: null },
  { kodeProduk: "UJI-B", stokAkhir: 5 },
];

let terpasang: { wadah: HTMLElement; akar: Root } | null = null;

function tampilkan(akar: Root, stokTersimpan: typeof STOK_TERSIMPAN) {
  act(() =>
    akar.render(
      <FormStokToko idGudang={3} tanggalKirim="2026-06-08" tokoId={7} namaToko="TOKO UJI" stokTersimpan={stokTersimpan}>
        {stokTersimpan.map((s) => (
          <InputStok key={s.kodeProduk} kodeProduk={s.kodeProduk} />
        ))}
      </FormStokToko>,
    ),
  );
}

/** Memasang form seperti saat halaman dibuka (atau dibuka lagi setelah muat ulang). */
function buka(stokTersimpan = STOK_TERSIMPAN) {
  tutup();
  const wadah = document.createElement("div");
  document.body.append(wadah);
  const akar = createRoot(wadah);
  tampilkan(akar, stokTersimpan);
  terpasang = { wadah, akar };
  return wadah;
}

/** Data server baru tiba (mis. setelah `router.refresh()`) tanpa memasang ulang form. */
function terimaDataServer(stokTersimpan: typeof STOK_TERSIMPAN) {
  if (terpasang === null) throw new Error("Form belum dipasang.");
  tampilkan(terpasang.akar, stokTersimpan);
}

/** Muat ulang: tampilan lama dibongkar seluruhnya; yang tersisa hanya penyimpanan peramban. */
function tutup() {
  if (terpasang === null) return;
  const { wadah, akar } = terpasang;
  act(() => akar.unmount());
  wadah.remove();
  terpasang = null;
}

const isian = (wadah: HTMLElement, kode: string) => {
  const elemen = wadah.querySelector<HTMLInputElement>(`input[aria-label="Stok akhir ${kode}"]`);
  if (elemen === null) throw new Error(`Isian stok ${kode} tidak ada.`);
  return elemen;
};

function ketik(elemen: HTMLInputElement, nilai: string) {
  const setel = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  act(() => {
    setel?.call(elemen, nilai);
    elemen.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function kirim(wadah: HTMLElement) {
  const tombol = wadah.querySelector<HTMLButtonElement>('button[type="submit"]');
  await act(async () => {
    tombol?.click();
  });
}

const status = (wadah: HTMLElement) => wadah.querySelector("[data-keadaan]");

beforeEach(() => {
  window.localStorage.clear();
  tiruan.simpanStok.mockReset();
  tiruan.segarkan.mockReset();
});

afterEach(() => {
  tutup();
});

describe("perlindungan draft input stok", () => {
  it("isian yang belum disimpan dipulihkan setelah muat ulang", () => {
    const wadah = buka();
    expect(isian(wadah, "UJI-A").value).toBe("");
    expect(isian(wadah, "UJI-B").value).toBe("5");
    expect(status(wadah)).toBeNull();

    ketik(isian(wadah, "UJI-A"), "12");
    ketik(isian(wadah, "UJI-B"), "");
    expect(status(wadah)?.getAttribute("data-keadaan")).toBe("belumDisimpan");

    const setelahMuatUlang = buka();
    expect(isian(setelahMuatUlang, "UJI-A").value).toBe("12");
    // Dikosongkan = belum diketahui, tampil "—" dengan status belum diketahui.
    expect(isian(setelahMuatUlang, "UJI-B").value).toBe("");
    expect(isian(setelahMuatUlang, "UJI-B").placeholder).toBe("—");
    expect(isian(setelahMuatUlang, "UJI-B").parentElement?.querySelector('[data-status="belumDiketahui"]')?.textContent).toBe("Belum diketahui");
    expect(status(setelahMuatUlang)?.textContent).toBe("Ada perubahan yang belum disimpan");
    expect(setelahMuatUlang.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(false);
  });

  it("isian lokal untuk varian yang tidak ada lagi di draft diabaikan", () => {
    window.localStorage.setItem(KUNCI, JSON.stringify({ "UJI-A": "4", "UJI-LAMA": "9" }));
    const wadah = buka();
    expect(isian(wadah, "UJI-A").value).toBe("4");
    expect(wadah.querySelector('input[aria-label="Stok akhir UJI-LAMA"]')).toBeNull();
  });

  it("berhasil disimpan: hanya varian yang berubah dikirim, isian lokal dihapus, halaman dimuat ulang", async () => {
    tiruan.simpanStok.mockResolvedValue({ keadaan: "berhasil" });
    const wadah = buka();
    ketik(isian(wadah, "UJI-A"), "0");
    ketik(isian(wadah, "UJI-B"), "-3");

    await kirim(wadah);
    expect(tiruan.simpanStok).toHaveBeenCalledTimes(1);
    expect(tiruan.simpanStok).toHaveBeenCalledWith({
      idGudang: 3,
      tanggalKirim: "2026-06-08",
      tokoId: 7,
      stok: [
        { kodeProduk: "UJI-A", stokAkhir: 0 },
        { kodeProduk: "UJI-B", stokAkhir: -3 },
      ],
    });
    expect(status(wadah)?.getAttribute("data-keadaan")).toBe("berhasil");
    expect(isian(wadah, "UJI-A").value).toBe("0");
    expect(window.localStorage.getItem(KUNCI)).toBeNull();
    expect(tiruan.segarkan).toHaveBeenCalledTimes(1);

    // Dibuka lagi tanpa isian lokal: nilai dari server yang tampil.
    const setelahMuatUlang = buka([
      { kodeProduk: "UJI-A", stokAkhir: 0 },
      { kodeProduk: "UJI-B", stokAkhir: -3 },
    ]);
    expect(isian(setelahMuatUlang, "UJI-A").value).toBe("0");
    expect(status(setelahMuatUlang)).toBeNull();
  });

  it("setelah data server baru tiba, nilai dari server yang tampil walaupun berbeda dari yang baru disimpan", async () => {
    tiruan.simpanStok.mockResolvedValue({ keadaan: "berhasil" });
    const wadah = buka();
    ketik(isian(wadah, "UJI-A"), "8");
    await kirim(wadah);
    // Sebelum data server baru tiba: nilai yang baru disimpan tetap tampil, bukan nilai lama.
    expect(isian(wadah, "UJI-A").value).toBe("8");
    expect(wadah.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);

    // Operator lain sudah mengubah stok yang sama: data server yang dimuat ulang memuat nilai terbarunya.
    terimaDataServer([
      { kodeProduk: "UJI-A", stokAkhir: 11 },
      { kodeProduk: "UJI-B", stokAkhir: 5 },
    ]);
    expect(isian(wadah, "UJI-A").value).toBe("11");
    expect(isian(wadah, "UJI-B").value).toBe("5");
    expect(wadah.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);
  });

  it("stok kosong dikirim sebagai belum diketahui (null), bukan 0", async () => {
    tiruan.simpanStok.mockResolvedValue({ keadaan: "berhasil" });
    const wadah = buka();
    ketik(isian(wadah, "UJI-B"), "  ");
    await kirim(wadah);
    expect(tiruan.simpanStok).toHaveBeenCalledWith(expect.objectContaining({ stok: [{ kodeProduk: "UJI-B", stokAkhir: null }] }));
  });

  it("tersimpan tetapi gagal memuat ulang: keadaan kelima tampil dan isian lokal dihapus", async () => {
    tiruan.simpanStok.mockResolvedValue({ keadaan: "tersimpanGagalMuatUlang" });
    const wadah = buka();
    ketik(isian(wadah, "UJI-A"), "8");
    await kirim(wadah);
    expect(status(wadah)?.textContent).toBe("Perubahan tersimpan. Muat ulang halaman untuk melihatnya.");
    expect(window.localStorage.getItem(KUNCI)).toBeNull();
  });

  it("gangguan akses (hasil belum pasti): tidak diulang otomatis dan isian dipulihkan setelah muat ulang", async () => {
    tiruan.simpanStok.mockRejectedValue(new TypeError("Failed to fetch"));
    const wadah = buka();
    ketik(isian(wadah, "UJI-A"), "15");
    await kirim(wadah);

    expect(tiruan.simpanStok).toHaveBeenCalledTimes(1);
    expect(status(wadah)?.getAttribute("data-keadaan")).toBe("gagal");
    expect(status(wadah)?.textContent).toContain(pesanBelumPasti("stok toko ini"));
    expect(isian(buka(), "UJI-A").value).toBe("15");
    expect(tiruan.simpanStok).toHaveBeenCalledTimes(1);
  });

  it("isian yang bukan bilangan bulat ditandai dan tidak dikirim", async () => {
    const wadah = buka();
    ketik(isian(wadah, "UJI-A"), "1,5");
    expect(isian(wadah, "UJI-A").getAttribute("aria-invalid")).toBe("true");
    expect(wadah.textContent).toContain("Isi bilangan bulat, atau kosongkan jika belum diketahui.");

    await kirim(wadah);
    expect(tiruan.simpanStok).not.toHaveBeenCalled();
    expect(status(wadah)?.textContent).toContain("Perbaiki isian stok yang ditandai.");
  });

  it("meninggalkan halaman dengan isian yang belum disimpan memunculkan peringatan", () => {
    const tinggalkan = () => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    const wadah = buka();
    expect(tinggalkan()).toBe(false);

    ketik(isian(wadah, "UJI-A"), "3");
    expect(tinggalkan()).toBe(true);

    // Tautan di dalam aplikasi: konfirmasi; dibatalkan → tetap di halaman.
    const konfirmasi = vi.spyOn(window, "confirm").mockReturnValue(false);
    const tautan = document.createElement("a");
    tautan.href = "/pengiriman-gudang";
    document.body.append(tautan);
    const klik = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
    tautan.dispatchEvent(klik);
    expect(konfirmasi).toHaveBeenCalledWith("Ada perubahan stok yang belum disimpan. Tinggalkan halaman ini?");
    expect(klik.defaultPrevented).toBe(true);
    tautan.remove();
    konfirmasi.mockRestore();

    // Isian dikembalikan ke nilai tersimpan: tidak ada lagi yang belum disimpan.
    ketik(isian(wadah, "UJI-A"), "");
    expect(tinggalkan()).toBe(false);
    expect(status(wadah)).toBeNull();
  });
});
