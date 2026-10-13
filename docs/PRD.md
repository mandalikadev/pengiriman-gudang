# PRD — Dashboard Penjualan MANDALIKA

Dokumen ini adalah **satu-satunya sumber aturan bisnis dan rumus**. Bagian A dan B adalah teks pemilik produk, disalin apa adanya. Koreksi dan keputusan sesudahnya ditandai dengan blok `▶ Keputusan` atau `▶ Revisi`, beserta rujukan ADR, tanpa menghapus teks aslinya. Bagian C berisi kebutuhan non-fungsional dan batas scope.

Pemilik produk: tim MANDALIKA. Perubahan pada berkas ini hanya oleh atau atas instruksi pemilik.

---

## Bagian A — User story utama (teks pemilik, 2026-10-08)

Saya ingin membangun web Dashboard Penjualan MANDALIKA dari awal. Aplikasi ini membantu usaha dengan banyak toko mengolah data penjualan menjadi laporan yang dapat dipercaya, lalu menggunakan laporan tersebut untuk merencanakan kebutuhan pengiriman barang dari gudang ke toko.

Saya ingin aplikasi yang mudah dipakai pegawai operasional. Pengguna harus memahami angka yang ditampilkan, asal perhitungannya, tindakan yang perlu dilakukan, dan apakah perubahan berhasil disimpan. Gunakan cerita berikut sebagai acuan bisnis. Jangan mengubah rumus atau menebak keputusan yang belum jelas hanya untuk mempermudah implementasi.

### A1. Ketika saya memasukkan data penjualan

Saya memiliki file Excel berisi penjualan beberapa toko dan produk. Saya ingin mengunggah file, memilih sheet yang digunakan, lalu memeriksa hasil pembacaannya sebelum menjadikannya sumber laporan aktif.

Tanggal, kuantitas, identitas toko, produk, dan kemungkinan duplikasi perlu diperiksa. Jika ada kesalahan, tunjukkan bagian yang bermasalah dan cara memperbaikinya. Impor yang belum selesai atau gagal tidak boleh menggantikan data aktif yang sebelumnya sudah benar.

Setiap angka laporan harus bisa ditelusuri sampai file, sheet, tanggal, dan sel sumber. Pengguna juga perlu melihat jumlah penjualan serta pembagi yang menghasilkan suatu rata-rata.

Bedakan nol dengan data yang tidak tersedia. Sel penjualan kosong pada tanggal valid dalam sheet yang dipilih diperlakukan sebagai nol. Namun tanggal tanpa pengamatan tidak boleh dibuat menjadi nol. Nilai nol yang benar-benar teramati tetap masuk perhitungan.

> ▶ Keputusan (ADR-0005): sumber impor tahap ini hanya sheet berpola `<BULAN> (S)`. Sheet `MP …` dan sheet BARDAT (tanpa "(S)") di luar scope.
> ▶ Keputusan (ADR-0002): satu impor aktif per bulan impor; tanggal di sheet harus berada di bulan impor yang dipilih.
> ▶ Keputusan (OD-01): kuantitas negatif di sel penjualan adalah salah input dan harus diperbaiki di Excel sebelum impor. Pembaca sheet menolaknya sebagai error sehingga impor tidak bisa diaktifkan.
> ▶ Keputusan (2026-10-09): toko nonaktif di sheet impor tetap diterima, dengan peringatan di halaman tinjau.
> ▶ Keputusan (2026-10-09): master produk mengikuti impor yang terakhir diaktifkan: nama, ukuran, dan kategori diperbarui, lalu klasifikasi dihitung ulang. Setiap perubahan tampil sebagai peringatan "data produk berubah" di halaman tinjau. Kode produk tetap identitas (ADR-0006). Rencana final tidak terpengaruh karena menyimpan snapshot (A7).
> ▶ Keputusan (2026-10-12, UAT kedua): impor beberapa sheet sekaligus.
> - Setelah memilih file, admin boleh mencentang **satu atau lebih** sheet `<BULAN> (S)`. Tahun impor diisi sekali untuk semua sheet terpilih. Bulan impor setiap sheet terisi otomatis dari nama sheet (`JANUARI` … `DESEMBER`, huruf besar/kecil diabaikan) dan tetap bisa diubah; sheet yang nama bulannya tidak dikenali wajib dipilih bulannya.
> - Dua sheet terpilih dengan tahun–bulan impor yang sama ditolak sebelum diunggah, dengan pesan yang menyebut kedua sheet.
> - File diunggah satu kali. Setiap sheet terpilih menjadi **satu impor tersendiri** dengan validasi, halaman tinjau, dan status sendiri. Setelah dikirim, admin dibawa ke Daftar impor dan melihat hasil per sheet (berhasil didaftarkan / gagal + alasan).
> ▶ Keputusan (2026-10-12, UAT kedua): tombol **"Aktifkan semua yang siap"** di Daftar impor.
> - Mengaktifkan semua impor berstatus "Siap ditinjau" dengan 0 error (peringatan tidak menahan), satu per satu dengan aturan aktivasi yang sama, lalu menampilkan hasil per impor.
> - Jika ada lebih dari satu impor siap untuk tahun–bulan impor yang sama, impor bulan itu **dilewati** dengan keterangan "Ada lebih dari satu impor siap untuk bulan ini; aktifkan satu per satu dari halaman tinjau." Impor dengan error tampil sebagai dilewati beserta jumlah errornya.
> - Aktivasi satu per satu dari halaman tinjau tetap ada.

### A2. Ketika saya membaca laporan penjualan

Saya ingin melihat laporan per produk dan toko, menyaring toko, kategori, produk, serta memilih bulan yang diperlukan. Bulan yang tersedia mengikuti data, tidak dibatasi pada empat bulan tertentu. Pengguna dapat memilih 1–12 bulan, termasuk bulan yang tidak berurutan.

Pilihan yang sedang diedit baru memengaruhi hasil setelah tombol Terapkan ditekan. Periode yang benar-benar sedang digunakan harus terlihat jelas. Ekspor mencakup seluruh hasil filter, bukan hanya baris pada halaman tabel yang sedang dibuka.

Laporan membagi hari menjadi kategori `Senin–Kamis`, `Jumat`, `Sabtu`, dan `Minggu`. Perhitungan dilakukan bertahap untuk setiap pasangan produk–toko dan kategori hari.

a. Tahap pertama adalah menghitung nilai mingguan dalam setiap bulan:
- Senin–Kamis: total kuantitas dibagi jumlah tanggal berbeda yang memiliki pengamatan valid, lalu dibulatkan ke atas.
- Jumat, Sabtu, dan Minggu: gunakan total kuantitas kategori tersebut pada minggu terkait.

b. Tahap kedua adalah menghitung rata-rata bulanan:
Rata-rata bulanan = pembulatan ke atas dari jumlah nilai mingguan dibagi jumlah minggu yang memiliki pengamatan.

c. Tahap ketiga adalah menghitung Ringkasan lintas bulan:
Rata-rata Ringkasan = pembulatan ke atas dari jumlah rata-rata bulanan dibagi jumlah bulan pilihan yang memiliki hasil.

Saya juga membutuhkan perbandingan minggu yang sama antarbulan. Untuk laporan ini, jumlahkan nilai pada indeks minggu yang sama, bagi dengan jumlah bulan yang memiliki nilai tersebut, lalu bulatkan ke atas.

Jangan mengganti perhitungan bertahap ini dengan total seluruh penjualan dibagi seluruh hari. Pembulatan dilakukan pada setiap tahap yang disebutkan. Minggu dan bulan mempunyai bobot sama pada tahap rata-ratanya.

Data parsial tetap dihitung berdasarkan pengamatan yang tersedia dan diberi penanda kelengkapan. Bulan tanpa hasil tidak menambah pembagi. Nol yang teramati tetap dihitung. Total penjualan mentah dan penjumlahan angka rata-rata harus diberi label berbeda agar tidak menyesatkan.

Untuk Senin–Kamis, penempatan minggu dan bulan laporan mengikuti hari Kamis dalam minggu yang sama. Jumat–Minggu mengikuti tanggalnya sendiri. Perubahan kategori hari tidak boleh diam-diam mengubah bulan laporan yang sudah ditetapkan. Minta contoh tanggal dan hasil yang diharapkan untuk memastikan penomoran minggu serta perlakuan hari libur; jangan mengasumsikan aturan kalender yang belum disepakati.

