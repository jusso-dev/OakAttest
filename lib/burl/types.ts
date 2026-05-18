export type BurlChatRole = 'user' | 'assistant';

export type BurlChatMessage = {
  role: BurlChatRole;
  content: string;
};

export type BurlAttachmentSummary = {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  extractedCharacters: number;
  truncated: boolean;
};

export type BurlChatResponse = {
  reply: string;
  modelId: string;
  provider: 'bedrock';
  attachment?: BurlAttachmentSummary;
};
