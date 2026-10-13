// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tiruan = vi.hoisted(() => ({ finalisasiRencana: vi.fn(), buka: vi.fn() }));
vi.mock("./aksi-final", () => ({ finalisasiRencana: tiruan.finalisasiRencana }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {}, push: tiruan.buka }) }));

import { pesanBelumPasti } from "@/components/keadaan-simpan";
import {
  dialogKonfirmasi,
  judulDialogKonfirmasi,
  pilihDiDialogKonfirmasi,
  tombolDialogKonfirmasi,
} from "@/components/ui/uji-bantu-dialog-konfirmasi";
import { parseTanggalBisnis } from "@/domain/kalender";

import { FormFinalisasi } from "./form-finalisasi";
import { kunciIsianLokal, tulisIsianLokal } from "./isian-lokal";

// T62: form finalisasi satu toko. Setelah berhasil, layar rencana final dibuka. Hasil yang belum pasti tidak diulang
// otomatis. Isian stok toko ini yang belum disimpan (T59) menahan finalisasi, karena rencana final memakai stok tersimpan.
// Toko yang sudah final difinalisasi ulang dengan alasan wajib (PRD A7 ▶ Keputusan 2026-10-11, T62).
// T109 (DESIGN §11.3): tombol finalisasi membuka dialog konfirmasi berisi ringkasan; rencana final hanya dibuat setelah
// dikonfirmasi.

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const KUNCI = kunciIsianLokal(3, "2026-06-08", 7);
const STOK_TERSIMPAN = [{ kodeProduk: "UJI-A", stokAkhir: 20 }];

let terpasang: { wadah: HTMLElement; akar: Root } | null = null;

const RINGKASAN = { jumlahVarian: 12, totalJumlahKirim: 1250, peringatan: [] as string[] };

function buka(versiFinal: number | null = null, ringkasan = RINGKASAN) {
  const wadah = document.createElement("div");
  document.body.append(wadah);
  const akar = createRoot(wadah);
  act(() =>
    akar.render(
      <FormFinalisasi
        idGudang={3}
        tanggalKirim={parseTanggalBisnis("2026-06-08")}
        tokoId={7}
        namaToko="TOKO UJI"
        versi="v1"
        versiFinal={versiFinal}
        stokTersimpan={STOK_TERSIMPAN}
        ringkasan={ringkasan}
      />,
    ),
  );
  terpasang = { wadah, akar };
  return wadah;
}

const tombol = (wadah: HTMLElement) => {
  const elemen = wadah.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (elemen === null) throw new Error("Tombol finalisasi tidak ada.");
  return elemen;
};

/** Mengubah nilai input terkendali React seperti diketik pengguna. */
function ubahNilai(input: HTMLInputElement, nilai: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, nilai);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

/** Menekan tombol finalisasi (membuka dialog konfirmasi), lalu memilih tombol tindakan di dialog. */
async function kirim(wadah: HTMLElement, tindakan = "Finalisasi") {
  act(() => tombol(wadah).click());
  await pilihDiDialogKonfirmasi(tindakan);
}

beforeEach(() => {
  window.localStorage.clear();
  tiruan.finalisasiRencana.mockReset();
  tiruan.buka.mockReset();
});

afterEach(() => {
  if (terpasang !== null) {
    const { wadah, akar } = terpasang;
    act(() => akar.unmount());
    wadah.remove();
    terpasang = null;
  }
});

