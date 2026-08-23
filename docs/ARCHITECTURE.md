# Architecture — Confidential Prize Savings

## System Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                              USER'S BROWSER                              │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────┐    ┌──────────────────┐    ┌──────────────────────┐   │
│  │  React App  │───▶│  Zama Relayer SDK │───▶│  MetaMask / Wallet   │   │
│  │  (Vite+TS)  │    │  (WASM Engine)   │    │  (EIP-1193)          │   │
│  └─────────────┘    └──────────────────┘    └──────────────────────┘   │
│         │                    │                         │                 │
│         │  User inputs       │  Encrypted inputs       │  Sign & submit │
│         │  (plaintext)       │  (ciphertext handles)   │  transactions  │
│         ▼                    ▼                         ▼                 │
└──────────────────────────────────────────────────────────────────────────┘
                                       │
                                       │ JSON-RPC / Transactions
                                       ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                         ETHEREUM SEPOLIA (FHEVM)                         │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────────┐          ┌─────────────────────────────────┐  │
│  │  ConfidentialToken   │◀────────▶│  ConfidentialPrizePool           │  │
│  │  (ERC-7984 cUSD)    │          │  (Encrypted Prize Pool)          │  │
│  │                     │          │                                   │  │
│  │  • mint(to, amount) │          │  • deposit(enc, proof)           │  │
│  │  • setOperator()    │          │  • withdraw(enc, proof)          │  │
│  │  • balanceOf() →    │          │  • sponsorPrize(enc, proof)      │  │
│  │    euint64 handle   │          │  • startDraw()                   │  │
│  └─────────────────────┘          │  • finalizeDraw(sigs)            │  │
│                                    │  • confidentialBalanceOf()       │  │
│                                    └─────────────────────────────────┘  │
│                                              │                           │
│                                              │ FHE operations            │
│                                              ▼                           │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                    ZAMA FHE COPROCESSOR                           │   │
│  │                                                                    │   │
│  │  Operations: add, sub, mul, rem, le, ge, lt, and, select,        │   │
│  │             randEuint64, asEuint64, isInitialized                 │   │
│  │                                                                    │   │
│  │  All computation happens on encrypted data (euint64, ebool)       │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                              │                           │
│                                              │ Decryption requests       │
│                                              ▼                           │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                    ZAMA KEY MANAGEMENT SERVICE                     │   │
│  │                                                                    │   │
│  │  • Holds FHE secret key (threshold shared across nodes)           │   │
│  │  • Public decryption: verifiable with KMS signatures              │   │
│  │  • User decryption: requires EIP-712 signed grant                 │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

## Data Flow — Deposit

```
User types "50 cUSD"
        │
        ▼
[1] Frontend: parseUnits("50") → 50_000000n (bigint)
        │
        ▼
[2] Relayer SDK: createEncryptedInput(poolAddr, userAddr)
                  .add64(50_000000n)
                  .encrypt()
    → { handles: [bytes32], inputProof: bytes }
        │
        ▼
[3] MetaMask: Sign tx calling pool.deposit(handle, proof)
        │
        ▼
[4] Contract: FHE.fromExternal(handle, proof)
              → Validated euint64 ciphertext
        │
        ▼
[5] Contract: confidentialTransferFrom(user, pool, amount)
              → Transfer happens entirely in encrypted domain
        │
        ▼
[6] Contract: _deposits[user] = FHE.add(current, received)
              → Encrypted balance updated
        │
        ▼
[7] Event: Deposited(user) — publicly visible (but amount is hidden)
```

## Data Flow — Prize Draw

```
[Phase 1: Start]
──────────────────
Anyone calls startDraw()
    │
    ├── Verify: participants.length > 0
    ├── Verify: block.timestamp >= lastDrawTime + drawInterval
    ├── FHE.makePubliclyDecryptable(_totalDeposited)
    └── Set drawState = AwaitingTotal

[Phase 2: Decrypt Total]
──────────────────────────
Zama KMS decrypts _totalDeposited
    │
    ├── Returns: uint64 total (e.g., 300_000000)
    └── Signs: cryptographic proof of correct decryption

[Phase 3: Finalize]
──────────────────────
Anyone calls finalizeDraw(handles, cleartexts, proof)
    │
    ├── FHE.checkSignatures() — verify KMS proof
    ├── total = abi.decode(cleartexts) = 300_000000
    │
    ├── Draw ticket: ticket = FHE.rem(FHE.randEuint64(), total)
    │   → uniform random in [0, 300_000000)
    │
    └── Walk participants:
        │
        │  cumulative = 0
        │  For each account:
        │    lower = cumulative
        │    cumulative += balance[account]    // all encrypted
        │    won = (ticket >= lower) && (ticket < cumulative)
        │    balance[account] = select(won, balance + prize, balance)
        │
        │  Example (hidden from observers):
        │    Alice: [0, 100) — 33.3% chance
        │    Bob:   [100, 300) — 66.7% chance
        │    If ticket = 173 → Bob wins (but nobody knows this on-chain)
        │
        └── Reset: prizePot = 0, drawState = Idle, round++
```

