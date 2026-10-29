#!/usr/bin/env python3
# ==============================================================================
# ALIJAYA NET - Setup Bot Telegram, WhatsApp & AI GenieACS
# Pengembang: ALIJAYA NET (WhatsApp: 081947215703)
# ==============================================================================

import os
import sys
import subprocess
import pymongo

def get_db():
    candidates = []
    if os.environ.get("GENIEACS_MONGODB_CONNECTION_URL"):
        candidates.append(os.environ.get("GENIEACS_MONGODB_CONNECTION_URL"))
    for env_path in ["/opt/genieacs/genieacs.env", "/etc/genieacs.env", "/etc/default/genieacs"]:
        if os.path.isfile(env_path):
            try:
                with open(env_path, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if line.startswith("GENIEACS_MONGODB_CONNECTION_URL="):
                            val = line.split("=", 1)[1].strip().strip('"').strip("'")
                            if val and val not in candidates:
                                candidates.append(val)
            except Exception:
                pass
    for default_uri in [
        "mongodb://genie:genie@127.0.0.1:27017/genieacs",
        "mongodb://genie:genie@127.0.0.1/genieacs",
        "mongodb://127.0.0.1:27017/genieacs",
        "mongodb://127.0.0.1/genieacs",
        "mongodb://localhost:27017/genieacs"
    ]:
        if default_uri not in candidates:
            candidates.append(default_uri)

    for uri in candidates:
        try:
            client = pymongo.MongoClient(uri, serverSelectionTimeoutMS=2000)
            db_name = "genieacs"
            try:
                p = client.get_default_database()
                if p is not None:
                    db_name = p.name
            except Exception:
                pass
            client[db_name].command("ping")
            return client[db_name]
        except Exception:
            continue
    return None

def clean_val(v):
    if not v:
        return ""
    val = str(v).strip()
    while len(val) >= 2 and ((val.startswith("'") and val.endswith("'")) or (val.startswith('"') and val.endswith('"'))):
        val = val[1:-1].strip()
    return val

def mask_val(v):
    if not v:
        return "(Belum Disetting)"
    if len(v) <= 8:
        return "***"
    return v[:4] + "..." + v[-4:]

def reset_whatsapp_session():
    print("\n🗑️  Menghapus sesi WhatsApp...")
    auth_dirs = [
        "/opt/genieacs-agent/auth_info_baileys",
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "auth_info_baileys")
    ]
    wiped = False
    import shutil
    for ad in auth_dirs:
        if os.path.exists(ad):
            try:
                shutil.rmtree(ad, ignore_errors=True)
                wiped = True
                print(f"  ✔ Folder sesi dibersihkan: {ad}")
            except Exception as e:
                print(f"  ⚠ Gagal menghapus {ad}: {e}")
    try:
        subprocess.run(["systemctl", "restart", "genieacs-whatsapp.service"], check=False)
        print("  ✔ Layanan genieacs-whatsapp berhasil direstart.")
        print("  ℹ Silakan buka Web UI http://IP_SERVER:7558 atau ketik 'set-bot qr' untuk scan QR Code baru.")
    except Exception as e:
        print(f"  ⚠ Gagal restart genieacs-whatsapp: {e}")

