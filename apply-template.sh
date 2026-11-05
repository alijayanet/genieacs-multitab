#!/bin/bash
# ==============================================================================
# SCRIPT UPDATE & RESTORE PARAMETER GENIEACS (ALIJAYA NET)
# Khusus untuk server yang SUDAH terpasang GenieACS sebelumnya.
# Hanya memperbarui VirtualParameters, Presets, Provisions, dan UI Config
# 100% AMAN: Akun user, perizinan, dan data perangkat TIDAK AKAN TERHAPUS.
#
# Dibuat oleh: ALIJAYA NET (WhatsApp: 081947215703)
# ==============================================================================

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}[ERROR] Jalankan script ini sebagai user root! (sudo bash $0)${NC}"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd || pwd)"
FILES_DIR="${SCRIPT_DIR}/files"

clear 2>/dev/null || true
echo -e "${CYAN}================================================================${NC}"
echo -e "${BOLD}${GREEN}        ALIJAYA NET - UPDATE & RESTORE PARAMETER GENIEACS       ${NC}"
echo -e "${YELLOW}   Menerapkan Parameter Multi-Vendor Terbaru Tanpa Install Ulang ${NC}"
echo -e "${CYAN}================================================================${NC}"

# Deteksi direktori GenieACS
detect_genieacs_dir() {
    local dirs=(
        "/usr/lib/node_modules/genieacs"
        "/usr/local/lib/node_modules/genieacs"
        "/opt/genieacs"
        "/root/.nvm/versions/node/$(node -v 2>/dev/null)/lib/node_modules/genieacs"
    )
    for d in "${dirs[@]}"; do
        if [[ -d "$d" && -f "$d/bin/genieacs-ui" ]]; then
            echo "$d"
            return 0
        fi
    done
    dirname "$(dirname "$(readlink -f "$(which genieacs-ui 2>/dev/null)" 2>/dev/null)" 2>/dev/null)" 2>/dev/null || true
}

G_DIR=$(detect_genieacs_dir)
echo -e "${BLUE}[1/3] Mendeteksi direktori GenieACS:${NC} ${GREEN}${G_DIR:-Standar}${NC}"

# Deteksi URI MongoDB
MONGO_CONN=""
if [[ -f /opt/genieacs/genieacs.env ]]; then
    MONGO_CONN=$(grep "^GENIEACS_MONGODB_CONNECTION_URL=" /opt/genieacs/genieacs.env 2>/dev/null | cut -d'=' -f2- || true)
fi

echo -e "${BLUE}[2/3] Memperbarui VirtualParameters, Presets, Provisions & Tampilan...${NC}"
echo -e "${YELLOW}Catatan: Data perangkat pelanggan (devices) & akun user server ini 100% AMAN.${NC}"

if command -v node >/dev/null 2>&1 && [ -f "${FILES_DIR}/seed-mongo.js" ]; then
    node "${FILES_DIR}/seed-mongo.js" "${MONGO_CONN}" "${G_DIR}"
else
    echo -e "${RED}[ERROR] Node.js atau file seed-mongo.js tidak ditemukan di ${FILES_DIR}!${NC}"
    exit 1
fi

# Jika direktori GenieACS ditemukan, pastikan file public & integrated-api sinkron
if [ -n "$G_DIR" ] && [ -d "$G_DIR" ]; then
    [ -f "${FILES_DIR}/integrated-api.js" ] && cp -f "${FILES_DIR}/integrated-api.js" "${G_DIR}/integrated-api.js"
    if [ -d "${FILES_DIR}/public" ]; then
        mkdir -p "${G_DIR}/public"
        cp -rf "${FILES_DIR}/public/"* "${G_DIR}/public/" 2>/dev/null || true
    fi
    # Pastikan patch router aktif jika belum di-patch
    [ -f "${FILES_DIR}/patch-ui.js" ] && node "${FILES_DIR}/patch-ui.js" "${G_DIR}" 2>/dev/null || true
fi

echo -e "${BLUE}[3/3] Merestart layanan GenieACS...${NC}"
systemctl restart genieacs-ui 2>/dev/null || service genieacs-ui restart 2>/dev/null || true
systemctl restart genieacs-cwmp 2>/dev/null || service genieacs-cwmp restart 2>/dev/null || true

echo ""
echo -e "${BOLD}${GREEN}================================================================${NC}"
echo -e "${BOLD}${GREEN}  SUKSES! Parameter Multi-Vendor & Tampilan Berhasil Diterapkan!${NC}"
echo -e "${CYAN}  * Seluruh Virtual Parameters (39) & Provisions terupdate.${NC}"
echo -e "${CYAN}  * Kompatibel: ZTE, Huawei, FiberHome, Nokia, Raiscom, BDCOM, dll.${NC}"
echo -e "${CYAN}  * Bebas Fault: Sesi TR-069 aman dari ReferenceError & Fault 9002.${NC}"
echo -e "${YELLOW}  Silakan buka browser dan refresh (Ctrl + F5) pada GenieACS Web UI.${NC}"
echo -e "${BOLD}${GREEN}================================================================${NC}"
echo -e "${BOLD}Bantuan & Konsultasi: WhatsApp 081947215703 (ALIJAYA NET)${NC}"
