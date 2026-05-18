import {
  BedrockRuntimeClient,
  ConverseCommand,
  ConverseStreamCommand,
  type Message,
} from '@aws-sdk/client-bedrock-runtime';
import type { BurlChatMessage } from './types';

const DEFAULT_MODEL_ID = 'au.anthropic.claude-haiku-4-5-20251001-v1:0';

export const burlModelId = process.env.OAK_AI_BEDROCK_MODEL_ID ?? DEFAULT_MODEL_ID;

const client = new BedrockRuntimeClient({
  region: process.env.AWS_REGION ?? 'ap-southeast-2',
});

export async function askBurlWithBedrock({
  messages,
  system,
}: {
  messages: BurlChatMessage[];
  system: string;
}) {
  if (process.env.OAK_AI_PROVIDER && process.env.OAK_AI_PROVIDER !== 'bedrock') {
    throw new Error(`Unsupported OAK_AI_PROVIDER "${process.env.OAK_AI_PROVIDER}".`);
  }

  const bedrockMessages = toBedrockMessages(messages);
  const command = new ConverseCommand({
    modelId: burlModelId,
    system: [{ text: system }],
    messages: bedrockMessages,
    inferenceConfig: {
      maxTokens: 1200,
      temperature: 0.2,
    },
  });

  const response = await client.send(command);
  const reply = response.output?.message?.content
    ?.map((part) => part.text)
    .filter(Boolean)
    .join('\n')
    .trim();

  if (!reply) {
    throw new Error('Burl did not return a text response.');
  }

  return reply;
}

export async function* streamBurlWithBedrock({
  messages,
  system,
}: {
  messages: BurlChatMessage[];
  system: string;
}) {
  if (process.env.OAK_AI_PROVIDER && process.env.OAK_AI_PROVIDER !== 'bedrock') {
    throw new Error(`Unsupported OAK_AI_PROVIDER "${process.env.OAK_AI_PROVIDER}".`);
  }

  const command = new ConverseStreamCommand({
    modelId: burlModelId,
    system: [{ text: system }],
    messages: toBedrockMessages(messages),
    inferenceConfig: {
      maxTokens: 1200,
      temperature: 0.2,
    },
  });

  const response = await client.send(command);
  for await (const event of response.stream ?? []) {
    const text = event.contentBlockDelta?.delta?.text;
    if (text) yield text;
  }
}

function toBedrockMessages(messages: BurlChatMessage[]): Message[] {
  const cleaned = messages
    .map((message) => ({
      role: message.role,
      content: message.content.trim(),
    }))
    .filter((message) => message.content.length > 0);

  const bedrockMessages: Message[] = [];
  for (const message of cleaned) {
    const role = message.role === 'assistant' ? 'assistant' : 'user';
    const last = bedrockMessages[bedrockMessages.length - 1];

    if (last?.role === role) {
      last.content?.push({ text: message.content });
    } else {
      bedrockMessages.push({
        role,
        content: [{ text: message.content }],
      });
    }
  }

  if (bedrockMessages.length === 0 || bedrockMessages[0].role !== 'user') {
    bedrockMessages.unshift({
      role: 'user',
      content: [{ text: 'Help me understand what evidence is needed for this assessment.' }],
    });
  }

  return bedrockMessages.slice(-12);
}
