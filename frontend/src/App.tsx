import { useCallback, useEffect, useState } from "react";
import { BrowserProvider, Contract, JsonRpcSigner, ZeroHash } from "ethers";
import type { Eip1193Provider } from "ethers";
import { getFhevmInstance, type FhevmInstance } from "./fhevm";
import { toHex, userDecryptEuint } from "./decrypt";
import { POOL_ABI, TOKEN_ABI } from "./abi";
import { CHAIN_ID, CHAIN_ID_HEX, POOL_ADDRESS, TOKEN_ADDRESS, formatUnits, parseUnits } from "./config";
import ParticleBackground from "./components/ParticleBackground";
import HowItWorks from "./components/HowItWorks";
import ToastContainer, { showToast } from "./components/Toast";

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
  const [activeTab, setActiveTab] = useState<"deposit" | "withdraw" | "sponsor">("deposit");

  const configured = Boolean(TOKEN_ADDRESS && POOL_ADDRESS);
  const onSepolia = chainId === CHAIN_ID;

  const log = useCallback(
    (m: string) => setLogs((l) => [`${new Date().toLocaleTimeString()}  ${m}`, ...l].slice(0, 80)),
    [],
  );

  const connect = useCallback(async () => {
    if (!window.ethereum) {
      showToast("No wallet found. Install MetaMask.", "error");
      return;
    }
    const provider = new BrowserProvider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    const s = await provider.getSigner();
    const net = await provider.getNetwork();
    setSigner(s);
    setAccount(await s.getAddress());
    setChainId(Number(net.chainId));
    showToast("Wallet connected successfully!", "success");
    log(`Connected ${await s.getAddress()} on chain ${net.chainId}`);
  }, [log]);

  const switchToSepolia = useCallback(async () => {
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_ID_HEX }] });
    } catch (e) {
      showToast(`Switch network failed: ${(e as Error).message}`, "error");
    }
  }, []);

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
      showToast(`${label}…`, "loading");
      try {
        log(`${label}…`);
        await fn();
        log(`${label} ✓`);
        showToast(`${label} completed!`, "success");
      } catch (e) {
        const msg = (e as Error).message.slice(0, 120);
        log(`${label} ✗ ${msg}`);
        showToast(`${label} failed`, "error");
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
    run("Approve pool operator", async () => {
      const { token } = contracts();
      const until = Math.floor(Date.now() / 1000) + 365 * 24 * 3600;
      await (await token.setOperator(POOL_ADDRESS, until)).wait();
    });

  const doDeposit = () =>
    run("Encrypted deposit", async () => {
      const { pool } = contracts();
      const { handle, proof } = await encrypt(POOL_ADDRESS, parseUnits(depositAmt));
      await (await pool.deposit(handle, proof)).wait();
      await refresh();
    });

  const doWithdraw = () =>
    run("Encrypted withdrawal", async () => {
      const { pool } = contracts();
      const { handle, proof } = await encrypt(POOL_ADDRESS, parseUnits(withdrawAmt));
      await (await pool.withdraw(handle, proof)).wait();
      await refresh();
    });

  const doSponsor = () =>
    run("Sponsor prize", async () => {
      const { pool } = contracts();
      const { handle, proof } = await encrypt(POOL_ADDRESS, parseUnits(sponsorAmt));
      await (await pool.sponsorPrize(handle, proof)).wait();
      await refresh();
    });

  const revealPool = () =>
    run("Decrypt pool balance", async () => {
      const { pool } = contracts();
      const handle: string = await pool.confidentialBalanceOf(account);
      if (handle === ZeroHash) {
        setPoolBalance("0.00");
        return;
      }
      const instance = await getFhevmInstance(window.ethereum as Eip1193Provider);
      setPoolBalance(formatUnits(await userDecryptEuint(instance, signer!, handle, POOL_ADDRESS, account)));
    });

  const revealWallet = () =>
    run("Decrypt wallet balance", async () => {
      const { token } = contracts();
      const handle: string = await token.confidentialBalanceOf(account);
      if (handle === ZeroHash) {
        setWalletBalance("0.00");
        return;
      }
      const instance = await getFhevmInstance(window.ethereum as Eip1193Provider);
      setWalletBalance(formatUnits(await userDecryptEuint(instance, signer!, handle, TOKEN_ADDRESS, account)));
    });

  const doStartDraw = () =>
    run("Start draw", async () => {
      const { pool } = contracts();
      await (await pool.startDraw()).wait();
      await refresh();
    });

  const doFinalizeDraw = () =>
    run("Finalize draw", async () => {
      const { pool } = contracts();
      const instance = await getFhevmInstance(window.ethereum as Eip1193Provider);
      const handle: string = await pool.totalDepositedHandle();
      const dec = await instance.publicDecrypt([handle]);
      await (await pool.finalizeDraw([handle], dec.abiEncodedClearValues, dec.decryptionProof)).wait();
      await refresh();
    });

  const disabled = busy || !onSepolia || !configured || !account;

  return (
    <>
      <ParticleBackground />
      <ToastContainer />
      
      <div className="app">
        {/* Navigation */}
        <nav className="navbar">
          <div className="nav-brand">
            <span className="nav-logo">🔐</span>
            <span className="nav-title">Confidential Prize Savings</span>
          </div>
          <div className="nav-actions">
            {account ? (
              <div className="nav-wallet">
                <span className="network-dot" />
                <span className="nav-address">
                  {account.slice(0, 6)}…{account.slice(-4)}
                </span>
                {!onSepolia && (
                  <button className="btn btn-sm btn-warning" onClick={switchToSepolia}>
                    Switch to Sepolia
                  </button>
                )}
              </div>
            ) : (
              <button className="btn btn-primary btn-glow" onClick={connect}>
                <span className="btn-icon">◆</span>
                Connect Wallet
              </button>
            )}
          </div>
        </nav>

        {/* Hero Section */}
        <header className="hero">
          <div className="hero-badge-row">
            <span className="badge badge-protocol">Zama FHEVM</span>
            <span className="badge badge-network">Sepolia Testnet</span>
            <span className="badge badge-status">● Live</span>
          </div>
          <h1 className="hero-title">
            The Private<br />
            <span className="gradient-text">No-Loss Lottery</span>
          </h1>
          <p className="hero-subtitle">
            Deposit, save together, and one depositor wins the prize each round.
            Your deposits, balances, and winnings stay <strong>fully encrypted</strong> end-to-end with FHE.
          </p>
          {!account && (
            <button className="btn btn-primary btn-lg btn-glow hero-cta" onClick={connect}>
              <span className="btn-icon">🔗</span>
              Launch App
            </button>
          )}
        </header>

        {/* Stats Bar */}
        {info && (
          <div className="stats-bar">
            <div className="stat-item">
              <span className="stat-label">Round</span>
              <span className="stat-value">{info.round.toString()}</span>
            </div>
            <div className="stat-divider" />
            <div className="stat-item">
              <span className="stat-label">Participants</span>
              <span className="stat-value">{info.participants.toString()}</span>
            </div>
            <div className="stat-divider" />
            <div className="stat-item">
              <span className="stat-label">Last Revealed TVL</span>
              <span className="stat-value">{formatUnits(info.total)} cUSD</span>
            </div>
            <div className="stat-divider" />
            <div className="stat-item">
              <span className="stat-label">Status</span>
              <span className={`stat-value ${info.drawState === 0 ? "text-success" : "text-warning"}`}>
                {info.drawState === 0 ? "● Open" : "⏳ Drawing"}
              </span>
            </div>
          </div>
        )}

        {!configured && (
          <div className="alert alert-warning">
            <span className="alert-icon">⚠️</span>
            Frontend not pointed at deployed contracts. Set <code>VITE_TOKEN_ADDRESS</code> and{" "}
            <code>VITE_POOL_ADDRESS</code>.
          </div>
        )}

        {/* Main Dashboard */}
        {account && onSepolia && (
          <div className="dashboard">
            {/* Left Column - Your Position */}
            <div className="dashboard-left">
              {/* Balance Card */}
              <div className="card card-highlight card-position">
                <div className="card-header-row">
                  <h2 className="card-title">Your Position</h2>
                  <span className="encrypted-badge">
                    <span className="lock-icon">🔒</span> Encrypted
                  </span>
                </div>
                <div className="position-grid">
                  <div className="position-item">
                    <span className="position-label">Pool Balance</span>
                    <div className="position-value-row">
                      <span className="position-value">{poolBalance}</span>
                      <button className="btn btn-ghost btn-xs" disabled={disabled} onClick={revealPool}>
                        👁️ Decrypt
                      </button>
                    </div>
                    <span className="position-unit">cUSD in pool</span>
                  </div>
                  <div className="position-divider" />
                  <div className="position-item">
                    <span className="position-label">Wallet Balance</span>
                    <div className="position-value-row">
                      <span className="position-value">{walletBalance}</span>
                      <button className="btn btn-ghost btn-xs" disabled={disabled} onClick={revealWallet}>
                        👁️ Decrypt
                      </button>
                    </div>
                    <span className="position-unit">cUSD in wallet</span>
                  </div>
                </div>
                <p className="position-hint">
                  Only you can decrypt these values. To everyone else they appear as opaque ciphertext.
                </p>
              </div>

              {/* Draw Card */}
              <div className="card card-draw">
                <div className="card-header-row">
                  <h2 className="card-title">🎲 Prize Draw</h2>
                  <span className={`draw-status ${info?.drawState === 0 ? "status-idle" : "status-pending"}`}>
                    {info?.drawState === 0 ? "Ready" : "Awaiting Finalization"}
                  </span>
                </div>
                <p className="card-description">
                  Trigger a deposit-weighted random draw. The winner receives the entire prize pot
                  added to their encrypted balance — with zero on-chain signal of who won.
                </p>
                <div className="draw-actions">
                  <button className="btn btn-secondary" disabled={disabled || info?.drawState !== 0} onClick={doStartDraw}>
                    Start Draw
                  </button>
                  <button className="btn btn-primary" disabled={disabled || info?.drawState === 0} onClick={doFinalizeDraw}>
                    Finalize Draw
                  </button>
                </div>
              </div>
            </div>

            {/* Right Column - Actions */}
            <div className="dashboard-right">
              {/* Faucet + Approve Card */}
              <div className="card card-setup">
                <h2 className="card-title">⚡ Setup</h2>
                <div className="setup-grid">
                  <div className="setup-item">
                    <label className="input-label">Mint test cUSD</label>
                    <div className="input-row">
                      <input
                        className="input"
                        value={mintAmt}
                        onChange={(e) => setMintAmt(e.target.value)}
                        inputMode="decimal"
                        placeholder="Amount"
                      />
                      <button className="btn btn-secondary" disabled={disabled} onClick={doMint}>
                        Mint
                      </button>
                    </div>
                  </div>
                  <div className="setup-item">
                    <label className="input-label">Approve pool operator</label>
                    <button className="btn btn-outline btn-full" disabled={disabled} onClick={doApprove}>
                      Approve ERC-7984 Operator
                    </button>
                  </div>
                </div>
              </div>

              {/* Action Tabs Card */}
              <div className="card card-actions">
                <div className="tab-header">
                  <button
                    className={`tab-btn ${activeTab === "deposit" ? "tab-active" : ""}`}
                    onClick={() => setActiveTab("deposit")}
                  >
                    Deposit
                  </button>
                  <button
                    className={`tab-btn ${activeTab === "withdraw" ? "tab-active" : ""}`}
                    onClick={() => setActiveTab("withdraw")}
                  >
                    Withdraw
                  </button>
                  <button
                    className={`tab-btn ${activeTab === "sponsor" ? "tab-active" : ""}`}
                    onClick={() => setActiveTab("sponsor")}
                  >
                    Sponsor
                  </button>
                </div>

                <div className="tab-content">
                  {activeTab === "deposit" && (
                    <div className="tab-panel">
                      <p className="tab-description">
                        Your deposit is encrypted in-browser before submission. The contract only sees ciphertext.
                      </p>
                      <div className="input-row">
                        <input
                          className="input input-lg"
                          value={depositAmt}
                          onChange={(e) => setDepositAmt(e.target.value)}
                          inputMode="decimal"
                          placeholder="Amount in cUSD"
                        />
                        <span className="input-suffix">cUSD</span>
                      </div>
                      <button className="btn btn-primary btn-full btn-lg" disabled={disabled} onClick={doDeposit}>
                        🔐 Encrypt & Deposit
                      </button>
                      <div className="fee-hint">
                        <span>🛡️ No-loss guarantee: principal always redeemable</span>
                      </div>
                    </div>
                  )}

                  {activeTab === "withdraw" && (
                    <div className="tab-panel">
                      <p className="tab-description">
                        Withdraw your principal safely. Over-withdrawals are clamped to zero — you can never lose funds.
                      </p>
                      <div className="input-row">
                        <input
                          className="input input-lg"
                          value={withdrawAmt}
                          onChange={(e) => setWithdrawAmt(e.target.value)}
                          inputMode="decimal"
                          placeholder="Amount in cUSD"
                        />
                        <span className="input-suffix">cUSD</span>
                      </div>
                      <button className="btn btn-secondary btn-full btn-lg" disabled={disabled} onClick={doWithdraw}>
                        Withdraw
                      </button>
                    </div>
                  )}

                  {activeTab === "sponsor" && (
                    <div className="tab-panel">
                      <p className="tab-description">
                        Fund the prize pot. Sponsors provide the yield that funds prizes — modelling real DeFi yield on testnet.
                      </p>
                      <div className="input-row">
                        <input
                          className="input input-lg"
                          value={sponsorAmt}
                          onChange={(e) => setSponsorAmt(e.target.value)}
                          inputMode="decimal"
                          placeholder="Amount in cUSD"
                        />
                        <span className="input-suffix">cUSD</span>
                      </div>
                      <button className="btn btn-accent btn-full btn-lg" disabled={disabled} onClick={doSponsor}>
                        🎁 Sponsor Prize
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* How It Works */}
        <HowItWorks />

        {/* Activity Log */}
        {logs.length > 0 && (
          <section className="card card-log">
            <div className="card-header-row">
              <h2 className="card-title">📋 Activity Log</h2>
              <button className="btn btn-ghost btn-xs" onClick={() => setLogs([])}>
                Clear
              </button>
            </div>
            <ul className="log-list">
              {logs.map((entry, i) => (
                <li key={i} className="log-entry">
                  {entry}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Footer */}
        <footer className="footer">
          <div className="footer-brand">
            <span>🔐</span>
            <span>Confidential Prize Savings</span>
          </div>
          <div className="footer-links">
            <a href={`https://sepolia.etherscan.io/address/${POOL_ADDRESS}`} target="_blank" rel="noreferrer">
              Pool Contract ↗
            </a>
            <a href={`https://sepolia.etherscan.io/address/${TOKEN_ADDRESS}`} target="_blank" rel="noreferrer">
              Token Contract ↗
            </a>
            <a href="https://docs.zama.ai/fhevm" target="_blank" rel="noreferrer">
              Zama Docs ↗
            </a>
          </div>
          <div className="footer-copy">
            Built with 🔒 FHE for a more private DeFi · Zama Developer Program Season 4
          </div>
        </footer>
      </div>
    </>
  );
}
