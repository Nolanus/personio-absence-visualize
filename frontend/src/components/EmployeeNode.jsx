import { useState, useEffect } from 'react';
import './EmployeeNode.css';

function EmployeeNode({ employee, status }) {
  const [profilePicture, setProfilePicture] = useState(null);
  const [imageError, setImageError] = useState(false);

  const employeeId = employee.attributes?.id?.value;
  const firstName = employee.attributes?.first_name?.value || '';
  const lastName = employee.attributes?.last_name?.value || '';
  const position = employee.attributes?.position?.value || '';

  // Get initials for fallback
  const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();

  useEffect(() => {
    // Try to load profile picture (served by the same origin backend)
    if (employeeId && !imageError) {
      const imageUrl = `/api/profile-picture/${employeeId}?width=75`;
      setProfilePicture(imageUrl);
    }
  }, [employeeId, imageError]);

  const handleImageError = () => {
    setImageError(true);
    setProfilePicture(null);
  };

  const statusLabels = {
    available: 'Available',
    absent: 'Absent',
    sick: 'Sick Leave',
  };

  const handleClick = () => {
    // Open Personio absence page for this employee
    // Format: https://[company].personio.de/staff/[employee_id]/absence
    const personioUrl = `https://united-workspace.personio.de/staff/${employeeId}/absence`;
    window.open(personioUrl, '_blank');
  };

  return (
    <div
      className={`employee-node status-${status}`}
      onClick={handleClick}
      title={`${firstName} ${lastName} - Click to view in Personio`}
    >
      <div className="employee-avatar">
        {profilePicture && !imageError ? (
          <img src={profilePicture} alt={`${firstName} ${lastName}`} onError={handleImageError} />
        ) : (
          <div className="employee-initials">{initials}</div>
        )}
      </div>
      <div className="employee-info">
        <div className="employee-name">
          {firstName} {lastName}
        </div>
      </div>

      {/* Tooltip on hover */}
      <div className="employee-tooltip">
        <div className="tooltip-name">
          {firstName} {lastName}
        </div>
        {position && <div className="tooltip-position">{position}</div>}
        <div className="tooltip-status">Status: {statusLabels[status]}</div>
      </div>
    </div>
  );
}

export default EmployeeNode;
