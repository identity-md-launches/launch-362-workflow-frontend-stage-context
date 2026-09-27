import {
  createWalletClient,
  custom,
  encodeAbiParameters,
  parseAbi,
  parseAbiParameters,
  parseUnits,
  zeroAddress,
  type Abi,
  type Address,
  type EIP1193Provider,
  type Hex,
} from "viem";
import type { Runtime } from "./config";

export type Provider = EIP1193Provider & {
  on?: (event: string, fn: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, fn: (...args: unknown[]) => void) => void;
};
export const quoterAbi = parseAbi([
  "function quoteExactInputSingle(((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 exactAmount,bytes hookData) params) returns (uint256 amountOut,uint256 gasEstimate)",
]);
export const routerAbi = parseAbi([
  "function execute(bytes commands,bytes[] inputs,uint256 deadline) payable",
]);
export const permitAbi = parseAbi([
  "function approve(address token,address spender,uint160 amount,uint48 expiration)",
  "function allowance(address owner,address token,address spender) view returns (uint160 amount,uint48 expiration,uint48 nonce)",
]);
export const same = (a?: string, b?: string) =>
  !!a && !!b && a.toLowerCase() === b.toLowerCase();
export const validAddress = (v: string): v is Address =>
  /^0x[0-9a-fA-F]{40}$/.test(v) && !same(v, zeroAddress);
export const short = (v: string) => `${v.slice(0, 6)}…${v.slice(-4)}`;
export function message(e: unknown) {
  const error = e as {
    code?: number;
    shortMessage?: string;
    message?: string;
    cause?: unknown;
  };
  let cause = e as
    | { code?: number; name?: string; cause?: unknown }
    | undefined;
  for (let i = 0; cause && i < 8; i++, cause = cause.cause as typeof cause) {
    if (cause.code === 4001 || cause.name === "UserRejectedRequestError")
      return "Request declined in your wallet. You can try again when ready.";
  }
  return (
    error.shortMessage ||
    error.message ||
    "Request failed. Check your connection and try again."
  ).slice(0, 600);
}
export function amount(text: string, decimals: number) {
  if (
    !/^\d+(\.\d+)?$/.test(text) ||
    (text.split(".")[1]?.length || 0) > decimals
  )
    throw Error(
      `Enter a positive amount with at most ${decimals} decimal places.`,
    );
  const value = parseUnits(text, decimals);
  if (value <= 0n || value >= 2n ** 128n)
    throw Error("Enter an amount greater than zero and below the pool limit.");
  return value;
}
export const read = <T>(
  r: Runtime,
  target: Runtime["token"],
  functionName: string,
  args: readonly unknown[] = [],
): Promise<T> =>
  r.client.readContract({
    address: target.address,
    abi: target.abi,
    functionName,
    args,
  }) as Promise<T>;
