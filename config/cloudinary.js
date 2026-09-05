// config/cloudinary.js

import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';

// تحميل المتغيرات من ملف .env
dotenv.config();

// تكوين Cloudinary بالمفاتيح
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export default cloudinary;