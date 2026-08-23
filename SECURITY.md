# Security Policy

## 🔒 Supported Versions

| Version | Network | Supported |
|---------|---------|-----------|
| 0.1.x | Sepolia Testnet | ✅ Active |
| — | Mainnet | 🚧 Not yet deployed |

## 🛡️ Security Model

This project operates under a **Fully Homomorphic Encryption (FHE)** security model with the following trust assumptions:

### Trusted Components
- **Zama KMS (Key Management Service)** — holds the FHE secret key; required for decryption
- **Zama Coprocessor** — executes FHE operations; must correctly evaluate encrypted circuits
- **Smart Contract Logic** — must correctly implement the no-loss invariant and draw mechanics

### Security Properties
- **Deposit Privacy**: Individual deposit amounts are never revealed on-chain
- **Balance Privacy**: Only the account owner can decrypt their balance (via EIP-712 signed grant)
- **Winner Anonymity**: The draw uses `FHE.select` across all participants — no on-chain signal reveals who won
- **No-Loss Guarantee**: Withdrawal is clamped to balance under FHE; over-withdrawal returns zero
- **Fairness**: Draw ticket is uniform random via on-chain FHE CSPRNG (`FHE.randEuint64()`)

### Known Limitations
- **Aggregate TVL disclosure**: The total pool size is revealed at draw time (required for the modular arithmetic)
- **Participant list is public**: Addresses in the pool are visible (but balances are not)
- **Gas-based timing attacks**: An observer could correlate transaction timing with deposits (mitigated by batching in future versions)
- **Participant count scaling**: The draw loop is O(n) in FHE operations; large participant sets may exceed block gas limits

### Attack Surface
| Vector | Mitigation |
|--------|------------|
| Reentrancy | `ReentrancyGuard` on all state-changing functions |
| Over-withdrawal | FHE clamping: `select(le(request, balance), request, 0)` |
| Draw manipulation | KMS-signed decryption proofs + on-chain CSPRNG |
| Front-running draws | Draw outcome is encrypted; no MEV advantage |
| Flash loan attacks | Deposits are locked during active draws |

## 🚨 Reporting a Vulnerability

If you discover a security vulnerability, please **DO NOT** open a public issue.

### Responsible Disclosure

1. **Email**: Send details to the repository owner via GitHub private communication
2. **Include**:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)
3. **Timeline**: We aim to acknowledge within 48 hours and provide a fix timeline within 7 days

### Scope

In scope:
- Smart contract logic bugs
- Privacy leaks (information revealed that shouldn't be)
- Cryptographic weaknesses
- Access control bypasses
- Frontend security issues (XSS, injection)

Out of scope:
- Zama KMS/Coprocessor vulnerabilities (report to [Zama](https://www.zama.ai/security))
- Social engineering attacks
- Denial of service via high gas costs (known limitation)
- Issues requiring compromised private keys

## 🏆 Recognition

We gratefully acknowledge security researchers who responsibly disclose vulnerabilities. Contributors will be credited in our security acknowledgments (with permission).

## 📚 Audit Status

| Audit | Status |
|-------|--------|
| Internal review | ✅ Complete |
| Formal verification | 🚧 Planned |
| External audit | 🚧 Planned for mainnet |

---

*This security policy follows best practices from the [Security README Standard](https://securityreadme.org/).*
