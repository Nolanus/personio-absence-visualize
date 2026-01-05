import { useEffect, useRef, useImperativeHandle, forwardRef, useMemo } from 'react';
import { OrgChart as D3OrgChart } from 'd3-org-chart';
import * as d3 from 'd3';
import './OrgChart.css';

const OrgChart = forwardRef(
  (
    {
      employees,
      getEmployeeStatus,
      progressBarMode,
      layout,
      profilePictures,
      selectedDate,
      isDarkMode,
      companyName,
    },
    ref,
  ) => {
    const chartRef = useRef(null);
    const d3ChartRef = useRef(null);
    const previousDataRef = useRef(new Map());

    // Expose fit method to parent
    useImperativeHandle(ref, () => ({
      fit: () => {
        if (d3ChartRef.current) {
          d3ChartRef.current.fit();
        }
      },
    }));

    // Memoize the hierarchy calculation to prevent re-running on every render (e.g. image loads)
    const { activeEmployees, childrenMap, validIds, standardRootIds, invalidRootIds } =
      useMemo(() => {
        if (!employees)
          return {
            activeEmployees: [],
            childrenMap: new Map(),
            validIds: new Set(),
            standardRootIds: [],
            invalidRootIds: [],
          };

        // Transform employees to d3-org-chart format
        // Include active and onboarding employees, exclude former and paused
        const active = employees.filter((emp) => {
          const status = emp.attributes?.status?.value?.toLowerCase();
          return status === 'active' || status === 'onboarding';
        });

        // Create a Set of valid employee IDs for quick lookup
        const valid = new Set(active.map((emp) => String(emp.attributes?.id?.value)));

        // Track employees without valid parents (will be roots)
        const roots = [];

        // Build a map of parent -> children for subordinate counting
        const map = new Map();

        active.forEach((emp) => {
          const id = emp.attributes?.id?.value;
          const supervisorAttr = emp.attributes?.supervisor;
          let parentId = null;

          if (supervisorAttr?.value) {
            parentId =
              supervisorAttr.value.attributes?.id?.value ||
              supervisorAttr.value.id ||
              supervisorAttr.value.value ||
              (typeof supervisorAttr.value === 'number' ? supervisorAttr.value : null);
          }

          // Validation Logic
          if (parentId && valid.has(String(parentId))) {
            if (!map.has(String(parentId))) {
              map.set(String(parentId), []);
            }
            map.get(String(parentId)).push(String(id));
          }
        });

        const standardRoots = []; // Truly have no supervisor (CEO, etc.)
        const invalidRoots = []; // Have a supervisor ID, but it's not in our list

        // Identify roots and log warnings ONLY inside this memoized block
        active.forEach((emp) => {
          const id = emp.attributes?.id?.value;
          const firstName = emp.attributes?.first_name?.value || '';
          const lastName = emp.attributes?.last_name?.value || '';

          let parentId = null;
          const supervisorAttr = emp.attributes?.supervisor;
          const hasSupervisorValue = !!supervisorAttr?.value;

          if (hasSupervisorValue) {
            parentId =
              supervisorAttr.value.attributes?.id?.value ||
              supervisorAttr.value.id ||
              supervisorAttr.value.value ||
              (typeof supervisorAttr.value === 'number' ? supervisorAttr.value : null);
          }

          if (!hasSupervisorValue) {
            // Legitimate root (no supervisor assigned)
            standardRoots.push(String(id));
          } else if (parentId && !valid.has(String(parentId))) {
            // Invalid supervisor (assigned but not found)
            console.warn(
              `Employee ${firstName} ${lastName} (${id}) has invalid supervisor ID ${parentId} - moving to Unsupervised`,
            );
            invalidRoots.push(String(id));
          }
        });

        return {
          activeEmployees: active,
          childrenMap: map,
          validIds: valid,
          standardRootIds: standardRoots,
          invalidRootIds: invalidRoots,
        };
      }, [employees]);

    // Helper to count all subordinates recursively using the memoized map
    // Memoized so it doesn't change on every render, though it's cheap to recreate
    const countAllSubordinates = useMemo(
      () => (empId) => {
        const directChildren = childrenMap.get(String(empId)) || [];
        let total = directChildren.length;
        directChildren.forEach((childId) => {
          total += countAllSubordinates(childId);
        });
        return total;
      },
      [childrenMap],
    );

    // Generate chart data using the memoized hierarchy and current status/profile pictures
    // This is also a transformation, so we can memoize it to avoid re-generating array on every render
    // unless dependencies change
    const chartData = useMemo(() => {
      if (activeEmployees.length === 0) return [];

      const data = activeEmployees.map((emp) => {
        const id = emp.attributes?.id?.value;
        const firstName = emp.attributes?.first_name?.value || '';
        const lastName = emp.attributes?.last_name?.value || '';
        const position = emp.attributes?.position?.value || '';
        const email = emp.attributes?.email?.value || '';

        // Get supervisor ID for linking
        let parentId = null;
        const supervisorAttr = emp.attributes?.supervisor;
        if (supervisorAttr?.value) {
          parentId =
            supervisorAttr.value.attributes?.id?.value ||
            supervisorAttr.value.id ||
            supervisorAttr.value.value ||
            (typeof supervisorAttr.value === 'number' ? supervisorAttr.value : null);
        }

        // If parent is invalid according to our valid set, treat as root
        if (parentId && !validIds.has(String(parentId))) {
          parentId = null;
        }

        const statusInfo = getEmployeeStatus(id);
        const status = statusInfo.status;
        const statusLabel = statusInfo.label;

        // Count subordinates for status bar
        const subordinateCount = countAllSubordinates(id);

        // Get image URL from profilePictures map if available, or empty string
        const imageUrl = profilePictures && profilePictures[id] ? profilePictures[id] : '';

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
          imageUrl,
          _directSubordinates: subordinateCount,
          _allSubordinatesData: childrenMap.get(String(id)) || [],
          _subordinateStatuses: null,
        };

        // Update fields that can change
        nodeData.status = status;
        nodeData.statusLabel = statusLabel;
        nodeData.isHalfDay = statusInfo.isHalfDay;
        nodeData.amStatus = statusInfo.amStatus;
        nodeData.pmStatus = statusInfo.pmStatus;
        nodeData.parentId = parentId ? String(parentId) : '';
        nodeData.imageUrl = imageUrl;
        nodeData._directSubordinates = subordinateCount;
        nodeData._allSubordinatesData = childrenMap.get(String(id)) || [];

        // Store for next render
        previousDataRef.current.set(String(id), nodeData);

        return nodeData;
      });

      // Show virtual root if multiple people roots exist, or if a custom company name is provided
      const needsVirtualRoot =
        standardRootIds.length + invalidRootIds.length > 1 ||
        invalidRootIds.length > 0 ||
        (!!companyName && companyName !== 'Organization');

      if (needsVirtualRoot) {
        // Add Organization root
        data.unshift({
          id: 'virtual-root',
          parentId: '',
          name: companyName || 'Organization',
          firstName: '',
          lastName: '',
          position: '',
          email: '',
          status: 'available',
          statusLabel: '',
          imageUrl: '',
          isVirtual: true,
        });

        // If we have invalid/unsupervised roots, add a dummy node for them
        if (invalidRootIds.length > 0) {
          data.push({
            id: 'unsupervised-dummy',
            parentId: 'virtual-root',
            name: 'Unsupervised',
            firstName: '',
            lastName: '',
            position: '',
            email: '',
            status: 'available',
            statusLabel: '',
            imageUrl: '',
            isVirtual: true,
            _subordinateStatuses: null, // Ensure safety 
          });

          // Re-parent invalid roots to the dummy node
          data.forEach((d) => {
            if (invalidRootIds.includes(d.id)) {
              d.parentId = 'unsupervised-dummy';
            }
          });
        }

        // Re-parent standard roots to the virtual root
        data.forEach((d) => {
          if (standardRootIds.includes(d.id)) {
            d.parentId = 'virtual-root';
          }
        });
      }

      return data;
    }, [
      activeEmployees,
      childrenMap,
      standardRootIds,
      invalidRootIds,
      validIds,
      getEmployeeStatus,
      profilePictures,
      countAllSubordinates,
      companyName,
    ]);

    useEffect(() => {
      if (!employees || employees.length === 0 || !chartRef.current) {
        return;
      }

      // Initialize chart only once
      if (!d3ChartRef.current) {
        d3ChartRef.current = new D3OrgChart();
      }

      const chart = d3ChartRef.current;

      // Helper to get employee weekly hours (defined inside effect as it's not needed by chartData)
      // Actually, this is used for subordinate status calculation which modifies chartData objects in place
      // We should probably move this status calculation into the memoized chartData block or execute it here.
      // The previous implementation modified chartData in place. Let's keep doing that here for now,
      // or better, do it in the useMemo block if possible.
      // However, it depends on 'activeEmployees' which is available.
      // Let's keep the structure simple: The chart creation/config is here.

      // Calculate subordinate statuses in place (d3-org-chart style often relies on object mutations)
      // We will do this BEFORE rendering
      const getEmployeeWeeklyHours = (empId) => {
        const employee = activeEmployees.find(
          (e) => String(e.attributes?.id?.value) === String(empId),
        );
        if (!employee) return 0;

        const workScheduleValue = employee.attributes?.work_schedule?.value;
        const workSchedule = workScheduleValue?.attributes;

        if (!workSchedule) return 0;

        const dayNames = [
          'monday',
          'tuesday',
          'wednesday',
          'thursday',
          'friday',
          'saturday',
          'sunday',
        ];
        let totalHours = 0;

        dayNames.forEach((day) => {
          const hoursStr = workSchedule[day];
          if (hoursStr && hoursStr !== '00:00') {
            // Parse "08:00" format to hours
            const [hours, minutes] = hoursStr.split(':').map(Number);
            totalHours += hours + minutes / 60;
          }
        });

        return totalHours;
      };

      chartData.forEach((emp) => {
        const directChildren = childrenMap.get(String(emp.id)) || [];

        if (directChildren.length > 0) {
          // Collect subordinate IDs based on mode
          const collectDirectSubordinates = () => directChildren;

          const collectAllSubordinates = (empId) => {
            const result = [];
            const children = childrenMap.get(String(empId)) || [];
            children.forEach((childId) => {
              result.push(childId);
              result.push(...collectAllSubordinates(childId));
            });
            return result;
          };

          // Store both direct and all subordinate statuses
          const calculateStatuses = (subordinateIds, useHours) => {
            const statusCounts = { available: 0, absent: 0, sick: 0, nonWorking: 0 };

            subordinateIds.forEach((subId) => {
              const subordinate = chartData.find((e) => e.id === subId);
              if (subordinate) {
                const weight = useHours ? getEmployeeWeeklyHours(subId) : 1;

                if (subordinate.status === 'available') statusCounts.available += weight;
                else if (subordinate.status === 'absent') statusCounts.absent += weight;
                else if (subordinate.status === 'sick') statusCounts.sick += weight;
                else if (subordinate.status === 'non-working-day')
                  statusCounts.nonWorking += weight;
              }
            });

            return statusCounts;
          };

          // Calculate all four modes
          emp._subordinateStatuses = {
            'direct-count': calculateStatuses(collectDirectSubordinates(), false),
            'direct-hours': calculateStatuses(collectDirectSubordinates(), true),
            'all-count': calculateStatuses(collectAllSubordinates(emp.id), false),
            'all-hours': calculateStatuses(collectAllSubordinates(emp.id), true),
          };
        }
      });

      // Set layout
      chart.layout(layout === 'left' ? 'left' : 'top');

      // Link colors
      const linkColor = isDarkMode ? '#334155' : '#e5e7eb';

      // Update chart background and links
      if (chartRef.current) {
        chartRef.current.style.backgroundColor = isDarkMode ? '#0f172a' : '#f3f4f6';
      }

      if (!chart._initialized) {
        chart
          .container(chartRef.current)
          .nodeWidth(() => 190)
          .nodeHeight(() => 80)
          .childrenMargin(() => 40)
          .compactMarginBetween(() => 30)
          .compactMarginPair(() => 30)
          .neighbourMargin(() => 25, 25)
          .linkUpdate(function (d) {
            d3.select(this)
              .attr('stroke', isDarkMode ? '#334155' : '#e5e7eb')
              .attr('stroke-width', 1.5);
          })
          .onNodeClick((node) => {
            // d3-org-chart passes the node ID as a string or object
            const employeeId = typeof node === 'string' ? node : node.data?.id || node.id || node;

            // Skip virtual root
            if (employeeId === 'virtual-root') return;

            // Open Personio absence page with contextual date
            const month = selectedDate ? selectedDate.getMonth() + 1 : new Date().getMonth() + 1;
            const year = selectedDate ? selectedDate.getFullYear() : new Date().getFullYear();
            const personioUrl = `https://united-workspace.app.personio.com/time-off/employee/${employeeId}/monthly?month=${month}&year=${year}`;
            window.open(personioUrl, '_blank');
          })
          .buttonContent(({ node, state }) => {
            const hasChildren = node.children || node._children;
            // In D3, if node.children is present, it's expanded. If node._children is present, it's collapsed.
            const isExpanded = !!node.children;

            if (!hasChildren) return '';

            // Center the button horizontally (12px is half of 24px width) and place it splitting the bottom edge
            return `
             <div 
               style="
                 cursor: pointer;
                 display: flex;
                 align-items: center;
                 justify-content: center;
                 width: 24px;
                 height: 24px;
                 transform: translate(8px, 9px);
               "
               onclick="window.handleExpandButtonClick(event, '${node.id}')"
             >
               <div style="
                 width: 20px;
                 height: 20px;
                 border-radius: 50%;
                 background-color: white;
                 border: 2px solid #3b82f6; 
                 color: #3b82f6;
                 display: flex;
                 align-items: center;
                 justify-content: center;
                 box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                 font-size: 16px;
                 line-height: 1;
                 font-weight: 700;
                 padding-bottom: 2px;
               ">
                 ${isExpanded ? '−' : '+'}
               </div>
             </div>
           `;
          });

        // Define global handler for expand button clicks
        window.handleExpandButtonClick = (event, nodeId) => {
          event.stopPropagation(); // Stop click from bubbling to node
          const chart = d3ChartRef.current;
          if (!chart) return;

          const isShift = event.shiftKey;

          if (isShift) {
            console.log('Shift+Click recursive expand for:', nodeId);

            // Robust Recursion: Use the flat data source to determine hierarchy
            const allData = chart.data();

            // 1. Build Adjacency List for fast lookup
            const childrenMap = new Map();
            allData.forEach((d) => {
              // d.parentId is a string (id of parent)
              if (d.parentId && d.parentId !== '') {
                if (!childrenMap.has(String(d.parentId))) {
                  childrenMap.set(String(d.parentId), []);
                }
                childrenMap.get(String(d.parentId)).push(String(d.id));
              }
            });

            // 2. BFS/DFS to collect all descendant IDs
            const descendants = [];
            const queue = [String(nodeId)];

            while (queue.length > 0) {
              const currentId = queue.shift();
              const children = childrenMap.get(currentId);
              if (children) {
                children.forEach((childId) => {
                  descendants.push(childId);
                  queue.push(childId);
                });
              }
            }

            // 3. Expand Target + All Descendants
            // Important: We expand the clicked node first
            chart.setExpanded(nodeId, true);

            descendants.forEach((id) => {
              chart.setExpanded(id, true);
            });

            chart.render();
          } else {
            // Normal Toggle
            const isExpanded = chart.getChartState().expandedNodeIds.includes(nodeId);
            chart.setExpanded(nodeId, !isExpanded);
            chart.render();
          }
        };

        chart._initialized = true;
      }

      chart.nodeContent((d) => {
        const cardBg = isDarkMode ? '#1e293b' : 'white';
        const textPrimary = isDarkMode ? '#f8fafc' : '#111827';
        const textSecondary = isDarkMode ? '#cbd5e1' : '#4b5563';
        const borderMuted = isDarkMode ? '#334155' : '#d1d5db';

        // Hide virtual root node
        if (d.data.isVirtual) {
          return `
            <div style="
              width: 190px;
              height: 50px;
              background: ${cardBg};
              border: 2px dashed ${borderMuted};
              border-radius: 8px;
              padding: 12px;
              display: flex;
              align-items: center;
              justify-content: center;
              color: ${textSecondary};
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
          'non-working-day': '#f97316',
        };
        const shadowColor = statusColors[d.data.status] || '#d1d5db';

        // Calculate supervisor status bar - ALWAYS show if person has subordinates
        let statusBar = '';

        // Use the pre-calculated subordinate statuses stored in data
        if (d.data._subordinateStatuses) {
          const modeStats = d.data._subordinateStatuses[progressBarMode];

          if (modeStats) {
            const total =
              modeStats.available + modeStats.absent + modeStats.sick + modeStats.nonWorking;

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
          'non-working-day': '🏖',
        };
        const statusIcon = statusIcons[d.data.status] || '•';

        const availableColor = '#10b981';
        const absentColor = '#ef4444';

        let nodeStyleProperties = `
        width: 190px;
        height: 80px;
        background: ${cardBg};
        border-radius: 8px;
        padding: 8px 10px;
        cursor: pointer;
        transition: transform 0.2s, box-shadow 0.2s;
        box-sizing: border-box;
        display: flex;
        align-items: center;
        overflow: hidden;
        color: ${textPrimary};
      `;

        let nodeBorder = `box-shadow: 0 0 0 3px ${shadowColor}, 0 4px 6px rgba(0,0,0,0.1);`;
        let hoverBorderAction = `this.style.boxShadow='0 0 0 4px ${shadowColor}, 0 6px 12px rgba(0,0,0,0.15)'`;
        let normalBorderAction = `this.style.boxShadow='0 0 0 3px ${shadowColor}, 0 4px 6px rgba(0,0,0,0.1)'`;

        if (d.data.isHalfDay) {
          const amColor = statusColors[d.data.amStatus] || statusColors.available;
          const pmColor = statusColors[d.data.pmStatus] || statusColors.available;

          nodeBorder = `
          border: 3px solid transparent;
          background: 
            linear-gradient(${cardBg}, ${cardBg}) padding-box, 
            linear-gradient(to right, ${amColor} 50%, ${pmColor} 50%) border-box;
          box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        `;
          hoverBorderAction = `this.style.borderWidth='4px'; this.style.boxShadow='0 6px 12px rgba(0,0,0,0.15)'`;
          normalBorderAction = `this.style.borderWidth='3px'; this.style.boxShadow='0 4px 6px rgba(0,0,0,0.1)'`;
        }

        return `
          <div style="${nodeStyleProperties} ${nodeBorder}"
          onmouseover="this.style.transform='scale(1.05)'; ${hoverBorderAction}"
          onmouseout="this.style.transform='scale(1)'; ${normalBorderAction}"
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
                  color: ${textPrimary};
                  white-space: nowrap;
                  overflow: hidden;
                  text-overflow: ellipsis;
                  margin-bottom: 2px;
                ">${d.data.name}</div>
            <div style="
                  font-size: 10px;
                  color: ${textSecondary};
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
          </div >
  `;
      });

      // Always update data to capture structural changes (like adding virtual root)
      chart.data(chartData);
      chart.render();
      chart._hasRendered = true;

      /* Update link colors if they change */
      chart
        .linkUpdate(function (d) {
          d3.select(this)
            .attr('stroke', isDarkMode ? '#4b5563' : '#d1d5db')
            .attr('stroke-width', 1.5);
        })
        .render();
    }, [
      employees,
      getEmployeeStatus,
      progressBarMode,
      layout,
      profilePictures,
      activeEmployees,
      childrenMap,
      chartData,
      isDarkMode,
    ]);

    if (!employees || employees.length === 0) {
      return (
        <div className="org-chart-empty">
          <p>No active employees found.</p>
          <p>Make sure employees are marked as "active" in Personio.</p>
        </div>
      );
    }

    return <div ref={chartRef} className="org-chart-d3" />;
  },
);

OrgChart.displayName = 'OrgChart';

export default OrgChart;
