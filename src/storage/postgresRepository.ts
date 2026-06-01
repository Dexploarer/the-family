import { Pool } from "pg";
import { buildPgPoolConfig } from "./pgPoolConfig.js";
import type {
  AdminSession,
  AdminUser,
  ChatId,
  FlapLaunchProposal,
  GroupWallet,
  PendingPrompt,
  SafeCreationSession,
  SafeSubmission,
  TradeProposal,
  UsageEvent,
  WalletLink
} from "../domain/types.js";
import type { Repository } from "./repository.js";
import {
  deserializeRiskReport,
  deserializeSafeTransaction,
  deserializeTransactions,
  serializeRiskReport,
  serializeSafeTransaction,
  serializeTransactions
} from "./postgresSerialization.js";
import type {
  FlapLaunchRow,
  GroupWalletRow,
  PendingPromptRow,
  SafeCreationSessionRow,
  SafeSubmissionRow,
  TradeProposalRow,
  WalletLinkRow
} from "./postgresRows.js";

type GroupSettingsRow = { languages: string };

export class PostgresRepository implements Repository {
  private readonly pool: Pool;

  constructor(databaseUrl: string) {
    this.pool = new Pool(buildPgPoolConfig(databaseUrl));
  }

  async getGroupWallet(chatId: ChatId): Promise<GroupWallet | null> {
    const result = await this.pool.query<GroupWalletRow>(
      "select chat_id, safe_address, threshold, owners, created_at from group_wallets where chat_id = $1",
      [chatId]
    );
    const row = result.rows[0];
    if (row === undefined) {
      return null;
    }
    return {
      chatId: row.chat_id,
      safeAddress: row.safe_address,
      threshold: row.threshold,
      owners: row.owners,
      createdAt: row.created_at
    };
  }

  async listGroupWallets(): Promise<GroupWallet[]> {
    const result = await this.pool.query<GroupWalletRow>(
      "select chat_id, safe_address, threshold, owners, created_at from group_wallets"
    );
    return result.rows.map((row) => ({
      chatId: row.chat_id,
      safeAddress: row.safe_address,
      threshold: row.threshold,
      owners: row.owners,
      createdAt: row.created_at
    }));
  }

  async saveGroupWallet(wallet: GroupWallet): Promise<void> {
    await this.pool.query(
      `insert into group_wallets(chat_id, safe_address, threshold, owners, created_at)
       values ($1, $2, $3, $4, $5)
       on conflict (chat_id)
       do update set safe_address = excluded.safe_address, threshold = excluded.threshold, owners = excluded.owners`,
      [wallet.chatId, wallet.safeAddress, wallet.threshold, JSON.stringify(wallet.owners), wallet.createdAt]
    );
  }

  async deleteGroupWallet(chatId: ChatId): Promise<void> {
    await this.pool.query("delete from group_wallets where chat_id = $1", [chatId]);
  }