def show_whatsapp_qr():
    print("\n📷 Memeriksa status & QR Code WhatsApp...")
    try:
        node_cmd = """import q from 'qrcode-terminal';
import http from 'http';
http.get('http://127.0.0.1:7559/status', (r) => {
  let b = '';
  r.on('data', c => b += c);
  r.on('end', () => {
    try {
      const d = JSON.parse(b);
      if (d.qr) {
        console.log('\\n📷 PINDAI QR CODE WHATSAPP INI DENGAN HP ANDA:');
        console.log('(Buka WhatsApp -> Perangkat Tertaut -> Tautkan Perangkat)\\n');
        q.generate(d.qr, { small: true });
        console.log('\\nStatus: Menunggu Scan QR Code.');
        console.log('Atau buka Web UI di browser: http://IP_SERVER:7558 (Tab WhatsApp)');
      } else if (d.connection === 'open') {
        console.log('\\n✅ WhatsApp SUDAH TERHUBUNG! Akun: ' + (d.user?.id || 'Bot Aktif'));
      } else {
        console.log('\\nStatus WhatsApp: ' + (d.connection || 'Menghubungkan...'));
        console.log('Silakan coba beberapa detik lagi atau buka Web UI di http://IP_SERVER:7558');
      }
    } catch (e) {
      console.error(e.message);
    }
  });
}).on('error', (e) => console.error('Gagal menghubungi port 7559: ' + e.message));"""
        cwd_dir = "/opt/genieacs-agent" if os.path.exists("/opt/genieacs-agent") else "."
        subprocess.run(["node", "--input-type=module", "-e", node_cmd], cwd=cwd_dir, check=False)
    except Exception as e:
        print(f"  ⚠ Gagal menampilkan QR di terminal: {e}")

