/**
 * Pure layout math for the Chord ring visualization (no React).
 *
 * Maps SHA-1 node IDs to angles/positions on the SVG ring and provides the
 * viewport, color, and geometry helpers shared by the ring components.
 */
import { nodeIdToAngle } from '../../utils';

export const CX = 300;
export const CY = 300;
export const RING_R = 220;
export const DOT_R = 8;
export const VNODE_DOT_R = 5;
export const ZOOM_MIN = 0.4;
export const ZOOM_MAX = 12;
export const VIEWBOX_SIZE = 600;

export type LayerKey = 'primarySuccessor' | 'backupSuccessors' | 'predecessors' | 'fingerTable' | 'vnodes';

export interface Viewport {
  zoom: number;
  panX: number;
  panY: number;
}

export interface Point {
  x: number;
  y: number;
}

export const DEFAULT_LAYERS: Record<LayerKey, boolean> = {
  primarySuccessor: true,
  backupSuccessors: true,
  predecessors: true,
  fingerTable: true,
  vnodes: true,
};

export function rttColor(ms: number | undefined | null, alpha = 1): string {
  if (ms == null) return `rgba(99,102,241,${alpha})`;
  if (ms < 20) return `rgba(34,197,94,${alpha})`;
  if (ms < 100) return `rgba(234,179,8,${alpha})`;
  if (ms < 300) return `rgba(249,115,22,${alpha})`;
  return `rgba(239,68,68,${alpha})`;
}

export function avgRTT(samples: Record<string, number> | null | undefined): number | null {
  if (!samples) return null;
  const vals = Object.values(samples);
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

export function shrinkToward(
  x1: number, y1: number,
  x2: number, y2: number,
  shrinkPx: number,
): Point {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.hypot(dx, dy);
  if (dist < 1) return { x: x2, y: y2 };
  return { x: x2 - (dx / dist) * shrinkPx, y: y2 - (dy / dist) * shrinkPx };
}

export function lineVis(hoveredId: string | null, sourceId: string, targetId: string, base: number, dim: number): number {
  if (!hoveredId) return base;
  return hoveredId === sourceId || hoveredId === targetId ? base : dim;
}

export function positionForAngle(angle: number): Point {
  return { x: CX + RING_R * Math.cos(angle), y: CY + RING_R * Math.sin(angle) };
}

export function nodePosition(angleMap: Map<string, number>, id: string): Point | null {
  const a = angleMap.get(id);
  if (a === undefined) return null;
  return positionForAngle(a);
}

export function vnodePosition(vnodeId: string): Point {
  return positionForAngle(nodeIdToAngle(vnodeId));
}

export function nodeDotRadius(isVnode?: boolean): number {
  return isVnode ? VNODE_DOT_R : DOT_R;
}

/**
Corner opposite the hovered node's ring quadrant (tooltip placement).
*/
export function tooltipPositionClass(x: number, y: number): string {
  if (y > CY) return x > CX ? 'top-2 left-2' : 'top-2 right-2';
  return x > CX ? 'bottom-8 left-2' : 'bottom-8 right-2';
}

export function clampZoom(zoom: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
}

/**
Zoom keeping the given SVG point stationary.
*/
export function zoomAtPoint(prev: Viewport, svgX: number, svgY: number, factor: number): Viewport {
  const newZoom = clampZoom(prev.zoom * factor);
  return {
    zoom: newZoom,
    panX: svgX - (svgX - prev.panX) * (newZoom / prev.zoom),
    panY: svgY - (svgY - prev.panY) * (newZoom / prev.zoom),
  };
}

/**
Zoom centred on the ring centre.
*/
export function zoomCentered(prev: Viewport, factor: number): Viewport {
  const newZoom = clampZoom(prev.zoom * factor);
  const svgCX = prev.panX + CX * prev.zoom;
  const svgCY = prev.panY + CY * prev.zoom;
  return { zoom: newZoom, panX: svgCX - CX * newZoom, panY: svgCY - CY * newZoom };
}
