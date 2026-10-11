"use client";

import Form from "next/form";
import { useId } from "react";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { SEMUA } from "./filter";

function Pilihan({
  label,
  name,
  terapan,
  opsi,
}: {
  label: string;
  name: string;
  terapan: string;
  opsi: readonly { nilai: string; label: string }[];
}) {
  const id = useId();
  return (
    <div className="flex min-w-56 flex-col gap-2 font-semibold">
      <span id={id}>{label}</span>
      <Select name={name} defaultValue={terapan}>
        <SelectTrigger aria-labelledby={id}>
          <SelectValue>{opsi.find((o) => o.nilai === terapan)?.label}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {opsi.map((o) => (
            <SelectItem key={o.nilai} value={o.nilai}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * Filter riwayat rencana final (T63): tanggal kirim dan toko. Terapkan menulis pilihan ke URL (`?tanggal=YYYY-MM-DD&toko=<id>`);
 * halaman menyaring di server.
 */
export function FilterRencanaFinal({
  action,
  tanggalKirim,
  toko,
  terapan,
}: {
  action: string;
  /** Tanggal kirim yang punya rencana final, beserta teks tampilnya. */
  tanggalKirim: readonly { nilai: string; label: string }[];
  toko: readonly { id: number; nama: string }[];
  terapan: { tanggal: string; toko: string };
}) {
  return (
    <Form action={action} data-filter-rencana-final className="flex flex-wrap items-end gap-4">
      <Pilihan label="Tanggal kirim" name="tanggal" terapan={terapan.tanggal} opsi={[{ nilai: SEMUA, label: "Semua tanggal kirim" }, ...tanggalKirim]} />
      <Pilihan
        label="Toko"
        name="toko"
        terapan={terapan.toko}
        opsi={[{ nilai: SEMUA, label: "Semua toko" }, ...toko.map((t) => ({ nilai: String(t.id), label: t.nama }))]}
      />
      <Button type="submit" className="active:scale-95">
        Terapkan
      </Button>
    </Form>
  );
}
