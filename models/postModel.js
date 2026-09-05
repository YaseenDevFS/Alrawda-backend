// backend/models/postModel.js

import pool from '../db/db.js';

// ============================
//  CREATE POST
// ============================

export const createPost = async (userId, content, image = null, video = null, link = null, type = 'general', metadata = {}) => {
  const query = `
    INSERT INTO posts (user_id, content, image, video, link, type, video_width, video_height, video_duration, media_type)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *
  `;
  
  const values = [
    userId,
    content,
    image,
    video,
    link,
    type,
    metadata.width || null,
    metadata.height || null,
    metadata.duration || null,
    metadata.mediaType || (video ? 'video' : (image ? 'image' : null)),
  ];
  
  try {
    const result = await pool.query(query, values);
    return result.rows[0];
  } catch (error) {
    console.error('Create post error:', error);
    throw error;
  }
};

// ============================
//  GET POSTS - FIXED
// ============================

export const getPosts = async (limit = 20, offset = 0, userId = null, type = null) => {
  // Build the base query
  let query = `
    SELECT 
      p.id,
      p.user_id,
      p.content,
      p.image,
      p.video,
      p.link,
      p.type,
      p.video_width,
      p.video_height,
      p.video_duration,
      p.media_type,
      p.is_pinned,
      p.created_at,
      p.updated_at,
      u.name,
      u.email,
      u.avatar,
      u.role,
      COALESCE(l.likes_count, 0) as likes_count,
      COALESCE(c.comments_count, 0) as comments_count
  `;
  
  // Add is_liked column conditionally
  if (userId) {
    query += `,
      (SELECT COUNT(*) > 0 FROM likes WHERE post_id = p.id AND user_id = $1) as is_liked
    `;
  } else {
    query += `,
      false as is_liked
    `;
  }
  
  query += `
    FROM posts p
    JOIN users u ON p.user_id = u.id
    LEFT JOIN (
      SELECT post_id, COUNT(*) as likes_count
      FROM likes
      GROUP BY post_id
    ) l ON p.id = l.post_id
    LEFT JOIN (
      SELECT post_id, COUNT(*) as comments_count
      FROM comments
      WHERE parent_id IS NULL
      GROUP BY post_id
    ) c ON p.id = c.post_id
    WHERE 1=1
  `;
  
  // Build values array
  const values = [];
  
  // Add userId as first parameter if it exists (for is_liked subquery)
  if (userId) {
    values.push(userId);
  }
  
  // Add type filter if provided
  if (type && type !== 'all' && type !== 'undefined') {
    query += ` AND p.type = $${values.length + 1}`;
    values.push(type);
  }
  
  // Add order by and pagination
  query += ` ORDER BY p.is_pinned DESC, p.created_at DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`;
  values.push(limit, offset);
  
  try {
    console.log('📊 SQL Query:', query);
    console.log('📊 Values:', values);
    const result = await pool.query(query, values);
    return result.rows;
  } catch (error) {
    console.error('Get posts error:', error);
    throw error;
  }
};

// ============================
//  GET POST BY ID
// ============================

export const getPostById = async (postId, userId = null) => {
  let query = `
    SELECT 
      p.id,
      p.user_id,
      p.content,
      p.image,
      p.video,
      p.link,
      p.type,
      p.video_width,
      p.video_height,
      p.video_duration,
      p.media_type,
      p.is_pinned,
      p.created_at,
      p.updated_at,
      u.name,
      u.email,
      u.avatar,
      u.role,
      COALESCE(l.likes_count, 0) as likes_count,
      COALESCE(c.comments_count, 0) as comments_count
  `;
  
  if (userId) {
    query += `,
      (SELECT COUNT(*) > 0 FROM likes WHERE post_id = p.id AND user_id = $2) as is_liked
    `;
  } else {
    query += `,
      false as is_liked
    `;
  }
  
  query += `
    FROM posts p
    JOIN users u ON p.user_id = u.id
    LEFT JOIN (
      SELECT post_id, COUNT(*) as likes_count
      FROM likes
      GROUP BY post_id
    ) l ON p.id = l.post_id
    LEFT JOIN (
      SELECT post_id, COUNT(*) as comments_count
      FROM comments
      WHERE parent_id IS NULL
      GROUP BY post_id
    ) c ON p.id = c.post_id
    WHERE p.id = $1
  `;
  
  const values = [postId];
  if (userId) {
    values.push(userId);
  }
  
  try {
    const result = await pool.query(query, values);
    return result.rows[0];
  } catch (error) {
    console.error('Get post by id error:', error);
    throw error;
  }
};

// ============================
//  GET POSTS BY USER
// ============================

