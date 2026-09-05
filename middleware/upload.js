// backend/middleware/upload.js

import multer from 'multer';
import path from 'path';
import fs from 'fs';
import cloudinary from '../config/cloudinary.js';
import { Readable } from 'stream';

// ============================================
// 1. اختيار التخزين حسب البيئة
// ============================================

const isVercel = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';
const memoryStorage = multer.memoryStorage();
const tempDir = path.join(process.cwd(), 'temp');

// ============================================
// 2. STORAGE CONFIGURATION
// ============================================

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
      console.log('📁 Created temp directory for Cloudinary uploads');
    }
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const prefix = file.mimetype?.startsWith('video/') ? 'video' : 'image';
    cb(null, `${prefix}-${uniqueSuffix}${ext}`);
  }
});

const selectedStorage = isVercel ? memoryStorage : storage;

// ============================================
// 3. FILE FILTER - دعم الصور والفيديوهات
// ============================================

const fileFilter = (req, file, cb) => {
  // ✅ دعم الصور والفيديوهات
  const allowedImageTypes = /jpeg|jpg|png|gif|webp|svg|bmp|tiff/;
  const allowedVideoTypes = /mp4|mov|avi|mkv|webm|m4v|3gp|mpeg|flv/;
  
  const extname = path.extname(file.originalname).toLowerCase();
  const mimetype = file.mimetype;
  
  console.log('📁 File type check:', { extname, mimetype, originalname: file.originalname });
  
  // التحقق من الصور
  if (allowedImageTypes.test(extname) && mimetype?.startsWith('image/')) {
    return cb(null, true);
  }
  
  // التحقق من الفيديوهات
  if (allowedVideoTypes.test(extname) && mimetype?.startsWith('video/')) {
    return cb(null, true);
  }
  
  // ✅ قبول أي ملف إذا كان نوعه صورة أو فيديو
  if (mimetype?.startsWith('image/') || mimetype?.startsWith('video/')) {
    return cb(null, true);
  }
  
  cb(new Error('❌ فقط الصور (jpeg, jpg, png, gif, webp) والفيديوهات (mp4, mov, avi, mkv, webm, m4v, 3gp) مسموح بها'));
};

// ============================================
// 4. MULTER CONFIG
// ============================================

const upload = multer({
  storage: selectedStorage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB للفيديوهات
  },
  fileFilter: fileFilter
});

// ============================================
// 5. دوال رفع الملفات إلى Cloudinary
// ============================================

/**
 * رفع ملف إلى Cloudinary
 * @param {string} filePath - مسار الملف المحلي
 * @param {Object} options - خيارات الرفع
 * @returns {Promise<Object>} - بيانات الملف المرفوع
 */
const uploadFileFromPath = async (filePath, options = {}) => {
  try {
    // تحديد المجلد حسب نوع الملف
    let folder = options.folder || 'elrawda/uploads';
    const resourceType = options.resource_type || 'auto';
    
    console.log(`☁️ Uploading to Cloudinary: ${filePath}`);
    console.log(`📁 Folder: ${folder}, Resource: ${resourceType}`);
    
    const result = await cloudinary.uploader.upload(filePath, {
      folder: folder,
      resource_type: resourceType,
      quality: options.quality || 'auto:best',
      fetch_format: options.fetch_format || 'auto',
      transformation: options.transformation || [],
      ...options,
    });
    
    console.log(`✅ Uploaded to Cloudinary: ${result.public_id}`);
    
    // حذف الملف المؤقت بعد الرفع
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`🗑️ Deleted temp file: ${filePath}`);
      }
    } catch (unlinkError) {
      console.warn(`⚠️ Could not delete temp file: ${filePath}`);
    }
    
    return {
      url: result.secure_url,
      publicId: result.public_id,
      format: result.format,
      bytes: result.bytes,
      width: result.width,
      height: result.height,
      resourceType: result.resource_type,
      createdAt: result.created_at,
    };
  } catch (error) {
    console.error('❌ Cloudinary upload error:', error);
    throw error;
  }
};

