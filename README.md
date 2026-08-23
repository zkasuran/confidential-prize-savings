# Confidential Prize Savings

A private, no-loss prize-savings pool (a confidential [PoolTogether](https://pooltogether.com))
built on the [Zama Protocol](https://www.zama.org) with FHEVM. Depositors save together, one of
them wins the accrued prize each round, and nobody ever loses principal. Every deposit, every
balance, the prize amount and even the winner all stay encrypted end-to-end.

Built for the Zama Developer Program (Mainnet Season 4, Bounty Track).

## Live

- App: _published at submission (Sepolia)_
- Network: Ethereum Sepolia (chainId 11155111)
- ConfidentialToken (cUSD): [`0x57aF4e4B482Ab1bb4f9d1aeb5206258a7Def0eaf`](https://sepolia.etherscan.io/address/0x57aF4e4B482Ab1bb4f9d1aeb5206258a7Def0eaf)
- ConfidentialPrizePool: [`0x89EE395e44bD7F7401D47805550f9dc424b9D553`](https://sepolia.etherscan.io/address/0x89EE395e44bD7F7401D47805550f9dc424b9D553)

## What makes it confidential

A normal prize-savings pool leaks everything: how much you deposited, your running balance, how big
the prize is and who won. This one leaks almost nothing.

- **Deposits are encrypted in your browser** before they touch the chain, using the Zama Relayer
  SDK. The contract only ever sees ciphertext handles.
- **Balances are private.** Your deposit balance is an `euint64` only you (and the contract) can
  decrypt. To everyone else it is opaque.
- **The prize amount is private.** The pot is an encrypted value funded by sponsors.
- **The winner is hidden.** The draw credits the encrypted prize to exactly one depositor using
  `FHE.select`, with no on-chain signal of who it was. You find out you won by decrypting your own
  balance and seeing it grow.

The only value ever revealed is the **aggregate pool total**, and only at draw time. That is the
same TVL number any savings pool shows publicly, and it is needed so a fair, deposit-weighted
winning ticket can be drawn. Individual positions stay secret.

## How the draw works

Selecting a deposit-weighted winner over encrypted balances is the hard part, because FHE has no
encrypted-modulo-by-encrypted operation. The flow:

1. `startDraw()` marks the encrypted aggregate total publicly decryptable and pauses deposits.
2. The relayer publicly decrypts that single aggregate to a plaintext `total`, with KMS signatures.
3. `finalizeDraw(...)` verifies those signatures, then draws a uniform encrypted ticket
   `r = rem(randEuint64(), total)` in `[0, total)` using the on-chain FHE CSPRNG.
4. It walks the participants with an encrypted running cumulative sum. For each account it computes
   `won = (r >= lower) && (r < cumulative)` as an `ebool` and adds the whole prize to that
   account's balance via `FHE.select`. Exactly one range contains `r`, so exactly one hidden winner
   is paid. Every branch is encrypted, so nothing on chain says who won.

<!-- MARKER_README2 -->

## No-loss guarantee

Principal is always redeemable. `withdraw` clamps the request to your balance under FHE
(`select(le(request, balance), request, 0)`), so an over-withdrawal simply moves nothing. Winning
adds to your balance and never subtracts from anyone. Sponsors fund the prize pot, which models the
yield that funds prizes in the original PoolTogether. On this testnet the yield is sponsor-supplied
rather than routed through a lending market, and that is stated plainly rather than faked.

## Architecture

```
hardhat/                     FHEVM Solidity + tests + deploy
  contracts/
    ConfidentialToken.sol      ERC-7984 confidential token (cUSD) with a demo faucet
    ConfidentialPrizePool.sol  the confidential no-loss prize pool
  test/ConfidentialPrizePool.ts  full mock-coprocessor suite (deposit, withdraw, weighted draw)
  deploy/deploy.ts             hardhat-deploy script
  tasks/PrizePool.ts           CLI: faucet, operator, deposit, balance, pool-info
frontend/                    Vite + React + ethers + @zama-fhe/relayer-sdk
  src/                         wallet connect, in-browser encryption, user + public decryption
```

Contracts use `@fhevm/solidity` and OpenZeppelin's `@openzeppelin/confidential-contracts`
(ERC-7984). The frontend encrypts inputs and decrypts your own balance with the Zama Relayer SDK.

## Develop

```bash
# contracts
cd hardhat
npm install
npx hardhat test            # 7 passing against the FHEVM mock
npm run lint                # solhint + eslint + prettier, zero warnings
npx hardhat vars set MNEMONIC     # or export PRIVATE_KEY for a real deploy
PRIVATE_KEY=0x.. SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com \
  npx hardhat deploy --network sepolia --tags ConfidentialPrizePool

# frontend
cd ../frontend
npm install
npm run dev                 # http://localhost:5173
```

## AI disclosure

AI assistance (Claude, Anthropic) was used to develop this project. The design, review and
verification were done by the author. Verified before publishing: the Hardhat suite (7 tests on the
FHEVM mock), solhint + eslint + prettier with zero warnings, a TypeScript typecheck, a production
frontend build, and a live end-to-end run on Sepolia (encrypted deposit then user-decrypt of the
resulting balance) against the real Zama coprocessor and relayer.

## License

BSD-3-Clause-Clear, matching the FHEVM template this builds on.

