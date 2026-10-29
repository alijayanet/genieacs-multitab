const fs = require('fs');
const path = require('path');

function patchUi(genieacsDir) {
  const binUiPath = path.join(genieacsDir, 'bin', 'genieacs-ui');
  if (!fs.existsSync(binUiPath)) {
    throw new Error(`File bin/genieacs-ui tidak ditemukan di: ${binUiPath}`);
  }

  // Backup original bin/genieacs-ui if not already backed up
  const backupPath = `${binUiPath}.orig.bak`;
  if (!fs.existsSync(backupPath)) {
    fs.copyFileSync(binUiPath, backupPath);
    console.log(`[Backup] Salinan asli disimpan di: ${backupPath}`);
  }

  let content = fs.readFileSync(binUiPath, 'utf8');

  // Check if router hook already exists
  if (!content.includes('integrated-api.js') && !content.includes('integratedRouter')) {
    const hook = `try{const path=require("path");const integratedRouter=require(path.resolve(__dirname,"../integrated-api.js"));ie.use(integratedRouter.routes());ie.use(integratedRouter.allowedMethods());console.log("[Integrated All-in-One] Router berhasil dimuat ke genieacs-ui!");}catch(e){console.error("[Integrated All-in-One] Error loading router:",e);}`;
    const targetAnchor = '_e.use("/api",$r.routes(),$r.allowedMethods());';
    
    if (content.includes(targetAnchor)) {
      content = content.replace(targetAnchor, `${hook}${targetAnchor}`);
      console.log('[Patch] Hook integratedRouter berhasil disisipkan sebelum /api!');
    } else {
      // Fallback: insert before _e.get("/status"
      const fallbackAnchor = '_e.get("/status",';
      if (content.includes(fallbackAnchor)) {
        content = content.replace(fallbackAnchor, `${hook}${fallbackAnchor}`);
        console.log('[Patch] Hook integratedRouter disisipkan sebelum /status!');
      } else {
        throw new Error('Gagal menemukan lokasi injeksi router di bin/genieacs-ui');
      }
    }
  } else {
    console.log('[Skip] Hook router All-in-One sudah terpasang di bin/genieacs-ui.');
  }

  // Ensure cache-busting timestamp on Ms
  if (!content.includes('Date.now()')) {
    const msRegex = /var\s+Ms\s*=\s*['"]app\.js\?v=[^'"]+['"];/;
    if (msRegex.test(content)) {
      content = content.replace(msRegex, 'var Ms="app.js?v=allinone?v=" + Date.now();');
      console.log('[Patch] Cache buster Date.now() berhasil ditambahkan pada script tag!');
    }
  }

  fs.writeFileSync(binUiPath, content, 'utf8');
  console.log('[Sukses] bin/genieacs-ui berhasil diperbarui!');
}

const targetDir = process.argv[2] || '/usr/lib/node_modules/genieacs';
try {
  patchUi(targetDir);
} catch (e) {
  console.error('[Error patch-ui]:', e.message);
  process.exit(1);
}
