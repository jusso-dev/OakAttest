import sharp from 'sharp';
import type { BoundaryGraph, BoundaryNode } from '@/lib/boundary/schema';

const NODE_STYLES: Record<
  BoundaryNode['data']['componentType'],
  { fill: string; stroke: string; label: string }
> = {
  host: { fill: '#f8fafc', stroke: '#cbd5e1', label: 'Host' },
  service: { fill: '#eff6f1', stroke: '#9fb8aa', label: 'Service' },
  data_store: { fill: '#eff6ff', stroke: '#bfdbfe', label: 'Data store' },
  network: { fill: '#ecfeff', stroke: '#a5f3fc', label: 'Network' },
  integration: { fill: '#fffbeb', stroke: '#fde68a', label: 'Integration' },
  user_group: { fill: '#f5f3ff', stroke: '#ddd6fe', label: 'User group' },
  external: { fill: '#fef2f2', stroke: '#fecaca', label: 'External' },
  boundary_box: { fill: '#f3f7f1', stroke: '#94a3b8', label: 'Boundary' },
};

export async function renderBoundaryPng(graph: BoundaryGraph | null | undefined) {
  const svg = renderBoundarySvg(graph);
  return sharp(Buffer.from(svg)).png().toBuffer();
}

export function renderBoundarySvg(graph: BoundaryGraph | null | undefined) {
  const nodes = graph?.nodes ?? [];
  const edges = graph?.edges ?? [];

  if (nodes.length === 0) {
    return svgDocument(900, 520, '<text x="48" y="72" class="empty">No boundary diagram has been drawn.</text>');
  }

  const bounds = computeBounds(nodes);
  const padding = 64;
  const width = Math.max(900, Math.ceil(bounds.maxX - bounds.minX + padding * 2));
  const height = Math.max(520, Math.ceil(bounds.maxY - bounds.minY + padding * 2));
  const offsetX = padding - bounds.minX;
  const offsetY = padding - bounds.minY;
  const byId = new Map(nodes.map((node) => [node.id, node]));

  const boxes = nodes
    .filter((node) => node.data.componentType === 'boundary_box')
    .map((node) => renderBoundaryBox(node, offsetX, offsetY))
    .join('');

  const edgeMarkup = edges
    .map((edge) => {
      const source = byId.get(edge.source);
      const target = byId.get(edge.target);
      if (!source || !target) return '';
      return renderEdge(source, target, edge.label, offsetX, offsetY);
    })
    .join('');

  const componentMarkup = nodes
    .filter((node) => node.data.componentType !== 'boundary_box')
    .map((node) => renderNode(node, offsetX, offsetY))
    .join('');

  return svgDocument(width, height, `${boxes}${edgeMarkup}${componentMarkup}`);
}

function renderBoundaryBox(node: BoundaryNode, offsetX: number, offsetY: number) {
  const width = node.data.width ?? 420;
  const height = node.data.height ?? 260;
  const x = node.position.x + offsetX;
  const y = node.position.y + offsetY;
  return `
    <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="10" class="boundary-box"/>
    <text x="${x + 16}" y="${y + 26}" class="boundary-title">${escapeXml(node.data.label)}</text>
    <text x="${x + 16}" y="${y + 46}" class="boundary-subtitle">${escapeXml(node.data.environment ?? 'Environment boundary')}</text>
  `;
}

function renderNode(node: BoundaryNode, offsetX: number, offsetY: number) {
  const meta = NODE_STYLES[node.data.componentType] ?? NODE_STYLES.service;
  const width = 190;
  const height = 78;
  const x = node.position.x + offsetX;
  const y = node.position.y + offsetY;
  return `
    <g>
      <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="8" fill="${meta.fill}" stroke="${meta.stroke}" stroke-width="1.5"/>
      <rect x="${x + 12}" y="${y + 14}" width="34" height="34" rx="7" fill="#fffefa" stroke="${meta.stroke}" stroke-width="1"/>
      ${renderIcon(node.data.componentType, x + 17, y + 19)}
      <text x="${x + 56}" y="${y + 30}" class="node-title">${escapeXml(truncate(node.data.label, 28))}</text>
      <text x="${x + 56}" y="${y + 49}" class="node-kind">${escapeXml(meta.label)}</text>
      ${node.data.environment ? `<text x="${x + 56}" y="${y + 66}" class="node-kind">${escapeXml(truncate(node.data.environment, 26))}</text>` : ''}
    </g>
  `;
}

