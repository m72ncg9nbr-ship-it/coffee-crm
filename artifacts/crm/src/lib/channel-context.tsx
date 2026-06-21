import { createContext, useContext, useState, type ReactNode } from "react";

export type ChannelFilter = "all" | "coffee" | "cosmetics";

interface ChannelContextValue {
  channel: ChannelFilter;
  setChannel: (c: ChannelFilter) => void;
}

const ChannelContext = createContext<ChannelContextValue>({ channel: "all", setChannel: () => {} });

const STORAGE_KEY = "ns-channel";

export function ChannelProvider({ children }: { children: ReactNode }) {
  const [channel, setChannelState] = useState<ChannelFilter>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "all" || stored === "coffee" || stored === "cosmetics") return stored;
    } catch {}
    return "all";
  });

  const setChannel = (c: ChannelFilter) => {
    setChannelState(c);
    try { localStorage.setItem(STORAGE_KEY, c); } catch {}
  };

  return <ChannelContext.Provider value={{ channel, setChannel }}>{children}</ChannelContext.Provider>;
}

export function useChannel() {
  return useContext(ChannelContext);
}
