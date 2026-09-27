import { createPublicClient, http } from "viem";
import { readFileSync, writeFileSync } from "node:fs";
const m = JSON.parse(
  readFileSync(new URL("../../dist/imd-deployment.json", import.meta.url)),
);
const results = [];
for (const url of m.network.rpcUrls) {
  const client = createPublicClient({
    transport: http(url, { timeout: 8000, retryCount: 0 }),
  });
  try {
    const chainId = await client.getChainId();
    if (chainId !== m.chainId) throw Error(`Unexpected chain ${chainId}`);
    const contracts = [];
    for (const c of m.contracts) {
      const code = await client.getBytecode({ address: c.address });
      if (!code || code === "0x") throw Error(`No code: ${c.name}`);
      const abi = JSON.parse(
        readFileSync(new URL(`../../dist/${c.abiPath}`, import.meta.url)),
      );
      const functions =
        c.name === "LaunchToken"
          ? ["name", "symbol", "decimals", "totalSupply"]
          : ["token", "CREATION_FEE", "typeCount", "totalSupply"];
      const state = {};
      for (const functionName of functions)
        state[functionName] = String(
          await client.readContract({ address: c.address, abi, functionName }),
        );
      contracts.push({
        name: c.name,
        address: c.address,
        codeBytes: (code.length - 2) / 2,
        state,
      });
    }
    results.push({ url, chainId, contracts, result: "pass" });
  } catch (e) {
    results.push({
      url,
      result: "unavailable",
      error: (e.shortMessage || e.message).slice(0, 350),
    });
  }
}
const result = { checkedAt: new Date().toISOString(), readOnly: true, results };
writeFileSync(
  new URL("../../docs/evidence/rpc.json", import.meta.url),
  JSON.stringify(result, null, 2) + "\n",
);
console.log(JSON.stringify(result, null, 2));
if (!results.some((r) => r.result === "pass")) process.exitCode = 1;
