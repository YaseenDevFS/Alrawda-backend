// src/models/likeModel.js
import pool from '../db/db.js';

export const toggleLike = async (postId, userId) => {
  // Check if like exists
  const checkQuery = 'SELECT id FROM likes WHERE post_id = $1 AND user_id = $2';
  const checkResult = await pool.query(checkQuery, [postId, userId]);
  
  if (checkResult.rows.length > 0) {
    // Unlike
    const deleteQuery = 'DELETE FROM likes WHERE post_id = $1 AND user_id = $2 RETURNING id';
    const deleteResult = await pool.query(deleteQuery, [postId, userId]);
    return { liked: false, id: deleteResult.rows[0]?.id };
  } else {
    // Like
    const insertQuery = `
      INSERT INTO likes (post_id, user_id)
      VALUES ($1, $2)
      RETURNING id
    `;
    const insertResult = await pool.query(insertQuery, [postId, userId]);
    return { liked: true, id: insertResult.rows[0].id };
  }
};

export const getLikeCount = async (postId) => {
  const query = 'SELECT COUNT(*) FROM likes WHERE post_id = $1';
  const result = await pool.query(query, [postId]);
  return parseInt(result.rows[0].count);
};

export const isLiked = async (postId, userId) => {
  const query = 'SELECT id FROM likes WHERE post_id = $1 AND user_id = $2';
  const result = await pool.query(query, [postId, userId]);
  return result.rows.length > 0;
};

export const getLikesByUser = async (userId, limit = 20, offset = 0) => {
  const query = `
    SELECT p.*, 
           u.id as user_id, u.name, u.email, u.avatar,
           COUNT(DISTINCT l2.id) as likes_count,
           COUNT(DISTINCT c.id) as comments_count
    FROM likes l
    JOIN posts p ON l.post_id = p.id
    JOIN users u ON p.user_id = u.id
    LEFT JOIN likes l2 ON p.id = l2.post_id
    LEFT JOIN comments c ON p.id = c.post_id AND c.is_deleted = false
    WHERE l.user_id = $1 AND p.is_deleted = false
    GROUP BY p.id, u.id
    ORDER BY l.created_at DESC
    LIMIT $2 OFFSET $3
  `;
  const result = await pool.query(query, [userId, limit, offset]);
  return result.rows;
};