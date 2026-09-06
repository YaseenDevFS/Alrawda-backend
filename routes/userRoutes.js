// src/routes/userRoutes.js
import express from 'express';
import { authenticate } from '../middleware/auth.js';
import * as userController from '../controllers/userController.js';

const router = express.Router();

router.use(authenticate);

// ✅ الطريقة الصحيحة - استخدام route منفصل
router.get('/profile', userController.getProfile);           // جلب ملفي الشخصي
router.get('/profile/:userId', userController.getProfile);   // جلب ملف مستخدم آخر
router.get('/directory', userController.getAllUsers);

// أو استخدم route واحد مع معالجة يدوية
// router.get('/profile/:userId?', (req, res) => {
//   const userId = req.params.userId || req.userId;
//   userController.getProfile(req, res);
// });

router.put('/profile', userController.updateProfile);
router.post('/:userId/follow', userController.follow);
router.delete('/:userId/unfollow', userController.unfollow);
router.get('/:userId/followers', userController.getFollowers);
router.get('/:userId/following', userController.getFollowing);

export default router;