import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  formatUnits,
  hexToString,
  stringToHex,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import { loadRuntime, type Runtime } from "./config";
import {
  amount,
  assertWallet,
  message,
  permitAbi,
  quoteSwap,
  read,
  same,
  short,
  swapCall,
  switchNetwork,
  transact,
  validAddress,
  verify,
  type Call,
  type Provider,
  type Quote,
} from "./chain";

declare global {
  interface Window {
    ethereum?: Provider & { providers?: Provider[] };
  }
}
type Wallet = { provider: Provider; name: string; id: string };
type State = {
  decimals: number;
  fee: bigint;
  count: bigint;
  supply: bigint;
  balance?: bigint;
  allowance?: bigint;
  eth?: bigint;
  permitToken?: bigint;
  permitAmount?: bigint;
  permitExpiry?: number;
};
type Badge = {
  id: bigint;
  typeId: bigint;
  name: string;
  issuer: Address;
  image: string;
  locked: boolean;
};
type TypeInfo = { id: bigint; name: string; issuer: Address };
type Feedback = { scope: string; text: string; error?: boolean; hash?: Hex };
const pageSize = 6n;
const unit = (v: bigint | undefined, decimals = 18, precision = 5) => {
  if (v === undefined) return "—";
  const [whole, fraction] = formatUnits(v, decimals).split(".");
  return `${BigInt(whole).toLocaleString("en-US")}${fraction ? "." + fraction.slice(0, precision).replace(/0+$/, "") : ""}`.replace(
    /\.$/,
    "",
  );
};

