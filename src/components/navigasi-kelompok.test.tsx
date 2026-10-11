// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tiruan = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => tiruan.pathname }));
vi.mock("@/app/keluar/aksi", () => ({ keluar: async () => undefined }));

import { Navigasi } from "./navigasi";

// T81 — DESIGN §6 ▶ Keputusan (2026-10-11, UAT): kelompok Laporan, Operasional, dan Admin bisa dibuka-tutup.

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
  return { Laporan: terbuka("Laporan"), Operasional: terbuka("Operasional"), Admin: terbuka("Admin") };
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
    const tombol = judul("Operasional");
    expect(tombol.tagName).toBe("BUTTON");
    expect(tombol.getAttribute("type")).toBe("button");
    expect(tombol.textContent).toContain("Operasional");
    const ikon = tombol.querySelector("svg");
    expect(ikon?.getAttribute("class")).toContain("lucide-chevron-down");
    // Putaran mengikuti aria-expanded tombol (group-aria-expanded), jadi selalu sejalan dengan keadaannya.
    expect(tombol.classList.contains("group")).toBe(true);
    expect(ikon?.getAttribute("class")).toContain("group-aria-expanded:rotate-180");
    expect(ikon?.getAttribute("class")).not.toMatch(/(^|\s)rotate-180/);
  });

  it("Beranda tetap item tunggal; Data dan Organisasi tetap subjudul di dalam Admin, bukan tombol", () => {
    pasang("/");
    expect(wadah.querySelectorAll("button[data-kelompok]")).toHaveLength(3);
    expect(wadah.querySelector('a[href="/"]')?.closest("[hidden]")).toBeNull();
    klik(judul("Admin"));
    const admin = daftar("Admin");
    expect(admin.querySelector('p[data-kelompok="Data"]')).not.toBeNull();
    expect(admin.querySelector('p[data-kelompok="Organisasi"]')).not.toBeNull();
    expect(admin.querySelector('a[href="/admin/impor"]')).not.toBeNull();
    expect(admin.querySelector('a[href="/admin/jadwal"]')).not.toBeNull();
  });
});

describe("keadaan awal", () => {
  it("di beranda semua kelompok tertutup", () => {
    pasang("/");
    expect(keadaan()).toEqual({ Laporan: false, Operasional: false, Admin: false });
  });

  it("halaman /kalender: Laporan terbuka, lainnya tertutup", () => {
    pasang("/kalender");
    expect(keadaan()).toEqual({ Laporan: true, Operasional: false, Admin: false });
  });

  it("sub-halaman /admin/impor/12: Admin terbuka, lainnya tertutup", () => {
    pasang("/admin/impor/12");
    expect(keadaan()).toEqual({ Laporan: false, Operasional: false, Admin: true });
  });

  it("sub-halaman /pengiriman-gudang/3/rencana-final/7: Operasional terbuka, lainnya tertutup", () => {
    pasang("/pengiriman-gudang/3/rencana-final/7");
    expect(keadaan()).toEqual({ Laporan: false, Operasional: true, Admin: false });
  });
});

describe("pilihan diingat di browser", () => {
  it("pilihan buka/tutup bertahan setelah pindah halaman", () => {
    pasang("/");
    klik(judul("Operasional"));
    tampilkan("/ringkasan");
    expect(keadaan()).toEqual({ Laporan: true, Operasional: true, Admin: false });
  });

  it("pilihan bertahan setelah halaman dimuat ulang (komponen dipasang ulang)", () => {
    pasang("/");
    klik(judul("Admin"));
    lepas();
    pasang("/");
    expect(keadaan()).toEqual({ Laporan: false, Operasional: false, Admin: true });
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
    klik(judul("Admin"));
    expect(terbuka("Admin")).toBe(false);
    klik(judul("Admin"));
    expect(terbuka("Admin")).toBe(true);
  });

  it("isi penyimpanan yang rusak diabaikan: kembali ke keadaan awal", () => {
    window.localStorage.setItem("mandalika:sidebar-kelompok", "{bukan json");
    pasang("/ringkasan");
    expect(keadaan()).toEqual({ Laporan: true, Operasional: false, Admin: false });
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
    expect(keadaan()).toEqual({ Laporan: false, Operasional: false, Admin: true });
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
    expect(keadaan()).toEqual({ Laporan: false, Operasional: false, Admin: true });

    klik(judul("Laporan"));
    expect(terbuka("Laporan")).toBe(true);
    // Membuka-tutup kelompok tidak menutup menu tarik.
    expect(sidebar.classList.contains("hidden")).toBe(false);
  });
});
