"use client";

import Form from "next/form";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

const MAKS_BULAN = 12;

/**
 * Pemilih 1–12 bulan laporan (PRD A2). Mencentang bulan hanya mengubah pilihan yang sedang diedit; hasil baru
 * berubah setelah Terapkan, yang menulis pilihan ke URL (`?bulan=YYYY-MM&bulan=…`).
 */
export function PilihanBulan({
  bulanTersedia,
  terapan,
}: {
  bulanTersedia: { kode: string; label: string }[];
  /** Bulan yang sedang dipakai (dari URL). */
  terapan: string[];
}) {
  const id = useId();
  const [terpilih, setTerpilih] = useState(() => new Set(terapan.filter((b) => bulanTersedia.some((t) => t.kode === b))));
  const jumlah = terpilih.size;
  const sah = jumlah >= 1 && jumlah <= MAKS_BULAN;

  function ubah(kode: string, centang: boolean) {
    setTerpilih((lama) => {
      const baru = new Set(lama);
      if (centang) baru.add(kode);
      else baru.delete(kode);
      return baru;
    });
  }

  return (
    <Card>
      <Form action="/ringkasan" className="flex flex-col gap-4">
        <CardHeader>
          <CardTitle id={`${id}-judul`}>Bulan laporan</CardTitle>
          <CardDescription>Pilih 1–12 bulan, boleh tidak berurutan, lalu tekan Terapkan.</CardDescription>
        </CardHeader>
        <CardContent>
          <fieldset aria-labelledby={`${id}-judul`} className="flex flex-wrap gap-2">
            {bulanTersedia.map((b) => (
              <label
                key={b.kode}
                className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-input bg-card px-4 font-semibold transition-colors duration-300 ease-out hover:bg-primary/10 has-[:checked]:border-primary has-[:checked]:bg-accent has-[:checked]:text-accent-foreground has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/40 has-[:focus-visible]:ring-offset-2"
              >
                <input
                  type="checkbox"
                  name="bulan"
                  value={b.kode}
                  checked={terpilih.has(b.kode)}
                  onChange={(e) => ubah(b.kode, e.target.checked)}
                  className="size-4 accent-primary outline-none"
                />
                {b.label}
              </label>
            ))}
          </fieldset>
        </CardContent>
        <CardFooter className="flex-wrap">
          <Button type="submit" disabled={!sah}>
            Terapkan
          </Button>
          <span aria-live="polite" className={sah ? "text-muted-foreground" : "text-foreground"}>
            {jumlah === 0
              ? "Belum ada bulan dipilih."
              : jumlah > MAKS_BULAN
                ? `${jumlah} bulan dipilih. Pilih paling banyak ${MAKS_BULAN} bulan.`
                : `${jumlah} bulan dipilih.`}
          </span>
        </CardFooter>
      </Form>
    </Card>
  );
}
