// routes/uploadRoutes.js

import express from 'express';
import upload from '../middleware/upload.js';
import {
  uploadSingleFile,
  uploadMultipleFiles,
  deleteFile,
  getFileUrl,
} from '../controllers/uploadController.js';

const router = express.Router();

// ============================================
// 1. رفع ملف واحد
// ============================================
// استخدم: POST /api/upload/single
// أرسل الملف في حقل اسمه "file"
router.post('/upload/single', upload.single('file'), uploadSingleFile);

// ============================================
// 2. رفع عدة ملفات
// ============================================
// استخدم: POST /api/upload/multiple
// أرسل الملفات في حقل اسمه "files"
router.post('/upload/multiple', upload.array('files', 10), uploadMultipleFiles);

// ============================================
// 3. رفع أنواع مختلفة من الملفات
// ============================================
// استخدم: POST /api/upload/fields
router.post('/upload/fields', upload.fields([
  { name: 'avatar', maxCount: 1 },
  { name: 'cover', maxCount: 1 },
  { name: 'gallery', maxCount: 5 },
]), (req, res) => {
  try {
    const files = {};
    if (req.files) {
      for (const key of Object.keys(req.files)) {
        files[key] = req.files[key].map(file => ({
          originalName: file.originalname,
          path: file.path,
          size: file.size,
          mimetype: file.mimetype,
        }));
      }
    }
    res.status(200).json({
      success: true,
      message: '✅ تم استقبال الملفات',
      files: files,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// 4. حذف ملف
// ============================================
// استخدم: DELETE /api/upload/:publicId
router.delete('/upload/:publicId', deleteFile);

// ============================================
// 5. الحصول على رابط ملف
// ============================================
// استخدم: GET /api/upload/url/:publicId
router.get('/upload/url/:publicId', getFileUrl);

export default router;