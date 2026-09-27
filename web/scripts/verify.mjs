import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { keccak256, toHex } from "viem";
export const canonical = (value) => JSON.stringify(sort(value));
function sort(v) {
  return Array.isArray(v)
    ? v.map(sort)
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, sort(v[k])]),
        )
      : v;
}
export const handoff = JSON.parse(
  readFileSync(new URL("../config/deployment.json", import.meta.url)),
);
export const net = JSON.parse(
  readFileSync(new URL("../config/network.json", import.meta.url)),
);
if (
  handoff.chainId !== net.network.chainId ||
  Number(net.walletAddChain.chainId) !== handoff.chainId
)
  throw Error("Network mismatch");
export const abis = new Map();
for (const c of handoff.contracts) {
  const path = `docs/abi/${c.name}.json`;
  const pinned = execFileSync("git", [
    "show",
    `${handoff.sourceCommit}:${path}`,
  ]);
  const current = readFileSync(new URL(`../../${path}`, import.meta.url));
  if (!pinned.equals(current))
    throw Error(`${path} differs from deployed source commit`);
  const abi = JSON.parse(pinned);
  if (
    !Array.isArray(abi) ||
    keccak256(toHex(canonical(abi))).slice(2) !== c.abiHash
  )
    throw Error(`${c.name} ABI hash mismatch`);
  abis.set(c.name, current);
}
console.log(
  `Verified ${abis.size} implementation ABIs at ${handoff.sourceCommit}`,
);
