// download_islamic_videos.js
// شغّل هذا السكريبت من داخل مجلد المشروع الخلفي (backend root)
// حيث يوجد فيه مجلد uploads/ بجانب مجلدات controllers/ و models/
// تشغيل: node download_islamic_videos.js

import https from 'https';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'https://archive.org/download/BestQuranRecitation01/';

const files = [
  'Al-Afasi_Quran_Recitation.mp4',
  'Azan_Makkah.mp4',
  'Azan_Masjid_Nabawi.mp4',
  'Best_Quran_Recitation_01.mp4',
  'Best_Quran_Recitation_02.mp4',
  'Best_Quran_Recitation_03.mp4',
  'Best_Quran_Recitation_04.mp4',
  'Best_Quran_Recitation_05.mp4',
  'Best_Quran_Recitation_06.mp4',
  'Best_Quran_Recitation_07.mp4',
  'Best_Quran_Recitation_08.mp4',
  'Best_Quran_Recitation_09.mp4',
  'Best_Quran_Recitation_10.mp4',
  'Best_Quran_Recitation_11.mp4',
  'Best_Quran_Recitation_12.mp4',
  'Best_Quran_Recitation_13.mp4',
  'Best_Quran_Recitation_14.mp4',
  'Best_Quran_Recitation_15.mp4',
  'Best_Quran_Recitation_16.mp4',
  'Best_Quran_Recitation_17.mp4',
  'Best_Quran_Recitation_18.mp4',
  'Best_Quran_Recitation_19.mp4',
  'Best_Quran_Recitation_20.mp4',
  'Best_Quran_Recitation_21.mp4',
  'Best_Quran_Recitation_22.mp4',
  'Best_Quran_Recitation_23.mp4',
  'Best_Quran_Recitation_24.mp4',
  'Best_Quran_Recitation_25.mp4',
  'Best_Quran_Recitation_26.mp4',
  'Best_Quran_Recitation_27.mp4',
  'Best_Quran_Recitation_28.mp4',
  'Best_Quran_Recitation_29.mp4',
  'Best_Quran_Recitation_30.mp4',
  'Best_Quran_Recitation_31.mp4',
  'Best_Quran_Recitation_32.mp4',
  'Best_Quran_Recitation_33.mp4',
  'Best_Quran_Recitation_34.mp4',
  'Best_Quran_Recitation_Al-Mansari_49.mp4',
  'Children_Quran_Recitation_Very_Beautiful.mp4',
  'Qari_Sohaib_Ahmed_Meer.mp4',
  'Sheikh_Mansoor_Salmi.mp4',
  'Sheikh_Sudais_Masjid_Istiqlal_Jakarta.mp4',
  'Sudais_Recitation_Copying_Sound_Qari.mp4',
  'Surah_Yousaf_Quran_Recittation.mp4',
  'Surat_Al-Gafir_by_Khalid_Al-Jalil.mp4',
  'Ustad_Ulin_Nuha_Hafiz_Indonesia.mp4',
  'Young_Child_Surat_Al-Fatihah_Recitation.mp4',
];

const outDir = path.join(process.cwd(), 'uploads', 'posts');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const downloadFile = (url, dest) => {
  return new Promise((resolve, reject) => {
    const request = (u, redirects = 0) => {
      https.get(u, (res) => {
        // متابعة أي إعادة توجيه (archive.org أحيانًا يعمل redirect)
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          if (redirects > 5) return reject(new Error('Too many redirects'));
          return request(res.headers.location, redirects + 1);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`Failed ${res.statusCode} for ${u}`));
        }
        const fileStream = fs.createWriteStream(dest);
        res.pipe(fileStream);
        fileStream.on('finish', () => {
          fileStream.close();
          resolve();
        });
      }).on('error', reject);
    };
    request(url);
  });
};

const run = async () => {
  for (const fileName of files) {
    const dest = path.join(outDir, fileName);
    if (fs.existsSync(dest)) {
      console.log(`⏭️  موجود بالفعل: ${fileName}`);
      continue;
    }
    try {
      console.log(`⬇️  تنزيل: ${fileName}`);
      await downloadFile(BASE_URL + encodeURIComponent(fileName), dest);
      console.log(`✅ تم: ${fileName}`);
    } catch (err) {
      console.error(`❌ فشل تنزيل ${fileName}:`, err.message);
    }
  }
  console.log('🎉 انتهى التنزيل');
};

run();