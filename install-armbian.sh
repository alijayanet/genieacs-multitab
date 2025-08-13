#!/bin/bash

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Inisialisasi variabel global
NODEJS_INSTALLED=false
MONGODB_INSTALLED=false
GENIEACS_INSTALLED=false

# Dapatkan IP lokal dan info sistem
local_ip=$(hostname -I | awk '{print $1}')
DISTRO_NAME=$(lsb_release -is)
DISTRO_VERSION=$(lsb_release -rs)
DISTRO_CODENAME=$(lsb_release -cs)
ARCH=$(uname -m)

echo -e "${GREEN}============================================================================${NC}"
echo -e "${GREEN}===================== INSTALASI GENIEACS - ARMBIAN ===================${NC}"
echo -e "${GREEN}============================================================================${NC}"
echo -e "${GREEN}=========== AAA   LL      IIIII     JJJ   AAA   YY   YY   AAA ==============${NC}"   
echo -e "${GREEN}========== AAAAA  LL       III      JJJ  AAAAA  YY   YY  AAAAA =============${NC}" 
echo -e "${GREEN}========= AA   AA LL       III      JJJ AA   AA  YYYYY  AA   AA ============${NC}"
echo -e "${GREEN}========= AAAAAAA LL       III  JJ  JJJ AAAAAAA   YYY   AAAAAAA ============${NC}"
echo -e "${GREEN}========= AA   AA LLLLLLL IIIII  JJJJJ  AA   AA   YYY   AA   AA ============${NC}"
echo -e "${GREEN}============================================================================${NC}"
echo -e "${GREEN}========================= . Info 081-947-215-703 ===========================${NC}"
echo -e "${GREEN}============================================================================${NC}"
echo -e "${GREEN}${NC}"
echo -e "${GREEN}Autoinstall GenieACS untuk Armbian.${NC}"
echo -e "${GREEN}Distro: ${DISTRO_NAME} ${DISTRO_VERSION} (${DISTRO_CODENAME})${NC}"
echo -e "${GREEN}Architecture: ${ARCH}${NC}"
echo -e "${GREEN}${NC}"
echo -e "${GREEN}============================================================================${NC}"
echo -e "${RED}${NC}"
echo -e "${GREEN} Apakah anda ingin melanjutkan? (y/n)${NC}"
read confirmation

if [ "$confirmation" != "y" ]; then
    echo -e "${GREEN}Install dibatalkan. Tidak ada perubahan dalam sistem anda.${NC}"
    exit 1
fi
for ((i = 5; i >= 1; i--)); do
	sleep 1
    echo "Melanjutkan dalam $i. Tekan ctrl+c untuk membatalkan"
done

echo -e "${YELLOW}Memulai instalasi GenieACS untuk Armbian...${NC}"

# Fungsi untuk mengecek instalasi yang sudah ada
check_existing_installations() {
    echo -e "${BLUE}============================================================================${NC}"
    echo -e "${BLUE}===================== PENGELEKAN INSTALASI YANG SUDAH ADA ===================${NC}"
    echo -e "${BLUE}============================================================================${NC}"
    
    # Cek Node.js
    if command -v node &> /dev/null && command -v npm &> /dev/null; then
        echo -e "${GREEN}✅ Node.js $(node -v) dan NPM $(npm -v) sudah terinstal${NC}"
        NODEJS_INSTALLED=true
    else
        echo -e "${YELLOW}⚠️  Node.js belum terinstal${NC}"
        NODEJS_INSTALLED=false
    fi
    
    # Cek MongoDB
    if systemctl is-active --quiet mongod 2>/dev/null || docker ps | grep -q mongodb; then
        echo -e "${GREEN}✅ MongoDB sudah terinstal dan berjalan${NC}"
        MONGODB_INSTALLED=true
    else
        echo -e "${YELLOW}⚠️  MongoDB belum terinstal${NC}"
        MONGODB_INSTALLED=false
    fi
    
    # Cek GenieACS
    if systemctl is-active --quiet genieacs-{cwmp,fs,ui,nbi} 2>/dev/null; then
        echo -e "${GREEN}✅ GenieACS sudah terinstal dan berjalan${NC}"
        GENIEACS_INSTALLED=true
    else
        echo -e "${YELLOW}⚠️  GenieACS belum terinstal${NC}"
        GENIEACS_INSTALLED=false
    fi
    
    echo -e "${BLUE}============================================================================${NC}"
    
    # Jika semua sudah terinstal, tanyakan untuk melanjutkan ke Multitab
    if [ "$NODEJS_INSTALLED" = true ] && [ "$MONGODB_INSTALLED" = true ] && [ "$GENIEACS_INSTALLED" = true ]; then
        echo -e "${GREEN}🎉 Semua komponen sudah terinstal!${NC}"
        echo -e "${YELLOW}Apakah Anda ingin melanjutkan ke instalasi Multitab dan restore virtual parameter? (y/n)${NC}"
        read multitab_choice
        
        if [ "$multitab_choice" = "y" ]; then
            echo -e "${GREEN}Melanjutkan ke instalasi Multitab...${NC}"
            install_multitab_and_restore
        else
            echo -e "${GREEN}Instalasi dibatalkan. GenieACS sudah siap digunakan.${NC}"
            echo -e "${GREEN}GenieACS UI dapat diakses di: http://$local_ip:3000${NC}"
            exit 0
        fi
    fi
}

