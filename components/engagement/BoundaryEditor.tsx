'use client';

import { useCallback, useMemo, useState } from 'react';
import 'reactflow/dist/style.css';
import ReactFlow, {
  Background,
  Controls,
  ConnectionMode,
  Handle,
  MiniMap,
  Position,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Node,
  type Edge,
  type Connection,
  type NodeChange,
  type EdgeChange,
  type NodeProps,
} from 'reactflow';
import {
  Cloud,
  Cpu,
  Database,
  Globe2,
  Network,
  Plug,
  Server,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { saveBoundaryDraft, lockBoundary } from '@/app/actions/boundary';
import { cn } from '@/lib/utils';
import { useUnsavedChanges } from '@/components/engagement/UnsavedChangesGuard';

type ComponentType =
  | 'host'
  | 'service'
  | 'data_store'
  | 'network'
  | 'integration'
  | 'user_group'
  | 'external'
  | 'boundary_box';

type BoundaryNodeData = {
  label: string;
  componentType: ComponentType;
  width?: number;
  height?: number;
  environment?: string;
  classification?: 'OFFICIAL' | 'OFFICIAL_SENSITIVE' | 'PROTECTED' | 'SECRET' | 'TOP_SECRET';
  owner?: string;
  notes?: string;
};

const COMPONENT_TYPE_META: Record<
  ComponentType,
  {
    label: string;
    description: string;
    Icon: React.ComponentType<{ className?: string }>;
    className: string;
  }
> = {
  host: {
    label: 'Host',
    description: 'Server, VM, container host',
    Icon: Server,
    className: 'border-slate-300 bg-slate-50 text-slate-900',
  },
  service: {
    label: 'Service',
    description: 'Application or workload',
    Icon: Cpu,
    className: 'border-[var(--oak-border)] bg-[var(--oak-mist)] text-[var(--oak-shield)]',
  },
  data_store: {
    label: 'Data store',
    description: 'Database, bucket, queue',
    Icon: Database,
    className: 'border-blue-200 bg-blue-50 text-blue-900',
  },
  network: {
    label: 'Network',
    description: 'VPC, subnet, gateway',
    Icon: Network,
    className: 'border-cyan-200 bg-cyan-50 text-cyan-900',
  },
  integration: {
    label: 'Integration',
    description: 'API or third-party link',
    Icon: Plug,
    className: 'border-amber-200 bg-amber-50 text-amber-900',
  },
  user_group: {
    label: 'User group',
    description: 'People or roles',
    Icon: Users,
    className: 'border-violet-200 bg-violet-50 text-violet-900',
  },
  external: {
    label: 'External',
    description: 'Outside boundary',
    Icon: Globe2,
    className: 'border-red-200 bg-red-50 text-red-900',
  },
  boundary_box: {
    label: 'Boundary box',
    description: 'Environment or data centre',
    Icon: Cloud,
    className: 'border-slate-300 bg-[var(--oak-mist)] text-slate-900',
  },
};

const COMPONENT_TYPES = Object.keys(COMPONENT_TYPE_META).filter(
  (type) => type !== 'boundary_box',
) as ComponentType[];

function normalizeNode(node: Node<BoundaryNodeData>): Node<BoundaryNodeData> {
  const isBox = node.data.componentType === 'boundary_box' || node.type === 'boundaryBox';
  return {
    ...node,
    type: isBox ? 'boundaryBox' : 'boundaryComponent',
    zIndex: isBox ? 0 : 10,
  };
}

function ConnectionHandle({
  id,
  position,
  isConnectable,
}: {
  id: string;
  position: Position;
  isConnectable: boolean;
}) {
  return (
    <Handle
      id={id}
      type="source"
      position={position}
      isConnectable={isConnectable}
      className="!h-3 !w-3 !border-2 !border-[var(--panel-surface)] !bg-[var(--oak-shield)]"
    />
  );
}

function BoundaryComponentNode({
  data,
  selected,
  isConnectable,
}: NodeProps<BoundaryNodeData>) {
  const meta = COMPONENT_TYPE_META[data.componentType] ?? COMPONENT_TYPE_META.service;
  const Icon = meta.Icon;

  return (
    <div
      className={cn(
        'min-w-[180px] rounded-md border px-3 py-2 shadow-sm transition-shadow',
        meta.className,
        selected && 'ring-2 ring-[var(--oak-shield)] ring-offset-2',
      )}
    >
      <ConnectionHandle id="top" position={Position.Top} isConnectable={isConnectable} />
      <ConnectionHandle id="right" position={Position.Right} isConnectable={isConnectable} />
      <ConnectionHandle id="bottom" position={Position.Bottom} isConnectable={isConnectable} />
      <ConnectionHandle id="left" position={Position.Left} isConnectable={isConnectable} />
      <div className="flex items-start gap-2">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--panel-surface)]/80">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-5">{data.label}</p>
          <p className="text-xs leading-4 opacity-80">{meta.label}</p>
          {data.environment && (
            <p className="mt-1 truncate text-xs leading-4 opacity-80">{data.environment}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function BoundaryBoxNode({ data, selected }: NodeProps<BoundaryNodeData>) {
  const width = data.width ?? 420;
  const height = data.height ?? 260;

  return (
    <div
      className={cn(
        'rounded-md border-2 border-dashed border-slate-300 bg-[var(--oak-mist)]/60 px-3 py-2 text-slate-800',
        selected && 'ring-2 ring-[var(--oak-shield)] ring-offset-2',
      )}
      style={{ width, height }}
    >
      <div className="flex items-center gap-2">
        <Cloud className="h-4 w-4 text-[var(--oak-shield)]" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-5">{data.label}</p>
          <p className="text-xs leading-4 text-slate-600">
            {data.environment || 'Environment boundary'}
          </p>
        </div>
      </div>
    </div>
  );
}

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
  const [nodes, setNodes] = useState<Node<BoundaryNodeData>[]>(
    initialNodes.map(normalizeNode),
  );
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
      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            id: `e-${crypto.randomUUID()}`,
            type: 'smoothstep',
            style: { stroke: '#475569', strokeWidth: 2 },
          },
          eds,
        ),
      ),
    [],
  );

  const selected = useMemo(
    () => nodes.find((n) => n.id === selectedId) ?? null,
    [nodes, selectedId],
  );
  const nodeTypes = useMemo(
    () => ({ boundaryComponent: BoundaryComponentNode, boundaryBox: BoundaryBoxNode }),
    [],
  );
  const graphSignature = useMemo(
    () =>
      JSON.stringify({
        nodes: nodes.map((n) => ({
          id: n.id,
          type: n.type ?? 'boundaryComponent',
          position: n.position,
          data: n.data,
        })),
        edges: edges.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          label: typeof e.label === 'string' ? e.label : undefined,
        })),
      }),
    [edges, nodes],
  );
  const [savedGraphSignature, setSavedGraphSignature] = useState(graphSignature);
  useUnsavedChanges(
    canEdit && !locked && graphSignature !== savedGraphSignature,
    'System boundary',
  );

  function addNode() {
    const id = `n-${crypto.randomUUID()}`;
    setNodes((nds) => [
      ...nds,
      {
        id,
        type: 'boundaryComponent',
        zIndex: 10,
        position: { x: 200 + Math.random() * 300, y: 100 + Math.random() * 200 },
        data: { label: 'New component', componentType: 'service' },
      },
    ]);
    setSelectedId(id);
  }

  function addBoundaryBox() {
    const id = `box-${crypto.randomUUID()}`;
    setNodes((nds) => [
      {
        id,
        type: 'boundaryBox',
        zIndex: 0,
        position: { x: 80 + Math.random() * 160, y: 80 + Math.random() * 120 },
        data: {
          label: 'New environment',
          componentType: 'boundary_box',
          environment: 'Production',
          width: 420,
          height: 260,
        },
      },
      ...nds,
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
            type: n.type ?? 'boundaryComponent',
            position: n.position,
            data: n.data,
          })),
          edges: edges.map((e) => ({
            id: e.id,
            source: e.source,
            target: e.target,
            sourceHandle: e.sourceHandle ?? undefined,
            targetHandle: e.targetHandle ?? undefined,
            type: typeof e.type === 'string' ? e.type : undefined,
            label: typeof e.label === 'string' ? e.label : undefined,
          })),
        },
      });
      setSavedGraphSignature(graphSignature);
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
      <div className="h-[520px] rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)]">
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
          nodeTypes={nodeTypes}
          connectionMode={ConnectionMode.Loose}
          connectionRadius={36}
          defaultEdgeOptions={{
            type: 'smoothstep',
            style: { stroke: '#475569', strokeWidth: 2 },
          }}
        >
          <Background gap={16} />
          <Controls position="bottom-left" />
          <MiniMap pannable />
        </ReactFlow>
      </div>
      <aside className="space-y-3">
        <div className="rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] p-4">
          <p className="text-sm font-medium text-slate-900">Boundary status</p>
          <p className="mt-1 text-xs text-slate-600">
            {locked ? 'Locked. Changes require a change request.' : 'Draft — save to version it.'}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={addNode} disabled={locked || !canEdit}>
              Add component
            </Button>
            <Button size="sm" variant="outline" onClick={addBoundaryBox} disabled={locked || !canEdit}>
              Add boundary box
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

        <div className="rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] p-4">
          <p className="text-sm font-medium text-slate-900">
            {selected?.data.componentType === 'boundary_box' ? 'Selected box' : 'Selected component'}
          </p>
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
              {selected.data.componentType !== 'boundary_box' ? (
                <div className="space-y-1.5">
                  <Label htmlFor="type">Component type</Label>
                  <div className="grid grid-cols-1 gap-2">
                    {COMPONENT_TYPES.map((t) => (
                      <TypeButton
                        key={t}
                        type={t}
                        active={selected.data.componentType === t}
                        disabled={locked || !canEdit}
                        onClick={() => updateSelected({ componentType: t })}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="width">Width</Label>
                    <Input
                      id="width"
                      type="number"
                      min={160}
                      value={selected.data.width ?? 420}
                      onChange={(e) => updateSelected({ width: Number(e.target.value) })}
                      disabled={locked || !canEdit}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="height">Height</Label>
                    <Input
                      id="height"
                      type="number"
                      min={120}
                      value={selected.data.height ?? 260}
                      onChange={(e) => updateSelected({ height: Number(e.target.value) })}
                      disabled={locked || !canEdit}
                    />
                  </div>
                </div>
              )}
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
                  className="flex w-full rounded-md border border-[var(--field-border)] bg-[var(--panel-surface)] p-2 text-sm"
                  value={selected.data.notes ?? ''}
                  onChange={(e) => updateSelected({ notes: e.target.value })}
                  disabled={locked || !canEdit}
                />
              </div>
            </div>
          ) : (
            <p className="mt-3 text-xs text-slate-600">Select a node to edit its properties.</p>
          )}
        </div>
      </aside>
    </div>
  );
}

function TypeButton({
  type,
  active,
  disabled,
  onClick,
}: {
  type: ComponentType;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const meta = COMPONENT_TYPE_META[type];
  const Icon = meta.Icon;

  return (
    <button
      type="button"
      className={cn(
        'flex items-center gap-2 rounded-md border px-3 py-2 text-left transition-colors',
        active
          ? 'border-[var(--oak-border)] bg-[var(--oak-mist)] text-slate-950'
          : 'border-[var(--field-border)] bg-[var(--panel-surface)] text-slate-800 hover:bg-[var(--oak-mist)]',
        disabled && 'cursor-not-allowed opacity-60',
      )}
      onClick={onClick}
      disabled={disabled}
    >
      <span className={cn('flex h-8 w-8 items-center justify-center rounded-md border', meta.className)}>
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{meta.label}</span>
        <span className="block truncate text-xs text-slate-600">{meta.description}</span>
      </span>
    </button>
  );
}
