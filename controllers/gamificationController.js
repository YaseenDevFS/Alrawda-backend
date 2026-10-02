// backend/controllers/gamificationController.js
//
// HTTP handlers for the gamification sync + read paths.

import * as gamificationModel from '../models/gamificationModel.js';

export const syncGamification = async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    const payload = req.body || {};
    const saved = await gamificationModel.upsertGamification(userId, payload);
    res.json({ success: true, gamification: saved });
  } catch (e) {
    console.error('syncGamification error:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

export const getViewerGamification = async (req, res) => {
  try {
    const viewedUserId = parseInt(req.params.userId, 10);
    const viewerUserId = req.userId;
    if (!viewedUserId || Number.isNaN(viewedUserId)) {
      return res.status(400).json({ success: false, message: 'Invalid userId' });
    }
    if (!viewerUserId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    const data = await gamificationModel.getGamificationForViewer(
      viewedUserId,
      viewerUserId,
    );
    res.json({ success: true, gamification: data });
  } catch (e) {
    console.error('getViewerGamification error:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

export const getMyGamification = async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    const data = await gamificationModel.getOwnGamification(userId);
    res.json({ success: true, gamification: data });
  } catch (e) {
    console.error('getMyGamification error:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

export default {
  syncGamification,
  getViewerGamification,
  getMyGamification,
};