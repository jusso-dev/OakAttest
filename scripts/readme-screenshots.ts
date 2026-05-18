import 'dotenv/config';
import { chromium, type Page } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { users } from '@/db/schema/auth';
import { engagements } from '@/db/schema/engagements';
import { engagementTasks } from '@/db/schema/tasks';
import { db } from '@/lib/db/client';

const baseUrl = process.env.OAKATTEST_BASE_URL ?? 'http://localhost:3000';
const outputDir = resolve(process.cwd(), 'docs/screenshots');
const runId = Date.now();

const persona = {
  name: 'Avery Lawson',
  email: `avery.lawson+readme-${runId}@example.test`,
  password: 'CorrectHorseBatteryStaple2026!',
  tenant: `Harbour Oak Assurance ${String(runId).slice(-4)}`,
  tenantAbn: '62 684 389 839',
  client: `Southern Cross Digital Health ${String(runId).slice(-4)}`,
  clientAbn: '53 004 085 616',
  clientContact: 'Morgan Reid',
  clientEmail: 'morgan.reid@example.test',
  engagementName: `Southern Cross Patient Portal IRAP ${String(runId).slice(-4)}`,
  reference: `IRAP-${String(runId).slice(-6)}`,
  systemName: 'Patient Portal Production',
};

async function screenshot(page: Page, name: string) {
  await page
    .addStyleTag({
      content: `
        nextjs-portal,
        [data-nextjs-toast],
        [data-nextjs-dialog-overlay],
        [data-nextjs-dev-tools-button],
        [data-nextjs-dev-tools-indicator] {
          display: none !important;
          visibility: hidden !important;
        }
      `,
    })
    .catch(() => undefined);
  await page.screenshot({
    path: resolve(outputDir, `${name}.png`),
    fullPage: false,
    animations: 'disabled',
  });
}

async function goto(page: Page, path: string) {
  await page.goto(`${baseUrl}${path}`);
  await page.waitForLoadState('networkidle');
}

async function acceptTermsIfNeeded(page: Page) {
  if (!page.url().includes('/terms')) {
    await goto(page, '/dashboard');
  }
  if (!page.url().includes('/terms')) return false;
  await page.getByRole('checkbox').check();
  await screenshot(page, '02-data-handling-terms');
  await page.getByRole('button', { name: /acknowledge and continue/i }).click();
  await page.waitForLoadState('networkidle');
  return true;
}

async function signInIfNeeded(page: Page) {
  if (!page.url().includes('/signin') && !page.url().includes('/sign-in')) return false;
  await page.getByLabel('Work email').fill(persona.email);
  await page.getByLabel('Password').fill(persona.password);
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await page.waitForURL(/\/(dashboard|terms|onboarding|admin)/, { timeout: 10_000 }).catch(() => undefined);
  await page.waitForLoadState('networkidle').catch(() => undefined);
  if (page.url().includes('/signin') || page.url().includes('/sign-in')) {
    await signInViaApi(page);
  }
  return true;
}

async function signInViaApi(page: Page) {
  let lastStatus = 0;
  let lastBody = '';
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) await page.waitForTimeout(2_500);
    const response = await page.context().request.post(`${baseUrl}/api/auth/sign-in/email`, {
      headers: {
        origin: baseUrl,
        referer: `${baseUrl}/signin`,
      },
      data: { email: persona.email, password: persona.password },
    });
    if (response.ok()) {
      await goto(page, '/dashboard');
      return;
    }
    lastStatus = response.status();
    lastBody = await response.text();
    if (lastStatus === 429) break;
  }
  throw new Error(`Unable to sign in disposable account: ${lastStatus} ${lastBody}`);
}

async function createOrganisationIfNeeded(page: Page) {
  if (!page.url().includes('/onboarding')) {
    await goto(page, '/dashboard');
  }
  if (!page.url().includes('/onboarding')) return false;
  await page.getByLabel('Firm name').fill(persona.tenant);
  await page.getByLabel('ABN (optional)').fill(persona.tenantAbn);
  await screenshot(page, '03-create-organisation');
  await page.getByRole('button', { name: /create tenant/i }).click();
  await page.waitForURL(/\/admin/, { timeout: 20_000 });
  await page.waitForLoadState('networkidle');
  return true;
}