## Privacy Guarantee Matrix

| Data Element | Stored As | Who Can Read | When Revealed |
|-------------|-----------|--------------|---------------|
| Individual deposit amount | euint64 | Nobody (used internally) | Never |
| Account balance | euint64 | Account owner (via EIP-712 grant) | On user request |
| Prize pot | euint64 | Nobody (until draw) | Never (consumed in draw) |
| Winner identity | ebool per account | Nobody | Never (winner knows via balance) |
| Aggregate pool total | euint64 → uint64 | Public | At draw time only |
| Participant list | address[] | Public | Always |
| Round counter | uint256 | Public | Always |

## Gas Analysis

| Operation | Estimated Gas | FHE Operations |
|-----------|--------------|----------------|
| `deposit()` | ~180,000 | fromExternal, add, allow ×3 |
| `withdraw()` | ~200,000 | fromExternal, le, select, sub, allow ×3, transfer |
| `sponsorPrize()` | ~150,000 | fromExternal, add, allow |
| `startDraw()` | ~80,000 | makePubliclyDecryptable |
| `finalizeDraw(n=5)` | ~800,000 | checkSigs, rand, rem, n×(add, ge, lt, and, select, allow×2) |
| `finalizeDraw(n=20)` | ~2,800,000 | Same but ×20 iterations |
| `finalizeDraw(n=50)` | ~6,800,000 | Approaches block limit |

### Scaling Considerations

The `finalizeDraw` function iterates all participants under FHE, making it O(n) in gas. Mitigation strategies for scaling beyond ~50 participants:

1. **Merkle-tree draw** — batch participants into sub-pools, draw a winning sub-pool first (O(log n))
2. **Verifiable Random Function** — pre-compute winner off-chain with VRF + FHE proof
3. **Threshold-based sharding** — split into multiple smaller pools automatically
4. **Lazy evaluation** — only evaluate the winner's branch (requires protocol changes)

## Threat Model

### Adversary Capabilities

| Adversary | Capabilities | Cannot Do |
|-----------|-------------|-----------|
| **External observer** | Read all public chain data, participant list, TVL at draw time | See individual balances, deposits, prize, or winner |
| **Other participant** | All of above + decrypt own balance | Decrypt anyone else's balance or influence draw |
| **Pool owner** | Cancel stuck draws, change draw interval | Withdraw others' funds, see balances, bias the draw |
| **Sequencer/Miner** | Reorder transactions, front-run | Bias encrypted CSPRNG, decrypt FHE values |
| **Compromised KMS node** | Threshold: need majority of KMS nodes compromised | Single node cannot decrypt |

### Invariants

1. **No-loss**: `∀ user: balance[user] >= 0` (enforced by FHE clamping)
2. **Conservation**: `sum(balances) + prizePot == tokens held by contract`
3. **Fairness**: `P(user wins) = balance[user] / totalDeposited` (by uniform ticket)
4. **Privacy**: Individual values never appear in calldata, logs, or return values as plaintext

## Contract Inheritance

```
ConfidentialPrizePool
├── ZamaEthereumConfig    (network-specific FHE configuration)
├── Ownable2Step          (safe ownership transfer)
└── ReentrancyGuard       (cross-function reentrancy protection)

ConfidentialToken
├── ZamaEthereumConfig    (network-specific FHE configuration)
├── ERC7984               (confidential fungible token)
└── Ownable2Step          (safe ownership transfer)

AutoDraw (Chainlink Automation)
└── AutomationCompatibleInterface  (Chainlink keeper interface)
```

## Future Architecture (Mainnet)

```
                    ┌──────────────────────┐
                    │  Chainlink Automation │
                    │  (Scheduled Draws)    │
                    └──────────┬───────────┘
                               │
┌──────────┐     ┌─────────────▼─────────────┐     ┌──────────────┐
│  Frontend │────▶│  ConfidentialPrizePool v2  │────▶│  Aave/Comp   │
│  (PWA)   │     │  + Multi-token support     │     │  Yield Source │
└──────────┘     │  + Governance              │     └──────────────┘
                  │  + Time-locked withdrawals │
                  └───────────────────────────┘
                               │
                  ┌────────────▼────────────┐
                  │  The Graph (Subgraph)    │
                  │  Event indexing + history │
                  └─────────────────────────┘
```
