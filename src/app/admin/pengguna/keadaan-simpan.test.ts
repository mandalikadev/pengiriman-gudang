import { describe, expect, it } from "vitest";

import { keadaanTampil, PESAN_BELUM_PASTI } from "./keadaan-simpan";

describe("keadaanTampil (CODING_STANDARDS: lima keadaan simpan)", () => {
  it("belum ada perubahan → tidak ada pesan", () => {
    expect(keadaanTampil({ berubah: false, menunggu: false, hasil: null })).toBeNull();
  });

  it("ada perubahan yang belum dikirim → belum disimpan", () => {
    expect(keadaanTampil({ berubah: true, menunggu: false, hasil: null })).toEqual({ keadaan: "belumDisimpan" });
  });

  it("sedang menunggu server → sedang menyimpan (mengalahkan hasil sebelumnya)", () => {
    expect(keadaanTampil({ berubah: true, menunggu: true, hasil: { keadaan: "gagal", pesan: "x" } })).toEqual({
      keadaan: "menyimpan",
    });
  });

  it.each([
    [{ keadaan: "berhasil" }],
    [{ keadaan: "gagal", pesan: "Email sudah dipakai pengguna lain." }],
    [{ keadaan: "tersimpanGagalMuatUlang" }],
  ] as const)("hasil server ditampilkan apa adanya: %o", (hasil) => {
    expect(keadaanTampil({ berubah: false, menunggu: false, hasil })).toEqual(hasil);
  });

  it("pesan untuk hasil yang belum pasti menyuruh memeriksa, bukan mengulang otomatis", () => {
    expect(PESAN_BELUM_PASTI).toMatch(/belum pasti/i);
    expect(PESAN_BELUM_PASTI).toMatch(/periksa/i);
  });
});
