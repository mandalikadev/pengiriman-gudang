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
  > ▶ Revisi (2026-10-13 sore, pemilik): tabel panjang mendapat tinggi terbatas, header menempel, dan kolom identitas menempel; tabel di dalam kartu tanpa bingkai kedua. Lihat §11.1.
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

> ▶ Keputusan (2026-10-11): navigasi memakai **sidebar**, menggantikan bar pil mengambang (baris "Navigasi" di atas).
> - **Desktop (≥ 1024 px):** sidebar tetap di kiri, lebar ±240 px, latar `card`, logo dalam lingkaran moss dan "MANDALIKA" di atas. Item aktif memakai latar `accent` + `accent-foreground` dan `aria-current="page"`. Di bawah: nama pengguna, peran, lalu "Keluar".
> - **Kelompok menu:** Beranda; **Laporan** (Ringkasan, Kalender); **Operasional** (Pengiriman Gudang); **Admin**, hanya untuk admin, dengan subkelompok Data (Impor, Ranking, Keluarga aroma, Pemetaan produk, Libur) dan Organisasi (Gudang, Pengguna, Penugasan, Persetujuan jadwal).
> - **Layar < 1024 px:** bar atas tipis berisi logo dan tombol menu; tombol membuka sidebar sebagai menu tarik `rounded-3xl`.
> - Item tetap hanya untuk halaman yang sudah ada dan boleh dibuka peran itu. Konten utama berada di sebelah kanan sidebar; lebar konten tetap mengikuti §9.

> ▶ Keputusan (2026-10-11, UAT): kelompok **Laporan**, **Operasional**, dan **Admin** di sidebar bisa **dibuka-tutup (dropdown)**.
> - Judul kelompok menjadi tombol dengan ikon `ChevronDown` (berputar saat terbuka), memakai `aria-expanded` dan `aria-controls`. Beranda tetap item tunggal. Data dan Organisasi tetap subjudul di dalam Admin, tidak dilipat terpisah.
> - Keadaan awal: kelompok yang berisi halaman aktif terbuka; kelompok lain tertutup. Pilihan buka/tutup pengguna diingat di browser itu; kelompok yang berisi halaman aktif selalu terbuka.
> - Berlaku sama di sidebar desktop dan menu tarik layar < 1024 px.

> ▶ Keputusan (2026-10-12, UAT ketiga): susunan sidebar **mengikuti urutan kerja**, menggantikan daftar kelompok pada keputusan 2026-10-11 di atas. Perilaku buka-tutup tetap.
> - **Beranda** (item tunggal).
> - **Pekerjaan rutin**: Impor penjualan (admin), Ranking pusat (admin), Persetujuan jadwal (admin), Pengiriman Gudang (admin dan operator). Untuk operator kelompok ini hanya berisi Pengiriman Gudang.
> - **Laporan**: Ringkasan, Kalender.
> - **Pengaturan** (hanya admin), dengan subjudul **Data master** (Keluarga aroma, Pemetaan produk, Alias nama stok, Libur) dan **Organisasi** (Gudang, Pengguna, Penugasan).
> - Urutan item di dalam kelompok sesuai urutan di atas. Aturan visibilitas per peran tidak berubah. Viewer melihat Beranda dan Laporan saja.

