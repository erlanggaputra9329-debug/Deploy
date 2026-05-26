// api/deploy.js
export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Tangani preflight request
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Hanya izinkan POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { files, projectName } = req.body;

    // Validasi payload
    if (!files || !Array.isArray(files) || !projectName) {
      console.error('Payload tidak valid:', JSON.stringify(req.body).substring(0, 200));
      return res.status(400).json({
        error: 'Payload tidak valid. Dibutuhkan files (array) dan projectName (string).'
      });
    }

    // Cek ketersediaan token
    const VERCEL_TOKEN = process.env.VERCEL_API_TOKEN;
    console.log('Token tersedia:', !!VERCEL_TOKEN);

    if (!VERCEL_TOKEN) {
      console.error('Environment variable VERCEL_API_TOKEN tidak ditemukan.');
      return res.status(500).json({
        error: 'Token API Vercel tidak ditemukan di server. Pastikan environment variable sudah diatur.'
      });
    }

    console.log(`Memulai deploy untuk proyek: ${projectName} dengan ${files.length} file.`);

    // Format file untuk Vercel API
    const vercelFiles = files.map(f => ({
      file: f.name,
      data: f.data
    }));

    // Kirim permintaan deployment ke Vercel
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
          framework: null  // Biarkan Vercel mendeteksi sendiri
        },
        target: 'production',
      }),
    });

    // Baca respons sebagai JSON
    const deployResult = await deployResponse.json();

    if (!deployResponse.ok) {
      console.error('Vercel API error:', deployResult);
      return res.status(502).json({
        error: deployResult.error?.message || `Deployment gagal (HTTP ${deployResponse.status})`
      });
    }

    // Dapatkan URL deployment
    let url = `https://${projectName}.vercel.app`;
    if (deployResult.id) {
      // Tunggu beberapa detik agar Vercel memproses
      await new Promise(resolve => setTimeout(resolve, 3000));

      const checkUrl = `https://api.vercel.com/v13/deployments/${deployResult.id}`;
      for (let attempt = 0; attempt < 10; attempt++) {
        const checkResponse = await fetch(checkUrl, {
          headers: { 'Authorization': `Bearer ${VERCEL_TOKEN}` },
        });
        const checkData = await checkResponse.json();

        if (checkData.readyState === 'READY' && checkData.alias && checkData.alias.length > 0) {
          url = 'https://' + checkData.alias[0];
          console.log('Deployment siap:', url);
          return res.status(200).json({ success: true, url });
        }

        if (checkData.readyState === 'ERROR') {
          console.error('Deployment error:', checkData);
          return res.status(500).json({
            error: 'Deployment error: ' + (checkData.errorMessage || 'Unknown error')
          });
        }

        // Tunggu sebelum mencoba lagi
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    // Jika tidak ada ID atau polling habis, gunakan URL tebakan
    console.log('Mengembalikan URL standar:', url);
    return res.status(200).json({ success: true, url });

  } catch (error) {
    console.error('Internal error di api/deploy.js:', error.message);
    return res.status(500).json({
      error: 'Terjadi kesalahan internal: ' + error.message
    });
  }
}
