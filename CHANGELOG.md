# Changelog

## 2024-12-29 - Bug Fixes

### Fixed: Only One Employee Showing

**Problem:**
- Only a single employee was displayed in the org chart
- Inactive employees were included in the data
- Multiple independent organizational trees were not supported

**Solutions Implemented:**

1. **Backend - Active Employee Filtering** (`backend/server.js`)
   - Added filter to return only employees with `status: 'active'`
   - Inactive, terminated, or onboarding employees are now excluded
   - Reduces data sent to frontend and improves performance

2. **Frontend - Multiple Trees Support** (`frontend/src/components/OrgChart.jsx`)
   - Changed `buildHierarchy()` to return an array of root nodes instead of single root
   - Added double-layer active employee filtering (backend + frontend)
   - Employees without supervisors are now treated as independent root nodes
   - Multiple organizational trees can now be displayed side-by-side

3. **CSS Updates** (`frontend/src/components/OrgChart.css`)
   - Added `.org-chart-wrapper` flex container to display multiple trees
   - Trees are arranged horizontally with proper spacing
   - Responsive layout wraps trees on smaller screens

4. **UI Enhancement** (`frontend/src/App.jsx`)
   - Added info bar showing count of active employees
   - Improved user feedback about data being displayed

### What Works Now:

✅ All active employees are displayed  
✅ Multiple independent organizational hierarchies are shown side-by-side  
✅ Employees without supervisors appear as independent root nodes  
✅ Inactive employees are filtered out  
✅ Better performance with reduced data transfer  

### Testing:

To verify the fix:
1. Ensure you have multiple active employees in Personio
2. Some employees should have supervisors, some should not
3. Run `npm start`
4. All active employees should appear in the org chart
5. Multiple trees should be visible if there are multiple root employees
