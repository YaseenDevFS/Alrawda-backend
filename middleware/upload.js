// backend/middleware/upload.js

import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ Create upload directories
const uploadDir = path.join(process.cwd(), 'uploads/posts');
const storyDir = path.join(process.cwd(), 'uploads/stories');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log('📁 Created uploads/posts directory');
}

if (!fs.existsSync(storyDir)) {
  fs.mkdirSync(storyDir, { recursive: true });
  console.log('📁 Created uploads/stories directory');
}

// ============================
//  STORAGE CONFIGURATION
// ============================

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Determine destination based on file type or route
    const route = req.route?.path || '';
    if (route.includes('story')) {
      cb(null, storyDir);
    } else {
      cb(null, uploadDir);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const prefix = file.mimetype.startsWith('video/') ? 'video' : 'image';
    cb(null, `${prefix}-${uniqueSuffix}${ext}`);
  }
});

// ============================
//  FILE FILTER - SUPPORT IMAGES AND VIDEOS
// ============================

const fileFilter = (req, file, cb) => {
  // ✅ Support both images and videos
  const allowedImageTypes = /jpeg|jpg|png|gif|webp/;
  const allowedVideoTypes = /mp4|mov|avi|mkv|webm|m4v|3gp|mpeg/;
  
  const extname = path.extname(file.originalname).toLowerCase();
  const mimetype = file.mimetype;
  
  console.log('📁 File type check:', { extname, mimetype, originalname: file.originalname });
  
  // Check if it's an image
  if (allowedImageTypes.test(extname) && allowedImageTypes.test(mimetype)) {
    return cb(null, true);
  }
  
  // Check if it's a video
  if (allowedVideoTypes.test(extname) && mimetype.startsWith('video/')) {
    return cb(null, true);
  }
  
  // ✅ Also accept if mimetype starts with video/ regardless of extension
  if (mimetype.startsWith('video/')) {
    return cb(null, true);
  }
  
  cb(new Error('Only images (jpeg, jpg, png, gif, webp) and videos (mp4, mov, avi, mkv, webm, m4v, 3gp) are allowed'));
};

// ============================
//  MULTER CONFIG
// ============================

export const upload = multer({
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB for videos
  },
  fileFilter: fileFilter
});

// ============================
//  ERROR HANDLER
// ============================

export const handleUploadError = (err, req, res, next) => {
  console.log('📁 File received:', req.file);
  console.log('📝 Body:', req.body);
  
  if (err instanceof multer.MulterError) {
    if (err.code === 'FILE_TOO_LARGE') {
      return res.status(400).json({ 
        success: false,
        message: 'File too large. Max size: 100MB for videos, 10MB for images' 
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

// ============================
//  HELPERS
// ============================

export const deleteOldImage = async (filePath) => {
  if (!filePath) return;
  try {
    const fullPath = path.join(process.cwd(), filePath);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      console.log('🗑️ Old file deleted:', filePath);
    }
  } catch (error) {
    console.error('Error deleting file:', error);
  }
};

export const getImageUrl = (req, filePath) => {
  if (!filePath) return null;
  const fileName = path.basename(filePath);
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  
  // Determine the directory
  if (filePath.includes('stories')) {
    return `${baseUrl}/uploads/stories/${fileName}`;
  }
  return `${baseUrl}/uploads/posts/${fileName}`;
};