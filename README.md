# Personio Absence Visualizer

A web application that visualizes employee presence in an organizational chart, showing real-time absence data from the Personio API.

## Features

- 📊 Interactive organizational chart visualization
- 📅 Date picker with slider to view any day (±30 days from today)
- 🎨 Color-coded employee status:
  - **Green**: Available
  - **Red**: Absent (vacation, time off, etc.)
  - **Gray**: Sick leave
- 🖼️ Employee profile pictures (with fallback to initials)
- 🔄 Automatic data caching for performance
- 📱 Responsive design

## Architecture

### Backend (Node.js + Express)
- Proxy server to bypass Personio's CORS restrictions
- Handles authentication with Personio API
- Caches API responses to reduce load
- Endpoints:
  - `/api/employees` - Fetch all employees
  - `/api/absences` - Fetch absence periods
  - `/api/time-off-types` - Fetch time-off type definitions
  - `/api/profile-picture/:employeeId` - Proxy employee photos

### Frontend (React + Vite)
- Single-page application built with React
- Components:
  - `DatePicker` - Date selection with slider
  - `OrgChart` - Organizational hierarchy visualization
  - `EmployeeNode` - Individual employee cards
- Uses `react-organizational-chart` for tree layout
- `date-fns` for date manipulation

## Prerequisites

- Node.js 18 or higher
- npm or yarn
- Personio API credentials (client_id and client_secret)

## Setup Instructions

### 1. Get Personio API Credentials

1. Log in to your Personio account
2. Go to **Settings > Integrations > API credentials**
3. Click **Generate new credentials**
4. Note down your `client_id` and `client_secret`
5. In the API credentials wizard, whitelist the following employee attributes:
   - id
   - first_name
   - last_name
   - position
   - supervisor
   - department
   - office

### 2. Install Dependencies

All dependencies are already installed. If you need to reinstall:

```bash
npm run install:all
```

### 3. Configure Personio Credentials

Create a `.env` file in the `backend` directory:

```bash
cp backend/.env.example backend/.env
```

Then edit `backend/.env` and add your credentials:

```env
PERSONIO_CLIENT_ID=your_client_id_here
PERSONIO_CLIENT_SECRET=your_client_secret_here
PORT=3001
```

### 4. Start the Application

Start both backend and frontend with a single command:

```bash
npm start
```

This will:
- Start the backend server on `http://localhost:3001`
- Start the frontend dev server on `http://localhost:3000`
- Open both in the same terminal with color-coded output

## Usage

1. Start the application: `npm start`
2. Open your browser and navigate to `http://localhost:3000`
3. The application will automatically load:
   - All employees from your Personio account
   - Absence data for ±30 days from today
   - Time-off type definitions
4. Use the date picker to select any day within the ±30 day range
5. The organizational chart will update to show employee status for the selected date

### Date Picker Controls

- **Previous/Next buttons**: Navigate day by day
- **Today button**: Jump to current date
- **Date input**: Select a specific date
- **Slider**: Quickly navigate through the ±30 day range

## API Endpoints

### Backend API

#### GET /api/employees
Fetch all employees from Personio.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "type": "Employee",
      "attributes": {
        "id": { "value": 123 },
        "first_name": { "value": "John" },
        "last_name": { "value": "Doe" },
        "position": { "value": "Developer" },
        "supervisor": { "value": { ... } }
      }
    }
  ]
}
```

#### GET /api/absences?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
Fetch absence periods within date range.

**Query Parameters:**
- `start_date` (required): Start date in YYYY-MM-DD format
- `end_date` (required): End date in YYYY-MM-DD format

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "type": "AbsencePeriod",
      "attributes": {
        "employee": { ... },
        "time_off_type": { "attributes": { "name": "Sick Leave" } },
        "start_date": "2024-01-15",
        "end_date": "2024-01-17"
      }
    }
  ]
}
```

#### GET /api/time-off-types
Fetch all time-off type definitions.

#### GET /api/profile-picture/:employeeId?width=75
Fetch employee profile picture.

**URL Parameters:**
- `employeeId`: Employee ID

**Query Parameters:**
- `width` (optional): Image width in pixels (default: 75)

## Customization

### Status Colors

To customize status colors, edit the CSS files:

- `frontend/src/App.css` - Legend colors
- `frontend/src/components/EmployeeNode.css` - Employee node border colors

### Sick Leave Detection

By default, the app identifies sick leave by checking if the time-off type name contains "sick" or "illness". To customize this logic, edit the `getEmployeeStatus` function in `frontend/src/App.jsx`:

```javascript
const isSick = absenceTypeName.includes('sick') || absenceTypeName.includes('illness');
```

### Date Range

To change the ±30 day range, edit the constants in:
- `frontend/src/App.jsx` (line 62-63)
- `frontend/src/components/DatePicker.jsx` (line 5-6)

## Troubleshooting

### "Failed to fetch data" Error
- Ensure the backend server is running on port 3001
- Check that your Personio API credentials are correct in `.env`
- Verify your network connection

### "No organizational structure available"
- Make sure the `supervisor` attribute is whitelisted in Personio API settings
- Check that employees have supervisor relationships defined in Personio

### Profile pictures not loading
- Verify that the `profile-picture` attribute is accessible via the API
- Check browser console for specific error messages
- The app will fall back to showing employee initials

### CORS errors
- Make sure you're accessing the frontend via `http://localhost:3000`, not directly opening the HTML file
- Ensure the backend server is properly configured and running

## Production Deployment

### Backend

1. Set environment variables on your server
2. Build and run:
   ```bash
   cd backend
   npm start
   ```

### Frontend

1. Update `API_BASE_URL` in `frontend/src/App.jsx` to your production backend URL
2. Build the frontend:
   ```bash
   cd frontend
   npm run build
   ```
3. Deploy the `dist` folder to your web server

## License

MIT

## Support

For issues related to:
- **Personio API**: Contact Personio support or check their [Developer Hub](https://developer.personio.de/)
- **This application**: Open an issue on GitHub
