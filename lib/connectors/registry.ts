import { awsSecurityHubAdapter } from './aws-security-hub';
import type { ConnectorAdapter, ConnectorProvider } from './types';

const adapters: Record<ConnectorProvider, ConnectorAdapter> = {
  aws_security_hub: awsSecurityHubAdapter,
};

export function connectorAdapter(provider: ConnectorProvider): ConnectorAdapter {
  const adapter = adapters[provider];
  if (!adapter) throw new Error(`Unsupported connector provider: ${provider}`);
  return adapter;
}
