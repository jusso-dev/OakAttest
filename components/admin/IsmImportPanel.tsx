'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import {
  importLatestIsmControls,
  importSpecificIsmRelease,
  removeIsmRevision,
  seedBundledIsmControls,
  type IsmActionState,
} from '@/app/actions/ism';

type Release = {
  name: string;
  catalogUrl: string;
};

type ImportRow = {
  revision: string;
  sourceUrl: string;
  controlCount: number;
  importedAt: string;
  referencedControls: number;
};

const initialState: IsmActionState = { ok: false, message: '' };

export function IsmImportPanel({
  releases,
  imports,
  releaseError,
}: {
  releases: Release[];
  imports: ImportRow[];
  releaseError?: string;
}) {
  const [latestState, latestAction, latestPending] = useActionState(
    importLatestIsmControls,
    initialState,
  );
  const [releaseState, releaseAction, releasePending] = useActionState(
    importSpecificIsmRelease,
    initialState,
  );
  const [seedState, seedAction, seedPending] = useActionState(
    seedBundledIsmControls,
    initialState,
  );
  const [removeState, removeAction, removePending] = useActionState(
    removeIsmRevision,
    initialState,
  );

  const state = [latestState, releaseState, seedState, removeState].find((s) => s.message);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-3">
        <form
          action={latestAction}
          className="rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] p-4"
        >
          <h2 className="text-base font-semibold text-slate-950">Current ACSC release</h2>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            Pull the current ISM OSCAL catalog from the ACSC GitHub mirror and upsert every
            control for that revision.
          </p>
          <Button className="mt-4 w-full" type="submit" variant="primary" disabled={latestPending}>
            {latestPending ? 'Importing…' : 'Import current release'}
          </Button>
        </form>

        <form
          action={releaseAction}
          className="rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] p-4"
        >
          <h2 className="text-base font-semibold text-slate-950">Specific release</h2>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            Pin an engagement-ready control set to a known ACSC ISM OSCAL tag.
          </p>
          <label className="mt-4 block text-sm font-medium text-slate-800" htmlFor="release">
            Release
          </label>
          {releases.length > 0 ? (
            <select
              id="release"
              name="release"
              className="mt-1 flex h-9 w-full rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 text-sm text-slate-950"
              defaultValue={releases[0]?.name}
            >
              {releases.map((release) => (
                <option key={release.name} value={release.name}>
                  {release.name}
                </option>
              ))}
            </select>
          ) : (
            <input
              id="release"
              name="release"
              className="mt-1 flex h-9 w-full rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] px-3 text-sm text-slate-950"
              placeholder="v2026.03.24"
            />
          )}
          {releaseError && <p className="mt-2 text-xs text-red-700">{releaseError}</p>}
          <Button
            className="mt-4 w-full"
            type="submit"
            variant="outline"
            disabled={releasePending}
          >
            {releasePending ? 'Importing…' : 'Import selected release'}
          </Button>
        </form>

        <form
          action={seedAction}
          className="rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] p-4"
        >
          <h2 className="text-base font-semibold text-slate-950">Bundled seed</h2>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            Load the small sample catalog included with the repo for local or offline testing.
          </p>
          <Button className="mt-4 w-full" type="submit" variant="outline" disabled={seedPending}>
            {seedPending ? 'Seeding…' : 'Seed bundled sample'}
          </Button>
        </form>
      </div>

      {state?.message && (
        <p
          className={`rounded-md border px-3 py-2 text-sm ${
            state.ok
              ? 'border-[var(--oak-border)] bg-[var(--oak-mist)] text-[var(--oak-shield)]'
              : 'border-red-200 bg-red-50 text-red-800'
          }`}
          aria-live="polite"
        >
          {state.message}
        </p>
      )}

      <div className="overflow-x-auto rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)]">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--field-border)] text-left text-xs uppercase text-slate-600">
              <th className="px-3 py-2">Revision</th>
              <th className="px-3 py-2">Controls</th>
              <th className="px-3 py-2">Imported</th>
              <th className="px-3 py-2">Source</th>
              <th className="px-3 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {imports.map((row) => (
              <tr key={`${row.revision}-${row.importedAt}`} className="border-b border-[var(--field-border)]">
                <td className="px-3 py-2 font-mono text-xs text-slate-900">{row.revision}</td>
                <td className="px-3 py-2 text-slate-700">
                  {row.controlCount}
                  {row.referencedControls > 0 && (
                    <span className="ml-2 rounded-full bg-[var(--oak-mist)] px-2 py-0.5 text-xs text-slate-700">
                      in use
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-slate-700">
                  {new Date(row.importedAt).toLocaleString('en-AU')}
                </td>
                <td className="max-w-xs truncate px-3 py-2 text-slate-600" title={row.sourceUrl}>
                  {row.sourceUrl}
                </td>
                <td className="px-3 py-2 text-right">
                  <form action={removeAction}>
                    <input type="hidden" name="revision" value={row.revision} />
                    <Button
                      type="submit"
                      variant="destructive"
                      size="sm"
                      disabled={removePending || row.referencedControls > 0}
                    >
                      Remove
                    </Button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {imports.length === 0 && (
          <p className="px-3 py-6 text-sm text-slate-600">
            No ISM releases are loaded yet. Import the current ACSC release or seed the bundled
            sample to create engagements.
          </p>
        )}
      </div>
    </div>
  );
}
