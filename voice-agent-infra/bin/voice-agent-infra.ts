#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { VoiceAgentInfraStack } from '../lib/voice-agent-infra-stack';

const app = new cdk.App();

// Single-tenant MVP — see the stack file header for the multi-tenant
// follow-up note. This points at "Client #1" / the control-plane project.
new VoiceAgentInfraStack(app, 'VoiceAgentInfraStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  supabaseOidcDiscoveryUrl: 'https://mpsmlicyzjjlwewxjtod.supabase.co/auth/v1/.well-known/openid-configuration',
  supabaseUrl: 'https://mpsmlicyzjjlwewxjtod.supabase.co',
  bedrockRegion: 'us-east-1',
});
