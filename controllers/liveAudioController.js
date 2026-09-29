// backend/controllers/liveAudioController.js
//
// REST endpoints for live audio sessions: create, start, join, leave,
// end, raise-hand accept/reject, mute, kick, notes, recording upload.
//
// Convention: every response is `{ success: true, data: ... }` on
// success and `{ success: false, message, code }` on failure, to match
// the rest of the API.

import * as liveAudioModel from '../models/liveAudioModel.js';
import { safeGenerateRtcToken, uidForUser, isAgoraReady } from '../services/agoraTokenService.js';

const ok = (res, data, status = 200) => res.status(status).json({ success: true, ...data });
const fail = (res, message, status = 400, code = `HTTP_${status}`) =>
  res.status(status).json({ success: false, message, code });

// Sanitize a base string so we can build a safe Agora channel name
// (only letters, numbers, dashes, underscores; max 64 chars).
const buildChannelName = (circleId) => {
  const suffix = Math.random().toString(36).slice(2, 8);
  return `alrawda_circle_${circleId}_${suffix}`.slice(0, 64);
};

// ============================================================
//  POST /api/circles/:circleId/live   — create session (sheikh)
// ============================================================
export const createSession = async (req, res) => {
  try {
    const circleId = parseInt(req.params.circleId, 10);
    if (!circleId) return fail(res, 'Invalid circle id.', 400, 'BAD_ID');

    const { lessonType, audioQuality, title, scheduledAt } = req.body || {};

    if (req.userAccountType !== 'sheikh') {
      return fail(res, 'Only teachers can create live sessions.', 403, 'NOT_SHEIKH');
    }

    // Make sure there's no other live session for this circle right now.
    const active = await liveAudioModel.listSessionsByCircle({ circleId, status: 'live', limit: 1 });
    if (active[0]) {
      return fail(
        res,
        'This circle already has a live session in progress.',
        409,
        'ALREADY_LIVE'
      );
    }

    const channelName = buildChannelName(circleId);
    const created = await liveAudioModel.createSession({
      circleId,
      sheikhId: req.userId,
      lessonType: lessonType || 'memorize',
      audioQuality: audioQuality || 64,
      title: title || null,
      channelName,
      scheduledAt: scheduledAt || null,
    });

    await liveAudioModel.logEvent({
      sessionId: created.id,
      userId: req.userId,
      eventType: 'created',
      metadata: { lessonType: created.lesson_type },
    });

    const session = await liveAudioModel.findSessionById(created.id);
    return ok(res, { session }, 201);
  } catch (error) {
    console.error('❌ createSession error:', error);
    return fail(res, 'Could not create the live session.', 500, 'CREATE_FAILED');
  }
};

// ============================================================
//  GET /api/circles/:circleId/live    — list sessions for a circle
// ============================================================
export const listSessions = async (req, res) => {
  try {
    const circleId = parseInt(req.params.circleId, 10);
    if (!circleId) return fail(res, 'Invalid circle id.', 400, 'BAD_ID');

    const result = await liveAudioModel.listSessionsByCircle({
      circleId,
      status: req.query.status,
      limit: Math.min(parseInt(req.query.limit, 10) || 20, 50),
      offset: parseInt(req.query.offset, 10) || 0,
    });
    return ok(res, { sessions: result });
  } catch (error) {
    console.error('❌ listSessions error:', error);
    return fail(res, 'Could not load sessions.', 500, 'LIST_FAILED');
  }
};

// ============================================================
//  GET /api/live/:sessionId           — session details
// ============================================================
export const getSession = async (req, res) => {
  try {
    const id = parseInt(req.params.sessionId, 10);
    if (!id) return fail(res, 'Invalid session id.', 400, 'BAD_ID');

    const session = await liveAudioModel.findSessionById(id);
    if (!session) return fail(res, 'Session not found.', 404, 'NOT_FOUND');

    const participants = await liveAudioModel.listParticipants({ sessionId: id, onlyActive: true });

    return ok(res, { session, participants });
  } catch (error) {
    console.error('❌ getSession error:', error);
    return fail(res, 'Could not load this session.', 500, 'GET_FAILED');
  }
};

