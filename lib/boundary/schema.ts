import { z } from 'zod';

// React Flow graph schema. Used both by the server action that persists a
// boundary version and by the React Flow component that renders it.

export const boundaryNodeSchema = z.object({
  id: z.string().min(1),
  type: z.string().default('component'),
  position: z.object({ x: z.number(), y: z.number() }),
  data: z.object({
    label: z.string().min(1),
    componentType: z.enum([
      'host',
      'service',
      'data_store',
      'network',
      'integration',
      'user_group',
      'external',
      'boundary_box',
    ]),
    width: z.number().min(160).max(2000).optional(),
    height: z.number().min(120).max(1600).optional(),
    environment: z.string().optional(),
    classification: z
      .enum(['OFFICIAL', 'OFFICIAL_SENSITIVE', 'PROTECTED', 'SECRET', 'TOP_SECRET'])
      .optional(),
    owner: z.string().optional(),
    notes: z.string().optional(),
  }),
});

export const boundaryEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  sourceHandle: z.string().optional(),
  targetHandle: z.string().optional(),
  type: z.string().optional(),
  label: z.string().optional(),
  data: z
    .object({
      protocol: z.string().optional(),
      encrypted: z.boolean().optional(),
    })
    .optional(),
});

export const boundaryGraphSchema = z.object({
  nodes: z.array(boundaryNodeSchema),
  edges: z.array(boundaryEdgeSchema),
});

export type BoundaryGraph = z.infer<typeof boundaryGraphSchema>;
export type BoundaryNode = z.infer<typeof boundaryNodeSchema>;
export type BoundaryEdge = z.infer<typeof boundaryEdgeSchema>;
