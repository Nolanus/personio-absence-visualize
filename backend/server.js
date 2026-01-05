import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import cookieParser from 'cookie-parser';
import { mockEmployees, mockTimeOffTypes, generateMockAbsences } from './mockData.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const AZURE_TENANT_ID = process.env.AZURE_TENANT_ID;
const AZURE_CLIENT_ID = process.env.AZURE_CLIENT_ID;
const PERSONIO_CLIENT_ID = process.env.PERSONIO_CLIENT_ID;
const PERSONIO_CLIENT_SECRET = process.env.PERSONIO_CLIENT_SECRET;
const PORT = process.env.PORT || 8080;
const PERSONIO_BASE_URL = 'https://api.personio.de/v1';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || null;
const AUTH_ENABLED = process.env.AUTH_ENABLED !== 'false';
const COMPANY_NAME = process.env.COMPANY_NAME || 'Organization';

const DEMO_MODE = !PERSONIO_CLIENT_ID || !PERSONIO_CLIENT_SECRET;

if (DEMO_MODE) {
  console.log('[Startup] PERSONIO_CLIENT_ID or PERSONIO_CLIENT_SECRET not set. Running in DEMO_MODE with mock data.');
} else if (!AZURE_TENANT_ID || !AZURE_CLIENT_ID) {
  console.warn(
    '[Startup] AZURE_TENANT_ID or AZURE_CLIENT_ID not set. Microsoft token validation will fail until configured.',
  );
}

const app = express();

// In-memory caches
let personioToken = null;
let personioTokenExpiresAt = 0; // epoch ms
const dataCache = new Map();

app.use(express.json());
app.use(cookieParser());

// CORS: in production, lock down to a single origin. For same-origin SPA behind this server,
// CORS is generally not needed, but this is useful for dev and external consumers.
if (ALLOWED_ORIGIN) {
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || origin === ALLOWED_ORIGIN) {
          return callback(null, ALLOWED_ORIGIN);
        }
        return callback(new Error('Not allowed by CORS'));
      },
      credentials: true,
    }),
  );
} else {
  // CORS disabled by default (same-origin only)
  app.use(cors({ origin: false }));
}

// -----------------------------
// Microsoft Entra ID JWT validation
// -----------------------------

let jwksClient = null;
if (AZURE_TENANT_ID) {
  const jwksUri = new URL(
    `https://login.microsoftonline.com/${AZURE_TENANT_ID}/discovery/v2.0/keys`,
  );
  jwksClient = createRemoteJWKSet(jwksUri);
}

async function verifyMicrosoftToken(token) {
  if (!jwksClient) {
    throw new Error('Azure AD configuration missing');
  }

  const { payload } = await jwtVerify(token, jwksClient, {
    issuer: [
      `https://login.microsoftonline.com/${AZURE_TENANT_ID}/v2.0`,
      `https://sts.windows.net/${AZURE_TENANT_ID}/`,
    ],
    audience: AZURE_CLIENT_ID,
  });

  return payload;
}

