// src/routes/commentRoutes.js
import express from 'express';
import { authenticate } from '../middleware/auth.js';
import * as commentController from '../controllers/commentController.js';

const router = express.Router();

router.use(authenticate);

router.post('/post/:postId', commentController.createComment);
router.get('/post/:postId', commentController.getComments);
router.get('/:commentId/replies', commentController.getReplies);
router.put('/:commentId', commentController.updateComment);
router.delete('/:commentId', commentController.deleteComment);

export default router;