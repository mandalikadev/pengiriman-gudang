// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tiruan = vi.hoisted(() => ({ simpanStok: vi.fn(), unggahStok: vi.fn(), segarkan: vi.fn() }));
vi.mock("./aksi-stok", () => ({ simpanStok: tiruan.simpanStok, unggahStok: tiruan.unggahStok }));
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
/** Stok tersimpan per varian; tanpa `klasifikasi` = produk otomatis. */
type StokUji = { kodeProduk: string; stokAkhir: number | null; klasifikasi?: "manual" | "otomatis" };
const STOK_TERSIMPAN: StokUji[] = [
  { kodeProduk: "UJI-A", stokAkhir: null },
  { kodeProduk: "UJI-B", stokAkhir: 5 },
];

let terpasang: { wadah: HTMLElement; akar: Root } | null = null;

function tampilkan(akar: Root, stokTersimpan: readonly StokUji[]) {
  act(() =>
    akar.render(
      <FormStokToko
        idGudang={3}
        tanggalKirim="2026-06-08"
        tokoId={7}
        namaToko="TOKO UJI"
        stokTersimpan={stokTersimpan.map((s) => ({ ...s, klasifikasi: s.klasifikasi ?? "otomatis" }))}
      >
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
function terimaDataServer(stokTersimpan: readonly StokUji[]) {
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

/** Status simpan form stok (di baris tombol Simpan stok), bukan status unggah file. */
const status = (wadah: HTMLElement) => wadah.querySelector('button[type="submit"]')?.parentElement?.querySelector("[data-keadaan]") ?? null;

beforeEach(() => {
  window.localStorage.clear();
  tiruan.simpanStok.mockReset();
  tiruan.unggahStok.mockReset();
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
    expect(isian(setelahMuatUlang, "UJI-B").parentElement?.querySelector("[data-stok-kosong]")?.textContent).toBe("Belum diketahui");
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

  it("membuka rincian di panel samping (T108): tautan pembuka panel tidak memunculkan peringatan", () => {
    const alamatAwal = window.location.href;
    window.history.replaceState(null, "", "/pengiriman-gudang/3?tanggal=2026-06-08&toko=7");
    const tautan = document.createElement("a");
    tautan.href = "/pengiriman-gudang/3?tanggal=2026-06-08&toko=7&rincian=7%7CUJI-A";
    tautan.setAttribute("data-buka-panel", "");
    document.body.append(tautan);
    const konfirmasi = vi.spyOn(window, "confirm").mockReturnValue(false);
    try {
      const wadah = buka();
      ketik(isian(wadah, "UJI-A"), "3");
      let dicegahPerlindungan: boolean | null = null;
      const catat = (event: Event) => {
        dicegahPerlindungan = event.defaultPrevented;
        event.preventDefault();
      };
      document.addEventListener("click", catat, true);
      tautan.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
      document.removeEventListener("click", catat, true);
      expect(konfirmasi).not.toHaveBeenCalled();
      expect(dicegahPerlindungan).toBe(false);
      expect(isian(wadah, "UJI-A").value).toBe("3");
    } finally {
      konfirmasi.mockRestore();
      tautan.remove();
      window.history.replaceState(null, "", alamatAwal);
    }
  });

  it("berpindah toko (T73): tautan ke toko lain di halaman yang sama meminta konfirmasi; isian toko ini dipulihkan saat dibuka lagi", () => {
    const alamatAwal = window.location.href;
    window.history.replaceState(null, "", "/pengiriman-gudang/3?tanggal=2026-06-08&toko=7");
    const tautan = document.createElement("a");
    tautan.href = "/pengiriman-gudang/3?tanggal=2026-06-08&toko=8#draft-toko-8";
    document.body.append(tautan);
    const konfirmasi = vi.spyOn(window, "confirm").mockReturnValue(true);
    try {
      const wadah = buka();
      ketik(isian(wadah, "UJI-A"), "3");

      // Dicatat setelah perlindungan draft memutuskan; navigasi jsdom sendiri lalu dicegah (jsdom tidak berpindah dokumen).
      let dicegahPerlindungan: boolean | null = null;
      const catat = (event: Event) => {
        dicegahPerlindungan = event.defaultPrevented;
        event.preventDefault();
      };
      document.addEventListener("click", catat, true);
      tautan.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
      document.removeEventListener("click", catat, true);
      expect(konfirmasi).toHaveBeenCalledWith("Ada perubahan stok yang belum disimpan. Tinggalkan halaman ini?");
      expect(dicegahPerlindungan).toBe(false);

      // Toko lain dibuka (form toko ini dibongkar), lalu toko ini dibuka lagi: isian yang belum disimpan kembali.
      tutup();
      const dibukaLagi = buka();
      expect(isian(dibukaLagi, "UJI-A").value).toBe("3");
      expect(status(dibukaLagi)?.textContent).toBe("Ada perubahan yang belum disimpan");
    } finally {
      konfirmasi.mockRestore();
      tautan.remove();
      window.history.replaceState(null, "", alamatAwal);
    }
  });
});

// T83: unggah file stok. Hasil terisi diterapkan ke isian lokal lewat jalur yang sama dengan mengetik (belum disimpan,
// perlindungan draft); varian tanpa baris di file tidak berubah; ringkasan hasil tampil dekat form dan hilang saat
// halaman dimuat ulang.
describe("unggah file stok", () => {
  const HASIL_CONTOH = {
    keadaan: "berhasil",
    terisi: [{ kodeProduk: "UJI-A", stokAkhir: 20 }],
    tidakDikenal: ["BACCARAT ELIXIR - 2ML EDP"],
    jumlahDiabaikan: 1,
    tidakValid: [{ nomor: 6, nama: "HOLY SWEET - 2ML EDP", alasan: 'Ending "abc" bukan bilangan bulat.' }],
  };
  const FILE = new File(["Name - Variant;Category;Ending\n"], "ENDING STOK.csv", { type: "text/csv" });

  const isianFile = (wadah: HTMLElement) => {
    const elemen = wadah.querySelector<HTMLInputElement>('input[type="file"][aria-label="Unggah file stok"]');
    if (elemen === null) throw new Error("Isian file tidak ada.");
    return elemen;
  };
  const tombolBaca = (wadah: HTMLElement) => {
    const tombol = [...wadah.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === "Baca file");
    if (tombol === undefined) throw new Error("Tombol Baca file tidak ada.");
    return tombol;
  };
  function pilihFile(wadah: HTMLElement, file: File) {
    const elemen = isianFile(wadah);
    Object.defineProperty(elemen, "files", { value: [file], configurable: true });
    act(() => {
      elemen.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }
  async function bacaFile(wadah: HTMLElement) {
    await act(async () => {
      tombolBaca(wadah).click();
    });
  }
  const ringkasan = (wadah: HTMLElement) => wadah.querySelector('[aria-label="Hasil unggahan file stok"]');

  it("isian file dan tombol Baca file ada; tombol nonaktif sebelum file dipilih", () => {
    const wadah = buka();
    expect(isianFile(wadah).accept).toBe(".csv,.xlsx");
    expect(tombolBaca(wadah).type).toBe("button");
    expect(tombolBaca(wadah).disabled).toBe(true);
    pilihFile(wadah, FILE);
    expect(tombolBaca(wadah).disabled).toBe(false);
    expect(ringkasan(wadah)).toBeNull();
    expect(tiruan.unggahStok).not.toHaveBeenCalled();
  });

  it("hasil terisi mengisi isian sebagai belum disimpan; varian tanpa baris tidak berubah; ringkasan tampil lalu hilang saat muat ulang", async () => {
    tiruan.unggahStok.mockResolvedValue(HASIL_CONTOH);
    const wadah = buka();
    pilihFile(wadah, FILE);
    await bacaFile(wadah);

    expect(tiruan.unggahStok).toHaveBeenCalledTimes(1);
    const form = tiruan.unggahStok.mock.calls[0][0] as FormData;
    expect(form.get("idGudang")).toBe("3");
    expect(form.get("tanggalKirim")).toBe("2026-06-08");
    expect(form.get("tokoId")).toBe("7");
    expect((form.get("file") as File).name).toBe("ENDING STOK.csv");

    expect(isian(wadah, "UJI-A").value).toBe("20");
    expect(isian(wadah, "UJI-B").value).toBe("5");
    expect(status(wadah)?.textContent).toBe("Ada perubahan yang belum disimpan");
    expect(wadah.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(false);
    expect(tiruan.simpanStok).not.toHaveBeenCalled();

    const teks = ringkasan(wadah)?.textContent ?? "";
    expect(teks).toContain("1 varian terisi dari file");
    expect(teks).toContain("1 nama tidak dikenal");
    expect(teks).toContain("BACCARAT ELIXIR - 2ML EDP");
    expect(teks).toContain("Admin memetakan nama ini di Alias nama stok.");
    expect(teks).toContain("1 baris diabaikan (bukan varian toko ini)");
    expect(teks).toContain("1 baris nilai tidak valid");
    expect(teks).toContain("Baris 6");
    expect(teks).toContain("HOLY SWEET - 2ML EDP");
    expect(teks).toContain('Ending "abc" bukan bilangan bulat.');
    // Status selalu ikon + teks (DESIGN §7).
    expect(ringkasan(wadah)?.querySelectorAll("svg").length).toBe(4);

    // Muat ulang: isian yang belum disimpan dipulihkan (perlindungan draft), ringkasan tidak.
    const setelahMuatUlang = buka();
    expect(isian(setelahMuatUlang, "UJI-A").value).toBe("20");
    expect(status(setelahMuatUlang)?.textContent).toBe("Ada perubahan yang belum disimpan");
    expect(ringkasan(setelahMuatUlang)).toBeNull();
  });

  it("stok kosong di file mengosongkan isian (belum diketahui); hasil tanpa varian tak dikenal/diabaikan/tidak valid hanya menampilkan jumlah terisi", async () => {
    tiruan.unggahStok.mockResolvedValue({
      keadaan: "berhasil",
      terisi: [
        { kodeProduk: "UJI-B", stokAkhir: null },
        { kodeProduk: "UJI-LAMA", stokAkhir: 9 },
      ],
      tidakDikenal: [],
      jumlahDiabaikan: 0,
      tidakValid: [],
    });
    const wadah = buka();
    pilihFile(wadah, FILE);
    await bacaFile(wadah);
    expect(isian(wadah, "UJI-B").value).toBe("");
    expect(status(wadah)?.getAttribute("data-keadaan")).toBe("belumDisimpan");
    const teks = ringkasan(wadah)?.textContent ?? "";
    expect(teks).toContain("2 varian terisi dari file");
    expect(teks).not.toContain("tidak dikenal");
    expect(teks).not.toContain("diabaikan");
    expect(teks).not.toContain("tidak valid");
    // Hanya varian toko ini yang diterapkan.
    expect(window.localStorage.getItem(KUNCI)).toBe(JSON.stringify({ "UJI-B": "" }));

    tiruan.simpanStok.mockResolvedValue({ keadaan: "berhasil" });
    await kirim(wadah);
    expect(tiruan.simpanStok).toHaveBeenCalledWith(expect.objectContaining({ stok: [{ kodeProduk: "UJI-B", stokAkhir: null }] }));
  });

  it("gagal membaca file: pesan tampil, isian tidak berubah", async () => {
    tiruan.unggahStok.mockResolvedValue({ keadaan: "gagal", pesan: "Judul kolom Ending tidak ditemukan di baris pertama." });
    const wadah = buka();
    pilihFile(wadah, FILE);
    await bacaFile(wadah);
    expect(wadah.querySelector('[role="alert"]')?.textContent).toContain("Judul kolom Ending tidak ditemukan di baris pertama.");
    expect(ringkasan(wadah)).toBeNull();
    expect(isian(wadah, "UJI-A").value).toBe("");
    expect(status(wadah)).toBeNull();
  });

  it("gangguan jaringan saat membaca file: pesan gagal tampil, tidak diulang otomatis", async () => {
    tiruan.unggahStok.mockRejectedValue(new TypeError("Failed to fetch"));
    const wadah = buka();
    pilihFile(wadah, FILE);
    await bacaFile(wadah);
    expect(tiruan.unggahStok).toHaveBeenCalledTimes(1);
    expect(wadah.querySelector('[role="alert"]')?.textContent).toContain("File tidak terbaca karena server tidak menjawab. Coba lagi.");
    expect(status(wadah)).toBeNull();
  });
});

// PRD A6 ▶ Keputusan (2026-10-12, UAT kedua), T90: tombol "Isi 0 untuk stok yang kosong" mengisi 0 hanya pada produk
// otomatis yang isiannya (termasuk isian lokal yang belum disimpan) masih kosong, sebagai isian belum disimpan.
describe("isi 0 untuk stok yang kosong", () => {
  // Contoh literal issue T90: 3 otomatis kosong, 1 otomatis terisi 5, 1 otomatis −2, 1 manual kosong.
  const STOK_CONTOH: StokUji[] = [
    { kodeProduk: "UJI-K1", stokAkhir: null },
    { kodeProduk: "UJI-K2", stokAkhir: null },
    { kodeProduk: "UJI-K3", stokAkhir: null },
    { kodeProduk: "UJI-LIMA", stokAkhir: 5 },
    { kodeProduk: "UJI-NEG", stokAkhir: -2 },
    { kodeProduk: "UJI-T", stokAkhir: null, klasifikasi: "manual" },
  ];
  const tombolIsiNol = (wadah: HTMLElement) => {
    const tombol = [...wadah.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.startsWith("Isi 0 untuk"));
    if (tombol === undefined) throw new Error("Tombol Isi 0 tidak ada.");
    return tombol;
  };
  const nilai = (wadah: HTMLElement) => Object.fromEntries(STOK_CONTOH.map((s) => [s.kodeProduk, isian(wadah, s.kodeProduk).value]));
  async function tekan(tombol: HTMLButtonElement) {
    await act(async () => {
      tombol.click();
    });
  }

  it("mengisi 0 hanya pada produk otomatis yang kosong, sebagai belum disimpan; lalu tombol nonaktif", async () => {
    const wadah = buka(STOK_CONTOH);
    expect(tombolIsiNol(wadah).textContent).toBe("Isi 0 untuk 3 stok yang kosong");
    expect(tombolIsiNol(wadah).type).toBe("button");
    expect(tombolIsiNol(wadah).disabled).toBe(false);

    await tekan(tombolIsiNol(wadah));
    expect(nilai(wadah)).toEqual({ "UJI-K1": "0", "UJI-K2": "0", "UJI-K3": "0", "UJI-LIMA": "5", "UJI-NEG": "-2", "UJI-T": "" });
    expect(status(wadah)?.textContent).toBe("Ada perubahan yang belum disimpan");
    expect(tombolIsiNol(wadah).textContent).toBe("Isi 0 untuk 0 stok yang kosong");
    expect(tombolIsiNol(wadah).disabled).toBe(true);
    // Tidak ada tulisan ke server sampai Simpan stok; isian dijaga perlindungan draft.
    expect(tiruan.simpanStok).not.toHaveBeenCalled();
    expect(JSON.parse(window.localStorage.getItem(KUNCI) ?? "null")).toEqual({ "UJI-K1": "0", "UJI-K2": "0", "UJI-K3": "0" });

    tiruan.simpanStok.mockResolvedValue({ keadaan: "berhasil" });
    await kirim(wadah);
    expect(tiruan.simpanStok).toHaveBeenCalledWith(
      expect.objectContaining({
        stok: [
          { kodeProduk: "UJI-K1", stokAkhir: 0 },
          { kodeProduk: "UJI-K2", stokAkhir: 0 },
          { kodeProduk: "UJI-K3", stokAkhir: 0 },
        ],
      }),
    );
  });

  it("isian lokal yang belum disimpan ikut dihitung, termasuk setelah dipulihkan dari muat ulang", async () => {
    const wadah = buka(STOK_CONTOH);
    ketik(isian(wadah, "UJI-K1"), "7");
    expect(tombolIsiNol(wadah).textContent).toBe("Isi 0 untuk 2 stok yang kosong");
    ketik(isian(wadah, "UJI-LIMA"), " ");
    expect(tombolIsiNol(wadah).textContent).toBe("Isi 0 untuk 3 stok yang kosong");

    const setelahMuatUlang = buka(STOK_CONTOH);
    expect(tombolIsiNol(setelahMuatUlang).textContent).toBe("Isi 0 untuk 3 stok yang kosong");
    await tekan(tombolIsiNol(setelahMuatUlang));
    expect(nilai(setelahMuatUlang)).toEqual({ "UJI-K1": "7", "UJI-K2": "0", "UJI-K3": "0", "UJI-LIMA": "0", "UJI-NEG": "-2", "UJI-T": "" });
    expect(tombolIsiNol(setelahMuatUlang).disabled).toBe(true);
  });

  it("tanpa produk otomatis yang kosong: tombol menyebut 0 dan tidak bisa ditekan", () => {
    const wadah = buka([
      { kodeProduk: "UJI-B", stokAkhir: 5 },
      { kodeProduk: "UJI-T", stokAkhir: null, klasifikasi: "manual" },
    ]);
    expect(tombolIsiNol(wadah).textContent).toBe("Isi 0 untuk 0 stok yang kosong");
    expect(tombolIsiNol(wadah).disabled).toBe(true);
  });
});

// T117 (DESIGN §11.4): baris ringkas dan bar aksi menempel.
describe("meja kerja ringkas", () => {
  it('stok kosong tampil "—" dengan ikon CircleDashed di samping isian, tanpa badge bertumpuk', () => {
    const wadah = buka();
    const kosong = isian(wadah, "UJI-A");
    expect(kosong.value).toBe("");
    expect(kosong.placeholder).toBe("—");
    const penanda = kosong.parentElement?.querySelector("[data-stok-kosong]");
    expect(penanda?.querySelector("svg")?.classList.contains("lucide-circle-dashed")).toBe(true);
    expect(penanda?.getAttribute("title")).toBe("Belum diketahui");
    // Ikon di baris yang sama dengan isian (bersaudara), bukan badge di bawahnya.
    expect(penanda?.nextElementSibling).toBe(kosong);
    expect(wadah.querySelector("[data-status]")).toBeNull();
    expect(wadah.querySelector('[data-slot="badge"]')).toBeNull();
    // Stok terisi tanpa ikon.
    expect(isian(wadah, "UJI-B").parentElement?.querySelector("[data-stok-kosong]")).toBeNull();
    ketik(isian(wadah, "UJI-A"), "3");
    expect(isian(wadah, "UJI-A").parentElement?.querySelector("[data-stok-kosong]")).toBeNull();
  });

  it("bar aksi menempel di bawah berisi status simpan, jumlah isian yang berubah, dan tombol Simpan stok", async () => {
    tiruan.simpanStok.mockResolvedValue({ keadaan: "berhasil" });
    const wadah = buka();
    const bar = wadah.querySelector<HTMLElement>("[data-bar-aksi-stok]");
    expect(bar?.className).toMatch(/(^| )sticky( |$)/);
    expect(bar?.className).toMatch(/(^| )bottom-0( |$)/);
    expect(bar?.querySelector('button[type="submit"]')?.textContent).toBe("Simpan stok");
    expect(bar?.querySelector("[data-jumlah-isian-berubah]")).toBeNull();

    ketik(isian(wadah, "UJI-A"), "12");
    expect(bar?.querySelector("[data-jumlah-isian-berubah]")?.textContent).toBe("1 isian berubah");
    expect(bar?.querySelector("[data-keadaan]")?.getAttribute("data-keadaan")).toBe("belumDisimpan");
    ketik(isian(wadah, "UJI-B"), "7");
    expect(bar?.querySelector("[data-jumlah-isian-berubah]")?.textContent).toBe("2 isian berubah");

    await kirim(wadah);
    expect(bar?.querySelector("[data-keadaan]")?.textContent).toBe("Berhasil disimpan");
    expect(bar?.querySelector("[data-jumlah-isian-berubah]")).toBeNull();
  });
});