export const getPostsByUser = async (userId, limit = 20, offset = 0) => {
  const query = `
    SELECT 
      p.id,
      p.user_id,
      p.content,
      p.image,
      p.video,
      p.link,
      p.type,
      p.video_width,
      p.video_height,
      p.video_duration,
      p.media_type,
      p.is_pinned,
      p.created_at,
      p.updated_at,
      u.name,
      u.email,
      u.avatar,
      u.role,
      COALESCE(l.likes_count, 0) as likes_count,
      COALESCE(c.comments_count, 0) as comments_count,
      (SELECT COUNT(*) > 0 FROM likes WHERE post_id = p.id AND user_id = $1) as is_liked
    FROM posts p
    JOIN users u ON p.user_id = u.id
    LEFT JOIN (
      SELECT post_id, COUNT(*) as likes_count
      FROM likes
      GROUP BY post_id
    ) l ON p.id = l.post_id
    LEFT JOIN (
      SELECT post_id, COUNT(*) as comments_count
      FROM comments
      WHERE parent_id IS NULL
      GROUP BY post_id
    ) c ON p.id = c.post_id
    WHERE p.user_id = $1
    ORDER BY p.created_at DESC
    LIMIT $2 OFFSET $3
  `;
  
  try {
    const result = await pool.query(query, [userId, limit, offset]);
    return result.rows;
  } catch (error) {
    console.error('Get posts by user error:', error);
    throw error;
  }
};

// ============================
//  GET FEED POSTS
// ============================

export const getFeedPosts = async (userId, limit = 20, offset = 0) => {
  const query = `
    SELECT 
      p.id,
      p.user_id,
      p.content,
      p.image,
      p.video,
      p.link,
      p.type,
      p.video_width,
      p.video_height,
      p.video_duration,
      p.media_type,
      p.is_pinned,
      p.created_at,
      p.updated_at,
      u.name,
      u.email,
      u.avatar,
      u.role,
      COALESCE(l.likes_count, 0) as likes_count,
      COALESCE(c.comments_count, 0) as comments_count,
      (SELECT COUNT(*) > 0 FROM likes WHERE post_id = p.id AND user_id = $1) as is_liked
    FROM posts p
    JOIN users u ON p.user_id = u.id
    LEFT JOIN (
      SELECT post_id, COUNT(*) as likes_count
      FROM likes
      GROUP BY post_id
    ) l ON p.id = l.post_id
    LEFT JOIN (
      SELECT post_id, COUNT(*) as comments_count
      FROM comments
      WHERE parent_id IS NULL
      GROUP BY post_id
    ) c ON p.id = c.post_id
    WHERE p.user_id IN (
      SELECT following_id FROM follows WHERE follower_id = $1
    ) OR p.user_id = $1
    ORDER BY p.created_at DESC
    LIMIT $2 OFFSET $3
  `;
  
  try {
    const result = await pool.query(query, [userId, limit, offset]);
    return result.rows;
  } catch (error) {
    console.error('Get feed posts error:', error);
    throw error;
  }
};

// ============================
//  UPDATE POST
// ============================

export const updatePost = async (postId, content, image = null) => {
  const query = `
    UPDATE posts 
    SET content = $1, 
        image = COALESCE($2, image),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $3
    RETURNING *
  `;
  
  try {
    const result = await pool.query(query, [content, image, postId]);
    return result.rows[0];
  } catch (error) {
    console.error('Update post error:', error);
    throw error;
  }
};

// ============================
//  DELETE POST
// ============================

export const deletePost = async (postId) => {
  const query = `
    DELETE FROM posts WHERE id = $1
  `;
  
  try {
    await pool.query(query, [postId]);
    return true;
  } catch (error) {
    console.error('Delete post error:', error);
    throw error;
  }
};

// ============================
//  TOGGLE PIN
// ============================

export const togglePinPost = async (postId) => {
  const query = `
    UPDATE posts 
    SET is_pinned = NOT is_pinned,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING *
  `;
  
  try {
    const result = await pool.query(query, [postId]);
    return result.rows[0];
  } catch (error) {
    console.error('Toggle pin error:', error);
    throw error;
  }
};

// ============================
//  SEARCH POSTS
// ============================

export const searchPosts = async (searchTerm, limit = 20, offset = 0) => {
  const query = `
    SELECT 
      p.id,
      p.user_id,
      p.content,
      p.image,
      p.video,
      p.link,
      p.type,
      p.video_width,
      p.video_height,
      p.video_duration,
      p.media_type,
      p.is_pinned,
      p.created_at,
      p.updated_at,
      u.name,
      u.email,
      u.avatar,
      u.role,
      COALESCE(l.likes_count, 0) as likes_count,
      COALESCE(c.comments_count, 0) as comments_count,
      false as is_liked
    FROM posts p
    JOIN users u ON p.user_id = u.id
    LEFT JOIN (
      SELECT post_id, COUNT(*) as likes_count
      FROM likes
      GROUP BY post_id
    ) l ON p.id = l.post_id
    LEFT JOIN (
      SELECT post_id, COUNT(*) as comments_count
      FROM comments
      WHERE parent_id IS NULL
      GROUP BY post_id
    ) c ON p.id = c.post_id
    WHERE p.content ILIKE $1 OR u.name ILIKE $1
    ORDER BY p.created_at DESC
    LIMIT $2 OFFSET $3
  `;
  
  try {
    const result = await pool.query(query, [`%${searchTerm}%`, limit, offset]);
    return result.rows;
  } catch (error) {
    console.error('Search posts error:', error);
    throw error;
  }
};

