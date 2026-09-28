// backend/middleware/requireCircleMember.js
//
// Gate that allows access only if the authenticated user is an
// APPROVED member of the referenced circle, or the circle's teacher.
//
// Usage:
//   router.post('/:sessionId/join', authenticate, requireCircleMember, ...)
//
// Expects (in order):
//   • authenticate middleware populated req.user
//   • route param OR body containing circleId OR a sessionId whose
//     session we can resolve to a circle_id
//
// We resolve the circle in two stages:
//   1. Direct — req.params.circleId or req.body.circleId
//   2. Indirect — look up live_sessions.id == req.params.sessionId

import pool from '../db/db.js';

const resolveCircleId = async (req) => {
  if (req.params.circleId) return parseInt(req.params.circleId, 10);
  if (req.body && req.body.circleId) return parseInt(req.body.circleId, 10);
  if (req.params.sessionId) {
    const r = await pool.query(
      'SELECT circle_id FROM live_sessions WHERE id = $1',
      [parseInt(req.params.sessionId, 10)]
    );
    return r.rows[0]?.circle_id || null;
  }
  return null;
};

const requireCircleMember = async (req, res, next) => {
  try {
    const circleId = await resolveCircleId(req);
    if (!circleId) {
      return res.status(400).json({
        success: false,
        message: 'Could not resolve circle for this request.',
        code: 'BAD_REQUEST',
      });
    }

    const circle = await pool.query(
      'SELECT id, teacher_id FROM circles WHERE id = $1',
      [circleId]
    );
    if (!circle.rows[0]) {
      return res.status(404).json({
        success: false,
        message: 'Circle not found.',
        code: 'NOT_FOUND',
      });
    }

    // The teacher can always act on their own circle.
    if (circle.rows[0].teacher_id === req.userId) {
      req.circleId = circleId;
      req.circleRole = 'sheikh';
      return next();
    }

    const member = await pool.query(
      `SELECT 1 FROM circle_members
       WHERE circle_id = $1 AND student_id = $2 AND status = 'approved'
       LIMIT 1`,
      [circleId, req.userId]
    );
    if (!member.rows[0]) {
      return res.status(403).json({
        success: false,
        message: 'Only approved circle members can do this.',
        code: 'NOT_A_MEMBER',
      });
    }

    req.circleId = circleId;
    req.circleRole = 'student';
    next();
  } catch (error) {
    console.error('❌ requireCircleMember error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Could not verify circle membership right now.',
      code: 'AUTH_FAILED',
    });
  }
};

export default requireCircleMember;