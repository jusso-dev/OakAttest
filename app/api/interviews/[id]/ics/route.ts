import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { interviews } from '@/db/schema/interviews';
import { generateInterviewIcs } from '@/app/actions/interviews';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [i] = await db.select().from(interviews).where(eq(interviews.id, id)).limit(1);
  if (!i) return new NextResponse('Not found', { status: 404 });
  try {
    const ics = await generateInterviewIcs({ engagementId: i.engagementId, interviewId: id });
    return new NextResponse(ics, {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="${i.title.replace(/[^a-z0-9]+/gi, '_')}.ics"`,
      },
    });
  } catch {
    return new NextResponse('Forbidden', { status: 403 });
  }
}
