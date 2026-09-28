// src/middleware/auth.js
import jwt from 'jsonwebtoken';
import pool from '../db/db.js';

/**
 * Attach the full user row (including role + account_type) to req.user.
 * We intentionally fetch from DB (instead of trusting JWT) so role changes
 * take effect immediately without forcing a logout/login cycle.
 */
const loadUser = async (userId) => {
  try {
    const result = await pool.query(
      `SELECT id, name, email, role, account_type
       FROM users
       WHERE id = $1`,
      [userId]
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error('loadUser error:', error.message);
    return null;
  }
};

export const authenticate = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please sign in to continue.',
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    req.userEmail = decoded.email;
    req.userName = decoded.name;

    // Load the actual row so role-based checks always see fresh values.
    const user = await loadUser(decoded.userId);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Your account is no longer available. Please sign in again.',
      });
    }
    req.user = user;
    req.userRole = user.role;
    req.userAccountType = user.account_type || 'student';

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(401).json({
      success: false,
      message: 'Your session has expired. Please sign in again.',
    });
  }
};

/**
 * Use on routes that work for guests too — attaches req.userId if a token
 * is present, but never rejects unauthenticated callers.
 */
export const optionalAuth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.userId = decoded.userId;
      const user = await loadUser(decoded.userId);
      if (user) {
        req.user = user;
        req.userRole = user.role;
        req.userAccountType = user.account_type || 'student';
      }
    }
    next();
  } catch {
    next();
  }
};

/**
 * Gate: only users with account_type='sheikh' may pass.
 * Use after `authenticate` (which populates req.userAccountType).
 */
export const requireSheikh = (req, res, next) => {
  if (req.userAccountType !== 'sheikh') {
    return res.status(403).json({
      success: false,
      message: 'Only teacher accounts can perform this action.',
    });
  }
  next();
};

/**
 * Gate: only the circle's teacher may pass.
 * Expects req.params.id (or :circleId) to point to a real circle.
 */
export const requireCircleTeacher = async (req, res, next) => {
  try {
    const circleId = parseInt(req.params.id || req.params.circleId, 10);
    if (!circleId || Number.isNaN(circleId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid circle id.',
      });
    }

    const result = await pool.query(
      'SELECT teacher_id FROM circles WHERE id = $1',
      [circleId]
    );
    const circle = result.rows[0];
    if (!circle) {
      return res.status(404).json({
        success: false,
        message: 'Circle not found.',
      });
    }
    if (circle.teacher_id !== req.userId) {
      return res.status(403).json({
        success: false,
        message: 'Only the circle teacher can perform this action.',
      });
    }
    req.circleId = circleId;
    next();
  } catch (error) {
    console.error('requireCircleTeacher error:', error);
    res.status(500).json({
      success: false,
      message: 'Could not verify circle ownership right now.',
    });
  }
};

/**
 * Gate: only approved members (or the teacher) of a circle may read progress.
 */
export const requireCircleMemberOrTeacher = async (req, res, next) => {
  try {
    const circleId = parseInt(req.params.id || req.params.circleId, 10);
    if (!circleId || Number.isNaN(circleId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid circle id.',
      });
    }

    const circle = await pool.query(
      'SELECT teacher_id FROM circles WHERE id = $1',
      [circleId]
    );
    if (!circle.rows[0]) {
      return res.status(404).json({
        success: false,
        message: 'Circle not found.',
      });
    }

    if (circle.rows[0].teacher_id === req.userId) {
      req.circleId = circleId;
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
        message: 'You must be an approved member of this circle to view its progress.',
      });
    }
    req.circleId = circleId;
    next();
  } catch (error) {
    console.error('requireCircleMemberOrTeacher error:', error);
    res.status(500).json({
      success: false,
      message: 'Could not verify circle access right now.',
    });
  }
};