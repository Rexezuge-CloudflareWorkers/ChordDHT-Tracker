import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { TrackerNodeRecord } from '../../types';
import { nodeIdToAngle } from '../../utils';
import { DEFAULT_LAYERS, VIEWBOX_SIZE, zoomAtPoint, zoomCentered } from './RingTopology';
import type { LayerKey, Viewport } from './RingTopology';

export interface VNodeEntry {
  vnodeId: string;
  index: number;
  anchor: TrackerNodeRecord;
}

export interface RingData {
  nodeIdSet: Set<string>;
  angleMap: Map<string, number>;
  nodeMap: Map<string, TrackerNodeRecord>;
  anchorNodes: TrackerNodeRecord[];
  logicalVNodeIdSet: Set<string>;
  vnodeEntries: VNodeEntry[];
  hoveredNode: TrackerNodeRecord | undefined;
}

export function useRingData(
  nodes: TrackerNodeRecord[],
  isAdmin: boolean,
  hoveredNodeId: string | null,
): RingData {
  return useMemo(() => {
    const nodeIdSet = new Set(nodes.map((n) => n.node_id));
    const angleMap = new Map<string, number>(nodes.map((n) => [n.node_id, nodeIdToAngle(n.node_id)]));
    const nodeMap = new Map<string, TrackerNodeRecord>(nodes.map((n) => [n.node_id, n]));
    const anchorNodes = nodes.filter((n) => !n.is_vnode);
    const logicalVNodeIdSet = new Set(nodes.filter((n) => n.is_vnode).map((n) => n.node_id));
    const vnodeEntries: VNodeEntry[] = [];
    if (isAdmin) {
      for (const node of anchorNodes) {
        const inlineVNodes = node.vnodes ?? [];
        for (const v of inlineVNodes) {
          vnodeEntries.push({ vnodeId: v.vnode_id, index: v.index, anchor: node });
        }
      }
    }
    return {
      nodeIdSet,
      angleMap,
      nodeMap,
      anchorNodes,
      logicalVNodeIdSet,
      vnodeEntries,
      hoveredNode: hoveredNodeId ? nodeMap.get(hoveredNodeId) : undefined,
    };
  }, [nodes, isAdmin, hoveredNodeId]);
}

export function useRingLayers() {
  const [visibleLayers, setVisibleLayers] = useState<Record<LayerKey, boolean>>(() => ({ ...DEFAULT_LAYERS }));

  function toggleLayer(key: LayerKey) {
    setVisibleLayers((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return { visibleLayers, toggleLayer };
}

export function useRingViewport() {
  const [viewport, setViewport] = useState<Viewport>({ zoom: 1, panX: 0, panY: 0 });
  const [isDragging, setIsDragging] = useState(false);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; startPanX: number; startPanY: number } | null>(null);
  const draggedRef = useRef(false);

  // Non-passive wheel listener so we can preventDefault and block page scroll.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      const svgX = ((e.clientX - rect.left) / rect.width) * VIEWBOX_SIZE;
      const svgY = ((e.clientY - rect.top) / rect.height) * VIEWBOX_SIZE;
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      setViewport((prev) => zoomAtPoint(prev, svgX, svgY, factor));
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, []);

  function resetViewport() {
    setViewport({ zoom: 1, panX: 0, panY: 0 });
  }

  function zoomBy(factor: number) {
    setViewport((prev) => zoomCentered(prev, factor));
  }

  function handleMouseDown(e: React.MouseEvent<SVGSVGElement>) {
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startPanX: viewport.panX,
      startPanY: viewport.panY,
    };
    draggedRef.current = false;
    setIsDragging(true);
  }

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!dragRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const scale = VIEWBOX_SIZE / rect.width;
    const dx = (e.clientX - dragRef.current.startX) * scale;
    const dy = (e.clientY - dragRef.current.startY) * scale;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) draggedRef.current = true;
    const { startPanX, startPanY } = dragRef.current;
    setViewport((prev) => ({ ...prev, panX: startPanX + dx, panY: startPanY + dy }));
  }

  function handleMouseUp() {
    dragRef.current = null;
    draggedRef.current = false;
    setIsDragging(false);
  }

  const cancelDrag = handleMouseUp;

  return {
    viewport,
    svgRef,
    draggedRef,
    isDragging,
    zoomBy,
    resetViewport,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    cancelDrag,
  };
}