> ▶ Keputusan: contoh tanggal, penomoran minggu, dan perlakuan hari libur ditetapkan di **Bagian B** (ADR-0004). Contoh terhitung: `tests/golden/kalender-minggu-laporan.json`, `tests/golden/laporan-15GL-GOR-PMS-juni.json`.
> ▶ Keputusan (OD-08): penanda kelengkapan. Kelompok mingguan *parsial* jika ada tanggal anggotanya yang tidak teramati (contoh: Senin–Kamis Juli M1 baru teramati 29–30 Juni). Rata-rata bulanan *parsial* jika ada kelompok mingguan pembentuknya yang parsial.
> ▶ Keputusan (OD-09): angka harapan di `tests/golden/laporan-15GL-GOR-PMS-juni.json` (Senin–Kamis 1, Jumat 0, Sabtu 1, Minggu 0) dikonfirmasi benar oleh pemilik.
> ▶ Keputusan (2026-10-09): ekspor laporan dalam format Excel (`.xlsx`).
> ▶ Keputusan (2026-10-09, perencanaan M2–M3): semua pengguna yang sudah masuk (admin, operator, viewer) boleh melihat Ringkasan dan mengekspor laporan.
> ▶ Keputusan (2026-10-09, perencanaan M2–M3): filter "kategori" di Ringkasan adalah kategori **produk**. Kategori hari menjadi kolom tabel.
> ▶ Keputusan (2026-10-11, UAT terhadap sistem ASOY): Ringkasan menampilkan **4 kartu** di atas tabel, satu per kategori hari (`Senin–Kamis`, `Jumat`, `Sabtu`, `Minggu`). Angka kartu = **jumlah Rata-rata Ringkasan per baris produk–toko** (yang sudah dibulatkan per baris sesuai tahap c) dari **seluruh hasil filter yang sedang diterapkan** (toko, periode, kategori produk, cari), bukan hanya baris pada halaman tabel yang sedang dibuka. Baris yang nilainya tidak tersedia tidak menambah apa pun; nol yang teramati menambah 0. Label kecil kartu: "Jumlah rata-rata produk/toko · seluruh hasil filter" — bukan "total penjualan".
> ▶ Keputusan (2026-10-12, UAT kedua): filter **Toko** dan **Kategori produk** di Ringkasan masing-masing punya tombol "Pilih semua" dan "Kosongkan". Seperti pilihan lain, hasil baru berubah setelah Terapkan. Pemilih bulan tidak mendapat "Pilih semua" karena dibatasi 1–12 bulan.

### A3. Ketika saya mengelola gudang dan pengguna

MANDALIKA memiliki lima gudang operasional, yaitu Pusat dan empat gudang lainnya. Pusat adalah nama gudang, bukan sinonim untuk peran admin.

Admin mengelola konfigurasi gudang, hubungan toko, penugasan operator, hak tindakan, ranking pusat, serta persetujuan jadwal. Operator bekerja pada gudang yang ditugaskan kepadanya untuk mengelola usulan jadwal, memasukkan stok, menghitung kebutuhan, memfinalisasi rencana, dan mengekspor sesuai izin. Viewer dapat melihat laporan sesuai haknya, tanpa otomatis mendapat akses operasional gudang.

Admin tidak otomatis menjadi operator pengiriman. Setiap tindakan harus mengikuti kewenangan pengguna.

Saya ingin menambahkan beberapa toko sekaligus dengan memilih toko lalu menekan satu tombol. Toko yang sudah terhubung, nonaktif, atau terkait gudang lain harus mempunyai keterangan yang jelas. Jika hanya sebagian berhasil ditambahkan, tampilkan hasil per toko. Jangan mengulang otomatis tindakan yang hasil penyimpanannya belum pasti.

> ▶ Keputusan (OD-02, bagian nama): empat gudang selain Pusat adalah Gudang Bali, Gudang Bandung, Gudang Cibubur, dan Gudang Jabodetabek.
> ▶ Keputusan (OD-03, ADR-0009): satu toko tidak boleh terhubung ke lebih dari satu gudang.
> ▶ Keputusan (OD-10): hanya admin yang boleh mengunggah dan mengaktifkan impor penjualan.
> ▶ Keputusan (2026-10-09, T20): admin tidak boleh menonaktifkan akunnya sendiri.
> ▶ Keputusan (2026-10-09, T20): admin boleh mengubah perannya sendiri, **kecuali** jika ia satu-satunya admin aktif. Aplikasi harus selalu punya minimal satu admin aktif.
> ▶ Keputusan (2026-10-09, T20): fitur "aktifkan kembali pengguna" yang dinonaktifkan dan tombol "Keluar" (logout) masing-masing dibuat sebagai tiket terpisah.
> ▶ Keputusan (2026-10-09): penugasan operator ke gudang tanpa hak tindakan apa pun memberi akses lihat (hanya-baca) ke halaman Pengiriman Gudang gudang tersebut.
> ▶ Keputusan (OD-07, 2026-10-09): viewer melihat laporan semua toko.
> ▶ Keputusan (2026-10-09, perencanaan M2–M3): admin boleh **melihat** halaman Pengiriman Gudang semua gudang (hanya-baca), tanpa tindakan operasional. Menetapkan periode sumber dan menyetujui jadwal tetap dilakukan dari halaman admin.
> ▶ Keputusan (2026-10-09, perencanaan M2–M3): selama OD-12 terbuka, seed data UAT tidak menghubungkan toko ke gudang. Penguji menghubungkan toko lewat halaman admin sebagai bagian dari skenario UAT.
> ▶ Keputusan (2026-10-12, UAT, OD-12 sebagian): hubungan toko–gudang dari lampiran pemilik (gambar jadwal gudang Cibubur, PDF jadwal gudang Bali dan Bandung).
> - **Gudang Cibubur**: SMB, BOTANI, MKG, KOKAS, SMS, ALSUT, BXC, KARAWACI, CCM, BSD, DELTAMAS, PMB, KUNCIT, TSM CBB, SENTUL, LMK. Toko "Performance" (Atrium Senin dan GPS) ada di jadwal Cibubur tetapi tidak ada di sheet penjualan, jadi tidak dimasukkan.
> - **Gudang Bali**: DMB, LWB.
> - **Gudang Bandung**: PASKAL, PVJ.
> - PMS, PMJ, QUEEN, MKS, DPM belum ditentukan (tetap OD-12).
> - Seed UAT (`pnpm uat`) menghubungkan toko di atas ke gudangnya dan mengisi jadwal awal (A5) sebagai **data awal** atas nama admin pertama. Perubahan berikutnya mengikuti alur usulan–persetujuan seperti biasa. Keputusan 2026-10-09 "seed tidak menghubungkan toko" tidak berlaku lagi untuk toko di atas; toko yang masih terbuka tetap dihubungkan penguji lewat halaman admin.
> ▶ Terbuka: OD-12 untuk PMS, PMJ, QUEEN, MKS, DPM.
> ▶ Keputusan (2026-10-12, UAT kedua): seed data master dan seed UAT.
> - **Seed data master** (`pnpm db:seed-master`, juga dijalankan `pnpm uat`) mengisi, dari berkas data di repo yang diturunkan dari file pemilik: master produk (359 produk dari sheet `JUNI (S)`–`AGUSTUS (S)` 2026, klasifikasi dihitung dengan aturan biasa), 29 keluarga aroma (28 baris ranking September 2026 ditambah KISS FROM A ROSE) dengan alias = nama keluarga dan segmen kodenya (GIFT SET BOX: `B` dan `W`), pemetaan produk (347 terpetakan, 12 tanpa aroma) yang tercatat di riwayat pemetaan atas nama admin pertama, dan 205 alias nama stok.
> - Pemetaan dari seed berlaku sebagai **konfirmasi admin awal** untuk UAT dan instalasi awal. Produk baru yang muncul dari impor berikutnya tetap `belum-dipetakan` dan melewati usulan + konfirmasi admin seperti biasa (ADR-0006 tidak berubah).
> - Seed idempoten dan **tidak menimpa** perubahan admin: hanya mengisi yang belum ada; produk yang statusnya bukan `belum-dipetakan` tidak diubah. Impor yang diaktifkan kemudian memperbarui nama, ukuran, dan kategori produk seperti biasa.
> - Asumsi yang ikut dikunci seed, dikonfirmasi lewat UAT 2026-10-12 dan bisa diubah admin dari aplikasi: display dummy `DD-GS15-B`/`DD-GS15-W` masuk GIFT SET BOX (tidak memengaruhi angka, karena GIFT SET BOX di luar tujuh besar sehingga buffernya 10%, sama dengan produk otomatis lain); alias `EDP` = `EXTRAIT` dan `PARFUM` = `PARFUM INTENSE`.
> ▶ Keputusan (2026-10-12, UAT kedua): pemilik **mengonfirmasi** display dummy `DD-GS15-B` dan `DD-GS15-W` tetap dipetakan ke keluarga GIFT SET BOX.
> - **Seed UAT** (hanya `pnpm uat`, bukan instalasi produksi) menambahkan: periode sumber Juni, Juli, Agustus 2026 untuk Gudang Cibubur, Gudang Bali, dan Gudang Bandung; akun Operator Cibubur, Operator Bali, Operator Bandung (peran viewer) yang ditugaskan ke gudangnya dengan kelima hak tindakan. Kata sandi ketiga akun dari variabel lingkungan `UAT_SANDI_OPERATOR`. Pusat dan Gudang Jabodetabek dibiarkan kosong untuk skenario A3–A5.
> - Impor penjualan dan ranking pusat **tidak** di-seed: keduanya pekerjaan rutin admin setiap bulan.

