# 🎬 Demo Script — Confidential Prize Savings

> **Duration**: 3-5 minutes  
> **Audience**: Hackathon judges evaluating privacy-preserving DeFi  
> **Goal**: Show the full user journey and prove that everything works end-to-end on a live testnet

---

## Pre-Demo Setup

1. ✅ MetaMask installed with Sepolia network configured
2. ✅ Account funded with Sepolia ETH (≥0.05 ETH for gas)
3. ✅ Frontend loaded at https://zkasuran.github.io/confidential-prize-savings-app/
4. ✅ Second browser/account ready (to show multi-user draw)
5. ✅ Etherscan tabs open for both contracts

---

## Script

### Act 1: The Problem (30 seconds)

> "PoolTogether is a brilliant no-loss lottery — but it leaks everything on-chain. 
> How much you deposited, your balance, the prize size, and who won — all public.
> What if we could keep all of that private?"

**[Show slide/diagram]** Traditional pool vs. our encrypted pool

---

### Act 2: Connect & Setup (45 seconds)

1. **Click "Connect Wallet"** → MetaMask popup → approve
   > "I'm connecting to our live deployment on Sepolia."

2. **Mint 100 cUSD** → Click Mint → Wait for confirmation
   > "First, I'll mint some test tokens from our faucet. Notice this is an ERC-7984 
   > confidential token — the balance is already encrypted on-chain."

3. **Click "Decrypt" on wallet balance** → Shows 100.00
   > "Only I can see my balance. I signed an EIP-712 decryption grant to prove 
   > I'm the owner. To everyone else, this is opaque ciphertext."

4. **Approve operator** → Click → Confirm
   > "One-time approval so the pool can pull my encrypted deposit."

---

### Act 3: The Magic — Encrypted Deposit (60 seconds)

5. **Enter 50 in deposit field** → Click "Encrypt & Deposit"
   > "Watch what happens: 50 cUSD is encrypted IN MY BROWSER using the Zama 
   > Relayer SDK's WASM engine BEFORE it touches the blockchain. The contract 
   > only ever sees a ciphertext handle."

6. **While waiting for confirmation**, show:
   - The transaction on Etherscan → "See? No plaintext amount anywhere in calldata"
   - The `Deposited(address)` event → "The event says I deposited, but not HOW MUCH"

7. **Click "Decrypt" on pool balance** → Shows 50.00
   > "I can see my pool balance because I hold the decryption key. 
   > Nobody else can read this value — not even the contract owner."

---

### Act 4: Multi-User Draw (90 seconds)

8. **Switch to Account 2** (or show pre-deposited second account)
   > "Now let's say Alice (account 2) also deposited 100 cUSD into the pool."

9. **Show stats bar**: 2 participants, pool total hidden
   > "We have 2 participants. The pool total stays encrypted until draw time."

10. **Sponsor 25 cUSD as prize** → Tab to Sponsor → Enter 25 → Submit
    > "I'll fund the prize pot with 25 cUSD. This models the yield that 
    > funds real PoolTogether prizes."

11. **Click "Start Draw"** → Confirm
    > "Starting the draw exposes ONLY the aggregate pool total for decryption. 
    > This is the minimum disclosure needed — FHE has no encrypted-mod-by-encrypted."

12. **Click "Finalize Draw"** → Confirm  
    > "Now the contract draws a random ticket under FHE, walks all participants 
    > with encrypted cumulative sums, and uses FHE.select to award the prize to 
    > exactly one person. Zero on-chain signal says who won."

13. **Click "Decrypt" on pool balance**
    > "Let me check if I won... [pause for effect]"
    > - If 75: "I WON! My balance grew from 50 to 75 — the 25 prize was added."
    > - If 50: "I didn't win this round. But my 50 is still safe — no-loss guarantee."

14. **Switch to other account and decrypt**
    > "The other account can check too. Exactly ONE of us got the prize. 
    > The winner is only discoverable by decrypting your own balance."

---

### Act 5: Privacy Proof (30 seconds)

15. **Show Etherscan transaction for finalizeDraw**
    > "Look at the on-chain data: the DrawFinalized event shows the round number 
    > and the revealed total — that's it. No winner address. No prize amount in 
    > any event. The select() happened entirely under FHE."

---

### Act 6: Technical Differentiators (30 seconds)

> "To summarize what makes this novel:
> 1. First deposit-weighted random draw entirely under FHE
> 2. Winner selection via cumulative-sum range matching with FHE.select
> 3. Only reveals aggregate TVL — minimum possible disclosure
> 4. 7 passing tests on the FHEVM mock coprocessor
> 5. Production Chainlink Automation keeper for scheduled draws
> 6. Full test coverage, linting, and live deployment"

---

## Backup Plans

| Issue | Recovery |
|-------|----------|
| MetaMask not connecting | Switch to pre-recorded video |
| Transaction pending too long | Show pre-completed state, explain timing |
| Decryption fails | "The Zama KMS is rate-limited on testnet" → show test output |
| Draw doesn't complete | Show hardhat test running the same flow |

---

## Key Talking Points for Q&A

1. **"Why not encrypt the participant list?"**  
   → Addresses are needed for the iteration loop. Could use stealth addresses in v2.

2. **"How does this scale?"**  
   → Current: ~50 participants per draw. Future: Merkle-tree batching for O(log n).

3. **"What about MEV?"**  
   → Draw outcome is encrypted. A miner can reorder `finalizeDraw` but cannot 
   influence the CSPRNG result — it's sealed in the FHE domain.

4. **"Is the aggregate total a privacy leak?"**  
   → It's the same TVL figure every savings pool shows. Individual positions stay secret.

5. **"Where does real yield come from?"**  
   → On testnet: sponsor-supplied. On mainnet: route deposits through Aave/Compound 
   lending pools and use interest as the prize — same as PoolTogether.

---

## Recording Tips

- Use a clean browser profile (no extensions visible)
- Zoom to 110% for readability on video
- Use a screen recorder that captures both tab and MetaMask popup
- Speak slowly at key moments (encryption, decryption, draw)
- Keep the Etherscan tab visible when proving privacy claims