def main():
    if len(sys.argv) > 1 and sys.argv[1] in ["reset-wa", "hapus-sesi", "resetwa", "reset"]:
        reset_whatsapp_session()
        sys.exit(0)

    if len(sys.argv) > 1 and sys.argv[1] in ["qr", "qrcode", "scan"]:
        show_whatsapp_qr()
        sys.exit(0)

    print("\n" + "═" * 68)
    print("   🤖 ALIJAYA NET - PENGATURAN BOT TELEGRAM, WHATSAPP & AI GENIEACS")
    print("   Kontak / WA: 081947215703")
    print("═" * 68)

    db = get_db()
    if db is None:
        print("\n❌ Gagal terhubung ke MongoDB (Port 27017). Pastikan MongoDB sedang berjalan!\n")
        sys.exit(1)

    # Ambil konfigurasi saat ini
    curr_token = ""
    curr_chat = ""
    curr_gemini = ""
    curr_brand = "ALIJAYA NET"
    curr_phone = "081947215703"
    curr_wa_admin = "081947215703"

    doc_token = db.config.find_one({"_id": "agent.telegram.botToken"})
    if doc_token: curr_token = clean_val(doc_token.get("value"))

    doc_chat = db.config.find_one({"_id": "agent.telegram.adminChatId"})
    if doc_chat: curr_chat = clean_val(doc_chat.get("value"))

    doc_gemini = db.config.find_one({"_id": "agent.gemini.apiKey"})
    if doc_gemini: curr_gemini = clean_val(doc_gemini.get("value"))

    doc_brand = db.config.find_one({"_id": "agent.brand.name"})
    if doc_brand and clean_val(doc_brand.get("value")):
        curr_brand = clean_val(doc_brand.get("value"))

    doc_phone = db.config.find_one({"_id": "agent.brand.phone"})
    if doc_phone and clean_val(doc_phone.get("value")):
        curr_phone = clean_val(doc_phone.get("value"))

    doc_wa_admin = db.config.find_one({"_id": "agent.whatsapp.admin_numbers"})
    if doc_wa_admin and clean_val(doc_wa_admin.get("value")):
        curr_wa_admin = clean_val(doc_wa_admin.get("value"))
    else:
        curr_wa_admin = curr_phone

    print("\nKonfigurasi Saat Ini:")
    print(f"  • Token Bot Telegram : {mask_val(curr_token)}")
    print(f"  • Chat ID Telegram   : {curr_chat if curr_chat else '(Belum Disetting)'}")
    print(f"  • Nomor Admin WA     : {curr_wa_admin}")
    print(f"  • Gemini API Key     : {mask_val(curr_gemini)}")
    print(f"  • Nama Brand/Usaha   : {curr_brand}")
    print(f"  • Nomor WhatsApp/CS  : {curr_phone}")
    print("\nPetunjuk: Langsung ketik/paste nilai baru. (Tekan ENTER jika tidak ingin mengubah)")
    print("─" * 68)

    try:
        new_token = input(f"1. Masukkan Token Bot Telegram [{mask_val(curr_token)}]: ").strip().strip("'\"")
        new_chat = input(f"2. Masukkan Chat ID Telegram [{curr_chat if curr_chat else '-'}]: ").strip().strip("'\"")
        new_wa_admin = input(f"3. Masukkan Nomor Admin WA [{curr_wa_admin}]: ").strip().strip("'\"")
        new_gemini = input(f"4. Masukkan Gemini API Key [{mask_val(curr_gemini)}]: ").strip().strip("'\"")
        new_brand = input(f"5. Masukkan Nama Brand/Usaha [{curr_brand}]: ").strip().strip("'\"")
        new_phone = input(f"6. Masukkan No. WhatsApp/CS [{curr_phone}]: ").strip().strip("'\"")
        reset_wa = input("7. Hapus sesi login WhatsApp (Ganti nomor bot / buat QR baru)? (y/N) [N]: ").strip().lower()
    except (KeyboardInterrupt, EOFError):
        print("\n\nOperasi dibatalkan.")
        sys.exit(0)

    if new_token:
        db.config.update_one({"_id": "agent.telegram.botToken"}, {"$set": {"value": f'"{new_token}"'}}, upsert=True)
        print("  ✔ Token Bot Telegram berhasil diperbarui.")

    if new_chat:
        db.config.update_one({"_id": "agent.telegram.adminChatId"}, {"$set": {"value": f'"{new_chat}"'}}, upsert=True)
        print("  ✔ Chat ID Admin Telegram berhasil diperbarui.")

    if new_wa_admin:
        db.config.update_one({"_id": "agent.whatsapp.admin_numbers"}, {"$set": {"value": f'"{new_wa_admin}"'}}, upsert=True)
        print("  ✔ Nomor Admin WhatsApp berhasil diperbarui.")

    if new_gemini:
        db.config.update_one({"_id": "agent.gemini.apiKey"}, {"$set": {"value": f'"{new_gemini}"'}}, upsert=True)
        print("  ✔ Gemini API Key berhasil diperbarui.")

    if new_brand:
        db.config.update_one({"_id": "agent.brand.name"}, {"$set": {"value": f'"{new_brand}"'}}, upsert=True)
        print("  ✔ Nama Brand berhasil diperbarui.")

    if new_phone:
        db.config.update_one({"_id": "agent.brand.phone"}, {"$set": {"value": f'"{new_phone}"'}}, upsert=True)
        print("  ✔ Nomor WhatsApp/CS berhasil diperbarui.")

    if reset_wa == 'y':
        reset_whatsapp_session()

    # Pastikan agent.enabled bernilai true
    db.config.update_one({"_id": "agent.enabled"}, {"$set": {"value": "true"}}, upsert=True)
    db.config.update_one({"_id": "agent.whatsapp.enabled"}, {"$set": {"value": "true"}}, upsert=True)

    # Restart service
    print("\n🔄 Merestart layanan bot (genieacs-agent & genieacs-whatsapp)...")
    try:
        subprocess.run(["systemctl", "restart", "genieacs-agent.service"], check=False)
        subprocess.run(["systemctl", "restart", "genieacs-whatsapp.service"], check=False)
        res = subprocess.run(["systemctl", "is-active", "genieacs-agent.service"], stdout=subprocess.PIPE, text=True)
        status = res.stdout.strip()
    except Exception:
        status = "unknown"

    print("\n" + "═" * 68)
    if status == "active":
        print("  ✔ SUKSES! Bot GenieACS AKTIF dan Siap Digunakan!")
        print("  • Buka Web UI di http://IP_SERVER:7558 (Tab WhatsApp)")
        print("  • Atau ketik 'set-bot qr' untuk melihat QR Code WhatsApp di terminal")
        print("  • Ketik 'set-bot reset-wa' untuk hapus sesi / ganti nomor bot")
    else:
        print(f"  ℹ Konfigurasi tersimpan. Status layanan: {status}")
    print("═" * 68 + "\n")

if __name__ == "__main__":
    main()
