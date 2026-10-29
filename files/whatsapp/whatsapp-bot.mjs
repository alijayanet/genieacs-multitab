import nodeCrypto from 'crypto';
if (!globalThis.crypto || !globalThis.crypto.subtle) {
  try {
    globalThis.crypto = nodeCrypto.webcrypto || nodeCrypto;
  } catch (_) {}
}

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pino from 'pino';
import qrcodeTerminal from 'qrcode-terminal';
import QRCodeNode from 'qrcode';
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers
} from '@whiskeysockets/baileys';
import { WaLidStore } from './waLidStore.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Konfigurasi direktori auth dan penyimpanan LID
const AUTH_FOLDER = process.env.WA_AUTH_FOLDER || path.join(__dirname, 'auth_info_baileys');
const LID_STORE_FILE = process.env.WA_LID_STORE || path.join(__dirname, 'wa_lid_store.json');
const AGENT_API_URL = process.env.AGENT_API_URL || 'http://127.0.0.1:3000';
const HTTP_PORT = parseInt(process.env.WA_HTTP_PORT || '7559', 10);

const lidStore = new WaLidStore(LID_STORE_FILE);

// Status Bot WhatsApp
export const whatsappStatus = {
  connection: 'disconnected', // 'disconnected', 'connecting', 'qr', 'open', 'loggedOut'
  qr: null,
  qrImage: null,
  user: null,
  lastUpdate: new Date().toISOString()
};

// Cache Store Berkinerja Tinggi untuk Baileys Signal Keys & Retries (Anti 'Waiting for this message')
class BaileysCacheStore {
  constructor(ttlMs = 600000, maxSize = 5000) {
    this.cache = new Map();
    this.ttlMs = ttlMs;
    this.maxSize = maxSize;
  }
  get(key) {
    const item = this.cache.get(key);
    if (!item) return undefined;
    if (Date.now() - item.time > this.ttlMs) {
      this.cache.delete(key);
      return undefined;
    }
    return item.val;
  }
  set(key, val) {
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, { val, time: Date.now() });
  }
  del(key) {
    this.cache.delete(key);
  }
  flushAll() {
    this.cache.clear();
  }
}

const msgRetryCounterCache = new BaileysCacheStore(600000);
const userDevicesCache = new BaileysCacheStore(3600000);
const placeholderResendCache = new BaileysCacheStore(600000);

// Multi-Layer Message Store
class MultiLayerMessageStore {
  constructor(maxSize = 5000) {
    this.store = new Map();
    this.maxSize = maxSize;
  }

  cache(key, message) {
    if (!key || !key.id || !message) return;
    const msgId = String(key.id);
    const remote = String(key.remoteJid || '');
    const combinedKey = `${remote}:${msgId}`;

    let protoMsg = message;
    if (message.message) protoMsg = message.message;

    this.store.set(combinedKey, protoMsg);
    this.store.set(msgId, protoMsg);

    if (this.store.size > this.maxSize * 2) {
      const keysToDelete = Array.from(this.store.keys()).slice(0, 500);
      for (const k of keysToDelete) this.store.delete(k);
    }
  }

  async get(key) {
    if (!key || !key.id) return undefined;
    const msgId = String(key.id);
    const remote = String(key.remoteJid || '');
    const combinedKey = `${remote}:${msgId}`;

    if (this.store.has(combinedKey)) {
      return this.store.get(combinedKey);
    }
    if (this.store.has(msgId)) {
      return this.store.get(msgId);
    }

    for (const [k, v] of this.store.entries()) {
      if (k.endsWith(`:${msgId}`) || k === msgId) {
        return v;
      }
    }
    return undefined;
  }
}

const messageStore = new MultiLayerMessageStore(5000);
function cacheSentMessage(key, message) {
  messageStore.cache(key, message);
}

/**
 * Membersihkan file session dan pre-key usang jika terjadi Bad MAC desync
 * tanpa menghapus creds.json (tidak perlu scan QR ulang)
 */
