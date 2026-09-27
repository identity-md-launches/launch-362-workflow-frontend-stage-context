import {
  createPublicClient,
  defineChain,
  fallback,
  http,
  keccak256,
  toHex,
  type Abi,
  type Address,
} from "viem";

export interface Deployment {
  version: number;
  launchId: string;
  chainId: number;
  sourceCommit: string;
  attestationHash: string;
  contracts: {
    name: string;
    address: Address;
    abiHash: string;
    abiPath: string;
  }[];
  assets: { path: string; sha256: string }[];
  network: {
    chainId: number;
    name: string;
    testnet: boolean;
    rpcUrls: string[];
    explorer: string;
    nativeCurrency: { name: string; symbol: string; decimals: number };
    faucets: string[];
    uniswapV4: Record<
      | "poolManager"
      | "universalRouter"
      | "quoter"
      | "stateView"
      | "positionManager"
      | "permit2",
      Address
    >;
  };
  walletAddChain: {
    chainId: string;
    chainName: string;
    rpcUrls: string[];
    nativeCurrency: Deployment["network"]["nativeCurrency"];
    blockExplorerUrls: string[];
  };
  pool: { pairedCurrency: Address; fee: number; tickSpacing: number };
}
export function canonical(value: unknown): string {
  const sort = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(sort)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .map((k) => [k, sort((v as Record<string, unknown>)[k])]),
          )
        : v;
  return JSON.stringify(sort(value));
}
async function json(path: string) {
  if (
    !/^[\w./-]+$/.test(path) ||
    path.startsWith("/") ||
    path.split("/").includes("..")
  )
    throw Error("Unsafe deployment asset path");
  const response = await fetch(
    new URL(path, new URL(".", window.location.href)),
    { cache: "no-cache" },
  );
  if (!response.ok)
    throw Error(`Could not load ${path}. Reload the page to retry.`);
  return response.json();
}
export async function loadRuntime() {
  const manifest: Deployment = await json("imd-deployment.json");
  if (
    manifest.version !== 1 ||
    manifest.chainId !== manifest.network.chainId ||
    Number(manifest.walletAddChain.chainId) !== manifest.chainId
  )
    throw Error(
      "Deployment network configuration does not match. Transactions are disabled.",
    );
  const contracts = await Promise.all(
    manifest.contracts.map(async (contract) => {
      const abi: Abi = await json(contract.abiPath);
      if (
        !Array.isArray(abi) ||
        keccak256(toHex(canonical(abi))).slice(2) !== contract.abiHash
      )
        throw Error(
          `${contract.name} ABI verification failed. Transactions are disabled.`,
        );
      return { ...contract, abi };
    }),
  );
  const token = contracts.find((c) => c.name === "LaunchToken");
  const badges = contracts.find((c) => c.name === "SoulboundBadges");
  if (!token || !badges)
    throw Error("Required deployment contracts are missing.");
  const n = manifest.network;
  const chain = defineChain({
    id: manifest.chainId,
    name: n.name,
    nativeCurrency: n.nativeCurrency,
    rpcUrls: { default: { http: n.rpcUrls } },
    blockExplorers: { default: { name: n.name, url: n.explorer } },
    testnet: n.testnet,
  });
  const client = createPublicClient({
    chain,
    batch: { multicall: false },
    transport: fallback(
      n.rpcUrls.map((url) => http(url, { timeout: 8000, retryCount: 0 })),
      { retryCount: 0 },
    ),
  });
  return { manifest, token, badges, client, chain };
}
export type Runtime = Awaited<ReturnType<typeof loadRuntime>>;