> ▶ Revisi (2026-10-13, pemilik): **admin mengelola daftar gudang dan toko dari aplikasi.** Kalimat "MANDALIKA memiliki lima gudang operasional" di atas dan daftar nama gudang pada ▶ OD-02 menjadi **data awal**, bukan batas. Tidak ada hapus permanen: gudang dan toko yang tidak dipakai lagi **dinonaktifkan**, karena data penjualan, jadwal, dan rencana final lama masih merujuk kepadanya.
> - **Gudang:** tambah (nama wajib dan unik), ubah nama, nonaktifkan, dan aktifkan kembali.
>   - Gudang **Pusat** tidak bisa diganti nama atau dinonaktifkan, karena aturan khusus Pusat bergantung padanya.
>   - Gudang hanya bisa dinonaktifkan jika tidak ada lagi toko yang terhubung. Jika masih ada, tampilkan pesan yang menyebut jumlah tokonya.
>   - Gudang nonaktif tidak muncul di pilihan kerja (daftar Pengiriman Gudang operator, usulan pengiriman di luar jadwal, penugasan baru, periode sumber). Penugasan operator ke gudang nonaktif tidak memberi akses. Admin tetap bisa membuka halaman Pengiriman Gudang dan riwayat rencana final gudang nonaktif (hanya-baca).
>   - Rencana final yang sudah ada tetap memakai nama gudang saat finalisasi (snapshot).
> - **Toko:** halaman sendiri untuk tambah (nama wajib dan unik), ubah nama, nonaktifkan, dan aktifkan kembali.
>   - Nama toko harus **sama persis** dengan nama blok toko di sheet penjualan. Impor mengenali toko dari nama ini, jadi setelah nama diubah, sheet berikutnya harus memakai nama baru. Form menampilkan keterangan ini.
>   - Mengubah nama tidak memindahkan data: penjualan, jadwal, dan rencana final lama tetap melekat ke toko yang sama. Rencana final tetap menampilkan nama saat finalisasi.
>   - Aturan toko nonaktif yang sudah ada tetap berlaku (tidak ikut draft, peringatan "Toko <nama> nonaktif tetapi masih punya jadwal aktif").
> - **Hubungan toko–gudang:** selain menambahkan beberapa toko sekaligus (sudah ada), admin bisa **melepas** toko dari gudangnya.
>   - Melepas toko menonaktifkan jadwal tetapnya dan membatalkan pengiriman di luar jadwal toko itu yang belum lewat (menunggu atau berlaku), dengan alasan "Toko dilepas dari gudang". Rencana final lama tidak berubah.
>   - Konfirmasi sebelum melepas menyebut akibat ini.
>   - Memindah toko = lepas, lalu tambahkan ke gudang lain. Aturan satu toko satu gudang tetap (ADR-0009).
> - **Jadwal tetap** setiap toko diatur admin; lihat A5 ▶ Revisi 2026-10-13.

### A4. Ketika saya menentukan sumber perhitungan gudang

Halaman Pengiriman Gudang harus memiliki kartu Periode sumber penjualan yang jelas dan mudah ditemukan. Pilihan bulan di sini harus mandiri dari filter Ringkasan. Mengubah bulan pada Ringkasan tidak boleh mengubah dasar perhitungan gudang secara diam-diam.

Ada satu keputusan yang masih perlu saya tentukan: apakah admin menetapkan periode bersama untuk seluruh operator suatu gudang, atau operator boleh menentukan periodenya sendiri. Tanyakan keputusan ini sebelum menetapkan perilakunya. Jika dipilih pengaturan bersama, pilihan admin harus benar-benar digunakan operator, bukan hanya tersimpan pada tampilan admin.

> ▶ Keputusan (ADR-0003): **admin menetapkan satu periode sumber untuk semua operator di satu gudang.** Operator melihatnya hanya-baca. Jika belum ditetapkan, perhitungan tidak berjalan dan pesan "Periode sumber belum ditetapkan admin" tampil.
> ▶ Keputusan (2026-10-10, T51): jika periode sumber memuat bulan yang tidak lagi punya data aktif, perhitungan tetap berjalan dengan bulan yang masih ada. Bulan yang hilang ditandai jelas di kartu Periode sumber.

Bedakan bulan sumber penjualan, bulan ranking, dan tanggal kirim. Ketiganya mempunyai fungsi berbeda.

### A5. Ketika operator menyiapkan jadwal

Setiap toko mempunyai satu jadwal aktif yang dapat berisi beberapa hari pengiriman. Pengiriman menggunakan Senin–Sabtu, dengan pola mingguan, dua atau tiga kali seminggu, atau dua mingguan. Pola dua mingguan membutuhkan tanggal jangkar agar pekan pengirimannya jelas.

> ▶ Keputusan (2026-10-12, UAT ketiga, workbook pemilik "Phase 1_2" sheet PHASE 2): pola baru **1× sebulan**.
> - Satu hari kirim per toko (Senin–Sabtu, dipilih per toko; tidak selalu Senin) dengan persiapan H, H−1, atau H−2.
> - Tanggal kirim = kemunculan **pertama** hari itu di setiap bulan kalender (misalnya Selasa pertama setiap bulan). Tidak memakai tanggal jangkar.
> - Pembuatan dan perubahan jadwal 1× sebulan mengikuti aturan jadwal yang sama (usulan operator + persetujuan admin untuk gudang non-Pusat).

> ▶ Revisi (2026-10-13, pemilik): **hari Minggu boleh menjadi hari kirim** untuk semua pola: mingguan, 2× dan 3× seminggu, dua mingguan, dan 1× sebulan. Kalimat "Pengiriman menggunakan Senin–Sabtu" di atas dan "(Senin–Sabtu, dipilih per toko …)" pada keputusan pola 1× sebulan tidak berlaku lagi. Pilihan hari menjadi **Senin–Minggu**, tampil dengan urutan itu.
> - Persiapan H, H−1, H−2 dan aturan cakupan (A6) berlaku sama. Contoh: kirim Minggu dengan persiapan H−1 → persiapan Sabtu.
> - Pekan dua mingguan tetap Senin–Minggu yang memuat tanggal jangkar. Minggu adalah hari terakhir pekan itu.
> - 1× sebulan dengan hari Minggu = Minggu pertama setiap bulan.

Setiap hari pengiriman dapat memiliki persiapan H, H−1, atau H−2. Operator dapat menyalin template jadwal ke beberapa toko, tetapi masing-masing toko tetap memiliki pengaturan dan status persetujuan sendiri.

Pembuatan, perubahan, dan penonaktifan jadwal empat gudang selain Pusat memerlukan persetujuan admin. Pengaturan langsung Pusat mengikuti kewenangan yang telah ditetapkan. Usulan yang belum disetujui tidak menggantikan jadwal aktif.

> ▶ Keputusan (OD-06, 2026-10-09): operator gudang Pusat yang punya hak tindakan kelola-usulan-jadwal boleh langsung membuat, mengubah, dan menonaktifkan jadwal Pusat tanpa persetujuan admin. Jadwal empat gudang lainnya tetap butuh persetujuan admin.
> ▶ Keputusan (2026-10-09, perencanaan M2–M3): usulan jadwal gudang non-Pusat dibuat oleh operator yang punya hak kelola-usulan-jadwal. Admin hanya menyetujui atau menolak.
> ▶ Keputusan (2026-10-09, perencanaan M2–M3): menyalin template = menerapkan satu pengaturan jadwal ke beberapa toko sekaligus, tanpa entitas template tersimpan. Untuk gudang non-Pusat, setiap toko hasil salinan menjadi usulan tersendiri yang perlu disetujui admin.
> ▶ Keputusan (2026-10-09, perencanaan M2–M3): pola dua mingguan: hari kirim berlaku di pekan (Senin–Minggu) yang memuat tanggal jangkar, lalu berulang setiap 14 hari.
> ▶ Keputusan (2026-10-10, T54): pola dua mingguan berlaku ke depan **dan ke belakang** dari tanggal jangkar. Jangkar hanya menentukan pekan mana yang menjadi pekan kirim, bukan tanggal mulai jadwal. Contoh: jangkar Rabu 10-06-2026 dengan hari kirim Senin → 25-05, 08-06, dan 22-06-2026 adalah tanggal kirim; 01-06 dan 15-06-2026 bukan.
> ▶ Keputusan (2026-10-12, UAT): jadwal awal per toko dari lampiran pemilik, diisi seed UAT sebagai jadwal aktif (lihat A3). Kolom jam masuk driver, jam kirim, armada, dan skema drop di lampiran tidak dimodelkan aplikasi.
>
> | Gudang | Toko | Pola | Hari kirim (persiapan) | Tanggal jangkar |
> |---|---|---|---|---|
> | Gudang Cibubur | SMB | 2× seminggu | Senin (H), Kamis (H−1) | — |
> | Gudang Cibubur | BOTANI | 2× seminggu | Senin (H), Kamis (H−1) | — |
> | Gudang Cibubur | MKG | 2× seminggu | Selasa (H−1), Jumat (H−1) | — |
> | Gudang Cibubur | KOKAS | 2× seminggu | Selasa (H−1), Jumat (H−1) | — |
> | Gudang Cibubur | SMS | 2× seminggu | Selasa (H−1), Jumat (H−1) | — |
> | Gudang Cibubur | ALSUT | mingguan | Selasa (H−1) | — |
> | Gudang Cibubur | BXC | dua mingguan | Rabu (H−1) | 2026-10-14 |
> | Gudang Cibubur | KARAWACI | mingguan | Rabu (H−1) | — |
> | Gudang Cibubur | CCM | dua mingguan | Rabu (H−1) | 2026-10-21 |
> | Gudang Cibubur | BSD | mingguan | Rabu (H−1) | — |
> | Gudang Cibubur | DELTAMAS | mingguan | Kamis (H−1) | — |
> | Gudang Cibubur | PMB | mingguan | Kamis (H−2) | — |
> | Gudang Cibubur | KUNCIT | mingguan | Jumat (H−1) | — |
> | Gudang Cibubur | TSM CBB | mingguan | Jumat (H) | — |
> | Gudang Cibubur | SENTUL | mingguan | Sabtu (H−1) | — |
> | Gudang Cibubur | LMK | mingguan | Sabtu (H−1) | — |
> | Gudang Bali | DMB | mingguan | Senin (H−1) | — |
> | Gudang Bali | LWB | 3× seminggu | Senin (H−1), Rabu (H−1), Jumat (H−1) | — |
> | Gudang Bandung | PASKAL | 2× seminggu | Senin (H−1), Jumat (H−1) | — |
> | Gudang Bandung | PVJ | mingguan | Selasa (H−1) | — |
>
> - Bacaan lampiran yang dipakai: SMS tercantum di Selasa ("1× seminggu") dan Jumat ("2× seminggu") → dibaca 2× seminggu. BXC dan CCM "2 minggu 1× bergantian" → BXC pekan 12-10-2026, CCM pekan berikutnya. Persiapan Bali dan Bandung tidak tertulis → H−1 (PDF Bandung: permintaan masuk paling lambat satu hari sebelum kirim).
> ▶ Keputusan (2026-10-12, UAT kedua): pemilik **mengonfirmasi** ketiga bacaan di atas: SMS 2× seminggu (Selasa dan Jumat), BXC dan CCM bergantian dua mingguan (jangkar BXC 2026-10-14, CCM 2026-10-21), dan persiapan Bali serta Bandung H−1.

