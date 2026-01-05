import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import App from './App';

// Mock MSAL
vi.mock('@azure/msal-react', () => ({
    useMsal: () => ({
        instance: {
            acquireTokenSilent: vi.fn(),
            loginRedirect: vi.fn(),
        },
        accounts: [],
    }),
    AuthenticatedTemplate: ({ children }) => <div>{children}</div>,
    UnauthenticatedTemplate: ({ children }) => <div>{children}</div>,
}));

// Mock child components to simplify testing
vi.mock('./components/OrgChart', () => ({
    default: () => <div data-testid="org-chart">OrgChart Component</div>,
}));

vi.mock('./components/DatePicker', () => ({
    default: () => <div data-testid="date-picker">DatePicker Component</div>,
}));

describe('App Component', () => {
    beforeEach(() => {
        // Reset window config
        window.__SCHEDULE_VIEWER_CONFIG__ = { authEnabled: false };

        // Mock fetch
        // Mock fetch
        const mockFetch = vi.fn((url) => {
            if (url.includes('/api/employees')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ data: [] }),
                });
            }
            if (url.includes('/api/time-off-types')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ data: [] }),
                });
            }
            return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
        });
        vi.stubGlobal('fetch', mockFetch);
    });

    it('renders without crashing', async () => {
        render(<App />);
        expect(screen.getByText('Personio absence visualizer')).toBeInTheDocument();
    });

    it('displays the org chart', async () => {
        render(<App />);
        await waitFor(() => {
            expect(screen.getByTestId('org-chart')).toBeInTheDocument();
        });
    });
});
