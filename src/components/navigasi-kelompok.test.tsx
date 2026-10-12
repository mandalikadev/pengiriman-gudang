// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tiruan = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => tiruan.pathname }));
vi.mock("@/app/keluar/aksi", () => ({ keluar: async () => undefined }));

import { Navigasi } from "./navigasi";

// T81 — DESIGN §6 ▶ Keputusan (2026-10-11, UAT): kelompok sidebar bisa dibuka-tutup.
// T95 — susunan kelompok mengikuti urutan kerja (▶ Keputusan 2026-10-12): Pekerjaan rutin, Laporan, Pengaturan.

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const ADMIN = { nama: "Admin Uji", peran: "admin" } as const;

let wadah: HTMLElement;
let akar: Root;

// jsdom tidak berpindah dokumen; klik tautan dicegah supaya tidak mencatat "navigation not implemented".
const cegahNavigasi = (event: Event) => event.preventDefault();

function tampilkan(pathname: string) {
  tiruan.pathname = pathname;
  act(() =>
    akar.render(
      <Navigasi pengguna={ADMIN} tampilkanPengirimanGudang>
        <p>isi</p>
      </Navigasi>,
    ),
  );
}

function pasang(pathname: string) {
  wadah = document.createElement("div");
  document.body.append(wadah);
  akar = createRoot(wadah);
  tampilkan(pathname);
}

function lepas() {
  act(() => akar.unmount());
  wadah.remove();
}

beforeEach(() => {
  document.addEventListener("click", cegahNavigasi);
  window.localStorage.clear();
});

afterEach(() => {
  lepas();
  document.removeEventListener("click", cegahNavigasi);
  vi.restoreAllMocks();
  window.localStorage.clear();
});

function judul(nama: string): HTMLButtonElement {
  const elemen = wadah.querySelector<HTMLButtonElement>(`button[data-kelompok="${nama}"]`);
  if (elemen === null) throw new Error(`Judul kelompok "${nama}" tidak ada.`);
  return elemen;
}

function daftar(nama: string): HTMLElement {
  const id = judul(nama).getAttribute("aria-controls");
  const elemen = id === null ? null : document.getElementById(id);
  if (elemen === null) throw new Error(`Daftar kelompok "${nama}" tidak ada.`);
  return elemen;
}

/** Terbuka menurut tombol (aria-expanded) dan menurut daftarnya (tidak `hidden`); keduanya harus sepakat. */
function terbuka(nama: string): boolean {
  const menurutTombol = judul(nama).getAttribute("aria-expanded") === "true";
  expect(daftar(nama).hidden).toBe(!menurutTombol);
  return menurutTombol;
}

function keadaan() {
  return { "Pekerjaan rutin": terbuka("Pekerjaan rutin"), Laporan: terbuka("Laporan"), Pengaturan: terbuka("Pengaturan") };
}

function klik(elemen: Element) {
  act(() => elemen.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })));
}

