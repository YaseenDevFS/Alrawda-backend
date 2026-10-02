// backend/routes/gamificationRoutes.js
//
// Authenticated, server-authoritative gamification endpoints.

import express from 'express';
import { authenticate } from '../middleware/auth.js';
import * as controller from '../controllers/gamificationController.js';

const router = express.Router();

router.use(authenticate);

// Never accept client snapshots for XP, level or coins.
router.post('/sync', controller.rejectLegacySync);

router.get('/me', controller.getMyGamification);
router.get('/catalog', controller.getShopCatalog);
router.get('/inventory', controller.getInventory);
router.post('/activity', controller.recordActivity);
router.post('/daily-reward/claim', controller.claimDailyReward);
router.post('/radio/start', controller.startRadioListening);
router.post('/quran-audio/start', controller.startQuranAudioSession);
router.post('/quran-page/start', controller.startQuranPageSession);
router.post('/shop/purchase', controller.purchaseShopItem);
router.post('/inventory/equip', controller.equipItem);
router.put('/profile/preferences', controller.updatePublicPreferences);

// Fetch another user's public gamification data. Returns only the
// fields the *viewed* user has marked as visible.
router.get('/users/:userId', controller.getViewerGamification);

export default router;