// ============================
//  CREATE STORIES TABLE
// ============================

export const createStoriesTable = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS stories (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        image VARCHAR(500) NOT NULL,
        caption TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours')
      )
    `);
    console.log('✅ Stories table created or already exists');
  } catch (error) {
    console.error('❌ Error creating stories table:', error.message);
  }
};

// ============================
//  CREATE COMMUNITY TABLES
// ============================

export const createCommunityTables = async () => {
  try {
    // Posts table with video support
    await pool.query(`
      CREATE TABLE IF NOT EXISTS posts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        image VARCHAR(500),
        video VARCHAR(500),
        link VARCHAR(500),
        type VARCHAR(50) DEFAULT 'general',
        video_width INTEGER,
        video_height INTEGER,
        video_duration INTEGER,
        media_type VARCHAR(20),
        is_pinned BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Comments table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS comments (
        id SERIAL PRIMARY KEY,
        post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        parent_id INTEGER REFERENCES comments(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Likes table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS likes (
        id SERIAL PRIMARY KEY,
        post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(post_id, user_id)
      )
    `);
    
    console.log('✅ Community tables created or already exists');
  } catch (error) {
    console.error('❌ Error creating community tables:', error.message);
    throw error;
  }
};

// ============================
//  STORY FUNCTIONS
// ============================

export const createStory = async (userId, image, caption = '') => {
  const query = `
    INSERT INTO stories (user_id, image, caption)
    VALUES ($1, $2, $3)
    RETURNING *
  `;
  
  try {
    const result = await pool.query(query, [userId, image, caption]);
    return result.rows[0];
  } catch (error) {
    console.error('Create story error:', error);
    throw error;
  }
};

export const getStories = async (userId, limit = 20) => {
  const query = `
    SELECT 
      s.*,
      u.name,
      u.email,
      u.avatar,
      (SELECT COUNT(*) > 0 FROM story_views WHERE story_id = s.id AND user_id = $1) as viewed
    FROM stories s
    JOIN users u ON s.user_id = u.id
    WHERE s.expires_at > CURRENT_TIMESTAMP
    ORDER BY s.created_at DESC
    LIMIT $2
  `;
  
  try {
    const result = await pool.query(query, [userId, limit]);
    return result.rows;
  } catch (error) {
    console.error('Get stories error:', error);
    throw error;
  }
};

export const getStoriesByUser = async (userId) => {
  const query = `
    SELECT 
      s.*,
      u.name,
      u.email,
      u.avatar
    FROM stories s
    JOIN users u ON s.user_id = u.id
    WHERE s.user_id = $1 AND s.expires_at > CURRENT_TIMESTAMP
    ORDER BY s.created_at DESC
  `;
  
  try {
    const result = await pool.query(query, [userId]);
    return result.rows;
  } catch (error) {
    console.error('Get stories by user error:', error);
    throw error;
  }
};

export const getStoryById = async (storyId) => {
  const query = `
    SELECT 
      s.*,
      u.name,
      u.email,
      u.avatar
    FROM stories s
    JOIN users u ON s.user_id = u.id
    WHERE s.id = $1 AND s.expires_at > CURRENT_TIMESTAMP
  `;
  
  try {
    const result = await pool.query(query, [storyId]);
    return result.rows[0];
  } catch (error) {
    console.error('Get story by id error:', error);
    throw error;
  }
};

export const deleteStory = async (storyId, userId) => {
  const query = `
    DELETE FROM stories 
    WHERE id = $1 AND user_id = $2
    RETURNING *
  `;
  
  try {
    const result = await pool.query(query, [storyId, userId]);
    return result.rows[0];
  } catch (error) {
    console.error('Delete story error:', error);
    throw error;
  }
};

export const viewStory = async (storyId, userId) => {
  const query = `
    INSERT INTO story_views (story_id, user_id)
    VALUES ($1, $2)
    ON CONFLICT (story_id, user_id) DO NOTHING
    RETURNING *
  `;
  
  try {
    const result = await pool.query(query, [storyId, userId]);
    return { viewed: result.rows.length > 0 };
  } catch (error) {
    console.error('View story error:', error);
    throw error;
  }
};

export const getStoryViews = async (storyId) => {
  const query = `
    SELECT 
      sv.*,
      u.name,
      u.email,
      u.avatar
    FROM story_views sv
    JOIN users u ON sv.user_id = u.id
    WHERE sv.story_id = $1
    ORDER BY sv.created_at DESC
  `;
  
  try {
    const result = await pool.query(query, [storyId]);
    return result.rows;
  } catch (error) {
    console.error('Get story views error:', error);
    throw error;
  }
};