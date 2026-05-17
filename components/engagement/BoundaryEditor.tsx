'use client';

import { useCallback, useMemo, useState } from 'react';
import 'reactflow/dist/style.css';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Node,
  type Edge,
  type Connection,
  type NodeChange,
  type EdgeChange,
} from 'reactflow';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { saveBoundaryDraft, lockBoundary } from '@/app/actions/boundary';

type ComponentType =
  | 'host'
  | 'service'
  | 'data_store'
  | 'network'
  | 'integration'
  | 'user_group'
  | 'external';

type BoundaryNodeData = {
  label: string;
  componentType: ComponentType;
  environment?: string;
  classification?: 'OFFICIAL' | 'OFFICIAL_SENSITIVE' | 'PROTECTED' | 'SECRET' | 'TOP_SECRET';
  owner?: string;
  notes?: string;
};

const COMPONENT_TYPES: ComponentType[] = [
  'host',
  'service',
  'data_store',
  'network',
  'integration',
  'user_group',
  'external',
];

export function BoundaryEditor({
  engagementId,
  initialNodes,
  initialEdges,
  locked,
  canLock,
  canEdit,
}: {
  engagementId: string;
  initialNodes: Node<BoundaryNodeData>[];
  initialEdges: Edge[];
  locked: boolean;
  canLock: boolean;
  canEdit: boolean;
}) {
  const [nodes, setNodes] = useState<Node<BoundaryNodeData>[]>(initialNodes);
  const [edges, setEdges] = useState<Edge[]>(initialEdges);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds)),
    [],
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    [],
  );
  const onConnect = useCallback(
    (connection: Connection) =>
      setEdges((eds) => addEdge({ ...connection, id: `e-${crypto.randomUUID()}` }, eds)),
    [],
  );

  const selected = useMemo(
    () => nodes.find((n) => n.id === selectedId) ?? null,
    [nodes, selectedId],
  );

  function addNode() {
    const id = `n-${crypto.randomUUID()}`;
    setNodes((nds) => [
      ...nds,
      {
        id,
        type: 'default',
        position: { x: 200 + Math.random() * 300, y: 100 + Math.random() * 200 },
        data: { label: 'New component', componentType: 'service' },
      },
    ]);
    setSelectedId(id);
  }

  function updateSelected(patch: Partial<BoundaryNodeData>) {
    if (!selected) return;
    setNodes((nds) =>
      nds.map((n) =>
        n.id === selected.id ? { ...n, data: { ...n.data, ...patch } } : n,
      ),
    );
  }

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await saveBoundaryDraft({
        engagementId,
        graph: {
          nodes: nodes.map((n) => ({
            id: n.id,
            type: n.type ?? 'default',
            position: n.position,
            data: n.data,
          })),
          edges: edges.map((e) => ({
            id: e.id,
            source: e.source,
            target: e.target,
            label: typeof e.label === 'string' ? e.label : undefined,
          })),
        },
      });
      setMessage(`Saved as version ${result.version}.`);
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onLock() {
    setBusy(true);
    setMessage(null);
    try {
      await lockBoundary({ engagementId });
      setMessage('Boundary locked. The engagement is now in the evidence phase.');
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="h-[520px] rounded-md border border-slate-200 bg-white">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={(_, n) => setSelectedId(n.id)}
          fitView
          nodesDraggable={canEdit && !locked}
          nodesConnectable={canEdit && !locked}
          elementsSelectable={canEdit && !locked}
        >
          <Background gap={16} />
          <Controls position="bottom-left" />
          <MiniMap pannable />
        </ReactFlow>
      </div>
      <aside className="space-y-3">
        <div className="rounded-md border border-slate-200 bg-white p-4">
          <p className="text-sm font-medium text-slate-900">Boundary status</p>
          <p className="mt-1 text-xs text-slate-500">
            {locked ? 'Locked. Changes require a change request.' : 'Draft — save to version it.'}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={addNode} disabled={locked || !canEdit}>
              Add component
            </Button>
            <Button size="sm" variant="primary" onClick={save} disabled={busy || locked || !canEdit}>
              {busy ? 'Saving…' : 'Save version'}
            </Button>
            {canLock && !locked && (
              <Button size="sm" variant="outline" onClick={onLock} disabled={busy}>
                Lock for assessment
              </Button>
            )}
          </div>
          {message && <p className="mt-3 text-xs text-slate-600">{message}</p>}
        </div>

        <div className="rounded-md border border-slate-200 bg-white p-4">
          <p className="text-sm font-medium text-slate-900">Selected component</p>
          {selected ? (
            <div className="mt-3 space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="label">Label</Label>
                <Input
                  id="label"
                  value={selected.data.label}
                  onChange={(e) => updateSelected({ label: e.target.value })}
                  disabled={locked || !canEdit}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="type">Component type</Label>
                <select
                  id="type"
                  className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                  value={selected.data.componentType}
                  onChange={(e) => updateSelected({ componentType: e.target.value as ComponentType })}
                  disabled={locked || !canEdit}
                >
                  {COMPONENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="environment">Environment</Label>
                <Input
                  id="environment"
                  value={selected.data.environment ?? ''}
                  onChange={(e) => updateSelected({ environment: e.target.value })}
                  disabled={locked || !canEdit}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="owner">Owner</Label>
                <Input
                  id="owner"
                  value={selected.data.owner ?? ''}
                  onChange={(e) => updateSelected({ owner: e.target.value })}
                  disabled={locked || !canEdit}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="notes">Notes</Label>
                <textarea
                  id="notes"
                  rows={3}
                  className="flex w-full rounded-md border border-slate-200 bg-white p-2 text-sm"
                  value={selected.data.notes ?? ''}
                  onChange={(e) => updateSelected({ notes: e.target.value })}
                  disabled={locked || !canEdit}
                />
              </div>
            </div>
          ) : (
            <p className="mt-3 text-xs text-slate-500">Select a node to edit its properties.</p>
          )}
        </div>
      </aside>
    </div>
  );
}
