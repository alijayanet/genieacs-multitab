# GENIEACS INSTALL MULTITAB

<img width="1358" height="650" alt="Image" src="https://github.com/user-attachments/assets/d2689a26-9eed-4449-a0d3-2edffddd7bc6" />
<img width="1358" height="650" alt="Image" src="https://github.com/user-attachments/assets/c13ed312-d007-4cc2-987d-e82f171dd7ce" />
<img width="1358" height="650" alt="Image" src="https://github.com/user-attachments/assets/fdf7acae-cd32-404d-a50e-d77b59156ea5" />
<img width="1358" height="650" alt="Image" src="https://github.com/user-attachments/assets/2d530df8-beb3-493e-ad04-8bafbc39ad3f" />

## Cara Penggunaan
```
apt install git curl -y
```
```
git clone https://github.com/alijayanet/multitab
```
```
cd multitab
```
```
chmod +x install-v22-04.sh && install-armbian.sh
```
Ubuntu 20.04/22.04
```
install-v22-04.sh
```
ARMBIAN
```
install-armbian.sh
```
```
reboot
```
## kalau sudah ada genieacsnya

```
cp -r genieacs /usr/lib/node_modules/
```
```
mongorestore --db genieacs --drop db
```
```
reboot
```
## Instalasi Menggunakan Docker (Direkomendasikan)

### Persyaratan
- Docker Engine 20.10.0 atau lebih baru
- Docker Compose 2.0.0 atau lebih baru
- Minimal 2GB RAM (4GB direkomendasikan)
- Minimal 10GB ruang disk

### Langkah-langkah Instalasi

1. **Clone Repository**
   ```bash
   git clone https://github.com/alijayanet/multitab.git
   cd multitab
   ```

2. **Persiapan Direktori**
   ```bash
   mkdir -p db ext logs config
   chmod -R 777 db ext logs
   ```

3. **Konfigurasi Awal**
   - Salin file konfigurasi contoh:
     ```bash
     cp config/genieacs.json.example config/genieacs.json
     ```
   - Edit file konfigurasi sesuai kebutuhan:
     ```bash
     nano config/genieacs.json
     ```

4. **Jalankan dengan Docker Compose**
   ```bash
   # Bangun dan jalankan container
   docker-compose up -d --build
   
   # Pantau log
   docker-compose logs -f
   ```

5. **Akses GenieACS**
   - Web UI: http://localhost:3000
     - Username: `admin`
     - Password: `admin` (menu virtualparameter dll di sembunyikan)
   - API: http://localhost:7557
   - CWMP (TR-069): `http://your-server-ip:7547`

### Perintah Penting

```bash
# Menjalankan perintah di dalam container
docker-compose exec genieacs <command>

# Melihat log
docker-compose logs -f

# Menghentikan semua layanan
docker-compose down

# Backup database
./backup-db.sh

# Restart layanan
docker-compose restart
```

### Variabel Lingkungan

Anda dapat menyesuaikan konfigurasi melalui environment variables di file `.env`:

```env
# Kredensial MongoDB
MONGO_INITDB_ROOT_USERNAME=genieacs
MONGO_INITDB_ROOT_PASSWORD=genieacs
MONGO_INITDB_DATABASE=genieacs

# Konfigurasi GenieACS
GENIEACS_UI_JWT_SECRET=your-secure-secret
GENIEACS_UI_INITIAL_USER=admin
GENIEACS_UI_INITIAL_PASSWORD=admin

# Opsional: Sesuaikan dengan kebutuhan
# NODE_ENV=production
# GENIEACS_EXT_DIR=/opt/genieacs/ext
```

### Menggunakan Docker Desktop

#### Cara 1: Menggunakan Docker Dashboard (GUI)
1. Buka Docker Desktop
2. Klik tombol "Build" di sidebar kiri
3. Pilih direktori proyek GenieACS
4. Beri nama image (contoh: `genieacs:latest`)
5. Klik "Build"

#### Cara 2: Menggunakan Terminal Docker Desktop
1. Buka terminal di Docker Desktop (atau terminal biasa)
2. Arahkan ke direktori proyek:
   ```bash
   cd /path/ke/multitab
   ```
3. Build image:
   ```bash
   docker build -t genieacs:latest .
   ```

#### Cara 3: Menggunakan Docker Compose (Direkomendasikan)
1. Buka terminal di direktori proyek
2. Jalankan perintah berikut untuk membangun dan menjalankan:
   ```bash
   # Build dan jalankan semua service
   docker-compose up -d --build
   
   # Atau untuk service tertentu (contoh: hanya genieacs)
   docker-compose up -d --build genieacs
   ```

#### Memeriksa Image yang Telah Dibangun
```bash
# Melihat daftar image
docker images

# Melihat container yang sedang berjalan
docker ps

# Melihat log container
docker logs <container_id>
```

#### Menjalankan Container dari Image yang Telah Dibangun
```bash
# Menjalankan container
docker run -d --name genieacs -p 3000:3000 -p 7547:7547 -p 7557:7557 -p 7567:7567 genieacs:latest

# Atau gunakan docker-compose
docker-compose up -d
```

#### Troubleshooting
- Jika build gagal, periksa log build:
  ```bash
  docker-compose logs --tail=100 -f
  ```
- Jika port sudah digunakan, hentikan service yang menggunakan port tersebut atau ubah port di `docker-compose.yml`
- Pastikan Docker Desktop sudah berjalan dengan baik (ikon Docker di system tray berwarna putih)

## Lisensi
 2025 ALIJAYA ACS MULTITAB### SILAHKAN YANG INGIN BERBAGI

![Image](https://github.com/user-attachments/assets/724e5ac2-626e-4f2d-bd1f-1265b70b544f)