describe("FormFinalisasi", () => {
  it("tombol finalisasi membuka dialog berisi toko, tanggal kirim, jumlah varian, dan total jumlah kirim; Batal tidak membuat rencana final", async () => {
    const wadah = buka();
    act(() => tombol(wadah).click());
    expect(judulDialogKonfirmasi()).toBe("Finalisasi rencana TOKO UJI?");
    const ringkasan = dialogKonfirmasi()!.querySelector("[data-ringkasan-finalisasi]");
    const pasangan = [...ringkasan!.querySelectorAll("dt")].map((dt) => [dt.textContent, dt.nextElementSibling?.textContent]);
    expect(pasangan).toEqual([
      ["Toko", "TOKO UJI"],
      ["Tanggal kirim", "Senin, 08-06-2026"],
      ["Jumlah varian", "12"],
      ["Total jumlah kirim", "1.250"],
    ]);
    expect(dialogKonfirmasi()!.querySelector("[data-peringatan-finalisasi]")).toBeNull();
    expect(tombolDialogKonfirmasi("Finalisasi").className).toContain("bg-primary");
    expect(document.activeElement).toBe(tombolDialogKonfirmasi("Batal"));
    expect(tiruan.finalisasiRencana).not.toHaveBeenCalled();

    await pilihDiDialogKonfirmasi("Batal");
    expect(dialogKonfirmasi()).toBeNull();
    expect(tiruan.finalisasiRencana).not.toHaveBeenCalled();
    expect(wadah.querySelector("[data-keadaan]")).toBeNull();
  });

  it("peringatan yang masih tampil ikut di dialog", () => {
    const peringatan = "Kiriman Senin, 01-06-2026 belum sampai saat persiapan. Pastikan jumlahnya ikut dihitung di stok akhir.";
    const wadah = buka(null, { ...RINGKASAN, peringatan: [peringatan] });
    act(() => tombol(wadah).click());
    const isi = [...dialogKonfirmasi()!.querySelectorAll("[data-peringatan-finalisasi]")].map((p) => p.textContent);
    expect(isi).toEqual([peringatan]);
  });

  it("mengirim versi toko yang dilihat; setelah berhasil membuka layar rencana final", async () => {
    tiruan.finalisasiRencana.mockResolvedValue({ keadaan: "berhasil", idRencana: 42 });
    const wadah = buka();
    await kirim(wadah);
    expect(tiruan.finalisasiRencana).toHaveBeenCalledWith({ idGudang: 3, tanggalKirim: "2026-06-08", tokoId: 7, versi: "v1" });
    expect(wadah.querySelector('input[name="alasan"]')).toBeNull();
    expect(tiruan.buka).toHaveBeenCalledWith("/pengiriman-gudang/3/rencana-final/42");
    expect(wadah.querySelector('[data-keadaan="berhasil"]')).not.toBeNull();
  });

  it("gagal: pesan tampil dekat form, layar tidak berpindah", async () => {
    tiruan.finalisasiRencana.mockResolvedValue({ keadaan: "gagal", pesan: "Draft rencana perlu dihitung ulang sebelum bisa difinalisasi." });
    const wadah = buka();
    await kirim(wadah);
    expect(wadah.querySelector('[data-keadaan="gagal"]')?.textContent).toContain("Draft rencana perlu dihitung ulang sebelum bisa difinalisasi.");
    expect(tiruan.buka).not.toHaveBeenCalled();
  });

  it("hasil belum pasti (server tidak menjawab) tidak diulang otomatis", async () => {
    tiruan.finalisasiRencana.mockRejectedValue(new Error("jaringan putus"));
    const wadah = buka();
    await kirim(wadah);
    expect(tiruan.finalisasiRencana).toHaveBeenCalledTimes(1);
    expect(wadah.querySelector('[data-keadaan="gagal"]')?.textContent).toContain(pesanBelumPasti("rencana final toko ini"));
  });

  it("isian stok toko ini yang belum disimpan menahan finalisasi", async () => {
    tulisIsianLokal(KUNCI, { "UJI-A": "25" });
    const wadah = buka();
    expect(tombol(wadah).disabled).toBe(true);
    const penahan = wadah.querySelector("[data-finalisasi-stok-belum-disimpan]");
    expect(penahan?.getAttribute("data-keadaan")).toBe("belumDisimpan");
    expect(penahan?.querySelector("svg")?.classList.contains("lucide-pencil-line")).toBe(true);
    expect(penahan?.textContent).toBe("Ada perubahan yang belum disimpan — Simpan stok lebih dulu, lalu finalisasi.");

    // Isian yang sama dengan stok tersimpan tidak dihitung belum disimpan.
    act(() => tulisIsianLokal(KUNCI, { "UJI-A": "20" }));
    expect(tombol(wadah).disabled).toBe(false);
  });

  it("finalisasi ulang: alasan wajib sebelum bisa dikirim, lalu dikirim bersama versi toko", async () => {
    tiruan.finalisasiRencana.mockResolvedValue({ keadaan: "berhasil", idRencana: 43 });
    const wadah = buka(2);
    expect(wadah.textContent).toContain("Rencana toko ini sudah final (versi 2). Finalisasi ulang menyimpan versi 3 yang menggantikan versi 2; versi 2 tetap tersimpan.");
    expect(tombol(wadah).textContent).toContain("Finalisasi ulang");
    const isian = wadah.querySelector<HTMLInputElement>('input[name="alasan"]');
    if (isian === null) throw new Error("Isian alasan tidak ada.");
    expect(isian.required).toBe(true);
    expect(tombol(wadah).disabled).toBe(true);

    act(() => ubahNilai(isian, "   "));
    expect(tombol(wadah).disabled).toBe(true);
    act(() => ubahNilai(isian, "Stok salah ketik"));
    expect(wadah.querySelector('[data-keadaan="belumDisimpan"]')).not.toBeNull();
    expect(tombol(wadah).disabled).toBe(false);

    act(() => tombol(wadah).click());
    expect(judulDialogKonfirmasi()).toBe("Finalisasi ulang rencana TOKO UJI?");
    expect(dialogKonfirmasi()?.textContent).toContain("Versi 3 disimpan dan menggantikan versi 2; versi 2 tetap tersimpan.");
    expect(tiruan.finalisasiRencana).not.toHaveBeenCalled();
    await pilihDiDialogKonfirmasi("Finalisasi ulang");
    expect(tiruan.finalisasiRencana).toHaveBeenCalledWith({
      idGudang: 3,
      tanggalKirim: "2026-06-08",
      tokoId: 7,
      versi: "v1",
      alasanFinalisasiUlang: "Stok salah ketik",
    });
    expect(tiruan.buka).toHaveBeenCalledWith("/pengiriman-gudang/3/rencana-final/43");
  });
});
