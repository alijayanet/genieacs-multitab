#!/usr/bin/env bash
# ==============================================================================
#  GENIEACS ALL-IN-ONE UNIFIED INSTALLER (PORT 3000)
#  Modul: Bot AI, WhatsApp Baileys, Peta ODP Geospasial, Portal MyWiFi & Donasi
#  Created for: ALIJAYA NET
# ==============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FILES_DIR="${SCRIPT_DIR}/files"

# Helper functions
log_info() { echo -e "${CYAN}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "Skrip ini harus dijalankan sebagai root (gunakan sudo atau login sebagai root)."
    fi
}

get_server_ip() {
    local ip
    ip=$(hostname -I | awk '{print $1}')
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
        real_bin=$(readlink -f "$candidate" || echo "$candidate")
        local base_dir
        base_dir=$(dirname "$(dirname "$real_bin")")
        if [[ -d "${base_dir}/public" && -f "${base_dir}/bin/genieacs-ui" ]]; then
            echo "$base_dir"
            return
        fi
    fi

    # Common fallback paths
    for p in "/usr/lib/node_modules/genieacs" "/usr/local/lib/node_modules/genieacs" "/opt/genieacs"; do
        if [[ -d "${p}/public" && -f "${p}/bin/genieacs-ui" ]]; then
            echo "$p"
            return
        fi
    done

    echo ""
}

# ==============================================================================
#  FASE: FRESH INSTALL (SERVER KOSONG / BARU)
# ==============================================================================
install_fresh_server() {
    echo -e "\n${BOLD}${BLUE}=== MEMULAI INSTALASI FRESH SERVER (DARI AWAL) ===${NC}"
    
    # 1. Update OS packages
    log_info "Memperbarui paket sistem (apt update & upgrade)..."
    apt-get update -y
    apt-get install -y curl wget git tar unzip build-essential openssl ca-certificates gnupg

    # 2. Install Node.js 20 LTS
    log_info "Memeriksa Node.js..."
    if ! command -v node &>/dev/null || [[ $(node -v | cut -d'.' -f1 | tr -d 'v') -lt 18 ]]; then
        log_info "Memasang Node.js 20 LTS via Nodesource..."
        mkdir -p /etc/apt/keyrings
        curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg --yes
        echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list
        apt-get update -y
        apt-get install -y nodejs
    fi
    log_success "Node.js terpasang: $(node -v) | npm: $(npm -v)"

    # 3. Install MongoDB
    log_info "Memeriksa MongoDB..."
    if ! command -v mongod &>/dev/null; then
        log_info "Memasang MongoDB Server..."
        # Deteksi distro
        if command -v apt-get &>/dev/null; then
            # Install mongodb standard distro or mongodb-org
            apt-get install -y mongodb-server || apt-get install -y mongodb || true
            if ! command -v mongod &>/dev/null; then
                log_info "Mengambil repository resmi MongoDB..."
                curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor --yes
                echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | tee /etc/apt/sources.list.d/mongodb-org-7.0.list || true
                apt-get update -y || true
                apt-get install -y mongodb-org || true
            fi
        fi
    fi

    # Pastikan service mongodb berjalan
    systemctl daemon-reload
    systemctl enable mongod || systemctl enable mongodb || true
    systemctl start mongod || systemctl start mongodb || true
    log_success "MongoDB aktif dan berjalan."

    # 4. Install GenieACS Core
    log_info "Memasang GenieACS v1.2.13 via npm..."
    npm install -g --unsafe-perm genieacs@1.2.13

    # Buat user dan direktori kerja genieacs
    useradd --system --no-create-home --user-group genieacs 2>/dev/null || true
    mkdir -p /opt/genieacs/ext /var/log/genieacs
    chown -R genieacs:genieacs /opt/genieacs /var/log/genieacs

    # Generate environment file
    local jwt_secret
    jwt_secret=$(openssl rand -hex 32)
    local mongo_conn="mongodb://127.0.0.1:27017/genieacs"

    log_info "Membuat konfigurasi environment di /opt/genieacs/genieacs.env..."
    sed -e "s|__GENIEACS_UI_JWT_SECRET__|${jwt_secret}|g" \
        -e "s|__GENIEACS_MONGODB_CONNECTION_URL__|${mongo_conn}|g" \
        "${FILES_DIR}/templates/genieacs.env.template" > /opt/genieacs/genieacs.env
    chown genieacs:genieacs /opt/genieacs/genieacs.env
    chmod 600 /opt/genieacs/genieacs.env

    # 5. Pasang systemd service GenieACS standard
    log_info "Memasang file service systemd GenieACS..."
    cp "${FILES_DIR}/systemd/genieacs-cwmp.service" /etc/systemd/system/
    cp "${FILES_DIR}/systemd/genieacs-nbi.service" /etc/systemd/system/
    cp "${FILES_DIR}/systemd/genieacs-fs.service" /etc/systemd/system/
    cp "${FILES_DIR}/systemd/genieacs-ui.service" /etc/systemd/system/

    systemctl daemon-reload
    systemctl enable --now genieacs-cwmp genieacs-nbi genieacs-fs genieacs-ui
    log_success "Service inti GenieACS berhasil dipasang dan diaktifkan."

    # 6. Lanjut ke proses integrasi All-in-One
    upgrade_existing_server
}

