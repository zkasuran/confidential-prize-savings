import { FhevmType } from "@fhevm/hardhat-plugin";
import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

/**
 * CLI helpers for the Confidential Prize Savings pool.
 *
 * Local demo:
 *   npx hardhat node
 *   npx hardhat --network localhost deploy
 *   npx hardhat --network localhost task:pool-info
 *   npx hardhat --network localhost task:faucet --amount 100000000        # 100 cUSD (6 dp)
 *   npx hardhat --network localhost task:operator                          # approve the pool
 *   npx hardhat --network localhost task:deposit --amount 100000000
 *   npx hardhat --network localhost task:balance                           # user-decrypt your balance
 */

task("task:pool-info", "Prints the public state of the pool").setAction(async function (_a: TaskArguments, hre) {
  const { ethers, deployments } = hre;
  const pool = await ethers.getContractAt(
    "ConfidentialPrizePool",
    (await deployments.get("ConfidentialPrizePool")).address,
  );
  const token = await deployments.get("ConfidentialToken");
  console.log(`ConfidentialToken:     ${token.address}`);
  console.log(`ConfidentialPrizePool: ${await pool.getAddress()}`);
  console.log(`asset:                 ${await pool.asset()}`);
  console.log(`drawState:             ${await pool.drawState()} (0=Idle,1=AwaitingTotal)`);
  console.log(`currentRound:          ${await pool.currentRound()}`);
  console.log(`participants:          ${await pool.participantCount()}`);
  console.log(`lastRevealedTotal:     ${await pool.lastRevealedTotal()}`);
});

task("task:faucet", "Mints test cUSD to the caller")
  .addParam("amount", "Plaintext base-unit amount to mint (6 decimals)")
  .setAction(async function (args: TaskArguments, hre) {
    const { ethers, deployments } = hre;
    const signer = (await ethers.getSigners())[0];
    const token = await ethers.getContractAt("ConfidentialToken", (await deployments.get("ConfidentialToken")).address);
    const tx = await token.connect(signer).mint(signer.address, BigInt(args.amount));
    await tx.wait();
    console.log(`Minted ${args.amount} base units to ${signer.address}`);
  });

task("task:operator", "Approves the pool as an ERC-7984 operator for the caller")
  .addOptionalParam("until", "Unix timestamp the approval is valid until (default: +1 year)")
  .setAction(async function (args: TaskArguments, hre) {
    const { ethers, deployments } = hre;
    const signer = (await ethers.getSigners())[0];
    const token = await ethers.getContractAt("ConfidentialToken", (await deployments.get("ConfidentialToken")).address);
    const poolAddress = (await deployments.get("ConfidentialPrizePool")).address;
    const until = args.until ? Number(args.until) : Math.floor(Date.now() / 1000) + 365 * 24 * 3600;
    const tx = await token.connect(signer).setOperator(poolAddress, until);
    await tx.wait();
    console.log(`Approved pool ${poolAddress} as operator until ${until}`);
  });

task("task:deposit", "Deposits an encrypted amount into the pool")
  .addParam("amount", "Plaintext base-unit amount to deposit")
  .setAction(async function (args: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;
    await fhevm.initializeCLIApi();
    const signer = (await ethers.getSigners())[0];
    const poolAddress = (await deployments.get("ConfidentialPrizePool")).address;
    const pool = await ethers.getContractAt("ConfidentialPrizePool", poolAddress);
    const enc = await fhevm.createEncryptedInput(poolAddress, signer.address).add64(BigInt(args.amount)).encrypt();
    const tx = await pool.connect(signer).deposit(enc.handles[0], enc.inputProof);
    await tx.wait();
    console.log(`Deposited ${args.amount} base units (encrypted) from ${signer.address}`);
  });

task("task:balance", "User-decrypts the caller's own encrypted deposit balance").setAction(async function (
  _a: TaskArguments,
  hre,
) {
  const { ethers, deployments, fhevm } = hre;
  await fhevm.initializeCLIApi();
  const signer = (await ethers.getSigners())[0];
  const poolAddress = (await deployments.get("ConfidentialPrizePool")).address;
  const pool = await ethers.getContractAt("ConfidentialPrizePool", poolAddress);
  const handle = await pool.confidentialBalanceOf(signer.address);
  if (handle === ethers.ZeroHash) {
    console.log("balance: 0 (no deposit)");
    return;
  }
  const clear = await fhevm.userDecryptEuint(FhevmType.euint64, handle, poolAddress, signer);
  console.log(`balance: ${clear} base units`);
});
