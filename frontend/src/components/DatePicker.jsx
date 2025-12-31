import { format, addDays, subDays } from 'date-fns';
import './DatePicker.css';

function DatePicker({ selectedDate, onDateChange }) {
  const minDate = subDays(new Date(), 30);
  const maxDate = addDays(new Date(), 30);

  // Calculate days offset from today
  const getDayOffset = (date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);
    return Math.round((date - today) / (1000 * 60 * 60 * 24));
  };

  const currentOffset = getDayOffset(new Date(selectedDate));

  const handleSliderChange = (e) => {
    const offset = parseInt(e.target.value);
    const newDate = addDays(new Date(), offset);
    onDateChange(newDate);
  };

  const handleDateInputChange = (e) => {
    const newDate = new Date(e.target.value);
    onDateChange(newDate);
  };

  const handleToday = () => {
    onDateChange(new Date());
  };

  return (
    <div className="date-picker">
      <div className="date-picker-controls">
        <button
          className="date-picker-button"
          onClick={() => onDateChange(subDays(selectedDate, 1))}
          disabled={selectedDate <= minDate}
        >
          ← Previous
        </button>
        
        <input
          type="date"
          className="date-picker-input"
          value={format(selectedDate, 'yyyy-MM-dd')}
          min={format(minDate, 'yyyy-MM-dd')}
          max={format(maxDate, 'yyyy-MM-dd')}
          onChange={handleDateInputChange}
        />
        
        <button
          className="date-picker-button"
          onClick={handleToday}
        >
          Today
        </button>
        
        <button
          className="date-picker-button"
          onClick={() => onDateChange(addDays(selectedDate, 1))}
          disabled={selectedDate >= maxDate}
        >
          Next →
        </button>
      </div>
      
      <div className="date-picker-slider">
        <label htmlFor="date-slider">
          <span className="slider-label">-30 days</span>
          <input
            id="date-slider"
            type="range"
            min="-30"
            max="30"
            value={currentOffset}
            onChange={handleSliderChange}
            className="slider"
          />
          <span className="slider-label">+30 days</span>
        </label>
      </div>
      
      <div className="date-picker-display">
        {format(selectedDate, 'EEEE, MMMM d, yyyy')}
      </div>
    </div>
  );
}

export default DatePicker;