> ▶ Revisi (2026-10-13, pemilik): **jadwal tetap diatur admin; operator mengusulkan pengiriman di luar jadwal.** Revisi ini menggantikan aturan usulan jadwal di atas: paragraf "Pembuatan, perubahan, dan penonaktifan jadwal …", ▶ OD-06, ▶ Keputusan 2026-10-09 tentang usulan jadwal dan salin template, dan kalimat "usulan operator + persetujuan admin" pada pola 1× sebulan. "Jadwal aktif" di teks lama berarti **jadwal tetap**.
>
> **Jadwal tetap**
> - Jadwal tetap (template) setiap toko dibuat, diubah, dan dinonaktifkan **hanya oleh admin**, langsung berlaku tanpa persetujuan, untuk semua gudang termasuk Pusat. Tetap satu jadwal tetap aktif per toko. Aturan pola, hari kirim, persiapan, dan tanggal jangkar tidak berubah.
> - Admin mengaturnya di halaman **Jadwal toko**: pilih gudang, lalu tabel toko gudang itu beserta jadwal tetapnya; dari sana admin mengatur, mengubah, atau menonaktifkan jadwal satu toko.
> - Riwayat jadwal tetap setiap toko tetap disimpan dan ditampilkan: pola dan hari, siapa mengatur, kapan berlaku, dan kapan diganti atau dinonaktifkan.
> - **Salin jadwal ke beberapa toko** menjadi alat admin di halaman yang sama: satu pengaturan diterapkan langsung ke beberapa toko dalam satu gudang, dengan hasil per toko.
> - Perubahan jadwal tetap menandai draft terdampak sebagai perlu dihitung ulang, seperti sebelumnya (A7).
> - Operator, termasuk operator Pusat, **tidak lagi** membuat, mengubah, atau menonaktifkan jadwal tetap, dan tidak lagi mengusulkannya. Usulan jadwal lama yang masih menunggu ditutup otomatis sebagai ditolak dengan alasan "Alur usulan jadwal tetap dihapus (keputusan pemilik 2026-10-13)". Usulan lama tetap tersimpan sebagai riwayat.
>
> **Pengiriman di luar jadwal**
> - Operator dengan hak `kelola-usulan-jadwal` di gudang itu bisa mengusulkan **satu pengiriman untuk satu toko pada satu tanggal**, tanpa mengubah jadwal tetap. Ada dua jenis:
>   - **Tambahan:** tanggal kirim tambahan, sementara pengiriman rutin tetap berjalan. Contoh: BOTANI rutin Senin dan Kamis, ada kebutuhan mendesak hari Selasa → Selasa menjadi pengiriman tambahan.
>   - **Pindah:** satu tanggal kirim rutin dipindah ke tanggal lain. Tanggal rutin itu tidak lagi menjadi tanggal kirim. Contoh: Senin 19-10-2026 dipindah ke Selasa 20-10-2026.
> - **Isian:**
>   - Toko, jenis, dan tanggal kirim.
>   - Persiapan (H, H−1, H−2). Untuk jenis pindah, nilai awalnya mengikuti persiapan tanggal rutin yang dipindah.
>   - Untuk jenis pindah: tanggal rutin yang dipindah, dipilih dari tanggal kirim rutin toko itu.
>   - **Alasan** (wajib).
> - **Syarat**, diperiksa saat diusulkan dan diperiksa ulang saat disetujui. Jika sudah tidak terpenuhi, tindakan ditolak dengan pesan yang menyebut syarat mana yang gagal.
>   - Toko punya jadwal tetap aktif dan terhubung ke gudang itu.
>   - Tanggal kirim jatuh hari ini atau sesudahnya, dan belum menjadi tanggal kirim toko itu (rutin, atau di luar jadwal yang berlaku).
>   - Untuk jenis pindah: tanggal rutin yang dipindah adalah tanggal kirim menurut jadwal tetap, jatuh hari ini atau sesudahnya, belum dipindah oleh pengiriman lain, dan belum punya rencana final untuk toko itu.
>   - Satu toko boleh punya beberapa usulan sekaligus, asalkan tanggalnya berbeda.
> - **Persetujuan:**
>   - Gudang selain Pusat: usulan menunggu persetujuan admin di halaman Persetujuan jadwal. Admin bisa **setujui**, atau **tolak** dengan alasan wajib.
>   - Gudang Pusat: langsung berlaku tanpa persetujuan (mengikuti semangat OD-06).
>   - Pengusul boleh **menarik** usulannya selama masih menunggu.
> - **Pembatalan:** pengiriman di luar jadwal yang sudah berlaku boleh dibatalkan, dengan alasan wajib.
>   - Yang boleh membatalkan: admin, dan untuk gudang Pusat juga operator berhak.
>   - Syaratnya: tanggal kirimnya belum lewat, dan belum ada rencana final toko itu untuk tanggal tersebut.
>   - Membatalkan jenis pindah mengembalikan tanggal rutinnya.
> - **Pembatalan otomatis oleh sistem.** Berlaku untuk pengiriman di luar jadwal yang tanggal kirimnya belum lewat dan belum punya rencana final, baik yang masih menunggu maupun yang sudah berlaku. Statusnya menjadi Dibatalkan, dengan alasan berikut:
>   - Admin menonaktifkan jadwal tetap toko: semua pengiriman di luar jadwal toko itu dibatalkan, alasan "Jadwal tetap dinonaktifkan".
>   - Admin mengubah jadwal tetap, lalu tanggal rutin yang dipindah tidak lagi menjadi tanggal kirim rutin: dibatalkan, alasan "Jadwal tetap berubah".
>   - Admin mengubah jadwal tetap, lalu tanggal kirim pengiriman di luar jadwal kini sudah menjadi tanggal kirim rutin: dibatalkan, alasan "Tanggal itu sudah menjadi tanggal kirim rutin".
>   - Toko dilepas dari gudang (A3).
> - **Status:** Menunggu, Berlaku, Ditolak, Ditarik, Dibatalkan. Berlaku = disetujui admin, atau langsung berlaku di Pusat.
>
> **Ikut perhitungan seperti pengiriman biasa**
> - **Tanggal kirim toko** = tanggal menurut jadwal tetap, dikurangi tanggal rutin yang dipindah, ditambah tanggal pengiriman di luar jadwal yang berlaku.
> - Draft per gudang per tanggal kirim, input stok, finalisasi, ekspor, dan riwayat berjalan sama seperti pengiriman rutin. Beranda ("tanggal kirim terdekat", "Mulai di sini") juga memakai tanggal kirim toko ini.
> - **Cakupan (A6):** pengiriman di luar jadwal dihitung sebagai pengiriman.
>   - L setiap pengiriman = jarak ke tanggal kirim **berikutnya** toko itu menurut daftar tanggal kirim di atas. Akibatnya, pengiriman tambahan memendekkan cakupan pengiriman sebelumnya, sehingga stok tidak dihitung dua kali.
>   - Khusus 1× sebulan: L tetap 30, tetapi berakhir sehari sebelum pengiriman di luar jadwal berikutnya jika pengiriman itu jatuh sebelum hari ke-30.
>   - Peringatan "kiriman sebelumnya belum sampai" memakai daftar yang sama.
> - **Contoh BOTANI** (jadwal tetap 2× seminggu: Senin H, Kamis H−1). Usulan tambahan Selasa 20-10-2026 dengan persiapan H−1 disetujui:
>   - Senin 19-10: cakupan menjadi Senin saja (L = 1; sebelumnya Senin–Rabu, L = 3).
>   - Selasa 20-10: persiapan Senin, cakupan Senin–Rabu (L = 2, p = 1). Tampil peringatan "Kiriman Senin, 19-10-2026 belum sampai saat persiapan".
>   - Kamis 22-10: tidak berubah.
> - **Draft terdampak:** pengiriman di luar jadwal yang mulai berlaku atau dibatalkan menandai draft berikut sebagai perlu dihitung ulang (A7). Isian stok tetap dipertahankan.
>   - Draft tanggal kirimnya.
>   - Draft tanggal rutin yang dipindah.
>   - Draft pengiriman sebelumnya toko itu, yang cakupannya berubah.
> - Rencana final yang sudah ada tidak berubah (snapshot).
>
> **Catatan aktivitas**
> - Setiap pengiriman di luar jadwal tercatat dengan isian berikut:
>   - Jenis, toko, tanggal kirim, persiapan, dan tanggal rutin yang dipindah.
>   - Alasan.
>   - Pengusul dan waktunya.
>   - Penyetuju atau penolak, waktunya, dan alasan penolakan.
>   - Penarikan dan pembatalan: siapa, kapan, dan alasannya.
> - Catatan ini ditampilkan di tempat berikut:
>   - **Halaman usulan operator** (per gudang): daftar "Riwayat pengiriman di luar jadwal" beserta statusnya, terbaru di atas.
>   - **Halaman Persetujuan jadwal** (admin): usulan menunggu beserta jadwal tetap toko sebagai pembanding, ditambah riwayat keputusan.
>   - **Tabel jadwal di halaman Pengiriman Gudang**: jadwal tetap setiap toko ditambah pengiriman di luar jadwal yang akan datang.
>   - **Draft, rencana final, riwayat rencana final, dan ekspor**: toko yang dikirim di luar jadwal diberi penanda "Di luar jadwal · Tambahan" atau "Di luar jadwal · Pindahan dari <hari, tanggal>", beserta alasan dan penyetujunya. Rencana final menyimpan keterangan ini di snapshot. Ekspor menambah baris keterangan "Jenis pengiriman".
> - Label hak `kelola-usulan-jadwal` di halaman Penugasan menjadi "Usulkan pengiriman di luar jadwal". Kode hak tidak berubah.