> ▶ Keputusan (2026-10-13, pemilik): **Data Master** menjadi kelompok sendiri dan pekerjaan jadwal toko mendapat halaman sendiri yang dibuka dari sidebar, menggantikan daftar kelompok pada keputusan 2026-10-12 di atas. Perilaku buka-tutup tetap.
> - **Beranda** (item tunggal).
> - **Pekerjaan rutin**: Impor penjualan (admin), Ranking pusat (admin), Persetujuan jadwal (admin), Usulkan jadwal toko (pengguna dengan hak `kelola-usulan-jadwal` di sedikitnya satu gudang).
> - **Pengiriman Gudang**: Pengiriman Gudang (admin dan operator), Salin jadwal ke beberapa toko (pengguna dengan hak `kelola-usulan-jadwal` di sedikitnya satu gudang).
> - **Laporan**: Ringkasan, Kalender.
> - **Data Master** (hanya admin): Keluarga aroma, Pemetaan produk, Alias nama stok, Libur.
> - **Pengaturan** (hanya admin): Gudang, Pengguna, Penugasan, tanpa subjudul.
> - Form "Usulkan jadwal toko" (di gudang Pusat: "Atur jadwal toko") dan "Salin jadwal ke beberapa toko" pindah dari halaman Pengiriman Gudang ke halaman masing-masing. Pengguna yang berhak di lebih dari satu gudang memilih gudang dulu; yang berhak di satu gudang langsung masuk ke form gudang itu. Halaman Pengiriman Gudang tetap menampilkan tabel jadwal aktif per toko, ditambah tautan ke kedua halaman itu untuk pengguna yang berhak.
> - Urutan item di dalam kelompok sesuai urutan di atas. Kelompok tanpa item yang boleh dibuka tidak ditampilkan. Viewer melihat Beranda dan Laporan saja.

> ▶ Keputusan (2026-10-13 sore, pemilik): susunan sidebar baru yang menggantikan keputusan 2026-10-13 di atas. Kelompok **Pengiriman Gudang** dihapus. Perilaku buka-tutup tetap. Susunan ini mengikuti PRD A3 dan A5 ▶ Revisi 2026-10-13: jadwal tetap diatur admin, operator mengusulkan pengiriman di luar jadwal, dan admin mengelola gudang serta toko.
> - **Beranda** (item tunggal).
> - **Pekerjaan rutin**, berurutan:
>   - Impor penjualan (admin)
>   - Ranking pusat (admin)
>   - Persetujuan jadwal (admin)
>   - Pengiriman Gudang (admin dan operator)
>   - Kirim di luar jadwal (pengguna dengan hak `kelola-usulan-jadwal` di sedikitnya satu gudang)
>   - Untuk operator, kelompok ini berisi Pengiriman Gudang dan Kirim di luar jadwal.
> - **Laporan**: Ringkasan, Kalender.
> - **Data Master** (hanya admin): Jadwal toko, Keluarga aroma, Pemetaan produk, Alias nama stok, Libur.
> - **Pengaturan** (hanya admin): Gudang, Toko, Pengguna, Penugasan.
> - Perubahan halaman:
>   - Halaman "Usulkan jadwal toko" (`/usulan-jadwal`) menjadi **"Usulkan pengiriman di luar jadwal"**. Di gudang Pusat judulnya **"Atur pengiriman di luar jadwal"**, karena berlaku langsung.
>   - Halaman operator "Salin jadwal ke beberapa toko" (`/salin-jadwal`) dihapus. Salin jadwal pindah ke halaman admin **Jadwal toko**.
>   - Halaman Pengiriman Gudang menautkan ke halaman pengiriman di luar jadwal untuk pengguna berhak, menggantikan dua tautan lama.
>   - Masa peralihan: selama halaman lama masih ada, "Usulkan jadwal toko" lalu "Salin jadwal ke beberapa toko" berada di **Pekerjaan rutin**, tepat setelah Pengiriman Gudang. Keduanya hilang atau berganti nama saat tiket penggantinya selesai. Item tetap hanya untuk halaman yang sudah ada.
> - Teks beranda (§9) mengikuti istilah baru:
>   - Kartu admin "usulan jadwal menunggu persetujuan" menjadi "usulan pengiriman di luar jadwal menunggu persetujuan".
>   - Langkah admin (4) "Mulai di sini" menjadi "Setujui pengiriman di luar jadwal".
> - Urutan item di dalam kelompok sesuai urutan di atas. Kelompok tanpa item yang boleh dibuka tidak ditampilkan. Viewer melihat Beranda dan Laporan saja.

