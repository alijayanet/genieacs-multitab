==============================================================================
   _____                _______ _ _              _   _      _
  / ____|              |__   __(_) |            | \ | |    | |
 | |  __  __ _ _ __   __ _| |   _| | ___   _ ___|  \| | ___| |_
 | | |_ |/ _` | '_ \ / _` | |  | | |/ / | | / __| . ` |/ _ \ __|
 | |__| | (_| | | | | (_| | |  | |   <| |_| \__ \ |\  |  __/ |_
  \_____|\__,_|_| |_|\__, |_|  |_|_|\_\__,_|___/_| \_|\___|\__|
                      __/ |
                     |___/

Installer Otomatis GenieACS v1.2.13 Modded by GangTikusNet
==============================================================================

DESKRIPSI SINGKAT
-----------------
Skrip ini dirancang untuk menginstal dan mengelola server GenieACS Anda
secara otomatis. Semua proses yang rumit, mulai dari instalasi awal
hingga pembaruan, telah disederhanakan ke dalam sebuah menu interaktif
yang mudah digunakan.


FITUR UTAMA
-----------
- Mendukung berbagai sistem operasi dan arsitektur.
- Pilihan tema dengan tombol Auto, Light, Dark yang elegan.
- Support MultiTab GenieAcs untuk mempercantik tampilan device.
- Support Onu Huawei (untuk merk lain dalam proses pengembangan)
- Support Ganti Logo Menggunakan Admin Dashbord.
- Support Role Administrator & Technical.
- Support Add Custom, Config, Parameter, dan lainnya.


KEBUTUHAN SISTEM (SYSTEM REQUIREMENTS)
---------------------------------------
- Arsitektur:
    - x86_64 (amd64)
    - Armbian/STB HG680P/B860H

- Sistem Operasi:
    - Debian 10 (Buster), Debian 11 (Bullseye)
    - Ubuntu 18.04 (Bionic), Ubuntu 20.04 (Focal)
    - Catatan: Untuk Armbian/STB, wajib Ubuntu 18 / 20 basis "balbes150".

- Hak Akses:
    - Wajib dijalankan dengan user root.

    Jika Anda belum login sebagai root, ada dua cara untuk menjalankan skrip:

    ---------------------------------------------------------------------
    OPSI 1: MENGAKTIFKAN LOGIN ROOT LANGSUNG (TIDAK DIREKOMENDASIKAN)
    ---------------------------------------------------------------------
    Gunakan cara ini hanya jika Anda mengerti risikonya.

    1. Login ke server Anda dengan user biasa.
    2. Edit file konfigurasi SSH:
       nano /etc/ssh/sshd_config

    3. Cari baris `#PermitRootLogin prohibit-password` atau sejenisnya,
       hapus tanda pagar `#` di depannya, dan ubah menjadi `yes`:
       PermitRootLogin yes

    4. Simpan file (Ctrl+O, Enter) dan keluar (Ctrl+X).
    5. Atur password untuk user root (jika belum pernah):
       passwd root
       (Masukkan password baru dua kali)

    6. Restart servis SSH untuk menerapkan perubahan:
       systemctl restart sshd

    7. Tutup terminal Anda, lalu buka lagi dan login sebagai user `root`
       dengan password yang baru Anda buat.

    ---------------------------------------------------------------------
    OPSI 2: MENGGUNAKAN `sudo` (DIREKOMENDASIKAN & LEBIH AMAN)
    ---------------------------------------------------------------------
    Ini adalah cara standar dan paling aman.

    1. Login ke server dengan user biasa Anda.
    2. Jalankan skrip dengan menambahkan `sudo` di depannya:
       ```
       sudo ./Installer-GenieACS.sh
       ```
    3. Anda akan diminta memasukkan password untuk user *Anda saat ini*,
       bukan password root.


CARA PENGGUNAAN
----------------
1.  Beri Izin Eksekusi pada Skrip (hanya perlu dilakukan sekali):
    Buka terminal Anda, lalu jalankan perintah:
    
    chmod +x Installer-GenieACS.sh

2.  Jalankan Skrip Utama (lihat bagian Hak Akses di atas):
    ```
    ./Installer-GenieACS.sh
    ```
Setelah itu, sebuah menu dengan berbagai pilihan akan muncul. Cukup ikuti
petunjuk dan pilih opsi yang sesuai dengan kebutuhan Anda.


user admin<br> pass admin <br>

terima kasih https://www.gangtikus.net/ 

Spesial Thanks ❤️ Zaidka & AnperMyId

©ode is Poetry 2025 Modded by GangTikusN
