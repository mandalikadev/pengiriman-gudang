"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const JEDA_MS = 3000;

/** Memuat ulang data halaman berkala selama impor masih diproses worker. Hanya membaca; tidak mengulang tulis. */
export function MuatUlangOtomatis() {
  const router = useRouter();
  useEffect(() => {
    const pewaktu = setInterval(() => router.refresh(), JEDA_MS);
    return () => clearInterval(pewaktu);
  }, [router]);
  return null;
}
