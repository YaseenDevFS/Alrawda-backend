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
//
// Demo mode:
//   When AGORA_APP_ID is not configured, every token request falls back to a
//   mock object with `isDemo: true`. The controller forwards that flag so the
//   frontend can render the audio room UI without actually connecting to Agora.
//   This is useful for development inside Expo Go (which can't load the
//   native Agora module) and for staging demos before real credentials exist.

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

const isAgoraConfigured = () => Boolean(process.env.AGORA_APP_ID);

/**
 * Build a mock token object. The token itself is never sent to Agora — the
 * frontend detects `isDemo: true` and skips the real join call entirely.
 * Shape mirrors the real return value so the controller can stay simple.
 */
const buildMockToken = ({ channelName, userId, role, expireSeconds }) => {
  const uid = hashToUid(userId);
  const expiresAt = Math.floor(Date.now() / 1000) + expireSeconds;
  return {
    token: `demo-${channelName}-${uid}-${Date.now()}`,
    uid,
    expiresAt,
    channelName,
    role,
    isDemo: true,
  };
};

/**
 * Build an Agora RTC token for a single channel + UID.
 *
 * @param {object} opts
 * @param {string} opts.channelName   — the Agora channel (== live_sessions.channel_name)
 * @param {string|number} opts.userId  — any stable string; we'll hash it to a 32-bit int
 * @param {'publisher'|'subscriber'} opts.role
 * @param {number} [opts.expireSeconds]
 * @returns {{ token: string, uid: number, expiresAt: number, isDemo?: true }}
 */
export const generateRtcToken = ({
  channelName,
  userId,
  role = 'subscriber',
  expireSeconds = DEFAULT_TOKEN_EXPIRY_SECONDS,
}) => {
  // Demo-mode fallback: never throw at the user just because the deployment
  // doesn't have credentials yet. The frontend uses `isDemo` to render a
  // banner and skip the actual Agora join.
  if (!isAgoraConfigured()) {
    return buildMockToken({ channelName, userId, role, expireSeconds });
  }

  const appId = process.env.AGORA_APP_ID;
  const appCertificate = process.env.AGORA_APP_CERTIFICATE;

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

  return { token, uid, expiresAt: expireAt, isDemo: false };
};

/**
 * Convenience helper: same as generateRtcToken but never throws when Agora is
 * missing — it returns a mock token instead. Other unexpected errors still
 * bubble up wrapped with a friendly message.
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
 * Cheap read-only check used by the controller and the health endpoint
 * to decide whether to advertise demo mode to clients.
 */
export const isAgoraReady = () => isAgoraConfigured();

export default {
  generateRtcToken,
  safeGenerateRtcToken,
  uidForUser,
  isAgoraReady,
};