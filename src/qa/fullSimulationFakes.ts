import type { Address, Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getBscContractAddresses } from "../chain/addresses.js";
import { SafeService, type SafeTransactionServiceStatus } from "../chain/safeService.js";
import type { SafeConfirmation } from "../chain/safeSignatures.js";
import type { ChainTransaction, SafeSubmission, SafeTransactionData } from "../domain/types.js";
import { UserInputError } from "../domain/errors.js";
import type {
  NativeDepositClient,
  NativeDepositReceipt,
  NativeDepositTransaction
} from "../services/depositVerificationService.js";
import { DepositVerificationService } from "../services/depositVerificationService.js";
import { PoolService } from "../services/poolService.js";
import { SafeDeploymentService, type CreateSafeInput, type SafeDeployment } from "../services/safeDeploymentService.js";
import { SafeSubmissionService } from "../services/safeSubmissionService.js";
import { WalletLinkService, buildWalletLinkMessage } from "../services/walletLinkService.js";
import { MemoryRepository } from "../storage/memoryRepository.js";
import { parseHex } from "../utils/evm.js";

const addresses = getBscContractAddresses(56);

export const simulationSafeAddress: Address = "0x9999999999999999999999999999999999999999";

export class SimulatedSafeDeploymentService extends SafeDeploymentService {
  constructor() {
    super(addresses, "https://sim.invalid", 56);
  }

  override async createSafe(input: CreateSafeInput): Promise<SafeDeployment> {
    this.buildDeploymentTransaction(input.owners, input.threshold, 1n);
    return {
      safeAddress: simulationSafeAddress,
      transactionHash: simulationHash(1),
      threshold: input.threshold,
      owners: input.owners
    };
  }
}

export class SimulatedSafeService extends SafeService {
  private readonly confirmations = new Map<Hex, SafeConfirmation[]>();
  private readonly signatureOwners = new Map<string, Address>();
  private nextHash = 100;
  private nextExecutionHash = 200;
  private nonce = 0n;

  constructor(private readonly threshold: number) {
    super(addresses, "https://sim.invalid", 56, "https://safe.sim");
  }

  override async prepareSafeTransaction(
    _safe: Address,
    transactions: ChainTransaction[]
  ): Promise<{ safeTransaction: SafeTransactionData; safeTxHash: Hex; transactionServiceUrl: string }> {
    const safeTransaction = SafeService.buildSafeTransactionData(transactions, this.nonce, addresses.multiSendCallOnly);
    this.nonce += 1n;
    return {
      safeTransaction,
      safeTxHash: simulationHash(this.nextHash++),
      transactionServiceUrl: "https://safe.sim"
    };
  }

  override async normalizeOwnerSignature(safeTxHash: Hex, ownerAddress: Address, signature: Hex): Promise<Hex> {
    this.signatureOwners.set(this.signatureKey(safeTxHash, signature), ownerAddress);
    return signature;
  }

  override async proposeTransaction(input: {
    serviceUrl: string;
    safeAddress: Address;
    safeTxHash: Hex;
    safeTransaction: SafeTransactionData;
    senderAddress: Address;
    senderSignature: Hex;
  }): Promise<void> {
    const owner = this.requireSignatureOwner(input.safeTxHash, input.senderSignature);
    if (owner.toLowerCase() !== input.senderAddress.toLowerCase()) {
      throw new UserInputError("Simulated Safe proposer signature does not match sender", {
        senderAddress: input.senderAddress,
        owner
      });
    }
    this.confirmations.set(input.safeTxHash, [{ owner: input.senderAddress, signature: input.senderSignature }]);
  }

  override async confirmTransaction(input: { serviceUrl: string; safeTxHash: Hex; senderSignature: Hex }): Promise<void> {
    const confirmations = this.confirmations.get(input.safeTxHash);
    if (confirmations === undefined) {
      throw new UserInputError("Simulated Safe transaction must be proposed before confirmation");
    }
    const owner = this.requireSignatureOwner(input.safeTxHash, input.senderSignature);
    if (confirmations.some((confirmation) => confirmation.owner.toLowerCase() === owner.toLowerCase())) {
      throw new UserInputError("Simulated Safe owner already confirmed", { owner });
    }
    confirmations.push({
      owner,
      signature: input.senderSignature
    });
  }

  override async getTransaction(_serviceUrl: string, safeTxHash: Hex): Promise<SafeTransactionServiceStatus> {
    const confirmations = this.confirmations.get(safeTxHash);
    if (confirmations === undefined) {
      return { confirmations: [] };
    }
    return { confirmations };
  }

  override async executeTransaction(
    _safeAddress: Address,
    _safeTransaction: SafeTransactionData,
    confirmations: SafeConfirmation[]
  ): Promise<Hex> {
    if (confirmations.length < this.threshold) {
      throw new UserInputError("Simulated Safe threshold is not met", {
        threshold: this.threshold,
        confirmations: confirmations.length
      });
    }
    return simulationHash(this.nextExecutionHash++);
  }

