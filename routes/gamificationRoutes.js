// backend/routes/gamificationRoutes.js
//
// Routes for gamification sync + public profile gamification read.

import express from 'express';
import { authenticate } from '../middleware/auth.js';
import * as controller from '../controllers/gamificationController.js';

const router = express.Router();

router.use(authenticate);

// Push the local gamification state to the server. Called by the
// frontend whenever XP / coins / equipped / featured / privacy changes
// (debounced inside the frontend sync service).
router.post('/sync', controller.syncGamification);

// Fetch another user's public gamification data. Returns only the
// fields the *viewed* user has marked as visible.
router.get('/users/:userId', controller.getViewerGamification);

// Fetch the calling user's own row (used for re-syncing on first load).
router.get('/me', controller.getMyGamification);

export default router;