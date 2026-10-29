const fs = require('fs');
const path = require('path');

async function seedMongo(mongoUrl, gDir) {
  let MongoClient;
  const tryPaths = [
    'mongodb',
    gDir ? path.join(gDir, 'node_modules', 'mongodb') : null,
    '/usr/lib/node_modules/genieacs/node_modules/mongodb',
    '/usr/local/lib/node_modules/genieacs/node_modules/mongodb',
    '/opt/genieacs/node_modules/mongodb'
  ].filter(Boolean);

  for (const p of tryPaths) {
    try {
      MongoClient = require(p).MongoClient;
      if (MongoClient) {
        console.log(`[Seed] Menggunakan driver MongoDB dari: ${p}`);
        break;
      }
    } catch (e) {}
  }

  if (!MongoClient) {
    console.error('[Error] Driver MongoDB tidak ditemukan di node_modules.');
    process.exit(1);
  }

  const seedPath = path.join(__dirname, 'templates', 'genieacs-seed-data.json');
  if (!fs.existsSync(seedPath)) {
    console.error('[Error] File seed data tidak ditemukan di:', seedPath);
    process.exit(1);
  }

  const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));

  const candidateUris = [
    mongoUrl,
    process.env.GENIEACS_MONGODB_CONNECTION_URL,
    'mongodb://127.0.0.1:27017/genieacs',
    'mongodb://genie:genie@127.0.0.1:27017/genieacs?authSource=genieacs'
  ].filter(Boolean);

  let client = null;
  let db = null;

  for (const uri of candidateUris) {
    try {
      console.log(`[Seed] Mencoba koneksi ke MongoDB: ${uri.replace(/:([^:@]+)@/, ':****@')}...`);
      client = new MongoClient(uri, { serverSelectionTimeoutMS: 4000 });
      await client.connect();
      db = client.db();
      console.log('[Seed] Koneksi MongoDB berhasil.');
      break;
    } catch (err) {
      console.log(`[Seed] Gagal konek dengan URI ini: ${err.message}`);
      client = null;
    }
  }

  if (!db) {
    console.error('[Error] Gagal terhubung ke MongoDB dengan semua URI.');
    process.exit(1);
  }

  // 1. Virtual Parameters
  if (Array.isArray(seed.virtualParameters)) {
    let vpCount = 0;
    for (const vp of seed.virtualParameters) {
      await db.collection('virtualParameters').updateOne(
        { _id: vp._id },
        { $set: vp },
        { upsert: true }
      );
      vpCount++;
    }
    console.log(`[Seed] Berhasil import/update ${vpCount} VirtualParameters.`);
  }

  // 2. Presets
  if (Array.isArray(seed.presets)) {
    let pCount = 0;
    for (const p of seed.presets) {
      await db.collection('presets').updateOne(
        { _id: p._id },
        { $set: p },
        { upsert: true }
      );
      pCount++;
    }
    console.log(`[Seed] Berhasil import/update ${pCount} Presets.`);
  }

  // 3. Provisions
  if (Array.isArray(seed.provisions)) {
    let prCount = 0;
    for (const pr of seed.provisions) {
      await db.collection('provisions').updateOne(
        { _id: pr._id },
        { $set: pr },
        { upsert: true }
      );
      prCount++;
    }
    console.log(`[Seed] Berhasil import/update ${prCount} Provisions.`);
  }

  // 4. UI Configs (Filters, MultiTabs, Charts, etc.)
  if (Array.isArray(seed.configs)) {
    let cCount = 0;
    for (const c of seed.configs) {
      await db.collection('config').updateOne(
        { _id: c._id },
        { $set: c },
        { upsert: true }
      );
      cCount++;
    }
    console.log(`[Seed] Berhasil import/update ${cCount} item UI Configs.`);
  }

  // 5. Create default ODP & Device location indexes
  await db.collection('odps').createIndex({ _id: 1 });
  await db.collection('device_locations').createIndex({ _id: 1 });
  await db.collection('customer_sessions').createIndex({ _id: 1 });
  await db.collection('customer_sessions').createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 });
  console.log('[Seed] Index database ODP, Pelanggan, dan Sesi berhasil disiapkan.');

  await client.close();
  console.log('[Sukses] Database seeding selesai 100%!');
}

const mongoUrl = process.argv[2] || process.env.GENIEACS_MONGODB_CONNECTION_URL || '';
const gDir = process.argv[3] || '';
seedMongo(mongoUrl, gDir).catch(err => {
  console.error('[Error seedMongo]:', err);
  process.exit(1);
});