// ============================================================
//  POST /api/live/:sessionId/start    — sheikh starts broadcasting
// ============================================================
export const startSession = async (req, res) => {
  try {
    const id = parseInt(req.params.sessionId, 10);
    if (!id) return fail(res, 'Invalid session id.', 400, 'BAD_ID');

    const session = await liveAudioModel.findSessionById(id);
    if (!session) return fail(res, 'Session not found.', 404, 'NOT_FOUND');
    if (session.sheikhId !== req.userId) {
      return fail(res, 'Only the session teacher can start it.', 403, 'NOT_SHEIKH');
    }
    if (session.status === 'ended' || session.status === 'cancelled') {
      return fail(res, `This session is ${session.status}.`, 400, 'FINALIZED');
    }

    await liveAudioModel.startSession(id, req.userId);
    await liveAudioModel.upsertParticipant({
      sessionId: id,
      userId: req.userId,
      role: 'sheikh',
    });
    await liveAudioModel.logEvent({ sessionId: id, userId: req.userId, eventType: 'started' });

    const tokenData = safeGenerateRtcToken({
      channelName: session.channelName,
      userId: req.userId,
      role: 'publisher',
    });

    const fresh = await liveAudioModel.findSessionById(id);
    return ok(res, {
      session: fresh,
      token: tokenData.token,
      uid: tokenData.uid,
      expiresAt: tokenData.expiresAt,
      channelName: session.channelName,
      role: 'sheikh',
      isDemo: !!tokenData.isDemo,
      liveAudioReady: isAgoraReady(),
    });
  } catch (error) {
    console.error('❌ startSession error:', error);
    if (error.code === 'AGORA_MISCONFIGURED') {
      return fail(res, error.message, 503, 'AGORA_MISCONFIGURED');
    }
    return fail(res, 'Could not start the session.', 500, 'START_FAILED');
  }
};

// ============================================================
//  POST /api/live/:sessionId/join     — student joins
// ============================================================
export const joinSession = async (req, res) => {
  try {
    const id = parseInt(req.params.sessionId, 10);
    if (!id) return fail(res, 'Invalid session id.', 400, 'BAD_ID');

    const session = await liveAudioModel.findSessionById(id);
    if (!session) return fail(res, 'Session not found.', 404, 'NOT_FOUND');
    if (session.status !== 'live') {
      return fail(res, `This session is not live (status: ${session.status}).`, 400, 'NOT_LIVE');
    }

    // Sheikh auto-promotes himself; everyone else starts as audience.
    const role = session.sheikhId === req.userId ? 'sheikh' : 'audience';

    await liveAudioModel.upsertParticipant({ sessionId: id, userId: req.userId, role });
    await liveAudioModel.incrementPeakAttendees(id);
    await liveAudioModel.logEvent({ sessionId: id, userId: req.userId, eventType: 'joined' });

    const tokenData = safeGenerateRtcToken({
      channelName: session.channelName,
      userId: req.userId,
      role: role === 'sheikh' ? 'publisher' : 'subscriber',
    });

    return ok(res, {
      token: tokenData.token,
      uid: tokenData.uid,
      expiresAt: tokenData.expiresAt,
      channelName: session.channelName,
      role,
      sessionId: id,
      isDemo: !!tokenData.isDemo,
      liveAudioReady: isAgoraReady(),
    });
  } catch (error) {
    console.error('❌ joinSession error:', error);
    if (error.code === 'AGORA_MISCONFIGURED') {
      return fail(res, error.message, 503, 'AGORA_MISCONFIGURED');
    }
    return fail(res, 'Could not join the session.', 500, 'JOIN_FAILED');
  }
};

