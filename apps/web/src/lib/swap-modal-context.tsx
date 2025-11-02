"use client";

import { createContext, useCallback, useContext, useMemo, useState, PropsWithChildren } from "react";

type SwapModalContextValue = {
  isOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
};

const SwapModalContext = createContext<SwapModalContextValue | undefined>(undefined);

export function SwapModalProvider({ children }: PropsWithChildren) {
  const [isOpen, setIsOpen] = useState(false);

  const openModal = useCallback(() => setIsOpen(true), []);
  const closeModal = useCallback(() => setIsOpen(false), []);

  const value = useMemo(() => ({ isOpen, openModal, closeModal }), [isOpen, openModal, closeModal]);

  return <SwapModalContext.Provider value={value}>{children}</SwapModalContext.Provider>;
}

export function useSwapModal() {
  const context = useContext(SwapModalContext);
  if (!context) {
    throw new Error("useSwapModal must be used within SwapModalProvider");
  }
  return context;
}

