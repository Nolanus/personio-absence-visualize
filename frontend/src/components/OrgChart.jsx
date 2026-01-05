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

    // 1. Memoize hierarchy data
    const { activeEmployees, childrenMap, validIds, standardRootIds, invalidRootIds } =
      useMemo(() => {
        if (!employees)
          return { activeEmployees: [], childrenMap: new Map(), validIds: new Set(), standardRootIds: [], invalidRootIds: [] };

        const active = employees.filter((emp) => {
          const status = emp.attributes?.status?.value?.toLowerCase();
          return status === 'active' || status === 'onboarding';
        });

        const valid = new Set(active.map((emp) => String(emp.attributes?.id?.value)));
        const map = new Map();

        active.forEach((emp) => {
          const id = emp.attributes?.id?.value;
          const supervisorAttr = emp.attributes?.supervisor;
          let pId = null;
          if (supervisorAttr?.value) {
            pId = supervisorAttr.value.attributes?.id?.value || supervisorAttr.value.id || supervisorAttr.value.value || (typeof supervisorAttr.value === 'number' ? supervisorAttr.value : null);
          }
          if (pId && valid.has(String(pId))) {
            if (!map.has(String(pId))) map.set(String(pId), []);
            map.get(String(pId)).push(String(id));
          }
        });

        const standardRoots = [];
        const invalidRoots = [];
        active.forEach((emp) => {
          const id = emp.attributes?.id?.value;
          let pId = null;
          const supervisorAttr = emp.attributes?.supervisor;
          const hasSupervisor = !!supervisorAttr?.value;
          if (hasSupervisor) {
            pId = supervisorAttr.value.attributes?.id?.value || supervisorAttr.value.id || supervisorAttr.value.value || (typeof supervisorAttr.value === 'number' ? supervisorAttr.value : null);
          }

          if (!hasSupervisor) standardRoots.push(String(id));
          else if (pId && !valid.has(String(pId))) invalidRoots.push(String(id));
        });

        return { activeEmployees: active, childrenMap: map, validIds: valid, standardRootIds: standardRoots, invalidRootIds: invalidRoots };
      }, [employees]);

    // 2. Recursive subordinate counter
    const countAllSubordinates = useMemo(() => {
      const counter = (id) => {
        const children = childrenMap.get(String(id)) || [];
        let total = children.length;
        children.forEach((cId) => { total += counter(cId); });
        return total;
      };
      return counter;
    }, [childrenMap]);

    // 3. Transform to D3 data
    const chartData = useMemo(() => {
      if (activeEmployees.length === 0) return [];
      const data = activeEmployees.map((emp) => {
        const id = emp.attributes?.id?.value;
        const statusInfo = getEmployeeStatus(id);
        const supervisorAttr = emp.attributes?.supervisor;
        let pId = null;
        if (supervisorAttr?.value) {
          pId = supervisorAttr.value.attributes?.id?.value || supervisorAttr.value.id || supervisorAttr.value.value || (typeof supervisorAttr.value === 'number' ? supervisorAttr.value : null);
        }
        if (pId && !validIds.has(String(pId))) pId = null;

        const existing = previousDataRef.current.get(String(id));
        const nodeData = existing || {
          id: String(id),
          name: `${emp.attributes?.first_name?.value} ${emp.attributes?.last_name?.value}`,
          firstName: emp.attributes?.first_name?.value || '',
          lastName: emp.attributes?.last_name?.value || '',
          position: emp.attributes?.position?.value || '',
          imageUrl: '',
        };

        Object.assign(nodeData, {
          parentId: pId ? String(pId) : '',
          status: statusInfo.status,
          statusLabel: statusInfo.label,
          isHalfDay: statusInfo.isHalfDay,
          amStatus: statusInfo.amStatus,
          pmStatus: statusInfo.pmStatus,
          imageUrl: profilePictures && profilePictures[id] ? profilePictures[id] : '',
          _directSubordinates: countAllSubordinates(id),
          _allSubordinatesData: childrenMap.get(String(id)) || [],
        });

        previousDataRef.current.set(String(id), nodeData);
        return nodeData;
      });

      if (standardRootIds.length + invalidRootIds.length > 1 || (!!companyName && companyName !== 'Organization')) {
        data.unshift({ id: 'virtual-root', parentId: '', name: companyName || 'Organization', firstName: '', lastName: '', position: '', status: 'available', statusLabel: '', imageUrl: '', isVirtual: true });
        if (invalidRootIds.length > 0) {
          data.push({ id: 'unsupervised-dummy', parentId: 'virtual-root', name: 'Unsupervised', firstName: '', lastName: '', position: '', status: 'available', statusLabel: '', imageUrl: '', isVirtual: true });
          data.forEach(d => { if (invalidRootIds.includes(d.id)) d.parentId = 'unsupervised-dummy'; });
        }
        data.forEach(d => { if (standardRootIds.includes(d.id)) d.parentId = 'virtual-root'; });
      }
      return data;
    }, [activeEmployees, childrenMap, standardRootIds, invalidRootIds, validIds, getEmployeeStatus, profilePictures, countAllSubordinates, companyName]);

    // 4. Main Chart Logic
    useEffect(() => {
      if (!employees || employees.length === 0 || !chartRef.current) return;

      if (!d3ChartRef.current) {
        d3ChartRef.current = new D3OrgChart();
        const chart = d3ChartRef.current;
        chart
          .container(chartRef.current)
          .nodeWidth(() => 190)
          .nodeHeight(() => 80)
          .childrenMargin(() => 40)
          .compactMarginBetween(() => 30)
          .compactMarginPair(() => 30)
          .neighbourMargin(() => 25, 25)
          .onNodeClick((node) => {
            const id = typeof node === 'string' ? node : node.data?.id || node.id;
            if (id === 'virtual-root') return;
            const m = selectedDate ? selectedDate.getMonth() + 1 : new Date().getMonth() + 1;
            const y = selectedDate ? selectedDate.getFullYear() : new Date().getFullYear();
            window.open(`https://united-workspace.app.personio.com/time-off/employee/${id}/monthly?month=${m}&year=${y}`, '_blank');
          })
          .buttonContent(({ node }) => {
            if (!(node.children || node._children)) return '';
            const expanded = !!node.children;
            return `<div style="cursor: pointer; display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; transform: translate(8px, 9px);" onclick="window.handleExpandButtonClick(event, '${node.id}')">
              <div style="width: 20px; height: 20px; border-radius: 50%; background-color: white; border: 2px solid #3b82f6; color: #3b82f6; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 4px rgba(0,0,0,0.1); font-size: 16px; font-weight: bold; transition: all 0.2s;" 
              onmouseover="this.style.backgroundColor='#dbeafe'; this.style.transform='scale(1.1)'" onmouseout="this.style.backgroundColor='white'; this.style.transform='scale(1)'">
                ${expanded ? '−' : '+'}
              </div>
            </div>`;
          });

        window.handleExpandButtonClick = (event, nodeId) => {
          event.stopPropagation();
          const c = d3ChartRef.current;
          if (!c) return;
          if (event.shiftKey) {
            const all = c.data();
            const cMap = new Map();
            all.forEach(d => { if (d.parentId) { if (!cMap.has(String(d.parentId))) cMap.set(String(d.parentId), []); cMap.get(String(d.parentId)).push(String(d.id)); } });
            const queue = [String(nodeId)];
            c.setExpanded(nodeId, true);
            while (queue.length > 0) {
              const curr = queue.shift();
              (cMap.get(curr) || []).forEach(child => { c.setExpanded(child, true); queue.push(child); });
            }
          } else {
            c.setExpanded(nodeId, !c.getChartState().expandedNodeIds.includes(nodeId));
          }
          c.render();
        };
      }

      const chart = d3ChartRef.current;

      // Calculate subordinate statuses
      const getHours = (id) => {
        const e = activeEmployees.find(x => String(x.attributes?.id?.value) === String(id));
        const ws = e?.attributes?.work_schedule?.value?.attributes;
        if (!ws) return 0;
        let t = 0;
        ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].forEach(d => {
          if (ws[d] && ws[d] !== '00:00') { const [h, m] = ws[d].split(':').map(Number); t += h + m / 60; }
        });
        return t;
      };

      chartData.forEach((emp) => {
        const children = childrenMap.get(String(emp.id)) || [];
        if (children.length > 0) {
          const getAll = (id) => {
            const res = [];
            (childrenMap.get(String(id)) || []).forEach(cId => { res.push(cId); res.push(...getAll(cId)); });
            return res;
          };
          const calc = (ids, useH) => {
            const res = { available: 0, absent: 0, sick: 0, nonWorking: 0 };
            ids.forEach(id => {
              const s = chartData.find(x => x.id === id);
              if (s) {
                const w = useH ? getHours(id) : 1;
                if (s.status === 'available') res.available += w;
                else if (s.status === 'absent') res.absent += w;
                else if (s.status === 'sick') res.sick += w;
                else if (s.status === 'non-working-day') res.nonWorking += w;
              }
            });
            return res;
          };
          emp._subordinateStatuses = {
            'direct-count': calc(children, false), 'direct-hours': calc(children, true),
            'all-count': calc(getAll(emp.id), false), 'all-hours': calc(getAll(emp.id), true),
          };
        }
      });

      if (chartRef.current) chartRef.current.style.backgroundColor = isDarkMode ? '#0f172a' : '#f3f4f6';
      const colors = { available: '#10b981', absent: '#ef4444', sick: '#9ca3af', 'non-working-day': '#f97316' };
      const icons = { available: '✓', sick: '⚕', absent: '✗', 'non-working-day': '🏖' };
      const cardBg = isDarkMode ? '#1e293b' : 'white';
      const t1 = isDarkMode ? '#f8fafc' : '#1e293b';
      const t2 = isDarkMode ? '#94a3b8' : '#64748b';

      chart
        .layout(layout === 'left' ? 'left' : 'top')
        .linkUpdate(function () { d3.select(this).attr('stroke', isDarkMode ? '#4b5563' : '#d1d5db').attr('stroke-width', 1.5); })
        .nodeContent((d) => {
          if (d.data.isVirtual) return `<div style="width: 190px; height: 50px; background: ${cardBg}; border: 2px dashed ${isDarkMode ? '#334155' : '#d1d5db'}; border-radius: 8px; padding: 12px; display: flex; align-items: center; justify-content: center; color: ${t2}; font-weight: 600; font-size: 13px;">${d.data.name}</div>`;
          const sC = colors[d.data.status] || '#d1d5db';
          let sB = '';
          const stats = d.data._subordinateStatuses ? d.data._subordinateStatuses[progressBarMode] : null;
          if (stats) {
            const tot = stats.available + stats.absent + stats.sick + stats.nonWorking;
            if (tot > 0) {
              sB = `<div style="height: 3px; width: 100%; border-radius: 2px; overflow: hidden; display: flex; margin-top: 6px; background: #e5e7eb;">
                ${stats.available > 0 ? `<div style="width:${(stats.available / tot) * 100}%; background:#10b981; flex-shrink:0;"></div>` : ''}
                ${stats.absent > 0 ? `<div style="width:${(stats.absent / tot) * 100}%; background:#ef4444; flex-shrink:0;"></div>` : ''}
                ${stats.sick > 0 ? `<div style="width:${(stats.sick / tot) * 100}%; background:#9ca3af; flex-shrink:0;"></div>` : ''}
                ${stats.nonWorking > 0 ? `<div style="width:${(stats.nonWorking / tot) * 100}%; background:#f97316; flex-shrink:0;"></div>` : ''}
              </div>`;
            }
          }
          let nB = `box-shadow: 0 0 0 3px ${sC}, 0 4px 6px rgba(0,0,0,0.1);`;
          let hA = `this.style.boxShadow='0 0 0 4px ${sC}, 0 6px 12px rgba(0,0,0,0.15)'`, nA = `this.style.boxShadow='0 0 0 3px ${sC}, 0 4px 6px rgba(0,0,0,0.1)'`;
          if (d.data.isHalfDay) {
            const amC = colors[d.data.amStatus] || colors.available, pmC = colors[d.data.pmStatus] || colors.available;
            nB = `border: 3px solid transparent; background: linear-gradient(${cardBg}, ${cardBg}) padding-box, linear-gradient(to right, ${amC} 50%, ${pmC} 50%) border-box; box-shadow: 0 4px 6px rgba(0,0,0,0.1);`;
            hA = `this.style.borderWidth='4px'; this.style.boxShadow='0 6px 12px rgba(0,0,0,0.15)'`;
            nA = `this.style.borderWidth='3px'; this.style.boxShadow='0 4px 6px rgba(0,0,0,0.1)'`;
          }
          return `<div style="width: 190px; height: 80px; background: ${cardBg}; border-radius: 8px; padding: 8px 10px; cursor: pointer; transition: transform 0.2s, box-shadow 0.2s; box-sizing: border-box; display: flex; align-items: center; overflow: hidden; color: ${t1}; ${nB}" onmouseover="this.style.transform='scale(1.05)'; ${hA}" onmouseout="this.style.transform='scale(1)'; ${nA}">
            <div style="display: flex; gap: 8px; align-items: center; width: 100%; overflow: hidden;">
              <div style="width: 38px; height: 38px; border-radius: 50%; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); flex-shrink: 0; overflow: hidden; position: relative;">
                <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: white; font-weight: 700; font-size: 14px;">${d.data.firstName.charAt(0)}${d.data.lastName.charAt(0)}</div>
                <img src="${d.data.imageUrl}" alt="" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; background: transparent;" onerror="this.style.display='none';" />
              </div>
              <div style="flex: 1; min-width: 0; overflow: hidden; display: flex; flex-direction: column; justify-content: center;">
                <div style="font-weight: 600; font-size: 12px; color: ${t1}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 2px;">${d.data.name}</div>
                <div style="font-size: 10px; color: ${t2}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 4px;">${d.data.position || 'No position'}</div>
                <div style="
                  display: inline-block;
                  padding: 2px 6px;
                  border-radius: 3px;
                  font-size: 9px;
                  font-weight: 600;
                  color: white;
                  background: ${sC};
                  white-space: nowrap;
                  overflow: hidden;
                  text-overflow: ellipsis;
                  max-width: 100%;
                ">
                  ${icons[d.data.status] || '•'} ${d.data.statusLabel || 'Available'}
                </div>
                ${sB}
              </div>
            </div>
          </div>`;
        })
        .data(chartData)
        .render();
    }, [employees, getEmployeeStatus, progressBarMode, layout, profilePictures, selectedDate, isDarkMode, companyName, activeEmployees, childrenMap, chartData]);

    if (!employees || employees.length === 0) return <div className="org-chart-empty"><p>No active employees found.</p></div>;
    return <div ref={chartRef} className="org-chart-d3" />;
  }
);

OrgChart.displayName = 'OrgChart';
export default OrgChart;
