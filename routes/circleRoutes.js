// backend/routes/circleRoutes.js
import express from 'express';
import {
  authenticate,
  requireSheikh,
  requireCircleTeacher,
  requireCircleMemberOrTeacher,
} from '../middleware/auth.js';
import * as circleController from '../controllers/circleController.js';

const router = express.Router();

// All circle routes require authentication.
router.use(authenticate);

// ============================================================
//  CIRCLE CRUD
// ============================================================

// POST /api/circles — only Sheikhs may create circles.
router.post('/', requireSheikh, circleController.createCircle);

// GET /api/circles — public list with filters (?visibility, ?gender, ?mine, ?status, ?search)
router.get('/', circleController.listCircles);

// GET /api/circles/:id
router.get('/:id', circleController.getCircle);

// PUT /api/circles/:id — only the circle teacher
router.put('/:id', requireCircleTeacher, circleController.updateCircle);

// DELETE /api/circles/:id — only the circle teacher
router.delete('/:id', requireCircleTeacher, circleController.deleteCircle);

// ============================================================
//  MEMBERSHIP
// ============================================================

// POST /api/circles/:id/join — students request to join
router.post('/:id/join', circleController.joinCircle);

// POST /api/circles/:id/leave — a member leaves on their own
router.post('/:id/leave', circleController.leaveCircle);

// GET /api/circles/:id/members — teacher or approved members
router.get('/:id/members', circleController.listMembers);

// POST /api/circles/:id/approve/:studentId — teacher approves
router.post('/:id/approve/:studentId', requireCircleTeacher, circleController.approveMember);

// POST /api/circles/:id/reject/:studentId — teacher rejects
router.post('/:id/reject/:studentId', requireCircleTeacher, circleController.rejectMember);

// POST /api/circles/:id/remove/:studentId — teacher removes a member
router.post('/:id/remove/:studentId', requireCircleTeacher, circleController.removeMember);

// ============================================================
//  PROGRESS
// ============================================================

// GET /api/circles/:id/progress — teacher or approved members
router.get(
  '/:id/progress',
  requireCircleMemberOrTeacher,
  circleController.getCircleProgress
);

// PUT /api/circles/:id/progress/:studentId — teacher only
router.put(
  '/:id/progress/:studentId',
  requireCircleTeacher,
  circleController.updateMemberProgress
);

export default router;