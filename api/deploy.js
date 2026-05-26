// api/deploy.js
export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { files, projectName } = req.body;

    if (!files || !Array.isArray(files) || !projectName) {
      console.error("Payload tidak valid:", req.body);
      return res.status(400).json({ error: 'Payload tidak valid. Dibutuhkan files (array) dan projectName.' });
    }

    // Log token availability (jangan log tokennya!)
    console.log('Token available:', !!process.env.VERCEL_API_TOKEN);

    const VERCEL_TOKEN = process.env.VERCEL_API_TOKEN;
    if (!VERCEL_TOKEN) {
      console.error("FATAL: Environment variable VERCEL_API_TOKEN tidak ditemukan!");
      return res.status(500).json({ error: 'Token API Vercel tidak ditemukan di server. Hubungi admin.' });
    }

    console.log(`Memproses deploy untuk proyek: ${projectName} dengan ${files.length} file.`);

    // Format file untuk Vercel API
    const vercelFiles = files.map(f => ({ file: f.name, data: f.data }));

    // 1. Kirim permintaan deployment ke Vercel API
    const deployResponse = await fetch('https://api.vercel.com/v13/deployments', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${VERCEL_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: projectName,
        files: vercelFiles,
        projectSettings: {
          framework: null,
        },
        target: 'production',
      }),
    });

    const deployResult = await deployResponse.json();

    if (!deployResponse.ok) {
      console.error("Gagal membuat deployment:", deployResult);
      throw new Error(deployResult.error?.message || `Gagal membuat deployment (HTTP ${deployResponse.status})`);
    }

    // 2. Dapatkan URL deployment
    let url = `https://${projectName}.vercel.app`;
    if (deployResult.id) {
      // Tunggu sebentar agar Vercel memproses
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const checkUrl = `https://api.vercel.com/v13/deployments/${deployResult.id}`;
      for (let attempt = 0; attempt < 10; attempt++) {
        const checkResponse = await fetch(checkUrl, {
          headers: { 'Authorization': `Bearer ${VERCEL_TOKEN}` },
        });
        const checkData = await checkResponse.json();
        
        if (checkData.readyState === 'READY' && checkData.alias && checkData.alias.length > 0) {
          url = 'https://' + checkData.alias[0];
          console.log("Deployment siap di:", url);
          return res.status(200).json({ success: true, url: url });
        }
        
        if (checkData.readyState === 'ERROR') {
          console.error("Deployment error:", checkData);
          throw new Error('Deployment error: ' + (checkData.errorMessage || 'Unknown error'));
        }
        
        // Tunggu sebelum cek lagi
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    // Jika tidak ada ID, gunakan URL standar
    console.log("Menggunakan URL standar:", url);
    return res.status(200).json({ success: true, url: url });

  } catch (error) {
    console.error("Error di api/deploy.js:", error.message);
    return res.status(500).json({ error: error.message });
  }
}
