 import { Environment } from '@abp/ng.core';

const baseUrl = 'http://localhost:4200';

const oAuthConfig = {
  issuer: 'https://localhost:44333/',
  redirectUri: baseUrl,
  clientId: 'GISLayerPublishingService_App',
  responseType: 'code',
  scope: 'offline_access GISLayerPublishingService',
  requireHttps: true,
  impersonation: {
    userImpersonation: true,
  }
};

export const environment = {
  production: false,
  application: {
    baseUrl,
    name: 'GISLayerPublishingService',
  },
  oAuthConfig,
  apis: {
    default: {
      url: 'https://localhost:44333',
      rootNamespace: 'GISLayerPublishingService',
    },
    AbpAccountPublic: {
      url: oAuthConfig.issuer,
      rootNamespace: 'AbpAccountPublic',
    },
  },
} as Environment;
