"use client";

import { useCallback, useEffect, useState } from "react";
import { useWalletStore } from "@/lib/wallet-store";

const SEPOLIA_CHAIN_ID = "0xaa36a7"; // 11155111

interface WalletState {
  address: string | null;
  chainId: string | null;
  isConnecting: boolean;
  error: string | null;
  connect: () => Promise<string | null>;
  disconnect: () => void;
  ensureSepolia: () => Promise<boolean>;
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

  const ensureSepolia = useCallback(async (): Promise<boolean> => {
    const eth = window.ethereum;
    if (!eth) {
      setError("MetaMask not installed");
      return false;
    }

    try {
      const current = ((await eth.request({ method: "eth_chainId" })) as string).toLowerCase();
      if (current === SEPOLIA_CHAIN_ID) return true;

      try {
        await eth.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: SEPOLIA_CHAIN_ID }],
        });
        setWallet(useWalletStore.getState().address, SEPOLIA_CHAIN_ID);
        return true;
      } catch (switchErr: unknown) {
        if ((switchErr as { code?: number }).code === 4902) {
          await eth.request({
            method: "wallet_addEthereumChain",
            params: [{
              chainId: SEPOLIA_CHAIN_ID,
              chainName: "Sepolia Testnet",
              nativeCurrency: { name: "Sepolia ETH", symbol: "ETH", decimals: 18 },
              rpcUrls: ["https://rpc.sepolia.org"],
              blockExplorerUrls: ["https://sepolia.etherscan.io"],
            }],
          });
          setWallet(useWalletStore.getState().address, SEPOLIA_CHAIN_ID);
          return true;
        }
        setError("Please switch to Sepolia network");
        return false;
      }
    } catch {
      setError("Failed to check network");
      return false;
    }
  }, [setWallet]);

  return { address, chainId, isConnecting, error, connect, disconnect, ensureSepolia };
}
