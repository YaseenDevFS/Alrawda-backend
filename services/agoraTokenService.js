// backend/services/agoraTokenService.js
//
// Wraps `agora-access-token` so callers don't have to know its internals.
// Tokens expire after 1 hour by default — clients should request a fresh
// token via POST /live/:sessionId/token before the previous one expires.
//
// Why this layer exists:
//   • Centralizes env reads + sensible defaults
//   • Single place to switch token-builder versions if Agora deprecates one
//   • Keeps the role string mapping in one well-tested place

import pkg from 'agora-access-token';
const { RtcTokenBuilder, RtcRole } = pkg;

// Hash a string (user id) down to a stable 32-bit unsigned integer
// required by Agora's UID field.
const hashToUid = (input) => {
  const str = String(input);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    // 32-bit integer math; the `| 0` keeps it in JS's int range.
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  // Convert to unsigned 32-bit.
  return Math.abs(hash);
};

const ROLE_MAP = {
  publisher: RtcRole.PUBLISHER,
  subscriber: RtcRole.SUBSCRIBER,
};

const DEFAULT_TOKEN_EXPIRY_SECONDS = 3600;

/**
 * Build an Agora RTC token for a single channel + UID.
 *
 * @param {object} opts
 * @param {string} opts.channelName   — the Agora channel (== live_sessions.channel_name)
 * @param {string|number} opts.userId  — any stable string; we'll hash it to a 32-bit int
 * @param {'publisher'|'subscriber'} opts.role
 * @param {number} [opts.expireSeconds]
 * @returns {{ token: string, uid: number, expiresAt: number }}
 */
export const generateRtcToken = ({
  channelName,
  userId,
  role = 'subscriber',
  expireSeconds = DEFAULT_TOKEN_EXPIRY_SECONDS,
}) => {
  const appId = process.env.AGORA_APP_ID;
  const appCertificate = process.env.AGORA_APP_CERTIFICATE;

  if (!appId) {
    throw new Error('AGORA_APP_ID is not configured on the server.');
  }
  // In Agora's "primary certificate disabled" mode, the certificate is empty.
  // We tolerate that, but warn loudly so it's caught in dev.
  if (!appCertificate) {
    console.warn('⚠ AGORA_APP_CERTIFICATE not set — tokens will be rejected by Agora.');
  }

  const uid = hashToUid(userId);
  const rtcRole = ROLE_MAP[role] ?? RtcRole.SUBSCRIBER;
  const expireAt = Math.floor(Date.now() / 1000) + expireSeconds;

  const token = RtcTokenBuilder.buildTokenWithUid(
    appId,
    appCertificate || '',
    channelName,
    uid,
    rtcRole,
    expireAt
  );

  return { token, uid, expiresAt: expireAt };
};

/**
 * Convenience helper: same as generateRtcToken but throws a friendlier
 * error if Agora isn't configured. Use this in routes so the API client
 * gets a clear message instead of a stack trace.
 */
export const safeGenerateRtcToken = (opts) => {
  try {
    return generateRtcToken(opts);
  } catch (error) {
    const err = new Error(`Agora token generation failed: ${error.message}`);
    err.code = 'AGORA_MISCONFIGURED';
    throw err;
  }
};

/**
 * Build a uid without the token — useful when the client already has a
 * valid token and just wants to re-sync the uid with the server.
 */
export const uidForUser = (userId) => hashToUid(userId);

/**
 * Cheap read-only check used by the /api/health endpoint to confirm the
 * server has the Agora credentials it needs.
 */
export const isAgoraReady = () => Boolean(process.env.AGORA_APP_ID);

export default {
  generateRtcToken,
  safeGenerateRtcToken,
  uidForUser,
  isAgoraReady,
};