> ▶ Revisi (2026-10-13 sore, pemilik, audit UI/UX): ukuran tombol `default` menjadi h-11 (44 px, sesuai §9); `sm` h-9 hanya di dalam tabel dan baris filter. Komponen baru: **Panel samping** dan **Dialog** (§11.2), serta **Dialog konfirmasi** (§11.3), dibangun dari Radix Dialog/AlertDialog lewat paket `radix-ui` yang sudah dipakai.

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

> ▶ Keputusan (2026-10-11): isi **beranda** (zona suasana) sesuai peran. Semua data hanya dibaca dari yang sudah tersimpan, tanpa hitungan baru (PRD C1).
> - **Sapaan:** "Selamat datang, <nama>", ditambah peran dan, untuk operator, gudang yang ditugaskan.
> - **Kartu "Perlu tindakan"**: setiap kartu berisi jumlah dan tautan langsung ke halamannya, dan hanya tampil jika jumlahnya > 0.
>   - Admin: usulan jadwal menunggu persetujuan; snapshot libur menunggu ditinjau; produk belum dipetakan; ranking bulan berjalan belum dipublikasikan; impor gagal atau menunggu diaktifkan.
>   - Operator (gudang yang ditugaskan): draft yang perlu dihitung ulang; toko dengan baris tertahan; toko yang belum difinalisasi untuk tanggal kirim terdekat.
> - Jika tidak ada kartu: keadaan kosong "Semua beres" (ikon + teks, §7).
> - **Status data** (satu baris kecil): impor aktif terakhir dan status cache laporan.
> - **Pintasan** 2–4 tombol ke halaman utama peran itu: admin (Impor, Ringkasan, Gudang), operator (Pengiriman Gudang, Ringkasan, Kalender).
> - **Viewer:** sapaan, status data, dan pintasan ke Ringkasan dan Kalender saja.

> ▶ Keputusan (2026-10-12, UAT ketiga): kartu **"Mulai di sini"** di beranda, di atas "Perlu tindakan", untuk admin dan operator.
> - Isinya daftar langkah bernomor sesuai urutan kerja. Setiap langkah menampilkan status **Selesai** (ikon + teks, §7) atau **Belum**, satu kalimat penjelasan, dan tombol ke halamannya. Status dibaca dari data tersimpan (PRD C1).
> - **Admin:** (1) Impor penjualan: selesai jika ada minimal satu impor aktif dan tidak ada impor "Siap ditinjau". (2) Terbitkan ranking pusat: selesai jika sudah ada ranking yang berlaku. (3) Periksa pemetaan produk: selesai jika tidak ada produk belum dipetakan. (4) Setujui usulan jadwal: selesai jika tidak ada usulan menunggu.
> - **Operator** (per gudang yang ditugaskan, untuk tanggal kirim terdekat seperti definisi T79): (1) Hitung kebutuhan: selesai jika draft tanggal itu sudah ada. (2) Isi stok dan bereskan masalah (unggah file stok atau ketik): selesai jika tidak ada baris tertahan di draft itu. (3) Finalisasi: selesai jika semua toko yang mengirim tanggal itu sudah final. Tombol langkah operator membuka halaman gudang dengan tanggal kirim itu.
> - Jika semua langkah selesai, kartu menampilkan "Semua langkah beres" tanpa daftar panjang. Viewer tidak mendapat kartu ini.

> ▶ Keputusan (2026-10-11, T79): definisi kartu "Perlu tindakan" di beranda.
> - **"Toko yang belum difinalisasi untuk tanggal kirim terdekat" (operator):** tanggal kirim terdekat = tanggal kirim paling dekat (hari ini atau sesudahnya) menurut jadwal aktif toko-toko gudang itu, satu tanggal per gudang. Yang dihitung: toko aktif yang mengirim pada tanggal itu dan belum punya rencana final untuk tanggal itu, walaupun draft tanggal itu belum dihitung.
> - **"Draft perlu dihitung ulang" dan "toko dengan baris tertahan" (operator):** hanya draft dengan tanggal kirim hari ini dan sesudahnya.
> - **Kartu admin:** usulan jadwal berstatus menunggu; snapshot libur menunggu persetujuan; produk belum dipetakan; ranking bulan kalender berjalan (WIB) belum pernah dipublikasikan (kartu berjumlah 1); impor berstatus gagal atau siap ditinjau.

