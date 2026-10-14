import { Inbox } from "lucide-react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { KeadaanKosong } from "./keadaan-kosong";

// T120 (DESIGN §11.6, §7, §6): keadaan kosong = ikon (20 px, stroke 2, wadah rounded-2xl bg-primary/10) + teks + satu
// kalimat langkah berikutnya.
describe("KeadaanKosong", () => {
  it("ikon dalam wadahnya, judul, lalu langkah berikutnya, dan isi tambahan setelahnya", () => {
    const html = renderToStaticMarkup(
      <KeadaanKosong ikon={Inbox} judul="Belum ada apa-apa." langkah="Lakukan sesuatu.">
        <button type="button">Tindakan</button>
      </KeadaanKosong>,
    );
    expect(html).toMatch(
      /^<div data-keadaan-kosong[^>]*><span aria-hidden="true" class="[^"]*rounded-2xl bg-primary\/10 text-primary[^"]*"><svg[^>]*stroke-width="2"[^>]*class="[^"]*lucide-inbox[^"]*size-5[^"]*"/,
    );
    expect(html).toMatch(/<p class="[^"]*font-semibold[^"]*">Belum ada apa-apa\.<\/p><p class="text-muted-foreground">Lakukan sesuatu\.<\/p><button/);
  });
});
