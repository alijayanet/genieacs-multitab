#!/bin/bash

if [[ $EUID -ne 0 ]]; then
   echo "Error: Skrip ini harus dijalankan sebagai root." 
   exit 1
fi

show_success_message() {
  SERVER_IP=$(hostname -I | awk '{print $1}')
  echo -e "\n${GREEN}====================================================="
  echo -e "         Proses Instalasi Selesai! ✨"
  echo -e "=====================================================${NC}"
  echo
  echo "Akses GenieACS UI di: ${YELLOW}http://${SERVER_IP}:3000${NC}"
  echo "Login dengan user: ${GREEN}admin${NC} dan password: ${GREEN}admin${NC}"
  echo
}

check_all_services_status() {
  echo ""
  echo "${BOLD}LANGKAH FINAL: Memeriksa Status Servis...${NC}"
  SERVICES_TO_CHECK=("mongod" "genieacs-cwmp" "genieacs-nbi" "genieacs-fs" "genieacs-ui")

  for service in "${SERVICES_TO_CHECK[@]}"; do
    if systemctl list-units --type=service --all | grep -q "${service}.service"; then
      if systemctl is-active --quiet "$service"; then
        STATUS="[ ${GREEN}active${NC} ]"
      else
        STATUS="[ ${RED}inactive/failed${NC} ]"
      fi
      printf "  - Status %-20s : %s\n" "$service" "$STATUS"
    fi
  done
}

main() {
  BASE_URL="https://www.gangtikus.net/acs"
  if tput setaf 1 &> /dev/null; then BOLD=$(tput bold); RED=$(tput sgr0); GREEN=$(tput setaf 2); NC=$(tput sgr0); BLUE=$(tput setaf 6); YELLOW=$(tput setaf 3); fi

  if ! command -v curl &> /dev/null; then
    apt-get update -y && apt-get install -y curl
    if ! command -v curl &> /dev/null; then
      echo "${RED}Error: Gagal menginstal 'curl'. Silakan install secara manual (apt-get install curl) lalu jalankan lagi skrip ini.${NC}"
      exit 1
    fi
  fi

  WORK_DIR=$(mktemp -d)
  if [ ! -d "$WORK_DIR" ]; then exit 1; fi
  trap 'rm -rf "$WORK_DIR"' EXIT
  cd "$WORK_DIR"

  echo "${BOLD}Starting...${NC}"
  SCRIPTS_TO_DOWNLOAD=("functions.sh" "nodejs.sh" "database.sh" "genieacs.sh")
  for script in "${SCRIPTS_TO_DOWNLOAD[@]}"; do
    curl -sSL -o "${script}" "${BASE_URL}/${script}" || { exit 1; }
  done
  curl -sSL -o "common.tar.gz" "${BASE_URL}/common.tar.gz" || { exit 1; }
  tar -xzf common.tar.gz &> /dev/null

  export SCRIPT_DIR="$WORK_DIR"
  source "${SCRIPT_DIR}/functions.sh"
  source "${SCRIPT_DIR}/nodejs.sh"
  source "${SCRIPT_DIR}/database.sh" 
  source "${SCRIPT_DIR}/genieacs.sh"
  
  run_initial_setup
  run_node_install
  run_database_install
  install_genieacs_npm
  apply_config_files
  apply_file_patches
  start_or_restart_services
  apply_data_patch
  check_all_services_status
  show_success_message
}

main