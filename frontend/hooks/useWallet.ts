"use client";

import { useCallback, useEffect, useState } from "react";
import { useWalletStore } from "@/lib/wallet-store";

interface WalletState {
  address: string | null;
  chainId: string | null;
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
  const address = useWalletStore((s) => s.address);
  const chainId = useWalletStore((s) => s.chainId);
  const hydrate = useWalletStore((s) => s.hydrate);
  const setWallet = useWalletStore((s) => s.setWallet);
  const clear = useWalletStore((s) => s.clear);

  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Hydrate from localStorage + verify with MetaMask
  useEffect(() => {
    let cancelled = false;

    hydrate();

    const eth = window.ethereum;
    if (!eth) return;

    const stored = useWalletStore.getState().address;
    if (!stored) return;

    eth
      .request({ method: "eth_accounts" })
      .then((accounts) => {
        if (cancelled) return;
        const accs = accounts as string[];
        if (accs.length === 0) {
          clear();
        } else if (accs[0] !== stored) {
          setWallet(accs[0]);
        }
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [hydrate, clear, setWallet]);

  // Listen for account/chain changes
  useEffect(() => {
    const eth = window.ethereum;
    if (!eth) return;

    const handleAccountsChanged = (...args: unknown[]) => {
      const accounts = args[0] as string[];
      if (accounts.length === 0) {
        clear();
      } else {
        setWallet(accounts[0]);
      }
    };

    const handleChainChanged = (...args: unknown[]) => {
      setWallet(useWalletStore.getState().address, args[0] as string);
    };

    eth.on("accountsChanged", handleAccountsChanged);
    eth.on("chainChanged", handleChainChanged);

    return () => {
      eth.removeListener("accountsChanged", handleAccountsChanged);
      eth.removeListener("chainChanged", handleChainChanged);
    };
  }, [clear, setWallet]);

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

      const currentChain = (await window.ethereum.request({
        method: "eth_chainId",
      })) as string;

      setWallet(addr, currentChain);
      return addr;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Connection rejected";
      setError(msg);
      return null;
    } finally {
      setIsConnecting(false);
    }
  }, [setWallet]);

  const disconnect = useCallback(async () => {
    clear();
    setError(null);

    if (window.ethereum) {
      try {
        await window.ethereum.request({
          method: "wallet_revokePermissions",
          params: [{ eth_accounts: {} }],
        });
      } catch {
        // Not supported in all wallets
      }
    }
  }, [clear]);

  return { address, chainId, isConnecting, error, connect, disconnect };
}
