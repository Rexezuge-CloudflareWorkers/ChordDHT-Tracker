import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useTrackerData } from './hooks/useTrackerData';
import { TrackerContext } from './contexts/TrackerContext';
import { computeStaleCutoff, toAdminVisibleNodes, toGuestVisibleNodes, type NodeTypeFilter } from './adapters/nodeAdapter';
import { StatsPanel } from './components/StatsPanel';
import { RingVisualization } from './components/RingVisualization';
import { NodeTable } from './components/NodeTable';
import { NodeDetailPanel } from './components/NodeDetailPanel';
import { LoginModal } from './components/LoginModal';
import { LanguageSelector } from './components/shared/LanguageSelector';
import { REFRESH_INTERVAL_MS } from './constants';

export default function SpaApp() {
  const { t } = useTranslation();
  const data = useTrackerData();
  const { nodes, stats, availableRegions, lastRefresh, error, paused, isAdmin } = data;
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [nodeTypeFilter, setNodeTypeFilter] = useState<NodeTypeFilter>('all');
  const [ringCardHeight, setRingCardHeight] = useState<number | null>(null);
  const ringCardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const ringCard = ringCardRef.current;
    if (!ringCard) return;

    const updateRingCardHeight = () => {
      const nextHeight = Math.ceil(ringCard.getBoundingClientRect().height);
      setRingCardHeight((currentHeight) => (currentHeight === nextHeight ? currentHeight : nextHeight));
    };

    updateRingCardHeight();
    const observer = new ResizeObserver(updateRingCardHeight);
    observer.observe(ringCard);

    return () => observer.disconnect();
  }, []);

  const visibleNodes = useMemo(
    () => (isAdmin ? toAdminVisibleNodes(nodes, nodeTypeFilter) : toGuestVisibleNodes(nodes)),
    [nodes, nodeTypeFilter, isAdmin],
  );
  const accessibleNodes = useMemo(
    () => (isAdmin ? nodes : toGuestVisibleNodes(nodes)),
    [nodes, isAdmin],
  );
  const selectedNode = accessibleNodes.find((n) => n.node_id === selectedNodeId) ?? null;
  const knownNodeIds = useMemo(() => new Set(accessibleNodes.map((n) => n.node_id)), [accessibleNodes]);
  const staleCutoff = useMemo(() => computeStaleCutoff(stats), [stats]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedNodeId(null);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const handleLogout = () => {
    data.logout();
    setNodeTypeFilter('all');
    setSelectedNodeId(null);
  };

  const nodePanelStyle =
    ringCardHeight === null ? undefined : ({ '--ring-card-height': `${ringCardHeight}px` } as React.CSSProperties);

  return (
    <TrackerContext.Provider value={{ isAdmin, login: data.login, logout: handleLogout }}>
      <div className="min-h-screen" style={{ background: '#101319' }}>
        <header className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-white">{t('app.title')}</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              {lastRefresh ? (
                <>
                  {t('app.lastUpdated', { time: lastRefresh.toLocaleTimeString() })} ·{' '}
                  {paused ? (
                    <span className="text-amber-400">{t('app.paused')}</span>
                  ) : (
                    t('app.autoRefresh', { seconds: REFRESH_INTERVAL_MS / 1000 })
                  )}
                </>
              ) : (
                t('app.loading')
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSelector />
            {isAdmin ? (
              <button
                onClick={handleLogout}
                className="px-3 py-1.5 text-sm bg-gray-800 hover:bg-gray-700 text-indigo-400 rounded-md border border-gray-700 transition-colors cursor-pointer"
              >
                {t('app.adminLogout')}
              </button>
            ) : (
              <button
                onClick={() => setLoginModalOpen(true)}
                className="px-3 py-1.5 text-sm bg-gray-800 hover:bg-gray-700 text-gray-400 rounded-md border border-gray-700 transition-colors cursor-pointer"
              >
                {t('app.login')}
              </button>
            )}
            <button
              onClick={() => data.setPaused(!paused)}
              className={
                paused
                  ? 'px-3 py-1.5 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded-md border border-indigo-500 transition-colors cursor-pointer'
                  : 'px-3 py-1.5 text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-md border border-gray-700 transition-colors cursor-pointer'
              }
            >
              {t(paused ? 'app.resume' : 'app.pause')}
            </button>
          </div>
        </header>

        <main className="px-6 py-6 space-y-6">
          {error && (
            <div className="bg-red-900/30 border border-red-700 text-red-300 px-4 py-3 rounded-md text-sm">{error}</div>
          )}

          <StatsPanel stats={stats} />

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-stretch">
            <div ref={ringCardRef} className="bg-gray-900 border border-gray-800 rounded-lg p-4 self-start w-full">
              <h2 className="text-sm font-medium text-gray-400 mb-4">{t('sections.ringTopology')}</h2>
              <RingVisualization
                nodes={accessibleNodes}
                selectedNodeId={selectedNodeId}
                onNodeSelect={setSelectedNodeId}
                isAdmin={isAdmin}
                staleCutoff={staleCutoff}
              />
            </div>
            <div
              className="node-list-panel bg-gray-900 border border-gray-800 rounded-lg p-4 flex flex-col overflow-hidden min-h-0"
              style={nodePanelStyle}
            >
              <div className="flex flex-wrap items-center justify-between mb-2 shrink-0 gap-2">
                <h2 className="text-sm font-medium text-gray-400">
                  {t('sections.nodes')}{' '}
                  <span className="text-gray-600">
                    ({visibleNodes.length}
                    {isAdmin && visibleNodes.length !== nodes.length && ` / ${nodes.length}`})
                  </span>
                </h2>
                {isAdmin && (
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      aria-label={t('filters.filterByType')}
                      value={nodeTypeFilter}
                      onChange={(e) => setNodeTypeFilter(e.target.value as NodeTypeFilter)}
                      className="text-xs bg-gray-800 border border-gray-700 text-gray-300 rounded px-2 py-1 cursor-pointer"
                    >
                      <option value="all">{t('filters.allNodes')}</option>
                      <option value="anchors">{t('filters.anchors')}</option>
                      <option value="vnodes">{t('filters.vnodes')}</option>
                    </select>
                    {Object.keys(availableRegions).length > 0 && (
                      <select
                        aria-label={t('filters.filterByRegion')}
                        value={data.regionFilter}
                        onChange={(e) => data.setRegionFilter(e.target.value)}
                        className="text-xs bg-gray-800 border border-gray-700 text-gray-300 rounded px-2 py-1 cursor-pointer"
                      >
                        <option value="">{t('filters.allRegions')}</option>
                        {Object.entries(availableRegions).map(([r, count]) => (
                          <option key={r} value={r}>
                            {r} ({count})
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
              </div>
              <NodeTable
                nodes={visibleNodes}
                selectedNodeId={selectedNodeId}
                onNodeSelect={setSelectedNodeId}
                isAdmin={isAdmin}
                staleCutoff={staleCutoff}
                emptyMessage={t(nodes.length === 0 ? 'empty.noNodesRegistered' : 'empty.noNodesMatchFilter')}
              />
            </div>
          </div>
        </main>

      {selectedNode && (
        <NodeDetailPanel
          key={selectedNode.node_id}
          node={selectedNode}
          knownNodeIds={knownNodeIds}
          onClose={() => setSelectedNodeId(null)}
          onNavigate={setSelectedNodeId}
          isAdmin={isAdmin}
        />
      )}

        {loginModalOpen && <LoginModal onClose={() => setLoginModalOpen(false)} />}
      </div>
    </TrackerContext.Provider>
  );
}