# Fungsi untuk menginstal Multitab dan restore virtual parameter
install_multitab_and_restore() {
    echo -e "${BLUE}============================================================================${NC}"
    echo -e "${BLUE}===================== INSTALASI MULTITAB & RESTORE VIRTUAL PARAMETER ===================${NC}"
    echo -e "${BLUE}============================================================================${NC}"
    
    # Cek apakah direktori genieacs ada
    if [ -d "genieacs" ]; then
        echo -e "${YELLOW}Menginstal Multitab...${NC}"
        
        # Copy genieacs ke direktori yang sesuai
        cp -r genieacs /usr/lib/node_modules/
        echo -e "${GREEN}✅ Multitab berhasil diinstal${NC}"
        
        # Restore database
        echo -e "${YELLOW}Melakukan restore virtual parameter...${NC}"
        if [ -d "db" ]; then
            mongorestore --db genieacs --drop db
            echo -e "${GREEN}✅ Restore virtual parameter berhasil${NC}"
        else
            echo -e "${RED}❌ Direktori 'db' tidak ditemukan untuk restore${NC}"
        fi
        
        # Restart GenieACS services
        echo -e "${YELLOW}Restart GenieACS services...${NC}"
        systemctl daemon-reload
        systemctl stop --now genieacs-{cwmp,fs,ui,nbi}
        systemctl start --now genieacs-{cwmp,fs,ui,nbi}
        
        echo -e "${GREEN}✅ Instalasi Multitab dan restore virtual parameter selesai!${NC}"
        echo -e "${GREEN}GenieACS UI dapat diakses di: http://$local_ip:3000${NC}"
        echo -e "${GREEN}Multitab sudah terintegrasi dengan GenieACS${NC}"
    else
        echo -e "${RED}❌ Direktori 'genieacs' tidak ditemukan${NC}"
        echo -e "${YELLOW}Pastikan file genieacs ada di direktori yang sama dengan script ini${NC}"
    fi
}

# Panggil fungsi pengecekan
check_existing_installations