export function cleanStaleSessionKeys(authFolder) {
  try {
    const folder = authFolder || AUTH_FOLDER;
    if (!fs.existsSync(folder)) return 0;
    const files = fs.readdirSync(folder);
    let cleaned = 0;
    for (const f of files) {
      if (f.startsWith('session-') || f.startsWith('pre-key-') || f.startsWith('sender-key-') || f.startsWith('app-state-sync-')) {
        try {
          fs.unlinkSync(path.join(folder, f));
          cleaned++;
        } catch (_) {}
      }
    }
    console.log(`[WA Session Auto-Repair] Membersihkan ${cleaned} session/pre-key usang (creds.json tetap dipertahankan).`);
    return cleaned;
  } catch (err) {
    console.warn(`[WA Session Auto-Repair] Gagal membersihkan session keys: ${err.message}`);
    return 0;
  }
}

// In-Memory LID Reverse Mapping Map
let authLidReverse = new Map();

export function loadAuthLidReverseMap(authFolder) {
  try {
    const folder = authFolder || AUTH_FOLDER;
    if (!fs.existsSync(folder)) return;
    const files = fs.readdirSync(folder);
    const next = new Map();
    for (const f of files) {
      const forward = /^lid-mapping-(\d+)\.json$/i.exec(f);
      const reverse = /^lid-mapping-(\d+)_reverse\.json$/i.exec(f);
      if (!forward && !reverse) continue;

      const raw = fs.readFileSync(path.join(folder, f), 'utf8');
      let value = null;
      try {
        value = JSON.parse(raw);
      } catch (e) {
        value = String(raw || '').trim().replace(/^"|"$/g, '');
      }

      if (forward) {
        let phoneDigits = forward[1].replace(/\D/g, '');
        if (phoneDigits.startsWith('0')) phoneDigits = '62' + phoneDigits.slice(1);
        else if (phoneDigits.startsWith('8')) phoneDigits = '62' + phoneDigits;
        const lidDigits = String(value || '').replace(/\D/g, '');
        if (!phoneDigits || !lidDigits) continue;
        next.set(lidDigits + '@lid', phoneDigits);
        next.set(lidDigits, phoneDigits);
        continue;
      }

      if (reverse) {
        const lidDigits = String(reverse[1] || '').replace(/\D/g, '');
        let phoneDigits = String(value || '').replace(/\D/g, '');
        if (phoneDigits.startsWith('0')) phoneDigits = '62' + phoneDigits.slice(1);
        else if (phoneDigits.startsWith('8')) phoneDigits = '62' + phoneDigits;
        if (!phoneDigits || !lidDigits) continue;
        next.set(lidDigits + '@lid', phoneDigits);
        next.set(lidDigits, phoneDigits);
        continue;
      }
    }
    authLidReverse = next;
    if (authLidReverse.size > 0) {
      console.log(`[WA LID Reverse Map] Memuat ${authLidReverse.size} pemetaan LID otomatis dari folder auth.`);
    }
  } catch (e) {
    console.warn(`[WA LID Reverse Map] Gagal memuat auth lid reverse map: ${e.message}`);
  }
}

/** Mengambil nomor HP dari JID/Key dengan penanganan @lid */
export function getPhoneFromKey(key) {
  if (!key) return null;
  const remoteJid = key.remoteJid || key;
  if (!remoteJid || typeof remoteJid !== 'string') return null;

  // 1. Check senderPn jika ada
  if (key.senderPn && key.senderPn.endsWith('@s.whatsapp.net')) {
    let p = key.senderPn.split('@')[0].replace(/\D/g, '');
    if (p.startsWith('0')) p = '62' + p.slice(1);
    else if (p.startsWith('8')) p = '62' + p;
    else if (!p.startsWith('62')) p = '62' + p;
    return p;
  }

  // 2. Check jika remoteJid atau senderLid adalah @lid
  if (remoteJid.endsWith('@lid') || (key.senderLid && key.senderLid.endsWith('@lid'))) {
    const lidJid = remoteJid.endsWith('@lid') ? remoteJid : key.senderLid;
    const lidUser = lidJid.split('@')[0];

    // Cek authLidReverse
    const fromAuth = authLidReverse.get(lidJid) || authLidReverse.get(lidUser);
    if (fromAuth) return fromAuth;

    // Cek lidStore
    try {
      const mapped = lidStore.get(lidJid) || lidStore.get(lidUser);
      if (mapped) {
        let p = String(mapped).replace(/\D/g, '');
        if (p.startsWith('0')) p = '62' + p.slice(1);
        else if (p.startsWith('8')) p = '62' + p;
        else if (!p.startsWith('62')) p = '62' + p;
        return p;
      }
    } catch (_) {}
  }

  // 3. Extract phone number dari JID standar
  const [user, host] = remoteJid.split('@');
  if (!user || !host) return null;

  const phone = user.replace(/\D/g, '');
  if (!phone) return null;
  if (phone.startsWith('0')) return '62' + phone.slice(1);
  if (phone.startsWith('8')) return '62' + phone;
  return phone;
}

