import type { Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import {
  decodeFunctionData,
  encodeFunctionResult,
  stringToHex,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import { permitAbi, quoterAbi, routerAbi } from "../src/chain";
export const manifest = JSON.parse(
  readFileSync(
    new URL("../../dist/imd-deployment.json", import.meta.url),
    "utf8",
  ),
);
export const token = manifest.contracts.find(
  (c: { name: string }) => c.name === "LaunchToken",
);
export const badges = manifest.contracts.find(
  (c: { name: string }) => c.name === "SoulboundBadges",
);
export const tokenAbi = JSON.parse(
  readFileSync(new URL(`../../dist/${token.abiPath}`, import.meta.url), "utf8"),
) as Abi;
export const badgeAbi = JSON.parse(
  readFileSync(
    new URL(`../../dist/${badges.abiPath}`, import.meta.url),
    "utf8",
  ),
) as Abi;
export const owner: Address = "0x1111111111111111111111111111111111111111";
export const other: Address = "0x2222222222222222222222222222222222222222";
const lower = (v: string) => v.toLowerCase();
export type MockState = {
  approval: bigint;
  permitToken: bigint;
  permitAmount: bigint;
  permitExpiry: number;
  balance: bigint;
  count: bigint;
  issuer: Address;
  owned: bigint[];
  name: string;
  calls: { to: string; fn: string; args: readonly unknown[]; value?: string }[];
  simulations: string[];
  rpcFailure: boolean;
  revert: boolean;
  noCode: boolean;
  receiptRevert: boolean;
};
export async function setup(
  page: Page,
  options: {
    wallet?: boolean;
    wrongChain?: boolean;
    reject?: boolean;
    connected?: boolean;
    badges?: number;
  } = {},
) {
  const state: MockState = {
    approval: 0n,
    permitToken: 0n,
    permitAmount: 0n,
    permitExpiry: 0,
    balance: 1000n * 10n ** 18n,
    count: 1n,
    issuer: owner,
    owned: Array.from({ length: options.badges || 0 }, (_, i) => BigInt(i + 1)),
    name: "Good human",
    calls: [],
    simulations: [],
    rpcFailure: false,
    revert: false,
    noCode: false,
    receiptRevert: false,
  };
  const abiFor = (to: string): Abi =>
    lower(to) === lower(token.address)
      ? tokenAbi
      : lower(to) === lower(badges.address)
        ? badgeAbi
        : lower(to) === lower(manifest.network.uniswapV4.permit2)
          ? permitAbi
          : lower(to) === lower(manifest.network.uniswapV4.quoter)
            ? quoterAbi
            : routerAbi;
  const execute = (to: string, data: Hex, mutate: boolean, value?: string) => {
    const abi = abiFor(to);
    const decoded = decodeFunctionData({ abi, data });
    const fn = decoded.functionName;
    const args = decoded.args || [];
    if (mutate) {
      state.calls.push({ to, fn, args, value });
      if (fn === "approve" && lower(to) === lower(token.address)) {
        if (lower(String(args[0])) === lower(badges.address))
          state.approval = args[1] as bigint;
        else state.permitToken = args[1] as bigint;
      } else if (fn === "approve") {
        state.permitAmount = args[2] as bigint;
        state.permitExpiry = Number(args[3]);
      }
      if (fn === "createBadgeType") {
        state.count++;
        state.approval -= 100n * 10n ** 18n;
        state.balance -= 100n * 10n ** 18n;
      }
      if (fn === "award") state.owned.push(1n);
      if (fn === "burn")
        state.owned = state.owned.filter((id) => id !== args[0]);
      if (fn === "setIssuer") state.issuer = args[1] as Address;
      return;
    }
    let result: unknown;
    if (fn === "decimals") result = 18;
    else if (fn === "token") result = token.address;
    else if (fn === "CREATION_FEE") result = 100n * 10n ** 18n;
    else if (fn === "typeCount") result = state.count;
    else if (fn === "totalSupply") result = BigInt(state.owned.length);
    else if (fn === "balanceOf")
      result =
        lower(to) === lower(token.address)
          ? state.balance
          : lower(String(args[0])) === lower(owner)
            ? BigInt(state.owned.length)
            : 0n;
    else if (fn === "allowance")
      result =
        lower(to) === lower(token.address)
          ? lower(String(args[1])) === lower(badges.address)
            ? state.approval
            : state.permitToken
          : [state.permitAmount, state.permitExpiry, 0];
    else if (fn === "badgeType") {
      if (BigInt(args[0] as bigint) > state.count || args[0] === 0n)
        throw Error("UnknownType");
      result = [stringToHex(state.name, { size: 32 }), state.issuer];
    } else if (fn === "badgeOf")
      result =
        lower(String(args[1])) === lower(owner) ? state.owned[0] || 0n : 0n;
    else if (fn === "tokenOfOwnerByIndex")
      result = state.owned[Number(args[1])];
    else if (fn === "typeOf") result = 1n;
    else if (fn === "locked") result = true;
    else if (fn === "tokenURI")
      result =
        "data:application/json;base64," +
        Buffer.from(
          JSON.stringify({
            name: state.name,
            image:
              "data:image/svg+xml;base64," +
              Buffer.from(
                `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360"><rect width="640" height="360" rx="24" fill="#355443"/><text x="320" y="170" text-anchor="middle" font-family="monospace" font-size="24" fill="white">${state.name}</text><text x="320" y="230" text-anchor="middle" fill="white">Type #1</text></svg>`,
              ).toString("base64"),
          }),
        ).toString("base64");
    else {
      state.simulations.push(fn);
      if (state.revert) throw Error("Mock pool rejected this transaction");
      if (fn === "quoteExactInputSingle") result = [200n * 10n ** 18n, 100000n];
      else if (fn === "approve" && lower(to) === lower(token.address))
        result = true;
      else if (fn === "createBadgeType") result = state.count + 1n;
      else if (fn === "award") result = 1n;
      else return "0x";
    }
    return encodeFunctionResult({ abi, functionName: fn, result });
  };
  let txIndex = 0;
  await page.exposeFunction(
    "__mockSend",
    (tx: { to: string; data: Hex; value?: string }) => {
      if (!state.receiptRevert) execute(tx.to, tx.data, true, tx.value);
      txIndex++;
      return `0x${txIndex.toString(16).padStart(64, "0")}`;
    },
  );
  if (options.wallet !== false)
    await page.addInitScript(
      ({ account, chain, reject, connected }) => {
        let currentChain = chain;
        let accounts: string[] = connected ? [account] : [];
        let added = false;
        const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
        const requests: { method: string; params?: unknown }[] = [];
        Object.assign(window, {
          __walletRequests: requests,
          __changeAccount: (next: string) => {
            accounts = next ? [next] : [];
            listeners.accountsChanged?.forEach((fn) => fn(accounts));
          },
        });
        const ethereum = {
          on: (e: string, fn: (...args: unknown[]) => void) => {
            (listeners[e] ||= []).push(fn);
          },
          removeListener: (e: string, fn: (...args: unknown[]) => void) => {
            listeners[e] = (listeners[e] || []).filter((f) => f !== fn);
          },
          request: async ({
            method,
            params,
          }: {
            method: string;
            params?: unknown[];
          }) => {
            requests.push({ method, params });
            if (method === "eth_accounts") return accounts;
            if (method === "eth_chainId") return currentChain;
            if (method === "eth_requestAccounts") {
              if (reject) throw { code: 4001 };
              accounts = [account];
              return accounts;
            }
            if (method === "wallet_switchEthereumChain") {
              if (!added && currentChain === "0x1")
                throw { code: 4902, message: "Unknown chain" };
              currentChain = (params![0] as { chainId: string }).chainId;
              listeners.chainChanged?.forEach((fn) => fn(currentChain));
              return null;
            }
            if (method === "wallet_addEthereumChain") {
              added = true;
              return null;
            }
            if (method === "eth_sendTransaction") {
              if (
                (window as unknown as { __rejectSigning?: boolean })
                  .__rejectSigning
              )
                throw { code: 4001 };
              return (
                window as unknown as {
                  __mockSend: (tx: unknown) => Promise<string>;
                }
              ).__mockSend(params![0]);
            }
            throw Error(`Unexpected wallet method: ${method}`);
          },
        };
        Object.assign(window, { ethereum });
      },
      {
        account: owner,
        chain: options.wrongChain ? "0x1" : manifest.walletAddChain.chainId,
        reject: options.reject || false,
        connected: options.connected || false,
      },
    );
  await page.route(
    /https:\/\/.*(publicnode|ethpandaops|sentio).*/,
    async (route) => {
      if (state.rpcFailure) {
        await route.abort("failed");
        return;
      }
      const payload = route.request().postDataJSON();
      const handle = (req: {
        method: string;
        id: number;
        params: unknown[];
      }) => {
        let result: unknown;
        try {
          if (req.method === "eth_chainId")
            result = manifest.walletAddChain.chainId;
          else if (req.method === "eth_getCode")
            result = state.noCode ? "0x" : "0x6001600055";
          else if (req.method === "eth_getBalance")
            result = "0xde0b6b3a7640000";
          else if (req.method === "eth_blockNumber") result = "0x100";
          else if (req.method === "eth_call") {
            const call = req.params[0] as { to: string; data: Hex };
            result = execute(call.to, call.data, false);
          } else if (req.method === "eth_getTransactionReceipt")
            result = {
              transactionHash: req.params[0],
              transactionIndex: "0x0",
              blockHash: "0x" + "ab".repeat(32),
              blockNumber: "0x100",
              from: owner,
              to: badges.address,
              cumulativeGasUsed: "0x10000",
              gasUsed: "0x10000",
              contractAddress: null,
              logs: [],
              logsBloom: "0x" + "00".repeat(256),
              status: state.receiptRevert ? "0x0" : "0x1",
              effectiveGasPrice: "0x1",
              type: "0x2",
            };
          else throw Error(`Unexpected RPC: ${req.method}`);
          return { jsonrpc: "2.0", id: req.id, result };
        } catch (e) {
          return {
            jsonrpc: "2.0",
            id: req.id,
            error: {
              code: 3,
              message: `execution reverted: ${(e as Error).message}`,
              data: "0x",
            },
          };
        }
      };
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(
          Array.isArray(payload) ? payload.map(handle) : handle(payload),
        ),
      });
    },
  );
  return state;
}
