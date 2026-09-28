// backend/routes/liveAudioRoutes.js
import express from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth.js';
import requireCircleMember from '../middleware/requireCircleMember.js';
import requireCircleSheikh from '../middleware/requireCircleSheikh.js';

import * as ctrl from '../controllers/liveAudioController.js';

// 50 MB cap on recording uploads — a 1-hour session at 64 kbps is ~28 MB.
const recordingUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

const router = express.Router();

// Everything below requires auth.
router.use(authenticate);

// ============================================================
//  CIRCLE-SCOPED ROUTES
// ============================================================

// Create a new session (sheikh only — enforced inside the controller).
router.post('/circles/:circleId/live', requireCircleSheikh, ctrl.createSession);

// List sessions for a circle (paginated).
router.get('/circles/:circleId/live', requireCircleMember, ctrl.listSessions);

// Quick-poll: is there a live session right now?
router.get('/circles/:circleId/live/active', requireCircleMember, ctrl.getActiveForCircle);

// ============================================================
//  SESSION-SCOPED ROUTES
// ============================================================

// General info (members + sheikh can view).
router.get('/live/:sessionId', requireCircleMember, ctrl.getSession);

// Sheikh starts the broadcast.
router.post('/live/:sessionId/start', requireCircleSheikh, ctrl.startSession);

// Student (or sheikh) joins.
router.post('/live/:sessionId/join', requireCircleMember, ctrl.joinSession);

// Refresh token before expiry.
router.post('/live/:sessionId/token', requireCircleMember, ctrl.refreshToken);

// Leave.
router.post('/live/:sessionId/leave', requireCircleMember, ctrl.leaveSession);

// End (sheikh only).
router.post('/live/:sessionId/end', requireCircleSheikh, ctrl.endSession);

// Update summary post-hoc (sheikh only).
router.put('/live/:sessionId/summary', requireCircleSheikh, ctrl.updateSummary);

// Participants list.
router.get('/live/:sessionId/participants', requireCircleMember, ctrl.listParticipants);

// Raise-hand (anyone can raise their own; sheikh promotes them).
router.post('/live/:sessionId/raise-hand', requireCircleMember, ctrl.raiseHand);

// Sheikh accepts/rejects.
router.post(
  '/live/:sessionId/accept/:userId',
  requireCircleSheikh,
  ctrl.acceptSpeaker
);
router.post(
  '/live/:sessionId/reject/:userId',
  requireCircleSheikh,
  ctrl.rejectSpeaker
);

// Sheikh mutes / kicks.
router.post(
  '/live/:sessionId/mute/:userId',
  requireCircleSheikh,
  ctrl.muteParticipant
);
router.post(
  '/live/:sessionId/kick/:userId',
  requireCircleSheikh,
  ctrl.kickParticipant
);

// Notes (sheikh only).
router.post(
  '/live/:sessionId/note/:studentId',
  requireCircleSheikh,
  ctrl.upsertNote
);
router.get('/live/:sessionId/notes', requireCircleSheikh, ctrl.listNotes);

// Recording upload (sheikh only, multipart).
router.post(
  '/live/:sessionId/recording',
  requireCircleSheikh,
  recordingUpload.single('audio'),
  ctrl.uploadRecording
);

// History (members + sheikh).
router.get('/live/:sessionId/history', requireCircleMember, ctrl.getHistory);

export default router;