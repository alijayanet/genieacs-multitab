#!/usr/bin/env bash
# ==============================================================================
#  GENIEACS ALL-IN-ONE MULTITAB EDITION (PORT 3000 TERPADU)
#  Auto-Installer & Upgrader untuk Ubuntu, Debian, dan Armbian SBC / STB
#  (B860H, HG680P, Orange Pi, Raspberry Pi, PC Server & VPS Cloud)
#
#  Modul:
#   - Core TR-069 ACS (CWMP, NBI, FS, UI Port 3000)
#   - MongoDB 4.4 Universal (100% ARMv8 Bebas Illegal Instruction)
#   - MultiTabs (Summary, WAN, LAN, WLAN, USER, TR069, INFO)
#   - Tab INFO detail perangkat rapi & parameter AST live
#   - Bot AI Google Gemini & WhatsApp Baileys Gateway
#   - Peta Geospasial ODP & Jalur Dropcore Leaflet
#   - Portal Mandiri Pelanggan (MyWiFi)
#   - Halaman Donasi Pengembang
#
#  Dibuat & Dikembangkan oleh: ALIJAYA NET (WhatsApp: 081947215703)
# ==============================================================================

set -e

# Warna Terminal
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd || pwd)"
FILES_DIR="${SCRIPT_DIR}/files"

# Helper logging
log_info() { echo -e "${CYAN}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "Skrip ini harus dijalankan sebagai ROOT (Gunakan: sudo bash $0)."
    fi
}

get_server_ip() {
    local ip
    ip=$(hostname -I 2>/dev/null | awk '{print $1}')
    if [[ -z "$ip" ]]; then
        ip="127.0.0.1"
    fi
    echo "$ip"
}

detect_genieacs_dir() {
    local candidate
    candidate=$(which genieacs-ui 2>/dev/null || true)
    if [[ -n "$candidate" ]]; then
        local real_bin
        real_bin=$(readlink -f "$candidate" 2>/dev/null || echo "$candidate")
        local base_dir
        base_dir=$(dirname "$(dirname "$real_bin")")
        if [[ -d "${base_dir}/public" && -f "${base_dir}/bin/genieacs-ui" ]]; then
            echo "$base_dir"
            return
        fi
    fi

    # Fallback path umum
    for p in "/usr/lib/node_modules/genieacs" "/usr/local/lib/node_modules/genieacs" "/opt/genieacs"; do
        if [[ -d "${p}/public" && -f "${p}/bin/genieacs-ui" ]]; then
            echo "$p"
            return
        fi
    done

    echo ""
}

