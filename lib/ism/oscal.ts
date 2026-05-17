import { z } from 'zod';
import type { Classification } from '@/db/schema/enums';
import { CLASSIFICATION_RANK } from '@/db/schema/enums';

// OSCAL 1.1 catalogue (relaxed subset). The full control object is kept
// verbatim in `ism_controls.oscal_raw` so anything we do not parse here is
// not lost. Source format reference: https://pages.nist.gov/OSCAL/

const PropSchema = z.object({
  name: z.string(),
  value: z.string(),
  ns: z.string().optional(),
  class: z.string().optional(),
});

type Part = {
  id?: string;
  name: string;
  prose?: string;
  parts?: Part[];
  props?: z.infer<typeof PropSchema>[];
};

const PartSchema: z.ZodType<Part> = z.lazy(() =>
  z.object({
    id: z.string().optional(),
    name: z.string(),
    prose: z.string().optional(),
    parts: z.array(PartSchema).optional(),
    props: z.array(PropSchema).optional(),
  }),
);

type Control = {
  id: string;
  title?: string;
  class?: string;
  props?: z.infer<typeof PropSchema>[];
  parts?: Part[];
  controls?: Control[];
};

const ControlSchema: z.ZodType<Control> = z.lazy(() =>
  z.object({
    id: z.string(),
    title: z.string().optional(),
    class: z.string().optional(),
    props: z.array(PropSchema).optional(),
    parts: z.array(PartSchema).optional(),
    controls: z.array(ControlSchema).optional(),
  }),
);

type Group = {
  id?: string;
  title?: string;
  groups?: Group[];
  controls?: Control[];
  props?: z.infer<typeof PropSchema>[];
};

const GroupSchema: z.ZodType<Group> = z.lazy(() =>
  z.object({
    id: z.string().optional(),
    title: z.string().optional(),
    groups: z.array(GroupSchema).optional(),
    controls: z.array(ControlSchema).optional(),
    props: z.array(PropSchema).optional(),
  }),
);

const CatalogueSchema = z.object({
  catalog: z.object({
    uuid: z.string().optional(),
    metadata: z.object({
      title: z.string().optional(),
      version: z.string().optional(),
      'last-modified': z.string().optional(),
      'oscal-version': z.string().optional(),
    }),
    groups: z.array(GroupSchema).optional(),
    controls: z.array(ControlSchema).optional(),
  }),
});

export type OscalCatalogue = z.infer<typeof CatalogueSchema>;
export type OscalControl = Control;

export function parseOscalCatalogue(raw: unknown): OscalCatalogue {
  return CatalogueSchema.parse(raw);
}

// Walk the (possibly nested) groups + controls tree and return every leaf
// control with its enclosing topic.
export function iterateControls(catalogue: OscalCatalogue): Array<{
  topic: string | undefined;
  control: OscalControl;
}> {
  const out: Array<{ topic: string | undefined; control: OscalControl }> = [];

  function visitControls(controls: OscalControl[] | undefined, topic: string | undefined) {
    if (!controls) return;
    for (const c of controls) {
      out.push({ topic, control: c });
      if (c.controls) visitControls(c.controls, topic);
    }
  }

  function visitGroup(group: Group, parentTopic: string | undefined) {
    const topic = group.title ?? parentTopic;
    visitControls(group.controls, topic);
    if (group.groups) {
      for (const g of group.groups) visitGroup(g, topic);
    }
  }

  visitControls(catalogue.catalog.controls, undefined);
  if (catalogue.catalog.groups) {
    for (const g of catalogue.catalog.groups) visitGroup(g, undefined);
  }
  return out;
}

// Extract the minimum classification. ASD encodes this via OSCAL props. We
// accept a few conventions to be resilient to revision drift.
export function extractMinClassification(c: OscalControl): Classification {
  const props = c.props ?? [];

  const direct = props.find(
    (p) =>
      p.name.toLowerCase() === 'classification' ||
      p.name.toLowerCase() === 'min-classification',
  );
  if (direct) {
    const v = normaliseClassification(direct.value);
    if (v) return v;
  }

  const flagged = props
    .filter((p) => p.name.toLowerCase().startsWith('applies-to'))
    .map((p) => normaliseClassification(p.value))
    .filter((v): v is Classification => Boolean(v));
  if (flagged.length > 0) {
    return flagged.reduce((min, cur) =>
      CLASSIFICATION_RANK[cur] < CLASSIFICATION_RANK[min] ? cur : min,
    );
  }

  // Default to OFFICIAL: the cumulative rule means a missing classification
  // is the most permissive (always selected). Importer logs when defaulting.
  return 'OFFICIAL';
}

function normaliseClassification(input: string): Classification | null {
  const v = input.trim().toUpperCase().replace(/[: ]/g, '_');
  switch (v) {
    case 'OFFICIAL':
      return 'OFFICIAL';
    case 'OFFICIAL_SENSITIVE':
      return 'OFFICIAL_SENSITIVE';
    case 'PROTECTED':
      return 'PROTECTED';
    case 'SECRET':
      return 'SECRET';
    case 'TOP_SECRET':
      return 'TOP_SECRET';
    default:
      return null;
  }
}

export function extractStatementAndGuidance(c: OscalControl): {
  description: string;
  guidance?: string;
} {
  const parts = c.parts ?? [];
  const statement = parts.find((p) => p.name === 'statement')?.prose;
  const guidance = parts.find((p) => p.name === 'guidance')?.prose;
  return {
    description: statement ?? c.title ?? c.id,
    guidance,
  };
}

export function extractEssentialEight(c: OscalControl): Array<{
  strategy: string;
  maturityLevel?: number;
}> {
  const props = c.props ?? [];
  return props
    .filter((p) => p.name.toLowerCase() === 'essential-eight')
    .map((p) => {
      const [strategy, ml] = p.value.split(':');
      const m = ml?.match(/(\d)/)?.[1];
      return { strategy, maturityLevel: m ? Number(m) : undefined };
    });
}