export function expandTagCandidates(input) {
  const t = String(input || '').trim();
  if (!t) return [];
  if (/^\d+$/.test(t)) {
    const d = t.replace(/\D/g, '');
    const set = new Set([d]);
    if (d.startsWith('62') && d.length > 2) set.add('0' + d.slice(2));
    if (d.startsWith('0')) set.add('62' + d.slice(1));
    return [...set];
  }
  return [t];
}

export function normalizeKey(key) {
  if (!key) return {};
  return {
    remoteJid: key.remoteJid,
    senderPn: key.senderPn || null,
    senderLid: key.senderLid || null
  };
}

/** Admin dikenali dari nomor WA (bukan @lid saja). Pakai senderPn atau remoteJid @s.whatsapp.net / @lid */
export function isWhatsappAdminKey(key, adminSet, sock) {
  if (sock && sock.user && sock.user.id) {
    const selfJid = sock.user.id.split(':')[0];
    const selfLid = sock.user.lid ? sock.user.lid.split('@')[0] : null;
    const nk = normalizeKey(key);
    const sender = nk.senderPn || nk.remoteJid;
    if (sender) {
      const senderUser = sender.split('@')[0];
      if (senderUser === selfJid || (selfLid && senderUser === selfLid)) {
        return true; // Pesan dari nomor bot sendiri (self-chat) selalu dianggap admin
      }
    }
  }
  if (!adminSet || adminSet.size === 0) return false;
  const nk = normalizeKey(key);

  // 1. Cek JID nomor HP langsung
  const pnJid =
    nk.senderPn && nk.senderPn.endsWith('@s.whatsapp.net')
      ? nk.senderPn
      : nk.remoteJid && nk.remoteJid.endsWith('@s.whatsapp.net')
        ? nk.remoteJid
        : null;

  let digits = null;
  if (pnJid) {
    const [user] = pnJid.split('@');
    digits = user.replace(/\D/g, '') || null;
  }

  // 2. Cek jika LID JID
  if (nk.remoteJid && nk.remoteJid.endsWith('@lid')) {
    const lidUser = nk.remoteJid.split('@')[0];
    if (adminSet.has(nk.remoteJid) || adminSet.has(lidUser)) return true;
    const cachedTag = lidStore.get(nk.remoteJid) || lidStore.get(lidUser);
    if (cachedTag) {
      digits = String(cachedTag).replace(/\D/g, '');
    }
  }

  if (!digits) return false;
  for (const c of expandTagCandidates(digits)) {
    if (adminSet.has(c)) return true;
  }
  return false;
}

// Global runtime settings cache
let cachedAdminNumbers = ['081947215703'];
let cachedBrandName = 'ALIJAYA NET';
let cachedBrandPhone = '081947215703';

export async function fetchRemoteConfig() {
  try {
    const res = await fetch(`${AGENT_API_URL}/api/config`);
    if (res.ok) {
      const data = await res.json();
      if (data.brand_name) cachedBrandName = String(data.brand_name).trim();
      if (data.brand_phone) cachedBrandPhone = String(data.brand_phone).trim();

      const rawAdmins = data.wa_admin_numbers || data.brand_phone || '081947215703';
      const parsed = String(rawAdmins)
        .split(/[\s,;]+/)
        .map(n => n.trim().replace(/\D/g, ''))
        .filter(n => n.length >= 8);

      if (parsed.length > 0) {
        cachedAdminNumbers = parsed;
      }
      console.log(`[WA] Remote config synced: Brand='${cachedBrandName}', CS='${cachedBrandPhone}', Admins=[${cachedAdminNumbers.join(', ')}]`);
    } else {
      console.warn(`[WA] fetchRemoteConfig HTTP error: ${res.status}`);
    }
  } catch (err) {
    console.warn('[WA] Could not fetch remote config from agent:', err.message);
  }
}

