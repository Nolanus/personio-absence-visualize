import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const PERSONIO_BASE_URL = 'https://api.personio.de/v1';
const PERSONIO_V2_BASE_URL = process.env.PERSONIO_V2_BASE_URL;

// In-memory cache
let authToken = null;
let tokenExpiry = null;
const dataCache = new Map();

app.use(cors());
app.use(express.json());

// Authenticate with Personio API
async function authenticate() {
  if (authToken && tokenExpiry && Date.now() < tokenExpiry) {
    return authToken;
  }

  try {
    const response = await fetch(`${PERSONIO_BASE_URL}/auth`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: process.env.PERSONIO_CLIENT_ID,
        client_secret: process.env.PERSONIO_CLIENT_SECRET,
      }),
    });

    const data = await response.json();
    
    if (!data.success) {
      throw new Error('Authentication failed: ' + JSON.stringify(data.error));
    }

    authToken = data.data.token;
    // Token typically expires in 1 hour, refresh 5 minutes before
    tokenExpiry = Date.now() + (55 * 60 * 1000);
    
    return authToken;
  } catch (error) {
    console.error('Authentication error:', error);
    throw error;
  }
}

// Generic Personio API request handler (v1)
async function personioRequest(endpoint, params = {}) {
  const token = await authenticate();
  
  const queryString = new URLSearchParams(params).toString();
  const url = `${PERSONIO_BASE_URL}${endpoint}${queryString ? '?' + queryString : ''}`;
  
  console.log(`API Request (v1): ${endpoint}${queryString ? '?' + queryString : ''}`);
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`API Error: ${response.status} - ${errorText}`);
    throw new Error(`Personio API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  console.log(`API Response: ${data.success ? 'success' : 'failed'}, records: ${data.data?.length || 0}`);
  return data;
}

// Personio v2 API request handler
async function personioV2Request(endpoint, params = {}) {
  const token = await authenticate();
  
  const queryString = new URLSearchParams(params).toString();
  const url = `${PERSONIO_V2_BASE_URL}${endpoint}${queryString ? '?' + queryString : ''}`;
  
  console.log(`API Request (v2): ${endpoint}${queryString ? '?' + queryString : ''}`);
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`API Error: ${response.status} - ${errorText}`);
    throw new Error(`Personio API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  console.log(`API Response: records=${data.data?.length || 0}, cursor=${data.meta?.next_cursor || 'none'}, total=${data.meta?.total || 'unknown'}`);
  return data;
}

// Get employees (using v1 API - employees endpoint)
app.get('/api/employees', async (req, res) => {
  try {
    const cacheKey = 'employees';
    const cached = dataCache.get(cacheKey);
    
    // Cache for 5 minutes
    if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
      console.log('Returning cached employees');
      return res.json(cached.data);
    }

    console.log('\n=== Fetching employees ===');
    
    // Use v1 API - simpler and works with standard auth
    const data = await personioRequest('/company/employees');
    
    // Filter to active and onboarding employees (exclude former and paused)
    const activeEmployees = data.data.filter(employee => {
      const status = employee.attributes?.status?.value?.toLowerCase();
      return status === 'active' || status === 'onboarding';
    });
    
    console.log(`Filtered ${data.data.length} → ${activeEmployees.length} active employees`);
    
    // Log sample employee structure to debug hierarchy issues
    if (activeEmployees.length > 0) {
      const sample = activeEmployees.find(emp => emp.attributes?.supervisor?.value);
      if (sample) {
        console.log('Sample employee with supervisor:', JSON.stringify({
          id: sample.attributes?.id?.value,
          name: `${sample.attributes?.first_name?.value} ${sample.attributes?.last_name?.value}`,
          supervisor: sample.attributes?.supervisor?.value,
          work_schedule: sample.attributes?.work_schedule?.value || sample.attributes?.work_schedule,
          weekly_working_hours: sample.attributes?.weekly_working_hours?.value
        }, null, 2));
      }
      
      // Log first employee to see all available attributes
      console.log('Available employee attributes:', Object.keys(activeEmployees[0].attributes || {}));
    }
    
    const result = {
      success: true,
      data: activeEmployees
    };
    
    console.log(`=== Total active employees: ${activeEmployees.length} ===\n`);
    
    dataCache.set(cacheKey, {
      data: result,
      timestamp: Date.now(),
    });
    
    res.json(result);
  } catch (error) {
    console.error('Error fetching employees:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get absence periods with pagination
app.get('/api/absences', async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    
    if (!start_date || !end_date) {
      return res.status(400).json({ error: 'start_date and end_date are required' });
    }

    const cacheKey = `absences_${start_date}_${end_date}`;
    const cached = dataCache.get(cacheKey);
    
    // Cache for 5 minutes
    if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
      console.log('Returning cached absences');
      return res.json(cached.data);
    }

    console.log(`\n=== Fetching absences from ${start_date} to ${end_date} ===`);
    
    // Use v1 API for time-offs (this is the correct endpoint for absences)
    const data = await personioRequest('/company/time-offs', {
      start_date,
      end_date
    });
    
    let allAbsences = data.data || [];
    console.log(`Fetched ${allAbsences.length} absences`);
    
    if (allAbsences.length > 0) {
      // Log sample to understand structure
      const sample = allAbsences[0];
      console.log('Sample absence structure:', JSON.stringify({
        id: sample.attributes?.id?.value,
        employee: sample.attributes?.employee?.attributes?.email?.value,
        employeeId: sample.attributes?.employee?.attributes?.id?.value,
        startDate: sample.attributes?.start_date,
        endDate: sample.attributes?.end_date,
        timeOffType: sample.attributes?.time_off_type?.attributes?.name
      }, null, 2));
      
      // Look for the specific date
      const jan2Absence = allAbsences.find(abs => 
        abs.attributes?.start_date <= '2026-01-02' && 
        abs.attributes?.end_date >= '2026-01-02'
      );
      
      if (jan2Absence) {
        console.log('Found absence on 2026-01-02:', JSON.stringify({
          employee: jan2Absence.attributes?.employee?.attributes?.email?.value,
          employeeId: jan2Absence.attributes?.employee?.attributes?.id?.value,
          startDate: jan2Absence.attributes?.start_date,
          endDate: jan2Absence.attributes?.end_date
        }, null, 2));
      } else {
        console.log('No absence found for 2026-01-02 in date range');
      }
    }
    
    const result = {
      success: true,
      data: allAbsences
    };
    
    console.log(`\n=== Total absences returned: ${allAbsences.length} ===\n`);
    
    dataCache.set(cacheKey, {
      data: result,
      timestamp: Date.now(),
    });
    
    res.json(result);
  } catch (error) {
    console.error('\n!!! Error fetching absences:', error.message);
    console.error('Stack:', error.stack);
    res.status(500).json({ error: error.message });
  }
});

