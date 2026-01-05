import React from 'react';
import ReactDOM from 'react-dom/client';
import { MsalProvider } from '@azure/msal-react';
import { msalInstance } from './authConfig';
import App from './App';
import './index.css';

const config = window.__SCHEDULE_VIEWER_CONFIG__ || {};
const authEnabled = config.authEnabled !== false;

const renderApp = (wrapWithMsal = false) => {
  const root = ReactDOM.createRoot(document.getElementById('root'));
  const content = wrapWithMsal ? (
    <MsalProvider instance={msalInstance}>
      <App />
    </MsalProvider>
  ) : (
    <App />
  );

  root.render(<React.StrictMode>{content}</React.StrictMode>);
};

if (authEnabled) {
  // MSAL v3/v4 requires asynchronous initialization
  msalInstance
    .initialize()
    .then(() => {
      // Handle redirect promise to process the response from the redirect flow
      msalInstance
        .handleRedirectPromise()
        .then(() => {
          renderApp(true);
        })
        .catch((err) => {
          console.error('MSAL Redirect Error:', err);
        });
    })
    .catch((err) => {
      console.error('MSAL Initialization Error:', err);
      // Fallback to render without MSAL if it fails to init? 
      // safer to just log and let user see black screen for explicit debugging if auth is required
    });
} else {
  // Directly render without MSAL
  renderApp(false);
}
