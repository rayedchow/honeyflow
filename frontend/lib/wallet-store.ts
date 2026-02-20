import { create } from "zustand";

const STORAGE_KEY = "honeyflow-wallet";

interface Persisted {
  address: string | null;
  chainId: string | null;
}

function load(): Persisted {
  if (typeof window === "undefined") return { address: null, chainId: null };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Persisted;
  } catch { /* ignore */ }
  return { address: null, chainId: null };
}

function save(data: Persisted) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch { /* ignore */ }
}

interface WalletStore {
  address: string | null;
  chainId: string | null;
  _hasHydrated: boolean;
  hydrate: () => void;
  setWallet: (address: string | null, chainId?: string | null) => void;
  clear: () => void;
}

export const useWalletStore = create<WalletStore>((set, get) => ({
  address: null,
  chainId: null,
  _hasHydrated: false,
  hydrate: () => {
    const stored = load();
    set({ ...stored, _hasHydrated: true });
  },
  setWallet: (address, chainId) => {
    const next = { address, chainId: chainId ?? get().chainId };
    set(next);
    save({ address: next.address, chainId: next.chainId });
  },
  clear: () => {
    set({ address: null, chainId: null });
    localStorage.removeItem(STORAGE_KEY);
  },
}));