Jika jadwal atau dasar perhitungan berubah, draft terkait harus dihitung ulang. Input stok tetap dipertahankan. Rencana yang sudah final tidak berubah mengikuti aturan baru.

### A6. Ketika sistem menghitung kebutuhan dan jumlah kirim

Perhitungan dilakukan per toko dan varian produk yang tepat. Jangan mencampurkan stok antarvarian atau menebak produk berdasarkan kemiripan nama. Pencocokan nama dan alias harus mengikuti identitas produk yang telah disepakati.

> ▶ Keputusan (ADR-0006): identitas produk = kode produk. Keluarga aroma lewat tabel pemetaan yang dikonfirmasi admin. Varian rework adalah varian terpisah dalam keluarga aroma yang sama.

Misalkan H adalah tanggal kirim, p adalah jumlah hari persiapan, dan L adalah panjang cakupan. L bernilai 7 untuk pengiriman mingguan, termasuk jadwal dua atau tiga kali seminggu. L bernilai 14 untuk pengiriman dua mingguan.

Cakupan dihitung dari H−p sampai H+L−1, termasuk kedua tanggal tersebut. Jadi jumlah hari cakupan adalah L+p. Setiap pengiriman tetap memakai cakupan penuh, meskipun jadwal pengiriman berikutnya lebih dekat atau cakupannya bertumpang tindih.

Kebutuhan barang adalah penjumlahan rata-rata penjualan sesuai kategori efektif setiap tanggal dalam cakupan tersebut.

> ▶ Revisi (2026-10-12, UAT ketiga, workbook pemilik "Phase 1_2" sheet PHASE 2 dan DATABASE): **panjang cakupan L mengikuti jarak ke pengiriman berikutnya.** Dua paragraf di atas tentang nilai L dan "cakupan penuh meskipun jadwal pengiriman berikutnya lebih dekat" tidak berlaku lagi.
> - Cakupan tetap H−p sampai H+L−1 (L+p hari). **L = jumlah hari dari H sampai sehari sebelum tanggal kirim berikutnya menurut jadwal aktif toko itu.** Jadi cakupan berakhir sehari sebelum pengiriman berikutnya.
> - Hasilnya: 1× seminggu L = 7; dua mingguan dengan satu hari kirim L = 14; 2× dan 3× seminggu L = selisih hari ke hari kirim berikutnya (melintasi akhir minggu bila perlu). Dua mingguan dengan lebih dari satu hari kirim mengikuti aturan yang sama.
> - Khusus **1× sebulan: L = 30** (siklus 30 hari seperti di workbook), walaupun pengiriman bulan berikutnya bisa 28 atau 35 hari kemudian.
> - Hari persiapan pengiriman berikutnya boleh tumpang tindih dengan cakupan pengiriman sebelumnya dan tetap dihitung di keduanya, seperti di workbook.
> - Contoh (SMB, 2× seminggu: Senin H, Kamis H−1; rata-rata PW110P-GOR Senin–Kamis 5, Jumat 5, Sabtu 8, Minggu 7): kirim Senin → cakupan Senin–Rabu (L = 3, p = 0), kebutuhan 15; kirim Kamis → cakupan Rabu–Minggu (L = 4, p = 1), kebutuhan 30. Sebelumnya sistem memakai L = 7 untuk keduanya (40 + 40).
> - Rata-rata, kategori efektif, buffer ranking (20% / 10%), dan rumus jumlah kirim tidak berubah. Buffer tetap mengikuti ranking pusat, bukan satu angka manual seperti di workbook.
> - Rencana final yang sudah ada tidak berubah (snapshot). Golden `jumlah-kirim.json` (pola mingguan, L = 7) tetap berlaku.

> ▶ Keputusan (2026-10-12, UAT ketiga): peringatan **"kiriman sebelumnya belum sampai"**.
> - Jika hari persiapan (H−p) jatuh pada atau sebelum tanggal kirim sebelumnya menurut jadwal aktif toko itu (p ≥ jarak dari pengiriman sebelumnya), draft toko itu menampilkan peringatan: "Kiriman <hari, tanggal> belum sampai saat persiapan. Pastikan jumlahnya ikut dihitung di stok akhir."
> - Peringatan tampil dengan ikon + teks dan **tidak** menahan finalisasi.

> ▶ Revisi (2026-10-13, pemilik): "tanggal kirim berikutnya" (L) dan "tanggal kirim sebelumnya" (peringatan) di dua blok di atas dibaca dari **tanggal kirim toko**, yaitu jadwal tetap ditambah pengiriman di luar jadwal yang berlaku, bukan dari jadwal tetap saja. Rinciannya dan contoh BOTANI ada di A5 ▶ Revisi 2026-10-13.

Jumlah kirim = nilai terbesar antara 0 dan pembulatan ke atas dari:
(Kebutuhan barang − Stok akhir) × (1 + Buffer).
Stok dikurangkan tepat satu kali sebelum buffer diterapkan.

> ▶ Keputusan (ADR-0008): semua pembulatan dan buffer dihitung dengan aritmetika bilangan bulat.

Ranking pusat berasal dari file yang dipublikasikan admin dengan bulan dan versi tertentu, serta berlaku lintas gudang. Tujuh keluarga aroma teratas mendapatkan buffer 20% untuk varian yang cocok dengan keluarga tersebut. Produk otomatis lainnya mendapatkan buffer 10%.

> ▶ Keputusan (OD-05, 2026-10-09): struktur file ranking pusat.
> - Contoh file dari pemilik: `data-lokal/RANKING-SALES-SEPTEMBER-2026.xlsx` (tidak di-commit). Golden: `tests/golden/ranking-september-2026.json`.
> - Struktur: sheet `RANKING SALES`, header di baris 1: `RANK`, `VARIANT`, `QTY SALES`. Baris kosong diabaikan. Struktur lain ditolak dengan pesan yang jelas.
> - Bulan ranking dipilih admin saat mengunggah. Nama file hanya menjadi saran isian awal.
> - Tujuh besar = baris dengan `RANK` 1–7, persis seperti di file. `RANK` harus bilangan bulat, unik, dan berurutan mulai dari 1; jika ganda atau loncat → error. `VARIANT` unik dan tidak kosong. `QTY SALES` bilangan bulat ≥ 0 (hanya informasi).
> - Setiap baris ranking adalah satu kelompok ranking (keluarga aroma), termasuk `GIFT SET BOX` (produk kotak hadiah). Baris dicocokkan ke keluarga lewat alias, persis setelah normalisasi (ADR-0006).
> - Ranking yang berlaku = ranking terakhir yang dipublikasikan admin, untuk semua gudang. Ranking lama diarsipkan. Rencana final menyimpan bulan dan versi ranking yang dipakai.

> ▶ Keputusan (2026-10-10, T53/T45): keluarga aroma nonaktif.
> - Baris ranking boleh cocok ke keluarga aroma yang nonaktif. Baris itu ditandai peringatan di halaman tinjau, tetapi tidak menahan publikasi.
> - Di pemetaan produk, keluarga nonaktif tidak muncul sebagai pilihan untuk pemetaan baru. Pemetaan lama ke keluarga yang kemudian dinonaktifkan tetap berlaku.

> ▶ Keputusan (2026-10-10, T67): usulan pemetaan dari segmen kode. Jika segmen kode cocok ke keluarga aktif dan juga ke keluarga nonaktif, keluarga aktif diusulkan. Jika lebih dari satu keluarga aktif cocok, tidak ada usulan.

> ▶ Keputusan (2026-10-10, T53): satu keluarga aroma tidak boleh muncul di lebih dari satu baris ranking. Jika dua baris atau lebih cocok ke keluarga yang sama, publikasi ditahan dengan pesan error yang menyebut keluarga dan baris-barisnya.

