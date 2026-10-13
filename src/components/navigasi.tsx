"use client";

import { ChevronDown, LogOut, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

import { keluar } from "@/app/keluar/aksi";
import { cn } from "@/lib/utils";

import {
  bacaPilihanKelompok,
  langgananPilihanKelompok,
  tulisPilihanKelompok,
  uraiPilihanKelompok,
} from "./pilihan-kelompok-sidebar";

// T78 — DESIGN §6 ▶ Keputusan (2026-10-11): navigasi berupa sidebar berkelompok; susunan kelompok T97, T98 (2026-10-13)
// dan T105 (2026-10-13 sore).
// Desktop (≥ lg): sidebar tetap di kiri, lebar 240 px. Layar kecil: bar atas tipis + menu tarik rounded-3xl.
// Item hanya untuk halaman yang sudah ada dan boleh dibuka peran itu; penyembunyian ini tambahan,
// halaman tetap memeriksa sesi dan peran di server (wajibMasuk / wajibAdmin / wajibAksesPengirimanGudang /
// wajibGudangDenganHak).

/** Peran yang ditampilkan di sidebar (istilah CONTEXT.md). Operator = bukan admin, tetapi punya penugasan gudang. */
type PeranTampil = "admin" | "operator" | "viewer";

const labelPeran: Record<PeranTampil, string> = { admin: "Admin", operator: "Operator", viewer: "Viewer" };

/** `jadwal-toko` = hak `kelola-usulan-jadwal` di sedikitnya satu gudang (T98). */
type Akses = "masuk" | "pengiriman-gudang" | "jadwal-toko" | "admin";
type Item = { href: string; label: string; akses: Akses };
type Kelompok = { judul: string | null; item: Item[] };

// Urutan dan pengelompokan persis DESIGN §6 ▶ Keputusan (2026-10-13 sore, pemilik, T105): kelompok Pengiriman Gudang
// dihapus, Pengiriman Gudang masuk Pekerjaan rutin. Masa peralihan: Usulkan jadwal toko lalu Salin jadwal tepat setelah
// Pengiriman Gudang, selama halaman lama masih ada. Pilihan buka/tutup tersimpan untuk kelompok lama tidak dibaca lagi.
const kelompokMenu: Kelompok[] = [
  { judul: null, item: [{ href: "/", label: "Beranda", akses: "masuk" }] },
  {
    judul: "Pekerjaan rutin",
    item: [
      { href: "/admin/impor", label: "Impor penjualan", akses: "admin" },
      { href: "/admin/ranking", label: "Ranking pusat", akses: "admin" },
      { href: "/admin/jadwal", label: "Persetujuan jadwal", akses: "admin" },
      { href: "/pengiriman-gudang", label: "Pengiriman Gudang", akses: "pengiriman-gudang" },
      { href: "/usulan-jadwal", label: "Usulkan jadwal toko", akses: "jadwal-toko" },
      { href: "/salin-jadwal", label: "Salin jadwal ke beberapa toko", akses: "jadwal-toko" },
    ],
  },
  {
    judul: "Laporan",
    item: [
      { href: "/ringkasan", label: "Ringkasan", akses: "masuk" },
      { href: "/kalender", label: "Kalender", akses: "masuk" },
    ],
  },
  {
    judul: "Data Master",
    item: [
      { href: "/admin/keluarga-aroma", label: "Keluarga aroma", akses: "admin" },
      { href: "/admin/pemetaan-produk", label: "Pemetaan produk", akses: "admin" },
      { href: "/admin/alias-stok", label: "Alias nama stok", akses: "admin" },
      { href: "/admin/libur", label: "Libur", akses: "admin" },
    ],
  },
  {
    judul: "Pengaturan",
    item: [
      { href: "/admin/gudang", label: "Gudang", akses: "admin" },
      { href: "/admin/pengguna", label: "Pengguna", akses: "admin" },
      { href: "/admin/penugasan", label: "Penugasan", akses: "admin" },
    ],
  },
];

/** Menyaring item yang boleh dibuka; kelompok tanpa item tidak ditampilkan. */
function kelompokUntuk(bolehDibuka: (akses: Akses) => boolean): Kelompok[] {
  return kelompokMenu.flatMap((kelompok): Kelompok[] => {
    const item = kelompok.item.filter((i) => bolehDibuka(i.akses));
    return item.length > 0 ? [{ judul: kelompok.judul, item }] : [];
  });
}

/** Halaman aktif termasuk sub-halamannya (`/admin/impor/12` menandai Impor penjualan). Beranda hanya persis `/`. */
function halamanAktif(pathname: string, href: string): boolean {
  return pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
}

const fokusTerlihat =
  "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card";

const bentukItem =
  "flex min-h-11 w-full items-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors duration-300 ease-out";

const bentukTombolIkon =
  "inline-flex size-11 shrink-0 items-center justify-center rounded-full text-primary transition-colors duration-300 ease-out hover:bg-primary/10";

function Logo() {
  return (
    <span className="flex items-center gap-3">
      <span
        aria-hidden
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground"
      >
        M
      </span>
      <span className="text-lg font-bold">MANDALIKA</span>
    </span>
  );
}

function TautanNavigasi({ item, aktif, onClick }: { item: Item; aktif: boolean; onClick: () => void }) {
  return (
    <Link
      href={item.href}
      aria-current={aktif ? "page" : undefined}
      onClick={onClick}
      className={cn(
        bentukItem,
        aktif ? "bg-accent text-accent-foreground" : "text-foreground hover:bg-primary/10 hover:text-primary",
        fokusTerlihat,
      )}
    >
      {item.label}
    </Link>
  );
}

function DaftarItem({ item, pathname, onPilih }: { item: Item[]; pathname: string; onPilih: () => void }) {
  return (
    <ul className="flex flex-col gap-0.5">
      {item.map((i) => (
        <li key={i.href}>
          <TautanNavigasi item={i} aktif={halamanAktif(pathname, i.href)} onClick={onPilih} />
        </li>
      ))}
    </ul>
  );
}

/** T81: judul kelompok berupa tombol buka-tutup (DESIGN §6 ▶ Keputusan 2026-10-11, UAT). */
function KelompokNavigasi({
  kelompok,
  idDasar,
  pathname,
  terbuka,
  onAlih,
  onPilih,
}: {
  kelompok: Kelompok;
  idDasar: string;
  pathname: string;
  terbuka: boolean;
  onAlih: () => void;
  onPilih: () => void;
}) {
  if (kelompok.judul === null) return <DaftarItem item={kelompok.item} pathname={pathname} onPilih={onPilih} />;
  const idDaftar = `${idDasar}-daftar`;
  return (
    <section aria-labelledby={idDasar}>
      <button
        id={idDasar}
        type="button"
        data-kelompok={kelompok.judul}
        aria-expanded={terbuka}
        aria-controls={idDaftar}
        onClick={onAlih}
        className={cn(
          bentukItem,
          // `group`: ikon ChevronDown berputar mengikuti aria-expanded tombol ini.
          "group justify-between text-xs font-bold tracking-wide text-muted-foreground uppercase hover:bg-primary/10 hover:text-primary",
          fokusTerlihat,
        )}
      >
        {kelompok.judul}
        <ChevronDown
          aria-hidden
          strokeWidth={2}
          className="size-5 transition-transform duration-300 ease-out group-aria-expanded:rotate-180 motion-reduce:transition-none"
        />
      </button>
      <div id={idDaftar} hidden={!terbuka}>
        <DaftarItem item={kelompok.item} pathname={pathname} onPilih={onPilih} />
      </div>
    </section>
  );
}

/** Form kecil agar tombol tetap berfungsi dengan keyboard (Enter/Spasi) dan sebelum JavaScript termuat. */
function TombolKeluar() {
  return (
    <form action={keluar}>
      <button
        type="submit"
        className={cn(bentukItem, "text-foreground hover:bg-primary/10 hover:text-primary", fokusTerlihat)}
      >
        <LogOut aria-hidden strokeWidth={2} className="size-5" />
        Keluar
      </button>
    </form>
  );
}

/**
 * Kerangka aplikasi: sidebar navigasi (desktop) atau bar atas + menu tarik (layar kecil), dengan isi halaman di sebelah
 * kanan sidebar. Tanpa pengguna yang masuk, dan di halaman masuk, hanya isi halaman yang ditampilkan.
 */
export function Navigasi({
  pengguna,
  tampilkanPengirimanGudang,
  tampilkanJadwalToko,
  children,
}: {
  pengguna: { nama: string; peran: PeranTampil } | null;
  tampilkanPengirimanGudang: boolean;
  /** Punya hak `kelola-usulan-jadwal` di sedikitnya satu gudang (T98). */
  tampilkanJadwalToko: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [menuTerbuka, setMenuTerbuka] = useState(false);
  const idSidebar = useId();
  const tombolMenuRef = useRef<HTMLButtonElement>(null);
  const tombolTutupRef = useRef<HTMLButtonElement>(null);
  const pernahTerbuka = useRef(false);
  const teksPilihan = useSyncExternalStore(langgananPilihanKelompok, bacaPilihanKelompok, () => null);
  // Kelompok halaman aktif yang ditutup pengguna selama berada di halaman ini; direset setiap kali pathname berubah
  // (Navigasi hidup di root layout, jadi state-nya bertahan selama navigasi klien).
  const [ditutupDiHalaman, setDitutupDiHalaman] = useState<readonly string[]>([]);
  const [pathnameTerakhir, setPathnameTerakhir] = useState(pathname);
  if (pathname !== pathnameTerakhir) {
    setPathnameTerakhir(pathname);
    setDitutupDiHalaman([]);
  }

  useEffect(() => {
    if (!menuTerbuka) return;
    function tutupDenganEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuTerbuka(false);
    }
    document.addEventListener("keydown", tutupDenganEscape);
    return () => document.removeEventListener("keydown", tutupDenganEscape);
  }, [menuTerbuka]);

  // Fokus mengikuti menu tarik: masuk ke tombol tutup saat dibuka, kembali ke tombol menu saat ditutup.
  useEffect(() => {
    if (menuTerbuka) {
      pernahTerbuka.current = true;
      tombolTutupRef.current?.focus();
    } else if (pernahTerbuka.current) {
      tombolMenuRef.current?.focus();
    }
  }, [menuTerbuka]);

  if (pengguna === null || pathname === "/masuk") return <>{children}</>;

  const bolehDibuka = (akses: Akses) => {
    if (akses === "masuk") return true;
    if (akses === "admin") return pengguna.peran === "admin";
    return akses === "jadwal-toko" ? tampilkanJadwalToko : tampilkanPengirimanGudang;
  };
  const kelompok = kelompokUntuk(bolehDibuka);
  const tutup = () => setMenuTerbuka(false);

  // Keadaan awal: kelompok berisi halaman aktif terbuka, lainnya tertutup; pilihan tersimpan berlaku untuk kelompok lain.
  // Kelompok halaman aktif selalu terbuka saat halaman dibuka, walaupun sebelumnya ditutup.
  const pilihan = uraiPilihanKelompok(teksPilihan);
  const ditutup = pathname === pathnameTerakhir ? ditutupDiHalaman : [];
  const berisiHalamanAktif = (k: Kelompok) => k.item.some((i) => halamanAktif(pathname, i.href));
  const terbuka = (k: Kelompok) => {
    if (k.judul === null) return true;
    return berisiHalamanAktif(k) ? !ditutup.includes(k.judul) : pilihan[k.judul] === true;
  };
  const alih = (k: Kelompok) => {
    const judul = k.judul;
    if (judul === null) return;
    const buka = !terbuka(k);
    if (berisiHalamanAktif(k)) {
      setDitutupDiHalaman(buka ? ditutup.filter((j) => j !== judul) : [...ditutup, judul]);
    }
    tulisPilihanKelompok(judul, buka);
  };

  return (
    <>
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-border/60 bg-card/80 px-4 py-2 backdrop-blur-md lg:hidden">
        <Logo />
        <button
          ref={tombolMenuRef}
          type="button"
          className={cn(bentukTombolIkon, fokusTerlihat)}
          aria-expanded={menuTerbuka}
          aria-controls={idSidebar}
          aria-label={menuTerbuka ? "Tutup menu" : "Buka menu"}
          onClick={() => setMenuTerbuka((terbuka) => !terbuka)}
        >
          {menuTerbuka ? <X aria-hidden strokeWidth={2} className="size-5" /> : <Menu aria-hidden strokeWidth={2} className="size-5" />}
        </button>
      </header>

      {menuTerbuka ? <div aria-hidden className="fixed inset-0 z-40 bg-foreground/20 lg:hidden" onClick={tutup} /> : null}

      <aside
        id={idSidebar}
        className={cn(
          // Layar kecil: menu tarik mengambang (rounded-3xl) di atas isi halaman.
          "fixed inset-4 z-50 flex-col gap-4 overflow-y-auto rounded-3xl border border-border/60 bg-card p-4 shadow-float",
          // Desktop: sidebar tetap di kiri, lebar 240 px, setinggi layar.
          "lg:inset-auto lg:inset-y-0 lg:left-0 lg:z-30 lg:w-60 lg:rounded-none lg:border-y-0 lg:border-l-0 lg:border-r lg:shadow-none",
          menuTerbuka ? "flex" : "hidden lg:flex",
        )}
      >
        <div className="flex items-center justify-between gap-2 px-2">
          <Logo />
          <button
            ref={tombolTutupRef}
            type="button"
            className={cn(bentukTombolIkon, "lg:hidden", fokusTerlihat)}
            aria-label="Tutup menu"
            onClick={tutup}
          >
            <X aria-hidden strokeWidth={2} className="size-5" />
          </button>
        </div>

        <nav aria-label="Navigasi utama" className="flex flex-1 flex-col gap-2">
          {kelompok.map((k, i) => (
            <KelompokNavigasi
              key={k.judul ?? "beranda"}
              kelompok={k}
              idDasar={`${idSidebar}-${i}`}
              pathname={pathname}
              terbuka={terbuka(k)}
              onAlih={() => alih(k)}
              onPilih={tutup}
            />
          ))}
        </nav>

        <div className="flex flex-col gap-2 border-t border-border/60 pt-4">
          <div className="px-4 text-sm">
            <p className="truncate font-semibold text-foreground">{pengguna.nama}</p>
            <p className="text-muted-foreground">{labelPeran[pengguna.peran]}</p>
          </div>
          <TombolKeluar />
        </div>
      </aside>

      <div className="lg:pl-60">{children}</div>
    </>
  );
}
