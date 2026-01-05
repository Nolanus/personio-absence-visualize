# Technical Architecture & Implementation

This document provides a deep dive into the technical details, architecture, and API structure of the Personio Absence Visualizer.

## System Architecture

The application follows a standard decoupled frontend-backend architecture, unified for deployment within a single Docker container.

### Backend (Node.js + Express)

- **Role**: Serves as a secure proxy for the Personio API, handles authentication, and serves the compiled frontend.
- **Static Hosting**: Serves the React SPA from the `/public` directory.
- **Authentication**: Validates Microsoft Entra ID (Azure AD) JWT access tokens against Microsoft's public JWKs.
- **Caching Logic**:
  - **Employee Data**: Cached for 5 minutes.
  - **Absence Data**: Cached for 30 minutes. Optimized to fetch a full month of data based on the selected date to reduce API calls during day-by-day navigation.
  - **Profile Pictures**: Negative caching (24h) for missing images and backoff caching (2m) for rate-limited requests.
- **Config Injection**: Dynamically injects Azure Client/Tenant IDs into the `index.html` at runtime, enabling "build once, run anywhere" container mobility.

### Frontend (React + Vite)

- **Framework**: React with Vite for fast development and optimized production builds.
- **Visualization**: Powered by `d3-org-chart` for a performant and interactive tree rendering.
- **State Management**: React Hooks for local state (theme, selection, data sync).
- **Authentication**: Uses `@azure/msal-browser` for secure Single Sign-On.

## API Endpoints

All endpoints (except `/health`) require a valid Microsoft Bearer token in the `Authorization` header.

### `GET /api/employees`

Fetches the organizational hierarchy.

- **Filtering**: Automatically filters for `active` or `onboarding` status.
- **Data included**: id, names, position, supervisor, department, office.

### `GET /api/absences?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD`

Fetches absence periods for the specified range.

- **Optimized Fetching**: The frontend typically requests the full current month to leverage backend caching.

### `GET /api/time-off-types`

Fetches definitions for various time-off categories (Vacation, Sick Leave, etc.).

### `GET /api/profile-picture/:id`

Proxies profile picture requests to Personio with optimized caching and error handling.

## Implementation Details

### Status Logic (`App.jsx`)

The application implements a precedence-based status resolver:

1. **Absence** (Vacation/Time-Off) takes top priority.
2. **Sick Leave** (Detected via `category: sick_leave`).
3. **Public Holidays** / **Non-Working Days**.

### Half-Day Rendering

The `getEmployeeStatus` function tracks `amStatus` and `pmStatus` independently. If a day is partially affected, the `OrgChart` renders a split-color border using CSS linear gradients.

### Performance Optimizations

- **Monthly Syncing**: Instead of fetching absences for every single day change, the app syncs the target month once and caches it.
- **D3 Virtualization**: `d3-org-chart` efficiently handles large organizational trees by managing the DOM lifecycle of nodes.
