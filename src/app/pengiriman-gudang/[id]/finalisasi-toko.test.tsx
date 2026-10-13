// @vitest-environment jsdom
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./aksi-final", () => ({ finalisasiRencana: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));

import { dialogKonfirmasi, lepasTerpasang, pasangUntukUji } from "@/components/ui/uji-bantu-dialog-konfirmasi";
import { parseTanggalBisnis } from "@/domain/kalender";

import { FinalisasiToko } from "./bagian-draft";

// T109 (DESIGN §11.3): ringkasan di dialog finalisasi berasal dari isi toko di draft. Jumlah varian menghitung semua
// baris termasuk produk manual; total jumlah kirim hanya dari baris yang punya jumlah kirim (produk manual tidak punya
// jumlah kirim, PRD A6); peringatan "Kiriman … belum sampai" yang tampil di draft ikut di dialog.

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type TokoFinalisasi = Parameters<typeof FinalisasiToko>[0]["toko"];

const TOKO: TokoFinalisasi = {
  id: 7,
  nama: "TOKO UJI",
  versi: "v1",
  versiFinal: null,
  perluDihitungUlang: [],
  jumlahTertahan: 0,
  kirimanSebelumnyaBelumSampai: parseTanggalBisnis("2026-06-01"),
  baris: [
    { kodeProduk: "UJI-A", stokAkhir: 3, jumlahKirim: 12 },
    { kodeProduk: "UJI-B", stokAkhir: 0, jumlahKirim: 30 },
    { kodeProduk: "UJI-C", stokAkhir: null, jumlahKirim: 0 },
    { kodeProduk: "UJI-T", stokAkhir: 5, jumlahKirim: null },
  ],
};

afterEach(lepasTerpasang);

function bukaDialogFinalisasi(toko: TokoFinalisasi) {
  const wadah = pasangUntukUji(
    <FinalisasiToko toko={toko} finalisasi={{ idGudang: 3, tanggalKirim: parseTanggalBisnis("2026-06-08") }} />,
  );
  const tombol = wadah.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (tombol === null) throw new Error("Tombol finalisasi tidak ada.");
  act(() => tombol.click());
  const isi = dialogKonfirmasi();
  if (isi === null) throw new Error("Dialog finalisasi tidak terbuka.");
  return isi;
}

describe("ringkasan dialog finalisasi dari isi toko di draft", () => {
  it("jumlah varian termasuk produk manual; total jumlah kirim tanpa produk manual; peringatan ikut", () => {
    const isi = bukaDialogFinalisasi(TOKO);
    const pasangan = [...isi.querySelectorAll("[data-ringkasan-finalisasi] dt")].map((dt) => [
      dt.textContent,
      dt.nextElementSibling?.textContent,
    ]);
    expect(pasangan).toEqual([
      ["Toko", "TOKO UJI"],
      ["Tanggal kirim", "Senin, 08-06-2026"],
      ["Jumlah varian", "4"],
      ["Total jumlah kirim", "42"],
    ]);
    expect([...isi.querySelectorAll("[data-peringatan-finalisasi]")].map((p) => p.textContent)).toEqual([
      "Kiriman Senin, 01-06-2026 belum sampai saat persiapan. Pastikan jumlahnya ikut dihitung di stok akhir.",
    ]);
  });

  it("tanpa peringatan kiriman sebelumnya: dialog tanpa peringatan", () => {
    const isi = bukaDialogFinalisasi({ ...TOKO, kirimanSebelumnyaBelumSampai: null });
    expect(isi.querySelector("[data-peringatan-finalisasi]")).toBeNull();
  });
});