// Get time-off types (to identify sick leave vs other absences)
app.get('/api/time-off-types', async (req, res) => {
  try {
    const cacheKey = 'time_off_types';
    const cached = dataCache.get(cacheKey);
    
    // Cache for 1 hour
    if (cached && Date.now() - cached.timestamp < 60 * 60 * 1000) {
      return res.json(cached.data);
    }

    const data = await personioRequest('/company/time-off-types');
    
    dataCache.set(cacheKey, {
      data,
      timestamp: Date.now(),
    });
    
    res.json(data);
  } catch (error) {
    console.error('Error fetching time-off types:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get employee profile picture
app.get('/api/profile-picture/:employeeId', async (req, res) => {
  try {
    const { employeeId } = req.params;
    const width = req.query.width || 75;
    
    const token = await authenticate();
    const url = `${PERSONIO_BASE_URL}/company/employees/${employeeId}/profile-picture/${width}`;
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'image/png',
      },
    });

    if (!response.ok) {
      // No profile picture available, return 404
      return res.status(404).json({ error: 'Profile picture not found' });
    }

    const imageBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(imageBuffer);
    
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
    res.send(buffer);
  } catch (error) {
    console.error('Error fetching profile picture:', error);
    res.status(500).json({ error: error.message });
  }
});

// Debug endpoint to test API endpoints
app.get('/api/absences/debug', async (req, res) => {
  try {
    const token = await authenticate();
    
    // Test both v1 and v2 endpoints
    const tests = [
      { version: 'v1', base: PERSONIO_BASE_URL, endpoint: '/company/employees' },
      { version: 'v2', base: PERSONIO_V2_BASE_URL, endpoint: '/persons' },
      { version: 'v1', base: PERSONIO_BASE_URL, endpoint: '/company/absence-periods' },
      { version: 'v1', base: PERSONIO_BASE_URL, endpoint: '/company/time-offs' },
      { version: 'v2', base: PERSONIO_V2_BASE_URL, endpoint: '/absence-periods' },
    ];
    
    const results = {};
    
    for (const test of tests) {
      const testUrl = `${test.base}${test.endpoint}`;
      const testKey = `${test.version}${test.endpoint}`;
      console.log(`\nTesting: ${testUrl}`);
      
      try {
        const response = await fetch(testUrl, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json',
          },
        });
        
        const data = await response.json();
        results[testKey] = {
          url: testUrl,
          status: response.status,
          success: data.success,
          recordCount: data.data?.length || 0,
          meta: data.meta || null,
          sample: data.data?.[0] ? {
            id: data.data[0].id,
            type: data.data[0].type,
            hasAttributes: !!data.data[0].attributes
          } : null
        };
        console.log(`  Status: ${response.status}, Records: ${data.data?.length || 0}`);
      } catch (error) {
        results[testKey] = { url: testUrl, error: error.message };
        console.log(`  Error: ${error.message}`);
      }
    }
    
    res.json(results);
  } catch (error) {
    console.error('Debug error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
  console.log('Make sure to set PERSONIO_CLIENT_ID and PERSONIO_CLIENT_SECRET in .env file');
});