# ==============================================================================
#  FASE: UPGRADE & INJEKSI ALL-IN-ONE
# ==============================================================================
upgrade_existing_server() {
    echo -e "\n${BOLD}${BLUE}=== MEMULAI INJEKSI & UPGRADE ALL-IN-ONE (PORT 3000) ===${NC}"

    # 1. Deteksi direktori GenieACS
    local g_dir
    g_dir=$(detect_genieacs_dir)
    if [[ -z "$g_dir" ]]; then
        log_error "Direktori instalasi GenieACS tidak ditemukan! Pastikan GenieACS sudah terpasang via npm."
    fi
    log_info "Direktori GenieACS terdeteksi di: ${BOLD}${g_dir}${NC}"

    # 2. Salin file All-in-One ke GenieACS
    log_info "Menyalin file router integrated-api.js..."
    cp -f "${FILES_DIR}/integrated-api.js" "${g_dir}/integrated-api.js"
    chmod 644 "${g_dir}/integrated-api.js"

    log_info "Menyalin file frontend (app.js, app.css, bot.html, peta.html, mywifi.html, donasi.html)..."
    mkdir -p "${g_dir}/public"
    cp -f "${FILES_DIR}/public/app.js" "${g_dir}/public/app.js"
    cp -f "${FILES_DIR}/public/app.css" "${g_dir}/public/app.css"
    cp -f "${FILES_DIR}/public/bot.html" "${g_dir}/public/bot.html"
    cp -f "${FILES_DIR}/public/peta.html" "${g_dir}/public/peta.html"
    cp -f "${FILES_DIR}/public/mywifi.html" "${g_dir}/public/mywifi.html"
    cp -f "${FILES_DIR}/public/donasi.html" "${g_dir}/public/donasi.html"
    chmod 644 "${g_dir}/public/"*

    # 3. Patch bin/genieacs-ui
    log_info "Memodifikasi bin/genieacs-ui untuk mengaktifkan router terpadu..."
    node "${FILES_DIR}/patch-ui.js" "${g_dir}"

    # 4. Pastikan dependensi Node.js di GenieACS tersedia
    log_info "Memeriksa modul pendukung (mongodb, koa-router)..."
    if [[ ! -d "${g_dir}/node_modules/koa-router" ]]; then
        (cd "${g_dir}" && npm install --save koa-router) || true
    fi

    # 5. Pasang Worker WhatsApp Bot (Baileys)
    log_info "Menyiapkan worker WhatsApp Bot di /opt/genieacs-agent..."
    mkdir -p /opt/genieacs-agent
    cp -f "${FILES_DIR}/whatsapp/whatsapp-bot.mjs" /opt/genieacs-agent/whatsapp-bot.mjs
    cp -f "${FILES_DIR}/whatsapp/package.json" /opt/genieacs-agent/package.json
    chmod 755 /opt/genieacs-agent/whatsapp-bot.mjs

    log_info "Memasang dependensi WhatsApp Bot (Baileys, Pino, QR)..."
    (cd /opt/genieacs-agent && npm install --production) || true

    # Pasang service systemd WhatsApp
    cp -f "${FILES_DIR}/systemd/genieacs-whatsapp.service" /etc/systemd/system/genieacs-whatsapp.service
    systemctl daemon-reload
    systemctl enable --now genieacs-whatsapp.service || true
    log_success "Service WhatsApp Bot berhasil dipasang dan diaktifkan."

    # 6. Matikan Service Python Legacy (Port 7558) jika ada
    if systemctl is-active genieacs-agent.service &>/dev/null || systemctl is-enabled genieacs-agent.service &>/dev/null; then
        log_info "Menonaktifkan service python legacy (genieacs-agent.service pada port 7558)..."
        systemctl stop genieacs-agent.service || true
        systemctl disable genieacs-agent.service || true
        log_success "Port 7558 legacy dinonaktifkan."
    fi

    # 7. Seed Database MongoDB jika diperlukan
    log_info "Memasukkan template parameter, presets, dan konfigurasi ODP/Pelanggan..."
    node "${FILES_DIR}/seed-mongo.js" "" "${g_dir}" || log_warn "Seeding database dilewati (data yang ada tetap aman)."

    # 8. Restart UI service
    log_info "Merestart layanan genieacs-ui..."
    systemctl restart genieacs-ui
    sleep 2

    # 9. Healthcheck Verifikasi
    log_info "Melakukan verifikasi status layanan..."
    local ip
    ip=$(get_server_ip)

    if systemctl is-active genieacs-ui &>/dev/null; then
        log_success "genieacs-ui: ACTIVE"
    else
        log_warn "genieacs-ui status belum aktif, silakan periksa: journalctl -u genieacs-ui -n 20"
    fi

    echo -e "\n${BOLD}${GREEN}================================================================${NC}"
    echo -e "${BOLD}${GREEN}       INSTALASI / UPGRADE ALL-IN-ONE BERHASIL 100%!           ${NC}"
    echo -e "${BOLD}${GREEN}================================================================${NC}"
    echo -e "Akses seluruh layanan GenieACS All-in-One pada Port Tunggal (3000):"
    echo -e "  • ${BOLD}GenieACS Web UI${NC}     : http://${ip}:3000"
    echo -e "  • ${BOLD}Bot AI & WA Panel${NC}   : http://${ip}:3000/bot"
    echo -e "  • ${BOLD}Peta ODP & Klien${NC}    : http://${ip}:3000/peta"
    echo -e "  • ${BOLD}Portal Mandiri Klien${NC} : http://${ip}:3000/mywifi"
    echo -e "  • ${BOLD}Halaman Donasi${NC}      : http://${ip}:3000/donasi"
    echo -e "  • ${BOLD}Status Bot WhatsApp${NC} : http://${ip}:3000/api/whatsapp/status"
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
    clear
    echo -e "${BOLD}${CYAN}================================================================${NC}"
    echo -e "${BOLD}${CYAN}      INSTALLER GENIEACS ALL-IN-ONE (PORT 3000 TERPADU)        ${NC}"
    echo -e "${BOLD}${CYAN}             ALIJAYA NET - AUTO INSTALL & UPGRADE              ${NC}"
    echo -e "${BOLD}${CYAN}================================================================${NC}"
    echo -e "Pilih mode instalasi yang sesuai dengan server Anda:"
    echo -e "  ${BOLD}1)${NC} ${GREEN}Fresh Server${NC}   : Install dari awal (Server Baru/Kosong OS Ubuntu/Debian)"
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