> ▶ Keputusan (2026-10-09, perencanaan M2–M3): draft rencana dan dasar perhitungannya.
> - Draft dibuat per gudang dan tanggal kirim yang dipilih operator. Isinya semua toko gudang itu yang menurut jadwal aktifnya mengirim pada tanggal tersebut.
> - Varian per toko = semua produk yang barisnya ada di impor aktif periode sumber untuk toko itu, termasuk yang penjualannya nol. Produk manual ikut tampil dengan status `manual`.
> - Rata-rata yang dipakai untuk kebutuhan = Rata-rata Ringkasan per kategori hari atas bulan periode sumber gudang (A4, ADR-0003).
> - Jika belum ada ranking yang dipublikasikan, perhitungan tidak berjalan dan pesan "Ranking pusat belum dipublikasikan" tampil.
> - Produk otomatis yang keluarga aromanya belum dipetakan tampil sebagai masalah dan menahan finalisasi (ADR-0006).

> ▶ Keputusan (2026-10-10, T58): draft rencana.
> - Jika **semua** bulan periode sumber tidak punya data aktif, perhitungan ditolak dengan pesan yang jelas dan draft tidak dibuat (sama seperti saat periode sumber belum ditetapkan).
> - Toko nonaktif tidak ikut masuk draft walaupun masih punya jadwal aktif. Halaman Pengiriman Gudang menampilkan peringatan "Toko <nama> nonaktif tetapi masih punya jadwal aktif".

Contoh: rata-rata Senin–Kamis adalah 4, Jumat 4, Sabtu 10, dan Minggu 8. Pengiriman Senin dengan persiapan dua hari mencakup Sabtu sebelumnya sampai Minggu berikutnya, sebanyak sembilan hari.
Kebutuhan = (4 × 4) + (1 × 4) + (2 × 10) + (2 × 8) = 56 unit.
Jika stok akhir 20 dan aromanya termasuk tujuh besar:
Jumlah kirim = pembulatan ke atas dari (56−20) × 1,20 = 44 unit.

> ▶ Golden: `tests/golden/jumlah-kirim.json`.

Stok yang belum diisi berarti belum diketahui, bukan nol. Stok negatif untuk produk otomatis, identitas ambigu, duplikasi, atau kebutuhan yang tidak tersedia harus diselesaikan sebelum finalisasi.

> ▶ Keputusan (2026-10-09, T05): masalah yang terjadi bersamaan.
> - **Produk manual** selalu berstatus `manual`, berapa pun stoknya. Stok kosong atau negatif pada produk manual tidak menahan finalisasi; aturan stok negatif di atas hanya untuk produk otomatis. Stok yang diisi tetap disimpan dan ditampilkan.
> - **Produk otomatis:** mesin mengembalikan **semua** masalah yang terjadi sebagai daftar, bukan satu status. Semuanya harus beres sebelum finalisasi. Urutan tampilan: `kebutuhan-tidak-tersedia`, `stok-negatif`, `stok-belum-diisi`.
> - Jika masalahnya hanya soal stok, kebutuhan tetap ditampilkan beserta rinciannya, dan jumlah kirim tampil "—".
> - Jika kebutuhan tidak tersedia, tampilkan tanggal dan kategori mana yang tidak punya rata-rata.

> ▶ Keputusan (2026-10-10, T66): masalah `belum-dipetakan` (produk otomatis yang keluarga aromanya belum dipetakan) tampil di daftar masalah yang sama. Urutan tampilan menjadi: `kebutuhan-tidak-tersedia`, `belum-dipetakan`, `stok-negatif`, `stok-belum-diisi`.

> ▶ Keputusan (2026-10-12, UAT): unggah file stok dan alias nama stok.
> - **File stok** adalah ekspor stok akhir satu toko dari sistem kasir. Contoh pemilik: `data-lokal/ENDING STOK DPM 5 OKT.csv` (tidak di-commit). Format: CSV berpemisah `;` atau workbook `.xlsx` (sheet pertama). Baris pertama adalah judul kolom `Name - Variant`, `Category`, `Ending`, dicocokkan setelah normalisasi; `Category` boleh tidak ada dan tidak dipakai; kolom lain diabaikan. Struktur lain ditolak dengan pesan yang jelas.
> - **Alias nama stok**: nama produk di file stok yang dipetakan ke tepat satu kode produk. Satu produk boleh punya beberapa alias. Nama master produk berlaku sebagai alias bawaan. Pencocokan **persis setelah normalisasi** (trim, spasi ganda menjadi satu, huruf besar; sama dengan alias keluarga aroma), tanpa pencocokan mirip. Hanya admin yang mengelola alias: tambah dan hapus satu per satu, serta unggah tabel alias (CSV `;` atau `.xlsx`, kolom `Nama di file stok` dan `Kode produk`) dengan hasil per baris: ditambahkan, sudah ada (pemetaan sama), atau ditolak (kode produk tidak dikenal, alias sudah dipakai produk lain, atau alias ganda di file). Baris yang ditolak tidak menahan baris lain.
> - **Unggah stok** dilakukan operator berhak `input-stok` di draft rencana, pada toko yang sedang dibuka; satu file = satu toko. Hasil pembacaan mengisi isian stok toko itu sebagai isian **belum disimpan** (sama seperti diketik manual, termasuk perlindungan draft); operator meninjau lalu menekan "Simpan stok". Varian draft tanpa baris di file tidak berubah. `Ending` kosong = belum diketahui; bilangan bulat negatif diterima dan aturan stok negatif tetap berlaku.
> - Ringkasan hasil unggahan tampil dekat form stok: jumlah varian terisi; baris **tidak dikenal** (nama tanpa alias) beserta daftar namanya dan keterangan bahwa admin yang memetakan alias; baris **diabaikan** (produk dikenal tetapi bukan varian toko ini di draft); baris **nilai tidak valid** (bukan bilangan bulat, atau nama yang muncul lebih dari sekali di file) beserta nomor barisnya. Hanya baris terisi yang mengubah isian.
> ▶ Keputusan (2026-10-12, UAT kedua): tombol **"Isi 0 untuk stok yang kosong"** per toko di draft rencana (hak `input-stok`).
> - Mengisi 0 hanya pada **produk otomatis** yang stok akhirnya masih kosong, sebagai isian **belum disimpan**; operator meninjau lalu menekan "Simpan stok". Produk manual dan stok yang sudah terisi (termasuk stok negatif) tidak diubah.
> - Tombol menyebut jumlah varian yang akan diisi, misalnya "Isi 0 untuk 110 stok yang kosong", dan tidak bisa ditekan jika jumlahnya 0.
> - Aturan "stok kosong = belum diketahui, bukan nol" tetap berlaku: nol hanya masuk lewat tindakan eksplisit operator.


Display, display tester, dan kertas tester ditangani manual tanpa jumlah kirim atau buffer otomatis. Jangan menganggap semua produk dengan kata “tester” memiliki perlakuan yang sama tanpa konfirmasi.

> ▶ Revisi (2026-10-08, ADR-0007): pemilik mengoreksi kalimat di atas. **Yang ditangani manual hanya display tester (kode berakhiran `-T`) dan kertas tester (kategori `KTP`/`KTL`).** Display biasa, display dummy, display rework, ATOMIZER, GIFT SET, HAMPERS, KEMASAN, VIAL, dan ALKOHOL dihitung otomatis. Golden: `tests/golden/klasifikasi-produk.json`.

### A7. Ketika saya menyimpan dan memfinalisasi

Setiap form harus membedakan kondisi belum disimpan, sedang menyimpan, berhasil, dan gagal. Tampilkan pesan dekat bagian yang dikerjakan; notifikasi singkat dapat menjadi tambahan. Jika penyimpanan berhasil tetapi tampilan gagal dimuat ulang, jelaskan keadaan itu agar pengguna tidak mengulangi tindakan yang sebenarnya sudah berhasil.

Lindungi draft ketika pengguna berpindah halaman atau mengalami gangguan akses sementara. Perubahan sumber, jadwal, atau konfigurasi harus menandai hasil lama sebagai perlu dihitung ulang, tanpa menghapus stok yang sudah dimasukkan.

Saat finalisasi, simpan rencana beserta keadaan sumber penjualan, stok, ranking dan versinya, jadwal, kalender, tanggal cakupan, serta identitas file yang digunakan. Riwayat final harus tetap dapat dijelaskan dan tidak berubah akibat pembaruan data berikutnya.

Finalisasi hanya menyatakan rencana kebutuhan barang telah disimpan. Jangan menyamakannya dengan konfirmasi pengiriman fisik atau penerimaan barang.

Saya ingin alur akhirnya terasa sederhana: data penjualan yang valid menghasilkan laporan yang jelas; operator memakai sumber, jadwal, ranking, dan stok yang benar; sistem memperlihatkan perhitungan; pengguna memeriksa dan memfinalisasi rencana; kemudian hasilnya dapat diekspor dan ditelusuri kembali.

