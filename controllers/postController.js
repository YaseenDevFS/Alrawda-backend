// backend/controllers/postController.js
import * as postModel from '../models/postModel.js';
import * as likeModel from '../models/likeModel.js';
import { deleteOldImage, getImageUrl, uploadToCloudinary } from '../middleware/upload.js';
import path from 'path';
import fs from 'fs';

// ============================
//  ✅ دالة لحفظ Base64 كصورة
// ============================
const saveBase64Image = (base64Data, userId) => {
  try {
    const matches = base64Data.match(/^data:image\/([a-zA-Z]+);base64,(.+)$/);
    if (!matches) return null;
    
    const extension = matches[1];
    const base64 = matches[2];
    const buffer = Buffer.from(base64, 'base64');
    
    const fileName = `post-${Date.now()}-${userId}.${extension}`;
    const filePath = path.join(process.cwd(), 'uploads/posts', fileName);
    
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(filePath, buffer);
    console.log('✅ Base64 image saved:', filePath);
    
    return path.relative(process.cwd(), filePath);
  } catch (error) {
    console.error('❌ Error saving Base64 image:', error);
    return null;
  }
};

// ============================
//  ✅ دالة لحفظ الفيديو
// ============================
const saveVideoFile = (file, userId) => {
  try {
    const ext = path.extname(file.originalname) || '.mp4';
    const fileName = `video-${Date.now()}-${userId}${ext}`;
    const filePath = path.join(process.cwd(), 'uploads/posts', fileName);
    
    // Copy file to destination
    if (file.path) {
      fs.copyFileSync(file.path, filePath);
      // Delete temp file
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
    }
    
    console.log('✅ Video saved:', filePath);
    return path.relative(process.cwd(), filePath);
  } catch (error) {
    console.error('❌ Error saving video:', error);
    return null;
  }
};

// ============================
//  CREATE POST WITH MEDIA (Image or Video)
// ============================

export const createPost = async (req, res) => {
  try {
    console.log('📝 req.body:', req.body);
    console.log('📁 req.file:', req.file);
    console.log('📁 req.files:', req.files);
    
    const {
      content, link, type, mediaType, videoWidth, videoHeight, videoDuration,
      imagePublicId, imageUrl: uploadedImageUrl,
      videoPublicId, videoUrl: uploadedVideoUrl,
    } = req.body;
    
    if (!content) {
      return res.status(400).json({ 
        success: false,
        message: 'Content is required' 
      });
    }
    
    let image = null;
    let video = null;
    let imageUrl = null;
    let videoUrl = null;
    let finalMediaType = mediaType || null;

    if (imagePublicId) {
      image = imagePublicId;
      imageUrl = uploadedImageUrl || getImageUrl(image, { resource_type: 'image' });
      finalMediaType = 'image';
    }
    if (videoPublicId) {
      video = videoPublicId;
      videoUrl = uploadedVideoUrl || getImageUrl(video, { resource_type: 'video' });
      finalMediaType = 'video';
    }
    
    // ✅ Check if it's a video upload
    if (req.file) {
      const mimetype = req.file.mimetype || '';
      const isVideo = mimetype.startsWith('video/');
      const isImage = mimetype.startsWith('image/');
      
      if (isVideo) {
        const uploadedVideo = await uploadToCloudinary(req.file, {
          folder: 'elrawda/posts',
          resource_type: 'video',
        });
        video = uploadedVideo.publicId;
        videoUrl = uploadedVideo.url;
        finalMediaType = 'video';
        console.log('🎬 Video uploaded:', video);
      } else if (isImage) {
        const uploadedImage = await uploadToCloudinary(req.file, {
          folder: 'elrawda/posts',
          resource_type: 'image',
        });
        image = uploadedImage.publicId;
        imageUrl = uploadedImage.url;
        finalMediaType = 'image';
        console.log('🖼️ Image uploaded:', image);
      }
    }
    
    // ✅ Check for image in body (Base64)
    if (!image && !video && req.body.image && req.body.image.startsWith('data:image')) {
      console.log('🖼️ Base64 image received');
      image = saveBase64Image(req.body.image, req.userId);
      if (image) {
        imageUrl = getImageUrl(req, image);
        finalMediaType = 'image';
      }
    }
    
    // ✅ Check for video in body (Base64 - not recommended)
    if (!image && !video && req.body.video && req.body.video.startsWith('data:video')) {
      return res.status(400).json({
        success: false,
        message: 'Video upload via Base64 is not supported. Use multipart/form-data instead.'
      });
    }
    
    // ✅ Store media metadata
    const metadata = {
      mediaType: finalMediaType,
      width: videoWidth ? parseInt(videoWidth) : null,
      height: videoHeight ? parseInt(videoHeight) : null,
      duration: videoDuration ? parseInt(videoDuration) : null,
    };
    
    const post = await postModel.createPost(
      req.userId,
      content,
      image || null,
      video || null,
      link || null,
      type || 'general',
      metadata
    );
    
    // ✅ Build response
    const postWithUrls = {
      ...post,
      imageUrl: imageUrl || null,
      videoUrl: videoUrl || null,
      mediaType: finalMediaType || (video ? 'video' : (image ? 'image' : null)),
      media: video ? {
        uri: videoUrl,
        width: metadata.width || 1920,
        height: metadata.height || 1080,
        duration: metadata.duration || 0,
      } : (image ? {
        uri: imageUrl,
        width: 800,
        height: 600,
      } : null),
    };
    
    console.log('✅ Post created:', postWithUrls);
    
    res.status(201).json({ success: true, post: postWithUrls });
  } catch (error) {
    console.error('❌ Create post error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to create post',
      error: error.message 
    });
  }
};

