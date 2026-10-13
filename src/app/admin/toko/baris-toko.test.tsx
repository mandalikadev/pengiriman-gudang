// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tiruan = vi.hoisted(() => ({ gantiNamaToko: vi.fn(), ubahStatusToko: vi.fn(), tambahTokoBaru: vi.fn() }));
vi.mock("./aksi", () => tiruan);

import {
  bukaDialogKonfirmasi,
  judulDialogKonfirmasi,
  lepasTerpasang,
  pasangUntukUji,
  pilihDiDialogKonfirmasi,
} from "@/components/ui/uji-bantu-dialog-konfirmasi";

import { BarisToko, type DataBarisToko } from "./baris-toko";

// T111: baris daftar toko admin. Ubah nama di baris itu (dengan keterangan aturan nama), Nonaktifkan/Aktifkan lewat
// dialog konfirmasi (DESIGN §11.3).

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const lmk: DataBarisToko = { id: 7, nama: "LMK", aktif: true, namaGudang: "Gudang Cibubur" };

function pasang(toko: DataBarisToko) {
  return pasangUntukUji(
    <table>
      <tbody>
        <BarisToko toko={toko} />
      </tbody>
    </table>,
  );
}

const tombol = (wadah: HTMLElement, nama: string) =>
  [...wadah.querySelectorAll("button")].find((b) => b.getAttribute("aria-label") === nama || b.textContent?.trim() === nama);
const status = (wadah: HTMLElement) => wadah.querySelector("[data-keadaan]");

beforeEach(() => {
  tiruan.gantiNamaToko.mockReset();
  tiruan.ubahStatusToko.mockReset();
});

afterEach(() => {
  lepasTerpasang();
});

describe("baris toko", () => {
  it("menampilkan nama, status Aktif, gudang terhubung, dan tombol Ubah nama serta Nonaktifkan", () => {
    const wadah = pasang(lmk);
    const sel = wadah.querySelectorAll("td");
    expect(sel[0]?.textContent).toBe("LMK");
    expect(wadah.querySelector('[data-status="aktif"]')).not.toBeNull();
    expect(sel[2]?.textContent).toBe("Gudang Cibubur");
    expect(tombol(wadah, "Ubah nama LMK")).toBeDefined();
    expect(tombol(wadah, "Nonaktifkan LMK")).toBeDefined();
  });

  it("toko nonaktif tanpa gudang: badge Nonaktif, Belum terhubung, tombol Aktifkan lewat dialog", async () => {
    tiruan.ubahStatusToko.mockResolvedValue({ keadaan: "berhasil" });
    const wadah = pasang({ ...lmk, aktif: false, namaGudang: null });
    expect(wadah.querySelector('[data-status="nonaktif"]')?.textContent).toBe("Nonaktif");
    expect(wadah.querySelectorAll("td")[2]?.textContent).toBe("Belum terhubung");
    bukaDialogKonfirmasi(wadah, "Aktifkan LMK");
    expect(judulDialogKonfirmasi()).toBe("Aktifkan toko LMK?");
    await pilihDiDialogKonfirmasi("Aktifkan");
    expect(tiruan.ubahStatusToko).toHaveBeenCalledWith({ idToko: 7, aktif: true });
  });

  it("Ubah nama: isian dengan keterangan aturan nama; Batal tidak menyimpan; Simpan nama mengirim nama baru", async () => {
    tiruan.gantiNamaToko.mockResolvedValue({ keadaan: "berhasil" });
    const wadah = pasang(lmk);
    act(() => tombol(wadah, "Ubah nama LMK")?.click());
    const isian = wadah.querySelector("input");
    expect(isian?.value).toBe("LMK");
    expect(wadah.querySelector(`label[for="${isian?.id}"]`)?.textContent).toBe("Nama baru LMK");
    const keterangan = wadah.querySelector(`#${CSS.escape(isian?.getAttribute("aria-describedby") ?? "")}`);
    expect(keterangan?.textContent).toBe(
      "Nama harus sama persis dengan nama blok toko di sheet penjualan. Setelah nama diubah, sheet berikutnya harus memakai nama baru.",
    );

    act(() => tombol(wadah, "Batal")?.click());
    expect(wadah.querySelector("input")).toBeNull();
    expect(tiruan.gantiNamaToko).not.toHaveBeenCalled();

    act(() => tombol(wadah, "Ubah nama LMK")?.click());
    const isianBaru = wadah.querySelector("input");
    if (!isianBaru) throw new Error("Isian nama tidak ada.");
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(isianBaru, "LMK BARU");
      isianBaru.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => tombol(wadah, "Simpan nama")?.click());
    expect(tiruan.gantiNamaToko).toHaveBeenCalledWith({ idToko: 7, nama: "LMK BARU" });
    expect(status(wadah)?.getAttribute("data-keadaan")).toBe("berhasil");
    expect(wadah.querySelector("input")).toBeNull();
  });

  it("nama ditolak server: pesan tampil di baris dan isian tetap terbuka", async () => {
    tiruan.gantiNamaToko.mockResolvedValue({ keadaan: "gagal", pesan: "Nama toko sudah dipakai: PMS. Pilih nama lain." });
    const wadah = pasang(lmk);
    act(() => tombol(wadah, "Ubah nama LMK")?.click());
    await act(async () => tombol(wadah, "Simpan nama")?.click());
    expect(status(wadah)?.textContent).toBe("Gagal — Nama toko sudah dipakai: PMS. Pilih nama lain.");
    expect(wadah.querySelector("input")).not.toBeNull();
  });
});
