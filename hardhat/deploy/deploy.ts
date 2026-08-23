import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

/**
 * Deploys the confidential prize-savings stack:
 *   1. ConfidentialToken (cUSD) — the ERC-7984 confidential deposit/prize asset.
 *   2. ConfidentialPrizePool  — the no-loss prize pool over that asset.
 */
const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const token = await deploy("ConfidentialToken", {
    from: deployer,
    args: ["Confidential USD", "cUSD", "https://confidential-prize-savings.example/cusd.json"],
    log: true,
  });

  // 0s interval lets the demo draw immediately after depositing. Raise for production cadence.
  const DRAW_INTERVAL = 0;
  const pool = await deploy("ConfidentialPrizePool", {
    from: deployer,
    args: [token.address, DRAW_INTERVAL],
    log: true,
  });

  console.log(`ConfidentialToken:     ${token.address}`);
  console.log(`ConfidentialPrizePool: ${pool.address}`);
};

export default func;
func.id = "deploy_confidential_prize_pool";
func.tags = ["ConfidentialPrizePool"];