  confirmationCount(safeTxHash: Hex): number {
    const confirmations = this.confirmations.get(safeTxHash);
    if (confirmations === undefined) {
      return 0;
    }
    return confirmations.length;
  }

  confirmationOwners(safeTxHash: Hex): Address[] {
    const confirmations = this.confirmations.get(safeTxHash);
    if (confirmations === undefined) {
      return [];
    }
    return confirmations.map((confirmation) => confirmation.owner);
  }

  private requireSignatureOwner(safeTxHash: Hex, signature: Hex): Address {
    const owner = this.signatureOwners.get(this.signatureKey(safeTxHash, signature));
    if (owner === undefined) {
      throw new UserInputError("Simulated Safe signature was not normalized");
    }
    return owner;
  }

  private signatureKey(safeTxHash: Hex, signature: Hex): string {
    return `${safeTxHash}:${signature}`;
  }
}

export class SimulatedDepositClient implements NativeDepositClient {
  private readonly transactions = new Map<Hex, NativeDepositTransaction>();
  private readonly receipts = new Map<Hex, NativeDepositReceipt>();

  addDeposit(input: { transactionHash: Hex; from: Address; to: Address; value: bigint; status: "success" | "reverted" }): void {
    this.transactions.set(input.transactionHash, {
      from: input.from,
      to: input.to,
      value: input.value
    });
    this.receipts.set(input.transactionHash, { status: input.status });
  }

  async getTransaction(input: { hash: Hex }): Promise<NativeDepositTransaction> {
    const transaction = this.transactions.get(input.hash);
    if (transaction === undefined) {
      throw new UserInputError("Simulated deposit transaction not found", { transactionHash: input.hash });
    }
    return transaction;
  }

  async getTransactionReceipt(input: { hash: Hex }): Promise<NativeDepositReceipt> {
    const receipt = this.receipts.get(input.hash);
    if (receipt === undefined) {
      throw new UserInputError("Simulated deposit receipt not found", { transactionHash: input.hash });
    }
    return receipt;
  }
}

export async function verifyAndCreditDeposit(input: {
  chatId: string;
  depositClient: SimulatedDepositClient;
  depositVerificationService: DepositVerificationService;
  poolService: PoolService;
  telegramUserId: string;
  sender: Address;
  amountWei: bigint;
  transactionHash: Hex;
}): Promise<void> {
  input.depositClient.addDeposit({
    transactionHash: input.transactionHash,
    from: input.sender,
    to: simulationSafeAddress,
    value: input.amountWei,
    status: "success"
  });
  await input.depositVerificationService.verifyNativeDeposit({
    transactionHash: input.transactionHash,
    safeAddress: simulationSafeAddress,
    amountWei: input.amountWei,
    allowedSenders: [input.sender]
  });
  await input.poolService.creditDeposit({
    chatId: input.chatId,
    telegramUserId: input.telegramUserId,
    amountWei: input.amountWei,
    transactionHash: input.transactionHash
  });
}

export type SimulationWallet = {
  telegramUserId: string;
  address: Address;
  privateKey: Hex;
};

export async function createSimulationWallet(
  walletLinkService: WalletLinkService,
  telegramUserId: string,
  privateKeyIndex: number
): Promise<SimulationWallet> {
  const privateKey = simulationPrivateKey(privateKeyIndex);
  const account = privateKeyToAccount(privateKey);
  // Exercise the real non-custodial linking proof path: begin, sign with the
  // owner's own key, then complete. BNancy never sees the private key.
  const { link } = await walletLinkService.beginLink(telegramUserId, account.address);
  const signature = await account.signMessage({ message: buildWalletLinkMessage(link) });
  await walletLinkService.completeLink(telegramUserId, account.address, signature);
  return { telegramUserId, address: account.address, privateKey };
}

export async function submitOwnerSignature(
  safeSubmissionService: SafeSubmissionService,
  submission: SafeSubmission,
  wallet: SimulationWallet
): Promise<void> {
  const account = privateKeyToAccount(wallet.privateKey);
  const signature = await account.signMessage({ message: { raw: submission.safeTxHash } });
  await safeSubmissionService.submitOwnerSignature(submission.id, wallet.address, signature, wallet.telegramUserId);
}

export async function expectFailure<T>(action: Promise<T>): Promise<boolean> {
  try {
    await action;
    return false;
  } catch {
    return true;
  }
}

export function simulationHash(index: number): Hex {
  return parseHex(`0x${index.toString(16).padStart(64, "0")}`, "simulation hash");
}

function simulationPrivateKey(index: number): Hex {
  return parseHex(`0x${index.toString(16).padStart(64, "0")}`, "simulation private key");
}
