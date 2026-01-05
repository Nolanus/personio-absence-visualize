import { useState, useEffect, useCallback, useRef } from 'react';
import { format } from 'date-fns';
import OrgChart from './components/OrgChart';
import DatePicker from './components/DatePicker';
import './App.css';
import { AuthenticatedTemplate, UnauthenticatedTemplate, useMsal } from '@azure/msal-react';
import { loginRequest } from './authConfig';

// When running behind the Node.js server and Docker, the frontend and API share the same origin.
const API_BASE_URL = '/api';
const RUNTIME_CONFIG = window.__SCHEDULE_VIEWER_CONFIG__ || {};
const AUTH_ENABLED = RUNTIME_CONFIG.authEnabled !== false;
const COMPANY_NAME = RUNTIME_CONFIG.companyName || 'Organization';

// Mapping from Personio state names to API county codes
const stateToCountyCode = {
  'Baden-Wuerttemberg': 'DE-BW',
  Bayern: 'DE-BY',
  Berlin: 'DE-BE',
  Brandenburg: 'DE-BB',
  Bremen: 'DE-HB',
  Hamburg: 'DE-HH',
  Hessen: 'DE-HE',
  'Mecklenburg-Vorpommern': 'DE-MV',
  Niedersachsen: 'DE-NI',
  NRW: 'DE-NW',
  'Rheinland-Pfalz': 'DE-RP',
  Saarland: 'DE-SL',
  Sachsen: 'DE-SN',
  'Sachsen-Anhalt': 'DE-ST',
  'Schleswig-Holstein': 'DE-SH',
  Thueringen: 'DE-TH',
};