// ============================
//  CREATE POST WITH MULTIPLE IMAGES
// ============================

export const createPostWithMultipleImages = async (req, res) => {
  try {
    const { content, link, type } = req.body;
    
    if (!content) {
      return res.status(400).json({ message: 'Content is required' });
    }
    
    let images = [];
    let imageUrls = [];
    
    if (req.files && req.files.length > 0) {
      images = req.files.map(file => file.path);
      imageUrls = req.files.map(file => getImageUrl(req, file.path));
    }
    
    const image = images.length > 0 ? images[0] : null;
    const imageUrl = imageUrls.length > 0 ? imageUrls[0] : null;
    
    const post = await postModel.createPost(
      req.userId,
      content,
      image || null,
      null,
      link || null,
      type || 'text'
    );
    
    const postWithImageUrl = {
      ...post,
      imageUrl: imageUrl || null,
      allImages: imageUrls
    };
    
    res.status(201).json({ success: true, post: postWithImageUrl });
  } catch (error) {
    console.error('❌ Create post error:', error);
    res.status(500).json({ message: 'Failed to create post' });
  }
};

// ============================
//  GET ALL POSTS
// ============================

export const getPosts = async (req, res) => {
  try {
    const requestedLimit = parseInt(req.query.limit, 10) || 20;
    const limit = Math.min(Math.max(requestedLimit, 1), 10);
    const offset = parseInt(req.query.offset) || 0;
    const userId = req.userId;
    const type = req.query.type;
    
    const posts = await postModel.getPosts(limit, offset, userId, type);
    
    const postsWithUrls = posts.map(post => {
      const mediaType = post.video ? 'video' : (post.image ? 'image' : null);

      return {
        id: post.id,
        user_id: post.user_id,
        content: post.content,
        link: post.link,
        type: post.type,
        is_pinned: post.is_pinned,
        created_at: post.created_at,
        updated_at: post.updated_at,
        name: post.name,
        email: post.email,
        avatar: post.avatar,
        role: post.role,
        likes_count: post.likes_count,
        comments_count: post.comments_count,
        is_liked: post.is_liked,
        imageUrl: post.image && !post.video
          ? getImageUrl(post.image, { resource_type: 'image' })
          : null,
        videoUrl: post.video
          ? getImageUrl(post.video, { resource_type: 'video' })
          : null,
        mediaType,
        media: post.video ? {
          uri: getImageUrl(post.video, { resource_type: 'video' }),
          width: post.video_width || 1920,
          height: post.video_height || 1080,
          duration: post.video_duration || 0,
        } : (post.image ? {
          uri: getImageUrl(post.image, { resource_type: 'image' }),
          width: 800,
          height: 600,
        } : null),
      };
    });
    
    res.json({ success: true, posts: postsWithUrls, limit, offset });
  } catch (error) {
    console.error('❌ Get posts error:', error);
    res.status(500).json({ message: 'Failed to get posts' });
  }
};

