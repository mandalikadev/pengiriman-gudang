// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tiruan = vi.hoisted(() => ({ hapusAlias: vi.fn(), hapusSegmenKode: vi.fn() }));
vi.mock("./aksi", () => ({
  hapusAlias: tiruan.hapusAlias,
  hapusSegmenKode: tiruan.hapusSegmenKode,
  tambahAlias: vi.fn(),
  tambahSegmenKode: vi.fn(),
  ubahKeluargaAroma: vi.fn(),
}));

import {
  bukaDialogKonfirmasi,
  dialogKonfirmasi,
  judulDialogKonfirmasi,
  lepasTerpasang,
  pasangUntukUji,
  pilihDiDialogKonfirmasi,
  tombolDialogKonfirmasi,
} from "@/components/ui/uji-bantu-dialog-konfirmasi";

import { KartuKeluarga, type DataKeluarga } from "./kartu-keluarga";

// T109 (DESIGN §11.3): hapus alias dan segmen kode keluarga aroma meminta konfirmasi lewat dialog konfirmasi aplikasi.

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const KELUARGA: DataKeluarga = {
  id: 9,
  nama: "GORGEOUS",
  aktif: true,
  alias: [{ id: 31, alias: "GORGEOUS" }],
  segmen: [{ id: 41, segmen: "GOR" }],
};

beforeEach(() => {
  tiruan.hapusAlias.mockReset();
  tiruan.hapusSegmenKode.mockReset();
});
afterEach(lepasTerpasang);

describe.each([
  {
    jenis: "alias",
    pembuka: "Hapus alias GORGEOUS",
    judul: "Hapus alias GORGEOUS?",
    akibat: "Baris ranking dengan nama ini tidak lagi dicocokkan ke keluarga GORGEOUS.",
    aksi: () => tiruan.hapusAlias,
    argumen: { idAlias: 31 },
  },
  {
    jenis: "segmen kode",
    pembuka: "Hapus segmen kode GOR",
    judul: "Hapus segmen kode GOR?",
    akibat: "Produk yang kodenya memuat segmen ini tidak lagi mendapat usulan keluarga GORGEOUS di halaman Pemetaan produk.",
    aksi: () => tiruan.hapusSegmenKode,
    argumen: { idSegmen: 41 },
  },
])("hapus $jenis keluarga aroma", ({ pembuka, judul, akibat, aksi, argumen }) => {
  it("tombol bergaris destructive; dialog: Batal tidak menghapus", async () => {
    const wadah = pasangUntukUji(<KartuKeluarga keluarga={KELUARGA} />);
    const tombol = bukaDialogKonfirmasi(wadah, pembuka);
    expect(tombol.className.split(" ")).toContain("border-destructive");
    expect(tombol.className.split(" ")).not.toContain("bg-destructive");
    expect(judulDialogKonfirmasi()).toBe(judul);
    expect(dialogKonfirmasi()?.textContent).toContain(akibat);
    expect(tombolDialogKonfirmasi("Hapus").className).toContain("bg-destructive");
    await pilihDiDialogKonfirmasi("Batal");
    expect(aksi()).not.toHaveBeenCalled();
    expect(wadah.querySelector("[data-keadaan]")).toBeNull();
  });

  it("Hapus menjalankan aksi hapus entri itu", async () => {
    aksi().mockResolvedValue({ keadaan: "berhasil" });
    const wadah = pasangUntukUji(<KartuKeluarga keluarga={KELUARGA} />);
    bukaDialogKonfirmasi(wadah, pembuka);
    await pilihDiDialogKonfirmasi("Hapus");
    expect(aksi()).toHaveBeenCalledWith(argumen);
    expect(wadah.querySelector('[data-keadaan="berhasil"]')).not.toBeNull();
  });
});
