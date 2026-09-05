// src/models/commentModel.js
import pool from '../db/db.js';

export const createComment = async (postId, userId, content, parentId = null) => {
  const query = `
    INSERT INTO comments (post_id, user_id, content, parent_id)
    VALUES ($1, $2, $3, $4)
    RETURNING *
  `;
  const result = await pool.query(query, [postId, userId, content, parentId]);
  return result.rows[0];
};

export const getCommentsByPost = async (postId, limit = 50, offset = 0) => {
  const query = `
    SELECT c.*, 
           u.id as user_id, u.name, u.email, u.avatar
    FROM comments c
    JOIN users u ON c.user_id = u.id
    WHERE c.post_id = $1 AND c.is_deleted = false AND c.parent_id IS NULL
    ORDER BY c.created_at ASC
    LIMIT $2 OFFSET $3
  `;
  const result = await pool.query(query, [postId, limit, offset]);
  return result.rows;
};

export const getReplies = async (commentId, limit = 20, offset = 0) => {
  const query = `
    SELECT c.*, 
           u.id as user_id, u.name, u.email, u.avatar
    FROM comments c
    JOIN users u ON c.user_id = u.id
    WHERE c.parent_id = $1 AND c.is_deleted = false
    ORDER BY c.created_at ASC
    LIMIT $2 OFFSET $3
  `;
  const result = await pool.query(query, [commentId, limit, offset]);
  return result.rows;
};

export const getCommentById = async (commentId) => {
  const query = `
    SELECT c.*, 
           u.id as user_id, u.name, u.email, u.avatar
    FROM comments c
    JOIN users u ON c.user_id = u.id
    WHERE c.id = $1 AND c.is_deleted = false
  `;
  const result = await pool.query(query, [commentId]);
  return result.rows[0];
};

export const deleteComment = async (commentId) => {
  const query = `
    UPDATE comments 
    SET is_deleted = true, updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING id
  `;
  const result = await pool.query(query, [commentId]);
  return result.rows[0];
};

export const updateComment = async (commentId, content) => {
  const query = `
    UPDATE comments 
    SET content = $1, updated_at = CURRENT_TIMESTAMP
    WHERE id = $2
    RETURNING *
  `;
  const result = await pool.query(query, [content, commentId]);
  return result.rows[0];
};

export const getCommentCount = async (postId) => {
  const query = `
    SELECT COUNT(*) FROM comments 
    WHERE post_id = $1 AND is_deleted = false
  `;
  const result = await pool.query(query, [postId]);
  return parseInt(result.rows[0].count);
};