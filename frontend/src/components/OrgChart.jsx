import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { OrgChart as D3OrgChart } from 'd3-org-chart';
import './OrgChart.css';

const OrgChart = forwardRef(({ employees, getEmployeeStatus, progressBarMode, layout }, ref) => {
  const chartRef = useRef(null);
  const d3ChartRef = useRef(null);
  const previousDataRef = useRef(new Map());
  
  // Expose fit method to parent
  useImperativeHandle(ref, () => ({
    fit: () => {
      if (d3ChartRef.current) {
        d3ChartRef.current.fit();
      }
    }
  }));

  useEffect(() => {
    if (!employees || employees.length === 0 || !chartRef.current) {
      return;
    }
    
    // Initialize chart only once
    if (!d3ChartRef.current) {
      d3ChartRef.current = new D3OrgChart();
    }

    // Transform employees to d3-org-chart format
    // Include active and onboarding employees, exclude former and paused
    const activeEmployees = employees.filter(emp => {
      const status = emp.attributes?.status?.value?.toLowerCase();
      return status === 'active' || status === 'onboarding';
    });
    
    // Create a Set of valid employee IDs for quick lookup
    const validIds = new Set(activeEmployees.map(emp => String(emp.attributes?.id?.value)));
    
    // Track employees without valid parents (will be roots)
    const rootEmployeeIds = [];
    
    // Build a map of parent -> children for subordinate counting
    const childrenMap = new Map();
    activeEmployees.forEach(emp => {
      const id = emp.attributes?.id?.value;
      const supervisorAttr = emp.attributes?.supervisor;
      let parentId = null;
      
      if (supervisorAttr?.value) {
        parentId = supervisorAttr.value.attributes?.id?.value ||
                   supervisorAttr.value.id ||
                   supervisorAttr.value.value ||
                   (typeof supervisorAttr.value === 'number' ? supervisorAttr.value : null);
      }
      
      if (parentId && validIds.has(String(parentId))) {
        if (!childrenMap.has(String(parentId))) {
          childrenMap.set(String(parentId), []);
        }
        childrenMap.get(String(parentId)).push(String(id));
      }
    });
    
    // Helper to get employee weekly hours
    const getEmployeeWeeklyHours = (empId) => {
      const employee = activeEmployees.find(e => String(e.attributes?.id?.value) === String(empId));
      if (!employee) return 0;
      
      const workScheduleValue = employee.attributes?.work_schedule?.value;
      const workSchedule = workScheduleValue?.attributes;
      
      if (!workSchedule) return 0;
      
      const dayNames = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
      let totalHours = 0;
      
      dayNames.forEach(day => {
        const hoursStr = workSchedule[day];
        if (hoursStr && hoursStr !== '00:00') {
          // Parse "08:00" format to hours
          const [hours, minutes] = hoursStr.split(':').map(Number);
          totalHours += hours + (minutes / 60);
        }
      });
      
      return totalHours;
    };
    
    // Function to count all subordinates recursively
    const countAllSubordinates = (empId) => {
      const directChildren = childrenMap.get(String(empId)) || [];
      let total = directChildren.length;
      directChildren.forEach(childId => {
        total += countAllSubordinates(childId);
      });
      return total;
    };
    
    const chartData = activeEmployees.map(emp => {
        const id = emp.attributes?.id?.value;
        const firstName = emp.attributes?.first_name?.value || '';
        const lastName = emp.attributes?.last_name?.value || '';
        const position = emp.attributes?.position?.value || '';
        const email = emp.attributes?.email?.value || '';
        
        // Get supervisor ID
        let parentId = null;
        const supervisorAttr = emp.attributes?.supervisor;
        if (supervisorAttr?.value) {
          parentId = supervisorAttr.value.attributes?.id?.value ||
                     supervisorAttr.value.id ||
                     supervisorAttr.value.value ||
                     (typeof supervisorAttr.value === 'number' ? supervisorAttr.value : null);
        }
        
        // Validate that parent exists in active employees, otherwise set to null (root)
        if (parentId && !validIds.has(String(parentId))) {
          console.warn(`Employee ${firstName} ${lastName} (${id}) has invalid supervisor ID ${parentId} - treating as root`);
          parentId = null;
        }
        
        // Track root employees (no parent)
        if (!parentId) {
          rootEmployeeIds.push(String(id));
        }

        const statusInfo = getEmployeeStatus(id);
        // getEmployeeStatus now always returns object format: {status, reason, label}
        const status = statusInfo.status;
        const statusLabel = statusInfo.label;
        
        // Count subordinates for status bar
        const subordinateCount = countAllSubordinates(id);

        // Reuse existing data object if it exists to preserve _collapsed state
        const existingData = previousDataRef.current.get(String(id));
        const nodeData = existingData || {
          id: String(id),
          parentId: parentId ? String(parentId) : '',
          name: `${firstName} ${lastName}`,
          firstName,
          lastName,
          position,
          email,
          imageUrl: `http://localhost:3001/api/profile-picture/${id}?width=100`,
          _directSubordinates: subordinateCount,
          _allSubordinatesData: childrenMap.get(String(id)) || [],
          _subordinateStatuses: null
        };
        
        // Note: We don't set _collapsed here anymore
        // We'll handle expansion state after render
        
        // Update fields that can change
        nodeData.status = status;
        nodeData.statusLabel = statusLabel;
        nodeData.parentId = parentId ? String(parentId) : '';
        nodeData._directSubordinates = subordinateCount;
        nodeData._allSubordinatesData = childrenMap.get(String(id)) || [];
        
        // Store for next render
        previousDataRef.current.set(String(id), nodeData);
        
        return nodeData;
      });
    
    // Calculate subordinate statuses for each employee with subordinates
    chartData.forEach(emp => {
      const directChildren = childrenMap.get(String(emp.id)) || [];
      
      if (directChildren.length > 0) {
        // Collect subordinate IDs based on mode
        const collectDirectSubordinates = () => directChildren;
        
        const collectAllSubordinates = (empId) => {
          const result = [];
          const children = childrenMap.get(String(empId)) || [];
          children.forEach(childId => {
            result.push(childId);
            result.push(...collectAllSubordinates(childId));
          });
          return result;
        };
        
        // Store both direct and all subordinate statuses
        const calculateStatuses = (subordinateIds, useHours) => {
          const statusCounts = { available: 0, absent: 0, sick: 0, nonWorking: 0 };
          
          subordinateIds.forEach(subId => {
            const subordinate = chartData.find(e => e.id === subId);
            if (subordinate) {
              const weight = useHours ? getEmployeeWeeklyHours(subId) : 1;
              
              if (subordinate.status === 'available') statusCounts.available += weight;
              else if (subordinate.status === 'absent') statusCounts.absent += weight;
              else if (subordinate.status === 'sick') statusCounts.sick += weight;
              else if (subordinate.status === 'non-working-day') statusCounts.nonWorking += weight;
            }
          });
          
          return statusCounts;
        };
        
        // Calculate all four modes
        emp._subordinateStatuses = {
          'direct-count': calculateStatuses(collectDirectSubordinates(), false),
          'direct-hours': calculateStatuses(collectDirectSubordinates(), true),
          'all-count': calculateStatuses(collectAllSubordinates(emp.id), false),
          'all-hours': calculateStatuses(collectAllSubordinates(emp.id), true)
        };
      }
    });
    
    // d3-org-chart requires a single root
    // If we have multiple roots, create a virtual root node
    if (rootEmployeeIds.length > 1) {
      console.log(`Multiple root employees (${rootEmployeeIds.length}), creating virtual root`);
      
      // Add virtual root
      chartData.unshift({
        id: 'virtual-root',
        parentId: '',
        name: 'Organization',
        firstName: '',
        lastName: '',
        position: '',
        email: '',
        status: 'available',
        statusLabel: '',
        imageUrl: '',
        isVirtual: true
      });
      
      // Update root employees to point to virtual root
      chartData.forEach(emp => {
        if (rootEmployeeIds.includes(emp.id)) {
          emp.parentId = 'virtual-root';
        }
      });
    }

    const chart = d3ChartRef.current;
    
    // Set layout
    chart.layout(layout === 'left' ? 'left' : 'top');
    
    // Only set these properties on first render
    if (!chart._initialized) {
      chart
        .container(chartRef.current)
        .nodeWidth(() => 180)
        .nodeHeight(() => 80)
        .childrenMargin(() => 40)
        .compactMarginBetween(() => 30)
        .compactMarginPair(() => 30)
        .neighbourMargin(() => 25, 25)
        .onNodeClick((node) => {
          // d3-org-chart passes the node ID as a string
          const employeeId = typeof node === 'string' ? node : node.data?.id || node.id || node;
          
          // Skip virtual root
          if (employeeId === 'virtual-root') return;
          
          console.log('Clicked employee ID:', employeeId);
          
          // Open Personio absence page - correct URL format
          const personioUrl = `https://united-workspace.app.personio.com/time-off/employee/${employeeId}/monthly`;
          window.open(personioUrl, '_blank');
        });
      
      chart._initialized = true;
    }
    
    chart.nodeContent((d) => {
        // Hide virtual root node
        if (d.data.isVirtual) {
          return `
            <div style="
              width: 180px;
              height: 50px;
              background: transparent;
              border: 2px dashed #d1d5db;
              border-radius: 8px;
              padding: 12px;
              display: flex;
              align-items: center;
              justify-content: center;
              color: #9ca3af;
              font-weight: 600;
              font-size: 13px;
            ">
              ${d.data.name}
            </div>
          `;
        }
        
        const statusColors = {
          available: '#10b981',
          absent: '#ef4444',
          sick: '#9ca3af',
          'non-working-day': '#f97316'
        };
        const shadowColor = statusColors[d.data.status] || '#d1d5db';
        
        // Calculate supervisor status bar - ALWAYS show if person has subordinates
        let statusBar = '';
        
        // Use the pre-calculated subordinate statuses stored in data
        if (d.data._subordinateStatuses) {
          const modeStats = d.data._subordinateStatuses[progressBarMode];
          
          if (modeStats) {
            const total = modeStats.available + modeStats.absent + modeStats.sick + modeStats.nonWorking;
            
            if (total > 0) {
              const availablePercent = (modeStats.available / total) * 100;
              const absentPercent = (modeStats.absent / total) * 100;
              const sickPercent = (modeStats.sick / total) * 100;
              const nonWorkingPercent = (modeStats.nonWorking / total) * 100;
              
              statusBar = `
                <div style="
                  height: 3px;
                  width: 100%;
                  border-radius: 2px;
                  overflow: hidden;
                  display: flex;
                  margin-top: 6px;
                  background: #e5e7eb;
                ">
                  ${availablePercent > 0 ? `<div style="width: ${availablePercent}%; background: #10b981; flex-shrink: 0;"></div>` : ''}
                  ${absentPercent > 0 ? `<div style="width: ${absentPercent}%; background: #ef4444; flex-shrink: 0;"></div>` : ''}
                  ${sickPercent > 0 ? `<div style="width: ${sickPercent}%; background: #9ca3af; flex-shrink: 0;"></div>` : ''}
                  ${nonWorkingPercent > 0 ? `<div style="width: ${nonWorkingPercent}%; background: #f97316; flex-shrink: 0;"></div>` : ''}
                </div>
              `;
            }
          }
        }
        
        // Status label with icon
        const statusIcons = {
          available: '✓',
          sick: '⚕',
          absent: '✗',
          'non-working-day': '🏖'
        };
        const statusIcon = statusIcons[d.data.status] || '•';
        
        return `
          <div style="
            width: 180px;
            height: 80px;
            background: white;
            border-radius: 8px;
            box-shadow: 0 0 0 3px ${shadowColor}, 0 4px 6px rgba(0,0,0,0.1);
            padding: 8px 10px;
            cursor: pointer;
            transition: transform 0.2s, box-shadow 0.2s;
            box-sizing: border-box;
            display: flex;
            align-items: center;
            overflow: hidden;
          "
          onmouseover="this.style.transform='scale(1.05)'; this.style.boxShadow='0 0 0 4px ${shadowColor}, 0 6px 12px rgba(0,0,0,0.15)'"
          onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='0 0 0 3px ${shadowColor}, 0 4px 6px rgba(0,0,0,0.1)'"
          >
            <div style="display: flex; gap: 8px; align-items: center; width: 100%; overflow: hidden;">
              <div style="
                width: 38px;
                height: 38px;
                border-radius: 50%;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                flex-shrink: 0;
                overflow: hidden;
                position: relative;
              ">
                <div style="
                  position: absolute;
                  top: 0;
                  left: 0;
                  width: 100%;
                  height: 100%;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  color: white;
                  font-weight: 700;
                  font-size: 14px;
                ">${d.data.firstName.charAt(0)}${d.data.lastName.charAt(0)}</div>
                <img 
                  src="${d.data.imageUrl}" 
                  alt=""
                  style="
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%; 
                    height: 100%; 
                    object-fit: cover;
                    background: transparent;
                  "
                  onerror="this.style.display='none';"
                />
              </div>
              <div style="flex: 1; min-width: 0; overflow: hidden; display: flex; flex-direction: column; justify-content: center;">
                <div style="
                  font-weight: 600;
                  font-size: 12px;
                  color: #1f2937;
                  white-space: nowrap;
                  overflow: hidden;
                  text-overflow: ellipsis;
                  margin-bottom: 2px;
                ">${d.data.name}</div>
                <div style="
                  font-size: 10px;
                  color: #6b7280;
                  white-space: nowrap;
                  overflow: hidden;
                  text-overflow: ellipsis;
                  margin-bottom: 4px;
                ">${d.data.position || 'No position'}</div>
                <div style="
                  display: inline-block;
                  padding: 2px 6px;
                  border-radius: 3px;
                  font-size: 9px;
                  font-weight: 600;
                  color: white;
                  background: ${shadowColor};
                  white-space: nowrap;
                  overflow: hidden;
                  text-overflow: ellipsis;
                  max-width: 100%;
                ">
                  ${statusIcon} ${d.data.statusLabel || 'Available'}
                </div>
                ${statusBar}
              </div>
            </div>
          </div>
        `;
      });
    
    // Only set data on first render - subsequent renders just update data in place
    if (!chart._hasRendered) {
      chart.data(chartData);
      chart.render();
      chart._hasRendered = true;
    } else {
      // On subsequent renders, just call render() - data objects are already updated in place
      chart.render();
    }

  }, [employees, getEmployeeStatus, progressBarMode, layout]);

  if (!employees || employees.length === 0) {
    return (
      <div className="org-chart-empty">
        <p>No active employees found.</p>
        <p>Make sure employees are marked as "active" in Personio.</p>
      </div>
    );
  }

  return <div ref={chartRef} className="org-chart-d3" />;
});

OrgChart.displayName = 'OrgChart';

export default OrgChart;
