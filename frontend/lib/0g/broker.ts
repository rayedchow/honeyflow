import { ethers } from "ethers";
import { createZGComputeNetworkBroker } from "@0glabs/0g-serving-broker";

const RPC_URL = "https://evmrpc-testnet.0g.ai";
const LEDGER_AMOUNT = 3; // minimum OG to create ledger
const TRANSFER_AMOUNT = "1.0"; // OG per provider

const PREFERRED_MODELS = [
  "llama-3.3-70b-instruct",
  "deepseek-r1-70b",
  "qwen2.5-vl-72b-instruct",
];

export interface BrokerContext {
  broker: Awaited<ReturnType<typeof createZGComputeNetworkBroker>>;
  providerAddress: string;
  endpoint: string;
  model: string;
}

let cached: BrokerContext | null = null;
let initPromise: Promise<BrokerContext> | null = null;

export async function getBrokerContext(): Promise<BrokerContext> {
  if (cached) return cached;
  if (initPromise) return initPromise;

  initPromise = init();
  return initPromise;
}

async function init(): Promise<BrokerContext> {
  const pk = process.env.PRIVATE_KEY;
  if (!pk) throw new Error("PRIVATE_KEY env var not set");

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(pk, provider);
  console.log("[0G] wallet:", wallet.address);

  const broker = await createZGComputeNetworkBroker(wallet);

  // ensure ledger
  try {
    await broker.ledger.getLedger();
    console.log("[0G] ledger exists");
  } catch {
    console.log("[0G] creating ledger...");
    await broker.ledger.addLedger(LEDGER_AMOUNT);
  }

  // pick provider
  const services = await broker.inference.listService();
  if (!services.length) throw new Error("No 0G services available");

  let selected = services[0];
  for (const pref of PREFERRED_MODELS) {
    const match = services.find(
      (s) => s.model?.toLowerCase() === pref.toLowerCase()
    );
    if (match) {
      selected = match;
      break;
    }
  }

  const providerAddress = selected.provider;
  console.log("[0G] selected:", selected.model, "from", providerAddress);

  // acknowledge provider
  try {
    await broker.inference.acknowledgeProviderSigner(providerAddress);
    console.log("[0G] provider acknowledged");
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes("already")) console.warn("[0G] ack warning:", msg);
  }

  // transfer funds
  try {
    await broker.ledger.transferFund(
      providerAddress,
      "inference",
      ethers.parseEther(TRANSFER_AMOUNT)
    );
    console.log("[0G] transferred", TRANSFER_AMOUNT, "OG to provider");
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[0G] transfer note:", msg);
  }

  const { endpoint, model } =
    await broker.inference.getServiceMetadata(providerAddress);

  cached = { broker, providerAddress, endpoint, model };
  return cached;
}

export function resetBroker() {
  cached = null;
  initPromise = null;
}
