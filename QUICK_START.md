# Quick Start Guide

## First Time Setup

1. **Configure Personio credentials:**
   ```bash
   cp backend/.env.example backend/.env
   # Edit backend/.env with your Personio API credentials
   ```

2. **Check if everything is ready:**
   ```bash
   ./check-setup.sh
   ```

## Running the Application

**Start both backend and frontend:**
```bash
npm start
```

The application will be available at:
- Frontend: http://localhost:3000
- Backend API: http://localhost:3001

Press `Ctrl+C` to stop both servers.

## Alternative: Run Individually

**Backend only:**
```bash
npm run start:backend
```

**Frontend only:**
```bash
npm run start:frontend
```

## Troubleshooting

**Reinstall all dependencies:**
```bash
npm run install:all
```

**Check setup status:**
```bash
./check-setup.sh
```

**View backend logs:**
Check the terminal output where `npm start` is running.

## What to Expect

When you run `npm start`:
1. Backend server starts on port 3001
2. Frontend dev server starts on port 3000
3. Browser should open automatically to http://localhost:3000
4. Application loads employee data and displays org chart
5. Use date picker to view absence data for different days

## Required Personio Setup

Make sure these employee attributes are whitelisted in your Personio API credentials:
- id
- first_name
- last_name
- position
- supervisor
- department
- office

Go to: **Personio Settings > Integrations > API credentials > [Your credentials] > Readable Attributes**
