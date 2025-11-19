import { Configuration } from '@azure/msal-browser';

export const msalConfig: Configuration = {
  auth: {
    clientId: process.env.REACT_APP_AZURE_AD_CLIENT_ID || 'your-client-id',
    authority: `https://${process.env.REACT_APP_AUTH_DOMAIN || 'smartliving.b2clogin.com'}/smartliving.onmicrosoft.com/B2C_1_signin_signup`,
    knownAuthorities: [`${process.env.REACT_APP_AUTH_DOMAIN || 'smartliving.b2clogin.com'}`],
    redirectUri: window.location.origin,
  },
  cache: {
    cacheLocation: 'localStorage',
    storeAuthStateInCookie: false,
  },
};

export const loginRequest = {
  scopes: ['openid', 'profile', 'offline_access'],
};