describe("judul kelompok sebagai tombol buka-tutup", () => {
  it("klik judul membuka lalu menutup daftar itemnya; aria-expanded ikut berubah", () => {
    pasang("/");
    expect(terbuka("Laporan")).toBe(false);
    klik(judul("Laporan"));
    expect(terbuka("Laporan")).toBe(true);
    expect(daftar("Laporan").querySelector('a[href="/kalender"]')).not.toBeNull();
    klik(judul("Laporan"));
    expect(terbuka("Laporan")).toBe(false);
  });

  it("tombol bisa dipakai keyboard (button type=button), memakai ChevronDown yang berputar saat terbuka", () => {
    pasang("/");
    const tombol = judul("Pekerjaan rutin");
    expect(tombol.tagName).toBe("BUTTON");
    expect(tombol.getAttribute("type")).toBe("button");
    expect(tombol.textContent).toContain("Pekerjaan rutin");
    const ikon = tombol.querySelector("svg");
    expect(ikon?.getAttribute("class")).toContain("lucide-chevron-down");
    // Putaran mengikuti aria-expanded tombol (group-aria-expanded), jadi selalu sejalan dengan keadaannya.
    expect(tombol.classList.contains("group")).toBe(true);
    expect(ikon?.getAttribute("class")).toContain("group-aria-expanded:rotate-180");
    expect(ikon?.getAttribute("class")).not.toMatch(/(^|\s)rotate-180/);
  });

  it("Beranda tetap item tunggal; Data master dan Organisasi tetap subjudul di dalam Pengaturan, bukan tombol", () => {
    pasang("/");
    expect([...wadah.querySelectorAll<HTMLButtonElement>("button[data-kelompok]")].map((b) => b.dataset.kelompok)).toEqual([
      "Pekerjaan rutin",
      "Laporan",
      "Pengaturan",
    ]);
    expect(wadah.querySelector('a[href="/"]')?.closest("[hidden]")).toBeNull();
    klik(judul("Pengaturan"));
    const pengaturan = daftar("Pengaturan");
    expect(pengaturan.querySelector('p[data-kelompok="Data master"]')).not.toBeNull();
    expect(pengaturan.querySelector('p[data-kelompok="Organisasi"]')).not.toBeNull();
    expect(pengaturan.querySelector('a[href="/admin/keluarga-aroma"]')).not.toBeNull();
    expect(pengaturan.querySelector('a[href="/admin/penugasan"]')).not.toBeNull();
    const rutin = daftar("Pekerjaan rutin");
    expect(rutin.querySelector('a[href="/admin/impor"]')).not.toBeNull();
    expect(rutin.querySelector('a[href="/admin/jadwal"]')).not.toBeNull();
  });
});

describe("keadaan awal", () => {
  it("di beranda semua kelompok tertutup", () => {
    pasang("/");
    expect(keadaan()).toEqual({ "Pekerjaan rutin": false, Laporan: false, Pengaturan: false });
  });

  it("halaman /kalender: Laporan terbuka, lainnya tertutup", () => {
    pasang("/kalender");
    expect(keadaan()).toEqual({ "Pekerjaan rutin": false, Laporan: true, Pengaturan: false });
  });

  it("halaman /admin/impor: Pekerjaan rutin terbuka, lainnya tertutup", () => {
    pasang("/admin/impor");
    expect(keadaan()).toEqual({ "Pekerjaan rutin": true, Laporan: false, Pengaturan: false });
  });

  it("sub-halaman /admin/impor/12: Pekerjaan rutin terbuka, lainnya tertutup", () => {
    pasang("/admin/impor/12");
    expect(keadaan()).toEqual({ "Pekerjaan rutin": true, Laporan: false, Pengaturan: false });
  });

  it("halaman /admin/jadwal: Pekerjaan rutin terbuka, lainnya tertutup", () => {
    pasang("/admin/jadwal");
    expect(keadaan()).toEqual({ "Pekerjaan rutin": true, Laporan: false, Pengaturan: false });
  });

  it("sub-halaman /pengiriman-gudang/3/rencana-final/7: Pekerjaan rutin terbuka, lainnya tertutup", () => {
    pasang("/pengiriman-gudang/3/rencana-final/7");
    expect(keadaan()).toEqual({ "Pekerjaan rutin": true, Laporan: false, Pengaturan: false });
  });

  it("halaman /admin/keluarga-aroma: Pengaturan terbuka, lainnya tertutup", () => {
    pasang("/admin/keluarga-aroma");
    expect(keadaan()).toEqual({ "Pekerjaan rutin": false, Laporan: false, Pengaturan: true });
  });

  it("halaman /admin/penugasan (subjudul Organisasi): Pengaturan terbuka, lainnya tertutup", () => {
    pasang("/admin/penugasan");
    expect(keadaan()).toEqual({ "Pekerjaan rutin": false, Laporan: false, Pengaturan: true });
  });
});