async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const [scheme, token] = authHeader.split(' ');

  if (!token || scheme !== 'Bearer') {
    if (!AUTH_ENABLED) return next();
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  try {
    const payload = await verifyMicrosoftToken(token);
    // We rely on Entra ID assignment to restrict which users can obtain tokens.
    req.user = {
      oid: payload.oid,
      upn: payload.preferred_username || payload.upn,
      name: payload.name,
    };

    // Set HttpOnly cookie for authenticated session
    // This allows <img> tags to work without Authorization headers
    res.cookie('session_oid', payload.oid, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // HTTPS only in production
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });

    return next();
  } catch (err) {
    console.error('[Auth] Microsoft token validation failed:', err.message);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Employee profile picture proxy (cookie-authenticated for <img> tag compatibility)
// Requires session_oid cookie set by authMiddleware
app.get('/api/profile-picture/:employeeId', async (req, res) => {
  const { employeeId } = req.params;
  try {
    // Check for session cookie
    const sessionOid = req.cookies.session_oid;
    if (!sessionOid && AUTH_ENABLED) {
      return res.status(401).send('Unauthorized - No session cookie');
    }

    if (DEMO_MODE) {
      // In demo mode, return a UI-Avatar for everyone
      return res.redirect(`https://ui-avatars.com/api/?name=${employeeId}&background=random`);
    }

    // Check cache first (24-hour TTL to preserve API quota)
    const cacheKey = `profile_picture_${employeeId}`;
    const cached = dataCache.get(cacheKey);

    if (cached) {
      const age = Date.now() - cached.timestamp;

      // Handle cached successes
      if (!cached.isError && age < 24 * 60 * 60 * 1000) {
        res.set('Content-Type', 'image/png');
        res.set('Cache-Control', 'public, max-age=86400');
        return res.send(cached.data);
      }

      // Handle cached 404s (Missing images) - cache for 24 hours per user request
      if (cached.status === 404 && age < 24 * 60 * 60 * 1000) {
        return res.status(404).send('Image not found (cached)');
      }

      // Handle cached 429s (Rate limits) - cache for 2 minutes as backoff
      if (cached.status === 429 && age < 2 * 60 * 1000) {
        return res.status(429).send('Too many requests (backoff)');
      }
    }

    const token = await getPersonioAccessToken();
    // Use the URL format from the profile_picture attribute (no width parameter)
    const url = `${PERSONIO_BASE_URL}/company/employees/${employeeId}/profile-picture`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'image/png',
      },
    });

    if (!response.ok) {
      console.error(
        `[API] Profile picture fetch failed for ${employeeId}. Status: ${response.status} ${response.statusText}`,
      );

      // Implement negative caching for failures
      const status = response.status;
      if (status === 404 || status === 429) {
        dataCache.set(cacheKey, {
          isError: true,
          status: status,
          timestamp: Date.now(),
        });
      }

      return res.status(status).send(status === 404 ? 'Image not found' : 'Rate limited');
    }

    const imageBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(imageBuffer);

    // Cache the image for 24 hours
    dataCache.set(cacheKey, {
      data: buffer,
      timestamp: Date.now(),
      isError: false,
    });

    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=86400'); // 24 hours
    res.send(buffer);
  } catch (error) {
    console.error('[API] /api/profile-picture failed:', error.message);
    return res.status(500).send('Server error');
  }
});

// Logout endpoint (unauthenticated) - clears session cookie
app.post('/api/logout', (req, res) => {
  // Clear the session cookie
  res.clearCookie('session_oid', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  });

  res.json({ success: true, message: 'Logged out successfully' });
});

// Apply auth to all API routes
app.use('/api', authMiddleware);

// -----------------------------
// Personio API integration with token caching
// -----------------------------

async function getPersonioAccessToken() {
  const now = Date.now();
  if (personioToken && personioTokenExpiresAt > now) {
    return personioToken;
  }

  if (!PERSONIO_CLIENT_ID || !PERSONIO_CLIENT_SECRET) {
    throw new Error('Personio credentials not configured');
  }

  const body = new URLSearchParams({
    client_id: PERSONIO_CLIENT_ID,
    client_secret: PERSONIO_CLIENT_SECRET,
  });

  const response = await fetch(`${PERSONIO_BASE_URL}/auth`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body,
  });

  if (!response.ok) {
    console.error('[Personio] Auth failed with status', response.status);
    // Intentionally do NOT log credentials or full response body to avoid leaking secrets.
    throw new Error(`Personio auth failed with status ${response.status}`);
  }

  const data = await response.json();
  const token = data?.data?.token || data?.token || data?.access_token;

  if (!token) {
    throw new Error('Personio auth response did not contain a token');
  }

  personioToken = token;
  // Personio tokens are stable for 24h; cache for slightly less to be safe.
  personioTokenExpiresAt = now + 23 * 60 * 60 * 1000;

  return personioToken;
}

