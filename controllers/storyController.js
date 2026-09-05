// backend/controllers/storyController.js
import * as storyModel from '../models/postModel.js';
import { deleteOldImage, getImageUrl } from '../middleware/upload.js';
import path from 'path';
import fs from 'fs';

// ============================
//  ✅ دالة لحفظ Base64 كصورة للـ Story
// ============================
const saveBase64Image = (base64Data, userId) => {
  try {
    const matches = base64Data.match(/^data:image\/([a-zA-Z]+);base64,(.+)$/);
    if (!matches) return null;
    
    const extension = matches[1];
    const base64 = matches[2];
    const buffer = Buffer.from(base64, 'base64');
    
    const fileName = `story-${Date.now()}-${userId}.${extension}`;
    const filePath = path.join(process.cwd(), 'uploads/stories', fileName);
    
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(filePath, buffer);
    console.log('✅ Story Base64 image saved:', filePath);
    
    return path.relative(process.cwd(), filePath);
  } catch (error) {
    console.error('❌ Error saving story Base64 image:', error);
    return null;
  }
};

// ============================
//  CREATE STORY
// ============================

export const createStory = async (req, res) => {
  try {
    console.log('📝 req.body:', req.body);
    console.log('📁 req.file:', req.file);
    
    const { caption } = req.body;
    let image = null;
    let imageUrl = null;
    
    // ✅ إذا كان هناك ملف مرفوع (multipart/form-data)
    if (req.file) {
      image = req.file.path;
      console.log('🖼️ Story image from file upload:', image);
      imageUrl = getImageUrl(req, image);
    }
    // ✅ إذا كانت الصورة مرسلة كـ Base64 في body
    else if (req.body.image && req.body.image.startsWith('data:image')) {
      console.log('🖼️ Story Base64 image received');
      image = saveBase64Image(req.body.image, req.userId);
      if (image) {
        imageUrl = getImageUrl(req, image);
      }
    }
    
    if (!image) {
      return res.status(400).json({
        success: false,
        message: 'Image is required for story'
      });
    }
    
    const story = await storyModel.createStory(
      req.userId,
      image,
      caption || ''
    );
    
    const storyWithImageUrl = {
      ...story,
      imageUrl: imageUrl || null,
      user: {
        id: req.userId,
        name: req.userName || 'User'
      }
    };
    
    console.log('✅ Story created:', storyWithImageUrl);
    
    res.status(201).json({
      success: true,
      story: storyWithImageUrl
    });
  } catch (error) {
    console.error('❌ Create story error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create story',
      error: error.message
    });
  }
};

// ============================
//  GET ALL STORIES
// ============================

export const getStories = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const userId = req.userId;
    
    const stories = await storyModel.getStories(userId, limit);
    
    // Group stories by user
    const storiesByUser = {};
    stories.forEach(story => {
      const userId = story.user_id;
      if (!storiesByUser[userId]) {
        storiesByUser[userId] = {
          user: {
            id: story.user_id,
            name: story.name,
            email: story.email,
            avatar: story.avatar
          },
          stories: []
        };
      }
      storiesByUser[userId].stories.push({
        ...story,
        imageUrl: story.image ? getImageUrl(req, story.image) : null
      });
    });
    
    res.json({
      success: true,
      stories: Object.values(storiesByUser)
    });
  } catch (error) {
    console.error('❌ Get stories error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get stories'
    });
  }
};

// ============================
//  GET STORIES BY USER
// ============================

export const getUserStories = async (req, res) => {
  try {
    const { userId } = req.params;
    
    const stories = await storyModel.getStoriesByUser(userId);
    
    const storiesWithImageUrls = stories.map(story => ({
      ...story,
      imageUrl: story.image ? getImageUrl(req, story.image) : null
    }));
    
    res.json({
      success: true,
      stories: storiesWithImageUrls
    });
  } catch (error) {
    console.error('❌ Get user stories error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user stories'
    });
  }
};

// ============================
//  GET SINGLE STORY
// ============================

export const getStory = async (req, res) => {
  try {
    const { id } = req.params;
    
    const story = await storyModel.getStoryById(id);
    
    if (!story) {
      return res.status(404).json({
        success: false,
        message: 'Story not found or expired'
      });
    }
    
    const storyWithImageUrl = {
      ...story,
      imageUrl: story.image ? getImageUrl(req, story.image) : null
    };
    
    res.json({
      success: true,
      story: storyWithImageUrl
    });
  } catch (error) {
    console.error('❌ Get story error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get story'
    });
  }
};

// ============================
//  DELETE STORY
// ============================

export const deleteStory = async (req, res) => {
  try {
    const { id } = req.params;
    
    const story = await storyModel.getStoryById(id);
    
    if (!story) {
      return res.status(404).json({
        success: false,
        message: 'Story not found'
      });
    }
    
    if (story.user_id !== req.userId) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this story'
      });
    }
    
    if (story.image) {
      await deleteOldImage(story.image);
    }
    
    await storyModel.deleteStory(id, req.userId);
    
    res.json({
      success: true,
      message: 'Story deleted successfully'
    });
  } catch (error) {
    console.error('❌ Delete story error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete story'
    });
  }
};

// ============================
//  VIEW STORY
// ============================

export const viewStory = async (req, res) => {
  try {
    const { id } = req.params;
    
    const story = await storyModel.getStoryById(id);
    
    if (!story) {
      return res.status(404).json({
        success: false,
        message: 'Story not found or expired'
      });
    }
    
    // Don't count your own views
    if (story.user_id !== req.userId) {
      const result = await storyModel.viewStory(id, req.userId);
      res.json({
        success: true,
        viewed: result.viewed,
        message: result.message
      });
    } else {
      res.json({
        success: true,
        viewed: false,
        message: 'Cannot view your own story'
      });
    }
  } catch (error) {
    console.error('❌ View story error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to view story'
    });
  }
};

// ============================
//  GET STORY VIEWS
// ============================

export const getStoryViews = async (req, res) => {
  try {
    const { id } = req.params;
    
    const story = await storyModel.getStoryById(id);
    
    if (!story) {
      return res.status(404).json({
        success: false,
        message: 'Story not found'
      });
    }
    
    // Only the story owner can see views
    if (story.user_id !== req.userId) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this story\'s views'
      });
    }
    
    const views = await storyModel.getStoryViews(id);
    
    res.json({
      success: true,
      views,
      count: views.length
    });
  } catch (error) {
    console.error('❌ Get story views error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get story views'
    });
  }
};