// ============================================================
//  POST /api/live/:sessionId/token    — refresh token
// ============================================================
export const refreshToken = async (req, res) => {
  try {
    const id = parseInt(req.params.sessionId, 10);
    if (!id) return fail(res, 'Invalid session id.', 400, 'BAD_ID');

    const session = await liveAudioModel.findSessionById(id);
    if (!session) return fail(res, 'Session not found.', 404, 'NOT_FOUND');

    const isTeacher = session.sheikhId === req.userId;
    const participant = await liveAudioModel.findParticipant({ sessionId: id, userId: req.userId });
    if (!isTeacher && !participant) {
      return fail(res, 'You must join the session before requesting a token.', 403, 'NOT_A_MEMBER');
    }

    const role = isTeacher || participant?.role === 'speaker' ? 'publisher' : 'subscriber';
    const tokenData = safeGenerateRtcToken({
      channelName: session.channelName,
      userId: req.userId,
      role,
    });
    return ok(res, {
      token: tokenData.token,
      uid: tokenData.uid,
      expiresAt: tokenData.expiresAt,
      channelName: session.channelName,
      role,
      isDemo: !!tokenData.isDemo,
      liveAudioReady: isAgoraReady(),
    });
  } catch (error) {
    console.error('❌ refreshToken error:', error);
    if (error.code === 'AGORA_MISCONFIGURED') {
      return fail(res, error.message, 503, 'AGORA_MISCONFIGURED');
    }
    return fail(res, 'Could not refresh the token.', 500, 'TOKEN_FAILED');
  }
};

// ============================================================
//  POST /api/live/:sessionId/leave    — anyone leaves
// ============================================================
export const leaveSession = async (req, res) => {
  try {
    const id = parseInt(req.params.sessionId, 10);
    if (!id) return fail(res, 'Invalid session id.', 400, 'BAD_ID');

    const { spokeSeconds = 0 } = req.body || {};

    await liveAudioModel.markParticipantLeft({
      sessionId: id,
      userId: req.userId,
      spokeSeconds,
    });
    await liveAudioModel.setActualAttendees(id);
    await liveAudioModel.logEvent({ sessionId: id, userId: req.userId, eventType: 'left' });

    return ok(res, { message: 'You have left the session.' });
  } catch (error) {
    console.error('❌ leaveSession error:', error);
    return fail(res, 'Could not leave the session.', 500, 'LEAVE_FAILED');
  }
};

// ============================================================
//  POST /api/live/:sessionId/end      — sheikh ends
// ============================================================
export const endSession = async (req, res) => {
  try {
    const id = parseInt(req.params.sessionId, 10);
    if (!id) return fail(res, 'Invalid session id.', 400, 'BAD_ID');

    const { summary } = req.body || {};
    const ended = await liveAudioModel.endSession(id, req.userId, { summary });
    if (!ended) return fail(res, 'You are not the teacher of this session.', 404, 'NOT_FOUND');

    await liveAudioModel.setActualAttendees(id);
    await liveAudioModel.logEvent({
      sessionId: id,
      userId: req.userId,
      eventType: 'ended',
      metadata: summary ? { summary } : null,
    });

    const fresh = await liveAudioModel.findSessionById(id);
    return ok(res, { session: fresh, message: 'Session ended.' });
  } catch (error) {
    console.error('❌ endSession error:', error);
    return fail(res, 'Could not end the session.', 500, 'END_FAILED');
  }
};

// ============================================================
//  PUT  /api/live/:sessionId/summary  — sheikh updates summary post-hoc
// ============================================================
export const updateSummary = async (req, res) => {
  try {
    const id = parseInt(req.params.sessionId, 10);
    if (!id) return fail(res, 'Invalid session id.', 400, 'BAD_ID');
    const { summary } = req.body || {};
    if (typeof summary !== 'string') {
      return fail(res, 'summary must be a string.', 400, 'VALIDATION');
    }
    const updated = await liveAudioModel.updateSessionSummary(id, req.userId, summary);
    if (!updated) return fail(res, 'You are not the teacher of this session.', 404, 'NOT_FOUND');
    return ok(res, { session: updated });
  } catch (error) {
    console.error('❌ updateSummary error:', error);
    return fail(res, 'Could not update the summary.', 500, 'UPDATE_FAILED');
  }
};

