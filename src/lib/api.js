import axios from 'axios';

let inMemoryAccessToken = null;
const SESSION_TOKEN_KEY = 'cadence_session_token';

export function getAccessToken() {
  if (inMemoryAccessToken) return inMemoryAccessToken;
  try {
    const token = sessionStorage.getItem(SESSION_TOKEN_KEY);
    if (token) {
      inMemoryAccessToken = token;
      return token;
    }
  } catch {
    // Ignore storage restriction
  }
  return null;
}

export function setAccessToken(token) {
  inMemoryAccessToken = token;
  try {
    if (token) {
      sessionStorage.setItem(SESSION_TOKEN_KEY, token);
    } else {
      sessionStorage.removeItem(SESSION_TOKEN_KEY);
    }
  } catch {
    // Ignore storage restriction
  }
}

export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let isRefreshing = false;
let failedQueue = [];

function processQueue(error, token = null) {
  for (const prom of failedQueue) {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  }
  failedQueue = [];
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const status = error.response?.status;
    const url = originalRequest?.url || '';

    const isAuthEndpoint =
      url.includes('/auth/login') ||
      url.includes('/auth/register') ||
      url.includes('/auth/google') ||
      url.includes('/auth/refresh');

    if (status === 401 && originalRequest && !originalRequest._retry && !isAuthEndpoint) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          if (token) {
            originalRequest.headers.Authorization = `Bearer ${token}`;
          }
          return api(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const res = await axios.post('/api/auth/refresh', {}, { withCredentials: true });
        const newToken = res.data?.data?.accessToken;
        if (newToken) {
          setAccessToken(newToken);
          processQueue(null, newToken);
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return api(originalRequest);
        }
        throw new Error('No access token returned on refresh');
      } catch (refreshErr) {
        setAccessToken(null);
        processQueue(refreshErr, null);
        return Promise.reject(refreshErr);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export function parseApiError(err) {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data;
    return {
      message: data?.message || err.message || 'Request failed. Please try again.',
      statusCode: err.response?.status || 500,
      code: data?.code || 'REQUEST_ERROR',
      errors: data?.errors,
    };
  }
  if (err instanceof Error) {
    return {
      message: err.message,
      statusCode: 500,
      code: 'UNKNOWN_ERROR',
    };
  }
  return {
    message: 'An unexpected error occurred.',
    statusCode: 500,
    code: 'UNKNOWN_ERROR',
  };
}
