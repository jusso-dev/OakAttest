import { describe, it, expect } from 'vitest';
import { boundaryGraphSchema } from '@/lib/boundary/schema';

describe('boundary graph schema', () => {
  it('accepts a minimal graph', () => {
    const parsed = boundaryGraphSchema.parse({
      nodes: [
        {
          id: 'n1',
          type: 'default',
          position: { x: 0, y: 0 },
          data: { label: 'Web', componentType: 'service' },
        },
      ],
      edges: [],
    });
    expect(parsed.nodes).toHaveLength(1);
  });

  it('rejects unknown component types', () => {
    expect(() =>
      boundaryGraphSchema.parse({
        nodes: [
          {
            id: 'n1',
            type: 'default',
            position: { x: 0, y: 0 },
            data: { label: 'Web', componentType: 'mainframe' },
          },
        ],
        edges: [],
      }),
    ).toThrow();
  });

  it('validates edges reference node ids loosely', () => {
    const result = boundaryGraphSchema.safeParse({
      nodes: [],
      edges: [{ id: 'e1', source: 'n1', target: 'n2' }],
    });
    expect(result.success).toBe(true);
  });
});
