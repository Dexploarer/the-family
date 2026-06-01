import { randomBytes } from "node:crypto";
import { verifyMessage, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { UserInputError } from "../domain/errors.js";
import type { WalletLink } from "../domain/types.js";
import type { Repository } from "../storage/repository.js";

export type GeneratedWallet = {
  link: WalletLink;
  privateKey: Hex;
};

export class WalletLinkService {
  constructor(private readonly repository: Repository) {}

  async generateLinkedWallet(telegramUserId: string): Promise<GeneratedWallet> {
    const privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);
    const now = new Date();
    const link: WalletLink = {
      telegramUserId,
      address: account.address,
      nonce: randomBytes(16).toString("hex"),
      status: "linked",
      createdAt: now,
      linkedAt: now
    };
    await this.repository.saveWalletLink(link);
    return { link, privateKey };
  }

  async beginLink(telegramUserId: string, address: Address): Promise<{ link: WalletLink; message: string }> {
    const link: WalletLink = {
      telegramUserId,
      address,
      nonce: randomBytes(16).toString("hex"),
      status: "pending",
      createdAt: new Date()
    };
    await this.repository.saveWalletLink(link);
    return {
      link,
      message: buildWalletLinkMessage(link)
    };
  }

  async getPendingLinkByNonce(nonce: string): Promise<WalletLink> {
    const link = await this.repository.getWalletLinkByNonce(nonce);
    if (link === null) {
      throw new UserInputError("This wallet-link request was not found. Start again with /link_start.");
    }
    return link;
  }

  async completeLinkByNonce(nonce: string, signature: Hex): Promise<WalletLink> {
    const link = await this.getPendingLinkByNonce(nonce);
    return this.completeLink(link.telegramUserId, link.address, signature);
  }

  async completeLink(telegramUserId: string, address: Address, signature: Hex): Promise<WalletLink> {
    const link = await this.repository.getWalletLink(telegramUserId, address);
    if (link === null) {
      throw new UserInputError("Start wallet linking before submitting a signature");
    }
    // One linked owner per address: otherwise the deposit watcher can't attribute a
    // transfer from this address to a single member unambiguously.
    const otherOwners = (await this.repository.getLinkedWalletsByAddress(address)).filter(
      (other) => other.telegramUserId !== telegramUserId
    );
    if (otherOwners.length > 0) {
      throw new UserInputError("That wallet is already linked to another Telegram account.");
    }
    const valid = await verifyMessage({
      address,
      message: buildWalletLinkMessage(link),
      signature
    });
    if (!valid) {
      throw new UserInputError("Wallet-link signature is invalid");
    }
    const linked: WalletLink = {
      ...link,
      status: "linked",
      linkedAt: new Date()
    };
    await this.repository.saveWalletLink(linked);
    return linked;
  }

  async requireLinkedOwner(telegramUserId: string, address: Address): Promise<void> {
    const link = await this.repository.getWalletLink(telegramUserId, address);
    if (link === null || link.status !== "linked") {
      throw new UserInputError("Link this owner wallet before using it for Safe signatures");
    }
  }

  async getLinkedWallets(telegramUserId: string): Promise<WalletLink[]> {
    return this.repository.getLinkedWalletsByTelegramUserId(telegramUserId);
  }
}

export function buildWalletLinkMessage(link: WalletLink): string {
  return [
    "BNancy wallet link",
    `Telegram user: ${link.telegramUserId}`,
    `Wallet: ${link.address}`,
    `Nonce: ${link.nonce}`
  ].join("\n");
}
