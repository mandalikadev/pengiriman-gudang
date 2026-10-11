// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tiruan = vi.hoisted(() => ({ finalisasiRencana: vi.fn(), buka: vi.fn() }));
vi.mock("./aksi-final", () => ({ finalisasiRencana: tiruan.finalisasiRencana }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {}, push: tiruan.buka }) }));

import { pesanBelumPasti } from "@/components/keadaan-simpan";

import { FormFinalisasi } from "./form-finalisasi";
import { kunciIsianLokal, tulisIsianLokal } from "./isian-lokal";

// T62: form finalisasi satu toko. Setelah berhasil, layar rencana final dibuka. Hasil yang belum pasti tidak diulang
// otomatis. Isian stok toko ini yang belum disimpan (T59) menahan finalisasi, karena rencana final memakai stok tersimpan.
// Toko yang sudah final difinalisasi ulang dengan alasan wajib (PRD A7 ▶ Keputusan 2026-10-11, T62).

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const KUNCI = kunciIsianLokal(3, "2026-06-08", 7);
const STOK_TERSIMPAN = [{ kodeProduk: "UJI-A", stokAkhir: 20 }];

let terpasang: { wadah: HTMLElement; akar: Root } | null = null;

function buka(versiFinal: number | null = null) {
  const wadah = document.createElement("div");
  document.body.append(wadah);
  const akar = createRoot(wadah);
  act(() =>
    akar.render(
      <FormFinalisasi
        idGudang={3}
        tanggalKirim="2026-06-08"
        tokoId={7}
        namaToko="TOKO UJI"
        versi="v1"
        versiFinal={versiFinal}
        stokTersimpan={STOK_TERSIMPAN}
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

async function kirim(wadah: HTMLElement) {
  await act(async () => {
    tombol(wadah).click();
  });
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

    await kirim(wadah);
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
