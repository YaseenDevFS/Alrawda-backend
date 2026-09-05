// backend/server.js

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import pool from "./db/db.js";

// Import Routes
import authRoutes from "./routes/authRoutes.js";
import postRoutes from "./routes/postRoutes.js";
import commentRoutes from "./routes/commentRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import storyRoutes from "./routes/storyRoutes.js";
import uploadRoutes from "./routes/uploadRoutes.js"; // ✅ إضافة مسارات الرفع

// Import Models
import { createUsersTable, createFollowsTable } from "./models/userModel.js";
import { createCommunityTables, createStoriesTable } from "./models/postModel.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();

const isServerless = process.env.VERCEL === '1'
  || process.env.NODE_ENV === 'production'
  || process.env.AWS_LAMBDA_FUNCTION_NAME
  || process.cwd() === '/var/task';

// ============================
//  CORS Configuration
// ============================
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  credentials: true,
  exposedHeaders: ['Content-Length', 'Content-Type'],
}));

// ============================
//  Body Parsing Middleware
// ============================
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ============================
//  ✅ Create Temporary Upload Directory (local only)
// ============================
const tempDir = path.join(process.cwd(), 'temp');

if (!isServerless && !fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
  console.log('📁 Created temp directory for Cloudinary uploads');
}

// ============================
//  ✅ Cloudinary Status Check
// ============================
console.log('☁️ Cloudinary Status:');
console.log(`   Cloud Name: ${process.env.CLOUDINARY_CLOUD_NAME ? '✅ Configured' : '❌ Missing'}`);
console.log(`   API Key: ${process.env.CLOUDINARY_API_KEY ? '✅ Configured' : '❌ Missing'}`);
console.log(`   API Secret: ${process.env.CLOUDINARY_API_SECRET ? '✅ Configured' : '❌ Missing'}`);

// ============================
//  ✅ Debug Middleware - Log all requests
// ============================
app.use((req, res, next) => {
  console.log(`📡 ${req.method} ${req.url}`);
  next();
});

// ============================
//  Routes
// ============================
app.use('/api/auth', authRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/users', userRoutes);
app.use('/api/stories', storyRoutes);
app.use('/api', uploadRoutes); // ✅ إضافة مسارات رفع الملفات

// ============================
//  Health Check
// ============================
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    cloudinary: {
      configured: !!process.env.CLOUDINARY_CLOUD_NAME,
      cloudName: process.env.CLOUDINARY_CLOUD_NAME || 'Not configured',
    },
    upload: {
      method: 'Cloudinary',
      tempFolder: '/temp/',
    }
  });
});

// ============================
//  404 Handler
// ============================
app.use((req, res) => {
  console.log(`❌ 404: ${req.method} ${req.url}`);
  res.status(404).json({ 
    success: false,
    message: `Route not found: ${req.method} ${req.url}` 
  });
});

// ============================
//  Error Handler
// ============================
app.use((err, req, res, next) => {
  console.error('❌ Server Error:', err);
  res.status(500).json({ 
    success: false,
    message: err.message || 'Internal server error' 
  });
});

// ============================
//  Database Initialization Functions
// ============================

// ✅ Ensure avatar column
const ensureAvatarColumn = async () => {
  try {
    console.log('🔄 Checking for avatar column...');
    
    const checkQuery = `
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'avatar'
    `;
    const result = await pool.query(checkQuery);
    
    if (result.rows.length === 0) {
      console.log('🔄 Avatar column not found. Adding it...');
      const alterQuery = `
        ALTER TABLE users 
        ADD COLUMN avatar VARCHAR(500)
      `;
      await pool.query(alterQuery);
      console.log('✅ Avatar column added successfully');
    } else {
      console.log('✅ Avatar column already exists');
    }
  } catch (error) {
    console.error('❌ Error ensuring avatar column:', error.message);
  }
};

// ✅ Ensure follows table
const ensureFollowsTable = async () => {
  try {
    console.log('🔄 Checking for follows table...');
    
    const query = `
      CREATE TABLE IF NOT EXISTS follows (
        id SERIAL PRIMARY KEY,
        follower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        following_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(follower_id, following_id)
      )
    `;
    await pool.query(query);
    console.log('✅ Follows table created or already exists');
  } catch (error) {
    console.error('❌ Error creating follows table:', error.message);
  }
};

// ✅ Ensure saved_posts table
const ensureSavedPostsTable = async () => {
  try {
    console.log('🔄 Checking for saved_posts table...');
    
    const query = `
      CREATE TABLE IF NOT EXISTS saved_posts (
        id SERIAL PRIMARY KEY,
        post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(post_id, user_id)
      )
    `;
    await pool.query(query);
    console.log('✅ Saved posts table created or already exists');
  } catch (error) {
    console.error('❌ Error creating saved_posts table:', error.message);
  }
};