// ============================================================
//  POST /api/live/:sessionId/raise-hand  (student → server)
//  POST /api/live/:sessionId/accept/:userId (sheikh → server)
//  POST /api/live/:sessionId/reject/:userId
//  POST /api/live/:sessionId/mute/:userId   (body: { muted: true|false })
//  POST /api/live/:sessionId/kick/:userId
// ============================================================
export const raiseHand = async (req, res) => {
  try {
    const id = parseInt(req.params.sessionId, 10);
    if (!id) return fail(res, 'Invalid session id.', 400, 'BAD_ID');

    const updated = await liveAudioModel.setParticipantRaisedHand({
      sessionId: id,
      userId: req.userId,
      raised: true,
    });
    if (!updated) return fail(res, 'You are not a participant of this session.', 404, 'NOT_A_MEMBER');

    await liveAudioModel.logEvent({
      sessionId: id,
      userId: req.userId,
      eventType: 'raised_hand',
    });
    return ok(res, { participant: updated });
  } catch (error) {
    console.error('❌ raiseHand error:', error);
    return fail(res, 'Could not raise your hand.', 500, 'RAISE_FAILED');
  }
};

export const acceptSpeaker = async (req, res) => {
  try {
    const id = parseInt(req.params.sessionId, 10);
    const userId = parseInt(req.params.userId, 10);
    if (!id || !userId) return fail(res, 'Invalid ids.', 400, 'BAD_ID');

    const session = await liveAudioModel.findSessionById(id);
    if (!session) return fail(res, 'Session not found.', 404, 'NOT_FOUND');
    if (session.sheikhId !== req.userId) {
      return fail(res, 'Only the teacher can accept speakers.', 403, 'NOT_SHEIKH');
    }

    const updated = await liveAudioModel.setParticipantRole({
      sessionId: id,
      userId,
      role: 'speaker',
    });
    await liveAudioModel.setParticipantRaisedHand({ sessionId: id, userId, raised: false });
    await liveAudioModel.setParticipantMuted({ sessionId: id, userId, muted: false });

    await liveAudioModel.logEvent({
      sessionId: id,
      userId: req.userId,
      eventType: 'accepted',
      metadata: { studentId: userId },
    });

    // Generate a publisher token for the newly-promoted speaker.
    const tokenData = safeGenerateRtcToken({
      channelName: session.channelName,
      userId,
      role: 'publisher',
    });

    return ok(res, {
      participant: updated,
      token: tokenData.token,
      uid: tokenData.uid,
      expiresAt: tokenData.expiresAt,
      isDemo: !!tokenData.isDemo,
      liveAudioReady: isAgoraReady(),
    });
  } catch (error) {
    console.error('❌ acceptSpeaker error:', error);
    if (error.code === 'AGORA_MISCONFIGURED') {
      return fail(res, error.message, 503, 'AGORA_MISCONFIGURED');
    }
    return fail(res, 'Could not accept the speaker.', 500, 'ACCEPT_FAILED');
  }
};

export const rejectSpeaker = async (req, res) => {
  try {
    const id = parseInt(req.params.sessionId, 10);
    const userId = parseInt(req.params.userId, 10);
    if (!id || !userId) return fail(res, 'Invalid ids.', 400, 'BAD_ID');

    const session = await liveAudioModel.findSessionById(id);
    if (!session || session.sheikhId !== req.userId) {
      return fail(res, 'Only the teacher can reject speakers.', 403, 'NOT_SHEIKH');
    }

    const updated = await liveAudioModel.setParticipantRaisedHand({
      sessionId: id,
      userId,
      raised: false,
    });
    await liveAudioModel.logEvent({
      sessionId: id,
      userId: req.userId,
      eventType: 'rejected',
      metadata: { studentId: userId },
    });
    return ok(res, { participant: updated });
  } catch (error) {
    console.error('❌ rejectSpeaker error:', error);
    return fail(res, 'Could not reject the speaker.', 500, 'REJECT_FAILED');
  }
};