export function loadWhatsappAdminSet() {
  const set = new Set();
  for (const n of cachedAdminNumbers) {
    const digits = String(n).replace(/\D/g, '');
    if (digits.length >= 8) {
      for (const c of expandTagCandidates(digits)) {
        set.add(c);
      }
    } else if (n) {
      set.add(n);
    }
  }

  // Masukkan pemetaan LID dari store
  const storeMap = lidStore.getAll() || {};
  for (const [key, val] of Object.entries(storeMap)) {
    const valDigits = String(val || '').replace(/\D/g, '');
    if (valDigits) {
      for (const c of expandTagCandidates(valDigits)) {
        if (set.has(c)) {
          set.add(key);
          set.add(key.split('@')[0]);
        }
      }
    }
  }
  return set;
}

export function waAutoWrap(text) {
  return String(text || '').trim();
}

function getMessageText(m) {
  const msg = m.message;
  if (!msg) return '';
  if (msg.conversation) return msg.conversation;
  if (msg.extendedTextMessage?.text) return msg.extendedTextMessage.text;
  return '';
}

let currentSock = null;
let isStarting = false;

export async function startWhatsAppBot() {
  if (isStarting) return;
  isStarting = true;

  try {
    whatsappStatus.connection = 'connecting';
    whatsappStatus.lastUpdate = new Date().toISOString();

    await fetchRemoteConfig();
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
    loadAuthLidReverseMap(AUTH_FOLDER);

    let version = [2, 3000, 1043857760];
    try {
      const latest = await fetchLatestBaileysVersion();
      if (latest && latest.version) {
        version = latest.version;
      }
    } catch (e) {
      console.warn('[WA] Gagal fetch latest Baileys version:', e.message);
    }

    const sock = makeWASocket({
      version,
      auth: state,
      browser: Browsers.ubuntu('Chrome'),
      syncFullHistory: false,
      markOnlineOnConnect: true,
      generateHighQualityLinkPreview: false,
      msgRetryCounterCache,
      userDevicesCache,
      placeholderResendCache,
      retryRequestDelayMs: 250,
      maxMsgRetryCount: 5,
      keepAliveIntervalMs: 30000,
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      appStateMacVerification: {
        patch: false,
        snapshot: false
      },
      getMessage: async (key) => {
        return await messageStore.get(key);
      },
      logger: pino({ level: 'silent' })
    });

    currentSock = sock;

    sock.ev.on('creds.update', () => {
      saveCreds();
      loadAuthLidReverseMap(AUTH_FOLDER);
    });

    // Merekam pemetaan nomor HP dari kontak (LID Mapping real-time)
    sock.ev.on('contacts.upsert', (contacts) => {
      for (const contact of contacts) {
        if (contact.id && contact.id.endsWith('@lid') && contact.phoneNumber) {
          let digits = String(contact.phoneNumber).replace(/\D/g, '');
          if (digits.startsWith('0')) digits = '62' + digits.slice(1);
          else if (digits.startsWith('8')) digits = '62' + digits;
          lidStore.set(contact.id, digits);
          authLidReverse.set(contact.id, digits);
          authLidReverse.set(contact.id.split('@')[0], digits);
        }
      }
    });

    sock.ev.on('messaging-history.set', ({ contacts }) => {
      if (contacts) {
        for (const contact of contacts) {
          if (contact.id && contact.id.endsWith('@lid') && contact.phoneNumber) {
            let digits = String(contact.phoneNumber).replace(/\D/g, '');
            if (digits.startsWith('0')) digits = '62' + digits.slice(1);
            else if (digits.startsWith('8')) digits = '62' + digits;
            lidStore.set(contact.id, digits);
            authLidReverse.set(contact.id, digits);
            authLidReverse.set(contact.id.split('@')[0], digits);
          }
        }
      }
    });

    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;
      whatsappStatus.lastUpdate = new Date().toISOString();

      if (qr) {
        whatsappStatus.qr = qr;
        whatsappStatus.connection = 'qr';
        console.log(`[WA] QR Code Baru Dihasilkan: ${qr.slice(0, 25)}...`);
        try {
          qrcodeTerminal.generate(qr, { small: true });
        } catch (_) {}

        QRCodeNode.toDataURL(qr, { margin: 2, scale: 6 })
          .then((url) => {
            whatsappStatus.qrImage = url;
          })
          .catch(() => {
            whatsappStatus.qrImage = null;
          });
      }

      if (connection) {
        console.log(`[WA] Connection Update: ${connection}`);
      }

      if (connection === 'close') {
        whatsappStatus.qr = null;
        whatsappStatus.qrImage = null;
        whatsappStatus.user = null;
        const code = lastDisconnect?.error?.output?.statusCode;
        const errorMsg = lastDisconnect?.error?.message || '';
        const shouldReconnect = code !== DisconnectReason.loggedOut;
        whatsappStatus.connection = code === DisconnectReason.loggedOut ? 'loggedOut' : 'connecting';

        // Auto-repair jika terjadi desinkronisasi sesi / Bad MAC
        const isBadMac = errorMsg.includes('Bad MAC') || errorMsg.includes('MAC mismatch') || code === 401;
        if (isBadMac && code !== DisconnectReason.loggedOut) {
          console.warn(`[WA Auto-Repair] Terdeteksi desinkronisasi sesi/Bad MAC (${errorMsg}). Membersihkan pre-key...`);
          cleanStaleSessionKeys(AUTH_FOLDER);
        }

        console.warn(
          `[WA] WhatsApp terputus (kode ${code}). ` +
          (code === DisconnectReason.loggedOut
            ? 'Sesi logout — silakan scan QR lagi.'
            : 'Mencoba reconnect dalam 3 detik...')
        );

        if (shouldReconnect) {
          const delay = code === DisconnectReason.restartRequired ? 500 : 3000;
          setTimeout(() => startWhatsAppBot(), delay);
        }
      } else if (connection === 'open') {
        whatsappStatus.qr = null;
        whatsappStatus.qrImage = null;
        whatsappStatus.connection = 'open';
        whatsappStatus.user = sock.user;
        console.log(`[WA] WhatsApp Bot Terhubung! Akun: ${sock.user?.id || 'unknown'}, Nama: ${sock.user?.name || '-'}`);

        // Pre-resolve admin LIDs
        (async () => {
          try {
            await fetchRemoteConfig();
            for (const n of cachedAdminNumbers) {
              const digits = String(n).replace(/\D/g, '');
              if (digits.length >= 8) {
                const formatted = digits.startsWith('0') ? '62' + digits.slice(1) : digits.startsWith('62') ? digits : '62' + digits;
                const jid = `${formatted}@s.whatsapp.net`;
                const waCheck = await sock.onWhatsApp(jid).catch(() => []);
                if (waCheck && waCheck.length > 0 && waCheck[0].exists && waCheck[0].lid) {
                  const lidJid = waCheck[0].lid;
                  const lidUser = lidJid.split('@')[0];
                  lidStore.set(lidJid, formatted);
                  lidStore.set(lidUser, formatted);
                  authLidReverse.set(lidJid, formatted);
                  authLidReverse.set(lidUser, formatted);
                  console.log(`[WA Admin Pre-resolve] Nomor admin ${formatted} terpetakan ke LID: ${lidJid}`);
                }
              }
            }
          } catch (e) {
            console.warn('[WA Admin Pre-resolve] Gagal resolve LID admin:', e.message);
          }
        })();
      }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const m of messages) {
        try {
          if (m.key && m.message) {
            cacheSentMessage(m.key, m.message);
          }
          const selfPn = sock.user && sock.user.id ? sock.user.id.split(':')[0].split('@')[0] : null;
          const selfLid = sock.user && sock.user.lid ? sock.user.lid.split('@')[0] : null;
          const remoteUser = m.key.remoteJid ? m.key.remoteJid.split('@')[0] : null;
          const isSelf = m.key.fromMe && (remoteUser === selfPn || (selfLid && remoteUser === selfLid));
          if (m.key.fromMe && !isSelf) continue;

          const text = getMessageText(m);
          if (!text) continue;

          const remote = m.key.remoteJid;
          if (!remote || remote.endsWith('@g.us')) continue; // Mengabaikan pesan dari grup

          const phone = getPhoneFromKey(m.key);
          const targetJid = (phone && phone.length >= 8) ? `${phone}@s.whatsapp.net` : remote;

          // Balas ke pengirim
          const reply = async (msg) => {
            try {
              const wrapped = waAutoWrap(msg);
              const result = await sock.sendMessage(targetJid, { text: wrapped });
              if (result && result.key && result.message) {
                cacheSentMessage(result.key, result.message);
              }
            } catch (sendErr) {
              console.error('[WA reply] Gagal mengirim balasan:', sendErr.message);
            }
          };

          const adminSet = loadWhatsappAdminSet();
          const isAdmin = (phone && adminSet.has(phone)) || isWhatsappAdminKey(m.key, adminSet, sock);

          console.log(`[WA] Pesan dari ${phone || remote} (isAdmin: ${isAdmin}): "${text}"`);

          // Penanganan khusus perintah binding customer "daftar <pppoe_username>"
          const trimmed = text.trim();
          const parts = trimmed.split(/\s+/);
          const cmd = parts[0].toLowerCase().replace(/^[\/!#]/, '');

          if (cmd === 'daftar' && parts.length >= 2) {
            const pppoeUser = parts[1].trim();
            if (phone) {
              lidStore.set(phone, pppoeUser);
              if (m.key.senderLid) lidStore.set(m.key.senderLid, pppoeUser);
              if (m.key.remoteJid.endsWith('@lid')) lidStore.set(m.key.remoteJid, pppoeUser);
            }
          }

          // Kirim perintah ke GenieACS Python Agent Engine
          try {
            const agentPayload = {
              text: trimmed,
              sender: phone || remote,
              isAdmin: isAdmin,
              pushName: m.pushName || 'User',
              registeredTag: phone ? lidStore.get(phone) : null
            };

            const agentRes = await fetch(`${AGENT_API_URL}/api/agent_command`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(agentPayload)
            });

            if (agentRes.ok) {
              const resData = await agentRes.json();
              if (resData && resData.reply) {
                await reply(resData.reply);
              }
              continue;
            } else {
              console.error(`[WA] GenieACS Agent API HTTP error: ${agentRes.status}`);
            }
          } catch (agentErr) {
            console.error('[WA] Gagal menghubungi GenieACS Agent API:', agentErr.message);
            if (isAdmin && cmd !== 'menu' && cmd !== 'bantuan' && cmd !== 'help') {
              await reply(`⚠️ Layanan Agent GenieACS (Port 7558) belum merespon: ${agentErr.message}`);
              continue;
            }
          }

          // Fallback lokal jika Agent API belum merespon
          if (cmd === 'menu' || cmd === 'bantuan' || cmd === 'help') {
            if (isAdmin) {
              const adminMenu = 
`👑 *MENU ADMIN GENIEACS*
━━━━━━━━━━━━━━━━━━━━
• *cek <user/sn/ip>* : Status lengkap ONT
• *redaman* : Audit redaman optik kritis
• *ontbaru* : Deteksi ONT baru tanpa PPPoE
• *klien <user>* : Daftar perangkat WiFi terhubung
• *reboot <user>* : Restart ONT
• *wifion <user>* : Hidupkan radio WiFi
• *wifioff <user>* : Matikan radio WiFi
• *wifi <user> <ssid> <pass>* : Ubah WiFi
• *superadmin <user> <pass>* : Password web ONT
• *addwan <user> <user_ppp> <pass_ppp> [vlan]*
• *factoryreset <user>* : Reset pabrik ONT
• *ping <user> [host]* : Uji ping dari ONT
• *status* : Statistik performa server`;
              await reply(adminMenu);
            } else {
              const userMenu = 
`👋 *LAYANAN MANDIRI PELANGGAN*
━━━━━━━━━━━━━━━━━━━━
• *cek* : Cek status internet, SSID & redaman ONT
• *reboot* : Restart ONT Anda dari jarak jauh
• *wifi <nama_baru> <sandi_baru>* : Ubah sandi WiFi
• *daftar <id_pelanggan>* : Hubungkan nomor WA ini`;
              await reply(userMenu);
            }
          }
        } catch (e) {
          console.error('[WA] Message handler error:', e.message || e);
        }
      }
    });

  } catch (err) {
    console.error('[WA] Gagal inisialisasi Baileys WhatsApp bot:', err);
  } finally {
    isStarting = false;
  }
}

