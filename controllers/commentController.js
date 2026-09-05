// src/controllers/commentController.js
import * as commentModel from '../models/commentModel.js';

export const createComment = async (req, res) => {
  try {
    const { postId } = req.params;
    const { content, parentId } = req.body;
    
    if (!content) {
      return res.status(400).json({ message: 'Comment content is required' });
    }
    
    const comment = await commentModel.createComment(
      postId,
      req.userId,
      content,
      parentId || null
    );
    
    res.status(201).json({ success: true, comment });
  } catch (error) {
    console.error('Create comment error:', error);
    res.status(500).json({ message: 'Failed to create comment' });
  }
};

export const getComments = async (req, res) => {
  try {
    const { postId } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    
    const comments = await commentModel.getCommentsByPost(postId, limit, offset);
    res.json({ success: true, comments, limit, offset });
  } catch (error) {
    console.error('Get comments error:', error);
    res.status(500).json({ message: 'Failed to get comments' });
  }
};

export const getReplies = async (req, res) => {
  try {
    const { commentId } = req.params;
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;
    
    const replies = await commentModel.getReplies(commentId, limit, offset);
    res.json({ success: true, replies, limit, offset });
  } catch (error) {
    console.error('Get replies error:', error);
    res.status(500).json({ message: 'Failed to get replies' });
  }
};

export const updateComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    const { content } = req.body;
    
    const comment = await commentModel.getCommentById(commentId);
    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }
    
    if (comment.user_id !== req.userId) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    
    const updated = await commentModel.updateComment(commentId, content);
    res.json({ success: true, comment: updated });
  } catch (error) {
    console.error('Update comment error:', error);
    res.status(500).json({ message: 'Failed to update comment' });
  }
};

export const deleteComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    
    const comment = await commentModel.getCommentById(commentId);
    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }
    
    if (comment.user_id !== req.userId) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    
    await commentModel.deleteComment(commentId);
    res.json({ success: true, message: 'Comment deleted' });
  } catch (error) {
    console.error('Delete comment error:', error);
    res.status(500).json({ message: 'Failed to delete comment' });
  }
};