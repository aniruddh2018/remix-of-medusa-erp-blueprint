// Configures the Amplify Events client for the AGENT CONTAINER's own
// connection to AppSync Events — authenticated via IAM (the container's
// execution role), separate from the browser's OIDC-authenticated
// connection. Adapted from the reference implementation's amplify.ts.
import { fromNodeProviderChain } from '@aws-sdk/credential-providers';
import { Amplify } from 'aws-amplify';

// Amplify's Events client expects a global WebSocket (browser API) — Node
// needs the `ws` polyfill.
// eslint-disable-next-line @typescript-eslint/no-require-imports
Object.assign(global, { WebSocket: require('ws') });

Amplify.configure(
  {
    API: {
      Events: {
        endpoint: `${process.env.EVENT_API_ENDPOINT!}/event`,
        region: process.env.BEDROCK_REGION || 'us-east-1',
        defaultAuthMode: 'iam',
      },
    },
  },
  {
    Auth: {
      credentialsProvider: {
        getCredentialsAndIdentityId: async () => {
          const provider = fromNodeProviderChain();
          const credentials = await provider();
          return { credentials };
        },
        clearCredentialsAndIdentityId: async () => {},
      },
    },
  }
);