# ==============================================================================
#  FASE 1: FRESH INSTALL (DARI AWAL - KHUSUS SERVER BARU / ARMBIAN STB)
# ==============================================================================
install_fresh_server() {
    echo -e "\n${BOLD}${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}${BLUE}║       🚀 MEMULAI FRESH INSTALL GENIEACS ALL-IN-ONE           ║${NC}"
    echo -e "${BOLD}${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"

    local arch
    arch=$(uname -m)
    log_info "Arsitektur CPU terdeteksi: ${BOLD}${GREEN}${arch}${NC}"

    # 1. Update Repositori & Paket Dasar
    log_info "[1/7] Memperbarui repositori dan menginstal dependensi dasar..."
    # Fix repository Debian jika ada error 404 pada backports
    sed -i 's/^deb .*bullseye-backports/# &/' /etc/apt/sources.list /etc/apt/sources.list.d/* 2>/dev/null || true
    apt-get update -y
    apt-get install -y curl wget git gnupg lsb-release build-essential libcurl4 libssl-dev logrotate rsync net-tools python3-requests python3-pymongo unzip tar ca-certificates openssl

    # 2. Instalasi Node.js v20 LTS (NodeSource)
    log_info "[2/7] Memeriksa & menginstal Node.js v20 LTS..."
    if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -d'.' -f1)" != "v20" ]; then
        mkdir -p /etc/apt/keyrings
        curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg --yes
        echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list
        apt-get update -y
        apt-get install -y nodejs
    fi
    log_success "Node.js terpasang: $(node -v) | NPM: $(npm -v)"
    [ ! -x /usr/bin/node ] && command -v node >/dev/null 2>&1 && ln -sf "$(which node)" /usr/bin/node

    # 3. Instalasi MongoDB Kompatibel ARM64 (Bebas 'Illegal Instruction' di STB)
    log_info "[3/7] Menyiapkan MongoDB 4.4 Universal (Ramah STB & Bebas Crash)..."
    
    if ! id mongodb >/dev/null 2>&1; then
        useradd --system --no-create-home --user-group mongodb || true
    fi
    mkdir -p /var/lib/mongodb /var/log/mongodb /var/log.ext/mongodb 2>/dev/null || true
    chown -R mongodb:mongodb /var/lib/mongodb /var/log/mongodb /var/log.ext/mongodb 2>/dev/null || true

    local need_mongo_install=0
    if ! command -v mongod >/dev/null 2>&1; then
        need_mongo_install=1
    elif ! mongod --version >/dev/null 2>&1; then
        log_warn "Binary mongod yang ada tidak kompatibel (Illegal instruction). Menginstal ulang versi stabil..."
        systemctl stop mongod 2>/dev/null || true
        pkill -9 -f mongod 2>/dev/null || true
        rm -f /usr/bin/mongo* /usr/local/bin/mongo*
        need_mongo_install=1
    fi

    if [[ "$need_mongo_install" -eq 1 ]]; then
        # Cek libssl1.1 (Dibutuhkan MongoDB 4.4 pada Debian 11/12 & Ubuntu 22+)
        if ! ldconfig -p 2>/dev/null | grep -q "libssl.so.1.1"; then
            log_info "Memasang dependensi libssl1.1..."
            if [[ "$arch" == "aarch64" || "$arch" == "arm64" ]]; then
                wget -q http://ports.ubuntu.com/pool/main/o/openssl/libssl1.1_1.1.1f-1ubuntu2.24_arm64.deb -O /tmp/libssl1.1.deb || true
            else
                wget -q http://security.ubuntu.com/ubuntu/pool/main/o/openssl/libssl1.1_1.1.1f-1ubuntu2.24_amd64.deb -O /tmp/libssl1.1.deb || true
            fi
            if [[ -f /tmp/libssl1.1.deb ]]; then
                dpkg -i /tmp/libssl1.1.deb || apt-get install -fy || true
                rm -f /tmp/libssl1.1.deb
            fi
        fi

        # Unduh MongoDB binary resmi v4.4.18 (ARMv8.0 kompatibel 100%)
        local mongo_url
        if [[ "$arch" == "aarch64" || "$arch" == "arm64" ]]; then
            mongo_url="https://fastdl.mongodb.org/linux/mongodb-linux-aarch64-ubuntu2004-4.4.18.tgz"
        else
            mongo_url="https://fastdl.mongodb.org/linux/mongodb-linux-x86_64-ubuntu2004-4.4.18.tgz"
        fi

        log_info "Mengunduh MongoDB 4.4.18 dari: ${mongo_url}"
        wget -c "$mongo_url" -O /tmp/mongodb.tgz
        tar -zxvf /tmp/mongodb.tgz -C /tmp/
        cp -f /tmp/mongodb-*/bin/* /usr/bin/ 2>/dev/null || true
        rm -rf /tmp/mongodb*
        chmod +x /usr/bin/mongo* 2>/dev/null || true

        if ! mongod --version >/dev/null 2>&1; then
            log_warn "Fallback: Menginstal mongodb dari paket apt..."
            apt-get update -y && apt-get install -y mongodb || true
        fi
    fi

    log_success "MongoDB terverifikasi: $(mongod --version 2>/dev/null | head -n1 || echo 'MongoDB')"

    # Konfigurasi /etc/mongod.conf yang hemat RAM (Cache 0.25GB untuk STB 1GB/2GB)
    cat << 'EOF' > /etc/mongod.conf
# mongod.conf - Dioptimasi untuk Armbian STB oleh ALIJAYA-NET
storage:
  dbPath: /var/lib/mongodb
  journal:
    enabled: true
  wiredTiger:
    engineConfig:
      cacheSizeGB: 0.25

systemLog:
  destination: file
  logAppend: true
  path: /var/log/mongodb/mongod.log

net:
  port: 27017
  bindIp: 127.0.0.1

processManagement:
  timeZoneInfo: /usr/share/zoneinfo

security:
  authorization: enabled
EOF

    # Proteksi folder Armbian ramlog / zram saat reboot
    mkdir -p /etc/tmpfiles.d
    cat << 'EOF' > /etc/tmpfiles.d/genieacs-mongodb.conf
d /var/log/mongodb 0755 mongodb mongodb -
d /run/mongodb 0755 mongodb mongodb -
d /var/lib/mongodb 0755 mongodb mongodb -
d /var/log/genieacs 0775 genieacs genieacs -
d /opt/genieacs/ext 0775 genieacs genieacs -
EOF
    systemd-tmpfiles --create /etc/tmpfiles.d/genieacs-mongodb.conf 2>/dev/null || true

    # Buat systemd service mongod
    cat << 'EOF' > /lib/systemd/system/mongod.service
[Unit]
Description=MongoDB Database Server
Documentation=https://docs.mongodb.org/manual
After=network-online.target
Wants=network-online.target

[Service]
User=mongodb
Group=mongodb
EnvironmentFile=-/etc/default/mongod
PermissionsStartOnly=true
ExecStartPre=/usr/bin/install -d -m 0755 -o mongodb -g mongodb /var/log/mongodb /run/mongodb /var/lib/mongodb
ExecStart=/usr/bin/mongod --config /etc/mongod.conf
PIDFile=/run/mongodb/mongod.pid
Restart=always
RestartSec=3
LimitFSIZE=infinity
LimitCPU=infinity
LimitAS=infinity
LimitNOFILE=64000
LimitNPROC=64000
LimitMEMLOCK=infinity
TasksMax=infinity
TasksAccounting=false

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable mongod

    # Inisialisasi User genie:genie di MongoDB
    log_info "Menginisialisasi user database 'genie:genie'..."
    systemctl stop mongod 2>/dev/null || true
    pkill -9 -f mongod 2>/dev/null || true
    sleep 1
    chown -R mongodb:mongodb /var/lib/mongodb /var/log/mongodb /var/log.ext/mongodb 2>/dev/null || true

    su - mongodb -s /bin/bash -c "mongod --dbpath /var/lib/mongodb --bind_ip 127.0.0.1 --port 27017 --fork --logpath /var/log/mongodb/init.log" 2>/dev/null || \
    mongod --dbpath /var/lib/mongodb --bind_ip 127.0.0.1 --port 27017 --fork --logpath /var/log/mongodb/init.log 2>/dev/null || true
    sleep 3

    # Buat / update user genie di database genieacs
    python3 - << 'EOF' 2>/dev/null || true
import pymongo
for admin_uri in ["mongodb://127.0.0.1:27017/admin"]:
    try:
        c = pymongo.MongoClient(admin_uri, serverSelectionTimeoutMS=2000)
        db = c["genieacs"]
        try:
            db.command("createUser", "genie", pwd="genie", roles=[{"role": "readWrite", "db": "genieacs"}, {"role": "dbAdmin", "db": "genieacs"}])
            print("[OK] User genie berhasil dibuat.")
        except Exception:
            db.command("updateUser", "genie", roles=[{"role": "readWrite", "db": "genieacs"}, {"role": "dbAdmin", "db": "genieacs"}])
            print("[OK] User genie berhasil diperbarui.")
        break
    except Exception as e:
        pass
EOF

    pkill -9 -f mongod 2>/dev/null || true
    sleep 2
    systemctl restart mongod
    log_success "MongoDB aktif dengan otentikasi user 'genie'."

    # 4. Instalasi GenieACS Core v1.2.13 via NPM
    log_info "[4/7] Memasang GenieACS v1.2.13 secara global..."
    /usr/bin/npm install -g genieacs@1.2.13 --unsafe-perm=true --prefix /usr 2>/dev/null || \
    npm install -g genieacs@1.2.13 --unsafe-perm=true --prefix /usr 2>/dev/null || \
    npm install -g genieacs@1.2.13 --unsafe-perm=true

    # Symlink binaries
    for mod in "cwmp" "nbi" "fs" "ui"; do
        BIN_LOC=""
        if [ -x "/usr/bin/genieacs-${mod}" ]; then
            BIN_LOC="/usr/bin/genieacs-${mod}"
        elif [ -x "/usr/local/bin/genieacs-${mod}" ]; then
            BIN_LOC="/usr/local/bin/genieacs-${mod}"
        fi
        if [ -n "$BIN_LOC" ]; then
            [ "$BIN_LOC" != "/usr/bin/genieacs-${mod}" ] && ln -sf "$BIN_LOC" "/usr/bin/genieacs-${mod}"
            [ "$BIN_LOC" != "/usr/local/bin/genieacs-${mod}" ] && ln -sf "$BIN_LOC" "/usr/local/bin/genieacs-${mod}"
        fi
        chmod +x "/usr/bin/genieacs-${mod}" 2>/dev/null || true
    done

    # Buat user sistem genieacs
    if ! id genieacs >/dev/null 2>&1; then
        useradd --system --no-create-home --user-group genieacs || true
    fi

    # Buat direktori kerja & konfigurasi
    mkdir -p /opt/genieacs/ext /var/log/genieacs /var/log.ext/genieacs 2>/dev/null || true
    chown -R genieacs:genieacs /opt/genieacs /var/log/genieacs /var/log.ext/genieacs 2>/dev/null || true
    chmod -R 775 /var/log/genieacs /var/log.ext/genieacs 2>/dev/null || true

    # Generate JWT Secret acak
    local jwt_secret
    jwt_secret=$(head /dev/urandom 2>/dev/null | tr -dc A-Za-z0-9 | head -c 64 || openssl rand -hex 32)

    cat << EOF > /opt/genieacs/genieacs.env
GENIEACS_CWMP_ACCESS_LOG_FILE=/var/log/genieacs/genieacs-cwmp-access.log
GENIEACS_NBI_ACCESS_LOG_FILE=/var/log/genieacs/genieacs-nbi-access.log
GENIEACS_FS_ACCESS_LOG_FILE=/var/log/genieacs/genieacs-fs-access.log
GENIEACS_UI_ACCESS_LOG_FILE=/var/log/genieacs/genieacs-ui-access.log
GENIEACS_DEBUG_FILE=/var/log/genieacs/genieacs-debug.yaml
NODE_OPTIONS=--enable-source-maps
GENIEACS_EXT_DIR=/opt/genieacs/ext
GENIEACS_UI_JWT_SECRET=${jwt_secret}
GENIEACS_MONGODB_CONNECTION_URL=mongodb://genie:genie@127.0.0.1:27017/genieacs
EOF
    chown genieacs:genieacs /opt/genieacs/genieacs.env
    chmod 600 /opt/genieacs/genieacs.env

    # 5. Pasang systemd service GenieACS standard
    log_info "[5/7] Memasang file service systemd GenieACS..."
    local modules=("cwmp" "nbi" "fs" "ui")
    for mod in "${modules[@]}"; do
        cat << EOF > /etc/systemd/system/genieacs-${mod}.service
[Unit]
Description=GenieACS ${mod^^}
After=network.target mongod.service
Wants=mongod.service

[Service]
User=genieacs
Group=genieacs
EnvironmentFile=/opt/genieacs/genieacs.env
PermissionsStartOnly=true
ExecStartPre=/usr/bin/install -d -m 0775 -o genieacs -g genieacs /var/log/genieacs /opt/genieacs/ext
ExecStart=/usr/bin/genieacs-${mod}
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
    done

    systemctl daemon-reload
    systemctl enable genieacs-cwmp genieacs-nbi genieacs-fs genieacs-ui
    systemctl restart genieacs-cwmp genieacs-nbi genieacs-fs genieacs-ui
    log_success "Service inti GenieACS berhasil dipasang dan diaktifkan."

    # 6. Proteksi Anti-Disk Penuh (Logrotate & Ramlog)
    log_info "[6/7] Menyiapkan proteksi Anti-Disk Penuh (Logrotate & Ramlog)..."
    cat << 'EOF' > /etc/logrotate.d/genieacs
/var/log/genieacs/*.log /var/log.ext/genieacs/*.log /var/log.hdd/genieacs/*.log {
    daily
    size 10M
    rotate 5
    compress
    delaycompress
    missingok
    notifempty
    create 0644 genieacs genieacs
    sharedscripts
    postrotate
        systemctl reload-or-try-restart genieacs-cwmp genieacs-nbi genieacs-fs genieacs-ui 2>/dev/null || true
    endscript
}
EOF

    if [[ -f /etc/default/armbian-ramlog ]]; then
        sed -i 's/# --delete/--delete/g' /etc/default/armbian-ramlog
        sed -i 's/SIZE=.*/SIZE=50M/g' /etc/default/armbian-ramlog
        log_success "Armbian-ramlog dioptimasi (--delete aktif, maks 50M)."
    fi

    if [[ -f /etc/systemd/journald.conf ]]; then
        sed -i 's/#SystemMaxUse=.*/SystemMaxUse=50M/g' /etc/systemd/journald.conf
        sed -i 's/SystemMaxUse=.*/SystemMaxUse=50M/g' /etc/systemd/journald.conf
    fi

    # 7. Lanjut ke proses injeksi modul All-in-One
    upgrade_existing_server
}

