import { useCallback, useEffect, useState } from "react";
import { BrowserProvider, Contract, JsonRpcSigner, ZeroHash } from "ethers";
import type { Eip1193Provider } from "ethers";
import { getFhevmInstance, type FhevmInstance } from "./fhevm";
import { toHex, userDecryptEuint } from "./decrypt";
import { POOL_ABI, TOKEN_ABI } from "./abi";
import { CHAIN_ID, CHAIN_ID_HEX, POOL_ADDRESS, TOKEN_ADDRESS, formatUnits, parseUnits } from "./config";

type InjectedProvider = Eip1193Provider & {
  on?: (event: string, cb: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, cb: (...args: unknown[]) => void) => void;
};
declare global {
  interface Window {
    ethereum?: InjectedProvider;
  }
}

type PoolInfo = { round: bigint; total: bigint; participants: bigint; drawState: number };

const HIDDEN = "•••• encrypted";

export default function App() {
  const [account, setAccount] = useState("");
  const [chainId, setChainId] = useState(0);
  const [signer, setSigner] = useState<JsonRpcSigner | null>(null);
  const [busy, setBusy] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [poolBalance, setPoolBalance] = useState(HIDDEN);
  const [walletBalance, setWalletBalance] = useState(HIDDEN);
  const [info, setInfo] = useState<PoolInfo | null>(null);
  const [mintAmt, setMintAmt] = useState("100");
  const [depositAmt, setDepositAmt] = useState("50");
  const [withdrawAmt, setWithdrawAmt] = useState("10");
  const [sponsorAmt, setSponsorAmt] = useState("25");

  const configured = Boolean(TOKEN_ADDRESS && POOL_ADDRESS);
  const onSepolia = chainId === CHAIN_ID;

  const log = useCallback(
    (m: string) => setLogs((l) => [`${new Date().toLocaleTimeString()}  ${m}`, ...l].slice(0, 80)),
    [],
  );

  const connect = useCallback(async () => {
    if (!window.ethereum) {
      log("No wallet found. Install MetaMask.");
      return;
    }
    const provider = new BrowserProvider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    const s = await provider.getSigner();
    const net = await provider.getNetwork();
    setSigner(s);
    setAccount(await s.getAddress());
    setChainId(Number(net.chainId));
    log(`Connected ${await s.getAddress()} on chain ${net.chainId}`);
  }, [log]);

  const switchToSepolia = useCallback(async () => {
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_ID_HEX }] });
    } catch (e) {
      log(`Switch network failed: ${(e as Error).message}`);
    }
  }, [log]);

  useEffect(() => {
    const eth = window.ethereum;
    if (!eth?.on) return;
    const reload = () => window.location.reload();
    eth.on("accountsChanged", reload);
    eth.on("chainChanged", reload);
    return () => {
      eth.removeListener?.("accountsChanged", reload);
      eth.removeListener?.("chainChanged", reload);
    };
  }, []);

  const contracts = useCallback(() => {
    if (!signer) throw new Error("Connect your wallet first");
    return {
      token: new Contract(TOKEN_ADDRESS, TOKEN_ABI, signer),
      pool: new Contract(POOL_ADDRESS, POOL_ABI, signer),
    };
  }, [signer]);

  const run = useCallback(
    async (label: string, fn: () => Promise<void>) => {
      setBusy(true);
      try {
        log(`${label}…`);
        await fn();
        log(`${label} ✓`);
      } catch (e) {
        log(`${label} ✗ ${(e as Error).message.slice(0, 160)}`);
      } finally {
        setBusy(false);
      }
    },
    [log],
  );

  const encrypt = useCallback(
    async (target: string, value: bigint) => {
      const instance: FhevmInstance = await getFhevmInstance(window.ethereum as Eip1193Provider);
      const enc = await instance.createEncryptedInput(target, account).add64(value).encrypt();
      return { handle: toHex(enc.handles[0]), proof: toHex(enc.inputProof) };
    },
    [account],
  );

  const refresh = useCallback(async () => {
    if (!signer || !configured) return;
    const { pool } = contracts();
    const [round, total, participants, drawState] = await Promise.all([
      pool.currentRound(),
      pool.lastRevealedTotal(),
      pool.participantCount(),
      pool.drawState(),
    ]);
    setInfo({ round, total, participants, drawState: Number(drawState) });
  }, [signer, configured, contracts]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const doMint = () =>
    run("Faucet mint", async () => {
      const { token } = contracts();
      await (await token.mint(account, parseUnits(mintAmt))).wait();
    });

  const doApprove = () =>
    run("Approve pool as operator", async () => {
      const { token } = contracts();
      const until = Math.floor(Date.now() / 1000) + 365 * 24 * 3600;
      await (await token.setOperator(POOL_ADDRESS, until)).wait();
    });

  const doDeposit = () =>
    run("Deposit (encrypted)", async () => {
      const { pool } = contracts();
      const { handle, proof } = await encrypt(POOL_ADDRESS, parseUnits(depositAmt));
      await (await pool.deposit(handle, proof)).wait();
      await refresh();
    });

  const doWithdraw = () =>
    run("Withdraw (encrypted)", async () => {
      const { pool } = contracts();
      const { handle, proof } = await encrypt(POOL_ADDRESS, parseUnits(withdrawAmt));
      await (await pool.withdraw(handle, proof)).wait();
      await refresh();
    });

  const doSponsor = () =>
    run("Sponsor prize (encrypted)", async () => {
      const { pool } = contracts();
      const { handle, proof } = await encrypt(POOL_ADDRESS, parseUnits(sponsorAmt));
      await (await pool.sponsorPrize(handle, proof)).wait();
      await refresh();
    });

  const revealPool = () =>
    run("Reveal my pool balance", async () => {
      const { pool } = contracts();
      const handle: string = await pool.confidentialBalanceOf(account);
      if (handle === ZeroHash) {
        setPoolBalance("0");
        return;
      }
      const instance = await getFhevmInstance(window.ethereum as Eip1193Provider);
      setPoolBalance(formatUnits(await userDecryptEuint(instance, signer!, handle, POOL_ADDRESS, account)));
    });

  const revealWallet = () =>
    run("Reveal my wallet cUSD", async () => {
      const { token } = contracts();
      const handle: string = await token.confidentialBalanceOf(account);
      if (handle === ZeroHash) {
        setWalletBalance("0");
        return;
      }
      const instance = await getFhevmInstance(window.ethereum as Eip1193Provider);
      setWalletBalance(formatUnits(await userDecryptEuint(instance, signer!, handle, TOKEN_ADDRESS, account)));
    });

  const doStartDraw = () =>
    run("Start draw (expose pool total)", async () => {
      const { pool } = contracts();
      await (await pool.startDraw()).wait();
      await refresh();
    });

  const doFinalizeDraw = () =>
    run("Finalize draw (award hidden winner)", async () => {
      const { pool } = contracts();
      const instance = await getFhevmInstance(window.ethereum as Eip1193Provider);
      const handle: string = await pool.totalDepositedHandle();
      const dec = await instance.publicDecrypt([handle]);
      await (await pool.finalizeDraw([handle], dec.abiEncodedClearValues, dec.decryptionProof)).wait();
      await refresh();
    });

  const disabled = busy || !onSepolia || !configured || !account;

  return (
    <div className="app">
      <header className="hero">
        <div className="hero-badge">Zama FHEVM · Sepolia</div>
        <h1>Confidential Prize Savings</h1>
        <p className="tag">
          A no-loss lottery where deposits, balances and winnings stay encrypted end-to-end. Save
          together, one depositor wins the prize each round, nobody loses principal, and the winner
          stays hidden.
        </p>
        <div className="wallet">
          {account ? (
            <span className="pill ok">
              {account.slice(0, 6)}…{account.slice(-4)}
            </span>
          ) : (
            <button className="btn primary" onClick={connect}>
              Connect wallet
            </button>
          )}
          {account && !onSepolia && (
            <button className="btn warn" onClick={switchToSepolia}>
              Switch to Sepolia
            </button>
          )}
          {account && onSepolia && <span className="pill ok">Sepolia ✓</span>}
        </div>
      </header>

      {!configured && (
        <div className="notice">
          Frontend is not yet pointed at deployed contracts. Set <code>VITE_TOKEN_ADDRESS</code> and{" "}
          <code>VITE_POOL_ADDRESS</code>, then rebuild.
        </div>
      )}

      <main className="grid">
        <section className="card">
          <h2>1 · Get test cUSD</h2>
          <p className="hint">Mint yourself confidential test tokens from the faucet.</p>
          <div className="row">
            <input value={mintAmt} onChange={(e) => setMintAmt(e.target.value)} inputMode="decimal" />
            <button className="btn" disabled={disabled} onClick={doMint}>
              Mint
            </button>
          </div>
          <div className="balance">
            <span>Wallet cUSD</span>
            <strong>{walletBalance}</strong>
            <button className="link" disabled={disabled} onClick={revealWallet}>
              reveal
            </button>
          </div>
        </section>

        <section className="card">
          <h2>2 · Approve the pool</h2>
          <p className="hint">One-time ERC-7984 operator approval so the pool can pull your encrypted deposit.</p>
          <button className="btn" disabled={disabled} onClick={doApprove}>
            Approve operator
          </button>
        </section>

        <section className="card">
          <h2>3 · Deposit</h2>
          <p className="hint">Your amount is encrypted in the browser before it ever touches the chain.</p>
          <div className="row">
            <input value={depositAmt} onChange={(e) => setDepositAmt(e.target.value)} inputMode="decimal" />
            <button className="btn primary" disabled={disabled} onClick={doDeposit}>
              Deposit
            </button>
          </div>
        </section>

        <section className="card highlight">
          <h2>Your position</h2>
          <p className="hint">Only you can decrypt this. It is a ciphertext to everyone else.</p>
          <div className="big">{poolBalance}</div>
          <button className="btn" disabled={disabled} onClick={revealPool}>
            Reveal my balance
          </button>
        </section>

        <section className="card">
          <h2>Withdraw</h2>
          <p className="hint">No-loss: principal is always redeemable. Over-withdrawing simply does nothing.</p>
          <div className="row">
            <input value={withdrawAmt} onChange={(e) => setWithdrawAmt(e.target.value)} inputMode="decimal" />
            <button className="btn" disabled={disabled} onClick={doWithdraw}>
              Withdraw
            </button>
          </div>
        </section>

        <section className="card">
          <h2>Sponsor the prize</h2>
          <p className="hint">Fund the encrypted prize pot (models the yield that funds the draw).</p>
          <div className="row">
            <input value={sponsorAmt} onChange={(e) => setSponsorAmt(e.target.value)} inputMode="decimal" />
            <button className="btn" disabled={disabled} onClick={doSponsor}>
              Sponsor
            </button>
          </div>
        </section>

        <section className="card wide">
          <h2>Prize draw</h2>
          <div className="stats">
            <div>
              <span>Round</span>
              <strong>{info ? info.round.toString() : "—"}</strong>
            </div>
            <div>
              <span>Participants</span>
              <strong>{info ? info.participants.toString() : "—"}</strong>
            </div>
            <div>
              <span>Last revealed total</span>
              <strong>{info ? formatUnits(info.total) : "—"}</strong>
            </div>
            <div>
              <span>State</span>
              <strong>{info ? (info.drawState === 0 ? "Idle" : "Awaiting total") : "—"}</strong>
            </div>
          </div>
          <p className="hint">
            The draw reveals only the aggregate pool total, draws a deposit-weighted random ticket
            under FHE, and credits the encrypted prize to one hidden winner.
          </p>
          <div className="row">
            <button className="btn" disabled={disabled || info?.drawState !== 0} onClick={doStartDraw}>
              1 · Start draw
            </button>
            <button className="btn primary" disabled={disabled || info?.drawState !== 1} onClick={doFinalizeDraw}>
              2 · Finalize draw
            </button>
          </div>
        </section>
      </main>

      <section className="log">
        <h2>Activity</h2>
        <ul>
          {logs.length === 0 ? (
            <li className="muted">No activity yet.</li>
          ) : (
            logs.map((l, i) => <li key={i}>{l}</li>)
          )}
        </ul>
      </section>

      <footer className="foot">
        <p>
          <strong>Privacy model.</strong> Individual deposits, balances, the prize amount and the
          winner all stay encrypted. The only value ever decrypted is the aggregate pool total,
          exposed at draw time so a fair deposit-weighted ticket can be drawn.
        </p>
        <p className="addrs">
          {configured ? (
            <>
              token <code>{TOKEN_ADDRESS}</code> · pool <code>{POOL_ADDRESS}</code>
            </>
          ) : (
            "contracts not configured"
          )}
        </p>
      </footer>
    </div>
  );
}
