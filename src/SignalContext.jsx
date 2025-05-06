// src/contexts/SignalContext.jsx
import React, { createContext, useContext } from "react";
import { signalStore } from "./lib/localDb";

const SignalContext = createContext();

export const useSignal = () => useContext(SignalContext);

export const SignalProvider = ({ children }) => {
  const value = { signalStore };

  return (
    <SignalContext.Provider value={value}>{children}</SignalContext.Provider>
  );
};
