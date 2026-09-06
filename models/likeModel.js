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
      INSERT INTO likes (post_id, user_id, reaction_type)
      VALUES ($1, $2, 'like')
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

export const setReaction = async (postId, userId, reactionType) => {
  const allowedReactions = ['like', 'love', 'angry'];
  if (reactionType !== null && !allowedReactions.includes(reactionType)) {
    throw new Error('Invalid reaction type');
  }

  const existing = await pool.query(
    'SELECT id, reaction_type FROM likes WHERE post_id = $1 AND user_id = $2',
    [postId, userId]
  );

  if (reactionType === null || existing.rows[0]?.reaction_type === reactionType) {
    await pool.query('DELETE FROM likes WHERE post_id = $1 AND user_id = $2', [postId, userId]);
    return { reaction: null, liked: false };
  }

  if (existing.rows.length) {
    await pool.query(
      'UPDATE likes SET reaction_type = $1 WHERE post_id = $2 AND user_id = $3',
      [reactionType, postId, userId]
    );
  } else {
    await pool.query(
      'INSERT INTO likes (post_id, user_id, reaction_type) VALUES ($1, $2, $3)',
      [postId, userId, reactionType]
    );
  }

  return { reaction: reactionType, liked: true };
};