async function personioRequest(endpoint, params = {}) {
  const token = await getPersonioAccessToken();

  const queryString = new URLSearchParams(params).toString();
  const url = `${PERSONIO_BASE_URL}${endpoint}${queryString ? `?${queryString}` : ''}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[Personio] API Error: ${response.status}`);
    throw new Error(`Personio API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data;
}

// -----------------------------
// API Routes
// -----------------------------

// Employees
app.get('/api/employees', async (req, res) => {
  if (DEMO_MODE) return res.json(mockEmployees);
  try {
    const cacheKey = 'employees';
    const cached = dataCache.get(cacheKey);

    // Cache for 5 minutes
    if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
      return res.json(cached.data);
    }

    const data = await personioRequest('/company/employees');
    const lastUpdated = Date.now();

    // Filter to active and onboarding employees (exclude former and paused)
    const activeEmployees = (data.data || []).filter((employee) => {
      const status = employee.attributes?.status?.value?.toLowerCase();
      return status === 'active' || status === 'onboarding';
    });

    const result = {
      success: true,
      data: activeEmployees,
      lastUpdated,
    };

    dataCache.set(cacheKey, {
      data: result,
      timestamp: Date.now(),
    });

    return res.json(result);
  } catch (error) {
    console.error('[API] /api/employees failed:', error.message);
    return res.status(500).json({ error: 'Failed to fetch employees from Personio' });
  }
});

// Absences (time-offs)
app.get('/api/absences', async (req, res) => {
  const { start_date, end_date } = req.query;

  if (!start_date || !end_date) {
    return res
      .status(400)
      .json({ error: 'start_date and end_date query parameters are required (YYYY-MM-DD)' });
  }

  if (DEMO_MODE) return res.json(generateMockAbsences(start_date));

  try {


    const cacheKey = `absences_${start_date}_${end_date}`;
    const cached = dataCache.get(cacheKey);

    // Cache for 30 minutes
    if (cached && Date.now() - cached.timestamp < 30 * 60 * 1000) {
      return res.json(cached.data);
    }

    const data = await personioRequest('/company/time-offs', {
      start_date,
      end_date,
    });
    const lastUpdated = Date.now();

    const result = {
      success: true,
      data: data.data || [],
      lastUpdated,
    };

    dataCache.set(cacheKey, {
      data: result,
      timestamp: Date.now(),
    });

    return res.json(result);
  } catch (error) {
    console.error('[API] /api/absences failed:', error.message);
    return res.status(500).json({ error: 'Failed to fetch absences from Personio' });
  }
});

// Time-off types
app.get('/api/time-off-types', async (req, res) => {
  if (DEMO_MODE) return res.json(mockTimeOffTypes);
  try {
    const cacheKey = 'time_off_types';
    const cached = dataCache.get(cacheKey);

    // Cache for 24 hours
    if (cached && Date.now() - cached.timestamp < 24 * 60 * 60 * 1000) {
      return res.json(cached.data);
    }

    const data = await personioRequest('/company/time-off-types');
    const lastUpdated = Date.now();

    const result = {
      success: true,
      data: data.data || [],
      lastUpdated,
    };

    dataCache.set(cacheKey, {
      data: result,
      timestamp: lastUpdated,
    });

    return res.json(result);
  } catch (error) {
    console.error('[API] /api/time-off-types failed:', error.message);
    return res.status(500).json({ error: 'Failed to fetch time-off types from Personio' });
  }
});

// Health check (unauthenticated) for container/platform probes
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// -----------------------------
// Static file serving for React SPA
// -----------------------------

const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir, { index: false }));

// Preload index.html and inject public Azure config so the SPA can read it at runtime
let indexHtml = null;
const indexPath = path.join(publicDir, 'index.html');
try {
  if (fs.existsSync(indexPath)) {
    const rawHtml = fs.readFileSync(indexPath, 'utf8');
    const config = {
      azureClientId: AZURE_CLIENT_ID || null,
      azureTenantId: AZURE_TENANT_ID || null,
      authEnabled: AUTH_ENABLED,
      companyName: COMPANY_NAME,
    };
    const configScript = `<script>window.__SCHEDULE_VIEWER_CONFIG__ = ${JSON.stringify(
      config,
    )};</script>`;
    indexHtml = rawHtml.replace('</head>', `  ${configScript}\n</head>`);
  }
} catch (err) {
  console.warn('[Startup] Failed to preload index.html for config injection:', err.message);
}

// Catch-all route to support client-side routing (React Router-style)
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }

  if (indexHtml) {
    return res.send(indexHtml);
  }

  return res.sendFile(indexPath);
});

if (process.argv[1] === __filename) {
  app.listen(PORT, () => {
    console.log(`[Startup] Server listening on port ${PORT}`);
  });
}

export default app;