# Fungsi untuk menginstal Node.js untuk Armbian
install_nodejs() {
    echo -e "${YELLOW}Menginstal Node.js untuk Armbian...${NC}"
    
    # Hapus instalasi Node.js lama yang bermasalah
    echo -e "${YELLOW}Membersihkan instalasi Node.js lama...${NC}"
    apt-get remove --purge -y nodejs npm nodejs-doc libnode-dev 2>/dev/null || true
    rm -rf /etc/apt/sources.list.d/nodesource.list* \
           /usr/lib/node_modules \
           ~/.npm
    
    # Update package list
    echo -e "${YELLOW}Memperbarui daftar paket...${NC}"
    apt-get update -y
    
    # Install dependencies yang diperlukan
    echo -e "${YELLOW}Menginstal dependensi yang diperlukan...${NC}"
    apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        gnupg \
        lsb-release
    
    # Untuk Armbian, gunakan nvm sebagai metode utama
    echo -e "${YELLOW}Menginstal Node.js menggunakan nvm (direkomendasikan untuk Armbian)...${NC}"
    
    # Install nvm
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.5/install.sh | bash
    
    # Load nvm
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    
    # Install Node.js menggunakan nvm
    nvm install 18
    nvm use 18
    nvm alias default 18
    
    # Buat symlink global
    ln -sf "$NVM_DIR/versions/node/$(nvm version)/bin/node" /usr/local/bin/node
    ln -sf "$NVM_DIR/versions/node/$(nvm version)/bin/npm" /usr/local/bin/npm
    
    # Tambahkan nvm ke bashrc untuk root
    echo 'export NVM_DIR="$HOME/.nvm"' >> /root/.bashrc
    echo '[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"' >> /root/.bashrc
    echo '[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"' >> /root/.bashrc
    
    if command -v node &> /dev/null && command -v npm &> /dev/null; then
        echo -e "${GREEN}✅ Node.js $(node -v) dan NPM $(npm -v) berhasil diinstal menggunakan nvm${NC}"
    else
        echo -e "${RED}❌ Gagal menginstal Node.js menggunakan nvm${NC}"
        echo -e "${YELLOW}Mencoba metode alternatif dengan NodeSource...${NC}"
        install_nodejs_nodesource
    fi
}

# Fungsi alternatif untuk menginstal Node.js menggunakan NodeSource
install_nodejs_nodesource() {
    echo -e "${YELLOW}Menginstal Node.js menggunakan NodeSource...${NC}"
    
    # Tambahkan repository NodeSource
    mkdir -p /etc/apt/keyrings
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
    
    # Gunakan repository yang sesuai dengan Armbian
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_18.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list
    
    # Update package list
    apt-get update -y
    
    # Install Node.js
    apt-get install -y nodejs
    
    if command -v node &> /dev/null && command -v npm &> /dev/null; then
        echo -e "${GREEN}✅ Node.js $(node -v) dan NPM $(npm -v) berhasil diinstal menggunakan NodeSource${NC}"
    else
        echo -e "${RED}❌ Gagal menginstal Node.js${NC}"
        exit 1
    fi
}

# Panggil fungsi install Node.js hanya jika belum terinstal
if [ "$NODEJS_INSTALLED" != true ]; then
    install_nodejs
fi

# Panggil fungsi install MongoDB hanya jika belum terinstal
if [ "$MONGODB_INSTALLED" != true ]; then
    install_mongodb
fi

# Fungsi untuk menginstal MongoDB untuk Armbian
install_mongodb() {
    echo -e "${YELLOW}Menginstal MongoDB untuk Armbian...${NC}"
    
    # Hapus instalasi lama
    systemctl stop mongod 2>/dev/null || true
    apt-get remove --purge -y mongodb* 2>/dev/null || true
    rm -rf /var/lib/mongodb
    rm -rf /var/log/mongodb
    rm -f /etc/apt/sources.list.d/mongodb-*.list
    rm -f /usr/share/keyrings/mongodb-*.gpg

    # Install dependencies
    apt-get update
    apt-get install -y gnupg curl wget

    # Untuk Armbian, gunakan MongoDB 5.0 yang lebih kompatibel dengan ARM
    echo -e "${YELLOW}Menggunakan MongoDB 5.0 untuk Armbian (ARM)${NC}"
    
    # Tambahkan kunci GPG MongoDB 5.0
    curl -fsSL https://pgp.mongodb.com/server-5.0.asc | gpg --dearmor -o /usr/share/keyrings/mongodb-server-5.0.gpg
    echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-5.0.gpg ] https://repo.mongodb.org/apt/debian bullseye/mongodb-org/5.0 main" | tee /etc/apt/sources.list.d/mongodb-org-5.0.list
    
    apt-get update
    echo -e "${YELLOW}Menginstal MongoDB 5.0...${NC}"
    apt-get install -y mongodb-org

    # Konfigurasi MongoDB
    mkdir -p /var/lib/mongodb
    mkdir -p /var/log/mongodb
    chown -R mongodb:mongodb /var/lib/mongodb
    chown -R mongodb:mongodb /var/log/mongodb

    # Start dan enable MongoDB
    echo -e "${YELLOW}Menjalankan layanan MongoDB...${NC}"
    systemctl enable --now mongod
    
    # Tunggu sebentar agar MongoDB sempat start
    sleep 5
    
    # Cek status MongoDB
    if systemctl is-active --quiet mongod; then
        echo -e "${GREEN}✅ MongoDB berhasil dijalankan${NC}"
        # Cek apakah mongosh sudah terinstall
        if command -v mongosh &> /dev/null; then
            mongosh --eval 'db.runCommand({ connectionStatus: 1 })'
        elif command -v mongo &> /dev/null; then
            mongo --eval 'db.runCommand({ connectionStatus: 1 })'
        else
            echo -e "${YELLOW}⚠️  MongoDB shell (mongosh) tidak ditemukan. Menginstal mongosh...${NC}"
            apt-get install -y mongodb-mongosh
            
            if command -v mongosh &> /dev/null; then
                echo -e "${GREEN}✅ MongoDB Shell (mongosh) berhasil diinstal${NC}"
                mongosh --eval 'db.runCommand({ connectionStatus: 1 })'
            else
                echo -e "${YELLOW}⚠️  Gagal menginstal MongoDB Shell, tetapi instalasi dapat dilanjutkan${NC}"
            fi
        fi
    else
        echo -e "${RED}❌ Gagal menjalankan MongoDB, mencoba metode alternatif...${NC}"
        install_mongodb_docker
    fi
}

