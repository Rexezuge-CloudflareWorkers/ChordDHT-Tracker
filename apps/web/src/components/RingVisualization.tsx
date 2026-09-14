import { useState } from 'react';
import type { TrackerNodeRecord } from '../types';
import { RingCanvas } from './ring/RingCanvas';
import { RingNodeTooltip, RingVNodeTooltip } from './ring/RingTooltip';
import type { VNodeTooltipState } from './ring/RingTooltip';
import { useRingData, useRingLayers, useRingViewport } from './ring/useRingData';

export interface Props {
  nodes: TrackerNodeRecord[];
  selectedNodeId: string | null;
  onNodeSelect: (nodeId: string) => void;
  isAdmin: boolean;
  staleCutoff?: Date | null;
}

export type RingVisualizationProps = Props;

export function RingVisualization({ nodes, selectedNodeId, onNodeSelect, isAdmin, staleCutoff }: Props) {
  const [tooltip, setTooltip] = useState<{ node: TrackerNodeRecord } | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [vnodeTooltip, setVnodeTooltip] = useState<VNodeTooltipState | null>(null);
  const [hoveredVnodeId, setHoveredVnodeId] = useState<string | null>(null);
  const { visibleLayers, toggleLayer } = useRingLayers();
  const vp = useRingViewport();
  const data = useRingData(nodes, isAdmin, hoveredNodeId);

  function handleNodeEnter(node: TrackerNodeRecord) {
    setTooltip({ node });
    setHoveredNodeId(node.node_id);
  }
  function handleNodeLeave() {
    setHoveredNodeId(null);
  }
  function handleVnodeChange(state: VNodeTooltipState | null) {
    setVnodeTooltip(state);
    setHoveredVnodeId(state ? state.vnodeId : null);
  }
  function handleMouseLeave() {
    setTooltip(null);
    setHoveredNodeId(null);
    setVnodeTooltip(null);
    setHoveredVnodeId(null);
    vp.cancelDrag();
  }

  if (nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500 text-sm">
        No nodes registered
      </div>
    );
  }

  return (
    <div className="relative select-none">
      <RingCanvas
        nodes={nodes} selectedNodeId={selectedNodeId} onNodeSelect={onNodeSelect}
        isAdmin={isAdmin} staleCutoff={staleCutoff} data={data}
        viewport={vp.viewport} svgRef={vp.svgRef} isDragging={vp.isDragging} draggedRef={vp.draggedRef}
        onMouseDown={vp.handleMouseDown} onMouseMove={vp.handleMouseMove}
        onMouseUp={vp.handleMouseUp} onMouseLeave={handleMouseLeave}
        hoveredNodeId={hoveredNodeId} hoveredVnodeId={hoveredVnodeId}
        onNodeEnter={handleNodeEnter} onNodeLeave={handleNodeLeave} onVnodeChange={handleVnodeChange}
        visibleLayers={visibleLayers} onToggleLayer={toggleLayer}
        onZoomBy={vp.zoomBy} onResetViewport={vp.resetViewport}
      />
      <RingNodeTooltip node={tooltip ? tooltip.node : null} isAdmin={isAdmin} staleCutoff={staleCutoff} />
      <RingVNodeTooltip state={vnodeTooltip} />
    </div>
  );
}

export default RingVisualization;
