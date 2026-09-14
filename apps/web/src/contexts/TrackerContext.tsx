import { createContext, useContext } from 'react';

interface TrackerAuth {
  isAdmin: boolean;
  login: (token: string) => void;
  logout: () => void;
}

const TrackerContext = createContext<TrackerAuth | null>(null);

function useTrackerAuth(): TrackerAuth {
  const ctx = useContext(TrackerContext);
  if (!ctx) throw new Error('useTrackerAuth must be used within TrackerContext.Provider');
  return ctx;
}

export { TrackerContext, useTrackerAuth };
export type { TrackerAuth };