## 10. Yang tidak diambil dari sumber

Bagian sumber untuk landing page tidak dipakai: hero, harga, testimoni, blog, FAQ, gambar berotasi, konektor SVG, `py-32`, latar seksi berwarna penuh, dan rotasi saat hover. Jika ada layar baru yang terasa membutuhkannya, tanyakan pemilik.

## 11. Pola zona kerja (audit UI/UX 2026-10-13)

> ▶ Keputusan (2026-10-13 sore, pemilik, hasil audit UI/UX): pola berikut berlaku untuk zona kerja. Jika bertentangan dengan teks §4, §6, atau §9 di atas, bagian ini yang berlaku. Tujuannya satu: aplikasi dipakai setiap hari oleh orang non-IT, jadi halaman kerja harus terasa seperti meja kerja, bukan dokumen panjang yang harus digulir puluhan layar.

### 11.1 Tabel panjang

- Tabel yang bisa berisi lebih dari ±15 baris diletakkan dalam **wadah bertinggi terbatas**: kira-kira tinggi layar dikurangi kepala halaman, minimal 20rem. Tabel menggulir di dalam wadah itu, vertikal dan horizontal, sehingga scrollbar horizontal selalu terjangkau.
- **Header tabel menempel** di atas wadah saat digulir (`bg-muted`).
- Tabel yang lebih lebar dari wadahnya: **kolom identitas** (kode dan nama produk, atau nama toko) menempel di kiri, berlatar `card` (baris terpilih `accent`).
- Tabel dengan ≤ 15 baris tetap mengikuti §4.
- Setiap tabel punya nama untuk pembaca layar (caption tersembunyi atau `aria-label`).
- Tabel di dalam kartu tidak memakai bingkai dan padding kedua.
- Daftar admin yang bisa melebihi 50 baris punya **kotak cari** dan **halaman 50 baris** seperti Ringkasan: Pemetaan produk, Alias nama stok, Keluarga aroma, dan Riwayat rencana final. Keluarga aroma tampil sebagai daftar ringkas yang dapat dicari. Mengubah satu keluarga dilakukan di panel samping (§11.2), bukan 29 form yang selalu terbuka.

### 11.2 Rincian di panel samping

- Rincian sebuah baris atau angka dibuka di **panel samping** dari kanan, di atas halaman, tanpa menggeser isi halaman. Berlaku untuk rincian kebutuhan di draft, rincian di rencana final, dan rincian angka Ringkasan.
  - Lebar panel ±560 px di desktop; layar penuh di layar < 640 px.
  - Kepala panel berisi judul dan tombol "Tutup" yang selalu terlihat.
- Membuka panel **tidak memuat ulang halaman**:
  - Isian stok yang belum disimpan tetap ada, dan peringatan "tinggalkan halaman" tidak muncul.
  - Posisi gulir tabel tetap.
  - Tautan langsung (URL) ke sebuah rincian tetap bisa dibuka dan langsung membuka panelnya.
- Panel ditutup dengan "Tutup", tombol Esc, atau klik di luar panel. Setelah ditutup, fokus kembali ke tautan pembukanya. Hanya satu panel atau dialog terbuka pada satu waktu.
- Perbandingan singkat ("Minggu sama" di Ringkasan) dibuka di **dialog** di tengah layar.
- Yang tetap di halaman:
  - Tabel stok toko yang dibuka di draft, karena itu area kerja utama.
  - Detail tanggal Kalender di desktop.
  - Beda jadwal di Persetujuan jadwal.
  - Kelompok sidebar.
- Menu tarik di layar < 1024 px memakai komponen dialog yang sama, dengan fokus terkunci di dalam menu.

### 11.3 Konfirmasi

