# Pembaruan: impor link, upload komputer, batas 7 menit

## Yang sudah dibuat

Di panel Source audio ada dua pilihan: **Dari link** dan **Dari komputer**. Link audio langsung dan audio dari YouTube masuk ke player, waveform, preset, EQ, serta jalur konversi yang sama seperti file komputer. Impor mengambil audio ke aplikasi; untuk menyimpan hasil ke folder Downloads, gunakan Unduh hasil setelah konversi.

Di pengaturan ada sakelar **Batasi hasil maksimal 7 menit**:

- OFF: durasi hasil mengikuti sumber dan speed, tanpa pemotongan 7 menit.
- ON: mengambil maksimal 7 menit pertama dari audio setelah speed diterapkan.
- Audio pendek tidak diperpanjang. Mengubah preset bawaan mempertahankan posisi sakelar; Reset semua mematikannya. Preset pribadi menyimpan posisi sakelar.
- Untuk codec lossy disediakan cadangan 0.1 detik agar padding encoder tidak membuat durasi container melewati 7:00.

## Preview lokal YouTube

1. Ekstrak source lengkap.
2. Jalankan **SETUP-YOUTUBE.cmd** sekali. Komponen dipasang di folder proyek, bukan instalasi global. Python dan internet diperlukan.
3. Jalankan **START-PREVIEW.cmd**.
4. Buka http://127.0.0.1:4173/, tempel satu link video YouTube, klik Ambil audio.

File lokal dan link file audio langsung tidak memerlukan komponen YouTube. Link file langsung harus mengizinkan akses browser (CORS). Halaman web biasa bukan link file audio.

## Terapkan tampilan, impor file langsung, dan batas 7 menit ke Pages

Di proyek **rubiuu-audio-lab**, pilih **Create a new deployment → Production**, lalu unggah **rubiuu-link-7menit-cloudflare-pages.zip** dan deploy. Ini mempertahankan domain yang sekarang. ZIP berisi website lengkap, worker API, dan mesin audio.

Upload ZIP ini langsung mengaktifkan kontrol baru, konversi lokal, batas 7 menit, dan impor link audio langsung yang diizinkan CORS. **YouTube publik masih memerlukan layanan backend yang diterbitkan dan dihubungkan.** UI akan menjelaskan statusnya sampai koneksi tersedia.

## Aktifkan YouTube pada website publik

Cloudflare Pages menyajikan antarmuka dan worker API. Pengambilan YouTube dijalankan oleh layanan Node.js + Python/yt-dlp terpisah; Dockerfile, backend, dan blueprint Render sudah disiapkan. Backend ini tidak menerima file komputer pengguna dan hanya menerima ID video YouTube yang valid. Tidak membutuhkan login YouTube atau cookie browser.

Salah satu jalur hosting yang disiapkan adalah Render:

1. Masuk sendiri ke GitHub dan Render melalui situs resminya. Buat repository baru untuk source lengkap ini. Jangan masukkan password atau token ke kode/chat.
2. Upload source proyek dengan `Dockerfile`, `render.yaml`, `backend/`, `dist/link-import.js`, dan `package.json` pada root repository. Folder vendor audio tidak diperlukan untuk backend.
3. Di Render pilih **New → Blueprint**, hubungkan repository, periksa konfigurasi service `rubiuu-youtube-import`, lalu deploy setelah meninjau paket/ketentuannya. Blueprint meminta paket free; ketersediaan, batas, dan pilihan paket tetap mengikuti dashboard akun. Tidak ada langganan berbayar yang dibuat oleh asisten.
4. Sesudah sehat, Render memberikan URL HTTPS backend. Salin URL tersebut.
5. Di dashboard service Render, buka Environment dan salin nilai rahasia **IMPORT_SERVICE_TOKEN** yang dibuat otomatis. Jangan mengirim nilainya ke chat atau menaruhnya di file JavaScript.
6. Di Cloudflare → **rubiuu-audio-lab → Settings → Variables and Secrets**, untuk Production tambahkan `IMPORT_SERVICE_URL` berisi URL HTTPS backend dan **secret** `IMPORT_SERVICE_TOKEN` berisi nilai yang sama dari Render.
7. Buat deployment Pages baru menggunakan ZIP di atas agar binding lingkungan diterapkan.
8. Buka website: status seharusnya **YouTube siap**. Tempel link video dan uji sampai audio muncul di player dan dapat dikonversi.

Jika memilih hosting lain, jalankan Dockerfile yang sama, set `IMPORT_SERVICE_TOKEN` secara privat di kedua dashboard, lalu isi `IMPORT_SERVICE_URL` dengan alamat layanan itu. Backend memerlukan HTTP request hingga 2 menit, koneksi internet keluar, dan penyimpanan sementara. Tidak membutuhkan database atau disk permanen.

Layanan free dapat tidur saat tidak digunakan. YouTube dapat membatasi IP server hosting atau menolak video tertentu walau link bekerja di komputer lokal. Aplikasi menampilkan error yang sesuai; tidak menjanjikan semua video selalu dapat diunduh. Backend membatasi dua proses bersamaan dan 10 impor per 10 menit per IP, maksimal 100 MB/20 menit, serta menghapus berkas sementara setelah respons.

Dokumentasi resmi:

- https://render.com/docs/docker
- https://render.com/docs/blueprint-spec
- https://render.com/docs/free
- https://developers.cloudflare.com/pages/functions/advanced-mode/
- https://github.com/yt-dlp/yt-dlp/wiki/EJS