function daysFromNow(days: number) {
  const date = new Date();
  date.setHours(9, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date;
}

async function seedEngagementTasks(engagementId: string) {
  const [engagement] = await db
    .select({
      tenantId: engagements.tenantId,
    })
    .from(engagements)
    .where(eq(engagements.id, engagementId))
    .limit(1);

  const [owner] = await db
    .select({
      id: users.id,
    })
    .from(users)
    .where(eq(users.email, persona.email))
    .limit(1);

  if (!engagement || !owner) {
    throw new Error('Unable to seed screenshot task data');
  }

  await db.insert(engagementTasks).values([
    {
      engagementId,
      tenantId: engagement.tenantId,
      title: 'Confirm production boundary evidence',
      description: 'Attach the final architecture diagram and validate inherited AWS controls before fieldwork.',
      status: 'in_progress',
      priority: 'high',
      ownerUserId: owner.id,
      dueAt: daysFromNow(0),
      createdBy: owner.id,
    },
    {
      engagementId,
      tenantId: engagement.tenantId,
      title: 'Provide database backup retention evidence',
      description: 'Client needs to upload backup policy, restore test records, and storage configuration screenshots.',
      status: 'todo',
      priority: 'critical',
      ownerUserId: owner.id,
      dueAt: daysFromNow(-2),
      createdBy: owner.id,
    },
    {
      engagementId,
      tenantId: engagement.tenantId,
      title: 'Resolve vulnerability scan exception',
      description: 'Assess whether the scanner exclusion is justified and document residual risk if accepted.',
      status: 'blocked',
      priority: 'medium',
      ownerUserId: owner.id,
      dueAt: daysFromNow(3),
      createdBy: owner.id,
    },
  ]);
}

async function main() {
  await mkdir(outputDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  await goto(page, '/sign-up');
  await page.getByLabel('Full name').fill(persona.name);
  await page.getByLabel('Work email').fill(persona.email);
  await page.getByLabel('Organisation name').fill(persona.tenant);
  await page.getByLabel('ABN (optional)').fill(persona.tenantAbn);
  await page.getByLabel('Password', { exact: true }).fill(persona.password);
  await page.getByLabel('Confirm password').fill(persona.password);
  await screenshot(page, '01-sign-up');
  await page.getByRole('button', { name: /create account/i }).click();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2_000);
  await signInViaApi(page);
  await signInIfNeeded(page);
  await acceptTermsIfNeeded(page);
  await signInIfNeeded(page);
  await createOrganisationIfNeeded(page);

  await page.waitForLoadState('networkidle');
  await screenshot(page, '04-tenant-admin');

  await goto(page, '/admin/ism');
  if (await page.getByText('No ISM releases are loaded yet').isVisible().catch(() => false)) {
    await page.getByRole('button', { name: /seed bundled sample/i }).click();
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await page.getByText(/Imported .* ISM controls|No ISM releases/i).waitFor({ timeout: 20_000 }).catch(() => undefined);
  }
  await screenshot(page, '05-ism-imports');

  await goto(page, '/engagements/new');
  await page.getByLabel('Engagement name').fill(persona.engagementName);
  await page.getByLabel('Reference (optional)').fill(persona.reference);
  await page.getByLabel('Classification').selectOption('PROTECTED');
  await page.getByLabel('Assessment type').selectOption('cloud_irap');
  await page.getByLabel('Cloud provider').selectOption('aws');
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill(persona.client);
  await page.getByLabel('ABN').fill(persona.clientAbn);
  await page.getByLabel('Primary contact name').fill(persona.clientContact);
  await page.getByLabel('Primary contact email').fill(persona.clientEmail);
  await page.getByLabel('System name').fill(persona.systemName);
  await page.getByLabel('Environment').fill('AWS ap-southeast-2 production');
  await page
    .getByLabel('Description')
    .fill('Internet-facing patient portal hosted on AWS with managed database and object storage services.');
  await screenshot(page, '06-new-engagement');
  await page.getByRole('button', { name: /create engagement/i }).click();
  await page.waitForURL(/\/engagements\/[^/]+\/scope/, { timeout: 30_000 });
  const scopeUrl = page.url();
  const engagementId = new URL(scopeUrl).pathname.match(/\/engagements\/([^/]+)/)?.[1];
  if (!engagementId) throw new Error(`Unable to parse engagement id from ${scopeUrl}`);
  await seedEngagementTasks(engagementId);
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: /collapse task summary/i }).click();
  const overviewUrl = scopeUrl.replace(/\/scope$/, '/overview');

  await page.waitForLoadState('networkidle');
  await screenshot(page, '07-scope-boundary-applicability');

  await goto(page, overviewUrl.replace('/overview', '/tasks').replace(baseUrl, ''));
  await page
    .getByRole('heading', { name: 'Board view' })
    .evaluate((element) => element.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(300);
  await screenshot(page, '08-task-board');

  await goto(page, overviewUrl.replace(baseUrl, ''));
  await page.getByRole('button', { name: /expand task summary/i }).click().catch(() => undefined);
  await screenshot(page, '09-engagement-overview');

  await goto(page, '/dashboard');
  await screenshot(page, '10-dashboard');

  await goto(page, overviewUrl.replace('/overview', '/findings').replace(baseUrl, ''));
  await screenshot(page, '11-findings');

  await goto(page, overviewUrl.replace('/overview', '/certification').replace(baseUrl, ''));
  await screenshot(page, '12-certification');

  await goto(page, overviewUrl.replace('/overview', '/essential-eight').replace(baseUrl, ''));
  await screenshot(page, '13-essential-eight');

  await goto(page, overviewUrl.replace('/overview', '/evidence').replace(baseUrl, ''));
  await screenshot(page, '14-enterprise-evidence');

  await goto(page, overviewUrl.replace('/overview', '/coverage').replace(baseUrl, ''));
  await screenshot(page, '15-assessment-coverage');

  await db
    .update(engagements)
    .set({
      status: 'completed',
      phase: 'maintenance',
      certifiedAt: daysFromNow(-28),
    })
    .where(eq(engagements.id, engagementId));

  await goto(page, '/admin/compliance');
  await screenshot(page, '16-ongoing-compliance');

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