  async getPendingPrompt(chatId: ChatId, telegramUserId: string): Promise<PendingPrompt | null> {
    const result = await this.pool.query<PendingPromptRow>(
      `select chat_id, telegram_user_id, command, collected, created_at, updated_at
       from pending_prompts where chat_id = $1 and telegram_user_id = $2`,
      [chatId, telegramUserId]
    );
    const row = result.rows[0];
    if (row === undefined) {
      return null;
    }
    return {
      chatId: row.chat_id,
      telegramUserId: row.telegram_user_id,
      command: row.command,
      collected: row.collected,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  async savePendingPrompt(prompt: PendingPrompt): Promise<void> {
    await this.pool.query(
      `insert into pending_prompts(chat_id, telegram_user_id, command, collected, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (chat_id, telegram_user_id)
       do update set command = excluded.command, collected = excluded.collected, updated_at = excluded.updated_at`,
      [prompt.chatId, prompt.telegramUserId, prompt.command, JSON.stringify(prompt.collected), prompt.createdAt, prompt.updatedAt]
    );
  }

  async deletePendingPrompt(chatId: ChatId, telegramUserId: string): Promise<void> {
    await this.pool.query("delete from pending_prompts where chat_id = $1 and telegram_user_id = $2", [chatId, telegramUserId]);
  }

  async getWalletLink(telegramUserId: string, address: string): Promise<WalletLink | null> {
    const result = await this.pool.query<WalletLinkRow>(
      `select telegram_user_id, address, nonce, status, created_at, linked_at
       from wallet_links where telegram_user_id = $1 and lower(address) = lower($2)`,
      [telegramUserId, address]
    );
    const row = result.rows[0];
    if (row === undefined) {
      return null;
    }
    return {
      telegramUserId: row.telegram_user_id,
      address: row.address,
      nonce: row.nonce,
      status: row.status,
      createdAt: row.created_at,
      ...(row.linked_at === null ? {} : { linkedAt: row.linked_at })
    };
  }

  async saveWalletLink(link: WalletLink): Promise<void> {
    await this.pool.query(
      `insert into wallet_links(telegram_user_id, address, nonce, status, created_at, linked_at)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (telegram_user_id, address)
       do update set nonce = excluded.nonce, status = excluded.status, linked_at = excluded.linked_at`,
      [link.telegramUserId, link.address, link.nonce, link.status, link.createdAt, link.linkedAt ?? null]
    );
  }

  async getWalletLinkByNonce(nonce: string): Promise<WalletLink | null> {
    const result = await this.pool.query<WalletLinkRow>(
      `select telegram_user_id, address, nonce, status, created_at, linked_at
       from wallet_links where nonce = $1`,
      [nonce]
    );
    const row = result.rows[0];
    if (row === undefined) {
      return null;
    }
    return {
      telegramUserId: row.telegram_user_id,
      address: row.address,
      nonce: row.nonce,
      status: row.status,
      createdAt: row.created_at,
      ...(row.linked_at === null ? {} : { linkedAt: row.linked_at })
    };
  }

  async getLinkedWalletsByTelegramUserId(telegramUserId: string): Promise<WalletLink[]> {
    const result = await this.pool.query<WalletLinkRow>(
      `select telegram_user_id, address, nonce, status, created_at, linked_at
       from wallet_links where telegram_user_id = $1 and status = 'linked'`,
      [telegramUserId]
    );
    return result.rows.map((row) => ({
      telegramUserId: row.telegram_user_id,
      address: row.address,
      nonce: row.nonce,
      status: row.status,
      createdAt: row.created_at,
      ...(row.linked_at === null ? {} : { linkedAt: row.linked_at })
    }));
  }

  async getLinkedWalletsByAddress(address: string): Promise<WalletLink[]> {
    const result = await this.pool.query<WalletLinkRow>(
      `select telegram_user_id, address, nonce, status, created_at, linked_at
       from wallet_links where lower(address) = lower($1) and status = 'linked'`,
      [address]
    );
    return result.rows.map((row) => ({
      telegramUserId: row.telegram_user_id,
      address: row.address,
      nonce: row.nonce,
      status: row.status,
      createdAt: row.created_at,
      ...(row.linked_at === null ? {} : { linkedAt: row.linked_at })
    }));
  }

  async getSafeCreationSession(id: string): Promise<SafeCreationSession | null> {
    const result = await this.pool.query<SafeCreationSessionRow>(
      `select id, chat_id, creator_telegram_id, threshold, owners, status,
       deployed_safe_address, deployment_tx_hash, created_at
       from safe_creation_sessions where id = $1`,
      [id]
    );
    const row = result.rows[0];
    if (row === undefined) {
      return null;
    }
    return {
      id: row.id,
      chatId: row.chat_id,
      creatorTelegramId: row.creator_telegram_id,
      threshold: row.threshold,
      owners: row.owners,
      status: row.status,
      createdAt: row.created_at,
      ...(row.deployed_safe_address === null ? {} : { deployedSafeAddress: row.deployed_safe_address }),
      ...(row.deployment_tx_hash === null ? {} : { deploymentTxHash: row.deployment_tx_hash })
    };
  }

  async saveSafeCreationSession(session: SafeCreationSession): Promise<void> {
    await this.pool.query(
      `insert into safe_creation_sessions(
        id, chat_id, creator_telegram_id, threshold, owners, status,
        deployed_safe_address, deployment_tx_hash, created_at
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      on conflict (id) do update set
        owners = excluded.owners,
        status = excluded.status,
        deployed_safe_address = excluded.deployed_safe_address,
        deployment_tx_hash = excluded.deployment_tx_hash`,
      [
        session.id,
        session.chatId,
        session.creatorTelegramId,
        session.threshold,
        JSON.stringify(session.owners),
        session.status,
        session.deployedSafeAddress ?? null,
        session.deploymentTxHash ?? null,
        session.createdAt
      ]
    );
  }

  async getTradeProposal(id: string): Promise<TradeProposal | null> {
    const result = await this.pool.query<TradeProposalRow>(
      `select id, chat_id, proposer_telegram_id, token_address, input_amount_wei, min_output_amount,
       fee_amount_wei, route, status, risk_report, transactions, created_at
       from trade_proposals where id = $1`,
      [id]
    );
    const row = result.rows[0];
    if (row === undefined) {
      return null;
    }
    return {
      id: row.id,
      chatId: row.chat_id,
      proposerTelegramId: row.proposer_telegram_id,
      tokenAddress: row.token_address,
      inputAmountWei: BigInt(row.input_amount_wei),
      minOutputAmount: BigInt(row.min_output_amount),
      feeAmountWei: BigInt(row.fee_amount_wei),
      route: row.route,
      status: row.status,
      riskReport: deserializeRiskReport(row.risk_report),
      transactions: deserializeTransactions(row.transactions),
      createdAt: row.created_at
    };
  }

  async saveTradeProposal(proposal: TradeProposal): Promise<void> {
    await this.pool.query(
      `insert into trade_proposals(
        id, chat_id, proposer_telegram_id, token_address, input_amount_wei, min_output_amount,
        fee_amount_wei, route, status, risk_report, transactions, created_at
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        proposal.id,
        proposal.chatId,
        proposal.proposerTelegramId,
        proposal.tokenAddress,
        proposal.inputAmountWei.toString(),
        proposal.minOutputAmount.toString(),
        proposal.feeAmountWei.toString(),
        proposal.route,
        proposal.status,
        JSON.stringify(serializeRiskReport(proposal.riskReport)),
        JSON.stringify(serializeTransactions(proposal.transactions)),
        proposal.createdAt
      ]
    );
  }

  async getFlapLaunch(id: string): Promise<FlapLaunchProposal | null> {
    const result = await this.pool.query<FlapLaunchRow>(
      `select id, chat_id, proposer_telegram_id, name, symbol, metadata_uri, buy_tax_bps,
       sell_tax_bps, tax_duration_seconds, initial_buy_wei, recipients, salt, transactions, created_at
       from flap_launches where id = $1`,
      [id]
    );
    const row = result.rows[0];
    if (row === undefined) {
      return null;
    }
    return {
      id: row.id,
      chatId: row.chat_id,
      proposerTelegramId: row.proposer_telegram_id,
      name: row.name,
      symbol: row.symbol,
      metadataUri: row.metadata_uri,
      buyTaxBps: row.buy_tax_bps,
      sellTaxBps: row.sell_tax_bps,
      taxDurationSeconds: row.tax_duration_seconds,
      initialBuyWei: BigInt(row.initial_buy_wei),
      recipients: row.recipients,
      salt: row.salt,
      transactions: deserializeTransactions(row.transactions),
      createdAt: row.created_at
    };
  }

  async saveFlapLaunch(proposal: FlapLaunchProposal): Promise<void> {
    await this.pool.query(
      `insert into flap_launches(
        id, chat_id, proposer_telegram_id, name, symbol, metadata_uri, buy_tax_bps,
        sell_tax_bps, tax_duration_seconds, initial_buy_wei, recipients, salt, transactions, created_at
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        proposal.id,
        proposal.chatId,
        proposal.proposerTelegramId,
        proposal.name,
        proposal.symbol,
        proposal.metadataUri,
        proposal.buyTaxBps,
        proposal.sellTaxBps,
        proposal.taxDurationSeconds,
        proposal.initialBuyWei.toString(),
        JSON.stringify(proposal.recipients),
        proposal.salt,
        JSON.stringify(serializeTransactions(proposal.transactions)),
        proposal.createdAt
      ]
    );
  }

  async getSafeSubmission(id: string): Promise<SafeSubmission | null> {
    const result = await this.pool.query<SafeSubmissionRow>(
      `select id, chat_id, source_type, source_id, safe_address, safe_tx_hash, safe_transaction,
       transaction_service_url, status, sender_address, submitted_at, created_at
       from safe_submissions where id = $1`,
      [id]
    );
    const row = result.rows[0];
    if (row === undefined) {
      return null;
    }
    return {
      id: row.id,
      chatId: row.chat_id,
      sourceType: row.source_type,
      sourceId: row.source_id,
      safeAddress: row.safe_address,
      safeTxHash: row.safe_tx_hash,
      safeTransaction: deserializeSafeTransaction(row.safe_transaction),
      transactionServiceUrl: row.transaction_service_url,
      status: row.status,
      ...(row.sender_address === null ? {} : { senderAddress: row.sender_address }),
      ...(row.submitted_at === null ? {} : { submittedAt: row.submitted_at }),
      createdAt: row.created_at
    };
  }

  async saveSafeSubmission(submission: SafeSubmission): Promise<void> {
    await this.pool.query(
      `insert into safe_submissions(
        id, chat_id, source_type, source_id, safe_address, safe_tx_hash, safe_transaction,
        transaction_service_url, status, sender_address, submitted_at, created_at
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      on conflict (id) do update set
        safe_tx_hash = excluded.safe_tx_hash,
        safe_transaction = excluded.safe_transaction,
        transaction_service_url = excluded.transaction_service_url,
        status = excluded.status,
        sender_address = excluded.sender_address,
        submitted_at = excluded.submitted_at`,
      [
        submission.id,
        submission.chatId,
        submission.sourceType,
        submission.sourceId,
        submission.safeAddress,
        submission.safeTxHash,
        JSON.stringify(serializeSafeTransaction(submission.safeTransaction)),
        submission.transactionServiceUrl,
        submission.status,
        submission.senderAddress ?? null,
        submission.submittedAt ?? null,
        submission.createdAt
      ]
    );
  }

  async saveUsageEvent(event: UsageEvent): Promise<void> {
    try {
      await this.pool.query(
        "insert into usage_events(id, command, telegram_user_id, chat_id, created_at) values ($1, $2, $3, $4, $5)",
        [event.id, event.command, event.telegramUserId, event.chatId ?? null, event.createdAt]
      );
    } catch {
      await this.pool.query(
        "insert into usage_events(id, command, telegram_user_id, created_at) values ($1, $2, $3, $4)",
        [event.id, event.command, event.telegramUserId, event.createdAt]
      );
    }
  }

  async listUsageEventsSince(since: Date): Promise<UsageEvent[]> {
    return this.listUsageEvents({ since });
  }

  async listUsageEvents(options?: { since?: Date; chatId?: ChatId; limit?: number }): Promise<UsageEvent[]> {
    const limit = options?.limit ?? 200;
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (options?.since !== undefined) {
      params.push(options.since);
      clauses.push(`created_at >= $${params.length}`);
    }
    if (options?.chatId !== undefined) {
      params.push(options.chatId);
      clauses.push(`chat_id = $${params.length}`);
    }
    params.push(limit);
    const where = clauses.length > 0 ? `where ${clauses.join(" and ")}` : "";
    const sql = `select id, command, telegram_user_id, chat_id, created_at from usage_events ${where} order by created_at desc limit $${params.length}`;
    try {
      const result = await this.pool.query<{
        id: string;
        command: string;
        telegram_user_id: string;
        chat_id: string | null;
        created_at: Date;
      }>(sql, params);
      return result.rows.map((row) => ({
        id: row.id,
        command: row.command,
        telegramUserId: row.telegram_user_id,
        createdAt: row.created_at,
        ...(row.chat_id === null ? {} : { chatId: row.chat_id })
      }));
    } catch {
      if (options?.chatId !== undefined) {
        return [];
      }
      const fallbackParams = params.filter((_, index) => index !== params.length - 1 || typeof params[index] === "number");
      const sinceOnly = options?.since !== undefined ? "where created_at >= $1" : "";
      const fallbackLimit = limit;
      const result = await this.pool.query<{ id: string; command: string; telegram_user_id: string; created_at: Date }>(
        `select id, command, telegram_user_id, created_at from usage_events ${sinceOnly} order by created_at desc limit $${sinceOnly ? 2 : 1}`,
        options?.since !== undefined ? [options.since, fallbackLimit] : [fallbackLimit]
      );
      return result.rows.map((row) => ({
        id: row.id,
        command: row.command,
        telegramUserId: row.telegram_user_id,
        createdAt: row.created_at
      }));
    }
  }

  async getPlatformSetting(key: string): Promise<string | null> {
    try {
      const result = await this.pool.query<{ value: string }>("select value from platform_settings where key = $1", [key]);
      return result.rows[0]?.value ?? null;
    } catch {
      return null;
    }
  }

  async setPlatformSetting(key: string, value: string): Promise<void> {
    await this.pool.query(
      "insert into platform_settings(key, value, updated_at) values ($1, $2, now()) on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at",
      [key, value]
    );
  }

  async deletePlatformSetting(key: string): Promise<void> {
    await this.pool.query("delete from platform_settings where key = $1", [key]);
  }

  async listPlatformSettings(): Promise<Record<string, string>> {
    try {
      const result = await this.pool.query<{ key: string; value: string }>("select key, value from platform_settings");
      return Object.fromEntries(result.rows.map((row) => [row.key, row.value]));
    } catch {
      return {};
    }
  }

  async getGroupLanguages(chatId: ChatId): Promise<string[] | null> {
    try {
      const result = await this.pool.query<GroupSettingsRow>(
        "select languages from group_settings where chat_id = $1",
        [chatId]
      );
      const row = result.rows[0];
      if (row === undefined) {
        return null;
      }
      return row.languages.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
    } catch {
      return null; // table may not exist yet (migration pending) -> caller defaults to English
    }
  }

  async setGroupLanguages(chatId: ChatId, languages: string[]): Promise<void> {
    await this.pool.query(
      "insert into group_settings(chat_id, languages, updated_at) values ($1, $2, now()) on conflict (chat_id) do update set languages = excluded.languages, updated_at = excluded.updated_at",
      [chatId, languages.join(",")]
    );
  }

  async countAdminUsers(): Promise<number> {
    try {
      const result = await this.pool.query<{ count: string }>("select count(*)::text as count from admin_users");
      return Number(result.rows[0]?.count ?? "0");
    } catch {
      return 0;
    }
  }

  async getAdminUserByEmail(email: string): Promise<AdminUser | null> {
    try {
      const result = await this.pool.query<AdminUserRow>(
        "select id, email, password_hash, role, created_at, updated_at, last_login_at from admin_users where lower(email) = lower($1)",
        [email.trim()]
      );
      const row = result.rows[0];
      return row === undefined ? null : deserializeAdminUser(row);
    } catch {
      return null;
    }
  }

  async getAdminUserById(id: string): Promise<AdminUser | null> {
    try {
      const result = await this.pool.query<AdminUserRow>(
        "select id, email, password_hash, role, created_at, updated_at, last_login_at from admin_users where id = $1",
        [id]
      );
      const row = result.rows[0];
      return row === undefined ? null : deserializeAdminUser(row);
    } catch {
      return null;
    }
  }

  async listAdminUsers(): Promise<AdminUser[]> {
    try {
      const result = await this.pool.query<AdminUserRow>(
        "select id, email, password_hash, role, created_at, updated_at, last_login_at from admin_users order by email asc"
      );
      return result.rows.map(deserializeAdminUser);
    } catch {
      return [];
    }
  }

  async saveAdminUser(user: AdminUser): Promise<void> {
    await this.pool.query(
      `insert into admin_users(id, email, password_hash, role, created_at, updated_at, last_login_at)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (id) do update set
         email = excluded.email,
         password_hash = excluded.password_hash,
         role = excluded.role,
         updated_at = excluded.updated_at,
         last_login_at = excluded.last_login_at`,
      [
        user.id,
        user.email,
        user.passwordHash,
        user.role,
        user.createdAt,
        user.updatedAt,
        user.lastLoginAt
      ]
    );
  }

  async deleteAdminUser(id: string): Promise<void> {
    await this.pool.query("delete from admin_users where id = $1", [id]);
  }

  async getAdminSession(id: string): Promise<AdminSession | null> {
    try {
      const result = await this.pool.query<AdminSessionRow>(
        "select id, user_id, expires_at, created_at from admin_sessions where id = $1",
        [id]
      );
      const row = result.rows[0];
      return row === undefined ? null : deserializeAdminSession(row);
    } catch {
      return null;
    }
  }

  async saveAdminSession(session: AdminSession): Promise<void> {
    await this.pool.query(
      "insert into admin_sessions(id, user_id, expires_at, created_at) values ($1, $2, $3, $4) on conflict (id) do update set expires_at = excluded.expires_at",
      [session.id, session.userId, session.expiresAt, session.createdAt]
    );
  }

  async deleteAdminSession(id: string): Promise<void> {
    await this.pool.query("delete from admin_sessions where id = $1", [id]);
  }

  async deleteExpiredAdminSessions(now: Date): Promise<void> {
    await this.pool.query("delete from admin_sessions where expires_at <= $1", [now]);
  }
}

type AdminUserRow = {
  id: string;
  email: string;
  password_hash: string | null;
  role: "super_admin" | "admin";
  created_at: Date;
  updated_at: Date;
  last_login_at: Date | null;
};

type AdminSessionRow = {
  id: string;
  user_id: string;
  expires_at: Date;
  created_at: Date;
};

function deserializeAdminUser(row: AdminUserRow): AdminUser {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastLoginAt: row.last_login_at
  };
}

function deserializeAdminSession(row: AdminSessionRow): AdminSession {
  return {
    id: row.id,
    userId: row.user_id,
    expiresAt: row.expires_at,
    createdAt: row.created_at
  };
}
