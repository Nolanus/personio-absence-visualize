import { useState, useEffect, useCallback, useRef } from 'react';
import { format, addDays, subDays } from 'date-fns';
import OrgChart from './components/OrgChart';
import DatePicker from './components/DatePicker';
import './App.css';

const API_BASE_URL = 'http://localhost:3001/api';

function App() {
  // Initialize state from URL params
  const getInitialState = () => {
    const params = new URLSearchParams(window.location.search);
    const dateParam = params.get('date');
    const modeParam = params.get('mode');
    
    return {
      date: dateParam ? new Date(dateParam) : new Date(),
      mode: ['direct-count', 'direct-hours', 'all-count', 'all-hours'].includes(modeParam) 
        ? modeParam 
        : 'direct-count'
    };
  };
  
  const initialState = getInitialState();
  
  const [employees, setEmployees] = useState([]);
  const [absences, setAbsences] = useState([]);
  const [timeOffTypes, setTimeOffTypes] = useState([]);
  const [selectedDate, setSelectedDate] = useState(initialState.date);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [publicHolidays, setPublicHolidays] = useState([]);
  const [progressBarMode, setProgressBarMode] = useState(initialState.mode);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [layout, setLayout] = useState('top'); // 'top' or 'left'
  const chartRef = useRef(null);
  
  // Update URL when state changes
  useEffect(() => {
    const params = new URLSearchParams();
    params.set('date', format(selectedDate, 'yyyy-MM-dd'));
    params.set('mode', progressBarMode);
    
    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, '', newUrl);
  }, [selectedDate, progressBarMode]);

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

  // Load initial data
  useEffect(() => {
    loadData();
    loadPublicHolidays();
  }, []);

  // Load absences when date changes
  useEffect(() => {
    if (employees.length > 0) {
      loadAbsences();
    }
  }, [selectedDate, employees]);

  // Reload holidays when year changes
  useEffect(() => {
    loadPublicHolidays();
  }, [selectedDate.getFullYear()]);

  async function loadData() {
    try {
      setLoading(true);
      setError(null);

      // Load employees and time-off types in parallel
      const [employeesRes, timeOffTypesRes] = await Promise.all([
        fetch(`${API_BASE_URL}/employees`),
        fetch(`${API_BASE_URL}/time-off-types`),
      ]);

      if (!employeesRes.ok || !timeOffTypesRes.ok) {
        throw new Error('Failed to fetch data');
      }

      const employeesData = await employeesRes.json();
      const timeOffTypesData = await timeOffTypesRes.json();

      setEmployees(employeesData.data || []);
      setTimeOffTypes(timeOffTypesData.data || []);

      // Load absences for initial date range
      await loadAbsences();
    } catch (err) {
      setError(err.message);
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  }

  async function loadPublicHolidays() {
    try {
      const year = selectedDate.getFullYear();
      // Using Nager.Date API - free and open public holidays API
      // Germany country code: DE
      const response = await fetch(`https://date.nager.at/api/v3/publicholidays/${year}/DE`);
      
      if (!response.ok) {
        console.warn('Failed to fetch public holidays');
        return;
      }
      
      const holidays = await response.json();
      // Keep all holidays (both national and regional)
      console.log(`Loaded ${holidays.length} public holidays for ${year}`);
      setPublicHolidays(holidays);
    } catch (err) {
      console.warn('Error loading public holidays:', err);
      // Don't fail the app if holidays can't be loaded
    }
  }

  async function loadAbsences() {
    try {
      // Load ±30 days from selected date
      const startDate = format(subDays(selectedDate, 30), 'yyyy-MM-dd');
      const endDate = format(addDays(selectedDate, 60), 'yyyy-MM-dd'); // Extend to 60 days forward

      console.log(`Loading absences from ${startDate} to ${endDate}`);

      const response = await fetch(
        `${API_BASE_URL}/absences?start_date=${startDate}&end_date=${endDate}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch absences');
      }

      const data = await response.json();
      const absenceData = data.data || [];
      console.log(`Loaded ${absenceData.length} absences`);
      
      // Log unique employees with absences
      const employeesWithAbsences = new Set();
      absenceData.forEach(abs => {
        const empId = abs.attributes?.employee?.attributes?.id?.value;
        const email = abs.attributes?.employee?.attributes?.email?.value;
        if (empId) {
          employeesWithAbsences.add(`${empId} (${email})`);
        }
      });
      console.log(`Employees with absences:`, Array.from(employeesWithAbsences));
      
      setAbsences(absenceData);
    } catch (err) {
      console.error('Error loading absences:', err);
    }
  }

  // Mapping from Personio state names to API county codes
  const stateToCountyCode = {
    'Baden-Wuerttemberg': 'DE-BW',
    'Bayern': 'DE-BY',
    'Berlin': 'DE-BE',
    'Brandenburg': 'DE-BB',
    'Bremen': 'DE-HB',
    'Hamburg': 'DE-HH',
    'Hessen': 'DE-HE',
    'Mecklenburg-Vorpommern': 'DE-MV',
    'Niedersachsen': 'DE-NI',
    'NRW': 'DE-NW',
    'Rheinland-Pfalz': 'DE-RP',
    'Saarland': 'DE-SL',
    'Sachsen': 'DE-SN',
    'Sachsen-Anhalt': 'DE-ST',
    'Schleswig-Holstein': 'DE-SH',
    'Thueringen': 'DE-TH'
  };

  // Get employee status for selected date
  const getEmployeeStatus = useCallback((employeeId) => {
    const selectedDateStr = format(selectedDate, 'yyyy-MM-dd');
    const dayOfWeek = selectedDate.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    
    // Get employee's state from holiday calendar
    const employee = employees.find(emp => emp.attributes?.id?.value === employeeId);
    const employeeState = employee?.attributes?.holiday_calendar?.value?.attributes?.state;
    const employeeCountyCode = employeeState ? stateToCountyCode[employeeState] : null;
    
    // Check if selected date is a public holiday for this employee
    const publicHoliday = publicHolidays.find(holiday => {
      if (holiday.date !== selectedDateStr) return false;
      // Holiday is valid if it's global OR if it applies to employee's region
      return holiday.global || (employeeCountyCode && holiday.counties?.includes(employeeCountyCode));
    });
    const isPublicHoliday = !!publicHoliday;
    
    // PRIORITY 1: Check for absence first (absence always takes priority)
    const absence = absences.find((abs) => {
      const empId = abs.attributes?.employee?.attributes?.id?.value;
      if (empId !== employeeId) return false;

      // Check if absence covers selected date
      // Dates from API are in ISO format: "2026-01-02T00:00:00+01:00"
      // Extract just the date part for comparison
      const startDate = abs.attributes?.start_date?.split('T')[0];
      const endDate = abs.attributes?.end_date?.split('T')[0];
      
      if (!startDate || !endDate) return false;
      
      const isInRange = startDate <= selectedDateStr && endDate >= selectedDateStr;
      
      return isInRange;
    });

    if (absence) {
      // Check if it's sick leave
      const absenceTypeName = absence.attributes?.time_off_type?.attributes?.name?.toLowerCase() || '';
      const isSick = absenceTypeName.includes('sick') || absenceTypeName.includes('illness');
      
      if (isSick) {
        return { status: 'sick', reason: 'sick-leave', label: 'Sick' };
      } else {
        return { status: 'absent', reason: 'absence', label: 'Absent' };
      }
    }
    
    // PRIORITY 2: Check if it's a public holiday
    if (isPublicHoliday) {
      return { status: 'non-working-day', reason: 'public-holiday', label: publicHoliday.name };
    }
    
    // PRIORITY 3: Check if employee works on this day of the week
    if (employee) {
      const workScheduleValue = employee.attributes?.work_schedule?.value;
      
      // Work schedule is nested: value.attributes contains the day info
      const workSchedule = workScheduleValue?.attributes;
      
      if (workSchedule && typeof workSchedule === 'object') {
        const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const dayName = dayNames[dayOfWeek];
        const hoursForDay = workSchedule[dayName];
        
        // Personio returns time strings like "08:00" for working days and "00:00" for non-working days
        if (hoursForDay === '00:00' || hoursForDay === 0 || !hoursForDay) {
          // Check if it's weekend
          const isWeekend = dayOfWeek === 0 || dayOfWeek === 6; // Sunday or Saturday
          return {
            status: 'non-working-day',
            reason: isWeekend ? 'weekend' : 'off-day',
            label: isWeekend ? 'Weekend' : 'Off Day'
          };
        }
      }
    }

    // PRIORITY 4: Default to available
    return { status: 'available', reason: 'available', label: 'Available' };
  }, [selectedDate, absences, publicHolidays, employees]);

  if (loading) {
    return (
      <div className="app">
        <div className="loading">Loading employee data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="app">
        <div className="error">
          <h2>Error</h2>
          <p>{error}</p>
          <p>Make sure the backend server is running and Personio credentials are configured.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <div className="header-left">
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <h1>Personio Absence Visualizer</h1>
              <button 
                className="layout-button"
                onClick={() => setLayout(layout === 'top' ? 'left' : 'top')}
                title={`Switch to ${layout === 'top' ? 'Left' : 'Top'} Layout`}
              >
                {layout === 'top' ? '↔' : '↕'}
              </button>
              <button 
                className="fit-button"
                onClick={() => chartRef.current?.fit()}
                title="Fit to Screen"
              >
                ⤢
              </button>
              <button 
                className="fullscreen-button"
                onClick={toggleFullscreen}
                title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
              >
                {isFullscreen ? '⊗' : '⛶'}
              </button>
            </div>
            <div className="info-bar">
              <span>📊 {employees.length} employee{employees.length !== 1 ? 's' : ''}</span>
            </div>
          </div>
          
          <div className="header-center">
            <DatePicker
              selectedDate={selectedDate}
              onDateChange={setSelectedDate}
            />
          </div>
          
          <div className="header-right">
            <div className="header-right-content">
              <div className="progress-bar-mode">
                <label htmlFor="progress-mode">Progress Bar:</label>
                <select 
                  id="progress-mode"
                  value={progressBarMode} 
                  onChange={(e) => setProgressBarMode(e.target.value)}
                >
                  <option value="direct-count">Direct Reportees (Count)</option>
                  <option value="direct-hours">Direct Reportees (Hours)</option>
                  <option value="all-count">All Reportees (Count)</option>
                  <option value="all-hours">All Reportees (Hours)</option>
                </select>
              </div>
              <div className="legend">
                <div className="legend-item">
                  <span className="legend-color available"></span>
                  <span>Available</span>
                </div>
                <div className="legend-item">
                  <span className="legend-color absent"></span>
                  <span>Absent</span>
                </div>
                <div className="legend-item">
                  <span className="legend-color sick"></span>
                  <span>Sick</span>
                </div>
                <div className="legend-item">
                  <span className="legend-color non-working-day"></span>
                  <span>Off Day</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="org-chart-container">
        <OrgChart
          ref={chartRef}
          employees={employees}
          getEmployeeStatus={getEmployeeStatus}
          progressBarMode={progressBarMode}
          layout={layout}
        />
      </div>
    </div>
  );
}

export default App;