export const muteParticipant = async (req, res) => {
  try {
    const id = parseInt(req.params.sessionId, 10);
    const userId = parseInt(req.params.userId, 10);
    if (!id || !userId) return fail(res, 'Invalid ids.', 400, 'BAD_ID');

    const { muted = true } = req.body || {};
    const session = await liveAudioModel.findSessionById(id);
    if (!session || session.sheikhId !== req.userId) {
      return fail(res, 'Only the teacher can mute.', 403, 'NOT_SHEIKH');
    }

    const updated = await liveAudioModel.setParticipantMuted({
      sessionId: id,
      userId,
      muted: !!muted,
    });
    // Muting also demotes them back to audience (they can't publish anymore).
    if (muted) {
      await liveAudioModel.setParticipantRole({
        sessionId: id,
        userId,
        role: 'audience',
      });
    }
    await liveAudioModel.logEvent({
      sessionId: id,
      userId: req.userId,
      eventType: muted ? 'muted' : 'unmuted',
      metadata: { studentId: userId },
    });
    return ok(res, { participant: updated });
  } catch (error) {
    console.error('❌ muteParticipant error:', error);
    return fail(res, 'Could not change mute state.', 500, 'MUTE_FAILED');
  }
};

export const kickParticipant = async (req, res) => {
  try {
    const id = parseInt(req.params.sessionId, 10);
    const userId = parseInt(req.params.userId, 10);
    if (!id || !userId) return fail(res, 'Invalid ids.', 400, 'BAD_ID');

    const session = await liveAudioModel.findSessionById(id);
    if (!session || session.sheikhId !== req.userId) {
      return fail(res, 'Only the teacher can kick.', 403, 'NOT_SHEIKH');
    }

    const updated = await liveAudioModel.kickParticipant({ sessionId: id, userId });
    if (!updated) return fail(res, 'Participant not found.', 404, 'NOT_FOUND');

    await liveAudioModel.setActualAttendees(id);
    await liveAudioModel.logEvent({
      sessionId: id,
      userId: req.userId,
      eventType: 'kicked',
      metadata: { studentId: userId },
    });

    return ok(res, { participant: updated, message: 'Participant removed.' });
  } catch (error) {
    console.error('❌ kickParticipant error:', error);
    return fail(res, 'Could not remove participant.', 500, 'KICK_FAILED');
  }
};

// ============================================================
//  GET   /api/live/:sessionId/participants
// ============================================================
export const listParticipants = async (req, res) => {
  try {
    const id = parseInt(req.params.sessionId, 10);
    if (!id) return fail(res, 'Invalid session id.', 400, 'BAD_ID');

    const session = await liveAudioModel.findSessionById(id);
    if (!session) return fail(res, 'Session not found.', 404, 'NOT_FOUND');

    // Only sheikh or active participants can see the list.
    const isTeacher = session.sheikhId === req.userId;
    if (!isTeacher) {
      const me = await liveAudioModel.findParticipant({ sessionId: id, userId: req.userId });
      if (!me) return fail(res, 'You must join the session first.', 403, 'NOT_A_MEMBER');
    }

    const onlyActive = req.query.active !== 'false';
    const participants = await liveAudioModel.listParticipants({
      sessionId: id,
      onlyActive,
    });
    return ok(res, { participants });
  } catch (error) {
    console.error('❌ listParticipants error:', error);
    return fail(res, 'Could not load participants.', 500, 'LIST_FAILED');
  }
};

// ============================================================
//  POST /api/live/:sessionId/note/:studentId   — upsert note
// ============================================================
export const upsertNote = async (req, res) => {
  try {
    const id = parseInt(req.params.sessionId, 10);
    const studentId = parseInt(req.params.studentId, 10);
    if (!id || !studentId) return fail(res, 'Invalid ids.', 400, 'BAD_ID');

    const session = await liveAudioModel.findSessionById(id);
    if (!session || session.sheikhId !== req.userId) {
      return fail(res, 'Only the teacher can add notes.', 403, 'NOT_SHEIKH');
    }

    const { note, rating } = req.body || {};
    if (rating != null) {
      const r = parseInt(rating, 10);
      if (!Number.isInteger(r) || r < 1 || r > 5) {
        return fail(res, 'rating must be an integer between 1 and 5.', 400, 'VALIDATION');
      }
    }

    const saved = await liveAudioModel.upsertNote({
      sessionId: id,
      studentId,
      note: note || null,
      rating: rating ? parseInt(rating, 10) : null,
    });
    return ok(res, { note: saved });
  } catch (error) {
    console.error('❌ upsertNote error:', error);
    return fail(res, 'Could not save the note.', 500, 'NOTE_FAILED');
  }
};