> ▶ Keputusan (2026-10-09): ekspor rencana dalam format Excel (`.xlsx`).
> ▶ Keputusan (2026-10-09, perencanaan M2–M3): finalisasi dilakukan per toko per tanggal kirim, sehingga masalah di satu toko tidak menahan toko lain.
> ▶ Keputusan (2026-10-09, perencanaan M2–M3): ekspor rencana hanya untuk rencana final, termasuk dari riwayat, dan membutuhkan hak tindakan `ekspor` di gudang itu.
> ▶ Keputusan (2026-10-10, T61): stok untuk varian atau toko yang hilang dari draft setelah dihitung ulang tetap **disimpan** dan ditampilkan sebagai keterangan di draft. Jika varian atau toko itu muncul lagi di hitungan berikutnya, stoknya dipakai kembali.
> ▶ Keputusan (2026-10-11, T62): finalisasi.
> - **Finalisasi ulang boleh.** Finalisasi ulang toko yang sudah final untuk tanggal kirim yang sama menghasilkan versi baru; versi lama tetap utuh di riwayat. Alasan finalisasi ulang wajib diisi. Versi baru ditandai jelas, misalnya "Versi 2 menggantikan versi 1".
> - **Toko yang hanya berisi produk manual boleh difinalisasi.** Toko tanpa varian sama sekali **tidak boleh** difinalisasi dan tampil sebagai masalah "Tidak ada varian dari periode sumber untuk toko ini".
> - **Jika draft perlu dihitung ulang, hanya toko yang terdampak yang tertahan finalisasinya.** Toko lain di draft yang sama tetap bisa difinalisasi.

> ▶ Keputusan (2026-10-13, pemilik): **ekspor rencana final ke Google Sheets**, sebagai tambahan ekspor `.xlsx` (bukan pengganti).
> - Tombol "Ekspor ke Google Sheets" ada di samping "Ekspor .xlsx", di setiap tempat ekspor rencana final tersedia. Hak yang dipakai sama: hak tindakan `ekspor` di gudang itu.
> - Isinya sama dengan file `.xlsx`: baris keterangan, lalu tabel produk. Nama spreadsheet = nama file `.xlsx` tanpa ekstensi.
> - Spreadsheet dibuat di **satu folder di Shared Drive Google milik MANDALIKA**, satu spreadsheet per versi rencana final.
>   - Tautannya disimpan. Klik berikutnya untuk versi yang sama membuka spreadsheet itu dan tidak membuat salinan baru.
>   - Rencana final adalah snapshot, jadi isinya tidak perlu diperbarui. Siapa yang bisa membuka spreadsheet diatur lewat keanggotaan folder di Google, bukan di aplikasi.
>   - Perubahan yang dibuat orang di Google Sheets tidak mengubah rencana final di aplikasi. Sumber kebenaran tetap rencana final di aplikasi.
> - Setelah berhasil, tampil tautan "Buka di Google Sheets" yang membuka tab baru.
>   - Jika gagal, tampil pesan yang jelas dan tindakan tidak diulang otomatis.
>   - Jika hasilnya belum pasti (misalnya koneksi terputus), pesan menyarankan memeriksa folder sebelum mencoba lagi.
> - Tombol hanya tampil jika koneksi Google sudah diatur di server (akun layanan dan folder tujuan).

---

## Bagian B — Kalender & Kategori Hari (teks pemilik, 2026-10-08)

### B1. Tujuan fitur Kalender

Saya membutuhkan fitur **Kalender & Kategori Hari** untuk melihat kalender bisnis, informasi hari libur, dan kategori hari yang digunakan dalam laporan penjualan serta perhitungan kebutuhan pengiriman.

Kalender menampilkan:
- Bulan dan tahun, dengan navigasi ke periode lain.
- Susunan hari Senin–Minggu dan penanda hari ini.
- Kategori dasar dan kategori efektif setiap tanggal.
- Nama serta jenis hari libur.
- Penanda perubahan kategori, alasan, dan cakupan tokonya.
- Detail tanggal, bulan laporan, dan nomor minggu laporan.

Pengguna harus dapat membedakan hari sebenarnya, informasi libur, dan kategori yang dipakai untuk menghitung.

> ▶ Keputusan (2026-10-09, perencanaan M2–M3): semua pengguna yang sudah masuk (admin, operator, viewer) boleh melihat Kalender. Mengubah kalender (perubahan kategori, sinkronisasi, dan aktivasi snapshot libur) hanya admin.

### B2. Sumber API Hari Libur

Gunakan API Hari Libur Indonesia:
https://api-hari-libur.vercel.app/

Pengambilan satu tahun:
GET https://api-hari-libur.vercel.app/api?year=2026

Parameter `year` mengikuti tahun yang dipilih admin. Untuk snapshot tahunan, ambil satu tahun penuh.

Respons memuat daftar pada `data`, dengan setiap entri berisi:
- `date`: tanggal dalam format YYYY-MM-DD.
- `description`: nama atau keterangan hari libur.

Jangan memakai pemetaan field provider lama (`tanggal`, `keterangan`, `is_cuti`). Respons yang diperiksa tidak menyediakan penanda cuti bersama terpisah. Jika klasifikasi diperlukan, keterangan “Cuti Bersama” dapat menjadi petunjuk awal untuk ditinjau admin; jangan menganggap klasifikasi yang ambigu sudah pasti.

Validasi respons, tanggal, tahun, dan duplikasi. Simpan hasil sebagai snapshot tahunan menunggu persetujuan admin. Jangan langsung mengganti daftar aktif.

API ini merupakan sumber pihak ketiga, bukan jaminan kebenaran penetapan pemerintah. Admin tetap meninjau data sebelum aktivasi. Jika pengambilan gagal, pertahankan snapshot aktif terakhir dan tampilkan kegagalan sinkronisasi.

API hanya menyediakan informasi libur. Nama hari, nomor minggu, dan bulan laporan tetap dihitung dari aturan kalender ASOY. Libur tidak otomatis menjadi kategori Minggu atau menggeser jadwal pengiriman.

> ▶ Revisi (2026-10-08): "ASOY" adalah salah ketik pemilik. Maksudnya: aturan kalender pada §B5.
> ▶ Keputusan (2026-10-09, perencanaan M2–M3): jenis libur diusulkan dari keterangan: berisi "Cuti Bersama" → "cuti bersama", selain itu → "libur nasional". Usulan ini hanya petunjuk untuk ditinjau admin.
> ▶ Keputusan (2026-10-10, T40): respons API yang daftar liburnya kosong dianggap sinkronisasi gagal. Tidak ada snapshot baru yang dibuat, snapshot aktif dipertahankan, dan kegagalan tercatat serta tampil.

### B3. Peninjauan dan persetujuan hasil sinkronisasi

Hasil sinkronisasi disimpan sebagai **snapshot tahunan berstatus menunggu persetujuan**, bukan langsung mengganti kalender aktif.

Admin dapat meninjau:
- Tahun dan daftar tanggal libur.
- Nama serta jenis libur.
- Sumber dan waktu sinkronisasi.
- Status snapshot.
- Perubahan dibandingkan daftar aktif sebelumnya.

Setelah admin menyetujui dan mengaktifkannya, snapshot tersebut menjadi daftar libur aktif untuk tahun terkait. Snapshot aktif sebelumnya menjadi arsip tanpa dihapus.

Sediakan riwayat sinkronisasi, persetujuan, dan aktivasi ulang. Simpan identitas serta waktu persetujuan pertama; aktivasi berikutnya dicatat sebagai kejadian tersendiri. Data yang berubah setelah ditinjau harus diperiksa kembali sebelum diaktifkan.

Persetujuan snapshot hanya menentukan informasi libur yang ditampilkan pada kalender. Persetujuan ini **tidak otomatis mengubah kategori perhitungan** dan tidak membuat perubahan kategori manual.

### B4. Kategori dasar dan perubahan kategori manual

Kategori dasar mengikuti tanggal sebenarnya:
- Senin–Kamis
- Jumat
- Sabtu
- Minggu

Libur nasional dan cuti bersama **tidak otomatis menjadi kategori Minggu**. Senin yang bertepatan dengan libur tetap termasuk Senin–Kamis, kecuali admin menetapkan kategori pengganti.

Admin boleh mengubah kategori suatu tanggal dengan alasan dan cakupan:
- Seluruh toko; atau
- Toko tertentu.

Urutan kategori efektif yang digunakan adalah:
1. Perubahan aktif khusus toko tersebut.
2. Perubahan aktif untuk seluruh toko.
3. Kategori dasar tanggal.

Jika terdapat beberapa revisi pada tanggal dan cakupan yang sama, gunakan revisi aktif terbaru secara konsisten.

Perubahan khusus toko tidak boleh memengaruhi toko lain. Tampilan kalender harus mengikuti cakupan yang sedang dilihat, bukan mewarnai seluruh kalender berdasarkan perubahan salah satu toko.

Hanya admin yang boleh membuat atau membatalkan perubahan kategori. Simpan tanggal, cakupan, kategori sebelum/sesudah, alasan, pelaku, waktu, revisi, dan statusnya. Pembatalan mempertahankan jejak perubahan.

Sinkronisasi daftar libur tidak boleh menimpa perubahan kategori manual.

> ▶ Keputusan (2026-10-10, T42): perubahan kategori manual.
> - "Kategori sebelum" = kategori yang berlaku untuk cakupan itu tepat sebelum perubahan dibuat (untuk satu toko: perubahan toko itu, lalu perubahan seluruh toko, lalu kategori dasar; untuk seluruh toko: perubahan seluruh toko, lalu kategori dasar).
> - Untuk mengganti kategori, admin mengedit perubahan; hasilnya revisi baru pada tanggal dan cakupan yang sama.
> - "Batalkan" membatalkan **seluruh** perubahan pada tanggal + cakupan itu, sehingga tanggal kembali ke level berikutnya (perubahan seluruh toko, atau kategori dasar). Riwayat semua revisi tetap tersimpan.
> - Pembatalan wajib disertai alasan. Cara penyimpanannya adalah keputusan teknis.

