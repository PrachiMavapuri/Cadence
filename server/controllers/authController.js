import { randomBytes, timingSafeEqual } from 'node:crypto';
import {
  loginUser,
  loginWithGoogleAuthorizationCode,
  loginWithSocialProvider,
  logoutUser,
  refreshUserSession,
  registerUser,
  updateProfile,
} from '../services/authService.js';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

function setRefreshCookie(req, res, token) {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https' || env.NODE_ENV === 'production';
  res.cookie('cadence_rt', token, {
    httpOnly: true,
    secure: isHttps,
    sameSite: isHttps ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

function clearRefreshCookie(req, res) {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https' || env.NODE_ENV === 'production';
  res.clearCookie('cadence_rt', {
    httpOnly: true,
    secure: isHttps,
    sameSite: isHttps ? 'none' : 'lax',
    path: '/',
  });
}

function googleRedirectUri() {
  return env.GOOGLE_REDIRECT_URI || new URL('/api/auth/google/callback', env.APP_URL).toString();
}

function redirectToLoginWithOAuthError(res, error) {
  const url = new URL('/login', env.APP_URL);
  url.searchParams.set('oauthError', error);
  res.redirect(url.toString());
}

function clearGoogleStateCookie(req, res) {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https' || env.NODE_ENV === 'production';
  res.clearCookie('cadence_google_state', {
    httpOnly: true,
    secure: isHttps,
    sameSite: 'lax',
    path: '/api/auth/google',
  });
}

function hasMatchingOAuthState(state, cookieState) {
  if (typeof state !== 'string' || typeof cookieState !== 'string') return false;
  const received = Buffer.from(state);
  const expected = Buffer.from(cookieState);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export function googleAuthStart(req, res) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    return redirectToLoginWithOAuthError(res, 'not_configured');
  }

  const state = randomBytes(32).toString('hex');
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https' || env.NODE_ENV === 'production';
  res.cookie('cadence_google_state', state, {
    httpOnly: true,
    secure: isHttps,
    sameSite: 'lax',
    maxAge: 10 * 60 * 1000,
    path: '/api/auth/google',
  });

  const authorizationUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authorizationUrl.search = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: googleRedirectUri(),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  }).toString();

  return res.redirect(authorizationUrl.toString());
}

export async function googleAuthCallback(req, res) {
  const state = req.query.state;
  const code = req.query.code;
  const providerError = req.query.error;
  const cookieState = req.cookies?.cadence_google_state;
  clearGoogleStateCookie(req, res);

  if (!hasMatchingOAuthState(state, cookieState)) {
    return redirectToLoginWithOAuthError(res, 'invalid_state');
  }
  if (providerError) {
    return redirectToLoginWithOAuthError(res, 'access_denied');
  }
  if (typeof code !== 'string' || !code) {
    return redirectToLoginWithOAuthError(res, 'missing_code');
  }

  try {
    const result = await loginWithGoogleAuthorizationCode(code, googleRedirectUri());
    setRefreshCookie(req, res, result.refreshToken);
    return res.redirect(new URL('/dashboard', env.APP_URL).toString());
  } catch (error) {
    if (error instanceof AppError) {
      return redirectToLoginWithOAuthError(res, 'google_auth_failed');
    }
    throw error;
  }
}

export async function register(req, res) {
  const result = await registerUser(req.body);
  setRefreshCookie(req, res, result.refreshToken);
  res.status(201).json({
    success: true,
    message: 'Account registered successfully.',
    data: {
      user: result.user,
      accessToken: result.accessToken,
    },
  });
}

export async function login(req, res) {
  const result = await loginUser(req.body);
  setRefreshCookie(req, res, result.refreshToken);
  res.status(200).json({
    success: true,
    message: 'Signed in successfully.',
    data: {
      user: result.user,
      accessToken: result.accessToken,
    },
  });
}



export async function refresh(req, res) {
  const token = req.cookies?.cadence_rt;
  const result = await refreshUserSession(token);
  setRefreshCookie(req, res, result.refreshToken);
  res.status(200).json({
    success: true,
    data: {
      user: result.user,
      accessToken: result.accessToken,
    },
  });
}

export async function getMe(req, res) {
  res.status(200).json({
    success: true,
    data: {
      user: req.user,
    },
  });
}

export async function updateMyProfile(req, res) {
  const updated = await updateProfile(req.user.id, req.body);
  res.status(200).json({
    success: true,
    message: 'Profile updated successfully.',
    data: {
      user: updated,
    },
  });
}

export async function logout(req, res) {
  const token = req.cookies?.cadence_rt;
  await logoutUser(token);
  clearRefreshCookie(req, res);
  res.status(200).json({
    success: true,
    message: 'Signed out successfully.',
  });
}
