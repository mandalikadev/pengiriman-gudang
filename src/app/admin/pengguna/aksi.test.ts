import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AksesDitolakError } from "@/server/auth/kewenangan";
import {
  adminAktifUji,
  buatPenggunaUji,
  emailUnik,
  kepalaPenggunaUji,
  masukUji,
  sandiUji,
  sisakanAdminAktifUji,
} from "@/server/auth/uji-bantu";
import { db } from "@/server/db";
import { user } from "@/server/db/schema";

const kepala = vi.hoisted(() => ({ cookie: "", muatUlangGagal: false }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(kepala.cookie ? { cookie: kepala.cookie } : {}),
}));
vi.mock("next/cache", () => ({
  revalidatePath: () => {
    if (kepala.muatUlangGagal) throw new Error("gagal memuat ulang");
  },
}));

import { aktifkanKembaliPengguna, buatPengguna, nonaktifkanPengguna, ubahPeran } from "./aksi";

async function cariPengguna(email: string) {
  const [baris] = await db.select().from(user).where(eq(user.email, email));
  return baris;
}

beforeEach(() => {
  kepala.cookie = "";
  kepala.muatUlangGagal = false;
});

describe("viewer yang memanggil aksi admin langsung (tanpa UI) ditolak", () => {
  beforeEach(async () => {
    kepala.cookie = (await kepalaPenggunaUji("viewer")).cookie;
  });

  it("buatPengguna ditolak dan tidak ada pengguna yang dibuat", async () => {
    const email = emailUnik("oleh-viewer");
    await expect(buatPengguna({ nama: "X", email, sandi: sandiUji, peran: "admin" })).rejects.toBeInstanceOf(
      AksesDitolakError,
    );
    expect(await cariPengguna(email)).toBeUndefined();
  });

  it("ubahPeran ditolak dan peran tidak berubah", async () => {
    const target = await buatPenggunaUji("viewer");
    await expect(ubahPeran({ idPengguna: target.id, peran: "admin" })).rejects.toBeInstanceOf(AksesDitolakError);
    expect((await cariPengguna(target.email)).role).toBe("viewer");
  });

  it("nonaktifkanPengguna ditolak dan pengguna tetap aktif", async () => {
    const target = await buatPenggunaUji("admin");
    await expect(nonaktifkanPengguna({ idPengguna: target.id })).rejects.toBeInstanceOf(AksesDitolakError);
    expect((await cariPengguna(target.email)).banned).toBe(false);
  });

  it("aktifkanKembaliPengguna ditolak dan pengguna tetap nonaktif", async () => {
    const target = await buatPenggunaUji("viewer");
    await db.update(user).set({ banned: true }).where(eq(user.id, target.id));
    await expect(aktifkanKembaliPengguna({ idPengguna: target.id })).rejects.toBeInstanceOf(AksesDitolakError);
    expect((await cariPengguna(target.email)).banned).toBe(true);
    await expect(masukUji(target.email)).rejects.toThrow();
  });
});

describe("pengguna yang belum masuk diarahkan ke halaman masuk", () => {
  it("buatPengguna tanpa sesi", async () => {
    const email = emailUnik("tanpa-sesi");
    await expect(buatPengguna({ nama: "X", email, sandi: sandiUji, peran: "viewer" })).rejects.toMatchObject({
      digest: expect.stringContaining("/masuk"),
    });
    expect(await cariPengguna(email)).toBeUndefined();
  });
});