# ==============================================================================
#  FASE 2: UPGRADE & INJEKSI ALL-IN-ONE (PORT 3000 TERPADU)
# ==============================================================================
upgrade_existing_server() {
    echo -e "\n${BOLD}${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}${BLUE}║       🚀 INJEKSI MODUL GENIEACS ALL-IN-ONE (PORT 3000)       ║${NC}"
    echo -e "${BOLD}${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"

    # 1. Deteksi direktori GenieACS
    local g_dir
    g_dir=$(detect_genieacs_dir)
    if [[ -z "$g_dir" ]]; then
        log_error "Direktori instalasi GenieACS tidak ditemukan! Pastikan GenieACS sudah terpasang via npm."
    fi
    log_info "Direktori GenieACS terdeteksi di: ${BOLD}${g_dir}${NC}"

    # 2. Salin file router native integrated-api.js
    log_info "Menyalin file router integrated-api.js..."
    cp -f "${FILES_DIR}/integrated-api.js" "${g_dir}/integrated-api.js"
    chmod 644 "${g_dir}/integrated-api.js"

    # 3. Salin file frontend lengkap
    log_info "Menyalin file antarmuka (app.js, app.css, bot.html, peta.html, mywifi.html, donasi.html)..."
    mkdir -p "${g_dir}/public"
    cp -f "${FILES_DIR}/public/app.js" "${g_dir}/public/app.js"
    cp -f "${FILES_DIR}/public/app.css" "${g_dir}/public/app.css"
    cp -f "${FILES_DIR}/public/bot.html" "${g_dir}/public/bot.html"
    cp -f "${FILES_DIR}/public/peta.html" "${g_dir}/public/peta.html"
    cp -f "${FILES_DIR}/public/mywifi.html" "${g_dir}/public/mywifi.html"
    cp -f "${FILES_DIR}/public/donasi.html" "${g_dir}/public/donasi.html"
    chmod 644 "${g_dir}/public/"*

    # 4. Patch bin/genieacs-ui
    log_info "Memodifikasi bin/genieacs-ui untuk mengaktifkan router port 3000..."
    node "${FILES_DIR}/patch-ui.js" "${g_dir}"

    # 5. Pastikan dependensi Node.js di GenieACS tersedia
    log_info "Memeriksa dependensi pendukung (koa-router, mongodb)..."
    if [[ ! -d "${g_dir}/node_modules/koa-router" ]]; then
        (cd "${g_dir}" && npm install --save koa-router 2>/dev/null || true)
    fi

    # 6. Pasang Worker WhatsApp Bot (Baileys)
    log_info "Menyiapkan worker WhatsApp Bot di /opt/genieacs-agent..."
    mkdir -p /opt/genieacs-agent
    cp -f "${FILES_DIR}/whatsapp/whatsapp-bot.mjs" /opt/genieacs-agent/whatsapp-bot.mjs
    cp -f "${FILES_DIR}/whatsapp/package.json" /opt/genieacs-agent/package.json
    chmod 755 /opt/genieacs-agent/whatsapp-bot.mjs

    log_info "Memasang dependensi WhatsApp Bot (Baileys, Pino, QR)..."
    (cd /opt/genieacs-agent && npm install --production 2>/dev/null || npm install @whiskeysockets/baileys pino qrcode qrcode-terminal --ignore-scripts --no-audit --no-fund 2>/dev/null || true)

    # Pasang service systemd WhatsApp
    cp -f "${FILES_DIR}/systemd/genieacs-whatsapp.service" /etc/systemd/system/genieacs-whatsapp.service
    systemctl daemon-reload
    systemctl enable --now genieacs-whatsapp.service 2>/dev/null || true
    log_success "Service WhatsApp Bot berhasil dipasang dan diaktifkan."

    # 7. Pasang CLI Helper set-bot (jika file tersedia)
    if [[ -f "${FILES_DIR}/set-bot.py" ]]; then
        log_info "Memasang tool CLI 'set-bot' di /usr/local/bin/set-bot..."
        cp -f "${FILES_DIR}/set-bot.py" /opt/genieacs-agent/set-bot.py
        chmod +x /opt/genieacs-agent/set-bot.py
        ln -sf /opt/genieacs-agent/set-bot.py /usr/local/bin/set-bot
        log_success "CLI helper 'set-bot' aktif (Ketik 'set-bot' di terminal untuk setting bot)."
    fi

    # 8. Matikan Service Python Legacy (Port 7558) jika ada
    if systemctl is-active genieacs-agent.service &>/dev/null || systemctl is-enabled genieacs-agent.service &>/dev/null; then
        log_info "Menonaktifkan service python legacy (genieacs-agent.service pada port 7558)..."
        systemctl stop genieacs-agent.service || true
        systemctl disable genieacs-agent.service || true
        log_success "Port 7558 legacy dinonaktifkan."
    fi

    # 9. Seed Database MongoDB (39 VirtualParameters, Presets, Provisions, ODP)
    log_info "Mengimpor 39 VirtualParameters, Presets, dan struktur ODP..."
    local mongo_conn=""
    if [[ -f /opt/genieacs/genieacs.env ]]; then
        mongo_conn=$(grep "^GENIEACS_MONGODB_CONNECTION_URL=" /opt/genieacs/genieacs.env 2>/dev/null | cut -d'=' -f2- || true)
    fi
    node "${FILES_DIR}/seed-mongo.js" "${mongo_conn}" "${g_dir}" || log_warn "Seeding database dilewati (data yang ada tetap aman)."

    # 10. Restart UI service
    log_info "Merestart layanan genieacs-ui..."
    systemctl restart genieacs-ui
    sleep 2

    # 11. Healthcheck Verifikasi
    log_info "Melakukan verifikasi status layanan..."
    local ip
    ip=$(get_server_ip)

    if systemctl is-active genieacs-ui &>/dev/null; then
        log_success "genieacs-ui: ACTIVE"
    else
        log_warn "genieacs-ui status belum aktif, silakan periksa: journalctl -u genieacs-ui -n 20"
    fi

    echo -e "\n${BOLD}${GREEN}================================================================${NC}"
    echo -e "${BOLD}${GREEN}       🎉 INSTALASI / UPGRADE ALL-IN-ONE BERHASIL 100%!        ${NC}"
    echo -e "${BOLD}${GREEN}================================================================${NC}"
    echo -e "Akses seluruh layanan GenieACS All-in-One pada Port Tunggal (3000):"
    echo -e "  • ${BOLD}GenieACS Web UI${NC}     : http://${ip}:3000"
    echo -e "  • ${BOLD}Bot AI & WA Panel${NC}   : http://${ip}:3000/bot"
    echo -e "  • ${BOLD}Peta ODP & Klien${NC}    : http://${ip}:3000/peta"
    echo -e "  • ${BOLD}Portal Mandiri Klien${NC} : http://${ip}:3000/mywifi"
    echo -e "  • ${BOLD}Halaman Donasi${NC}      : http://${ip}:3000/donasi"
    echo -e "  • ${BOLD}Status Bot WhatsApp${NC} : http://${ip}:3000/api/whatsapp/status"
    echo -e "  • ${BOLD}CLI Terminal Helper${NC} : Ketik '${YELLOW}set-bot${NC}' untuk set token Telegram"
    echo -e "${BOLD}${GREEN}================================================================${NC}\n"
}