# Fungsi untuk menginstal MongoDB menggunakan Docker
install_mongodb_docker() {
    echo -e "${YELLOW}Menginstal MongoDB menggunakan Docker...${NC}"
    
    # Install Docker jika belum terpasang
    if ! command -v docker &> /dev/null; then
        echo -e "${YELLOW}Menginstal Docker...${NC}"
        curl -fsSL https://get.docker.com | sh
        systemctl enable --now docker
    fi
    
    # Hapus container MongoDB lama jika ada
    docker rm -f mongodb 2>/dev/null || true
    
    # Jalankan MongoDB dalam container
    echo -e "${YELLOW}Menjalankan MongoDB dalam container...${NC}"
    docker run -d --name mongodb \
        --restart unless-stopped \
        -p 27017:27017 \
        -v mongodb_data:/data/db \
        -e MONGO_INITDB_ROOT_USERNAME=admin \
        -e MONGO_INITDB_ROOT_PASSWORD=password \
        mongo:5.0
    
    # Tunggu sebentar
    sleep 5
    
    # Verifikasi
    if docker ps | grep -q mongodb; then
        echo -e "${GREEN}✅ MongoDB berjalan dalam container Docker${NC}"
        echo -e "${YELLOW}Info Koneksi MongoDB:${NC}"
        echo -e "- Host: localhost:27017"
        echo -e "- Username: admin"
        echo -e "- Password: password"
    else
        echo -e "${RED}❌ Gagal menjalankan MongoDB dalam container${NC}"
        exit 1
    fi
}

