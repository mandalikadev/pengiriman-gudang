"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ComponentProps } from "react";

/** Id wadah Detail tanggal; tujuan gulir setelah tanggal dipilih di layar kecil. */
export const ID_DETAIL_TANGGAL = "detail-tanggal";

/** Layar < 1024 px: Detail tanggal berada di bawah kisi (DESIGN §11.8). */
const LAYAR_KECIL = "(max-width: 1023.98px)";

/**
 * Tautan satu tanggal di kisi Kalender. Di layar < 1024 px memilih tanggal menggulir ke Detail tanggal (DESIGN §11.8):
 * navigasi tanpa menggulir ke atas, lalu Detail tanggal dibawa ke layar. Di layar lebar perilakunya tautan biasa
 * (Detail tanggal tetap di kolom samping, §11.2).
 */
export function TautanTanggal({ href, onClick, ...props }: Omit<ComponentProps<typeof Link>, "href"> & { href: string }) {
  const router = useRouter();
  return (
    <Link
      href={href}
      {...props}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        if (!window.matchMedia(LAYAR_KECIL).matches) return;
        e.preventDefault();
        router.push(href, { scroll: false });
        document.getElementById(ID_DETAIL_TANGGAL)?.scrollIntoView({ block: "start" });
      }}
    />
  );
}
