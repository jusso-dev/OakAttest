import {
  askBurlWithBedrock,
  burlModelId,
  streamBurlWithBedrock,
} from './bedrock';
import { askBurlWithHermes, hermesModelId, streamBurlWithHermes } from './hermes';
import type { BurlChatMessage } from './types';

export type BurlProvider = 'bedrock' | 'hermes';

type BurlProviderInput = {
  messages: BurlChatMessage[];
  system: string;
  context: {
    tenantId: string;
    userId: string;
    engagementId?: string;
  };
};

export function burlProviderMetadata(): { provider: BurlProvider; modelId: string } {
  const provider = selectedProvider();
  return {
    provider,
    modelId: provider === 'hermes' ? hermesModelId() : burlModelId,
  };
}

export function askBurl(input: BurlProviderInput) {
  return selectedProvider() === 'hermes'
    ? askBurlWithHermes(input)
    : askBurlWithBedrock(input);
}

export function streamBurl(input: BurlProviderInput) {
  return selectedProvider() === 'hermes'
    ? streamBurlWithHermes(input)
    : streamBurlWithBedrock(input);
}

function selectedProvider(): BurlProvider {
  const provider = process.env.OAK_AI_PROVIDER ?? 'bedrock';
  if (provider === 'bedrock' || provider === 'hermes') return provider;
  throw new Error(`Unsupported OAK_AI_PROVIDER "${provider}".`);
}
