// src/models/userModel.js
import pool from "../db/db.js";

// ============================
//  CREATE TABLES
// ============================

export const createUsersTable = async () => {
    const query = `
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            email VARCHAR(255) UNIQUE NOT NULL,
            password VARCHAR(255) NOT NULL,
            bio TEXT,
            location VARCHAR(255),
            website VARCHAR(255),
            role VARCHAR(100) DEFAULT 'Quran Learner',
            level VARCHAR(50) DEFAULT 'Beginner',
            avatar VARCHAR(500),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `;
    
    try {
        await pool.query(query);
        console.log('✅ Users table created or already exists');
    } catch (error) {
        console.error('❌ Error creating users table:', error.message);
    }
};

// ============================
//  ADD AVATAR COLUMN (إذا كان غير موجود)
// ============================

export const addAvatarColumn = async () => {
    try {
        // تحقق إذا كان العمود موجوداً
        const checkQuery = `
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'users' AND column_name = 'avatar'
        `;
        const result = await pool.query(checkQuery);
        
        if (result.rows.length === 0) {
            // أضف العمود
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
        console.error('❌ Error adding avatar column:', error.message);
    }
};

// ============================
//  ADD FOLLOWS TABLE
// ============================

export const createFollowsTable = async () => {
    const query = `
        CREATE TABLE IF NOT EXISTS follows (
            id SERIAL PRIMARY KEY,
            follower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            following_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(follower_id, following_id)
        )
    `;
    
    try {
        await pool.query(query);
        console.log('✅ Follows table created or already exists');
    } catch (error) {
        console.error('❌ Error creating follows table:', error.message);
    }
};

// ============================
//  USER OPERATIONS
// ============================

export const findUserByEmail = async (email) => {
    const query = 'SELECT * FROM users WHERE email = $1';
    const result = await pool.query(query, [email]);
    return result.rows[0];
};

export const findUserById = async (id) => {
    const query = `
        SELECT id, name, email, bio, location, website, role, level, avatar, created_at 
        FROM users 
        WHERE id = $1
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0];
};

export const createUser = async (name, email, hashedPassword) => {
    const query = `
        INSERT INTO users (name, email, password)
        VALUES ($1, $2, $3)
        RETURNING id, name, email, created_at
    `;
    const result = await pool.query(query, [name, email, hashedPassword]);
    return result.rows[0];
};

export const getAllUsers = async () => {
    const query = `
        SELECT id, name, email, avatar, created_at 
        FROM users 
        ORDER BY created_at DESC
    `;
    const result = await pool.query(query);
    return result.rows;
};

export const updateUser = async (id, updates) => {
    const fields = [];
    const values = [];
    let paramCount = 1;
    
    const allowedFields = ['name', 'email', 'bio', 'location', 'website', 'role', 'level', 'avatar'];
    
    for (const field of allowedFields) {
        if (updates[field] !== undefined) {
            fields.push(`${field} = $${paramCount++}`);
            values.push(updates[field]);
        }
    }
    
    if (fields.length === 0) return null;
    
    values.push(id);
    const query = `
        UPDATE users 
        SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE id = $${paramCount}
        RETURNING id, name, email, bio, location, website, role, level, avatar, created_at, updated_at
    `;
    const result = await pool.query(query, values);
    return result.rows[0];
};

// ============================
//  COMMUNITY FUNCTIONS
// ============================

export const getUserProfile = async (userId, requesterId = null) => {
    // ✅ requesterId = the logged-in user asking for this profile.
    // We compute is_following server-side (is `requesterId` already
    // following `userId`?) so the frontend doesn't have to fetch the
    // entire followers list just to answer that one yes/no question.
    const query = `
        SELECT u.id, u.name, u.email, u.bio, u.location, u.website, u.role, u.level, u.avatar, u.created_at,
               COUNT(DISTINCT p.id) as posts_count,
               COUNT(DISTINCT f1.follower_id) as followers_count,
               COUNT(DISTINCT f2.following_id) as following_count,
               EXISTS (
                   SELECT 1 FROM follows
                   WHERE follower_id = $2 AND following_id = u.id
               ) as is_following
        FROM users u
        LEFT JOIN posts p ON u.id = p.user_id AND p.is_deleted = false
        LEFT JOIN follows f1 ON u.id = f1.following_id
        LEFT JOIN follows f2 ON u.id = f2.follower_id
        WHERE u.id = $1
        GROUP BY u.id
    `;
    const result = await pool.query(query, [userId, requesterId]);
    return result.rows[0];
};

export const followUser = async (followerId, followingId) => {
    if (followerId === followingId) {
        throw new Error('Cannot follow yourself');
    }
    
    const query = `
        INSERT INTO follows (follower_id, following_id)
        VALUES ($1, $2)
        ON CONFLICT (follower_id, following_id) DO NOTHING
        RETURNING *
    `;
    const result = await pool.query(query, [followerId, followingId]);
    return result.rows[0];
};

export const unfollowUser = async (followerId, followingId) => {
    const query = `
        DELETE FROM follows 
        WHERE follower_id = $1 AND following_id = $2
        RETURNING id
    `;
    const result = await pool.query(query, [followerId, followingId]);
    return result.rows[0];
};

export const isFollowing = async (followerId, followingId) => {
    const query = `
        SELECT id FROM follows 
        WHERE follower_id = $1 AND following_id = $2
    `;
    const result = await pool.query(query, [followerId, followingId]);
    return result.rows.length > 0;
};

export const getFollowers = async (userId, limit = 20, offset = 0) => {
    const query = `
        SELECT u.id, u.name, u.email, u.avatar, u.created_at
        FROM follows f
        JOIN users u ON f.follower_id = u.id
        WHERE f.following_id = $1
        ORDER BY f.created_at DESC
        LIMIT $2 OFFSET $3
    `;
    const result = await pool.query(query, [userId, limit, offset]);
    return result.rows;
};

export const getFollowing = async (userId, limit = 20, offset = 0) => {
    const query = `
        SELECT u.id, u.name, u.email, u.avatar, u.created_at
        FROM follows f
        JOIN users u ON f.following_id = u.id
        WHERE f.follower_id = $1
        ORDER BY f.created_at DESC
        LIMIT $2 OFFSET $3
    `;
    const result = await pool.query(query, [userId, limit, offset]);
    return result.rows;
};

export const updateUserProfile = async (userId, data) => {
    const fields = [];
    const values = [];
    let paramCount = 1;
    
    const allowedFields = ['name', 'email', 'bio', 'location', 'website', 'role', 'level', 'avatar'];
    
    for (const field of allowedFields) {
        if (data[field] !== undefined) {
            fields.push(`${field} = $${paramCount++}`);
            values.push(data[field]);
        }
    }
    
    if (fields.length === 0) return null;
    
    values.push(userId);
    const query = `
        UPDATE users 
        SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE id = $${paramCount}
        RETURNING id, name, email, bio, location, website, role, level, avatar, created_at, updated_at
    `;
    const result = await pool.query(query, values);
    return result.rows[0];
};

// ============================
//  INITIALIZE DATABASE
// ============================

export const initializeDatabase = async () => {
    try {
        await createUsersTable();
        await addAvatarColumn();
        await createFollowsTable();
        console.log('✅ Database initialized successfully');
    } catch (error) {
        console.error('❌ Database initialization error:', error.message);
        throw error;
    }
};