describe("pilihan diingat di browser", () => {
  it("pilihan buka/tutup bertahan setelah pindah halaman", () => {
    pasang("/");
    klik(judul("Pekerjaan rutin"));
    tampilkan("/ringkasan");
    expect(keadaan()).toEqual({ "Pekerjaan rutin": true, Laporan: true, Pengaturan: false });
  });

  it("pilihan bertahan setelah halaman dimuat ulang (komponen dipasang ulang)", () => {
    pasang("/");
    klik(judul("Pengaturan"));
    lepas();
    pasang("/");
    expect(keadaan()).toEqual({ "Pekerjaan rutin": false, Laporan: false, Pengaturan: true });
  });

  it("kelompok halaman aktif tetap terbuka walaupun sebelumnya ditutup", () => {
    pasang("/");
    klik(judul("Laporan"));
    klik(judul("Laporan"));
    expect(terbuka("Laporan")).toBe(false);
    tampilkan("/ringkasan");
    expect(terbuka("Laporan")).toBe(true);
    lepas();
    pasang("/kalender");
    expect(terbuka("Laporan")).toBe(true);
  });

  it("navigasi klien A → tutup → B → A: kelompok halaman A terbuka lagi", () => {
    pasang("/ringkasan");
    klik(judul("Laporan"));
    expect(terbuka("Laporan")).toBe(false);
    tampilkan("/");
    expect(terbuka("Laporan")).toBe(false);
    tampilkan("/ringkasan");
    expect(terbuka("Laporan")).toBe(true);
  });

  it("menutup kelompok halaman aktif berlaku sementara di halaman itu, lalu bisa dibuka lagi", () => {
    pasang("/admin/impor/12");
    klik(judul("Pekerjaan rutin"));
    expect(terbuka("Pekerjaan rutin")).toBe(false);
    klik(judul("Pekerjaan rutin"));
    expect(terbuka("Pekerjaan rutin")).toBe(true);
  });

  it("isi penyimpanan yang rusak diabaikan: kembali ke keadaan awal", () => {
    window.localStorage.setItem("mandalika:sidebar-kelompok-v2", "{bukan json");
    pasang("/ringkasan");
    expect(keadaan()).toEqual({ "Pekerjaan rutin": false, Laporan: true, Pengaturan: false });
  });

  it("pilihan dari susunan sidebar sebelumnya (sebelum T95) tidak dipakai: mulai dari keadaan awal", () => {
    window.localStorage.setItem("mandalika:sidebar-kelompok", JSON.stringify({ Laporan: true, Operasional: true, Admin: true }));
    pasang("/");
    expect(keadaan()).toEqual({ "Pekerjaan rutin": false, Laporan: false, Pengaturan: false });
  });
});

describe("tanpa penyimpanan browser", () => {
  it("sidebar tetap berfungsi dengan keadaan awal, tanpa error", () => {
    const gagal = () => {
      throw new DOMException("Penyimpanan tidak tersedia", "SecurityError");
    };
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(gagal);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(gagal);

    pasang("/admin/libur");
    expect(keadaan()).toEqual({ "Pekerjaan rutin": false, Laporan: false, Pengaturan: true });
    klik(judul("Laporan"));
    expect(terbuka("Laporan")).toBe(true);
    klik(judul("Laporan"));
    expect(terbuka("Laporan")).toBe(false);
  });
});

describe("menu tarik layar kecil", () => {
  it("berperilaku sama: kelompok halaman aktif terbuka, judul membuka-tutup daftarnya", () => {
    pasang("/admin/impor/12");
    const tombolMenu = wadah.querySelector<HTMLButtonElement>('button[aria-label="Buka menu"]');
    klik(tombolMenu!);
    const sidebar = wadah.querySelector("aside")!;
    expect(sidebar.classList.contains("hidden")).toBe(false);
    expect(sidebar.contains(judul("Laporan"))).toBe(true);
    expect(keadaan()).toEqual({ "Pekerjaan rutin": true, Laporan: false, Pengaturan: false });

    klik(judul("Laporan"));
    expect(terbuka("Laporan")).toBe(true);
    // Membuka-tutup kelompok tidak menutup menu tarik.
    expect(sidebar.classList.contains("hidden")).toBe(false);
  });
});
