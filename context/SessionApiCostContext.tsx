import React, { createContext, useContext } from 'react';

export type SessionApiCostContextValue = {
  totalJpy: number;
  add: (jpy: number) => void;
  reset: () => void;
};

const SessionApiCostContext = createContext<SessionApiCostContextValue | null>(null);

export const SessionApiCostProvider: React.FC<{
  value: SessionApiCostContextValue;
  children: React.ReactNode;
}> = ({ value, children }) => (
  <SessionApiCostContext.Provider value={value}>{children}</SessionApiCostContext.Provider>
);

export const useSessionApiCost = (): SessionApiCostContextValue => {
  const ctx = useContext(SessionApiCostContext);
  if (!ctx) {
    return {
      totalJpy: 0,
      add: () => {},
      reset: () => {}
    };
  }
  return ctx;
};