- Tindakan yang menghapus, menonaktifkan, mencabut, melepas, membatalkan, atau tidak bisa diurungkan meminta konfirmasi lewat **dialog konfirmasi** aplikasi, bukan dialog bawaan browser.
  - Isi dialog: judul berupa pertanyaan, akibatnya dalam satu atau dua kalimat, tombol "Batal", dan tombol tindakan bertuliskan kata kerjanya (misalnya "Nonaktifkan").
  - Tombol tindakan merusak memakai varian `destructive`.
- Daftar minimal:
  - Hapus alias nama stok.
  - Hapus alias atau segmen keluarga aroma.
  - Nonaktifkan pengguna; cabut penugasan.
  - Nonaktifkan toko atau gudang; lepas toko.
  - Nonaktifkan jadwal tetap.
  - Batalkan pengiriman di luar jadwal.
- **Finalisasi** juga meminta konfirmasi, dengan ringkasan: toko, tanggal kirim, jumlah varian, total jumlah kirim, dan peringatan yang masih tampil.
- Tombol tindakan merusak di setiap baris tabel memakai gaya garis atau `ghost` bernada `destructive`, bukan tombol merah penuh, agar tabel tidak tampak seperti daftar bahaya.
- Peringatan saat meninggalkan halaman dengan isian belum disimpan tetap memakai peringatan bawaan browser (batas teknis browser).

### 11.4 Aksi utama selalu terlihat

- Isian stok toko di draft punya **bar aksi menempel** di bawah layar. Isinya: pesan status simpan (§6), jumlah isian yang berubah, dan tombol "Simpan stok".
- Toko yang dibuka di draft punya **kepala menempel**. Isinya: nama toko, status, jumlah baris tertahan, dan tombol Finalisasi.
- Baris tabel stok dibuat ringkas:
  - Stok kosong tampil "—" dengan ikon `CircleDashed` kecil di samping isian, tanpa badge bertumpuk. Status "Stok belum diisi" cukup di kolom Masalah.
  - Isi sel sejajar tengah secara vertikal, tinggi baris ±44 px.
- **Filter tabel stok toko:** Semua · Tertahan · Stok kosong · Jumlah kirim > 0, masing-masing dengan jumlahnya, ditambah cari kode atau nama produk.
  - Filter hanya menyaring tampilan. Isian, aturan finalisasi, dan "Isi 0" tetap berlaku untuk seluruh toko.
- Halaman tinjau (impor, libur, ranking): tombol keputusan (Aktifkan, Setujui, Publikasikan) diletakkan **setelah** data yang ditinjau, bersama ringkasan jumlah error dan peringatan.

### 11.5 Halaman Pengiriman Gudang

- **Urutan isi:**
  1. Kepala halaman: gudang dan ringkasan periode sumber.
  2. **Draft rencana.**
  3. Jadwal toko: tabel jadwal tetap, termasuk status toko. Tabel "Toko terhubung" yang terpisah dihapus karena isinya sama.
  4. Periode sumber lengkap.
- Jadwal toko dan Periode sumber bisa dibuka-tutup, dan awalnya tertutup.
- **Tanggal yang dibuka pertama kali** = tanggal kirim terdekat (hari ini atau sesudahnya) yang punya toko mengirim. Jika draft tanggal itu belum ada, halaman menawarkan "Hitung kebutuhan" untuk tanggal itu.
- Chip tanggal draft diurutkan dari yang terdekat, dengan penanda "Terdekat".
- Form "Hitung kebutuhan" menampilkan **saran tanggal kirim**: tanggal kirim toko-toko gudang itu dalam 14 hari ke depan, yang bisa dipilih sekali klik. Tanggal lain tetap bisa diketik.
- Operator yang hanya ditugaskan di **satu gudang** langsung masuk ke halaman gudang itu dari daftar. Tautan "Daftar gudang" tidak ditampilkan baginya. Aturan yang sama berlaku untuk halaman pengiriman di luar jadwal.
- Kartu gudang di daftar menampilkan tanggal kirim terdekat dan jumlah toko yang belum final untuk tanggal itu.

### 11.6 Bahasa untuk pengguna awam

