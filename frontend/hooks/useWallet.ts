"use client";

import { useCallback, useEffect, useState } from "react";

interface WalletState {
  address: string | null;
  isConnecting: boolean;
  error: string | null;
  connect: () => Promise<string | null>;
  disconnect: () => void;
}

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on: (event: string, handler: (...args: unknown[]) => void) => void;
      removeListener: (event: string, handler: (...args: unknown[]) => void) => void;
      isMetaMask?: boolean;
    };
  }
}

export function useWallet(): WalletState {
  const [address, setAddress] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const eth = window.ethereum;
    if (!eth) return;

    eth
      .request({ method: "eth_accounts" })
      .then((accounts) => {
        const accs = accounts as string[];
        if (accs.length > 0) setAddress(accs[0]);
      })
      .catch(() => {});

    const handleAccountsChanged = (...args: unknown[]) => {
      const accounts = args[0] as string[];
      setAddress(accounts.length > 0 ? accounts[0] : null);
    };

    eth.on("accountsChanged", handleAccountsChanged);
    return () => {
      eth.removeListener("accountsChanged", handleAccountsChanged);
    };
  }, []);

  const connect = useCallback(async (): Promise<string | null> => {
    setError(null);
    if (!window.ethereum) {
      setError("MetaMask not installed");
      return null;
    }

    setIsConnecting(true);
    try {
      const accounts = (await window.ethereum.request({
        method: "eth_requestAccounts",
      })) as string[];
      const addr = accounts[0] || null;
      setAddress(addr);
      return addr;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Connection rejected";
      setError(msg);
      return null;
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null);
    setError(null);
  }, []);

  return { address, isConnecting, error, connect, disconnect };
}