/** Kirim pesan keluar ke nomor WhatsApp tertentu */
export async function sendWhatsAppMessage(to, message) {
  if (!currentSock || whatsappStatus.connection !== 'open') {
    throw new Error('Bot WhatsApp belum terhubung. Silakan scan QR terlebih dahulu.');
  }

  let digits = String(to || '').replace(/\D/g, '');
  if (!digits) throw new Error('Nomor tujuan tidak valid');
  if (digits.startsWith('0')) digits = '62' + digits.slice(1);
  else if (digits.startsWith('8')) digits = '62' + digits;

  const jid = `${digits}@s.whatsapp.net`;
  const wrapped = waAutoWrap(message);
  const result = await currentSock.sendMessage(jid, { text: wrapped });
  if (result && result.key && result.message) {
    cacheSentMessage(result.key, result.message);
  }
  return true;
}

/** Logout dan hapus sesi */
export async function logoutWhatsApp() {
  try {
    if (currentSock) {
      try {
        await Promise.race([
          currentSock.logout(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Logout timeout')), 2500))
        ]);
      } catch (_) {}
      try {
        currentSock.end();
      } catch (_) {}
      currentSock = null;
    }
    if (fs.existsSync(AUTH_FOLDER)) {
      fs.rmSync(AUTH_FOLDER, { recursive: true, force: true });
    }
    whatsappStatus.connection = 'loggedOut';
    whatsappStatus.qr = null;
    whatsappStatus.qrImage = null;
    whatsappStatus.user = null;
    whatsappStatus.lastUpdate = new Date().toISOString();

    setTimeout(() => startWhatsAppBot(), 1500);
    return true;
  } catch (e) {
    console.error('[WA] Logout error:', e.message);
    return false;
  }
}

// HTTP Server Ringan untuk Integrasi dengan Web UI GenieACS (Port 7559)
const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (pathname === '/status' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(whatsappStatus));
    return;
  }

  if ((pathname === '/logout' || pathname === '/reset') && req.method === 'POST') {
    console.log('[WA] Permintaan reset / hapus sesi WhatsApp diterima...');
    const success = await logoutWhatsApp();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success, message: 'Sesi WhatsApp berhasil dihapus dan bot direset' }));
    return;
  }

  if (pathname === '/reload_admins' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        if (body) {
          const payload = JSON.parse(body);
          if (payload.brand_name) cachedBrandName = String(payload.brand_name).trim();
          if (payload.brand_phone) cachedBrandPhone = String(payload.brand_phone).trim();
          if (payload.wa_admin_numbers) {
            const parsed = String(payload.wa_admin_numbers)
              .split(/[\s,;]+/)
              .map(n => n.trim().replace(/\D/g, ''))
              .filter(n => n.length >= 8);
            if (parsed.length > 0) cachedAdminNumbers = parsed;
          }
          console.log(`[WA] /reload_admins updated: Brand='${cachedBrandName}', CS='${cachedBrandPhone}', Admins=[${cachedAdminNumbers.join(', ')}]`);
        }
      } catch (err) {
        console.error('[WA] Error reading /reload_admins body:', err);
      }
      await fetchRemoteConfig();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        success: true, 
        brand_name: cachedBrandName, 
        brand_phone: cachedBrandPhone, 
        admins: cachedAdminNumbers 
      }));
    });
    return;
  }

  if (pathname === '/send' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const ok = await sendWhatsAppMessage(payload.to, payload.text);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: ok }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

  if (pathname === '/lid_mappings' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      store: lidStore.getAll(),
      reverseMapCount: authLidReverse.size
    }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not Found' }));
});

server.listen(HTTP_PORT, '127.0.0.1', () => {
  console.log(`[WA] GenieACS WhatsApp Bot Gateway aktif di http://127.0.0.1:${HTTP_PORT}`);
  startWhatsAppBot();
});
