// backend/models/userModel.js
import { pool } from "../db/db.js";



// إنشاء جدول المستخدمين
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
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `;
    
    try {
        await pool.query(query);
        console.log('Users table created or already exists');
    } catch (error) {
        console.error('Error creating users table:', error);
    }
};

// أو إذا كان الجدول موجود بالفعل، اعمل ملف منفصل لتحديثه

// دالة البحث بالبريد الإلكتروني
export const findUserByEmail = async (email) => {
    const query = 'SELECT * FROM users WHERE email = $1';
    const result = await pool.query(query, [email]);
    return result.rows[0];
};

export const findUserById = async (id) => {
    const query = 'SELECT id, name, email, bio, location, website, role, level, created_at FROM users WHERE id = $1';
    const result = await pool.query(query, [id]);
    return result.rows[0];
};

// دالة إنشاء مستخدم جديد
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
    const query = 'SELECT id, name, email, created_at FROM users ORDER BY created_at DESC';
    const result = await pool.query(query);
    return result.rows;
};