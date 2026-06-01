import type { Address, Hex } from "viem";
import { UserInputError } from "../domain/errors.js";
import type { ChatId, GroupWallet, SafeCreationSession } from "../domain/types.js";
import type { Repository } from "../storage/repository.js";
import { createId } from "../utils/ids.js";
import { WalletLinkService, type GeneratedWallet } from "./walletLinkService.js";
import { SafeDeploymentService, type SafeDeployment } from "./safeDeploymentService.js";

export type SafeGroupDeployment = {
  session: SafeCreationSession;
  wallet: GroupWallet;
  deployment: SafeDeployment;
};

export class SafeGroupSetupService {
  constructor(
    private readonly repository: Repository,
    private readonly safeDeploymentService: SafeDeploymentService,
    private readonly walletLinkService: WalletLinkService
  ) {}

  async createSession(chatId: ChatId, creatorTelegramId: string, threshold: number): Promise<SafeCreationSession> {
    if (!Number.isInteger(threshold) || threshold <= 0) {
      throw new UserInputError("Threshold must be positive");
    }
    const session: SafeCreationSession = {
      id: createId("setup"),
      chatId,
      creatorTelegramId,
      threshold,
      owners: [],
      status: "collecting",
      createdAt: new Date()
    };
    await this.repository.saveSafeCreationSession(session);
    return session;
  }

  async joinWithDefaultWallet(sessionId: string, telegramUserId: string): Promise<SafeCreationSession> {
    const linkedWallets = await this.repository.getLinkedWalletsByTelegramUserId(telegramUserId);
    if (linkedWallets.length === 0) {
      throw new UserInputError("Generate one with /wallet_generate (in a DM) or link one with /link_start.");
    }
    if (linkedWallets.length > 1) {
      throw new UserInputError(`Multiple linked wallets found. Use /safe_group_join ${sessionId} <ownerAddress>`);
    }
    const link = linkedWallets[0];
    if (link === undefined) {
      throw new UserInputError("Linked wallet not found");
    }
    return this.joinWithWallet(sessionId, telegramUserId, link.address);
  }

  async generateWalletAndJoin(sessionId: string, telegramUserId: string): Promise<{
    generated: GeneratedWallet;
    session: SafeCreationSession;
  }> {
    await this.getCollectingSession(sessionId);
    const generated = await this.walletLinkService.generateLinkedWallet(telegramUserId);
    const session = await this.joinWithWallet(sessionId, telegramUserId, generated.link.address);
    return { generated, session };
  }

  async joinWithWallet(sessionId: string, telegramUserId: string, ownerAddress: Address): Promise<SafeCreationSession> {
    const session = await this.getCollectingSession(sessionId);
    const link = await this.repository.getWalletLink(telegramUserId, ownerAddress);
    if (link === null || link.status !== "linked") {
      throw new UserInputError("That wallet is not linked to your Telegram account");
    }
    const normalizedOwner = ownerAddress.toLowerCase();
    const owners = session.owners.filter((owner) => owner.telegramUserId !== telegramUserId);
    if (owners.some((owner) => owner.address.toLowerCase() === normalizedOwner)) {
      throw new UserInputError("That owner wallet already joined this Safe setup");
    }
    const updated: SafeCreationSession = {
      ...session,
      owners: [...owners, { telegramUserId, address: ownerAddress, joinedAt: new Date() }]
    };
    await this.repository.saveSafeCreationSession(updated);
    return updated;
  }

  // Bot-key deploy path (tests/simulation only). Production uses wallet deploy +
  // verifyWalletDeployment → finalizeDeployment.
  async deploy(sessionId: string): Promise<SafeGroupDeployment> {
    const session = await this.getCollectingSession(sessionId);
    if (session.threshold > session.owners.length) {
      throw new UserInputError("Not enough joined owners for the requested threshold", {
        threshold: session.threshold,
        owners: session.owners.length
      });
    }
    const deployment = await this.safeDeploymentService.createSafe({
      owners: session.owners.map((owner) => owner.address),
      threshold: session.threshold
    });
    return this.finalizeDeployment(sessionId, deployment.safeAddress, deployment.transactionHash);
  }

  // Records an already-deployed Safe against the group and closes the session.
  // Used by the wallet deploy flow (verify on-chain, then finalize) and by tests
  // that inject a simulated SafeDeploymentService.
  async finalizeDeployment(sessionId: string, safeAddress: Address, transactionHash: Hex): Promise<SafeGroupDeployment> {
    const session = await this.getCollectingSession(sessionId);
    if (session.threshold > session.owners.length) {
      throw new UserInputError("Not enough joined owners for the requested threshold", {
        threshold: session.threshold,
        owners: session.owners.length
      });
    }
    const ownerAddresses = session.owners.map((owner) => owner.address);
    const wallet: GroupWallet = {
      chatId: session.chatId,
      safeAddress,
      threshold: session.threshold,
      owners: ownerAddresses,
      createdAt: new Date()
    };
    const updated: SafeCreationSession = {
      ...session,
      status: "deployed",
      deployedSafeAddress: safeAddress,
      deploymentTxHash: transactionHash
    };
    await this.repository.saveGroupWallet(wallet);
    await this.repository.saveSafeCreationSession(updated);
    return {
      session: updated,
      wallet,
      deployment: { safeAddress, transactionHash, threshold: session.threshold, owners: ownerAddresses }
    };
  }

  async cancelSession(sessionId: string): Promise<SafeCreationSession> {
    const session = await this.getCollectingSession(sessionId);
    const cancelled: SafeCreationSession = { ...session, status: "cancelled" };
    await this.repository.saveSafeCreationSession(cancelled);
    return cancelled;
  }

  async getSession(sessionId: string): Promise<SafeCreationSession> {
    const session = await this.repository.getSafeCreationSession(sessionId);
    if (session === null) {
      throw new UserInputError("Safe setup not found");
    }
    return session;
  }

  private async getCollectingSession(sessionId: string): Promise<SafeCreationSession> {
    const session = await this.getSession(sessionId);
    if (session.status !== "collecting") {
      throw new UserInputError("Safe setup is no longer collecting owners");
    }
    return session;
  }
}