describe("admin", () => {
  beforeEach(async () => {
    kepala.cookie = (await kepalaPenggunaUji("admin")).cookie;
  });

  it("membuat pengguna dengan peran pilihan; pengguna baru bisa masuk", async () => {
    const email = emailUnik("baru");
    await expect(buatPengguna({ nama: "Budi", email, sandi: sandiUji, peran: "viewer" })).resolves.toEqual({
      keadaan: "berhasil",
    });
    expect(await cariPengguna(email)).toMatchObject({ name: "Budi", role: "viewer", banned: false });
    await expect(masukUji(email)).resolves.toContain("session_token");
  });

  it("isian tidak valid → gagal dengan pesan, tanpa menulis data", async () => {
    const email = emailUnik("pendek");
    await expect(buatPengguna({ nama: "Budi", email, sandi: "1234567", peran: "viewer" })).resolves.toEqual({
      keadaan: "gagal",
      pesan: "Kata sandi minimal 8 karakter.",
    });
    await expect(buatPengguna({ nama: "Budi", email, sandi: sandiUji, peran: "operator" })).resolves.toMatchObject({
      keadaan: "gagal",
    });
    await expect(buatPengguna({ nama: "", email, sandi: sandiUji, peran: "viewer" })).resolves.toMatchObject({
      keadaan: "gagal",
    });
    await expect(buatPengguna({ nama: "Budi", email: "bukan-email", sandi: sandiUji, peran: "viewer" })).resolves.toEqual({
      keadaan: "gagal",
      pesan: "Email tidak valid.",
    });
    expect(await cariPengguna(email)).toBeUndefined();
  });

  it("email yang sudah dipakai → gagal", async () => {
    const ada = await buatPenggunaUji("viewer");
    await expect(buatPengguna({ nama: "Lagi", email: ada.email, sandi: sandiUji, peran: "viewer" })).resolves.toEqual({
      keadaan: "gagal",
      pesan: "Email sudah dipakai pengguna lain.",
    });
  });

  it("tersimpan tetapi gagal memuat ulang tampilan", async () => {
    kepala.muatUlangGagal = true;
    const email = emailUnik("muat-ulang");
    await expect(buatPengguna({ nama: "Citra", email, sandi: sandiUji, peran: "admin" })).resolves.toEqual({
      keadaan: "tersimpanGagalMuatUlang",
    });
    expect((await cariPengguna(email)).role).toBe("admin");
  });

  it("mengubah peran", async () => {
    const target = await buatPenggunaUji("viewer");
    await expect(ubahPeran({ idPengguna: target.id, peran: "admin" })).resolves.toEqual({ keadaan: "berhasil" });
    expect((await cariPengguna(target.email)).role).toBe("admin");
    await expect(ubahPeran({ idPengguna: target.id, peran: "operator" })).resolves.toMatchObject({ keadaan: "gagal" });
    expect((await cariPengguna(target.email)).role).toBe("admin");
  });

  it("menonaktifkan pengguna: sesi berjalannya dicabut dan ia tidak bisa masuk lagi", async () => {
    const target = await kepalaPenggunaUji("viewer");
    await expect(nonaktifkanPengguna({ idPengguna: target.id })).resolves.toEqual({ keadaan: "berhasil" });
    expect((await cariPengguna(target.email)).banned).toBe(true);
    await expect(masukUji(target.email)).rejects.toThrow();

    kepala.cookie = target.cookie;
    await expect(ubahPeran({ idPengguna: target.id, peran: "admin" })).rejects.toMatchObject({
      digest: expect.stringContaining("/masuk"),
    });
  });
});

describe("admin mengaktifkan kembali pengguna nonaktif (T23)", () => {
  beforeEach(async () => {
    kepala.cookie = (await kepalaPenggunaUji("admin")).cookie;
  });

  it("pengguna nonaktif diaktifkan kembali dan bisa masuk lagi, dengan peran tetap", async () => {
    const target = await kepalaPenggunaUji("viewer");
    await expect(nonaktifkanPengguna({ idPengguna: target.id })).resolves.toEqual({ keadaan: "berhasil" });
    await expect(masukUji(target.email)).rejects.toThrow();

    await expect(aktifkanKembaliPengguna({ idPengguna: target.id })).resolves.toEqual({ keadaan: "berhasil" });
    expect(await cariPengguna(target.email)).toMatchObject({ banned: false, role: "viewer" });
    await expect(masukUji(target.email)).resolves.toContain("session_token");
  });

  it("pengguna yang sudah aktif ditolak dengan pesan jelas", async () => {
    const target = await buatPenggunaUji("viewer");
    await expect(aktifkanKembaliPengguna({ idPengguna: target.id })).resolves.toEqual({
      keadaan: "gagal",
      pesan: "Pengguna ini sudah aktif.",
    });
    expect((await cariPengguna(target.email)).banned).toBe(false);
  });

  it("pengguna yang tidak ada atau isian tidak valid → gagal", async () => {
    await expect(aktifkanKembaliPengguna({ idPengguna: "tidak-ada" })).resolves.toEqual({
      keadaan: "gagal",
      pesan: "Pengguna tidak ditemukan.",
    });
    await expect(aktifkanKembaliPengguna({})).resolves.toMatchObject({ keadaan: "gagal" });
  });

  it("tersimpan tetapi gagal memuat ulang tampilan", async () => {
    const target = await buatPenggunaUji("viewer");
    await db.update(user).set({ banned: true }).where(eq(user.id, target.id));
    kepala.muatUlangGagal = true;
    await expect(aktifkanKembaliPengguna({ idPengguna: target.id })).resolves.toEqual({
      keadaan: "tersimpanGagalMuatUlang",
    });
    expect((await cariPengguna(target.email)).banned).toBe(false);
  });
});

