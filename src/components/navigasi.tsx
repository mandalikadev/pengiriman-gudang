"use client";

import { LogOut, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useState } from "react";

import { keluar } from "@/app/keluar/aksi";
import { cn } from "@/lib/utils";

// DESIGN §6: item hanya untuk halaman yang sudah ada.
const itemUmum = [{ href: "/", label: "Beranda" }];
// Hanya untuk admin. Penyembunyian ini tambahan; halaman memeriksa peran di server (wajibAdmin).
const itemAdmin = [
  { href: "/admin/pengguna", label: "Pengguna" },
  { href: "/admin/gudang", label: "Gudang" },
  { href: "/admin/penugasan", label: "Penugasan" },
  { href: "/admin/impor", label: "Impor" },
];

const fokusTerlihat =
  "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

const bentukItem =
  "inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold transition-colors duration-300 ease-out";

function TautanNavigasi({
  href,
  label,
  aktif,
  onClick,
}: {
  href: string;
  label: string;
  aktif: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      aria-current={aktif ? "page" : undefined}
      onClick={onClick}
      className={cn(
        bentukItem,
        aktif ? "bg-primary/10 text-primary" : "text-foreground hover:bg-primary/10 hover:text-primary",
        fokusTerlihat,
      )}
    >
      {label}
    </Link>
  );
}

/** Form kecil agar tombol tetap berfungsi dengan keyboard (Enter/Spasi) dan sebelum JavaScript termuat. */
function TombolKeluar() {
  return (
    <form action={keluar}>
      <button
        type="submit"
        className={cn(bentukItem, "gap-2 text-foreground hover:bg-primary/10 hover:text-primary", fokusTerlihat)}
      >
        <LogOut aria-hidden strokeWidth={2} className="size-5" />
        Keluar
      </button>
    </form>
  );
}

export function Navigasi({
  tampilkanAdmin = false,
  sudahMasuk = false,
}: {
  tampilkanAdmin?: boolean;
  sudahMasuk?: boolean;
}) {
  const itemNavigasi = tampilkanAdmin ? [...itemUmum, ...itemAdmin] : itemUmum;
  const pathname = usePathname();
  const [menuTerbuka, setMenuTerbuka] = useState(false);
  const idMenu = useId();

  useEffect(() => {
    if (!menuTerbuka) return;
    function tutupDenganEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuTerbuka(false);
    }
    document.addEventListener("keydown", tutupDenganEscape);
    return () => document.removeEventListener("keydown", tutupDenganEscape);
  }, [menuTerbuka]);

  return (
    <header className="sticky top-4 z-40 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <nav
        aria-label="Navigasi utama"
        className="rounded-3xl border border-border/60 bg-card/80 px-3 py-2 shadow-soft backdrop-blur-md md:rounded-full"
      >
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-3">
            <span
              aria-hidden
              className="flex size-10 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground"
            >
              M
            </span>
            <span className="text-lg font-bold">MANDALIKA</span>
          </span>

          <ul className="hidden items-center gap-1 md:flex">
            {itemNavigasi.map((item) => (
              <li key={item.href}>
                <TautanNavigasi {...item} aktif={pathname === item.href} />
              </li>
            ))}
            {sudahMasuk ? (
              <li>
                <TombolKeluar />
              </li>
            ) : null}
          </ul>

          <button
            type="button"
            className={cn(
              "inline-flex size-11 items-center justify-center rounded-full text-primary transition-colors duration-300 ease-out hover:bg-primary/10 md:hidden",
              fokusTerlihat,
            )}
            aria-expanded={menuTerbuka}
            aria-controls={idMenu}
            aria-label={menuTerbuka ? "Tutup menu" : "Buka menu"}
            onClick={() => setMenuTerbuka((terbuka) => !terbuka)}
          >
            {menuTerbuka ? <X aria-hidden strokeWidth={2} className="size-5" /> : <Menu aria-hidden strokeWidth={2} className="size-5" />}
          </button>
        </div>

        <ul id={idMenu} hidden={!menuTerbuka} className="mt-2 flex flex-col gap-1 border-t border-border/60 pt-2 md:hidden">
          {itemNavigasi.map((item) => (
            <li key={item.href}>
              <TautanNavigasi {...item} aktif={pathname === item.href} onClick={() => setMenuTerbuka(false)} />
            </li>
          ))}
          {sudahMasuk ? (
            <li>
              <TombolKeluar />
            </li>
          ) : null}
        </ul>
      </nav>
    </header>
  );
}