// ============================================================
//  GET /api/live/:sessionId/notes    — list notes for a session
// ============================================================
export const listNotes = async (req, res) => {
  try {
    const id = parseInt(req.params.sessionId, 10);
    if (!id) return fail(res, 'Invalid session id.', 400, 'BAD_ID');

    const session = await liveAudioModel.findSessionById(id);
    if (!session) return fail(res, 'Session not found.', 404, 'NOT_FOUND');
    if (session.sheikhId !== req.userId) {
      return fail(res, 'Only the teacher can view notes.', 403, 'NOT_SHEIKH');
    }

    const notes = await liveAudioModel.listNotesBySession(id);
    return ok(res, { notes });
  } catch (error) {
    console.error('❌ listNotes error:', error);
    return fail(res, 'Could not load notes.', 500, 'LIST_FAILED');
  }
};

// ============================================================
//  POST /api/live/:sessionId/recording   — accepts an uploaded
//                                          audio file via multer
// ============================================================
export const uploadRecording = async (req, res) => {
  try {
    const id = parseInt(req.params.sessionId, 10);
    if (!id) return fail(res, 'Invalid session id.', 400, 'BAD_ID');

    const session = await liveAudioModel.findSessionById(id);
    if (!session || session.sheikhId !== req.userId) {
      return fail(res, 'Only the teacher can upload a recording.', 403, 'NOT_SHEIKH');
    }

    if (!req.file) {
      return fail(res, 'No audio file was uploaded.', 400, 'NO_FILE');
    }

    // The middleware has already uploaded the file to Cloudinary (or
    // wherever your upload route stores things). req.file.path is the
    // public URL.
    const recordingUrl = req.file.path || req.file.url;
    if (!recordingUrl) {
      return fail(res, 'Upload succeeded but no URL was returned.', 500, 'NO_URL');
    }

    const updated = await liveAudioModel.updateSessionRecording(id, recordingUrl);
    return ok(res, { session: updated, recordingUrl });
  } catch (error) {
    console.error('❌ uploadRecording error:', error);
    return fail(res, 'Could not upload the recording.', 500, 'UPLOAD_FAILED');
  }
};

// ============================================================
//  GET /api/live/:sessionId/history   — full event timeline
// ============================================================
export const getHistory = async (req, res) => {
  try {
    const id = parseInt(req.params.sessionId, 10);
    if (!id) return fail(res, 'Invalid session id.', 400, 'BAD_ID');

    const session = await liveAudioModel.findSessionById(id);
    if (!session) return fail(res, 'Session not found.', 404, 'NOT_FOUND');

    const isTeacher = session.sheikhId === req.userId;
    if (!isTeacher) {
      const me = await liveAudioModel.findParticipant({ sessionId: id, userId: req.userId });
      if (!me) return fail(res, 'You must join the session first.', 403, 'NOT_A_MEMBER');
    }

    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
    const events = await liveAudioModel.listEvents({ sessionId: id, limit });
    return ok(res, { events });
  } catch (error) {
    console.error('❌ getHistory error:', error);
    return fail(res, 'Could not load history.', 500, 'HISTORY_FAILED');
  }
};

// ============================================================
//  GET /api/live/by-circle/:circleId/active — quick poll
//  Returns the currently-live session for a circle (if any).
// ============================================================
export const getActiveForCircle = async (req, res) => {
  try {
    const circleId = parseInt(req.params.circleId, 10);
    if (!circleId) return fail(res, 'Invalid circle id.', 400, 'BAD_ID');
    const sessions = await liveAudioModel.listSessionsByCircle({
      circleId,
      status: 'live',
      limit: 1,
    });
    return ok(res, { session: sessions[0] || null });
  } catch (error) {
    console.error('❌ getActiveForCircle error:', error);
    return fail(res, 'Could not check active session.', 500, 'CHECK_FAILED');
  }
};