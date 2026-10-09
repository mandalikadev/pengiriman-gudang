# Sistem Desain — "Organic" untuk dashboard operasional

Sumber: gaya *Organic / Natural* dari designprompts.dev, **diadaptasi** untuk aplikasi kerja harian yang penuh tabel, angka, dan form. Berkas ini satu-satunya acuan desain. Teks sumber aslinya ditulis untuk landing page dan tidak dipakai langsung.

Prinsipnya: **hangat di permukaan, presisi di angka.** Rasa kertas, warna tanah, dan bentuk lembut memberi suasana. Keterbacaan angka, status, dan kepadatan tabel selalu menang di area kerja.

## 1. Dua zona

Setiap layar termasuk salah satu zona. Aturan visualnya berbeda.

| | **Zona suasana** | **Zona kerja** |
|---|---|---|
| Contoh | Halaman masuk, beranda, keadaan kosong ("belum ada impor"), layar berhasil besar (impor aktif, rencana final) | Tabel laporan, tinjau impor, kalender, form stok, jadwal, halaman admin |
| Blob blur latar | Boleh (maks. 2, `blur-3xl`, opacity rendah) | Tidak dipakai |
| Radius asimetris (`rounded-tl-[4rem]`, blob mask) | Boleh | Tidak dipakai; radius konsisten agar mudah dipindai |
| Judul Fraunces besar | `text-4xl md:text-5xl` | Judul halaman `text-2xl md:text-3xl` |
| Hover | `hover:scale-105`, kartu `hover:-translate-y-1` | Perubahan warna/bayangan saja; tanpa scale dan rotasi (mencegah tabel bergoyang) |
| Jarak | `py-16`–`py-24` | `py-6`–`py-8`, `gap-4`–`gap-6` |

## 2. Token warna

Token ditulis sekali sebagai CSS variable (format tema shadcn/ui) dan dipakai lewat kelas Tailwind semantik (`bg-primary`, `text-muted-foreground`). Kode komponen tidak memakai nilai hex langsung.

| Token | Nilai | Pakai untuk | Kontras |
|---|---|---|---|
| `background` | `#FDFCF8` | Latar halaman (kertas) | — |
| `foreground` | `#2C2C24` | Teks utama | 13,7 : 1 |
| `card` | `#FEFEFA` | Kartu, panel, tabel | — |
| `primary` | `#5D7052` (moss) | Tombol utama, tautan, ikon, fokus | 5,2 : 1 di latar |
| `primary-foreground` | `#F3F4F1` | Teks di atas moss | 4,9 : 1 |
| `secondary` | `#946538` (clay tua) | Tombol sekunder, teks aksen | 4,9 : 1 di latar; putih di atasnya 5,0 : 1 |
| `secondary-foreground` | `#FFFFFF` | Teks di atas clay tua | — |
| `clay` | `#C18C5D` | **Dekorasi saja**: blob, garis ilustrasi, isian grafik | 2,9 : 1 — tidak untuk teks |
| `accent` | `#E6DCCD` (pasir) | Latar baris terpilih, chip | — |
| `accent-foreground` | `#4A4A40` | Teks di atas pasir | 6,6 : 1 |
| `muted` | `#F0EBE5` (batu) | Latar header tabel, area sekunder | — |
| `muted-foreground` | `#6B6B60` | Teks sekunder, label, keterangan | 5,3 : 1 di latar; 4,6 : 1 di muted |
| `border` | `#DED8CF` | Garis pemisah dan bingkai kartu (dekoratif) | — |
| `input` | `#948C7D` | Bingkai input, checkbox, select | 3,2 : 1 (syarat komponen UI ≥ 3 : 1) |
| `ring` | `#5D7052` | Cincin fokus | — |
| `destructive` | `#A85448` | Error, tombol hapus/batalkan | 5,1 : 1 |
| `warning` | `#8A6A1F` (oker) | Peringatan | 4,9 : 1 |
| `info` | `#4F6475` (batu sungai) | Informasi, sedang diproses | 6,0 : 1 |
| `success` | `#4A5C40` (moss tua) | Berhasil, aktif, final | 7,1 : 1 |

