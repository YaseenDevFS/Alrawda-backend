// src/controllers/userController.js
import * as userModel from '../models/userModel.js';

export const getProfile = async (req, res) => {
  try {
    const userId = req.params.userId || req.userId;
    // ✅ Pass req.userId as the requester so the profile query can
    // tell us whether *I* already follow this person.
    const profile = await userModel.getUserProfile(userId, req.userId);
    
    if (!profile) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json({ success: true, profile });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ message: 'Failed to get profile' });
  }
};

export const updateProfile = async (req, res) => {
  try {
    const { name, email, bio, location, website, role, level, avatar } = req.body;
    
    const updated = await userModel.updateUserProfile(req.userId, {
      name, email, bio, location, website, role, level, avatar
    });
    
    if (!updated) {
      return res.status(400).json({ message: 'No fields to update' });
    }
    
    res.json({ success: true, user: updated });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ message: 'Failed to update profile' });
  }
};

export const follow = async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (parseInt(userId) === req.userId) {
      return res.status(400).json({ message: 'Cannot follow yourself' });
    }
    
    const user = await userModel.getUserProfile(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    const result = await userModel.followUser(req.userId, parseInt(userId));
    const isFollowing = await userModel.isFollowing(req.userId, parseInt(userId));
    
    res.json({ success: true, following: isFollowing });
  } catch (error) {
    console.error('Follow error:', error);
    res.status(500).json({ message: 'Failed to follow user' });
  }
};

export const unfollow = async (req, res) => {
  try {
    const { userId } = req.params;
    await userModel.unfollowUser(req.userId, parseInt(userId));
    
    res.json({ success: true, following: false });
  } catch (error) {
    console.error('Unfollow error:', error);
    res.status(500).json({ message: 'Failed to unfollow user' });
  }
};

export const getFollowers = async (req, res) => {
  try {
    const { userId } = req.params;
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;
    
    const followers = await userModel.getFollowers(userId, limit, offset);
    res.json({ success: true, followers, limit, offset });
  } catch (error) {
    console.error('Get followers error:', error);
    res.status(500).json({ message: 'Failed to get followers' });
  }
};

export const getFollowing = async (req, res) => {
  try {
    const { userId } = req.params;
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;
    
    const following = await userModel.getFollowing(userId, limit, offset);
    res.json({ success: true, following, limit, offset });
  } catch (error) {
    console.error('Get following error:', error);
    res.status(500).json({ message: 'Failed to get following' });
  }
};

export const getAllUsers = async (req, res) => {
  try {
    const users = await userModel.getAllUsers(req.userId);
    res.json({ success: true, users });
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({ message: 'Failed to get users' });
  }
};