// backend/routes/postRoutes.js

import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { upload, handleUploadError } from '../middleware/upload.js';
import * as postController from '../controllers/postController.js';

const router = express.Router();

// ✅ All routes require authentication
router.use(authenticate);

// ✅ Create post with media - using 'media' field name
router.post(
  '/',
  upload.single('media'),
  handleUploadError,
  postController.createPost
);

// ✅ GET routes
router.get('/', postController.getPosts);
router.get('/feed', postController.getFeed);
router.get('/my', postController.getMyPosts);
router.get('/user/:userId', postController.getUserPosts);
router.get('/search', postController.searchPosts);
router.get('/:id', postController.getPost);

// ✅ UPDATE route
router.put(
  '/:id',
  upload.single('media'),
  handleUploadError,
  postController.updatePost
);

// ✅ DELETE route
router.delete('/:id', postController.deletePost);

// ✅ PIN route
router.put('/:id/pin', postController.togglePinPost);

// ✅ LIKE route
router.post('/:id/like', postController.toggleLike);

export default router;