describe("admin tidak boleh menonaktifkan akunnya sendiri (PRD A3)", () => {
  it("ditolak dengan pesan, akun tetap aktif", async () => {
    const admin = await kepalaPenggunaUji("admin");
    await buatPenggunaUji("admin");
    kepala.cookie = admin.cookie;
    await expect(nonaktifkanPengguna({ idPengguna: admin.id })).resolves.toEqual({
      keadaan: "gagal",
      pesan: "Akun sendiri tidak bisa dinonaktifkan.",
    });
    expect((await cariPengguna(admin.email)).banned).toBe(false);
  });
});

// Test di bawah menonaktifkan admin lain di database test agar jumlah admin aktif pasti.
describe("aplikasi selalu punya minimal satu admin aktif (PRD A3)", () => {
  it("admin satu-satunya tidak bisa menurunkan perannya sendiri", async () => {
    const admin = await kepalaPenggunaUji("admin");
    await sisakanAdminAktifUji(admin.id);
    kepala.cookie = admin.cookie;

    await expect(ubahPeran({ idPengguna: admin.id, peran: "viewer" })).resolves.toEqual({
      keadaan: "gagal",
      pesan: "Peran tidak bisa diubah: aplikasi harus punya minimal satu admin aktif.",
    });
    expect((await cariPengguna(admin.email)).role).toBe("admin");
  });

  it("dengan dua admin aktif, admin bisa menurunkan perannya sendiri", async () => {
    const admin = await kepalaPenggunaUji("admin");
    const adminLain = await buatPenggunaUji("admin");
    await sisakanAdminAktifUji(admin.id, adminLain.id);
    kepala.cookie = admin.cookie;

    await expect(ubahPeran({ idPengguna: admin.id, peran: "viewer" })).resolves.toEqual({ keadaan: "berhasil" });
    expect((await cariPengguna(admin.email)).role).toBe("viewer");
    expect(await adminAktifUji(admin.id, adminLain.id)).toEqual([adminLain.id]);
  });

  it("admin yang tersisa satu tidak bisa diturunkan oleh siapa pun", async () => {
    const admin = await kepalaPenggunaUji("admin");
    const adminLain = await buatPenggunaUji("admin");
    await sisakanAdminAktifUji(admin.id, adminLain.id);
    kepala.cookie = admin.cookie;

    await expect(ubahPeran({ idPengguna: adminLain.id, peran: "viewer" })).resolves.toEqual({ keadaan: "berhasil" });
    await expect(ubahPeran({ idPengguna: admin.id, peran: "viewer" })).resolves.toMatchObject({ keadaan: "gagal" });
    expect(await adminAktifUji(admin.id, adminLain.id)).toEqual([admin.id]);
  });

  it("dua penurunan peran bersamaan tidak menghabiskan admin aktif", async () => {
    const admin = await kepalaPenggunaUji("admin");
    const adminLain = await buatPenggunaUji("admin");
    await sisakanAdminAktifUji(admin.id, adminLain.id);
    kepala.cookie = admin.cookie;

    await Promise.allSettled([
      ubahPeran({ idPengguna: adminLain.id, peran: "viewer" }),
      ubahPeran({ idPengguna: admin.id, peran: "viewer" }),
    ]);
    expect(await adminAktifUji(admin.id, adminLain.id)).toHaveLength(1);
  });

  it("penurunan peran sendiri bersamaan dengan menonaktifkan admin lain tidak menghabiskan admin aktif", async () => {
    const admin = await kepalaPenggunaUji("admin");
    const adminLain = await buatPenggunaUji("admin");
    await sisakanAdminAktifUji(admin.id, adminLain.id);
    kepala.cookie = admin.cookie;

    await Promise.allSettled([
      nonaktifkanPengguna({ idPengguna: adminLain.id }),
      ubahPeran({ idPengguna: admin.id, peran: "viewer" }),
    ]);
    expect(await adminAktifUji(admin.id, adminLain.id)).toHaveLength(1);
  });
});
