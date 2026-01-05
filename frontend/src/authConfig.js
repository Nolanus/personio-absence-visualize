import { PublicClientApplication } from '@azure/msal-browser';

// Prefer runtime config injected by the backend (Docker/production),
// fall back to Vite env variables for local development.
const runtimeConfig = typeof window !== 'undefined' ? window.__SCHEDULE_VIEWER_CONFIG__ || {} : {};
const clientId = runtimeConfig.azureClientId || import.meta.env.VITE_AZURE_CLIENT_ID;
const tenantId = runtimeConfig.azureTenantId || import.meta.env.VITE_AZURE_TENANT_ID;

if (!clientId || !tenantId) {
  console.warn(
    'Azure client/tenant ID not configured. MSAL will not function correctly until configured.',
  );
}

const msalConfig = {
  auth: {
    clientId: clientId || 'REPLACE_WITH_AZURE_CLIENT_ID',
    authority: tenantId
      ? `https://login.microsoftonline.com/${tenantId}`
      : 'https://login.microsoftonline.com/REPLACE_WITH_TENANT_ID',
    redirectUri: window.location.origin,
  },
  cache: {
    cacheLocation: 'sessionStorage',
    storeAuthStateInCookie: false,
  },
};

export const msalInstance = new PublicClientApplication(msalConfig);

// Default login request. In production you should align the scope with your protected API registration.
export const loginRequest = {
  // Use the client ID as the scope to get a token for this app (audience = client ID)
  // This matches the backend verification: audience: AZURE_CLIENT_ID
  scopes: [clientId ? `${clientId}/.default` : 'User.Read'],
};