// ============================
//  GET FEED
// ============================

export const getFeed = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;
    
    const posts = await postModel.getFeedPosts(req.userId, limit, offset);
    
    const postsWithUrls = posts.map(post => ({
      ...post,
      imageUrl: post.image ? getImageUrl(post.image, { resource_type: 'image' }) : null,
      videoUrl: post.video ? getImageUrl(post.video, { resource_type: 'video' }) : null,
      mediaType: post.video ? 'video' : (post.image ? 'image' : null),
      media: post.video ? {
          uri: getImageUrl(post.video, { resource_type: 'video' }),
        width: post.video_width || 1920,
        height: post.video_height || 1080,
        duration: post.video_duration || 0,
      } : (post.image ? {
          uri: getImageUrl(post.image, { resource_type: 'image' }),
        width: 800,
        height: 600,
      } : null),
    }));
    
    res.json({ success: true, posts: postsWithUrls, limit, offset });
  } catch (error) {
    console.error('❌ Get feed error:', error);
    res.status(500).json({ message: 'Failed to get feed' });
  }
};

// ============================
//  GET SINGLE POST
// ============================

export const getPost = async (req, res) => {
  try {
    const { id } = req.params;
    const post = await postModel.getPostById(id, req.userId);
    
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }
    
    const postWithUrls = {
      ...post,
      imageUrl: post.image ? getImageUrl(post.image, { resource_type: 'image' }) : null,
      videoUrl: post.video ? getImageUrl(post.video, { resource_type: 'video' }) : null,
      mediaType: post.video ? 'video' : (post.image ? 'image' : null),
      media: post.video ? {
        uri: getImageUrl(post.video, { resource_type: 'video' }),
        width: post.video_width || 1920,
        height: post.video_height || 1080,
        duration: post.video_duration || 0,
      } : (post.image ? {
        uri: getImageUrl(post.image, { resource_type: 'image' }),
        width: 800,
        height: 600,
      } : null),
    };
    
    res.json({ success: true, post: postWithUrls });
  } catch (error) {
    console.error('❌ Get post error:', error);
    res.status(500).json({ message: 'Failed to get post' });
  }
};

// ============================
//  GET MY POSTS
// ============================

export const getMyPosts = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;
    
    const posts = await postModel.getPostsByUser(req.userId, limit, offset);
    
    const postsWithUrls = posts.map(post => ({
      ...post,
      imageUrl: post.image ? getImageUrl(req, post.image) : null,
      videoUrl: post.video ? getImageUrl(req, post.video) : null,
      mediaType: post.video ? 'video' : (post.image ? 'image' : null),
      media: post.video ? {
        uri: getImageUrl(req, post.video),
        width: post.video_width || 1920,
        height: post.video_height || 1080,
        duration: post.video_duration || 0,
      } : (post.image ? {
        uri: getImageUrl(req, post.image),
        width: 800,
        height: 600,
      } : null),
    }));
    
    res.json({ success: true, posts: postsWithUrls, limit, offset });
  } catch (error) {
    console.error('❌ Get my posts error:', error);
    res.status(500).json({ message: 'Failed to get your posts' });
  }
};

// ============================
//  GET USER POSTS
// ============================

export const getUserPosts = async (req, res) => {
  try {
    const { userId } = req.params;
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;
    
    const posts = await postModel.getPostsByUser(userId, limit, offset);
    
    const postsWithUrls = posts.map(post => ({
      ...post,
      imageUrl: post.image ? getImageUrl(req, post.image) : null,
      videoUrl: post.video ? getImageUrl(req, post.video) : null,
      mediaType: post.video ? 'video' : (post.image ? 'image' : null),
      media: post.video ? {
        uri: getImageUrl(req, post.video),
        width: post.video_width || 1920,
        height: post.video_height || 1080,
        duration: post.video_duration || 0,
      } : (post.image ? {
        uri: getImageUrl(req, post.image),
        width: 800,
        height: 600,
      } : null),
    }));
    
    res.json({ success: true, posts: postsWithUrls, limit, offset });
  } catch (error) {
    console.error('❌ Get user posts error:', error);
    res.status(500).json({ message: 'Failed to get user posts' });
  }
};

