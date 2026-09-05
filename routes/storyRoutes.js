// backend/routes/storyRoutes.js
import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { upload, handleUploadError } from '../middleware/upload.js';
import * as storyController from '../controllers/storyController.js';

const router = express.Router();

// ✅ جميع routes تحتاج توثيق
router.use(authenticate);

// ✅ إنشاء ستوري مع صورة
router.post(
  '/',
  upload.single('image'),
  handleUploadError,
  storyController.createStory
);

// ✅ GET routes
router.get('/', storyController.getStories);
router.get('/user/:userId', storyController.getUserStories);
router.get('/:id', storyController.getStory);

// ✅ DELETE route
router.delete('/:id', storyController.deleteStory);

// ✅ VIEW story (mark as viewed)
router.post('/:id/view', storyController.viewStory);

// ✅ GET story views (for owner only)
router.get('/:id/views', storyController.getStoryViews);

export default router;