// backend/middleware/requireCircleSheikh.js
//
// Gate that allows access only to the TEACHER of the referenced circle.
// Resolves the circle through `requireCircleMember`'s same logic.

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

const requireCircleSheikh = async (req, res, next) => {
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
    if (circle.rows[0].teacher_id !== req.userId) {
      return res.status(403).json({
        success: false,
        message: 'Only the circle teacher can do this.',
        code: 'NOT_SHEIKH',
      });
    }
    req.circleId = circleId;
    next();
  } catch (error) {
    console.error('❌ requireCircleSheikh error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Could not verify circle ownership right now.',
      code: 'AUTH_FAILED',
    });
  }
};

export default requireCircleSheikh;