/**
 * GenieACS Integrated All-in-One API & Web Router
 * Native Koa Router for GenieACS UI - Replaces external Python agent & sidecar ports.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
let MongoClient, Router;
try {
  MongoClient = require('mongodb').MongoClient;
} catch (e) {
  MongoClient = require(path.resolve(__dirname, 'node_modules/mongodb')).MongoClient;
}
try {
  Router = require('koa-router');
} catch (e) {
  Router = require(path.resolve(__dirname, 'node_modules/koa-router'));
}

const PUBLIC_DIR = path.resolve(__dirname, 'public');

let dbClient = null;
let db = null;

const DEFAULT_MONGO_URIS = [
  process.env.GENIEACS_MONGODB_CONNECTION_URL,
  'mongodb://127.0.0.1:27017/genieacs',
  'mongodb://genie:genie@127.0.0.1:27017/genieacs?authSource=genieacs'
].filter(Boolean);

async function getDb() {
  if (db) return db;
  for (const uri of DEFAULT_MONGO_URIS) {
    try {
      dbClient = new MongoClient(uri, { serverSelectionTimeoutMS: 3000 });
      await dbClient.connect();
      db = dbClient.db();
      const safeUri = uri.replace(/:([^:@]+)@/, ':****@');
      console.log(`[Integrated API] Terhubung ke MongoDB (${safeUri}) secara native`);
      return db;
    } catch (err) {
      // coba URI berikutnya
    }
  }
  console.error('[Integrated API] Gagal koneksi ke MongoDB pada semua URI kandidat');
  return null;
}

// In-memory store for OTP & customer sessions
const customerOtpStore = new Map();
const customerSessions = new Map();

function cleanPhoneNumber(phone) {
  if (!phone) return '';
  let digits = String(phone).replace(/\D/g, '');
  if (digits.startsWith('62')) digits = '0' + digits.slice(2);
  else if (digits.startsWith('8')) digits = '0' + digits;
  return digits;
}

function normalizeTo62(phone) {
  let digits = cleanPhoneNumber(phone);
  if (digits.startsWith('0')) return '62' + digits.slice(1);
  return digits;
}

function formatDate(d = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

const router = new Router();

// ==================== 1. VOICE & STATIC PAGES ROUTER ====================

// GET /api/voice/tts - Neural Text-to-Speech Streaming (id-ID-GadisNeural / id-ID-ArdiNeural)
router.get(['/api/voice/tts', '/bot-proxy/api/voice/tts', '/tts', '/voice/tts'], async ctx => {
  const rawText = String(ctx.query.text || '').trim();
  const voice = String(ctx.query.voice || 'id-ID-GadisNeural').trim();
  if (!rawText) {
    ctx.status = 400;
    ctx.body = 'Missing text parameter';
    return;
  }

  // Bersihkan teks untuk ucapan natural manusia
  let clean = rawText
    .replace(/[\*\_\`\~\#\>\+\=\|\{\}\.\!\-]/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[━─═\-_]{2,}/g, ' ')
    .replace(/[•►✔️✅❌⚠️🔔💡📌🔍🚀📶🌐📊👥🔄🆕❓💳💸🏢📞🏠👤📱🤖🌓]/g, ' ')
    .replace(/InternetGatewayDevice\.[^\s]+/g, 'parameter modem')
    .replace(/\s+/g, ' ')
    .trim();

  const words = clean.split(' ');
  if (words.length > 70) {
    clean = words.slice(0, 70).join(' ') + ' dan rincian lengkapnya sudah tampil di layar.';
  }

  const tmpId = Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  const mp3File = '/tmp/tts_' + tmpId + '.mp3';
  try {
    const { exec } = require('child_process');
    const safeText = clean.replace(/"/g, '\\"');
    const cmd = `/usr/local/bin/edge-tts --voice "${voice}" --text "${safeText}" --write-media "${mp3File}"`;
    
    await new Promise((resolve, reject) => {
      exec(cmd, { timeout: 15000 }, (error, stdout, stderr) => {
        if (error) return reject(error);
        resolve(stdout);
      });
    });

    if (fs.existsSync(mp3File) && fs.statSync(mp3File).size > 0) {
      ctx.type = 'audio/mpeg';
      ctx.set('Access-Control-Allow-Origin', '*');
      ctx.set('Cache-Control', 'public, max-age=3600');
      ctx.body = fs.createReadStream(mp3File);
      setTimeout(() => { try { if (fs.existsSync(mp3File)) fs.unlinkSync(mp3File); } catch(e){} }, 60000);
      return;
    }
  } catch(e) {
    console.error('TTS error:', e.message);
  }
  ctx.status = 500;
  ctx.body = 'TTS generation failed';
});

router.get(['/voice', '/voice.html', '/bot-proxy/voice', '/bot-proxy/voice.html', '/asisten', '/suara'], async ctx => {
  const file = path.join(PUBLIC_DIR, 'voice.html');
  if (fs.existsSync(file)) {
    ctx.type = 'text/html; charset=utf-8';
    ctx.body = fs.createReadStream(file);
  } else {
    ctx.status = 404;
    ctx.body = '<h3>File voice.html belum tersedia</h3>';
  }
});

router.get(['/peta', '/peta.html', '/bot-proxy/peta'], async ctx => {
  const file = path.join(PUBLIC_DIR, 'peta.html');
  if (fs.existsSync(file)) {
    ctx.type = 'text/html; charset=utf-8';
    ctx.body = fs.createReadStream(file);
  } else {
    ctx.status = 404;
    ctx.body = '<h3>File peta.html belum tersedia</h3>';
  }
});

router.get(['/mywifi', '/mywifi.html', '/portal', '/pelanggan', '/bot-proxy/mywifi'], async ctx => {
  const file = path.join(PUBLIC_DIR, 'mywifi.html');
  if (fs.existsSync(file)) {
    ctx.type = 'text/html; charset=utf-8';
    ctx.body = fs.createReadStream(file);
  } else {
    ctx.status = 404;
    ctx.body = '<h3>Portal Mandiri WiFi belum terpasang (mywifi.html tidak ditemukan).</h3>';
  }
});

router.get(['/donasi', '/donasi.html', '/bot-proxy/donasi'], async ctx => {
  const file = path.join(PUBLIC_DIR, 'donasi.html');
  if (fs.existsSync(file)) {
    ctx.type = 'text/html; charset=utf-8';
    ctx.body = fs.createReadStream(file);
  } else {
    ctx.status = 404;
    ctx.body = '<h3>File donasi.html tidak ditemukan</h3>';
  }
});

router.get(['/bot', '/bot.html', '/bot-proxy', '/bot-proxy/', '/bot-config', '/admin/bot'], async ctx => {
  const file = path.join(PUBLIC_DIR, 'bot.html');
  if (fs.existsSync(file)) {
    ctx.type = 'text/html; charset=utf-8';
    ctx.body = fs.createReadStream(file);
  } else {
    ctx.status = 404;
    ctx.body = '<h3>File bot.html belum tersedia</h3>';
  }
});

// ==================== 2. GEOLOCATION & ODP API ====================

// GET /api/geo/device
router.get(['/api/geo/device', '/bot-proxy/api/geo/device'], async ctx => {
  const devId = (ctx.query.id || ctx.query._id || '').trim();
  if (!devId) {
    ctx.body = { success: false, message: 'Parameter id tidak boleh kosong' };
    return;
  }

  const database = await getDb();
  if (!database) {
    ctx.body = { success: false, message: 'Database tidak terhubung' };
    return;
  }

  const pattern = devId
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/(?:-|%2D)/gi, '(?:-|%2D)')
    .replace(/(?: |%20)/gi, '(?: |%20)');
  const idRegex = new RegExp('^' + pattern + '$', 'i');

  const loc = await database.collection('device_locations').findOne({
    $or: [{ _id: devId }, { _id: idRegex }]
  });
  if (loc) {
    ctx.body = {
      success: true,
      data: {
        _id: String(loc._id || devId),
        name: String(loc.name || ''),
        phone: String(loc.phone || ''),
        odp: String(loc.odp || ''),
        address: String(loc.address || ''),
        notes: String(loc.notes || ''),
        lat: parseFloat(loc.lat || 0.0),
        lng: parseFloat(loc.lng || 0.0),
        updated_at: String(loc.updated_at || '')
      }
    };
    return;
  }

  // Fallback ke dev_raw
  const devRaw = await database.collection('devices').findOne({
    $or: [{ _id: devId }, { _id: idRegex }]
  });
  let pppoe = '';
  let custPhone = '';
  if (devRaw) {
    if (devRaw.VirtualParameters?.pppoeUsername?.value) {
      pppoe = devRaw.VirtualParameters.pppoeUsername.value[0] || '';
    }
    const tags = devRaw._tags || devRaw.tags || [];
    for (const t of tags) {
      if (typeof t === 'string') {
        const digits = t.replace(/\D/g, '');
        if (digits.length >= 8 && (digits.startsWith('08') || digits.startsWith('628'))) {
          custPhone = t;
          break;
        }
      }
    }
  }

  ctx.body = {
    success: true,
    data: {
      _id: devId,
      name: pppoe,
      phone: custPhone,
      odp: '',
      address: '',
      notes: '',
      lat: 0.0,
      lng: 0.0,
      updated_at: ''
    }
  };
});

// POST /api/geo/device
router.post(['/api/geo/device', '/bot-proxy/api/geo/device'], async ctx => {
  const req = ctx.request.body || {};
  const devId = (req._id || req.id || '').trim();
  if (!devId) {
    ctx.body = { success: false, message: 'ID Perangkat tidak boleh kosong' };
    return;
  }

  const database = await getDb();
  if (!database) {
    ctx.body = { success: false, message: 'Database tidak terhubung' };
    return;
  }

  const existing = await database.collection('device_locations').findOne({ _id: devId });
  let lat = parseFloat(req.lat);
  let lng = parseFloat(req.lng);

  if ((isNaN(lat) || lat === 0.0) && existing) lat = parseFloat(existing.lat || 0.0);
  if ((isNaN(lng) || lng === 0.0) && existing) lng = parseFloat(existing.lng || 0.0);

  const doc = {
    _id: devId,
    name: String(req.name || '').trim(),
    lat: isNaN(lat) ? 0.0 : lat,
    lng: isNaN(lng) ? 0.0 : lng,
    odp: String(req.odp || '').trim().toUpperCase(),
    phone: String(req.phone || '').trim(),
    address: String(req.address || '').trim(),
    notes: String(req.notes || '').trim(),
    updated_at: formatDate()
  };

  try {
    await database.collection('device_locations').updateOne({ _id: devId }, { $set: doc }, { upsert: true });

    // Auto-sync nomor HP ke Tags GenieACS
    if (doc.phone) {
      const digits = doc.phone.replace(/\D/g, '');
      if (digits.length >= 8) {
        let tagToAdd = digits;
        if (digits.startsWith('62')) tagToAdd = '0' + digits.slice(2);
        else if (digits.startsWith('8')) tagToAdd = '0' + digits;

        await database.collection('devices').updateOne(
          { _id: devId },
          { $addToSet: { _tags: tagToAdd } }
        );
      }
    }

    ctx.body = { success: true, message: 'Titik lokasi pelanggan berhasil disimpan', data: doc };
  } catch (err) {
    ctx.body = { success: false, message: 'Gagal menyimpan ke database: ' + err.message };
  }
});

// POST /api/geo/device/delete
router.post(['/api/geo/device/delete', '/bot-proxy/api/geo/device/delete'], async ctx => {
  const req = ctx.request.body || {};
  const devId = (req._id || req.id || '').trim();
  if (!devId) {
    ctx.body = { success: false, message: 'ID Perangkat tidak boleh kosong' };
    return;
  }

  const database = await getDb();
  if (!database) {
    ctx.body = { success: false, message: 'Database tidak terhubung' };
    return;
  }

  const res = await database.collection('device_locations').deleteOne({ _id: devId });
  ctx.body = { success: true, message: `Lokasi pelanggan berhasil dihapus (${res.deletedCount})` };
});

// GET /api/geo/odps
router.get(['/api/geo/odps', '/bot-proxy/api/geo/odps'], async ctx => {
  const database = await getDb();
  if (!database) {
    ctx.body = { success: false, error: 'Database tidak terhubung', odps: [] };
    return;
  }

  try {
    const odpCursor = await database.collection('odp_locations').find({}).toArray();
    const odps = [];

    for (const doc of odpCursor) {
      const odpId = doc._id;
      if (!odpId) continue;

      const used = await database.collection('device_locations').countDocuments({ odp: odpId });
      const cap = parseInt(doc.capacity || 8, 10);

      odps.push({
        _id: odpId,
        name: doc.name || odpId,
        lat: parseFloat(doc.lat || 0.0),
        lng: parseFloat(doc.lng || 0.0),
        capacity: cap,
        color: doc.color || '#3b82f6',
        notes: doc.notes || '',
        used_ports: used,
        available_ports: Math.max(0, cap - used),
        updated_at: doc.updated_at || ''
      });
    }

    ctx.body = { success: true, odps };
  } catch (err) {
    ctx.body = { success: false, error: err.message, odps: [] };
  }
});

// POST /api/geo/odp
router.post(['/api/geo/odp', '/bot-proxy/api/geo/odp'], async ctx => {
  const req = ctx.request.body || {};
  let odpId = String(req._id || '').trim().toUpperCase();

  const database = await getDb();
  if (!database) {
    ctx.body = { success: false, message: 'Database tidak terhubung' };
    return;
  }

  if (!odpId) {
    const count = await database.collection('odp_locations').countDocuments({}) + 1;
    odpId = `ODP-ALJ-${String(count).padStart(2, '0')}`;
  }

  const existing = await database.collection('odp_locations').findOne({ _id: odpId });
  let lat = parseFloat(req.lat);
  let lng = parseFloat(req.lng);
  if ((isNaN(lat) || lat === 0.0) && existing) lat = parseFloat(existing.lat || 0.0);
  if ((isNaN(lng) || lng === 0.0) && existing) lng = parseFloat(existing.lng || 0.0);

  const doc = {
    _id: odpId,
    name: String(req.name || odpId).trim(),
    lat: isNaN(lat) ? 0.0 : lat,
    lng: isNaN(lng) ? 0.0 : lng,
    capacity: parseInt(req.capacity || 8, 10),
    color: String(req.color || '#3b82f6').trim(),
    notes: String(req.notes || '').trim(),
    updated_at: formatDate()
  };

  try {
    await database.collection('odp_locations').updateOne({ _id: odpId }, { $set: doc }, { upsert: true });
    ctx.body = { success: true, message: `Data ${odpId} berhasil disimpan`, data: doc };
  } catch (err) {
    ctx.body = { success: false, message: 'Gagal menyimpan ODP: ' + err.message };
  }
});

// POST /api/geo/odp/delete
router.post(['/api/geo/odp/delete', '/bot-proxy/api/geo/odp/delete'], async ctx => {
  const req = ctx.request.body || {};
  const odpId = String(req._id || req.id || '').trim().toUpperCase();
  if (!odpId) {
    ctx.body = { success: false, message: 'ID ODP tidak boleh kosong' };
    return;
  }

  const database = await getDb();
  if (!database) {
    ctx.body = { success: false, message: 'Database tidak terhubung' };
    return;
  }

  const res = await database.collection('odp_locations').deleteOne({ _id: odpId });
  ctx.body = { success: true, message: `ODP ${odpId} berhasil dihapus (${res.deletedCount})` };
});

// GET /api/geo/devices (Untuk Leaflet Map di /peta)
router.get(['/api/geo/devices', '/bot-proxy/api/geo/devices'], async ctx => {
  const database = await getDb();
  if (!database) {
    ctx.body = { success: false, error: 'Database tidak terhubung', mapped: [], unmapped: [] };
    return;
  }

  try {
    const locDocs = await database.collection('device_locations').find({}).toArray();
    const mappedMap = {};
    for (const d of locDocs) {
      if (d._id) mappedMap[d._id] = d;
    }

    const devCursor = await database.collection('devices').find({}, {
      projection: {
        _id: 1,
        _deviceId: 1,
        _lastInform: 1,
        _ip: 1,
        VirtualParameters: 1,
        _tags: 1
      }
    }).toArray();

    const mapped = [];
    const unmapped = [];
    const nowTs = Date.now();

    for (const dev of devCursor) {
      const devId = dev._id;
      if (!devId) continue;

      let pppoe = '';
      if (dev.VirtualParameters?.pppoeUsername?.value) {
        pppoe = dev.VirtualParameters.pppoeUsername.value[0] || '';
      }

      const serial = dev._deviceId?._SerialNumber || '-';
      const productClass = dev._deviceId?._ProductClass || '-';
      const ip = dev.VirtualParameters?.pppoeIP?.value?.[0] || dev._ip || '-';

      // RX Optical Power
      let rxStr = '-';
      let rxStatus = 'unknown';
      let rxVal = null;
      const rxRaw = dev.VirtualParameters?.RXPower?.value?.[0];
      if (rxRaw != null && String(rxRaw).trim() !== '' && String(rxRaw) !== '-') {
        try {
          rxVal = parseFloat(String(rxRaw).replace('dBm', '').trim());
          if (!isNaN(rxVal)) {
            rxStr = `${rxVal} dBm`;
            if (rxVal >= -24.0) rxStatus = 'normal';
            else if (rxVal >= -27.0) rxStatus = 'warning';
            else rxStatus = 'critical';
          }
        } catch (e) {
          rxStr = String(rxRaw);
        }
      }

      // Online status (< 10 menit)
      let isOnline = false;
      let lastInformStr = '-';
      if (dev._lastInform) {
        const lastInformTs = new Date(dev._lastInform).getTime();
        const diffSec = Math.floor((nowTs - lastInformTs) / 1000);
        isOnline = diffSec < 600;
        if (diffSec < 60) lastInformStr = 'Baru saja';
        else if (diffSec < 3600) lastInformStr = `${Math.floor(diffSec / 60)} mnt lalu`;
        else if (diffSec < 86400) lastInformStr = `${Math.floor(diffSec / 3600)} jam lalu`;
        else lastInformStr = `${Math.floor(diffSec / 86400)} hari lalu`;
      }

      if (!isOnline) rxStatus = 'offline';

      const vlanRaw = dev.VirtualParameters?.VlanID?.value?.[0] || '-';
      const devInfo = {
        _id: devId,
        pppoe,
        serial,
        product_class: productClass,
        ip,
        rx: rxStr,
        rx_val: rxVal,
        rx_status: rxStatus,
        online: isOnline,
        last_inform: lastInformStr,
        vlan: String(vlanRaw)
      };

      if (mappedMap[devId]) {
        const locDoc = mappedMap[devId];
        mapped.push({
          ...devInfo,
          name: locDoc.name || pppoe,
          lat: parseFloat(locDoc.lat || 0.0),
          lng: parseFloat(locDoc.lng || 0.0),
          odp: locDoc.odp || '',
          phone: locDoc.phone || '',
          address: locDoc.address || '',
          notes: locDoc.notes || '',
          updated_at: locDoc.updated_at || ''
        });
      } else {
        unmapped.push(devInfo);
      }
    }

    ctx.body = { success: true, mapped, unmapped };
  } catch (err) {
    ctx.body = { success: false, error: err.message, mapped: [], unmapped: [] };
  }
});

// ==================== 3. CUSTOMER PORTAL API ====================

router.get(['/api/customer/auth_config', '/bot-proxy/api/customer/auth_config'], async ctx => {
  const database = await getDb();
  let otpEnabled = true;
  let brandName = 'ALIJAYA NET';
  let brandPhone = '081947215703';

  if (database) {
    const cfgs = await database.collection('config').find({ _id: { $regex: '^agent\\.' } }).toArray();
    for (const c of cfgs) {
      if (c._id === 'agent.otp.enabled') otpEnabled = String(c.value).replace(/['"]/g, '').toLowerCase() !== 'false';
      if (c._id === 'agent.brand.name') brandName = String(c.value).replace(/['"]/g, '');
      if (c._id === 'agent.brand.phone') brandPhone = String(c.value).replace(/['"]/g, '');
    }
  }

  ctx.body = {
    success: true,
    otp_enabled: otpEnabled,
    brand_name: brandName,
    brand_phone: brandPhone
  };
});

router.post(['/api/customer/request_otp', '/bot-proxy/api/customer/request_otp'], async ctx => {
  const req = ctx.request.body || {};
  const phoneRaw = String(req.phone || '').trim();
  if (!phoneRaw) {
    ctx.body = { success: false, error: 'Nomor WhatsApp atau Nomor Pelanggan wajib diisi.' };
    return;
  }

  const database = await getDb();
  if (!database) {
    ctx.body = { success: false, error: 'Database tidak terhubung' };
    return;
  }

  let otpEnabled = true;
  let brandName = 'ALIJAYA NET';
  let brandPhone = '081947215703';
  let expiryMin = 5;

  const cfgs = await database.collection('config').find({ _id: { $regex: '^agent\\.' } }).toArray();
  for (const c of cfgs) {
    if (c._id === 'agent.otp.enabled') otpEnabled = String(c.value).replace(/['"]/g, '').toLowerCase() !== 'false';
    if (c._id === 'agent.brand.name') brandName = String(c.value).replace(/['"]/g, '');
    if (c._id === 'agent.brand.phone') brandPhone = String(c.value).replace(/['"]/g, '');
    if (c._id === 'agent.otp.expiry_minutes') expiryMin = parseInt(String(c.value).replace(/['"]/g, ''), 10) || 5;
  }

  const cleanPhone = cleanPhoneNumber(phoneRaw);
  // Cari perangkat berdasarkan tag telepon atau ID lokasi
  let dev = await database.collection('devices').findOne({
    $or: [
      { _tags: cleanPhone },
      { _tags: phoneRaw },
      { 'VirtualParameters.pppoeUsername.value': phoneRaw }
    ]
  });

  if (!dev) {
    // Cari di device_locations
    const loc = await database.collection('device_locations').findOne({
      $or: [
        { phone: cleanPhone },
        { phone: phoneRaw },
        { name: phoneRaw }
      ]
    });
    if (loc) {
      dev = await database.collection('devices').findOne({ _id: loc._id });
    }
  }

  if (!dev) {
    ctx.body = {
      success: false,
      error: `Nomor Pelanggan / WhatsApp (${phoneRaw}) belum terdaftar pada sistem jaringan kami. Hubungi CS di ${brandPhone}.`
    };
    return;
  }

  const now = Date.now();

  // JIKA OTP DIMATIKAN: LANGSUNG LOGIN
  if (!otpEnabled) {
    const token = crypto.randomBytes(24).toString('hex');
    await database.collection('customer_sessions').updateOne(
      { _id: token },
      { $set: { _id: token, phone: cleanPhone || phoneRaw, device_id: dev._id, expires: new Date(now + 86400000) } },
      { upsert: true }
    );

    ctx.cookies.set('customer_token', token, { httpOnly: false, maxAge: 86400000, sameSite: 'lax' });
    ctx.body = {
      success: true,
      otp_required: false,
      token,
      message: 'Login berhasil! Mengalihkan ke dashboard WiFi...'
    };
    return;
  }

  // JIKA OTP DIAKTIFKAN: BUAT KODE OTP 4 DIGIT
  const lookupKey = cleanPhone || phoneRaw;
  const existing = await database.collection('customer_otps').findOne({ _id: lookupKey });
  if (existing && existing.resendAfter && new Date(existing.resendAfter).getTime() > now) {
    const rem = Math.ceil((new Date(existing.resendAfter).getTime() - now) / 1000);
    ctx.body = { success: false, error: `Harap tunggu ${rem} detik sebelum meminta OTP baru.`, cooldown: rem };
    return;
  }

  const otp = String(Math.floor(1000 + Math.random() * 9000));
  await database.collection('customer_otps').updateOne(
    { _id: lookupKey },
    {
      $set: {
        _id: lookupKey,
        otp,
        expires: new Date(now + (expiryMin * 60 * 1000)),
        resendAfter: new Date(now + 45000),
        deviceId: dev._id
      }
    },
    { upsert: true }
  );

  // Kirim WhatsApp jika WA terhubung
  const waText = `Halo! 🌐\n\nKode verifikasi OTP untuk masuk ke Portal Mandiri WiFi *${brandName}* Anda adalah: *${otp}*\n\nJangan berikan kode ini kepada siapapun.\nKode berlaku selama ${expiryMin} menit.`;
  const destPhone = normalizeTo62(cleanPhone || phoneRaw);

  try {
    const http = require('http');
    const waReq = http.request({
      hostname: '127.0.0.1',
      port: 7559,
      path: '/send',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    waReq.on('error', () => {});
    waReq.write(JSON.stringify({ to: destPhone, text: waText }));
    waReq.end();
  } catch (e) {}

  ctx.body = {
    success: true,
    otp_required: true,
    message: `Kode verifikasi OTP 4 digit telah dikirim ke nomor WhatsApp Anda (${phoneRaw}).`
  };
});

router.post(['/api/customer/verify_otp', '/bot-proxy/api/customer/verify_otp'], async ctx => {
  const req = ctx.request.body || {};
  const phoneRaw = String(req.phone || '').trim();
  const inputOtp = String(req.otp || '').trim();

  const database = await getDb();
  if (!database) {
    ctx.body = { success: false, error: 'Database tidak terhubung' };
    return;
  }

  const cleanPhone = cleanPhoneNumber(phoneRaw);
  const lookupKey = cleanPhone || phoneRaw;
  const stored = await database.collection('customer_otps').findOne({ _id: lookupKey });

  if (!stored) {
    ctx.body = { success: false, error: 'Sesi OTP tidak ditemukan atau sudah kedaluwarsa. Silakan minta kode baru.' };
    return;
  }

  if (Date.now() > new Date(stored.expires).getTime()) {
    await database.collection('customer_otps').deleteOne({ _id: lookupKey });
    ctx.body = { success: false, error: 'Kode OTP telah kedaluwarsa. Silakan minta kode baru.' };
    return;
  }

  if (stored.otp !== inputOtp) {
    ctx.body = { success: false, error: 'Kode OTP yang Anda masukkan salah. Periksa kembali WhatsApp Anda.' };
    return;
  }

  await database.collection('customer_otps').deleteOne({ _id: lookupKey });

  const token = crypto.randomBytes(24).toString('hex');
  await database.collection('customer_sessions').updateOne(
    { _id: token },
    { $set: { _id: token, phone: lookupKey, device_id: stored.deviceId, expires: new Date(Date.now() + 86400000) } },
    { upsert: true }
  );

  ctx.cookies.set('customer_token', token, { httpOnly: false, maxAge: 86400000, sameSite: 'lax' });
  ctx.body = {
    success: true,
    token,
    message: 'Verifikasi berhasil!'
  };
});

router.get(['/api/customer/info', '/bot-proxy/api/customer/info'], async ctx => {
  const token = ctx.cookies.get('customer_token') ||
                ctx.headers.authorization?.replace(/^Bearer\s+/i, '') ||
                ctx.query.token;

  const database = await getDb();
  if (!database) {
    ctx.body = { success: false, error: 'Database tidak terhubung' };
    return;
  }

  const sess = token ? await database.collection('customer_sessions').findOne({ _id: token }) : null;

  if (!sess || Date.now() > new Date(sess.expires).getTime()) {
    ctx.status = 401;
    ctx.body = { success: false, error: 'Sesi Anda telah berakhir. Silakan login kembali.' };
    return;
  }

  const dev = await database.collection('devices').findOne({ _id: sess.device_id });
  if (!dev) {
    ctx.status = 404;
    ctx.body = { success: false, error: 'Perangkat modem tidak ditemukan di database.' };
    return;
  }

  const loc = await database.collection('device_locations').findOne({ _id: dev._id });
  let pppoe = dev.VirtualParameters?.pppoeUsername?.value?.[0] || '';
  let custName = loc?.name || pppoe || 'Pelanggan';

  // Online status
  let online = false;
  let lastInformStr = '-';
  if (dev._lastInform) {
    const diffSec = Math.floor((Date.now() - new Date(dev._lastInform).getTime()) / 1000);
    online = diffSec < 600;
    lastInformStr = diffSec >= 60 ? `${Math.floor(diffSec / 60)} menit lalu` : 'Baru saja';
  }

  // Optical power
  let rx = dev.VirtualParameters?.RXPower?.value?.[0] || '-';
  let rxBadgeText = 'Sinyal Normal';
  let rxBadgeClass = 'badge-success';
  if (rx !== '-') {
    const rxNum = parseFloat(String(rx).replace('dBm', '').trim());
    if (!isNaN(rxNum)) {
      if (rxNum >= -24.0) {
        rxBadgeText = 'Sinyal Sangat Bagus 🟢';
        rxBadgeClass = 'badge-success';
      } else if (rxNum >= -27.0) {
        rxBadgeText = 'Sinyal Cukup / Normal 🟡';
        rxBadgeClass = 'badge-warning';
      } else {
        rxBadgeText = 'Sinyal Lemah / Redaman Tinggi 🔴';
        rxBadgeClass = 'badge-danger';
      }
      rx = `${rxNum} dBm`;
    }
  }

  const uptime = dev.VirtualParameters?.getdeviceuptime?.value?.[0] || dev.VirtualParameters?.uptimeDevice?.value?.[0] || '-';
  const igd = dev.InternetGatewayDevice || {};
  const wlan1 = igd.LANDevice?.['1']?.WLANConfiguration?.['1'] || {};

  const ssid = wlan1.SSID?._value || dev.VirtualParameters?.WlanSSID?.value?.[0] || '-';
  const wifiPass = wlan1.KeyPassphrase?._value || dev.VirtualParameters?.WlanPassword?.value?.[0] || '';
  const clients = wlan1.TotalAssociations?._value || dev.VirtualParameters?.activedevices?.value?.[0] || '0';

  const productClass = dev._deviceId?._ProductClass || '';
  const manufacturer = dev._deviceId?._Manufacturer || '';
  const modelStr = `${manufacturer} ${productClass}`.trim() || 'ONT Router';

  ctx.body = {
    success: true,
    data: {
      customer_name: custName,
      pppoe_user: pppoe,
      online,
      last_inform: lastInformStr,
      rx_power: rx,
      rx_badge_text: rxBadgeText,
      rx_badge_class: rxBadgeClass,
      uptime,
      clients_count: String(clients),
      ssid: String(ssid),
      wifi_password: String(wifiPass),
      model: modelStr,
      brand_name: 'ALIJAYA NET',
      brand_phone: '081947215703'
    }
  };
});

function sendNbiTask(deviceId, taskBody) {
  const http = require('http');
  return new Promise(resolve => {
    const encodedId = encodeURIComponent(deviceId).replace(/-/g, '%2D');
    const opt = {
      hostname: '127.0.0.1',
      port: 7557,
      path: `/devices/${encodedId}/tasks?connection_request`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000
    };
    const req = http.request(opt, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({ ok: res.statusCode === 200 || res.statusCode === 202, status: res.statusCode, data });
      });
    });
    req.on('error', err => resolve({ ok: false, error: err.message }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: true, queued: true }); });
    req.write(JSON.stringify(taskBody));
    req.end();
  });
}

router.post(['/api/customer/update_wifi', '/bot-proxy/api/customer/update_wifi'], async ctx => {
  const token = ctx.cookies.get('customer_token') ||
                ctx.headers.authorization?.replace(/^Bearer\s+/i, '') ||
                ctx.query.token;

  const database = await getDb();
  if (!database) {
    ctx.body = { success: false, error: 'Database tidak terhubung' };
    return;
  }

  const sess = token ? await database.collection('customer_sessions').findOne({ _id: token }) : null;
  if (!sess || Date.now() > new Date(sess.expires).getTime()) {
    ctx.status = 401;
    ctx.body = { success: false, error: 'Sesi login Anda telah berakhir. Silakan login kembali.' };
    return;
  }

  const req = ctx.request.body || {};
  const newSsid = String(req.ssid || '').trim();
  const newPass = String(req.password || '').trim();

  if (!newSsid && !newPass) {
    ctx.body = { success: false, error: 'Harap masukkan Nama WiFi atau Kata Sandi yang ingin diubah.' };
    return;
  }

  if (newPass && newPass.length < 8) {
    ctx.body = { success: false, error: 'Kata sandi WiFi minimal harus 8 karakter.' };
    return;
  }

  const paramValues = [];
  if (newSsid) {
    paramValues.push(["InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID", newSsid, "xsd:string"]);
  }
  if (newPass) {
    paramValues.push(["InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.KeyPassphrase", newPass, "xsd:string"]);
    paramValues.push(["InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.PreSharedKey.1.KeyPassphrase", newPass, "xsd:string"]);
    paramValues.push(["VirtualParameters.WlanPassword", newPass, "xsd:string"]);
  }

  const res = await sendNbiTask(sess.device_id, {
    name: "setParameterValues",
    parameterValues: paramValues
  });

  let msg = 'Pengaturan WiFi berhasil dikirim ke modem!';
  if (newSsid && newPass) msg = 'Nama WiFi dan Kata Sandi berhasil diperbarui!';
  else if (newSsid) msg = `Nama WiFi berhasil diubah menjadi '${newSsid}'!`;
  else msg = 'Kata Sandi WiFi berhasil diperbarui!';

  ctx.body = { success: res.ok, message: msg };
});

router.post(['/api/customer/reboot', '/bot-proxy/api/customer/reboot'], async ctx => {
  const token = ctx.cookies.get('customer_token') ||
                ctx.headers.authorization?.replace(/^Bearer\s+/i, '') ||
                ctx.query.token;

  const database = await getDb();
  if (!database) {
    ctx.body = { success: false, error: 'Database tidak terhubung' };
    return;
  }

  const sess = token ? await database.collection('customer_sessions').findOne({ _id: token }) : null;
  if (!sess || Date.now() > new Date(sess.expires).getTime()) {
    ctx.status = 401;
    ctx.body = { success: false, error: 'Sesi login Anda telah berakhir. Silakan login kembali.' };
    return;
  }

  const res = await sendNbiTask(sess.device_id, { name: "reboot" });
  ctx.body = {
    success: res.ok,
    message: 'Perintah restart telah dikirim ke modem Anda. Tunggu 1-2 menit hingga lampu modem normal kembali.'
  };
});

router.post(['/api/customer/logout', '/bot-proxy/api/customer/logout'], async ctx => {
  const token = ctx.cookies.get('customer_token') || ctx.query.token;
  const database = await getDb();
  if (token && database) {
    await database.collection('customer_sessions').deleteOne({ _id: token });
  }
  ctx.cookies.set('customer_token', null);
  ctx.body = { success: true, message: 'Logout berhasil' };
});

// ==================== 4. BOT CONFIG & WHATSAPP API ====================

// GET /api/config
router.get(['/api/bot_config', '/bot-proxy/api/config', '/bot-proxy/api/bot_config'], async ctx => {
  const database = await getDb();
  const cfgsMap = {};
  if (database) {
    const cfgs = await database.collection('config').find({ _id: { $regex: '^agent\\.' } }).toArray();
    for (const c of cfgs) {
      cfgsMap[c._id] = String(c.value).replace(/^['"]|['"]$/g, '');
    }
  }

  ctx.body = {
    enabled: cfgsMap['agent.enabled'] || 'true',
    token: cfgsMap['agent.telegram.botToken'] || '',
    admin_id: cfgsMap['agent.telegram.adminChatId'] || '',
    brand_name: cfgsMap['agent.brand.name'] || 'ALIJAYA NET',
    brand_phone: cfgsMap['agent.brand.phone'] || '081947215703',
    gemini_key: cfgsMap['agent.gemini.apiKey'] || '',
    wa_enabled: cfgsMap['agent.whatsapp.enabled'] || 'true',
    wa_admin_numbers: cfgsMap['agent.whatsapp.admin_numbers'] || cfgsMap['agent.brand.phone'] || '081947215703',
    otp_enabled: cfgsMap['agent.otp.enabled'] || 'true',
    otp_expiry_minutes: cfgsMap['agent.otp.expiry_minutes'] || '5'
  };
});

// POST /api/config
router.post(['/api/bot_config', '/bot-proxy/api/config', '/bot-proxy/api/bot_config'], async ctx => {
  const req = ctx.request.body || {};
  const database = await getDb();
  if (!database) {
    ctx.body = { success: false, message: 'Database tidak terhubung' };
    return;
  }

  const keys = {
    'agent.enabled': req.enabled,
    'agent.telegram.botToken': req.token,
    'agent.telegram.adminChatId': req.admin_id,
    'agent.brand.name': req.brand_name,
    'agent.brand.phone': req.brand_phone,
    'agent.gemini.apiKey': req.gemini_key,
    'agent.whatsapp.enabled': req.wa_enabled,
    'agent.whatsapp.admin_numbers': req.wa_admin_numbers,
    'agent.otp.enabled': req.otp_enabled,
    'agent.otp.expiry_minutes': req.otp_expiry_minutes
  };

  for (const [k, v] of Object.entries(keys)) {
    if (v !== undefined) {
      const valStr = JSON.stringify(String(v));
      await database.collection('config').updateOne(
        { _id: k },
        { $set: { _id: k, value: valStr } },
        { upsert: true }
      );
    }
  }

  ctx.body = { success: true, message: 'Konfigurasi bot berhasil disimpan' };
});

// GET /api/system/update_status
router.get(['/api/system/update_status', '/bot-proxy/api/system/update_status'], async ctx => {
  const { execSync } = require('child_process');
  const repoDirs = ['/root/genieacs-multitab', '/opt/genieacs-multitab'];
  let repoDir = repoDirs.find(d => fs.existsSync(path.join(d, '.git')));

  if (!repoDir) {
    repoDir = '/root/genieacs-multitab';
    try {
      execSync('git clone https://github.com/alijayanet/genieacs-multitab.git /root/genieacs-multitab', { timeout: 30000 });
    } catch (e) {}
  }

  let localHash = '-', localDate = '-', localMsg = '';
  let remoteHash = '-', remoteDate = '-', remoteMsg = '';
  let commitsBehind = 0;
  let hasUpdate = false;

  try {
    if (fs.existsSync(path.join(repoDir, '.git'))) {
      localHash = execSync(`git -C "${repoDir}" rev-parse HEAD`, { timeout: 5000 }).toString().trim().slice(0, 7);
      localDate = execSync(`git -C "${repoDir}" log -1 --pretty="%cd" --date=format:"%Y-%m-%d %H:%M"`, { timeout: 5000 }).toString().trim();
      localMsg = execSync(`git -C "${repoDir}" log -1 --pretty="%s"`, { timeout: 5000 }).toString().trim();

      try {
        execSync(`git -C "${repoDir}" fetch origin main`, { timeout: 20000 });
        remoteHash = execSync(`git -C "${repoDir}" rev-parse origin/main`, { timeout: 5000 }).toString().trim().slice(0, 7);
        remoteDate = execSync(`git -C "${repoDir}" log -1 --pretty="%cd" --date=format:"%Y-%m-%d %H:%M" origin/main`, { timeout: 5000 }).toString().trim();
        remoteMsg = execSync(`git -C "${repoDir}" log -1 --pretty="%s" origin/main`, { timeout: 5000 }).toString().trim();

        const behindStr = execSync(`git -C "${repoDir}" rev-list --count HEAD..origin/main`, { timeout: 5000 }).toString().trim();
        commitsBehind = parseInt(behindStr, 10) || 0;
        hasUpdate = commitsBehind > 0;
      } catch (eFetch) {
        remoteHash = localHash;
        remoteDate = localDate;
        remoteMsg = localMsg;
      }
    }
  } catch (err) {
    console.error('[Update Check Error]:', err.message);
  }

  ctx.body = {
    success: true,
    has_update: hasUpdate,
    local_commit: localHash,
    local_date: localDate,
    local_msg: localMsg,
    remote_commit: remoteHash,
    remote_date: remoteDate,
    remote_msg: remoteMsg,
    commits_behind: commitsBehind
  };
});

// POST /api/system/update_apply
router.post(['/api/system/update_apply', '/bot-proxy/api/system/update_apply'], async ctx => {
  const { execSync } = require('child_process');
  const logs = [];
  const log = (msg) => logs.push(msg);
  const repoDirs = ['/root/genieacs-multitab', '/opt/genieacs-multitab'];
  let repoDir = repoDirs.find(d => fs.existsSync(path.join(d, '.git'))) || '/root/genieacs-multitab';

  try {
    log('🔄 [1/4] Mengambil pembaruan terbaru dari GitHub (alijayanet/genieacs-multitab)...');
    if (!fs.existsSync(path.join(repoDir, '.git'))) {
      execSync(`git clone https://github.com/alijayanet/genieacs-multitab.git "${repoDir}"`, { timeout: 40000 });
      log('✅ Repositori berhasil dikloning.');
    } else {
      execSync(`git -C "${repoDir}" fetch origin main`, { timeout: 25000 });
      execSync(`git -C "${repoDir}" reset --hard origin/main`, { timeout: 10000 });
      log('✅ Kode terbaru berhasil ditarik (git pull/reset).');
    }

    log('📦 [2/4] Menerapkan skrip upgrade instalasi otomatis...');
    const installScript = path.join(repoDir, 'install.sh');
    if (fs.existsSync(installScript)) {
      execSync(`chmod +x "${installScript}" && bash "${installScript}" --upgrade`, { timeout: 120000 });
      log('✅ All-in-One modul berhasil diperbarui.');
    }

    log('🚀 [3/4] Merestart layanan GenieACS UI...');
    setTimeout(() => {
      try { execSync('systemctl restart genieacs-ui'); } catch (e) {}
    }, 2000);

    log('🎉 [4/4] Pembaruan selesai 100%!');
    ctx.body = {
      success: true,
      message: 'Sistem All-in-One GenieACS berhasil diperbarui ke versi terbaru!',
      logs: logs.join('\n')
    };
  } catch (err) {
    log(`❌ Error pembaruan: ${err.message}`);
    ctx.body = {
      success: false,
      error: err.message,
      logs: logs.join('\n')
    };
  }
});

// POST /api/logout
router.post(['/api/logout', '/bot-proxy/api/logout'], async ctx => {
  ctx.cookies.set('genieacs-ui-jwt', null);
  ctx.cookies.set('agent_session', null);
  ctx.body = { success: true, message: 'Logout berhasil' };
});

// WhatsApp Proxy to local port 7559
async function proxyToWhatsApp(ctx, targetPath, method = 'GET', bodyData = null) {
  const http = require('http');
  await new Promise(resolve => {
    const opt = {
      hostname: '127.0.0.1',
      port: 7559,
      path: targetPath,
      method: method,
      headers: { 'Content-Type': 'application/json' }
    };
    const req = http.request(opt, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        ctx.status = res.statusCode;
        ctx.type = 'application/json';
        try {
          ctx.body = JSON.parse(data);
        } catch (e) {
          ctx.body = data;
        }
        resolve();
      });
    });
    req.on('error', err => {
      ctx.status = 502;
      ctx.body = { connection: 'disconnected', error: err.message };
      resolve();
    });
    if (bodyData) req.write(JSON.stringify(bodyData));
    req.end();
  });
}

router.get(['/api/whatsapp/status', '/bot-proxy/api/whatsapp/status'], async ctx => {
  await proxyToWhatsApp(ctx, '/status', 'GET');
});

router.get(['/api/whatsapp/lid_mappings', '/bot-proxy/api/whatsapp/lid_mappings'], async ctx => {
  await proxyToWhatsApp(ctx, '/lid_mappings', 'GET');
});

router.post(['/api/whatsapp/logout', '/api/whatsapp/reset', '/bot-proxy/api/whatsapp/logout', '/bot-proxy/api/whatsapp/reset'], async ctx => {
  await proxyToWhatsApp(ctx, '/logout', 'POST');
});

router.post(['/api/whatsapp/send', '/bot-proxy/api/whatsapp/send'], async ctx => {
  await proxyToWhatsApp(ctx, '/send', 'POST', ctx.request.body);
});

// ==================== 5. AGENT COMMAND ENGINE (WHATSAPP BOT) ====================

async function findDeviceByQuery(database, query) {
  if (!query) return null;
  const q = String(query).trim();
  const pattern = q
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/(?:-|%2D)/gi, '(?:-|%2D)')
    .replace(/(?: |%20)/gi, '(?: |%20)');
  const idRegex = new RegExp(pattern, 'i');
  const cleanQ = cleanPhoneNumber(q);

  let dev = await database.collection('devices').findOne({
    $or: [
      { _id: idRegex },
      { 'VirtualParameters.pppoeUsername.value.0': { $regex: '^' + q + '$', $options: 'i' } },
      { _tags: q },
      ...(cleanQ ? [{ _tags: 'phone:' + cleanQ }, { _tags: cleanQ }] : [])
    ]
  });

  if (dev) return dev;

  const loc = await database.collection('device_locations').findOne({
    $or: [
      { _id: idRegex },
      { name: { $regex: q, $options: 'i' } },
      ...(cleanQ ? [{ phone: cleanQ }] : [])
    ]
  });

  if (loc) {
    const locPattern = String(loc._id)
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/(?:-|%2D)/gi, '(?:-|%2D)')
      .replace(/(?: |%20)/gi, '(?: |%20)');
    dev = await database.collection('devices').findOne({
      $or: [{ _id: loc._id }, { _id: new RegExp('^' + locPattern + '$', 'i') }]
    });
  }

  return dev;
}

function formatDeviceSummary(dev, loc) {
  const pppoe = dev.VirtualParameters?.pppoeUsername?.value?.[0] || '-';
  const name = loc?.name || pppoe || 'Pelanggan';
  const rx = dev.VirtualParameters?.RXPower?.value?.[0] || '-';
  const uptime = dev.VirtualParameters?.getdeviceuptime?.value?.[0] || dev.VirtualParameters?.uptimeDevice?.value?.[0] || '-';
  const igd = dev.InternetGatewayDevice || {};
  const wlan1 = igd.LANDevice?.['1']?.WLANConfiguration?.['1'] || {};
  const ssid = wlan1.SSID?._value || dev.VirtualParameters?.WlanSSID?.value?.[0] || '-';
  const pass = wlan1.KeyPassphrase?._value || dev.VirtualParameters?.WlanPassword?.value?.[0] || '-';
  const clients = wlan1.TotalAssociations?._value || dev.VirtualParameters?.activedevices?.value?.[0] || '0';
  const productClass = dev._deviceId?._ProductClass || '';
  const manufacturer = dev._deviceId?._Manufacturer || '';
  const model = `${manufacturer} ${productClass}`.trim() || 'Modem ONT';
  const devId = dev._id;
  const ip = dev._ip || '-';

  let online = false;
  let lastInform = '-';
  if (dev._lastInform) {
    const diffSec = Math.floor((Date.now() - new Date(dev._lastInform).getTime()) / 1000);
    online = diffSec < 600;
    lastInform = diffSec >= 60 ? `${Math.floor(diffSec / 60)} mnt lalu` : 'Baru saja';
  }

  return [
    `📡 *STATUS MODEM / ONT*`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `👤 *Pelanggan:* ${name}`,
    `🔑 *PPPoE User:* \`${pppoe}\``,
    `📟 *Model:* ${model}`,
    `🆔 *SN/ID:* \`${devId}\``,
    `🌐 *Status:* ${online ? '🟢 Online' : '🔴 Offline'} (${lastInform})`,
    `⚡ *IP TR-069:* \`${ip}\``,
    `📶 *Redaman Optik (RX):* *${rx}*`,
    `🕒 *Uptime:* ${uptime}`,
    `📶 *WiFi SSID:* \`${ssid}\``,
    `🔐 *Sandi WiFi:* \`${pass}\``,
    `👥 *Klien Terhubung:* ${clients} perangkat`,
    `━━━━━━━━━━━━━━━━━━━━`
  ].join('\n');
}

function formatDeviceClients(dev) {
  const igd = dev.InternetGatewayDevice || {};
  const hosts = igd.LANDevice?.['1']?.Hosts?.Host;
  const list = [];
  if (hosts && typeof hosts === 'object') {
    for (const [k, v] of Object.entries(hosts)) {
      if (k.startsWith('_')) continue;
      if (v.Active?._value === true || v.Active?._value === 'true' || v.Active?._value === 1) {
        const name = v.HostName?._value || 'Unknown Device';
        const ip = v.IPAddress?._value || '-';
        const mac = v.MACAddress?._value || '-';
        list.push(`• *${name}* (${ip} | \`${mac}\`)`);
      }
    }
  }

  const pppoe = dev.VirtualParameters?.pppoeUsername?.value?.[0] || dev._id;
  if (list.length === 0) {
    const clients = dev.InternetGatewayDevice?.LANDevice?.['1']?.WLANConfiguration?.['1']?.TotalAssociations?._value ||
                    dev.VirtualParameters?.activedevices?.value?.[0] || '0';
    return `👥 *Klien Terhubung (${pppoe})*\n━━━━━━━━━━━━━━━━━━━━\nTerdeteksi *${clients}* perangkat terhubung via WiFi.`;
  }

  return [
    `👥 *Klien Terhubung (${pppoe})*`,
    `━━━━━━━━━━━━━━━━━━━━`,
    ...list,
    `━━━━━━━━━━━━━━━━━━━━`,
    `Total: ${list.length} perangkat aktif`
  ].join('\n');
}

function formatServerStats() {
  const os = require('os');
  const fs = require('fs');
  const uptimeSec = os.uptime();
  const days = Math.floor(uptimeSec / 86400);
  const hours = Math.floor((uptimeSec % 86400) / 3600);
  const minutes = Math.floor((uptimeSec % 3600) / 60);

  const totalMem = (os.totalmem() / 1024 / 1024).toFixed(0);
  const freeMem = (os.freemem() / 1024 / 1024).toFixed(0);
  const usedMem = (totalMem - freeMem).toFixed(0);
  const memPct = Math.round((usedMem / totalMem) * 100);

  let tempStr = '-';
  try {
    const rawTemp = fs.readFileSync('/sys/class/thermal/thermal_zone0/temp', 'utf8').trim();
    const tempC = (parseInt(rawTemp, 10) / 1000).toFixed(1);
    tempStr = `${tempC}°C`;
  } catch (e) {}

  const load = os.loadavg().map(l => l.toFixed(2)).join(', ');

  return [
    `🖥️ *STATUS SERVER STB GENIEACS*`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `⏱️ *Uptime:* ${days}h ${hours}j ${minutes}m`,
    `🌡️ *Suhu STB:* ${tempStr}`,
    `📊 *CPU Load (1, 5, 15m):* ${load}`,
    `💾 *RAM Terpakai:* ${usedMem} MB / ${totalMem} MB (${memPct}%)`,
    `🚀 *Node.js:* ${process.version}`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `✅ *GenieACS All-in-One Engine: Aktif (Port 3000)*`
  ].join('\n');
}

async function formatBadRxSummary(database) {
  const devs = await database.collection('devices').find().toArray();
  const bad = [];
  for (const d of devs) {
    const rx = d.VirtualParameters?.RXPower?.value?.[0];
    if (!rx || rx === '-') continue;
    const num = parseFloat(String(rx).replace('dBm', '').trim());
    if (!isNaN(num) && num < -26.0) {
      const pppoe = d.VirtualParameters?.pppoeUsername?.value?.[0] || d._id;
      bad.push({ pppoe, rx: num });
    }
  }

  if (bad.length === 0) {
    return `✅ *Audit Redaman Optik (RX)*\n━━━━━━━━━━━━━━━━━━━━\nSemua modem ONT dalam kondisi redaman normal (≥ -26 dBm)!`;
  }

  bad.sort((a, b) => a.rx - b.rx);
  const list = bad.map(b => `🔴 *${b.pppoe}*: \`${b.rx} dBm\``);
  return [
    `⚠️ *AUDIT REDAMAN KRITIS (< -26 dBm)*`,
    `━━━━━━━━━━━━━━━━━━━━`,
    ...list,
    `━━━━━━━━━━━━━━━━━━━━`,
    `Total: ${bad.length} modem memerlukan perbaikan kabel/konektor fiber.`
  ].join('\n');
}

async function formatUnconfiguredOnts(database) {
  const devs = await database.collection('devices').find().toArray();
  const unconf = [];
  for (const d of devs) {
    const pppoe = d.VirtualParameters?.pppoeUsername?.value?.[0];
    if (!pppoe || !pppoe.trim()) {
      const pc = d._deviceId?._ProductClass || '';
      const m = d._deviceId?._Manufacturer || '';
      unconf.push(`• \`${d._id}\` (${m} ${pc})`);
    }
  }

  if (unconf.length === 0) {
    return `✅ *Deteksi ONT Baru*\n━━━━━━━━━━━━━━━━━━━━\nTidak ada modem baru yang belum tersetting.`;
  }

  return [
    `🆕 *DAFTAR MODEM BELUM TERSETTING*`,
    `━━━━━━━━━━━━━━━━━━━━`,
    ...unconf,
    `━━━━━━━━━━━━━━━━━━━━`,
    `Gunakan: \`addwan <sn> <user_pppoe> <sandi> [vlan]\``
  ].join('\n');
}

async function callGeminiAi(apiKey, userPrompt, brandName, brandPhone) {
  const https = require('https');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  const systemInstruction = `Kamu adalah Customer Service dan Asisten IT AI ramah untuk ISP/RT-RW Net bernama "${brandName}". Kontak bantuan CS: ${brandPhone}. Jawab secara singkat, ramah, dan solutif dalam bahasa Indonesia. Jika pelanggan bertanya tentang gangguan internet, sarankan mengecek lampu indikator modem (LOS/PON/Internet) atau mencoba restart modem dengan mengetik "reboot". Jangan berikan informasi teknis internal server yang sensitif.`;

  const payload = {
    contents: [
      {
        role: "user",
        parts: [{ text: `${systemInstruction}\n\nPertanyaan/Pesan Pengguna: ${userPrompt}` }]
      }
    ]
  };

  return new Promise(resolve => {
    const parsed = new URL(url);
    const req = https.request({
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const replyText = json.candidates?.[0]?.content?.parts?.[0]?.text;
          resolve(replyText || null);
        } catch (e) {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.write(JSON.stringify(payload));
    req.end();
  });
}

async function handleAgentCommand(reqBody) {
  const rawText = String(reqBody.text || '').trim();
  const sender = String(reqBody.sender || '').trim();
  const isAdmin = Boolean(reqBody.isAdmin);
  const pushName = String(reqBody.pushName || 'Kak');
  const registeredTag = reqBody.registeredTag;

  if (!rawText) return { reply: '⚠️ Pesan kosong.' };

  const database = await getDb();
  if (!database) return { reply: '⚠️ Database GenieACS tidak terhubung.' };

  let brandName = 'ALIJAYA NET';
  let brandPhone = '081947215703';
  let geminiKey = '';
  const cfgs = await database.collection('config').find({ _id: { $regex: '^agent\\.' } }).toArray();
  for (const c of cfgs) {
    if (c._id === 'agent.brand.name') brandName = String(c.value).replace(/['"]/g, '');
    if (c._id === 'agent.brand.phone') brandPhone = String(c.value).replace(/['"]/g, '');
    if (c._id === 'agent.gemini.apiKey') geminiKey = String(c.value).replace(/['"]/g, '');
  }

  let customerDev = null;
  if (!isAdmin) {
    if (registeredTag) customerDev = await findDeviceByQuery(database, registeredTag);
    if (!customerDev && sender) customerDev = await findDeviceByQuery(database, sender);
  }

  const clean = rawText.replace(/^[!/#]+/, '').trim();
  const parts = clean.split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const rest = parts.slice(1).join(' ').trim();

  // 1. Menu
  if (['menu', 'help', 'bantuan', 'start'].includes(cmd)) {
    if (isAdmin) {
      return {
        reply: [
          `🤖 *${brandName} - GenieACS TR-069 AI Bot*`,
          `━━━━━━━━━━━━━━━━━━━━`,
          `📌 *Daftar Perintah Admin:*`,
          `• \`cek <user/sn>\` ➔ Status lengkap & redaman ONT`,
          `• \`redaman\` ➔ Audit massal redaman kritis (< -26 dBm)`,
          `• \`ontbaru\` ➔ Cek modem baru belum tersetting`,
          `• \`klien <user>\` ➔ Daftar HP/laptop terhubung WiFi`,
          `• \`reboot <user>\` ➔ Restart modem pelanggan`,
          `• \`wifion <user>\` & \`wifioff <user>\` ➔ On/Off Radio WiFi`,
          `• \`wifi <user> <ssid> <sandi>\` ➔ Ubah WiFi & Sandi`,
          `• \`ssid <user> <nama>\` ➔ Ubah nama WiFi`,
          `• \`pass <user> <sandi>\` ➔ Ubah sandi WiFi`,
          `• \`tag <user/sn> <wa>\` ➔ Tautkan nomor WA pelanggan`,
          `• \`server\` / \`status\` ➔ Status CPU, RAM, Suhu STB`,
          `━━━━━━━━━━━━━━━━━━━━`,
          `👑 *CS: ${brandName} (${brandPhone})*`
        ].join('\n')
      };
    } else {
      if (customerDev) {
        const pppoe = customerDev.VirtualParameters?.pppoeUsername?.value?.[0] || customerDev._id;
        return {
          reply: [
            `👋 *Halo ${pushName}! Layanan Mandiri WiFi ${brandName}*`,
            `Modem Terdeteksi: *${pppoe}*`,
            `━━━━━━━━━━━━━━━━━━━━`,
            `Fitur yang dapat Anda gunakan:`,
            `• \`cek\` ➔ Cek nama WiFi, kata sandi & status sinyal`,
            `• \`wifi <nama_baru> <sandi_baru>\` ➔ Ganti nama WiFi & sandi`,
            `• \`pass <sandi_baru>\` ➔ Ganti sandi WiFi saja (min. 8 karakter)`,
            `• \`ssid <nama_baru>\` ➔ Ganti nama WiFi saja`,
            `• \`reboot\` ➔ Restart modem jika internet terasa lambat`,
            `━━━━━━━━━━━━━━━━━━━━`,
            `📞 *Butuh Bantuan Teknisi?* Hubungi CS di ${brandPhone}`
          ].join('\n')
        };
      } else {
        const cleanSender = cleanPhoneNumber(sender);
        return {
          reply: [
            `👋 *Halo ${pushName}! Selamat Datang di ${brandName}*`,
            `━━━━━━━━━━━━━━━━━━━━`,
            `Nomor WhatsApp Anda (*${cleanSender || sender}*) belum terdaftar pada modem mana pun.`,
            ``,
            `📝 *Cara Menghubungkan:*`,
            `Ketik: \`daftar <id_pppoe>\``,
            `_Contoh:_ \`daftar cucimotor\``,
            ``,
            `Atau hubungi Layanan Bantuan / CS di ${brandPhone}.`
          ].join('\n')
        };
      }
    }
  }

  // 2. Server stats
  if (['server', 'status'].includes(cmd)) {
    if (isAdmin) return { reply: formatServerStats() };
    if (customerDev) {
      const loc = await database.collection('device_locations').findOne({ _id: customerDev._id });
      return { reply: formatDeviceSummary(customerDev, loc) };
    }
  }

  // 3. Redaman
  if (['redaman', 'los'].includes(cmd)) {
    if (!isAdmin) return { reply: '⛔ Perintah ini khusus untuk Admin / Teknisi.' };
    return { reply: await formatBadRxSummary(database) };
  }

  // 4. Ontbaru
  if (['ontbaru', 'unconf', 'newont'].includes(cmd)) {
    if (!isAdmin) return { reply: '⛔ Perintah ini khusus untuk Admin / Teknisi.' };
    return { reply: await formatUnconfiguredOnts(database) };
  }

  // 5. Cek
  if (['cek', 'info'].includes(cmd)) {
    const targetQuery = rest || (customerDev ? customerDev._id : '');
    if (!targetQuery) return { reply: '⚠️ Silakan sertakan Username PPPoE atau Serial Number.\n_Contoh:_ `cek cucimotor`' };
    const dev = await findDeviceByQuery(database, targetQuery);
    if (!dev) return { reply: `❌ Modem \`${targetQuery}\` tidak ditemukan di database GenieACS.` };
    const loc = await database.collection('device_locations').findOne({ _id: dev._id });
    return { reply: formatDeviceSummary(dev, loc) };
  }

  // 6. Klien
  if (['klien', 'client', 'clients'].includes(cmd)) {
    const targetQuery = rest || (customerDev ? customerDev._id : '');
    if (!targetQuery) return { reply: '⚠️ Gunakan: `klien <username_pppoe/sn>`' };
    const dev = await findDeviceByQuery(database, targetQuery);
    if (!dev) return { reply: `❌ Modem \`${targetQuery}\` tidak ditemukan.` };
    return { reply: formatDeviceClients(dev) };
  }

  // 7. Reboot
  if (['reboot', 'restart'].includes(cmd)) {
    const targetQuery = rest || (customerDev ? customerDev._id : '');
    if (!targetQuery) return { reply: '⚠️ Gunakan: `reboot <username_pppoe/sn>`' };
    const dev = await findDeviceByQuery(database, targetQuery);
    if (!dev) return { reply: `❌ Modem \`${targetQuery}\` tidak ditemukan.` };
    const res = await sendNbiTask(dev._id, { name: 'reboot' });
    if (res.ok) {
      const pppoe = dev.VirtualParameters?.pppoeUsername?.value?.[0] || dev._id;
      return {
        reply: `🔄 *Perintah Restart Terkirim!*\nModem (*${pppoe}*) sedang memulai ulang (reboot).\nMohon tunggu sekitar 1-2 menit hingga lampu PON/Internet menyala stabil kembali.`
      };
    } else {
      return { reply: `❌ Gagal mengirim perintah reboot ke modem: ${res.error || 'Timeout'}` };
    }
  }

  // 8. WiFi On/Off
  if (cmd === 'wifion' || cmd === 'wifioff') {
    if (!isAdmin) return { reply: '⛔ Perintah ini khusus untuk Admin.' };
    const enable = cmd === 'wifion';
    if (!rest) return { reply: `⚠️ Gunakan: \`${cmd} <username_pppoe/sn>\`` };
    const dev = await findDeviceByQuery(database, rest);
    if (!dev) return { reply: `❌ Modem \`${rest}\` tidak ditemukan.` };
    const res = await sendNbiTask(dev._id, {
      name: 'setParameterValues',
      parameterValues: [
        ['InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.Enable', enable ? 'true' : 'false', 'xsd:boolean']
      ]
    });
    return {
      reply: res.ok
        ? `✅ Radio WiFi untuk modem *${rest}* berhasil di${enable ? 'aktifkan' : 'nonaktifkan'}.`
        : `❌ Gagal mengubah status WiFi: ${res.error || 'Timeout'}`
    };
  }

  // 9. WiFi credentials update
  if (['wifi', 'ssid', 'pass', 'password'].includes(cmd)) {
    let dev = customerDev;
    let newSsid = '';
    let newPass = '';

    if (isAdmin) {
      const sub = rest.split(/\s+/);
      const targetQuery = sub[0];
      if (!targetQuery) return { reply: `⚠️ Format: \`${cmd} <user/sn> <nama_wifi_baru> <sandi_baru>\`` };
      dev = await findDeviceByQuery(database, targetQuery);
      if (!dev) return { reply: `❌ Modem \`${targetQuery}\` tidak ditemukan.` };

      if (cmd === 'wifi') {
        newSsid = sub[1] || '';
        newPass = sub.slice(2).join(' ') || '';
      } else if (cmd === 'ssid') {
        newSsid = sub.slice(1).join(' ') || '';
      } else {
        newPass = sub.slice(1).join(' ') || '';
      }
    } else {
      if (!customerDev) return { reply: '⚠️ Nomor WhatsApp Anda belum terdaftar pada modem mana pun. Ketik `daftar <id_pppoe>`.' };
      const sub = rest.split(/\s+/);
      if (cmd === 'wifi') {
        newSsid = sub[0] || '';
        newPass = sub.slice(1).join(' ') || '';
      } else if (cmd === 'ssid') {
        newSsid = rest;
      } else {
        newPass = rest;
      }
    }

    if (!newSsid && !newPass) return { reply: '⚠️ Harap masukkan Nama WiFi atau Kata Sandi yang ingin diubah.' };
    if (newPass && newPass.length < 8) return { reply: '⚠️ Kata sandi WiFi minimal harus 8 karakter.' };

    const paramValues = [];
    if (newSsid) paramValues.push(['InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID', newSsid, 'xsd:string']);
    if (newPass) {
      paramValues.push(['InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.KeyPassphrase', newPass, 'xsd:string']);
      paramValues.push(['InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.PreSharedKey.1.KeyPassphrase', newPass, 'xsd:string']);
      paramValues.push(['VirtualParameters.WlanPassword', newPass, 'xsd:string']);
    }

    const res = await sendNbiTask(dev._id, { name: 'setParameterValues', parameterValues });
    if (res.ok) {
      let m = 'Pengaturan WiFi berhasil dikirim ke modem!';
      if (newSsid && newPass) m = `Nama WiFi diubah ke *${newSsid}* dan Kata Sandi berhasil diperbarui!`;
      else if (newSsid) m = `Nama WiFi berhasil diubah menjadi *${newSsid}*!`;
      else m = 'Kata Sandi WiFi berhasil diperbarui!';
      return { reply: `📶 *Ganti WiFi Berhasil!*\n${m}` };
    } else {
      return { reply: `❌ Gagal mengirim konfigurasi WiFi ke modem: ${res.error || 'Timeout'}` };
    }
  }

  // 10. Daftar (Self registration)
  if (cmd === 'daftar') {
    if (!rest) return { reply: '⚠️ Masukkan ID PPPoE Anda.\n_Contoh:_ `daftar cucimotor`' };
    const dev = await findDeviceByQuery(database, rest);
    if (!dev) return { reply: `❌ Akun / Modem \`${rest}\` tidak ditemukan di database kami. Hubungi CS di ${brandPhone}.` };

    const cleanSender = cleanPhoneNumber(sender);
    const dateStr = formatDate();

    await database.collection('device_locations').updateOne(
      { _id: dev._id },
      { $set: { phone: cleanSender, updated_at: dateStr } },
      { upsert: true }
    );

    const oldTags = Array.isArray(dev._tags) ? dev._tags : [];
    const filteredTags = oldTags.filter(t => !t.startsWith('phone:'));
    filteredTags.push(`phone:${cleanSender}`);
    await database.collection('devices').updateOne(
      { _id: dev._id },
      { $set: { _tags: filteredTags } }
    );

    const pppoe = dev.VirtualParameters?.pppoeUsername?.value?.[0] || rest;
    return {
      reply: `✅ *Pendaftaran Berhasil!*\nNomor WhatsApp Anda (*${cleanSender}*) telah berhasil dihubungkan ke modem *${pppoe}*.\n\nKetik *menu* untuk melihat fitur layanan mandiri.`
    };
  }

  // 11. Tag & Untag (Admin)
  if (cmd === 'tag') {
    if (!isAdmin) return { reply: '⛔ Khusus Admin.' };
    const sub = rest.split(/\s+/);
    if (sub.length < 2) return { reply: '⚠️ Gunakan: `tag <user/sn> <no_wa>`' };
    const dev = await findDeviceByQuery(database, sub[0]);
    if (!dev) return { reply: `❌ Modem \`${sub[0]}\` tidak ditemukan.` };
    const phone = cleanPhoneNumber(sub[1]);
    const dateStr = formatDate();

    await database.collection('device_locations').updateOne(
      { _id: dev._id },
      { $set: { phone: phone, updated_at: dateStr } },
      { upsert: true }
    );

    const oldTags = Array.isArray(dev._tags) ? dev._tags : [];
    const filteredTags = oldTags.filter(t => !t.startsWith('phone:'));
    filteredTags.push(`phone:${phone}`);
    await database.collection('devices').updateOne(
      { _id: dev._id },
      { $set: { _tags: filteredTags } }
    );

    return { reply: `✅ Berhasil menautkan nomor *${phone}* ke modem \`${dev._id}\`.` };
  }

  // 12. Fallback to Gemini AI if configured
  if (geminiKey) {
    const aiResponse = await callGeminiAi(geminiKey, rawText, brandName, brandPhone);
    if (aiResponse) return { reply: aiResponse };
  }

  // 13. Default unrecognized message
  return {
    reply: `Maaf, perintah *${clean}* tidak dikenali.\nKetik *menu* untuk melihat daftar bantuan layanan.`
  };
}

// POST /api/agent_command
router.post(['/api/agent_command', '/bot-proxy/api/agent_command'], async ctx => {
  const reqBody = ctx.request.body || {};
  const res = await handleAgentCommand(reqBody);
  ctx.body = res;
});

module.exports = router;
