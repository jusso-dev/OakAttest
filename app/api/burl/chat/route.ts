import { z } from 'zod';
import { headers } from 'next/headers';
import { requireSession } from '@/lib/auth/session';
import { resolveActiveTenant } from '@/lib/auth/active-tenant';
import { recordAudit } from '@/lib/audit/log';
import { askBurlWithBedrock, burlModelId } from '@/lib/burl/bedrock';
import { buildBurlSystemPrompt } from '@/lib/burl/context';
import { extractPdfText } from '@/lib/burl/pdf';
import { evaluateBurlRequest } from '@/lib/burl/safety';
import type { BurlAttachmentSummary, BurlChatMessage, BurlChatResponse } from '@/lib/burl/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const chatSchema = z.object({
  engagementId: z.string().uuid().optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(8000),
      }),
    )
    .min(1)
    .max(16),
});

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const activeTenant = await resolveActiveTenant(session.user.id);
    if (!activeTenant) {
      return Response.json({ error: 'No active tenant found.' }, { status: 403 });
    }

    const formData = await request.formData();
    const parsed = chatSchema.parse({
      engagementId: emptyToUndefined(formData.get('engagementId')),
      messages: JSON.parse(String(formData.get('messages') ?? '[]')),
    });

    const file = formData.get('file');
    const attachment =
      file instanceof File && file.size > 0 ? await readAttachment(file) : undefined;
    const messages: BurlChatMessage[] = parsed.messages;
    const userMessage = latestUserMessage(messages);
    const safety = evaluateBurlRequest({
      messages,
      hasEngagementContext: Boolean(parsed.engagementId),
      hasAttachment: Boolean(attachment),
    });

    if (!safety.allowed) {
      await recordAudit({
        tenantId: activeTenant.tenantId,
        engagementId: parsed.engagementId ?? null,
        actorUserId: session.user.id,
        action: 'burl.chat.blocked',
        resourceType: 'ai_assistant',
        resourceId: 'burl',
        afterJson: {
          reason: safety.reason,
          messageCount: messages.length,
          userMessage,
          userMessageCharacters: userMessage.length,
          attachment: attachment?.summary,
        },
        message: `Burl blocked: ${auditMessageSummary(userMessage)}`,
      });

      const response: BurlChatResponse = {
        reply: safety.response,
        modelId: 'local-guardrail',
        provider: 'bedrock',
        attachment: attachment?.summary,
      };

      return Response.json(response);
    }

    const system = await buildBurlSystemPrompt({
      userId: session.user.id,
      tenantId: activeTenant.tenantId,
      tenantName: activeTenant.tenantName,
      engagementId: parsed.engagementId,
      pdfText: attachment?.text,
      pdfFilename: attachment?.summary.filename,
    });

    const reply = await askBurlWithBedrock({ messages, system });

    const hdrs = await headers();
    await recordAudit({
      tenantId: activeTenant.tenantId,
      engagementId: parsed.engagementId ?? null,
      actorUserId: session.user.id,
      actorUserAgent: hdrs.get('user-agent'),
      action: 'burl.chat',
      resourceType: 'ai_assistant',
      resourceId: 'burl',
      afterJson: {
        modelId: burlModelId,
        messageCount: messages.length,
        userMessage,
        userMessageCharacters: userMessage.length,
        responseCharacters: reply.length,
        attachment: attachment?.summary,
      },
      message: `Burl chat: ${auditMessageSummary(userMessage)}`,
    });

    const response: BurlChatResponse = {
      reply,
      modelId: burlModelId,
      provider: 'bedrock',
      attachment: attachment?.summary,
    };

    return Response.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Burl could not answer right now.';
    const status = message.includes('access') || message.includes('Authentication') ? 403 : 400;
    return Response.json({ error: message }, { status });
  }
}

async function readAttachment(file: File): Promise<{
  text: string;
  summary: BurlAttachmentSummary;
}> {
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (!isPdf) {
    throw new Error('Burl currently accepts PDF evidence attachments only.');
  }

  const extracted = await extractPdfText(file);
  if (!extracted.text) {
    throw new Error('Burl could not extract readable text from that PDF.');
  }

  return {
    text: extracted.text,
    summary: {
      filename: file.name,
      mimeType: file.type || 'application/pdf',
      sizeBytes: file.size,
      extractedCharacters: extracted.extractedCharacters,
      truncated: extracted.truncated,
    },
  };
}

function emptyToUndefined(value: FormDataEntryValue | null) {
  if (typeof value !== 'string' || value.length === 0) return undefined;
  return value;
}

function latestUserMessage(messages: BurlChatMessage[]) {
  return [...messages].reverse().find((message) => message.role === 'user')?.content.trim() ?? '';
}

function auditMessageSummary(value: string) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) return 'empty prompt';
  return normalized.length > 220 ? `${normalized.slice(0, 217)}...` : normalized;
}
