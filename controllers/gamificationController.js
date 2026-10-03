import * as gamificationModel from '../models/gamificationModel.js';
import * as gamificationEngine from '../services/gamificationEngine.js';

const sendError = (res, error) => {
  const status = Number(error?.status) || 500;
  if (status >= 500) console.error('gamification request failed:', error);
  return res.status(status).json({
    success: false,
    code: error?.code || 'GAMIFICATION_REQUEST_FAILED',
    message: status >= 500 ? 'Gamification service is unavailable.' : error.message,
  });
};

export const rejectLegacySync = (_req, res) => res.status(410).json({
  success: false,
  code: 'AUTHORITATIVE_API_REQUIRED',
  message: 'Client-authoritative gamification sync has been removed.',
});

export const getMyGamification = async (req, res) => {
  try {
    res.json({ success: true, gamification: await gamificationEngine.getGamificationSnapshot(req.userId) });
  } catch (error) {
    sendError(res, error);
  }
};

export const recordActivity = async (req, res) => {
  try {
    const event = req.body || {};
    res.json(await gamificationEngine.recordActivity(req.userId, {
      type: event.type,
      activityId: event.activityId,
      metadata: event.metadata,
    }));
  } catch (error) {
    sendError(res, error);
  }
};

export const claimDailyReward = async (req, res) => {
  try {
    res.json(await gamificationEngine.claimDailyReward(req.userId));
  } catch (error) {
    sendError(res, error);
  }
};

export const startRadioListening = async (req, res) => {
  try {
    res.json(await gamificationEngine.startRadioListening(req.userId, req.body || {}));
  } catch (error) {
    sendError(res, error);
  }
};

export const startQuranAudioSession = async (req, res) => {
  try {
    res.json(await gamificationEngine.startQuranAudioSession(req.userId, req.body || {}));
  } catch (error) {
    sendError(res, error);
  }
};

export const startQuranPageSession = async (req, res) => {
  try {
    res.json(await gamificationEngine.startQuranPageSession(req.userId, req.body || {}));
  } catch (error) {
    sendError(res, error);
  }
};

export const getShopCatalog = async (_req, res) => {
  try {
    const products = await gamificationEngine.getCatalog();
    res.json({ success: true, products });
  } catch (error) {
    sendError(res, error);
  }
};

export const purchaseShopItem = async (req, res) => {
  try {
    res.json(await gamificationEngine.purchaseShopItem(req.userId, req.body?.itemId, req.body?.idempotencyKey));
  } catch (error) {
    sendError(res, error);
  }
};

export const equipItem = async (req, res) => {
  try {
    if (req.body?.equippedItems && typeof req.body.equippedItems === 'object') {
      res.json(await gamificationEngine.equipInventoryItems(req.userId, req.body.equippedItems));
      return;
    }
    res.json(await gamificationEngine.equipInventoryItem(req.userId, req.body?.slot, req.body?.itemId ?? null));
  } catch (error) {
    sendError(res, error);
  }
};

export const getInventory = async (req, res) => {
  try {
    res.json({ success: true, inventory: await gamificationEngine.getInventory(req.userId) });
  } catch (error) {
    sendError(res, error);
  }
};

export const updatePublicPreferences = async (req, res) => {
  try {
    res.json(await gamificationEngine.updatePublicPreferences(req.userId, req.body || {}));
  } catch (error) {
    sendError(res, error);
  }
};

export const getViewerGamification = async (req, res) => {
  try {
    const viewedUserId = Number.parseInt(req.params.userId, 10);
    if (!Number.isInteger(viewedUserId) || viewedUserId <= 0) {
      return res.status(400).json({ success: false, code: 'INVALID_USER_ID', message: 'Invalid userId' });
    }
    res.json({
      success: true,
      gamification: await gamificationModel.getGamificationForViewer(viewedUserId, req.userId),
    });
  } catch (error) {
    sendError(res, error);
  }
};

export default {
  rejectLegacySync,
  getMyGamification,
  recordActivity,
  claimDailyReward,
  startRadioListening,
  startQuranAudioSession,
  startQuranPageSession,
  getShopCatalog,
  purchaseShopItem,
  equipItem,
  getInventory,
  updatePublicPreferences,
  getViewerGamification,
};
