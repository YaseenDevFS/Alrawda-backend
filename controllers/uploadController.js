// controllers/uploadController.js

import upload, { 
  uploadToCloudinary, 
  deleteFromCloudinary, 
  getCloudinaryUrl 
} from '../middleware/upload.js';

// ============================================
// 1. رفع ملف واحد
// ============================================

export const uploadSingleFile = async (req, res) => {
  try {
    // التحقق من وجود ملف
    if (!req.file) {
      return res.status(400).json({ error: '❌ لا يوجد ملف للرفع' });
    }

    // تحديد المجلد حسب نوع الملف
    let folder = 'elrawda/uploads';
    if (req.file.fieldname === 'avatar') {
      folder = 'elrawda/avatars';
    } else if (req.file.fieldname === 'story') {
      folder = 'elrawda/stories';
    } else if (req.file.fieldname === 'post') {
      folder = 'elrawda/posts';
    }

    // رفع الملف إلى Cloudinary
    const result = await uploadToCloudinary(req.file.path, {
      folder: folder,
      resource_type: req.file.mimetype?.startsWith('video/') ? 'video' : 'image',
    });

    // إرجاع النتيجة
    res.status(200).json({
      success: true,
      message: '✅ تم رفع الملف بنجاح',
      file: {
        url: result.secure_url,
        publicId: result.public_id,
        format: result.format,
        size: result.bytes,
        width: result.width,
        height: result.height,
      },
    });
  } catch (error) {
    console.error('❌ خطأ:', error);
    res.status(500).json({
      error: '❌ فشل رفع الملف',
      details: error.message,
    });
  }
};

// ============================================
// 2. رفع عدة ملفات
// ============================================

export const uploadMultipleFiles = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: '❌ لا توجد ملفات للرفع' });
    }

    // رفع كل الملفات
    const uploadPromises = req.files.map(async (file) => {
      const result = await uploadToCloudinary(file.path, {
        folder: 'elrawda/uploads',
        resource_type: file.mimetype?.startsWith('video/') ? 'video' : 'image',
      });

      return {
        url: result.secure_url,
        publicId: result.public_id,
        format: result.format,
        size: result.bytes,
      };
    });

    const filesData = await Promise.all(uploadPromises);

    res.status(200).json({
      success: true,
      message: `✅ تم رفع ${filesData.length} ملف بنجاح`,
      files: filesData,
    });
  } catch (error) {
    console.error('❌ خطأ:', error);
    res.status(500).json({
      error: '❌ فشل رفع الملفات',
      details: error.message,
    });
  }
};

// ============================================
// 3. حذف ملف
// ============================================

export const deleteFile = async (req, res) => {
  try {
    const { publicId } = req.params;
    
    if (!publicId) {
      return res.status(400).json({ error: '❌ publicId مطلوب' });
    }

    const result = await deleteFromCloudinary(publicId);
    
    res.status(200).json({
      success: true,
      message: '✅ تم حذف الملف بنجاح',
    });
  } catch (error) {
    console.error('❌ خطأ:', error);
    res.status(500).json({
      error: '❌ فشل حذف الملف',
      details: error.message,
    });
  }
};

// ============================================
// 4. الحصول على رابط الملف
// ============================================

export const getFileUrl = async (req, res) => {
  try {
    const { publicId } = req.params;
    
    if (!publicId) {
      return res.status(400).json({ error: '❌ publicId مطلوب' });
    }

    const url = getCloudinaryUrl(publicId);
    
    res.status(200).json({
      success: true,
      url: url,
    });
  } catch (error) {
    console.error('❌ خطأ:', error);
    res.status(500).json({
      error: '❌ فشل الحصول على الرابط',
      details: error.message,
    });
  }
};