- Identitas teknis file (SHA-256, ukuran dalam byte, nomor penetapan) disembunyikan di bawah bagian "Detail teknis" yang bisa dibuka. Datanya tidak dihapus.
- Daftar sumber angka di panel rincian tetap memakai alamat sel (§8).
- Istilah domain tetap memakai istilah CONTEXT.md, tetapi diberi **bantuan singkat**: ikon `CircleHelp` di samping istilah membuka penjelasan satu atau dua kalimat. Minimal untuk istilah berikut:
  - Persiapan (H, H−1, H−2), Cakupan, Panjang cakupan, Tanggal jangkar.
  - Kategori dasar dan efektif.
  - Produk otomatis dan manual, Buffer.
  - Hanya-baca, Periode sumber.
- Teks cakupan ditulis lengkap, misalnya: "Cakupan 8 hari: persiapan 1 hari + 7 hari sampai sebelum kiriman berikutnya".
- Label tautan menyebut tindakannya: "Lihat rincian", "Buka toko", "Tinjau impor". Hindari "Buka" atau "Rincian" saja.
- Paragraf penjelasan di atas form atau kartu maksimal dua kalimat; sisanya dipindah ke bantuan.
- Kolom waktu di tabel menampilkan tanggal singkat; waktu lengkap tampil saat disorot.
- Keadaan kosong memakai ikon + teks (§7) dan satu kalimat langkah berikutnya.
- Sel Ringkasan hanya berisi angka. Rumus kecil "Σ … ÷ …" pindah ke panel rincian (§8 tetap berlaku di sana).

### 11.7 Halaman tidak ditemukan, error, dan memuat

- Halaman "tidak ditemukan" dan halaman error berbahasa Indonesia dan bertema terang (ADR-0010). Isinya penjelasan singkat dan tautan ke Beranda. Pengguna yang tidak berhak membuka sebuah halaman melihat halaman "tidak ditemukan" yang sama.
- Perpindahan halaman yang lambat menampilkan kerangka memuat di area konten; sidebar tetap tampil.

### 11.8 Konsistensi komponen

- Judul kartu mengikuti urutan heading halaman (h1 → h2 → h3) tanpa melompat.
- Chip terpilih memakai `bg-accent text-accent-foreground` di semua halaman, dan setiap chip punya cincin fokus yang terlihat.
- Satu gaya tautan-tombol dipakai bersama di semua halaman.
- Di layar < 640 px, filter Ringkasan dibuka lewat tombol "Filter (n)" yang membuka panel.
- Kalender di layar < 1024 px: memilih tanggal menggulir ke Detail tanggal. Grid kalender tidak melebar keluar dari kolomnya.
- Halaman rincian rencana final memakai lebar `max-w-7xl` karena berisi tabel lebar (pengecualian §9).
- Angka di kartu Ringkasan memakai Nunito tebal, bukan Fraunces (§3).

### 11.9 Beranda, Pengguna, dan riwayat

- Langkah operator (1) "Hitung kebutuhan" baru Selesai jika draft tanggal itu ada **dan** tidak perlu dihitung ulang.
- Kartu "Mulai di sini": jika semua langkah selesai tetapi masih ada kartu "Perlu tindakan", teksnya "Langkah rutin beres. Masih ada yang perlu ditindak di bawah.", bukan "Semua langkah beres".
- Tombol langkah memakai label tindakannya ("Hitung kebutuhan", "Isi stok", "Finalisasi"), bukan "Buka Pengiriman Gudang" yang diulang.
- **Halaman Pengguna:**
  - Peran tampil seperti di sidebar (Admin, Operator, Viewer).
  - Pilihan peran berbunyi "Admin" dan "Bukan admin (operator atau viewer, menurut penugasan)".
  - Baris akun sendiri tidak menampilkan tombol Nonaktifkan.
- Riwayat rencana final: versi yang sudah digantikan diberi label "Digantikan oleh versi n" di samping status Final.
- Ranking yang sudah dipublikasikan dan berlaku tampil berstatus Aktif (`success`, `CircleCheck`), bukan dengan ikon error.
