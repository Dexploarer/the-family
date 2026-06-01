import {
  createPublicClient,
  encodeFunctionData,
  http,
  keccak256,
  parseEventLogs,
  stringToBytes,
  type Address,
  type Hex,
  type PublicClient
} from "viem";
import { bsc, bscTestnet } from "viem/chains";
import { safeAbi, safeProxyFactoryAbi } from "../chain/abis.js";
import { type BscContractAddresses, NATIVE_TOKEN_ADDRESS } from "../chain/addresses.js";
import { AppError, UserInputError } from "../domain/errors.js";
import type { ChainTransaction } from "../domain/types.js";

export type CreateSafeInput = {
  owners: Address[];
  threshold: number;
};

export type SafeDeployment = {
  safeAddress: Address;
  transactionHash: Hex;
  threshold: number;
  owners: Address[];
};

export class SafeDeploymentService {
  readonly publicClient: PublicClient;
  private readonly chain;

  constructor(
    private readonly addresses: BscContractAddresses,
    rpcUrl: string,
    chainId: 56 | 97
  ) {
    this.chain = chainId === 56 ? bsc : bscTestnet;
    this.publicClient = createPublicClient({
      chain: this.chain,
      transport: http(rpcUrl)
    });
  }

  async getNativeBalanceWei(address: Address): Promise<bigint> {
    return this.publicClient.getBalance({ address });
  }

  async createSafe(_input: CreateSafeInput): Promise<SafeDeployment> {
    throw new UserInputError(
      "Safe deployment is owner-wallet only. Use /safe_group <threshold>, collect owners, then tap Deploy Safe to send createProxyWithNonce from your wallet."
    );
  }

  // Verify a Safe that an owner deployed from their own wallet. Re-derives the
  // exact calldata the bot would have built for this session and requires the
  // on-chain transaction to match it byte-for-byte and target the real factory,
  // so a tampered deploy (different owners/threshold) can never be linked.
  async verifyWalletDeployment(
    owners: Address[],
    threshold: number,
    saltNonce: bigint,
    transactionHash: Hex
  ): Promise<{ safeAddress: Address }> {
    const expected = this.buildDeploymentTransaction(owners, threshold, saltNonce);
    // The page posts the hash the instant the wallet returns it — before BSC mines
    // the block — so poll for the receipt instead of single-shot reads that would
    // throw on a perfectly good deploy.
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash: transactionHash, timeout: 60_000 });
    if (receipt.status !== "success") {
      throw new UserInputError("Deployment transaction failed on-chain");
    }
    const transaction = await this.publicClient.getTransaction({ hash: transactionHash });
    assertDeploymentMatches({
      actualTo: transaction.to,
      actualInput: transaction.input,
      expectedTo: expected.to,
      expectedData: expected.data
    });
    const events = parseEventLogs({ abi: safeProxyFactoryAbi, eventName: "ProxyCreation", logs: receipt.logs });
    const event = events.find((item) => item.address.toLowerCase() === this.addresses.safeProxyFactory.toLowerCase());
    if (event === undefined) {
      throw new AppError("Deployment transaction did not create a Safe proxy", { transactionHash });
    }
    return { safeAddress: event.args.proxy };
  }

  buildDeploymentTransaction(owners: Address[], threshold: number, saltNonce: bigint): ChainTransaction & { saltNonce: bigint } {
    assertSafeOwners(owners, threshold);
    const initializer = buildSafeInitializer(this.addresses.safeFallbackHandler, owners, threshold);
    return {
      to: this.addresses.safeProxyFactory,
      value: 0n,
      label: "Safe proxy deployment",
      data: encodeFunctionData({
        abi: safeProxyFactoryAbi,
        functionName: "createProxyWithNonce",
        args: [this.addresses.safeSingleton, initializer, saltNonce]
      }),
      saltNonce
    };
  }
}

// Deterministic salt per setup session so the deploy calldata is reproducible
// and verifiable without storing extra state.
export function saltNonceForSession(sessionId: string): bigint {
  return BigInt(keccak256(stringToBytes(sessionId)));
}

export function assertDeploymentMatches(params: {
  actualTo: string | null | undefined;
  actualInput: string;
  expectedTo: string;
  expectedData: string;
}): void {
  if ((params.actualTo ?? "").toLowerCase() !== params.expectedTo.toLowerCase()) {
    throw new UserInputError("Deployment transaction was not sent to the Safe proxy factory");
  }
  if (params.actualInput.toLowerCase() !== params.expectedData.toLowerCase()) {
    throw new UserInputError("Deployment transaction does not match the approved owners and threshold");
  }
}

export function buildSafeInitializer(fallbackHandler: Address, owners: Address[], threshold: number): Hex {
  assertSafeOwners(owners, threshold);
  return encodeFunctionData({
    abi: safeAbi,
    functionName: "setup",
    args: [owners, BigInt(threshold), NATIVE_TOKEN_ADDRESS, "0x", fallbackHandler, NATIVE_TOKEN_ADDRESS, 0n, NATIVE_TOKEN_ADDRESS]
  });
}

function assertSafeOwners(owners: Address[], threshold: number): void {
  if (owners.length === 0) {
    throw new UserInputError("Safe requires at least one owner");
  }
  if (!Number.isInteger(threshold) || threshold <= 0 || threshold > owners.length) {
    throw new UserInputError("Safe threshold must be between 1 and owner count", { threshold, owners: owners.length });
  }
  const uniqueOwners = new Set<string>();
  for (const owner of owners) {
    const normalized = owner.toLowerCase();
    if (owner === NATIVE_TOKEN_ADDRESS) {
      throw new UserInputError("Safe owner cannot be the zero address");
    }
    if (uniqueOwners.has(normalized)) {
      throw new UserInputError("Safe owners must be unique", { owner });
    }
    uniqueOwners.add(normalized);
  }
}