> ▶ Keputusan (2026-10-10, T43): detail tanggal di Kalender menampilkan perubahan kategori yang sudah dibatalkan sebagai riwayat, berlabel "Dibatalkan", terpisah dari kategori efektif.

Bedakan tiga tindakan berikut:
- Persetujuan snapshot hasil sinkronisasi libur.
- Perubahan kategori tanggal secara manual oleh admin.
- Persetujuan jadwal Pengiriman Gudang.

Ketiganya bukan satu alur persetujuan yang sama.

> ▶ Golden: `tests/golden/kategori-efektif.json`.

### B5. Aturan bulan dan nomor minggu laporan

**Senin–Kamis.** Gunakan **Kamis pada minggu yang sama** sebagai tanggal acuan.
- Bulan dan tahun laporan mengikuti Kamis tersebut.
- Nomor minggu = pembulatan ke atas dari tanggal Kamis dalam bulan dibagi 7.

**Jumat, Sabtu, dan Minggu.** Gunakan tanggal masing-masing sebagai acuan.
- Bulan dan tahun laporan mengikuti tanggalnya sendiri.
- Nomor minggu = pembulatan ke atas dari tanggal dalam bulan dibagi 7.

Nomor minggu ini bukan ISO week tahunan dan bukan nomor baris pada kisi kalender.

Contoh yang harus menghasilkan pengelompokan berikut:

| Tanggal sebenarnya | Bulan laporan | Minggu laporan |
|---|---|---:|
| 27–30 April 2026 | April 2026 | 5 |
| 1–3 Mei 2026 | Mei 2026 | 1 |
| 4–7 Mei 2026 | Mei 2026 | 1 |
| 8–10 Mei 2026 | Mei 2026 | 2 |
| 29–30 Juni dan 1–2 Juli 2026 | Juli 2026 | 1 |
| 29–31 Desember 2025 dan 1 Januari 2026 | Januari 2026 | 1 |
| 28–31 Desember 2026 | Desember 2026 | 5 |
| 1–3 Januari 2027 | Januari 2027 | 1 |

Satu baris kalender dapat memiliki dua nomor minggu laporan. Contohnya, dalam baris 4–10 Mei, Senin–Kamis masuk Minggu 1, sedangkan Jumat–Minggu masuk Minggu 2. Jangan memberikan satu label minggu untuk seluruh baris jika hasilnya menyesatkan.

> ▶ Golden: `tests/golden/kalender-minggu-laporan.json` (setiap tanggal di tabel dijabarkan).

### B6. Perubahan kategori tidak memindahkan tanggal asal

Perubahan kategori hanya mengganti **kategori efektif** yang digunakan untuk pengelompokan perhitungan.

Tanggal asli, bulan laporan, dan nomor minggu asal tetap mengikuti aturan tanggal dasar. Jangan menghitung ulang posisi bulan/minggu berdasarkan kategori pengganti.

Contoh: Selasa, 30 Juni 2026, termasuk laporan Juli Minggu 1 karena mengikuti Kamis, 2 Juli. Jika admin mengubah kategorinya menjadi Jumat, tanggal tersebut tetap berada pada laporan Juli Minggu 1.

### B7. Bedakan bulan sumber impor dan bulan laporan

Data 29–30 Juni yang berasal dari sheet Juni tetap disimpan dengan tanggal aslinya, tetapi termasuk kelompok laporan Juli.

Artinya:
- Mengimpor sheet Juni tetap menyimpan kedua tanggal tersebut.
- Filter laporan Juni tidak memasukkannya.
- Filter laporan Juli dapat memakainya jika datanya sudah diimpor.

Ini bukan penghapusan penjualan. Jangan otomatis mengimpor sheet Juli atau menciptakan tanggal lain yang belum tersedia.

### B8. Pembacaan dan validasi tanggal

Tanggal Excel dibaca sebagai **DD/MM**, **DD/MM/YYYY**, atau tanggal numerik Excel yang valid. Tahun untuk format tanpa tahun berasal dari tahun impor yang dipilih.

Jangan menafsirkan `12/6` sebagai 6 Desember. Tanggal bisnis tidak boleh bergeser akibat konversi zona waktu. Tampilan pengguna memakai format Indonesia, misalnya **Jumat, 05-06-2026**.

Tanggal seperti `31/6` dan `31/4` tidak valid:
- Jika kolom tersebut berisi penjualan, tampilkan error beserta lokasi sheet/sel dan tahan publikasi sampai diperbaiki.
- Jika seluruh kolom merupakan template kosong, tampilkan peringatan dan lewati kolom itu; kolom valid tetap diproses.
- Nilai nol yang benar-benar terisi tetap merupakan data, bukan kolom kosong.

Jangan memindahkan angka tersebut ke bulan berikutnya atau mengabaikannya diam-diam. Catatan dan formula pada workbook tidak otomatis menggantikan aturan bisnis ini.

> ▶ Keputusan (ADR-0005): kolom tanggal invalid yang hanya berisi nol yang diketik = berisi data → error.
> ▶ Temuan data 2026-10-08: `SEPTEMBER (S)` memiliki 749 sel berisi penjualan pada kolom `31/9`. Impor September tertahan sampai file diperbaiki (tindakan pemilik, lihat OPEN-DECISIONS).
> ▶ Golden: `tests/golden/tanggal-impor.json`.

### B9. Dampak terhadap laporan dan pengiriman

Perubahan kategori memperbarui laporan dan draft perhitungan yang terdampak. Perhitungan pengiriman yang telah ditinjau perlu diperiksa atau dihitung ulang ketika aturan kalender relevannya berubah. Input stok tetap dipertahankan.

> ▶ Keputusan (2026-10-10, T61): perubahan kalender hanya menandai draft yang **terdampak** sebagai perlu dihitung ulang. Draft terdampak jika tanggal yang diubah masuk cakupan draft **dan** cakupan perubahannya mengenai toko di draft itu (perubahan untuk semua toko, atau untuk toko itu sendiri).

Rencana pengiriman yang sudah final tetap menggunakan snapshot kalender dan sumber pada saat finalisasi. Jangan mengubah hasil final secara retroaktif.

Informasi libur juga tidak otomatis menggeser tanggal kirim, menghapus hari dari cakupan kebutuhan, atau menjadikan kebutuhan hari tersebut nol. Jangan menambahkan perilaku itu tanpa keputusan bisnis tersendiri.

### B10. Batas klarifikasi

Aturan penomoran minggu, perlakuan hari libur, dan tanggal invalid telah dijelaskan di atas; tidak perlu meminta saya menentukannya kembali.

Keputusan lain yang belum jelas tetap perlu ditanyakan secara terpisah, termasuk kewenangan periode sumber gudang, klasifikasi kode produk tertentu, perlakuan rework, dan hubungan sheet MP dengan toko atau gudang. Jangan menyimpulkan hubungan tersebut hanya dari kemiripan nama.

> ▶ Keputusan: periode sumber → ADR-0003; klasifikasi kode → ADR-0007; rework → ADR-0006; sheet MP → ditunda (ADR-0005).

---

## Bagian C — Kebutuhan non-fungsional dan batas scope

### C1. Target performa

> ▶ Keputusan (OD-11, 2026-10-09): target performa di bawah disetujui pemilik.

Diukur dengan data 12 bulan, 25 toko, ±360 produk, server database di region Singapura.

| Kegiatan | Target |
|---|---|
| Membuka halaman laporan, filter 1–12 bulan | p95 < 1 detik |
| Membaca dan memvalidasi satu sheet penjualan setelah unggah selesai | < 60 detik, dengan status progres terlihat |
| Membuka halaman Pengiriman Gudang untuk satu gudang | p95 < 1,5 detik |

Membaca Excel dan menghitung rata-rata bertahap tidak dilakukan saat halaman dibuka. Lihat ADR-0002.

> ▶ Keputusan (2026-10-11, T65): uji performa.
> - Draft rencana gudang besar di halaman Pengiriman Gudang ditampilkan sebagai **ringkasan per toko**; rincian baris dibuka per toko.
> - Uji performa memakai **500 produk**. Workbook asli berisi 358–359 produk; angka sekitar 1.340 adalah jumlah baris termasuk baris kosong.

### C2. Bahasa dan tampilan

Antarmuka berbahasa Indonesia. Tanggal ditampilkan sebagai `Jumat, 05-06-2026`. Istilah layar mengikuti `CONTEXT.md`.

### C3. Di luar scope

Hal-hal berikut tidak dibangun sampai pemilik menambahkannya ke dokumen ini:

- Sheet `MP …` dan sheet BARDAT pada workbook.
- Model safety stock / nilai Z / service level dari sheet `Uji Perhitungan`, `Safety Stock`, `Ringkasan Safety Stock`, dan `Panduan PPIC`.
- Konfirmasi pengiriman fisik dan penerimaan barang.
- Penggeseran tanggal kirim, penghapusan hari dari cakupan, atau kebutuhan nol karena hari libur.
- Pencocokan produk, toko, atau keluarga aroma berdasarkan kemiripan nama (fuzzy).
- Pendaftaran akun mandiri oleh pengguna.
- Impor otomatis sheet lain di luar sheet yang dipilih pengguna.
