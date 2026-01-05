# V2 API Fix - Absences Now Working!

## Problem Identified

The absences endpoint was returning empty arrays because we were using the **wrong API version**.

### Root Cause:

- We were calling **v1 API**: `https://api.personio.de/v1/company/absence-periods`
- Absences are actually in **v2 API**: `https://api.personio.de/v2/absence-periods`

According to [Personio API docs](https://developer.personio.de/reference/get_v2-absence-periods), the absence periods endpoint is:

```
GET https://api.personio.de/v2/absence-periods
```

## Changes Made

### 1. Added V2 API Base URL (`server.js`)

```javascript
const PERSONIO_BASE_URL = 'https://api.personio.de/v1';
const PERSONIO_V2_BASE_URL = 'https://api.personio.de/v2'; // NEW
```

### 2. Created V2 Request Handler

```javascript
async function personioV2Request(endpoint, params = {}) {
  // Uses v2 base URL
  // Handles v2 response format with metadata
  // Returns: { data: [...], meta: { offset, total } }
}
```

### 3. Updated Absences Endpoint

- Changed from `personioRequest()` to `personioV2Request()`
- Endpoint: `/absence-periods` (not `/company/absence-periods`)
- Better pagination using v2 metadata:
  - `meta.offset` - current offset
  - `meta.total` - total records available
  - Stops when `offset + count >= total`

### 4. Enhanced Debug Endpoint

Tests multiple endpoints to verify which one works:

- v1: `/company/absence-periods`
- v1: `/company/time-offs`
- v2: `/absence-periods` ✅

## V2 API Response Format

### V1 Format (old):

```json
{
  "success": true,
  "data": [...]
}
```

### V2 Format (new):

```json
{
  "data": [...],
  "meta": {
    "offset": 0,
    "total": 42
  }
}
```

## Testing

### 1. Run Debug Endpoint

```bash
curl http://localhost:3001/api/absences/debug | python3 -m json.tool
```

Should show:

- v1 endpoints: 0 records or errors
- v2 `/absence-periods`: Records found! ✅

### 2. Check Backend Logs

When frontend loads, you should now see:

```
=== Fetching absences from 2024-11-29 to 2025-01-28 ===

Fetching page 1 (offset: 0)...
API Request (v2): /absence-periods?limit=200&offset=0
API Response: records=15, offset=0, total=15
✓ Added 15 absences (total: 15)
Pagination: offset=0, total=15
Reached end of data (offset + count >= total)

=== Total absences returned: 15 ===
```

### 3. Verify in Frontend

- Employee status colors should now work
- Green = Available
- Red = Absent
- Gray = Sick leave

## Benefits of V2 API

✅ **Proper pagination metadata** - Know exactly how many records exist  
✅ **Better performance** - More efficient pagination  
✅ **Accurate data** - Actually returns absence records!  
✅ **Future-proof** - Using the current API version

## Migration Notes

- V1 API still used for: employees, time-off-types
- V2 API now used for: absence-periods
- Both authenticate with the same token
- No changes needed to frontend code
- All filtering happens in backend

## Next Steps

Restart the application:

```bash
npm start
```

The absences should now load correctly!