// ✅ Ensure story_views table
const ensureStoryViewsTable = async () => {
  try {
    console.log('🔄 Checking for story_views table...');
    
    const query = `
      CREATE TABLE IF NOT EXISTS story_views (
        id SERIAL PRIMARY KEY,
        story_id INTEGER NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(story_id, user_id)
      )
    `;
    await pool.query(query);
    console.log('✅ Story views table created or already exists');
  } catch (error) {
    console.error('❌ Error creating story_views table:', error.message);
  }
};

// ✅ Ensure posts table has video columns
const ensurePostVideoColumns = async () => {
  try {
    console.log('🔄 Checking for video columns in posts table...');
    
    const columns = ['video', 'video_width', 'video_height', 'video_duration', 'media_type'];
    
    for (const col of columns) {
      const checkQuery = `
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'posts' AND column_name = '${col}'
      `;
      const result = await pool.query(checkQuery);
      
      if (result.rows.length === 0) {
        let alterQuery = '';
        switch (col) {
          case 'video':
            alterQuery = `ALTER TABLE posts ADD COLUMN video VARCHAR(500)`;
            break;
          case 'video_width':
            alterQuery = `ALTER TABLE posts ADD COLUMN video_width INTEGER`;
            break;
          case 'video_height':
            alterQuery = `ALTER TABLE posts ADD COLUMN video_height INTEGER`;
            break;
          case 'video_duration':
            alterQuery = `ALTER TABLE posts ADD COLUMN video_duration INTEGER`;
            break;
          case 'media_type':
            alterQuery = `ALTER TABLE posts ADD COLUMN media_type VARCHAR(20)`;
            break;
        }
        await pool.query(alterQuery);
        console.log(`✅ Added ${col} column to posts table`);
      }
    }
  } catch (error) {
    console.error('❌ Error ensuring video columns:', error.message);
  }
};

// ✅ Full database initialization
const initializeDatabase = async () => {
  try {
    console.log('🔄 Initializing database...');
    
    // Create users table
    await createUsersTable();
    console.log('✅ Users table ready');
    
    // Ensure avatar column
    await ensureAvatarColumn();
    
    // Create follows table
    await ensureFollowsTable();
    
    // Create community tables (posts, comments, likes)
    await createCommunityTables();
    console.log('✅ Community tables ready');
    
    // Ensure video columns in posts table
    await ensurePostVideoColumns();
    
    // Create saved posts table
    await ensureSavedPostsTable();
    
    // Create stories table
    await createStoriesTable();
    
    // Create story views table
    await ensureStoryViewsTable();
    
    console.log('✅ All tables initialized successfully!');
    console.log('📊 Tables: users, follows, posts, comments, likes, saved_posts, stories, story_views');
  } catch (error) {
    console.error('❌ Database initialization error:', error.message);
    throw error;
  }
};

// ============================
//  Start Server
// ============================

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await initializeDatabase();
    
    app.listen(PORT, () => {
      console.log(`\n🚀 Server running on port ${PORT}`);
      console.log(`📍 Health check: http://localhost:${PORT}/api/health`);
      console.log(`📡 API base: http://localhost:${PORT}/api`);
      console.log(`\n☁️ Files are stored on Cloudinary`);
      console.log(`📁 Temporary uploads: /temp/ (deleted after upload)`);
      console.log(`\n📋 Upload endpoints:`);
      console.log(`  POST   /api/upload/single      - Upload single file`);
      console.log(`  POST   /api/upload/multiple    - Upload multiple files`);
      console.log(`  POST   /api/upload/fields      - Upload different fields`);
      console.log(`  DELETE /api/upload/:publicId   - Delete file from Cloudinary`);
      console.log(`  GET    /api/upload/url/:publicId - Get file URL`);
      console.log(`\n📋 Available API endpoints:`);
      console.log(`  POST   /api/posts        - Create post (image/video)`);
      console.log(`  GET    /api/posts        - Get all posts`);
      console.log(`  GET    /api/posts/:id    - Get single post`);
      console.log(`  PUT    /api/posts/:id    - Update post`);
      console.log(`  DELETE /api/posts/:id    - Delete post`);
      console.log(`  POST   /api/posts/:id/like - Like post`);
      console.log(`\n✅ Server ready!`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
};

// ============================
//  Error Handling
// ============================

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

// ============================
//  Start
// ============================

if (!isServerless) {
  startServer();
}

export default app;