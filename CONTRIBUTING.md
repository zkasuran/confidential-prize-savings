# Contributing to Confidential Prize Savings

Thank you for your interest in contributing! This project pushes the boundaries of privacy-preserving DeFi using Fully Homomorphic Encryption, and we welcome contributions of all kinds.

## 🚀 Getting Started

### Prerequisites

- **Node.js** 18+ (recommended: use [nvm](https://github.com/nvm-sh/nvm))
- **MetaMask** or any EIP-1193 compatible wallet
- **Sepolia ETH** for testnet transactions ([faucet](https://sepoliafaucet.com))

### Setup

```bash
# Clone the repository
git clone https://github.com/zkasuran/confidential-prize-savings.git
cd confidential-prize-savings

# Smart contracts
cd hardhat
npm install
npx hardhat test          # verify everything passes

# Frontend
cd ../frontend
npm install
npm run dev               # http://localhost:5173
```

## 📋 Development Workflow

### Branch Naming

| Prefix | Use |
|--------|-----|
| `feat/` | New features |
| `fix/` | Bug fixes |
| `docs/` | Documentation changes |
| `refactor/` | Code refactoring |
| `test/` | Adding or updating tests |
| `ci/` | CI/CD changes |

### Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add multi-token prize pool support
fix: clamp withdrawal to zero on overflow
docs: update architecture diagram
test: add edge case for empty draw
```

### Pull Request Process

1. **Fork** the repository
2. Create a feature branch from `main`
3. Make your changes with clear commits
4. Ensure all tests pass: `cd hardhat && npx hardhat test`
5. Ensure linting passes: `npm run lint`
6. Update documentation if needed
7. Open a PR with a clear description

## 🔧 Code Standards

### Solidity

- **Version**: 0.8.27+
- **Style**: Follow [Solidity Style Guide](https://docs.soliditylang.org/en/latest/style-guide.html)
- **NatSpec**: All public/external functions must have full NatSpec comments
- **Linting**: `npx solhint 'contracts/**/*.sol'`
- **Formatting**: `npx prettier --write 'contracts/**/*.sol'`
- **Security**: No external calls before state changes (CEI pattern)

### TypeScript / React

- **Strict mode** enabled (no `any` types)
- **Functional components** with hooks
- **Formatting**: Prettier with default config
- **No unused imports or variables** (enforced by tsconfig)

### Testing

- All new contract features must include tests
- Use the FHEVM mock coprocessor for testing
- Test both happy path and error cases
- Include conservation checks (total in = total out)

## 🏗️ Architecture

See [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) for detailed system architecture.

Key principles:
- **Minimal disclosure**: Only reveal aggregate TVL, nothing else
- **No-loss invariant**: `sum(balances) + prizePot == totalDeposited + totalSponsored`
- **CEI pattern**: Checks → Effects → Interactions in all state-changing functions
- **Encrypted-by-default**: Every value is encrypted unless there's a proven need to reveal it

## 🐛 Bug Reports

Please open an issue with:
- Clear description of the bug
- Steps to reproduce
- Expected vs actual behavior
- Environment details (network, wallet, browser)

## 💡 Feature Requests

Open an issue with the `enhancement` label. Include:
- Problem statement
- Proposed solution
- Privacy implications (how does this affect the encryption model?)

## 🔒 Security

See [SECURITY.md](./SECURITY.md) for our security policy and how to report vulnerabilities responsibly.

## 📜 License

By contributing, you agree that your contributions will be licensed under the [BSD-3-Clause-Clear](./LICENSE) license.

---

Thank you for helping build a more private DeFi! 🔐