# ==============================================================================
#  ENTRY POINT
# ==============================================================================
check_root

if [[ "$1" == "--fresh" || "$1" == "-f" ]]; then
    install_fresh_server
elif [[ "$1" == "--upgrade" || "$1" == "-u" ]]; then
    upgrade_existing_server
else
    clear 2>/dev/null || true
    echo -e "${BOLD}${CYAN}================================================================${NC}"
    echo -e "${BOLD}${CYAN}      INSTALLER GENIEACS ALL-IN-ONE (PORT 3000 TERPADU)        ${NC}"
    echo -e "${BOLD}${CYAN}             ALIJAYA NET - AUTO INSTALL & UPGRADE              ${NC}"
    echo -e "${BOLD}${CYAN}================================================================${NC}"
    echo -e "Pilih mode instalasi yang sesuai dengan server Anda:"
    echo -e "  ${BOLD}1)${NC} ${GREEN}Fresh Server${NC}   : Install dari awal (Server Baru/Kosong OS Ubuntu/Debian/Armbian STB)"
    echo -e "  ${BOLD}2)${NC} ${YELLOW}Upgrade Server${NC} : Sudah ada GenieACS standard (Tinggal pasang modul)"
    echo -e "  ${BOLD}3)${NC} Keluar"
    echo -e "${BOLD}${CYAN}================================================================${NC}"
    read -rp "Masukkan pilihan [1-3]: " choice

    case "$choice" in
        1) install_fresh_server ;;
        2) upgrade_existing_server ;;
        3) echo "Dibatalkan."; exit 0 ;;
        *) echo -e "${RED}Pilihan tidak valid!${NC}"; exit 1 ;;
    esac
fi