function App() {
  // Initialize state from URL params
  const getInitialState = () => {
    const params = new URLSearchParams(window.location.search);
    const dateParam = params.get('date');
    const modeParam = params.get('mode');
    const themeParam = params.get('theme');

    const initialState = {
      date: dateParam ? new Date(dateParam) : new Date(),
      mode: ['direct-count', 'direct-hours', 'all-count', 'all-hours'].includes(modeParam)
        ? modeParam
        : 'direct-count',
      darkMode:
        themeParam === 'dark' || (themeParam === null && localStorage.getItem('theme') === 'dark'),
    };
    return initialState;
  };

  const initialState = getInitialState();

  // Helper to check if date is valid
  const isValidDate = (date) => date instanceof Date && !isNaN(date);

  const safeFormat = useCallback((date, formatStr) => {
    if (!isValidDate(date)) return 'Invalid Date';
    return format(date, formatStr);
  }, []);

  const { instance, accounts } = useMsal();
  const [accessToken, setAccessToken] = useState(null);
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    if (accounts.length > 0) {
      const request = {
        ...loginRequest,
        account: accounts[0],
      };
      instance
        .acquireTokenSilent(request)
        .then((response) => {
          setAccessToken(response.accessToken);
          setAuthError(null);
        })
        .catch((e) => {
          console.error('[Auth] AcquireTokenSilent failed:', e);
          setAuthError(e);
        });
    }
  }, [instance, accounts]);

  const [employees, setEmployees] = useState([]);
  const [absences, setAbsences] = useState([]);
  const [selectedDate, setSelectedDate] = useState(
    isValidDate(initialState.date) ? initialState.date : new Date(),
  );
  const [publicHolidays, setPublicHolidays] = useState([]);
  const [progressBarMode, setProgressBarMode] = useState(initialState.mode);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [layout, setLayout] = useState('top'); // 'top', 'left', 'bottom', 'right'
  const [lastAbsenceSync, setLastAbsenceSync] = useState(null);
  const [darkMode, setDarkMode] = useState(initialState.darkMode);
  const chartRef = useRef(null);
  const lastLoadedMonthRef = useRef(null);
  const lastLoadedYearRef = useRef(null);

  // Update URL when state changes
  useEffect(() => {
    if (!isValidDate(selectedDate)) return;
    const params = new URLSearchParams();
    params.set('date', safeFormat(selectedDate, 'yyyy-MM-dd'));
    params.set('mode', progressBarMode);
    if (darkMode) params.set('theme', 'dark');

    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, '', newUrl);

    // Also save to localStorage for persistence
    localStorage.setItem('theme', darkMode ? 'dark' : 'light');
  }, [selectedDate, progressBarMode, darkMode, safeFormat]);

  // Fullscreen handler
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  // Listen for fullscreen changes (e.g., user pressing ESC)
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);



  const authorizedFetch = useCallback(
    (url, options = {}) => {
      if (AUTH_ENABLED && !accessToken) {
        throw new Error('No Microsoft access token available');
      }
      const headers = {
        ...(options.headers || {}),
      };

      if (AUTH_ENABLED && accessToken) {
        headers.Authorization = `Bearer ${accessToken}`;
      }

      return fetch(url, { ...options, headers });
    },
    [accessToken],
  );

  const [profilePictures, setProfilePictures] = useState({});
  const failedImagesRef = useRef(new Set());

  const loadProfilePictures = useCallback(
    async (employeeList) => {
      const newProfilePictures = {};

      // Simply map employee IDs to their API endpoint URLs
      // The backend caches these for 24 hours, so this is efficient
      for (const emp of employeeList) {
        const id = emp.attributes?.id?.value;
        if (id && !profilePictures[id] && !failedImagesRef.current.has(id)) {
          newProfilePictures[id] = `${API_BASE_URL}/profile-picture/${id}`;
        }
      }

      if (Object.keys(newProfilePictures).length > 0) {
        setProfilePictures((prev) => ({ ...prev, ...newProfilePictures }));
      }
    },
    [profilePictures],
  );

  const loadPublicHolidays = useCallback(async () => {
    if (!isValidDate(selectedDate)) return;
    const year = selectedDate.getFullYear();

    // Avoid re-fetching if we already have the data for this year
    if (lastLoadedYearRef.current === year) return;

    try {
      // Using Nager.Date API - free and open public holidays API
      // Germany country code: DE
      const response = await fetch(`https://date.nager.at/api/v3/publicholidays/${year}/DE`);

      if (!response.ok) {
        return;
      }

      const holidays = await response.json();
      // Keep all holidays (both national and regional)
      setPublicHolidays(holidays);
      lastLoadedYearRef.current = year;
    } catch {
      // Don't fail the app if holidays can't be loaded
    }
  }, [selectedDate]);

  const loadAbsences = useCallback(async () => {
    if (!isValidDate(selectedDate)) return;
    try {
      // Request the full month containing the selected date for efficient caching
      // This way, navigating within the same month uses cached data
      const year = selectedDate.getFullYear();
      const month = selectedDate.getMonth(); // 0-indexed
      const monthKey = `${year}-${month}`;

      // Avoid re-fetching if we already have the data for this month
      if (lastLoadedMonthRef.current === monthKey) return;

      // First day of the month
      const startDate = format(new Date(year, month, 1), 'yyyy-MM-dd');
      // Last day of the month
      const endDate = format(new Date(year, month + 1, 0), 'yyyy-MM-dd');

      const response = await authorizedFetch(
        `${API_BASE_URL}/absences?start_date=${startDate}&end_date=${endDate}`,
      );

      if (!response.ok) {
        throw new Error('Failed to fetch absences');
      }

      const data = await response.json();
      const absenceData = data.data || [];

      setAbsences(absenceData);
      lastLoadedMonthRef.current = monthKey;
      if (data.lastUpdated) {
        setLastAbsenceSync(data.lastUpdated);
      }
    } catch {
      // Error handling - silently fail to avoid disrupting UI
    }
  }, [selectedDate, authorizedFetch]);

  const loadData = useCallback(async () => {
    try {
      // Load employees and time-off types in parallel
      const employeesRes = await authorizedFetch(`${API_BASE_URL}/employees`);

      if (!employeesRes.ok) {
        throw new Error('Failed to fetch data');
      }

      const employeesData = await employeesRes.json();
      const loadedEmployees = employeesData.data || [];

      setEmployees(loadedEmployees);

      // Load absences for initial date range
      await loadAbsences();

      // Load profile pictures for all employees
      loadProfilePictures(loadedEmployees);
    } catch (err) {
      console.error(err.message);
    }
  }, [authorizedFetch, loadAbsences, loadProfilePictures]);


  // Load initial data once we have an access token (or immediately if auth is disabled)
  useEffect(() => {
    if (AUTH_ENABLED && !accessToken) return;
    loadData();
    loadPublicHolidays();
  }, [accessToken, loadData, loadPublicHolidays]);

  // Load absences when date changes (or immediately if auth is disabled)
  useEffect(() => {
    if (employees.length > 0 && (!AUTH_ENABLED || accessToken)) {
      loadAbsences();
    }
  }, [selectedDate, employees, accessToken, loadAbsences]);

  // Reload holidays when year changes
  useEffect(() => {
    if (!isValidDate(selectedDate)) return;
    loadPublicHolidays();
  }, [selectedDate, loadPublicHolidays]);


  const getEmployeeStatus = useCallback(
    (employeeId) => {
      if (!isValidDate(selectedDate)) return { status: 'loading', label: 'Loading...' };
      const selectedDateStr = safeFormat(selectedDate, 'yyyy-MM-dd');
      const dayOfWeek = selectedDate.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday

      // Get employee's state from holiday calendar
      const employee = employees.find((emp) => emp.attributes?.id?.value === employeeId);
      const employeeState = employee?.attributes?.holiday_calendar?.value?.attributes?.state;
      const employeeCountyCode = employeeState ? stateToCountyCode[employeeState] : null;

      // Check if selected date is a public holiday for this employee
      const publicHoliday = publicHolidays.find((holiday) => {
        if (holiday.date !== selectedDateStr) return false;
        // Holiday is valid if it's global OR if it applies to employee's region
        return (
          holiday.global || (employeeCountyCode && holiday.counties?.includes(employeeCountyCode))
        );
      });
      const isPublicHoliday = !!publicHoliday;

      // Base working/non-working status
      let baseStatus = 'available';
      let baseLabel = 'Available';

      // Check if it's a public holiday
      if (isPublicHoliday) {
        baseStatus = 'non-working-day';
        baseLabel = publicHoliday.name;
      } else if (employee) {
        // Check work schedule
        const workSchedule = employee.attributes?.work_schedule?.value?.attributes;
        if (workSchedule && typeof workSchedule === 'object') {
          const dayNames = [
            'sunday',
            'monday',
            'tuesday',
            'wednesday',
            'thursday',
            'friday',
            'saturday',
          ];
          const hoursForDay = workSchedule[dayNames[dayOfWeek]];
          if (hoursForDay === '00:00' || hoursForDay === 0 || !hoursForDay) {
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
            baseStatus = 'non-working-day';
            baseLabel = isWeekend ? 'Weekend' : 'Off Day';
          }
        }
      }

      // Initialize AM/PM statuses with base status
      let amStatus = baseStatus;
      let pmStatus = baseStatus;


      // Filter all absences for this employee on this date
      const relevantAbsences = absences.filter((abs) => {
        const empId = abs.attributes?.employee?.attributes?.id?.value;
        if (empId !== employeeId) return false;

        const startDate = abs.attributes?.start_date?.split('T')[0];
        const endDate = abs.attributes?.end_date?.split('T')[0];
        return startDate <= selectedDateStr && endDate >= selectedDateStr;
      });

      // Helper to get weight for precedence (lower is higher priority)
      const getStatusWeight = (status) => {
        if (status === 'absent') return 1;
        if (status === 'sick') return 2;
        if (status === 'non-working-day') return 3;
        return 4;
      };

      relevantAbsences.forEach((abs) => {
        const startDate = abs.attributes?.start_date?.split('T')[0];
        const endDate = abs.attributes?.end_date?.split('T')[0];
        const isStartDay = selectedDateStr === startDate;
        const isEndDay = selectedDateStr === endDate;

        const absenceType = abs.attributes?.time_off_type?.attributes;
        const absenceTypeName = absenceType?.name?.toLowerCase() || '';
        const absenceCategory = absenceType?.category || '';

        const isSick =
          absenceCategory === 'sick_leave' ||
          absenceTypeName.includes('sick') ||
          absenceTypeName.includes('illness');

        const typeStatus = isSick ? 'sick' : 'absent';

        // Determine segments affected by this record
        let affectsAM = true;
        let affectsPM = true;

        if (isStartDay && abs.attributes?.half_day_start) {
          affectsPM = false; // Swapped: Start day half-day -> only AM affected
        }
        if (isEndDay && abs.attributes?.half_day_end) {
          affectsAM = false; // Swapped: End day half-day -> only PM affected
        }

        // Special case: single day that is half_day_start AND half_day_end? Usually unlikely in Personio but let's be safe.
        // If affectsAM is false and affectsPM is false, it means it's a zero-length absence?
        // Actually, if it's a single day and "half_day_start" is true, it usually means the afternoon.

        // Apply precedence
        if (affectsAM && getStatusWeight(typeStatus) < getStatusWeight(amStatus)) {
          amStatus = typeStatus;
        }
        if (affectsPM && getStatusWeight(typeStatus) < getStatusWeight(pmStatus)) {
          pmStatus = typeStatus;
        }
      });

      // Final result determination
      const isHalfDay = amStatus !== pmStatus;

      // Overall status (for colors and routing) follow precedence
      const finalStatus =
        getStatusWeight(amStatus) <= getStatusWeight(pmStatus) ? amStatus : pmStatus;

      // Status label logic
      let finalLabel = baseLabel;
      if (amStatus === pmStatus && amStatus !== baseStatus) {
        // Full day absence
        const absence = relevantAbsences[0]; // Just for date formatting
        const start = format(new Date(absence.attributes.start_date), 'dd.MM.');
        const end = format(new Date(absence.attributes.end_date), 'dd.MM.');
        const dateLabel = start === end ? `(${start})` : `(${start} - ${end})`;
        finalLabel = `${amStatus === 'sick' ? 'Sick' : 'Absent'} ${dateLabel}`;
      } else if (isHalfDay) {
        // Half day absence
        // User said: "label should be absence, as absence should always take precedence"
        // If mixed with working, use "½ Absent" or "½ Sick"
        // If mixed with each other (e.g. AM Absent, PM Sick), use "Absent" (due to precedence)


        // If BOTH are absences but different, precedence wins label
        const displayStatus = amStatus === 'absent' || pmStatus === 'absent' ? 'Absent' : 'Sick';

        finalLabel = `½ ${displayStatus}`;
      }

      return {
        status: finalStatus,
        label: finalLabel,
        isHalfDay: isHalfDay,
        amStatus: amStatus,
        pmStatus: pmStatus,
        absentHalf: amStatus !== baseStatus ? 'first' : 'second', // Used by OrgChart for split detection
      };
    },
    [selectedDate, absences, publicHolidays, employees, safeFormat],
  );

  const Dashboard = (
    <div className={`app ${darkMode ? 'dark-mode' : ''}`}>
      {authError && (
        <div
          className="auth-error-banner"
          style={{
            backgroundColor: '#fde8e8',
            color: '#c53030',
            padding: '12px',
            textAlign: 'center',
            position: 'absolute',
            top: 0,
            width: '100%',
            zIndex: 100,
          }}
        >
          <p>
            <strong>Authentication Warning:</strong> Could not acquire API access token.
          </p>
          <p>Details: {authError.message}</p>
        </div>
      )}

      <header className="app-header">
        <div className="header-content">
          {/* Left: Logo */}
          <div className="header-left">
            <div className="logo">
              <div className="logo-icon">
                <img
                  src="/absence_visualizer_icon_light.png"
                  alt="Logo"
                  style={{ width: '28px', height: '28px', borderRadius: '4px' }}
                  onError={(e) => {
                    console.error('[Asset] Logo failed to load from /absence_visualizer_icon_light.png');
                    e.target.style.display = 'none';
                  }}
                />
              </div>
              <div className="logo-text">Personio absence visualizer</div>
            </div>
          </div>

          {/* Center: Date Picker */}
          <div className="header-center">
            <DatePicker selectedDate={selectedDate} onDateChange={setSelectedDate} />
          </div>

          {/* Right: User Profile */}
          <div className="header-right">
            {AUTH_ENABLED ? (
              <div className="user-profile">
                <span className="user-name">{accounts[0]?.name?.split(' ')[0] || 'Me'}</span>
                <div className="user-avatar">
                  {/* Try to find user's own picture in the loaded list, otherwise generic */}
                  {/* We reuse the generic logic or just an icon for now */}
                  <img
                    src={
                      profilePictures[accounts[0]?.homeAccountId] ||
                      `https://ui-avatars.com/api/?name=${accounts[0]?.name}&background=random`
                    }
                    alt="Me"
                    onError={(e) => {
                      e.target.onerror = null;
                      e.target.src = `https://ui-avatars.com/api/?name=${accounts[0]?.name}&background=random`;
                    }}
                  />
                </div>
                <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>▼</span>

                <div className="logout-dropdown">
                  <button
                    className="logout-button"
                    onClick={async () => {
                      try {
                        // 1. Clear backend session cookie
                        await fetch(`${API_BASE_URL}/logout`, {
                          method: 'POST',
                          credentials: 'include',
                        });
                      } catch (err) {
                        console.error('Logout endpoint error:', err);
                      }

                      // 2. Perform "Local Logout" in MSAL
                      // This clears local storage/cache without redirecting to M365 end-session endpoint
                      instance.logoutRedirect({
                        account: accounts[0],
                        onRedirectNavigate: () => {
                          // Returning false prevents the browser from navigating to the M365 logout page
                          return false;
                        },
                      });

                      // 3. Force a reload to the login page immediately
                      window.location.href = window.location.origin;
                    }}
                  >
                    Sign Out
                  </button>
                </div>
              </div>
            ) : (
              <div className="user-profile">
                <span className="user-name">Guest</span>
                <div className="user-avatar">
                  <img src="https://ui-avatars.com/api/?name=Guest&background=6b7280" alt="Guest" />
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="org-chart-container">
        <div className="info-bar-floating">
          <span className="info-item">{employees.length} employees loaded</span>
          {lastAbsenceSync && (
            <>
              <span className="info-separator">•</span>
              <span className="info-item">Last sync: {format(lastAbsenceSync, 'HH:mm')}</span>
            </>
          )}
        </div>

        <OrgChart
          ref={chartRef}
          employees={employees}
          getEmployeeStatus={getEmployeeStatus}
          progressBarMode={progressBarMode}
          layout={layout}
          profilePictures={profilePictures}
          selectedDate={selectedDate}
          isDarkMode={darkMode}
          companyName={COMPANY_NAME}
        />

        {/* Floating Legend (Bottom Left) */}
        <div className="floating-legend">
          <div className="legend-pill">
            <span className="dot available"></span> Available
          </div>
          <div className="legend-pill">
            <span className="dot absent"></span> Absent
          </div>
          <div className="legend-pill">
            <span className="dot sick"></span> Sick
          </div>
          <div className="legend-pill">
            <span className="dot off"></span> Off Day
          </div>
        </div>

        {/* Floating Controls (Bottom Center) */}
        <div className="floating-controls">
          {/* Layout Toggle */}
          <button
            className="control-btn"
            onClick={() => setLayout(layout === 'top' ? 'left' : 'top')}
            title={`Switch Layout (Current: ${layout})`}
          >
            {layout === 'top' ? '↔' : '↕'}
          </button>

          {/* Theme Toggle */}
          <button
            className="control-btn"
            onClick={() => setDarkMode(!darkMode)}
            title={`Switch to ${darkMode ? 'Light' : 'Dark'} Mode`}
          >
            {darkMode ? '☀️' : '🌙'}
          </button>

          {/* Progress Mode Select */}
          <select
            className="control-select"
            value={progressBarMode}
            onChange={(e) => setProgressBarMode(e.target.value)}
          >
            <option value="direct-count">Direct (Count)</option>
            <option value="direct-hours">Direct (Hours)</option>
            <option value="all-count">All (Count)</option>
            <option value="all-hours">All (Hours)</option>
          </select>

          {/* Fit */}
          <button
            className="control-btn"
            onClick={() => chartRef.current?.fit()}
            title="Fit to Screen"
          >
            ⤢
          </button>

          {/* Fullscreen */}
          <button
            className="control-btn"
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
          >
            {isFullscreen ? '⊗' : '⛶'}
          </button>
        </div>
      </div>
    </div>
  );

  if (!AUTH_ENABLED) {
    return Dashboard;
  }

  return (
    <>
      <UnauthenticatedTemplate>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            fontFamily: 'Inter, system-ui, Avenir, Helvetica, Arial, sans-serif',
          }}
        >
          <h1>Personio Absence Visualizer</h1>
          <p>Please sign in with your Microsoft account to continue.</p>
          <button
            onClick={() => instance.loginRedirect(loginRequest)}
            style={{
              padding: '10px 20px',
              fontSize: '16px',
              backgroundColor: '#0078d4',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              marginTop: '20px',
            }}
          >
            Sign In with Microsoft
          </button>
        </div>
      </UnauthenticatedTemplate>

      <AuthenticatedTemplate>{Dashboard}</AuthenticatedTemplate>
    </>
  );
}

export default App;