export async function verify(r: Runtime) {
  if ((await r.client.getChainId()) !== r.manifest.chainId)
    throw Error("RPC chain mismatch. Transactions are disabled.");
  for (const c of r.manifest.contracts) {
    const code = await r.client.getBytecode({ address: c.address });
    if (!code || code === "0x")
      throw Error(`No deployed code for ${c.name}. Transactions are disabled.`);
  }
  if (!same(await read<Address>(r, r.badges, "token"), r.token.address))
    throw Error("The badge fee token differs from the handoff.");
}
export async function switchNetwork(provider: Provider, r: Runtime) {
  const chainId = r.manifest.walletAddChain.chainId as Hex;
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId }],
    });
  } catch (e) {
    const err = e as {
      code?: number;
      message?: string;
      data?: { originalError?: { code?: number } };
    };
    if (
      err.code !== 4902 &&
      err.data?.originalError?.code !== 4902 &&
      !/unknown chain|unrecognized chain|chain.*not.*added/i.test(
        err.message || "",
      )
    )
      throw e;
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [r.manifest.walletAddChain],
    });
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId }],
    });
  }
}
export async function assertWallet(
  provider: Provider,
  r: Runtime,
  account: Address,
) {
  const [chainId, accounts] = await Promise.all([
    provider.request({ method: "eth_chainId" }),
    provider.request({ method: "eth_accounts" }),
  ]);
  if (Number(chainId) !== r.manifest.chainId || !same(accounts[0], account))
    throw Error(
      "Wallet account or network changed. Refresh your wallet state and try again.",
    );
}
export type Call = {
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
};
export async function transact(
  r: Runtime,
  provider: Provider,
  account: Address,
  call: Call,
  status: (text: string, hash?: Hex) => void,
) {
  await assertWallet(provider, r, account);
  await verify(r);
  status("Simulating transaction…");
  const { request } = await r.client.simulateContract({ ...call, account });
  await assertWallet(provider, r, account);
  status("Confirm the transaction in your wallet.");
  const wallet = createWalletClient({
    chain: r.chain,
    transport: custom(provider),
    account,
  });
  const hash = await wallet.writeContract(request);
  status("Transaction submitted. Waiting for confirmation…", hash);
  let receiptHash = hash;
  let originalReplaced = false;
  try {
    const receipt = await r.client.waitForTransactionReceipt({
      hash,
      timeout: 120000,
      onReplaced: (replacement) => {
        receiptHash = replacement.transaction.hash;
        originalReplaced = replacement.reason !== "repriced";
        status(
          "Replacement transaction submitted. Waiting for confirmation…",
          receiptHash,
        );
      },
    });
    if (originalReplaced)
      throw Error(
        "The original transaction was cancelled or replaced in your wallet. Its action is not confirmed.",
      );
    if (receipt.status !== "success")
      throw Error(
        "Transaction reverted on chain. Review the explorer receipt before retrying.",
      );
    status(
      "Transaction confirmed. Balances and badges are refreshing.",
      receipt.transactionHash,
    );
  } catch (e) {
    const failure = `Confirmation not successful: ${message(e)} Check the explorer before retrying.`;
    status(failure, receiptHash);
    throw Error(failure);
  }
}
export function poolKey(r: Runtime) {
  const pair = r.manifest.pool.pairedCurrency;
  const currencies = [pair, r.token.address].sort((a, b) =>
    a.toLowerCase().localeCompare(b.toLowerCase()),
  );
  return {
    currency0: currencies[0],
    currency1: currencies[1],
    fee: r.manifest.pool.fee,
    tickSpacing: r.manifest.pool.tickSpacing,
    hooks: zeroAddress,
  };
}
export async function quoteSwap(
  r: Runtime,
  account: Address,
  buy: boolean,
  input: bigint,
  bps: bigint,
) {
  const key = poolKey(r);
  const inputCurrency = buy ? r.manifest.pool.pairedCurrency : r.token.address;
  const { result } = await r.client.simulateContract({
    address: r.manifest.network.uniswapV4.quoter,
    abi: quoterAbi,
    functionName: "quoteExactInputSingle",
    account,
    args: [
      {
        poolKey: key,
        zeroForOne: same(inputCurrency, key.currency0),
        exactAmount: input,
        hookData: "0x",
      },
    ],
  });
  const output = result[0];
  const minimum = (output * (10000n - bps)) / 10000n;
  if (minimum <= 0n || output >= 2n ** 128n)
    throw Error("The pool returned no usable quote. Try a different amount.");
  return { input, output, minimum, buy, expires: Date.now() + 60000 };
}
export type Quote = Awaited<ReturnType<typeof quoteSwap>>;
export function swapCall(r: Runtime, quote: Quote): Call {
  const key = poolKey(r);
  const inputCurrency = quote.buy
    ? r.manifest.pool.pairedCurrency
    : r.token.address;
  const outputCurrency = quote.buy
    ? r.token.address
    : r.manifest.pool.pairedCurrency;
  const params = [
    encodeAbiParameters(
      parseAbiParameters(
        "((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,bytes hookData)",
      ),
      [
        {
          poolKey: key,
          zeroForOne: same(inputCurrency, key.currency0),
          amountIn: quote.input,
          amountOutMinimum: quote.minimum,
          hookData: "0x",
        },
      ],
    ),
    encodeAbiParameters(parseAbiParameters("address,uint256"), [
      inputCurrency,
      quote.input,
    ]),
    encodeAbiParameters(parseAbiParameters("address,uint256"), [
      outputCurrency,
      quote.minimum,
    ]),
  ];
  return {
    address: r.manifest.network.uniswapV4.universalRouter,
    abi: routerAbi,
    functionName: "execute",
    args: [
      "0x10",
      [
        encodeAbiParameters(parseAbiParameters("bytes,bytes[]"), [
          "0x060c0f",
          params,
        ]),
      ],
      BigInt(Math.floor(Date.now() / 1000) + 120),
    ],
    value: same(inputCurrency, zeroAddress) ? quote.input : 0n,
  };
}
