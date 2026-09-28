// backend/controllers/circleController.js
import * as circleModel from '../models/circleModel.js';

// ============================================================
//  VALIDATION HELPERS
// ============================================================

const REQUIRED_CIRCLE_FIELDS = ['name', 'type', 'rangeType', 'startDate', 'startTime'];

const validateCirclePayload = (data) => {
  const errors = [];
  for (const field of REQUIRED_CIRCLE_FIELDS) {
    if (data[field] === undefined || data[field] === null || data[field] === '') {
      errors.push(`${field} is required`);
    }
  }
  if (data.name && (data.name.length < 3 || data.name.length > 100)) {
    errors.push('name must be between 3 and 100 characters');
  }
  if (data.type && !['memorize', 'review', 'both'].includes(data.type)) {
    errors.push('type must be memorize, review, or both');
  }
  if (data.rangeType && !['surah', 'juz', 'page', 'ayah'].includes(data.rangeType)) {
    errors.push('rangeType must be surah, juz, page, or ayah');
  }
  if (data.maxStudents !== undefined) {
    const n = Number(data.maxStudents);
    if (!Number.isInteger(n) || n < 2 || n > 100) {
      errors.push('maxStudents must be an integer between 2 and 100');
    }
  }
  if (data.joinType && !['approval', 'open', 'invite'].includes(data.joinType)) {
    errors.push('joinType must be approval, open, or invite');
  }
  if (data.visibility && !['public', 'private'].includes(data.visibility)) {
    errors.push('visibility must be public or private');
  }
  if (data.genderPolicy && !['all', 'male', 'female'].includes(data.genderPolicy)) {
    errors.push('genderPolicy must be all, male, or female');
  }
  return errors;
};

const ok = (res, data, status = 200) => res.status(status).json({ success: true, ...data });
const fail = (res, message, status = 400, code = null) =>
  res.status(status).json({ success: false, message, code: code || `HTTP_${status}` });

// ============================================================
//  CREATE CIRCLE
// ============================================================

export const createCircle = async (req, res) => {
  try {
    const errors = validateCirclePayload(req.body);
    if (errors.length) return fail(res, errors[0], 400, 'VALIDATION');

    // Defense-in-depth: even though requireSheikh runs before this controller,
    // re-check here so direct programmatic use still respects it.
    if (req.userAccountType !== 'sheikh') {
      return fail(res, 'Only teacher accounts can create circles.', 403, 'NOT_SHEIKH');
    }

    const circle = await circleModel.createCircle(req.userId, req.body);
    const enriched = await circleModel.findCircleById(circle.id, req.userId);
    return ok(res, { circle: enriched, message: 'Circle created successfully.' }, 201);
  } catch (error) {
    console.error('❌ createCircle error:', error);
    return fail(res, 'Could not create the circle. Please try again.', 500, 'CREATE_FAILED');
  }
};

// ============================================================
//  LIST CIRCLES
// ============================================================

export const listCircles = async (req, res) => {
  try {
    const result = await circleModel.listCircles({
      requesterId: req.userId,
      visibility: req.query.visibility,
      status: req.query.status || 'active',
      gender: req.query.gender,
      teacherId: req.query.teacherId ? parseInt(req.query.teacherId, 10) : null,
      mine: req.query.mine === 'true',
      search: req.query.search || null,
      limit: Math.min(parseInt(req.query.limit, 10) || 20, 50),
      offset: parseInt(req.query.offset, 10) || 0,
    });
    return ok(res, { circles: result, limit: req.query.limit || 20, offset: req.query.offset || 0 });
  } catch (error) {
    console.error('❌ listCircles error:', error);
    return fail(res, 'Could not load circles right now.', 500, 'LIST_FAILED');
  }
};

// ============================================================
//  GET SINGLE CIRCLE
// ============================================================

export const getCircle = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return fail(res, 'Invalid circle id.', 400, 'BAD_ID');

    const circle = await circleModel.findCircleById(id, req.userId);
    if (!circle) return fail(res, 'Circle not found.', 404, 'NOT_FOUND');

    // Private circles are only visible to teacher + approved members.
    if (circle.visibility === 'private' && circle.teacherId !== req.userId && !circle.isMember) {
      return fail(res, 'This circle is private.', 403, 'PRIVATE');
    }

    return ok(res, { circle });
  } catch (error) {
    console.error('❌ getCircle error:', error);
    return fail(res, 'Could not load this circle right now.', 500, 'GET_FAILED');
  }
};

// ============================================================
//  UPDATE CIRCLE
// ============================================================

export const updateCircle = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return fail(res, 'Invalid circle id.', 400, 'BAD_ID');

    const updated = await circleModel.updateCircle(id, req.userId, req.body);
    if (!updated) return fail(res, 'Circle not found or you are not its teacher.', 404, 'NOT_FOUND');

    const enriched = await circleModel.findCircleById(id, req.userId);
    return ok(res, { circle: enriched, message: 'Circle updated.' });
  } catch (error) {
    console.error('❌ updateCircle error:', error);
    return fail(res, 'Could not update this circle.', 500, 'UPDATE_FAILED');
  }
};

// ============================================================
//  DELETE CIRCLE
// ============================================================

export const deleteCircle = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return fail(res, 'Invalid circle id.', 400, 'BAD_ID');

    const deleted = await circleModel.deleteCircle(id, req.userId);
    if (!deleted) return fail(res, 'Circle not found or you are not its teacher.', 404, 'NOT_FOUND');
    return ok(res, { message: 'Circle deleted.' });
  } catch (error) {
    console.error('❌ deleteCircle error:', error);
    return fail(res, 'Could not delete this circle.', 500, 'DELETE_FAILED');
  }
};