> ▶ Keputusan (2026-10-09): teks sekunder di atas latar `accent` (misalnya baris tabel terpilih) memakai `accent-foreground`, **bukan** `muted-foreground`. `muted-foreground` di atas `accent` hanya ±3,97 : 1, di bawah 4,5 : 1. Ini juga berlaku untuk "Total penjualan mentah" (§8) pada baris terpilih.

**Koreksi terhadap sumber.** Pada sumber, teks putih di atas terracotta `#C18C5D` (2,9 : 1), teks terracotta (2,9 : 1), dan muted `#78786C` (4,4 : 1) tidak memenuhi WCAG AA, padahal sumber mengklaim lolos. Bingkai input `#DED8CF` (1,4 : 1) juga tidak terlihat sebagai batas kontrol. Token di atas adalah perbaikannya. Test kontras otomatis menjaga angka-angka ini.

Hanya mode terang (ADR-0010).

## 3. Tipografi

- **Fraunces** (600–700): hanya untuk judul h1–h3 dan angka sorotan di beranda. Bukan untuk isi tabel atau label form.
- **Nunito** (400, 600, 700): semua teks lain, termasuk angka di tabel.
- Keduanya dimuat dengan `next/font/google`, yang meng-*host* sendiri saat build (tanpa permintaan ke CDN saat runtime).
- **Angka**: digit bawaan Nunito sudah sama lebar (sudah diperiksa: setiap digit lebarnya 600 unit), jadi kolom angka rata dengan sendirinya. Tetap tambahkan kelas `tabular-nums`. Angka di tabel rata kanan. Format `id-ID` (titik sebagai pemisah ribuan).
- Skala 1,25. Teks dasar `text-sm` di zona kerja, `text-base` di zona suasana.

## 4. Bentuk, bayangan, tekstur

- Kartu dan panel: `rounded-3xl`, bingkai `border-border/60`, bayangan `shadow-soft`.
- Tabel: wadah `rounded-2xl` dengan `overflow-x-auto`. Baris dan sel bersudut lurus (keterbacaan menang). Header tabel `bg-muted`.
- Tombol: `rounded-full` (pil).
- Input di form tunggal: `rounded-full`, `h-12`. Input di dalam tabel (misalnya isian stok): `rounded-xl`, `h-9`.
- Bayangan selalu berwarna, tidak pernah hitam:
  - `shadow-soft`: `0 4px 20px -2px rgba(93,112,82,0.15)`
  - `shadow-float`: `0 10px 40px -10px rgba(193,140,93,0.2)`
- **Tekstur kertas**: satu lapisan noise global, `position: fixed`, `pointer-events: none`, `mix-blend-mode: multiply`, opacity 3%. Satu lapisan saja untuk seluruh aplikasi; tidak ditambah per bagian.

## 5. Gerak

- `transition-colors` atau `transition-all`, durasi 300 ms, `ease-out`.
- Zona suasana: tombol utama `hover:scale-105 active:scale-95`; kartu `hover:-translate-y-1`.
- Zona kerja: hanya perubahan warna dan bayangan; `active:scale-95` boleh pada tombol di luar tabel.
- Hormati `prefers-reduced-motion`: semua scale dan translate dimatikan.

## 6. Komponen dasar (shadcn/ui, diberi tema)

| Komponen | Varian |
|---|---|
| Button | `default` (moss), `secondary` (clay tua), `outline` (bingkai moss 2px), `ghost`, `destructive`. Ukuran `sm` h-9, `default` h-10, `lg` h-12 (zona suasana). |
| Input / Select | Lihat §4. Fokus: `ring-2 ring-ring/40 ring-offset-2`. |
| Card | Lihat §4. |
| Table | Lihat §4. Kolom angka rata kanan dengan `tabular-nums`. |
| Badge status | Lihat §7. |
| Pesan status form | Komponen tetap untuk lima keadaan simpan dari CODING_STANDARDS. Diletakkan dekat bagian yang dikerjakan. |
| Navigasi | Bar pil mengambang, `sticky top-4`, `bg-card/80 backdrop-blur-md`, logo dalam lingkaran moss. Item hanya untuk halaman yang sudah ada. Di layar kecil menjadi menu tarik `rounded-3xl`. |

