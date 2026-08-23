// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {FHE, euint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {ERC7984} from "@openzeppelin/confidential-contracts/token/ERC7984/ERC7984.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @title ConfidentialToken (cUSD)
/// @author zkasuran
/// @notice Demo ERC-7984 confidential fungible token used as both the deposit asset
///         and the prize asset for the Confidential Prize Savings pool. Every balance
///         is stored and transferred fully encrypted under Zama FHEVM.
/// @dev Ships an OPEN faucet `mint` so anyone can self-serve test funds on a public
///      testnet. That is deliberate for the demo and MUST NOT be used in production.
contract ConfidentialToken is ZamaEthereumConfig, ERC7984, Ownable2Step {
    /// @notice Upper bound per faucet call, in base units. Keeps encrypted values well
    ///         inside euint64 range and keeps demo pool totals easy to reason about.
    uint64 public constant MAX_FAUCET_MINT = 1_000_000_000000; // 1,000,000 cUSD at 6 decimals

    error FaucetAmountTooLarge(uint64 amount, uint64 max);

    constructor(
        string memory name_,
        string memory symbol_,
        string memory uri_
    ) ERC7984(name_, symbol_, uri_) Ownable(msg.sender) {}

    /// @notice ERC-7984 metadata: cUSD uses 6 decimals like common stablecoins.
    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Faucet mint (testnet/demo only). The plaintext `amount` is only the
    ///         mint instruction; the resulting balance is held and moved encrypted.
    /// @param to recipient of the freshly minted test tokens
    /// @param amount plaintext base-unit amount to mint (capped by MAX_FAUCET_MINT)
    /// @return transferred the encrypted amount actually minted
    function mint(address to, uint64 amount) external returns (euint64 transferred) {
        if (amount > MAX_FAUCET_MINT) revert FaucetAmountTooLarge(amount, MAX_FAUCET_MINT);
        transferred = _mint(to, FHE.asEuint64(amount));
    }
}