# Fungsi untuk menginstal GenieACS
install_genieacs() {
    echo -e "${GREEN}================== Menginstall genieACS CWMP, FS, NBI, UI ==================${NC}"
    npm install -g genieacs@1.2.13
    useradd --system --no-create-home --user-group genieacs || true
    mkdir -p /opt/genieacs
    mkdir -p /opt/genieacs/ext
    chown genieacs:genieacs /opt/genieacs/ext
    cat << EOF > /opt/genieacs/genieacs.env
GENIEACS_CWMP_ACCESS_LOG_FILE=/var/log/genieacs/genieacs-cwmp-access.log
GENIEACS_NBI_ACCESS_LOG_FILE=/var/log/genieacs/genieacs-nbi-access.log
GENIEACS_FS_ACCESS_LOG_FILE=/var/log/genieacs/genieacs-fs-access.log
GENIEACS_UI_ACCESS_LOG_FILE=/var/log/genieacs/genieacs-ui-access.log
GENIEACS_DEBUG_FILE=/var/log/genieacs/genieacs-debug.yaml
GENIEACS_EXT_DIR=/opt/genieacs/ext
GENIEACS_UI_JWT_SECRET=secret
EOF
    chown genieacs:genieacs /opt/genieacs/genieacs.env
    chown genieacs. /opt/genieacs -R
    chmod 600 /opt/genieacs/genieacs.env
    mkdir -p /var/log/genieacs
    chown genieacs. /var/log/genieacs
    # create systemd unit files
## CWMP
    cat << EOF > /etc/systemd/system/genieacs-cwmp.service
[Unit]
Description=GenieACS CWMP
After=network.target

[Service]
User=genieacs
EnvironmentFile=/opt/genieacs/genieacs.env
ExecStart=/usr/bin/genieacs-cwmp

[Install]
WantedBy=default.target
EOF

## NBI
    cat << EOF > /etc/systemd/system/genieacs-nbi.service
[Unit]
Description=GenieACS NBI
After=network.target
 
[Service]
User=genieacs
EnvironmentFile=/opt/genieacs/genieacs.env
ExecStart=/usr/bin/genieacs-nbi
 
[Install]
WantedBy=default.target
EOF

## FS
    cat << EOF > /etc/systemd/system/genieacs-fs.service
[Unit]
Description=GenieACS FS
After=network.target
 
[Service]
User=genieacs
EnvironmentFile=/opt/genieacs/genieacs.env
ExecStart=/usr/bin/genieacs-fs
 
[Install]
WantedBy=default.target
EOF

## UI
    cat << EOF > /etc/systemd/system/genieacs-ui.service
[Unit]
Description=GenieACS UI
After=network.target
 
[Service]
User=genieacs
EnvironmentFile=/opt/genieacs/genieacs.env
ExecStart=/usr/bin/genieacs-ui
 
[Install]
WantedBy=default.target
EOF

# config logrotate
 cat << EOF > /etc/logrotate.d/genieacs
/var/log/genieacs/*.log /var/log/genieacs/*.yaml {
    daily
    rotate 30
    compress
    delaycompress
    dateext
}
EOF
    echo -e "${GREEN}========== Install APP GenieACS selesai... ==============${NC}"
    systemctl daemon-reload
    systemctl enable --now genieacs-{cwmp,fs,ui,nbi}
    systemctl start genieacs-{cwmp,fs,ui,nbi}    
    echo -e "${GREEN}================== Sukses genieACS CWMP, FS, NBI, UI ==================${NC}"
}

# Panggil fungsi install GenieACS hanya jika belum terinstal
if [ "$GENIEACS_INSTALLED" != true ]; then
    install_genieacs
else
    echo -e "${GREEN}============================================================================${NC}"
    echo -e "${GREEN}=================== GenieACS sudah terinstall sebelumnya. ==================${NC}"
fi

# Tanyakan untuk melanjutkan ke Multitab jika GenieACS baru saja diinstal
if [ "$GENIEACS_INSTALLED" != true ]; then
    echo -e "${YELLOW}Apakah Anda ingin melanjutkan ke instalasi Multitab dan restore virtual parameter? (y/n)${NC}"
    read multitab_choice
    
    if [ "$multitab_choice" = "y" ]; then
        install_multitab_and_restore
    fi
fi

#Sukses
echo -e "${GREEN}============================================================================${NC}"
echo -e "${GREEN}========== GenieACS UI akses port 3000. : http://$local_ip:3000 ============${NC}"
echo -e "${GREEN}=================== Informasi: Whatsapp 081947215703 =======================${NC}"
echo -e "${GREEN}============================================================================${NC}"

# Tampilkan status akhir
echo -e "${BLUE}============================================================================${NC}"
echo -e "${BLUE}===================== STATUS INSTALASI AKHIR ===================${NC}"
echo -e "${BLUE}============================================================================${NC}"

# Cek Node.js
if command -v node &> /dev/null && command -v npm &> /dev/null; then
    echo -e "${GREEN}✅ Node.js $(node -v) dan NPM $(npm -v)${NC}"
else
    echo -e "${RED}❌ Node.js tidak terinstal${NC}"
fi

# Cek MongoDB
if systemctl is-active --quiet mongod 2>/dev/null || docker ps | grep -q mongodb; then
    echo -e "${GREEN}✅ MongoDB berjalan${NC}"
else
    echo -e "${RED}❌ MongoDB tidak berjalan${NC}"
fi

# Cek GenieACS
if systemctl is-active --quiet genieacs-{cwmp,fs,ui,nbi} 2>/dev/null; then
    echo -e "${GREEN}✅ GenieACS berjalan${NC}"
else
    echo -e "${RED}❌ GenieACS tidak berjalan${NC}"
fi

echo -e "${BLUE}============================================================================${NC}"