const uploadToCloudinaryFn = async (file, options = {}) => {
  if (!file) {
    throw new Error('❌ لم يتم توفير ملف للرفع');
  }

  if (Buffer.isBuffer(file)) {
    return uploadBufferToCloudinaryFn(file, options);
  }

  if (typeof file === 'object' && file.buffer) {
    return uploadBufferToCloudinaryFn(file.buffer, options);
  }

  const filePath = typeof file === 'string' ? file : file.path;
  if (filePath) {
    return uploadFileFromPath(filePath, options);
  }

  throw new Error('❌ تنسيق ملف غير مدعوم');
};

// ============================================
// 6. دوال حذف الملفات من Cloudinary
// ============================================

/**
 * حذف ملف من Cloudinary
 * @param {string} publicId - المعرف العام للملف
 * @param {Object} options - خيارات الحذف
 * @returns {Promise<Object>} - نتيجة الحذف
 */
const deleteFromCloudinaryFn = async (publicId, options = {}) => {
  try {
    if (!publicId) {
      console.warn('⚠️ No publicId provided for deletion');
      return null;
    }
    
    console.log(`🗑️ Deleting from Cloudinary: ${publicId}`);
    
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: options.resource_type || 'image',
      ...options,
    });
    
    console.log(`✅ Deleted from Cloudinary: ${publicId}`);
    return result;
  } catch (error) {
    console.error('❌ Cloudinary delete error:', error);
    throw error;
  }
};

/**
 * حذف ملف قديم (يستخدم في التحديثات)
 * @param {string} fileUrl - رابط الملف القديم
 * @returns {Promise<Object>} - نتيجة الحذف
 */
const deleteOldImageFn = async (fileUrl) => {
  try {
    if (!fileUrl) return null;
    
    // استخراج publicId من رابط Cloudinary
    const publicId = extractPublicIdFromUrlFn(fileUrl);
    
    if (!publicId) {
      console.warn('⚠️ Could not extract publicId from URL:', fileUrl);
      return null;
    }
    
    return await deleteFromCloudinaryFn(publicId);
  } catch (error) {
    console.error('❌ Error deleting old image:', error);
    return null;
  }
};

// ============================================
// 7. دوال استخراج المعلومات من الروابط
// ============================================

/**
 * استخراج publicId من رابط Cloudinary
 * @param {string} url - رابط Cloudinary
 * @returns {string|null} - المعرف العام
 */
const extractPublicIdFromUrlFn = (url) => {
  try {
    if (!url) return null;
    
    // إذا كان الرابط من Cloudinary
    if (url.includes('cloudinary.com')) {
      // مثال: https://res.cloudinary.com/cloud_name/image/upload/v123456/elrawda/posts/image-12345.jpg
      const parts = url.split('/');
      const filename = parts[parts.length - 1];
      const publicId = filename.split('.')[0];
      
      // استخراج المجلد
      const folderMatch = url.match(/\/upload\/v\d+\/(.+)\//);
      if (folderMatch && folderMatch[1]) {
        return `${folderMatch[1]}/${publicId}`;
      }
      return publicId;
    }
    
    // إذا كان الرابط محلياً (للتوافق مع الإصدارات القديمة)
    if (url.startsWith('/uploads/') || url.includes('/uploads/')) {
      const filename = path.basename(url);
      return filename.split('.')[0];
    }
    
    return null;
  } catch (error) {
    console.error('❌ Error extracting publicId:', error);
    return null;
  }
};

/**
 * الحصول على رابط Cloudinary
 * @param {string} publicId - المعرف العام
 * @param {Object} options - خيارات التحويل
 * @returns {string} - الرابط
 */
const getCloudinaryUrlFn = (publicId, options = {}) => {
  if (!publicId) return null;
  
  return cloudinary.url(publicId, {
    secure: true,
    quality: 'auto:best',
    fetch_format: 'auto',
    ...options,
  });
};

/**
 * الحصول على رابط الصورة (alias)
 */
const getImageUrlFn = (publicId, options = {}) => {
  return getCloudinaryUrlFn(publicId, options);
};

// ============================================
// 8. دوال رفع من Buffer (بدون تخزين مؤقت)
// ============================================

/**
 * رفع ملف من Buffer مباشرة إلى Cloudinary
 * @param {Buffer} buffer - بيانات الملف
 * @param {Object} options - خيارات الرفع
 * @returns {Promise<Object>} - بيانات الملف المرفوع
 */
const uploadBufferToCloudinaryFn = async (buffer, options = {}) => {
  return new Promise((resolve, reject) => {
    const folder = options.folder || 'elrawda/uploads';
    const resourceType = options.resource_type || 'auto';
    
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: folder,
        resource_type: resourceType,
        quality: options.quality || 'auto:best',
        fetch_format: options.fetch_format || 'auto',
        ...options,
      },
      (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve({
            url: result.secure_url,
            publicId: result.public_id,
            format: result.format,
            bytes: result.bytes,
            width: result.width,
            height: result.height,
            resourceType: result.resource_type,
          });
        }
      }
    );
    
    // تحويل Buffer إلى Stream
    const readableStream = new Readable();
    readableStream.push(buffer);
    readableStream.push(null);
    readableStream.pipe(stream);
  });
};