function renderIcon(type: BoundaryNode['data']['componentType'], x: number, y: number) {
  const p = (path: string) => `<g transform="translate(${x} ${y})">${path}</g>`;
  switch (type) {
    case 'host':
      return p(`
        <rect x="4" y="3" width="16" height="12" rx="2" class="icon-line"/>
        <path d="M8 21h8M12 15v6" class="icon-line"/>
      `);
    case 'data_store':
      return p(`
        <ellipse cx="12" cy="5" rx="8" ry="3.5" class="icon-line"/>
        <path d="M4 5v12c0 2 3.6 3.5 8 3.5s8-1.5 8-3.5V5" class="icon-line"/>
        <path d="M4 11c0 2 3.6 3.5 8 3.5s8-1.5 8-3.5" class="icon-line"/>
      `);
    case 'network':
      return p(`
        <circle cx="6" cy="7" r="3" class="icon-line"/>
        <circle cx="18" cy="7" r="3" class="icon-line"/>
        <circle cx="12" cy="18" r="3" class="icon-line"/>
        <path d="M8.5 9.5l2.1 5M15.5 9.5l-2.1 5M9 7h6" class="icon-line"/>
      `);
    case 'integration':
      return p(`
        <path d="M5 8h8M11 5l4 3-4 3M19 16h-8M13 13l-4 3 4 3" class="icon-line"/>
        <rect x="3" y="4" width="4" height="8" rx="2" class="icon-line"/>
        <rect x="17" y="12" width="4" height="8" rx="2" class="icon-line"/>
      `);
    case 'user_group':
      return p(`
        <circle cx="9" cy="8" r="3.5" class="icon-line"/>
        <circle cx="17" cy="9" r="3" class="icon-line"/>
        <path d="M3.5 20c.9-4 3.2-6 6.8-6 3 0 5 1.4 6 4" class="icon-line"/>
        <path d="M14.5 15c2.8.2 4.8 1.8 6 4.5" class="icon-line"/>
      `);
    case 'external':
      return p(`
        <circle cx="12" cy="12" r="8.5" class="icon-line"/>
        <path d="M12 3.5c2.4 2.6 3.6 5.4 3.6 8.5S14.4 17.9 12 20.5M12 3.5C9.6 6.1 8.4 8.9 8.4 12s1.2 5.9 3.6 8.5M4 12h16" class="icon-line"/>
      `);
    case 'service':
    default:
      return p(`
        <rect x="4" y="5" width="16" height="14" rx="3" class="icon-line"/>
        <path d="M8 9h8M8 13h5M8 17h2" class="icon-line"/>
        <circle cx="17" cy="17" r="1.2" class="icon-fill"/>
      `);
  }
}

function renderEdge(
  source: BoundaryNode,
  target: BoundaryNode,
  label: string | undefined,
  offsetX: number,
  offsetY: number,
) {
  const a = center(source, offsetX, offsetY);
  const b = center(target, offsetX, offsetY);
  const midX = (a.x + b.x) / 2;
  const d = `M ${a.x} ${a.y} C ${midX} ${a.y}, ${midX} ${b.y}, ${b.x} ${b.y}`;
  const labelMarkup = label
    ? `<text x="${midX}" y="${(a.y + b.y) / 2 - 8}" text-anchor="middle" class="edge-label">${escapeXml(truncate(label, 24))}</text>`
    : '';
  return `
    <path d="${d}" class="edge"/>
    ${labelMarkup}
  `;
}

function center(node: BoundaryNode, offsetX: number, offsetY: number) {
  const width = node.data.componentType === 'boundary_box' ? (node.data.width ?? 420) : 190;
  const height = node.data.componentType === 'boundary_box' ? (node.data.height ?? 260) : 78;
  return {
    x: node.position.x + offsetX + width / 2,
    y: node.position.y + offsetY + height / 2,
  };
}

function computeBounds(nodes: BoundaryNode[]) {
  return nodes.reduce(
    (bounds, node) => {
      const width = node.data.componentType === 'boundary_box' ? (node.data.width ?? 420) : 190;
      const height = node.data.componentType === 'boundary_box' ? (node.data.height ?? 260) : 78;
      return {
        minX: Math.min(bounds.minX, node.position.x),
        minY: Math.min(bounds.minY, node.position.y),
        maxX: Math.max(bounds.maxX, node.position.x + width),
        maxY: Math.max(bounds.maxY, node.position.y + height),
      };
    },
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
}

function svgDocument(width: number, height: number, body: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#475569"/>
    </marker>
  </defs>
  <style>
    .canvas { fill: #f6f8f4; }
    .boundary-box { fill: #eff6f1; stroke: #94a3b8; stroke-width: 2; stroke-dasharray: 8 7; }
    .boundary-title { fill: #0f172a; font: 700 15px Arial, sans-serif; }
    .boundary-subtitle { fill: #475569; font: 12px Arial, sans-serif; }
    .edge { fill: none; stroke: #475569; stroke-width: 2.2; marker-end: url(#arrow); }
    .edge-label { fill: #334155; font: 12px Arial, sans-serif; paint-order: stroke; stroke: #fffefa; stroke-width: 4px; stroke-linejoin: round; }
    .icon-line { fill: none; stroke: #0f3f2c; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
    .icon-fill { fill: #0f3f2c; }
    .node-title { fill: #0f172a; font: 700 14px Arial, sans-serif; }
    .node-kind { fill: #475569; font: 12px Arial, sans-serif; }
    .empty { fill: #475569; font: 16px Arial, sans-serif; }
  </style>
  <rect class="canvas" width="100%" height="100%"/>
  ${body}
</svg>`;
}

function truncate(value: string, length: number) {
  return value.length > length ? `${value.slice(0, length - 1)}…` : value;
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