// ============================================================
//  JOIN / LEAVE
// ============================================================

export const joinCircle = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return fail(res, 'Invalid circle id.', 400, 'BAD_ID');

    const circle = await circleModel.findCircleById(id, req.userId);
    if (!circle) return fail(res, 'Circle not found.', 404, 'NOT_FOUND');

    if (circle.teacherId === req.userId) {
      return fail(res, 'You cannot join your own circle.', 400, 'SELF_JOIN');
    }
    if (circle.status !== 'active') {
      return fail(res, 'This circle is not currently accepting members.', 400, 'INACTIVE');
    }
    if (circle.maxStudents && circle.membersCount >= circle.maxStudents && circle.joinType === 'open') {
      return fail(res, 'This circle has reached its maximum number of students.', 400, 'FULL');
    }

    // Decide default status from circle policy.
    const status = circle.joinType === 'open' ? 'approved' : 'pending';

    const member = await circleModel.joinCircle(id, req.userId, status);
    const message =
      status === 'approved'
        ? 'You have joined the circle. Welcome!'
        : 'Your join request is pending the teacher\'s approval.';

    return ok(res, { member, status, message }, 201);
  } catch (error) {
    console.error('❌ joinCircle error:', error);
    return fail(res, 'Could not submit your join request.', 500, 'JOIN_FAILED');
  }
};

export const leaveCircle = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return fail(res, 'Invalid circle id.', 400, 'BAD_ID');

    const removed = await circleModel.removeMember(id, req.userId, req.userId, false);
    if (!removed) return fail(res, 'You are not a member of this circle.', 404, 'NOT_MEMBER');
    return ok(res, { message: 'You have left the circle.' });
  } catch (error) {
    console.error('❌ leaveCircle error:', error);
    return fail(res, 'Could not leave this circle.', 500, 'LEAVE_FAILED');
  }
};

// ============================================================
//  MEMBERS
// ============================================================

export const listMembers = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return fail(res, 'Invalid circle id.', 400, 'BAD_ID');

    const circle = await circleModel.findCircleById(id, req.userId);
    if (!circle) return fail(res, 'Circle not found.', 404, 'NOT_FOUND');

    // Only teacher or approved members can see the member list.
    const isTeacher = circle.teacherId === req.userId;
    if (!isTeacher && !circle.isMember) {
      return fail(res, 'Only the teacher or approved members can view the member list.', 403, 'FORBIDDEN');
    }

    const status = req.query.status || null;
    const members = await circleModel.listMembers(id, { status });
    return ok(res, { members });
  } catch (error) {
    console.error('❌ listMembers error:', error);
    return fail(res, 'Could not load members.', 500, 'MEMBERS_FAILED');
  }
};

export const approveMember = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const studentId = parseInt(req.params.studentId, 10);
    if (!id || !studentId) return fail(res, 'Invalid circle or student id.', 400, 'BAD_ID');

    const updated = await circleModel.approveMember(id, studentId, req.userId);
    if (!updated) return fail(res, 'Could not approve this member.', 404, 'NOT_FOUND');
    return ok(res, { member: updated, message: 'Member approved.' });
  } catch (error) {
    console.error('❌ approveMember error:', error);
    return fail(res, 'Could not approve this member.', 500, 'APPROVE_FAILED');
  }
};

export const rejectMember = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const studentId = parseInt(req.params.studentId, 10);
    if (!id || !studentId) return fail(res, 'Invalid circle or student id.', 400, 'BAD_ID');

    const updated = await circleModel.rejectMember(id, studentId, req.userId);
    if (!updated) return fail(res, 'Could not reject this member.', 404, 'NOT_FOUND');
    return ok(res, { member: updated, message: 'Member rejected.' });
  } catch (error) {
    console.error('❌ rejectMember error:', error);
    return fail(res, 'Could not reject this member.', 500, 'REJECT_FAILED');
  }
};

export const removeMember = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const studentId = parseInt(req.params.studentId, 10);
    if (!id || !studentId) return fail(res, 'Invalid circle or student id.', 400, 'BAD_ID');

    const removed = await circleModel.removeMember(id, studentId, req.userId, true);
    if (!removed) return fail(res, 'Could not remove this member.', 404, 'NOT_FOUND');
    return ok(res, { message: 'Member removed.' });
  } catch (error) {
    console.error('❌ removeMember error:', error);
    return fail(res, 'Could not remove this member.', 500, 'REMOVE_FAILED');
  }
};

// ============================================================
//  PROGRESS
// ============================================================

export const getCircleProgress = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return fail(res, 'Invalid circle id.', 400, 'BAD_ID');

    const [members, stats] = await Promise.all([
      circleModel.listMembers(id, { status: 'approved' }),
      circleModel.getCircleAggregateStats(id),
    ]);
    return ok(res, { members, stats });
  } catch (error) {
    console.error('❌ getCircleProgress error:', error);
    return fail(res, 'Could not load progress.', 500, 'PROGRESS_FAILED');
  }
};

export const updateMemberProgress = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const studentId = parseInt(req.params.studentId, 10);
    if (!id || !studentId) return fail(res, 'Invalid circle or student id.', 400, 'BAD_ID');

    const result = await circleModel.upsertProgress(id, studentId, req.userId, req.body);
    if (result === null) return fail(res, 'You are not the teacher of this circle.', 403, 'NOT_TEACHER');
    if (result === 'NOT_MEMBER') return fail(res, 'This student is not an approved member.', 400, 'NOT_MEMBER');

    return ok(res, { progress: result, message: 'Progress updated.' });
  } catch (error) {
    console.error('❌ updateMemberProgress error:', error);
    return fail(res, 'Could not update progress.', 500, 'PROGRESS_UPDATE_FAILED');
  }
};