Ikon: lucide-react, stroke 2. Ukuran 20 px di zona kerja dan 28 px di zona suasana. Ikon fitur diletakkan dalam wadah `rounded-2xl bg-primary/10`.

## 7. Bahasa visual status

Status **selalu** tampil sebagai ikon + teks. Warna hanya penguat, tidak pernah satu-satunya penanda.

| Status domain | Token | Ikon lucide |
|---|---|---|
| Aktif, Final, Berhasil disimpan | `success` | `CircleCheck` |
| Sedang diproses, Sedang menyimpan | `info` | `LoaderCircle` (berputar; diam jika reduced-motion) |
| Siap ditinjau, Draft | `primary` | `ClipboardList` |
| Peringatan impor, Parsial, Perlu dihitung ulang | `warning` | `TriangleAlert` |
| Error impor, Gagal, Stok negatif | `destructive` | `CircleX` |
| Tersimpan tetapi gagal memuat ulang | `warning` | `RefreshCcw` + teks "Perubahan tersimpan. Muat ulang halaman untuk melihatnya." |
| Belum diketahui (stok belum diisi), Tidak tersedia | `muted-foreground` | `CircleDashed`; tampil "—", **bukan 0** |
| Manual (display/kertas tester), Diarsipkan | `muted-foreground` | `Hand` / `Archive` |
| Belum disimpan (form) | `muted-foreground` | `PencilLine` + teks "Ada perubahan yang belum disimpan" |

Kolom "Token" menentukan warna **ikon** dan latar badge, bukan warna teks. Teks badge memakai `foreground`.

> ▶ Keputusan (2026-10-09, T07): latar badge memakai token status dengan opacity **10%**, ikon memakai warna token status, dan **teks memakai `foreground`** supaya kontras teks tetap ≥ 4,5 : 1 di atas latar badge maupun baris terpilih. Keadaan "Belum disimpan" memakai `muted-foreground` + `PencilLine` dengan teks "Ada perubahan yang belum disimpan".

## 8. Menampilkan angka dan asalnya

- Rata-rata dan total penjualan mentah berbeda label **dan** bentuk. Rata-rata diberi label "Rata-rata …". Total mentah diberi label "Total penjualan mentah" dalam teks `muted-foreground`. Di baris terpilih (latar `accent`) teksnya memakai `accent-foreground` (lihat ▶ Keputusan di §2).
- Penelusuran angka memperlihatkan perhitungannya: `Σ 2 ÷ 4 minggu = 0,5 → dibulatkan ke atas 1`. Lalu daftar sumber: `JUNI (S)!H4 · Rabu, 03-06-2026 · 1`.
- Nol teramati ditampilkan `0`. Tidak tersedia ditampilkan `—` dengan keterangan saat disorot.

## 9. Tata letak dan responsif

- Wadah aplikasi `max-w-7xl mx-auto px-4 sm:px-6 lg:px-8`. Halaman detail dan form tunggal memakai `max-w-3xl`.
- Kerja utama dilakukan di laptop/desktop. Di layar kecil semua layar tetap bisa dibaca; tabel menggulir di dalam wadahnya sendiri, dan grid runtuh menjadi satu kolom.
- Target sentuh minimal 44 px untuk kontrol utama. Input di dalam tabel (h-9) dikompensasi oleh area klik sel.

## 10. Yang tidak diambil dari sumber

Bagian sumber untuk landing page tidak dipakai: hero, harga, testimoni, blog, FAQ, gambar berotasi, konektor SVG, `py-32`, latar seksi berwarna penuh, dan rotasi saat hover. Jika ada layar baru yang terasa membutuhkannya, tanyakan pemilik.