// ============================
//  UPDATE POST
// ============================

export const updatePost = async (req, res) => {
  try {
    const { id } = req.params;
    const { content } = req.body;
    
    if (!content) {
      return res.status(400).json({ message: 'Content is required' });
    }
    
    const post = await postModel.getPostById(id);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }
    
    if (post.user_id !== req.userId) {
      return res.status(403).json({ message: 'Not authorized to edit this post' });
    }
    
    let image = post.image;
    let imageUrl = post.image ? getImageUrl(req, post.image) : null;
    
    if (req.file) {
      if (post.image) {
        await deleteOldImage(post.image);
      }
      image = req.file.path;
      imageUrl = getImageUrl(req, image);
    } else if (req.body.image && req.body.image.startsWith('data:image')) {
      if (post.image) {
        await deleteOldImage(post.image);
      }
      image = saveBase64Image(req.body.image, req.userId);
      if (image) {
        imageUrl = getImageUrl(req, image);
      }
    }
    
    const updated = await postModel.updatePost(id, content, image);
    
    const postWithImageUrl = {
      ...updated,
      imageUrl: imageUrl || null
    };
    
    res.json({ success: true, post: postWithImageUrl });
  } catch (error) {
    console.error('❌ Update post error:', error);
    res.status(500).json({ message: 'Failed to update post' });
  }
};

// ============================
//  DELETE POST
// ============================

export const deletePost = async (req, res) => {
  try {
    const { id } = req.params;
    
    const post = await postModel.getPostById(id);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }
    
    if (post.user_id !== req.userId) {
      return res.status(403).json({ message: 'Not authorized to delete this post' });
    }
    
    if (post.image) {
      await deleteOldImage(post.image);
    }
    if (post.video) {
      await deleteOldImage(post.video);
    }
    
    await postModel.deletePost(id);
    res.json({ success: true, message: 'Post deleted successfully' });
  } catch (error) {
    console.error('❌ Delete post error:', error);
    res.status(500).json({ message: 'Failed to delete post' });
  }
};

// ============================
//  TOGGLE PIN
// ============================

export const togglePinPost = async (req, res) => {
  try {
    const { id } = req.params;
    
    const post = await postModel.getPostById(id);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }
    
    if (post.user_id !== req.userId) {
      return res.status(403).json({ message: 'Not authorized to pin this post' });
    }
    
    const updated = await postModel.togglePinPost(id);
    res.json({ success: true, post: updated });
  } catch (error) {
    console.error('❌ Toggle pin error:', error);
    res.status(500).json({ message: 'Failed to toggle pin' });
  }
};

// ============================
//  SEARCH POSTS
// ============================

export const searchPosts = async (req, res) => {
  try {
    const { q } = req.query;
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;
    
    if (!q) {
      return res.status(400).json({ message: 'Search query is required' });
    }
    
    const posts = await postModel.searchPosts(q, limit, offset);
    
    const postsWithUrls = posts.map(post => ({
      ...post,
      imageUrl: post.image ? getImageUrl(req, post.image) : null,
      videoUrl: post.video ? getImageUrl(req, post.video) : null,
      mediaType: post.video ? 'video' : (post.image ? 'image' : null),
      media: post.video ? {
        uri: getImageUrl(req, post.video),
        width: post.video_width || 1920,
        height: post.video_height || 1080,
        duration: post.video_duration || 0,
      } : (post.image ? {
        uri: getImageUrl(req, post.image),
        width: 800,
        height: 600,
      } : null),
    }));
    
    res.json({ success: true, posts: postsWithUrls, limit, offset });
  } catch (error) {
    console.error('❌ Search posts error:', error);
    res.status(500).json({ message: 'Failed to search posts' });
  }
};

// ============================
//  TOGGLE LIKE
// ============================

export const toggleLike = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await likeModel.toggleLike(id, req.userId);
    const count = await likeModel.getLikeCount(id);
    
    res.json({ 
      success: true, 
      liked: result.liked, 
      likes_count: count 
    });
  } catch (error) {
    console.error('❌ Toggle like error:', error);
    res.status(500).json({ message: 'Failed to toggle like' });
  }
};