function Seal({ name }: { name: string }) {
  return (
    <div className="seal-scene" aria-hidden="true">
      <div className="seal-orbit" />
      <div className="seal">
        <span className="seal-top">A small mark of appreciation</span>
        <svg viewBox="0 0 100 100" width="82" height="82" fill="none">
          <path
            d="m50 5 10 27 29-8-16 25 21 21-30-1-14 27-9-28-30 3 20-22-18-24 29 7Z"
            fill="currentColor"
          />
          <circle cx="50" cy="50" r="13" fill="var(--seal)" />
          <path d="m43 50 5 5 10-11" stroke="currentColor" strokeWidth="4" />
        </svg>
        <strong>{name || "Good human"}</strong>
        <span className="seal-bottom">Soulbound · stays with you</span>
      </div>
      <span className="preview-tag">Illustration · create your own below</span>
    </div>
  );
}
function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function App() {
  const [r, setRuntime] = useState<Runtime>();
  const [bootError, setBootError] = useState("");
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [walletId, setWalletId] = useState("");
  const provider = wallets.find((w) => w.id === walletId)?.provider;
  const [account, setAccount] = useState<Address>();
  const [chainId, setChainId] = useState<number>();
  const [data, setData] = useState<State>();
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const session = useRef(0);
  const [revision, setRevision] = useState(0);
  const [feedback, setFeedback] = useState<Feedback>({
    scope: "wallet",
    text: "",
  });
  const [badgeName, setBadgeName] = useState("");
  const [typeId, setTypeId] = useState("");
  const [typeInfo, setTypeInfo] = useState<TypeInfo>();
  const [recipient, setRecipient] = useState("");
  const [issuer, setIssuer] = useState("");
  const [buy, setBuy] = useState(true);
  const [swapAmount, setSwapAmount] = useState("0.001");
  const [slippage, setSlippage] = useState("0.5");
  const [quote, setQuote] = useState<Quote>();
  const [now, setNow] = useState(Date.now());
  const [profileInput, setProfileInput] = useState("");
  const [profile, setProfile] = useState<Address>();
  const [profilePage, setProfilePage] = useState(0n);
  const [profileCount, setProfileCount] = useState<bigint>();
  const [badges, setBadges] = useState<Badge[]>([]);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [typeList, setTypeList] = useState<TypeInfo[]>([]);
  const [typePage, setTypePage] = useState(0n);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState("");

  useEffect(() => {
    loadRuntime()
      .then(setRuntime)
      .catch((e) => setBootError(message(e)));
  }, []);
  useEffect(() => {
    const list =
      window.ethereum?.providers || (window.ethereum ? [window.ethereum] : []);
    const found: Wallet[] = list.map((p, i) => ({
      provider: p,
      id: `injected-${i}`,
      name: list.length === 1 ? "Browser wallet" : `Browser wallet ${i + 1}`,
    }));
    setWallets(found);
    setWalletId(found[0]?.id || "");
    const announce = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          info: { uuid: string; name: string };
          provider: Provider;
        }>
      ).detail;
      if (!detail?.provider || !detail.info?.uuid) return;
      setWallets((previous) => {
        if (previous.some((w) => w.provider === detail.provider))
          return previous.map((w) =>
            w.provider === detail.provider
              ? { ...w, name: detail.info.name }
              : w,
          );
        return [
          ...previous,
          {
            provider: detail.provider,
            id: detail.info.uuid,
            name: detail.info.name,
          },
        ];
      });
      setWalletId((current) => current || detail.info.uuid);
    };
    window.addEventListener("eip6963:announceProvider", announce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    return () =>
      window.removeEventListener("eip6963:announceProvider", announce);
  }, []);
  useEffect(() => {
    session.current++;
    setAccount(undefined);
    setChainId(undefined);
    setData(undefined);
    setQuote(undefined);
    setTypeInfo(undefined);
    if (!provider) return;
    let active = true;
    const accountsChanged = (...args: unknown[]) => {
      session.current++;
      setAccount((args[0] as Address[])[0]);
      setData(undefined);
      setQuote(undefined);
      setTypeInfo(undefined);
    };
    const chainChanged = (...args: unknown[]) => {
      session.current++;
      setChainId(Number(args[0]));
      setData(undefined);
      setQuote(undefined);
      setTypeInfo(undefined);
    };
    const disconnect = () => {
      session.current++;
      setAccount(undefined);
      setChainId(undefined);
      setData(undefined);
      setQuote(undefined);
    };
    Promise.all([
      provider.request({ method: "eth_accounts" }),
      provider.request({ method: "eth_chainId" }),
    ])
      .then(([accounts, id]) => {
        if (active) {
          setAccount(accounts[0]);
          setChainId(Number(id));
        }
      })
      .catch(() => {});
    provider.on?.("accountsChanged", accountsChanged);
    provider.on?.("chainChanged", chainChanged);
    provider.on?.("disconnect", disconnect);
    return () => {
      active = false;
      provider.removeListener?.("accountsChanged", accountsChanged);
      provider.removeListener?.("chainChanged", chainChanged);
      provider.removeListener?.("disconnect", disconnect);
    };
  }, [provider]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    setQuote(undefined);
  }, [swapAmount, slippage, buy, revision]);
  useEffect(() => {
    if (account) {
      setProfileInput(account);
      setProfile(account);
      setProfilePage(0n);
    }
  }, [account]);
  useEffect(() => {
    if (!r) return;
    let cancelled = false;
    setReading(true);
    setReadError("");
    setData(undefined);
    (async () => {
      await verify(r);
      const [decimals, fee, count, supply] = await Promise.all([
        read<number>(r, r.token, "decimals"),
        read<bigint>(r, r.badges, "CREATION_FEE"),
        read<bigint>(r, r.badges, "typeCount"),
        read<bigint>(r, r.badges, "totalSupply"),
      ]);
      const result: State = { decimals, fee, count, supply };
      if (account) {
        const [balance, allowance, eth, permitToken, permit] =
          await Promise.all([
            read<bigint>(r, r.token, "balanceOf", [account]),
            read<bigint>(r, r.token, "allowance", [account, r.badges.address]),
            r.client.getBalance({ address: account }),
            read<bigint>(r, r.token, "allowance", [
              account,
              r.manifest.network.uniswapV4.permit2,
            ]),
            r.client.readContract({
              address: r.manifest.network.uniswapV4.permit2,
              abi: permitAbi,
              functionName: "allowance",
              args: [
                account,
                r.token.address,
                r.manifest.network.uniswapV4.universalRouter,
              ],
            }),
          ]);
        Object.assign(result, {
          balance,
          allowance,
          eth,
          permitToken,
          permitAmount: permit[0],
          permitExpiry: permit[1],
        });
      }
      if (!cancelled) setData(result);
    })()
      .catch((e) => {
        if (!cancelled) setReadError(message(e));
      })
      .finally(() => {
        if (!cancelled) setReading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [r, account, chainId, revision]);
  useEffect(() => {
    if (!r || !data) {
      setTypeList([]);
      return;
    }
    let cancelled = false;
    setListLoading(true);
    setListError("");
    const start = typePage * pageSize + 1n;
    const ids: bigint[] = [];
    for (let id = start; id <= data.count && id < start + pageSize; id++)
      ids.push(id);
    Promise.all(
      ids.map(async (id) => {
        const [name, issuer] = await read<[Hex, Address]>(
          r,
          r.badges,
          "badgeType",
          [id],
        );
        return { id, name: hexToString(name, { size: 32 }), issuer };
      }),
    )
      .then((types) => {
        if (!cancelled) setTypeList(types);
      })
      .catch((e) => {
        if (!cancelled) setListError(message(e));
      })
      .finally(() => {
        if (!cancelled) setListLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [r, data, typePage]);
  useEffect(() => {
    if (!r || !profile) return;
    let cancelled = false;
    setProfileLoading(true);
    setProfileError("");
    setBadges([]);
    setProfileCount(undefined);
    (async () => {
      const count = await read<bigint>(r, r.badges, "balanceOf", [profile]);
      const start = profilePage * pageSize;
      const indices: bigint[] = [];
      for (let i = start; i < count && i < start + pageSize; i++)
        indices.push(i);
      const items = await Promise.all(
        indices.map(async (i) => {
          const id = await read<bigint>(r, r.badges, "tokenOfOwnerByIndex", [
            profile,
            i,
          ]);
          const [typeId, uri, locked] = await Promise.all([
            read<bigint>(r, r.badges, "typeOf", [id]),
            read<string>(r, r.badges, "tokenURI", [id]),
            read<boolean>(r, r.badges, "locked", [id]),
          ]);
          const [name, issuer] = await read<[Hex, Address]>(
            r,
            r.badges,
            "badgeType",
            [typeId],
          );
          if (!uri.startsWith("data:application/json;base64,"))
            throw Error("Unexpected on-chain badge metadata.");
          const metadata = JSON.parse(atob(uri.split(",")[1]));
          return {
            id,
            typeId,
            name: hexToString(name, { size: 32 }),
            issuer,
            locked,
            image:
              typeof metadata.image === "string" &&
              metadata.image.startsWith("data:image/svg+xml;base64,")
                ? metadata.image
                : "",
          };
        }),
      );
      if (!cancelled) {
        setBadges(items);
        setProfileCount(count);
      }
    })()
      .catch((e) => {
        if (!cancelled) setProfileError(message(e));
      })
      .finally(() => {
        if (!cancelled) setProfileLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [r, profile, profilePage, revision]);

  const ready = !!(
    r &&
    data &&
    account &&
    provider &&
    chainId === r.manifest.chainId &&
    !reading &&
    !busy
  );
  const prerequisite = !account
    ? "Connect your wallet to use these controls."
    : chainId !== r?.manifest.chainId
      ? `Switch to ${r?.manifest.network.name || "the deployment network"} to continue.`
      : readError
        ? "Retry deployment reads before continuing."
        : reading || !data
          ? "Checking deployment and balances…"
          : "";
  const isIssuer = same(typeInfo?.issuer, account);
  const sufficient =
    !!data && data.balance !== undefined && data.balance >= data.fee;
  const approved =
    !!data && data.allowance !== undefined && data.allowance >= data.fee;
  const freshQuote = !!quote && now < quote.expires;
  const needsTokenPermit =
    !buy && !!quote && (data?.permitToken || 0n) < quote.input;
  const needsRouterPermit =
    !buy &&
    !!quote &&
    ((data?.permitAmount || 0n) < quote.input ||
      (data?.permitExpiry || 0) < Math.floor(now / 1000) + 120);
  const outputDecimals = buy
    ? (data?.decimals ?? 18)
    : (r?.manifest.network.nativeCurrency.decimals ?? 18);

  async function action(scope: string, fn: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setFeedback({ scope, text: "Working…" });
    try {
      await fn();
    } catch (e) {
      setFeedback((current) => ({
        ...current,
        scope,
        error: true,
        text: message(e),
      }));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function write(scope: string, call: Call) {
    if (!r || !provider || !account || !ready)
      throw Error(prerequisite || "Wait for the current operation to finish.");
    await transact(r, provider, account, call, (text, hash) =>
      setFeedback({ scope, text, hash }),
    );
    setRevision((n) => n + 1);
    setQuote(undefined);
    setTypeInfo(undefined);
  }
  function note(scope: string) {
    return (
      <div
        className="feedback"
        role={feedback.error && feedback.scope === scope ? "alert" : "status"}
        aria-live="polite"
      >
        {feedback.scope === scope && (
          <>
            {feedback.text}
            {feedback.hash && r && (
              <>
                {" "}
                <a
                  href={`${r.manifest.network.explorer}/tx/${feedback.hash}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  View transaction ↗
                </a>
              </>
            )}
          </>
        )}
      </div>
    );
  }
  function addressLink(value: Address, label?: string) {
    return (
      <a
        className="address"
        href={`${r?.manifest.network.explorer}/address/${value}`}
        target="_blank"
        rel="noreferrer"
        title={value}
      >
        {label || short(value)} ↗
      </a>
    );
  }
  function submit(event: FormEvent, scope: string, fn: () => Promise<void>) {
    event.preventDefault();
    void action(scope, fn);
  }
  async function loadType(id: string) {
    if (!r || !/^\d+$/.test(id) || BigInt(id) < 1n)
      throw Error("Enter a badge type ID of 1 or greater.");
    const currentSession = session.current;
    const [name, issuer] = await read<[Hex, Address]>(
      r,
      r.badges,
      "badgeType",
      [BigInt(id)],
    );
    if (currentSession !== session.current) return;
    setTypeInfo({
      id: BigInt(id),
      name: hexToString(name, { size: 32 }),
      issuer,
    });
    setFeedback({
      scope: "manage",
      text: "Badge type loaded. Only its current issuer can manage it.",
    });
  }

  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="site-header shell">
        <a className="wordmark" href="#" aria-label="Badges home">
          <span className="brand-symbol" aria-hidden="true">
            ✳
          </span>{" "}
          badges<span className="lab-label">a Sepolia experiment</span>
        </a>
        <nav aria-label="Page navigation">
          <a href="#create">Create</a>
          <a href="#profile">Explore</a>
        </nav>
        <div className="wallet-controls">
          {wallets.length > 1 && (
            <select
              aria-label="Wallet provider"
              value={walletId}
              disabled={busy}
              onChange={(e) => setWalletId(e.target.value)}
            >
              {wallets.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          )}
          <button
            className="connect"
            disabled={busy || !!bootError}
            onClick={() =>
              action("wallet", async () => {
                if (!provider)
                  throw Error(
                    "No browser wallet found. Install a browser wallet such as MetaMask or Rabby, then reload this page.",
                  );
                const accounts = await provider.request({
                  method: "eth_requestAccounts",
                });
                if (!accounts[0])
                  throw Error(
                    "No account was shared. Select an account in your wallet and retry.",
                  );
                setAccount(accounts[0]);
                setChainId(
                  Number(await provider.request({ method: "eth_chainId" })),
                );
                setFeedback({
                  scope: "wallet",
                  text: "Wallet connected. Your wallet signs every transaction.",
                });
              })
            }
          >
            {account ? short(account) : "Connect wallet"}
            <span aria-hidden="true"> ↗</span>
          </button>
        </div>
      </header>
      <main id="main" className="shell" tabIndex={-1}>
        <section className="hero" aria-labelledby="title">
          <div>
            <p className="eyebrow">
              <span className="dot" /> Made for moments that matter
            </p>
            <h1 id="title">
              A little recognition.
              <br />
              <em>Made to stay.</em>
            </h1>
            <p className="intro">
              Create a badge. Give someone their flowers.
              <br className="desktop-break" /> Keep a small piece of
              appreciation on chain.
            </p>
            <p className="toy-note">
              Sepolia test toy. Badges are not credentials.
            </p>
            <a className="hero-link" href="#create">
              Create your first badge <span aria-hidden="true">↓</span>
            </a>
          </div>
          <Seal name={badgeName} />
        </section>
        <section
          className="account-bar"
          aria-label="Deployment and wallet state"
        >
          <div>
            <span className="eyebrow">Network</span>
            <strong>
              <span className="dot" />
              {r?.manifest.network.name || "Loading…"} <small>testnet</small>
            </strong>
          </div>
          <div>
            <span className="eyebrow">BDGE balance</span>
            <strong
              title={
                data?.balance === undefined
                  ? ""
                  : `${formatUnits(data.balance, data.decimals)} BDGE`
              }
            >
              {unit(data?.balance, data?.decimals)} <small>BDGE</small>
            </strong>
          </div>
          <div>
            <span className="eyebrow">Badge creation allowance</span>
            <strong
              title={
                data?.allowance === undefined
                  ? ""
                  : `${formatUnits(data.allowance, data.decimals)} BDGE`
              }
            >
              {unit(data?.allowance, data?.decimals)} <small>BDGE</small>
            </strong>
          </div>
          <button
            className="quiet"
            disabled={!r || reading || busy}
            onClick={() => setRevision((n) => n + 1)}
          >
            {reading ? "Checking…" : "Refresh state"}{" "}
            <span aria-hidden="true">↻</span>
          </button>
        </section>
        <div className="connection-state">
          {account && (
            <p className="small">
              Connected wallet: <span className="full-address">{account}</span>
            </p>
          )}
          {bootError && (
            <p className="error" role="alert">
              {bootError} Reload to retry.
            </p>
          )}
          {readError && (
            <p className="error" role="alert">
              Deployment reads failed: {readError} Use Refresh state to retry.
            </p>
          )}
          {account && r && chainId !== r.manifest.chainId && (
            <div className="network-warning">
              <p>
                Wrong network. Switch to {r.manifest.network.name} before
                signing.
              </p>
              <button
                disabled={busy}
                onClick={() =>
                  action("wallet", async () => {
                    await switchNetwork(provider!, r);
                    setChainId(
                      Number(
                        await provider!.request({ method: "eth_chainId" }),
                      ),
                    );
                    setFeedback({
                      scope: "wallet",
                      text: "Network switched. Refreshing balances…",
                    });
                  })
                }
              >
                Switch to {r.manifest.network.name}
              </button>
            </div>
          )}
          {note("wallet")}
        </div>
        <div className="workspace">
          <section
            className="panel create-panel"
            id="create"
            aria-labelledby="create-title"
          >
            <div className="section-heading">
              <span className="step">01</span>
              <div>
                <p className="eyebrow">Start something worth keeping</p>
                <h2 id="create-title">Create a badge type</h2>
              </div>
              <span className="pill">
                {data ? unit(data.fee, data.decimals) : "100"} BDGE
              </span>
            </div>
            <p>
              A name, a little meaning, and you as the issuer. Creating a type
              sends {data ? unit(data.fee, data.decimals) : "100"} BDGE to the
              burn address. Awarding it costs only network gas.
            </p>
            <form
              onSubmit={(e) =>
                submit(e, "create", async () => {
                  if (!/^[A-Za-z0-9 _-]{1,32}$/.test(badgeName))
                    throw Error(
                      "Use 1–32 letters, numbers, spaces, hyphens or underscores.",
                    );
                  await write("create", {
                    ...r!.badges,
                    functionName: "createBadgeType",
                    args: [stringToHex(badgeName, { size: 32 })],
                  });
                })
              }
            >
              <Field
                label="Badge name"
                hint="1–32 characters. Letters, numbers, spaces, hyphens and underscores."
              >
                <input
                  name="badgeName"
                  required
                  maxLength={32}
                  pattern="[A-Za-z0-9 _\-]{1,32}"
                  placeholder="e.g. Good human"
                  value={badgeName}
                  onChange={(e) => setBadgeName(e.target.value)}
                />
              </Field>
              <div className="fee-flow">
                <span>
                  <b>1</b> Approve the BDGE fee
                </span>
                <span>
                  <b>2</b> Create your badge type
                </span>
              </div>
              <div className="actions">
                <button
                  type="button"
                  disabled={!ready || !sufficient || approved}
                  onClick={() =>
                    action("create", () =>
                      write("create", {
                        ...r!.token,
                        functionName: "approve",
                        args: [r!.badges.address, data!.fee],
                      }),
                    )
                  }
                >
                  {approved
                    ? "Fee approved ✓"
                    : `Approve ${data ? unit(data.fee, data.decimals) : "100"} BDGE`}
                </button>
                <button
                  className="primary"
                  type="submit"
                  disabled={!ready || !sufficient || !approved}
                >
                  Create badge type <span aria-hidden="true">↗</span>
                </button>
              </div>
              <p className="helper">
                {prerequisite ||
                  (!sufficient
                    ? "You need more BDGE. Swap Sepolia ETH in the launch pool to get it."
                    : !approved
                      ? "Approve the fee first. This only lets SoulboundBadges spend the displayed amount."
                      : "Approval is ready. Creating a type pays the fee and makes you its issuer.")}
              </p>
            </form>
            {note("create")}
          </section>
          <section
            className="panel swap-panel"
            id="swap"
            aria-labelledby="swap-title"
          >
            <p className="eyebrow">Fuel for your first badge</p>
            <h2 id="swap-title">Get some BDGE</h2>
            <p>Swap Sepolia ETH in the launch pool. These are test tokens.</p>
            <form
              onSubmit={(e) =>
                submit(e, "swap", async () => {
                  if (!r || !account || !provider || !ready)
                    throw Error(prerequisite);
                  if (r.manifest.pool.pairedCurrency !== zeroAddress)
                    throw Error(
                      "This interface supports the attested native ETH pool only.",
                    );
                  await assertWallet(provider, r, account);
                  const input = amount(
                    swapAmount,
                    buy
                      ? r.manifest.network.nativeCurrency.decimals
                      : (data?.decimals ?? 18),
                  );
                  if (input > (buy ? data!.eth || 0n : data!.balance || 0n))
                    throw Error(
                      "The swap amount exceeds your balance. Enter a smaller amount and leave ETH for gas.",
                    );
                  const bps = amount(slippage, 2);
                  if (bps > 500n)
                    throw Error("Choose slippage from 0.01% to 5%.");
                  const currentSession = session.current;
                  setQuote(undefined);
                  const next = await quoteSwap(r, account, buy, input, bps);
                  if (currentSession !== session.current)
                    throw Error("Wallet changed. Request a new quote.");
                  setQuote(next);
                  setFeedback({
                    scope: "swap",
                    text: "Quote ready. It expires after 60 seconds; network gas is extra.",
                  });
                })
              }
            >
              <Field label="Swap direction">
                <select
                  value={buy ? "buy" : "sell"}
                  disabled={busy}
                  onChange={(e) => {
                    setBuy(e.target.value === "buy");
                    setSwapAmount(e.target.value === "buy" ? "0.001" : "100");
                  }}
                >
                  <option value="buy">Sepolia ETH → BDGE</option>
                  <option value="sell">BDGE → Sepolia ETH</option>
                </select>
              </Field>
              <div className="swap-fields">
                <Field label={`You pay (${buy ? "ETH" : "BDGE"})`}>
                  <input
                    required
                    inputMode="decimal"
                    name="swapAmount"
                    value={swapAmount}
                    disabled={busy}
                    onChange={(e) => setSwapAmount(e.target.value)}
                  />
                </Field>
                <Field label="Slippage (%)">
                  <input
                    required
                    type="number"
                    min="0.01"
                    max="5"
                    step="0.01"
                    name="slippage"
                    value={slippage}
                    disabled={busy}
                    onChange={(e) => setSlippage(e.target.value)}
                  />
                </Field>
              </div>
              <p className="small">
                Available:{" "}
                {buy
                  ? unit(data?.eth) + " ETH"
                  : unit(data?.balance, data?.decimals) + " BDGE"}{" "}
                · keep ETH for gas.
              </p>
              <button className="wide" disabled={!ready} type="submit">
                Get quote <span aria-hidden="true">↗</span>
              </button>
            </form>
            {quote && (
              <div className="quote">
                <div>
                  <span>Estimated receive</span>
                  <strong>
                    {unit(quote.output, outputDecimals, 8)}{" "}
                    {buy ? "BDGE" : "ETH"}
                  </strong>
                </div>
                <div>
                  <span>Minimum receive</span>
                  <span>
                    {formatUnits(quote.minimum, outputDecimals)}{" "}
                    {buy ? "BDGE" : "ETH"}
                  </span>
                </div>
                <p className="small">
                  {freshQuote
                    ? `Quote expires in ${Math.max(0, Math.ceil((quote.expires - now) / 1000))}s`
                    : "Quote expired. Get a new quote."}{" "}
                  · pool fee {r ? r.manifest.pool.fee / 10000 : ""}%
                </p>
                <p className="small">
                  Rate for this trade:{" "}
                  {formatUnits(
                    quote.input,
                    buy
                      ? r!.manifest.network.nativeCurrency.decimals
                      : (data?.decimals ?? 18),
                  )}{" "}
                  {buy ? "ETH" : "BDGE"} →{" "}
                  {unit(quote.output, outputDecimals, 8)} {buy ? "BDGE" : "ETH"}
                </p>
                {!buy && (
                  <div className="approval-steps">
                    <p className="small">
                      Selling BDGE needs two approvals, each for this input
                      amount.
                    </p>
                    <button
                      disabled={!ready || !freshQuote || !needsTokenPermit}
                      onClick={() =>
                        action("swap", () =>
                          write("swap", {
                            ...r!.token,
                            functionName: "approve",
                            args: [
                              r!.manifest.network.uniswapV4.permit2,
                              quote.input,
                            ],
                          }),
                        )
                      }
                    >
                      1. Approve BDGE for Permit2
                    </button>
                    <button
                      disabled={
                        !ready ||
                        !freshQuote ||
                        needsTokenPermit ||
                        !needsRouterPermit
                      }
                      onClick={() =>
                        action("swap", () =>
                          write("swap", {
                            address: r!.manifest.network.uniswapV4.permit2,
                            abi: permitAbi,
                            functionName: "approve",
                            args: [
                              r!.token.address,
                              r!.manifest.network.uniswapV4.universalRouter,
                              quote.input,
                              Math.floor(Date.now() / 1000) + 3600,
                            ],
                          }),
                        )
                      }
                    >
                      2. Approve router for 1 hour
                    </button>
                  </div>
                )}
                <button
                  className="wide"
                  disabled={
                    !ready ||
                    !freshQuote ||
                    needsTokenPermit ||
                    needsRouterPermit
                  }
                  onClick={() =>
                    action("swap", async () => {
                      if (Date.now() >= quote.expires)
                        throw Error(
                          "Quote expired. Get a new quote before swapping.",
                        );
                      await write("swap", swapCall(r!, quote));
                    })
                  }
                >
                  Swap {buy ? "ETH for BDGE" : "BDGE for ETH"}
                </button>
              </div>
            )}
            <p className="helper">
              {prerequisite ||
                "Review the quote before signing. A failed simulation will stop the swap."}
            </p>
            {note("swap")}
            {r && (
              <a
                className="small"
                href={r.manifest.network.faucets[0]}
                target="_blank"
                rel="noreferrer"
              >
                Need test ETH? Open the Sepolia faucet ↗
              </a>
            )}
          </section>
          <section
            className="panel manage-panel"
            aria-labelledby="manage-title"
          >
            <div className="section-heading">
              <span className="step">02</span>
              <div>
                <p className="eyebrow">Pass the appreciation on</p>
                <h2 id="manage-title">Award & manage</h2>
              </div>
            </div>
            <p>
              Choose a type you issue. A wallet can hold one live badge of each
              type. Names can repeat; the type ID and issuer identify a badge.
            </p>
            <form
              className="inline-form"
              onSubmit={(e) => submit(e, "manage", () => loadType(typeId))}
            >
              <Field label="Badge type ID">
                <input
                  required
                  inputMode="numeric"
                  pattern="[0-9]+"
                  name="typeId"
                  placeholder="e.g. 1"
                  value={typeId}
                  disabled={busy}
                  onChange={(e) => {
                    setTypeId(e.target.value);
                    setTypeInfo(undefined);
                  }}
                />
              </Field>
              <button disabled={!r || busy} type="submit">
                Load type
              </button>
            </form>
            {typeInfo && (
              <div className="selected-type">
                <strong>
                  {typeInfo.name}{" "}
                  <span className="pill">Type #{typeInfo.id.toString()}</span>
                </strong>
                <span>Issuer {addressLink(typeInfo.issuer)}</span>
              </div>
            )}
            <form
              onSubmit={(e) =>
                submit(e, "manage", async () => {
                  if (!validAddress(recipient))
                    throw Error(
                      "Enter a nonzero 0x wallet address with 40 hexadecimal characters.",
                    );
                  if (!typeInfo || !isIssuer)
                    throw Error("Load a badge type you currently issue.");
                  const existing = await read<bigint>(
                    r!,
                    r!.badges,
                    "badgeOf",
                    [typeInfo.id, recipient],
                  );
                  if (existing !== 0n)
                    throw Error(
                      `This wallet already holds badge #${existing}. Its holder must burn it before receiving this type again.`,
                    );
                  await write("manage", {
                    ...r!.badges,
                    functionName: "award",
                    args: [typeInfo.id, recipient],
                  });
                })
              }
            >
              <Field label="Recipient address">
                <input
                  required
                  name="recipient"
                  autoComplete="off"
                  spellCheck={false}
                  pattern="0x[0-9a-fA-F]{40}"
                  placeholder="0x…"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                />
              </Field>
              <button type="submit" disabled={!ready || !isIssuer}>
                Award badge <span aria-hidden="true">↗</span>
              </button>
              <p className="helper">
                {prerequisite ||
                  (!typeInfo
                    ? "Load a type to check its issuer."
                    : !isIssuer
                      ? "Only the displayed issuer can award or hand over this type."
                      : "You are the issuer. The badge stays with its recipient unless they burn it.")}
              </p>
            </form>
            <details>
              <summary>Hand over this badge type</summary>
              <p className="small">
                The new issuer can award badges and hand over this type again.
                You lose that control immediately; existing badges stay with
                their holders.
              </p>
              <form
                onSubmit={(e) =>
                  submit(e, "manage", async () => {
                    if (!validAddress(issuer))
                      throw Error("Enter a nonzero new issuer address.");
                    if (!typeInfo || !isIssuer)
                      throw Error("Load a badge type you currently issue.");
                    if (
                      !window.confirm(
                        `Hand over type #${typeInfo.id} (${typeInfo.name}) to ${issuer}? You will lose issuer control immediately.`,
                      )
                    ) {
                      setFeedback({
                        scope: "manage",
                        text: "Handover cancelled.",
                      });
                      return;
                    }
                    await write("manage", {
                      ...r!.badges,
                      functionName: "setIssuer",
                      args: [typeInfo.id, issuer],
                    });
                  })
                }
              >
                <Field label="New issuer address">
                  <input
                    required
                    name="newIssuer"
                    autoComplete="off"
                    spellCheck={false}
                    pattern="0x[0-9a-fA-F]{40}"
                    placeholder="0x…"
                    value={issuer}
                    onChange={(e) => setIssuer(e.target.value)}
                  />
                </Field>
                <button type="submit" disabled={!ready || !isIssuer}>
                  Hand over issuer control
                </button>
              </form>
            </details>
            {note("manage")}
          </section>
        </div>
        <section
          className="profile-section"
          id="profile"
          aria-labelledby="profile-title"
        >
          <div className="profile-heading">
            <div>
              <p className="eyebrow">03 / Small moments, collected</p>
              <h2 id="profile-title">Every wallet has a story.</h2>
              <p>Explore any address’s badges. No wallet connection needed.</p>
            </div>
            <span className="outline-seal" aria-hidden="true">
              ✳
            </span>
          </div>
          <form
            className="profile-search"
            onSubmit={(e) => {
              e.preventDefault();
              if (!validAddress(profileInput)) {
                setProfileError(
                  "Enter a nonzero address beginning with 0x and 40 hexadecimal characters.",
                );
                return;
              }
              setProfile(profileInput);
              setProfilePage(0n);
              setRevision((n) => n + 1);
            }}
          >
            <Field label="Profile wallet address">
              <input
                required
                name="profileAddress"
                autoComplete="off"
                spellCheck={false}
                pattern="0x[0-9a-fA-F]{40}"
                placeholder="0x…"
                value={profileInput}
                onChange={(e) => setProfileInput(e.target.value)}
              />
            </Field>
            <button type="submit" disabled={!r || profileLoading}>
              View badges <span aria-hidden="true">↗</span>
            </button>
            {account && (
              <button
                type="button"
                className="quiet"
                disabled={profileLoading}
                onClick={() => {
                  setProfileInput(account);
                  setProfile(account);
                  setProfilePage(0n);
                  setRevision((n) => n + 1);
                }}
              >
                Use my wallet
              </button>
            )}
          </form>
          {profile && (
            <p className="small profile-address">
              Profile: {addressLink(profile, profile)} ·{" "}
              {profileCount?.toString() ?? "…"} live{" "}
              {profileCount === 1n ? "badge" : "badges"}
            </p>
          )}
          <div role="status">
            {profileLoading && <p>Reading badges from the contract…</p>}
          </div>
          {profileError && (
            <p className="error" role="alert">
              {profileError} Use View badges to retry.
            </p>
          )}
          {!profileLoading && !profileError && !badges.length && (
            <div className="empty-state">
              <span aria-hidden="true">✳</span>
              <div>
                <h3>
                  {profile
                    ? "A blank page, for now."
                    : "Recognition lives here."}
                </h3>
                <p>
                  {profile
                    ? "No badges on this page. An issuer can award a badge to this wallet."
                    : "Enter a wallet address to see its collection of soulbound badges."}
                </p>
              </div>
            </div>
          )}
          <div className="badge-grid">
            {badges.map((badge) => (
              <article className="badge-card" key={badge.id.toString()}>
                {badge.image && (
                  <img
                    src={badge.image}
                    alt={`${badge.name}, badge type ${badge.typeId}`}
                    loading="lazy"
                  />
                )}
                <div>
                  <p className="eyebrow">
                    Type #{badge.typeId.toString()} · Token #
                    {badge.id.toString()}
                  </p>
                  <h3>{badge.name}</h3>
                  <p className="small">Issuer {addressLink(badge.issuer)}</p>
                  <p className="small">
                    {badge.locked
                      ? "Locked · nontransferable"
                      : "Lock status unavailable"}
                  </p>
                  {same(profile, account) && (
                    <button
                      className="danger"
                      disabled={!ready}
                      onClick={() =>
                        action("profile", async () => {
                          if (
                            !window.confirm(
                              `Burn badge #${badge.id} (${badge.name})? This removes it permanently. Its issuer may award this type to you again.`,
                            )
                          ) {
                            setFeedback({
                              scope: "profile",
                              text: "Burn cancelled.",
                            });
                            return;
                          }
                          await write("profile", {
                            ...r!.badges,
                            functionName: "burn",
                            args: [badge.id],
                          });
                        })
                      }
                    >
                      Burn badge #{badge.id.toString()}
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
          {profile && (
            <div className="pagination">
              <button
                disabled={profileLoading || profilePage === 0n}
                onClick={() => setProfilePage((p) => p - 1n)}
              >
                Previous badges
              </button>
              <span>Page {(profilePage + 1n).toString()}</span>
              <button
                disabled={
                  profileLoading ||
                  profileCount === undefined ||
                  (profilePage + 1n) * pageSize >= profileCount
                }
                onClick={() => setProfilePage((p) => p + 1n)}
              >
                Next badges
              </button>
            </div>
          )}
          {note("profile")}
        </section>
        <details className="directory">
          <summary>
            Browse badge types{" "}
            <span>
              {data?.count.toString() ?? "…"}{" "}
              {data?.count === 1n ? "type" : "types"} ·{" "}
              {data?.supply.toString() ?? "…"} live{" "}
              {data?.supply === 1n ? "badge" : "badges"}
            </span>
          </summary>
          <p className="small">
            Read directly from the contract, six types at a time. Select a type
            to load it in Award & manage.
          </p>
          {listLoading && <p role="status">Loading types…</p>}
          {listError && (
            <p role="alert">{listError} Use Refresh state to retry.</p>
          )}
          {!listLoading && !typeList.length && (
            <p>No badge types yet. Create the first one above.</p>
          )}
          <ul className="type-list">
            {typeList.map((t) => (
              <li key={t.id.toString()}>
                <span>
                  <strong>{t.name}</strong> · Type #{t.id.toString()}
                  <br />
                  <small>Issuer {addressLink(t.issuer)}</small>
                </span>
                <button
                  disabled={busy}
                  onClick={() => {
                    setTypeId(t.id.toString());
                    void action("manage", () => loadType(t.id.toString()));
                    document.getElementById("manage-title")?.scrollIntoView();
                  }}
                >
                  Select type #{t.id.toString()}
                </button>
              </li>
            ))}
          </ul>
          <div className="pagination">
            <button
              disabled={listLoading || typePage === 0n}
              onClick={() => setTypePage((p) => p - 1n)}
            >
              Previous types
            </button>
            <span>Page {(typePage + 1n).toString()}</span>
            <button
              disabled={
                listLoading || !data || (typePage + 1n) * pageSize >= data.count
              }
              onClick={() => setTypePage((p) => p + 1n)}
            >
              Next types
            </button>
          </div>
        </details>
      </main>
      <footer className="shell">
        <div>
          <a className="wordmark" href="#">
            ✳ badges
          </a>
          <p>
            A Sepolia test toy. Badges are not credentials.
            <br />
            Nontransferable by design. Only a holder can burn their badge.
          </p>
        </div>
        <div className="contract-links">
          <span className="eyebrow">On chain, out in the open</span>
          {r?.manifest.contracts.map((c) => (
            <div key={c.name}>
              {addressLink(c.address, c.name)} <code>{c.address}</code>
            </div>
          ))}
          <a className="small" href="./imd-deployment.json">
            View deployment manifest ↗
          </a>
        </div>
      </footer>
    </>
  );
}
