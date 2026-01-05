import { useRef } from 'react';
import { format, addDays, subDays } from 'date-fns';
import './DatePicker.css';

function DatePicker({ selectedDate, onDateChange }) {
  const dateInputRef = useRef(null);
  // Helper to check if date is valid
  const isValidDate = (date) => date instanceof Date && !isNaN(date);

  const safeFormat = (date, formatStr) => {
    if (!isValidDate(date)) return 'Invalid Date';
    return format(date, formatStr);
  };

  const handleDateInputChange = (e) => {
    const val = e.target.value;
    if (!val) {
      // If cleared, default to today
      onDateChange(new Date());
      return;
    }
    const newDate = new Date(val);
    if (isValidDate(newDate)) {
      onDateChange(newDate);
    }
  };

  const handleLabelClick = (e) => {
    e.preventDefault();
    try {
      if (dateInputRef.current) {
        dateInputRef.current.showPicker();
      }
    } catch (err) {
      // Fallback or ignore if not supported (e.g. Safari < 16)
      // In that case, the htmlFor behavior usually handles focus
    }
  };

  const handleToday = () => {
    onDateChange(new Date());
  };

  return (
    <div className="date-picker-simple">
      <button className="date-nav-button" onClick={() => onDateChange(subDays(selectedDate, 1))}>
        &lt; Previous
      </button>

      <div className="date-display-wrapper" onClick={handleLabelClick}>
        <input
          ref={dateInputRef}
          type="date"
          className="date-input-hidden"
          value={safeFormat(selectedDate, 'yyyy-MM-dd')}
          onChange={handleDateInputChange}
          id="date-input-trigger"
        />
        <label
          htmlFor="date-input-trigger"
          className="date-display-label"
          style={{ cursor: 'pointer' }}
        >
          {safeFormat(selectedDate, 'EEE dd. MMM yyyy')} ›
        </label>
      </div>

      <button className="date-nav-button" onClick={() => onDateChange(addDays(selectedDate, 1))}>
        Next &gt;
      </button>

      {/* Helper to jump to today if needed, maybe hidden or small icon? Mockup doesn't show it explicitly but it's useful. Keeping it out for strict mockup adherence or maybe small text? Let's hide it for now to match visual. */}
    </div>
  );
}

export default DatePicker;