// ============================================
// 9. دالة لرفع ملف من رابط
// ============================================

/**
 * رفع ملف من رابط URL إلى Cloudinary
 * @param {string} url - رابط الملف
 * @param {Object} options - خيارات الرفع
 * @returns {Promise<Object>} - بيانات الملف المرفوع
 */
const uploadFromUrlToCloudinaryFn = async (url, options = {}) => {
  try {
    const folder = options.folder || 'elrawda/uploads';
    
    const result = await cloudinary.uploader.upload(url, {
      folder: folder,
      resource_type: options.resource_type || 'auto',
      quality: 'auto:best',
      fetch_format: 'auto',
      ...options,
    });
    
    return {
      url: result.secure_url,
      publicId: result.public_id,
      format: result.format,
      bytes: result.bytes,
      width: result.width,
      height: result.height,
      resourceType: result.resource_type,
    };
  } catch (error) {
    console.error('❌ Cloudinary upload from URL error:', error);
    throw error;
  }
};

// ============================================
// 10. ERROR HANDLER
// ============================================

const handleUploadErrorFn = (err, req, res, next) => {
  console.log('📁 File received:', req.file);
  console.log('📝 Body:', req.body);
  
  if (err instanceof multer.MulterError) {
    if (err.code === 'FILE_TOO_LARGE') {
      return res.status(400).json({ 
        success: false,
        message: '❌ الملف كبير جداً. الحد الأقصى: 100MB للفيديوهات، 10MB للصور' 
      });
    }
    return res.status(400).json({ 
      success: false,
      message: err.message 
    });
  }
  if (err) {
    return res.status(400).json({ 
      success: false,
      message: err.message 
    });
  }
  next();
};

// ============================================
// 11. EXPORTS - ✅ تصدير كل شيء مرة واحدة فقط
// ============================================

// ✅ تصدير upload كـ default export
export default upload;
export { upload };

// ✅ تصدير كل الدوال كـ named exports (مرة واحدة فقط)
export const uploadToCloudinary = uploadToCloudinaryFn;
export const deleteFromCloudinary = deleteFromCloudinaryFn;
export const deleteOldImage = deleteOldImageFn;
export const extractPublicIdFromUrl = extractPublicIdFromUrlFn;
export const getCloudinaryUrl = getCloudinaryUrlFn;
export const getImageUrl = getImageUrlFn;
export const uploadBufferToCloudinary = uploadBufferToCloudinaryFn;
export const uploadFromUrlToCloudinary = uploadFromUrlToCloudinaryFn;
export const handleUploadError = handleUploadErrorFn;