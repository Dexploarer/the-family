import type { GroupReport } from "./adminDashboardService.js";
import { formatBnb } from "../utils/evm.js";

export type AdminReportTable = {
  headers: string[];
  rows: string[][];
};

export type AdminReportSection = {
  title: string;
  stats?: Array<{ label: string; value: string }>;
  tables?: AdminReportTable[];
  note?: string;
};

export type AdminGroupReportView = {
  chatId: string;
  summary: AdminReportSection;
  pool: AdminReportSection | null;
  usage: AdminReportSection;
  links: { signBase: string; poolUrl: string };
};

export function buildAdminGroupReportView(report: GroupReport, publicBaseUrl?: string): AdminGroupReportView {
  const base = publicBaseUrl?.replace(/\/+$/, "") ?? "";
  const summary = report.summary;
  const summarySection: AdminReportSection = {
    title: "Group",
    stats: [
      { label: "Chat ID", value: summary.chatId },
      { label: "Safe", value: summary.safeAddress },
      { label: "Threshold", value: `${summary.threshold}-of-${summary.ownerCount}` },
      { label: "Pool members", value: String(summary.memberCount) },
      {
        label: "NAV",
        value: summary.navWei === null ? "—" : formatBnb(BigInt(summary.navWei))
      },
      {
        label: "Liquid",
        value: summary.liquidWei === null ? "—" : formatBnb(BigInt(summary.liquidWei))
      },
      {
        label: "Last activity",
        value: summary.lastActivityAt === null ? "—" : new Date(summary.lastActivityAt).toLocaleString()
      }
    ]
  };

  let poolSection: AdminReportSection | null = null;
  if (report.analytics !== null) {
    const a = report.analytics;
    poolSection = {
      title: "Pool",
      stats: [
        { label: "NAV", value: formatBnb(BigInt(a.navWei)) },
        { label: "Liquid", value: formatBnb(BigInt(a.liquidWei)) },
        { label: "Positions", value: formatBnb(BigInt(a.positionsWei)) },
        { label: "Reserved withdrawals", value: formatBnb(BigInt(a.reservedWithdrawalWei)) },
        { label: "Total shares", value: a.totalShares },
        { label: "Withdrawal fee", value: `${(a.withdrawalFeeBps / 100).toFixed(2)}%` }
      ],
      tables: [
        {
          headers: ["User", "Role", "Ownership", "Active", "Deposited", "Queued WD"],
          rows: a.members.map((m) => [
            m.telegramUserId,
            m.role,
            `${(m.ownershipBps / 100).toFixed(2)}%`,
            formatBnb(BigInt(m.activeValueWei)),
            formatBnb(BigInt(m.depositedWei)),
            formatBnb(BigInt(m.queuedWithdrawalWei))
          ])
        },
        {
          headers: ["Withdrawal", "Status", "Gross", "Fee", "Net", "Requested"],
          rows: a.withdrawals.map((w) => [
            w.id,
            w.status,
            formatBnb(BigInt(w.grossAmountWei)),
            formatBnb(BigInt(w.feeAmountWei)),
            formatBnb(BigInt(w.netAmountWei)),
            new Date(w.requestedAt).toLocaleString()
          ])
        },
        {
          headers: ["Ledger", "Type", "Amount", "Shares Δ", "When"],
          rows: a.ledger.slice(0, 20).map((e) => [
            e.id,
            e.type,
            formatBnb(BigInt(e.amountWei)),
            e.sharesDelta,
            new Date(e.createdAt).toLocaleString()
          ])
        }
      ]
    };
  }

  const usageSection: AdminReportSection = {
    title: "Usage (30d)",
    tables: [
      {
        headers: ["When", "Command", "User"],
        rows:
          report.usage.length === 0
            ? []
            : report.usage.map((u) => [
                new Date(u.createdAt).toLocaleString(),
                u.command,
                u.telegramUserId
              ])
      }
    ],
    ...(report.usage.length === 0 ? { note: "No commands recorded for this group in the last 30 days." } : {})
  };

  return {
    chatId: summary.chatId,
    summary: summarySection,
    pool: poolSection,
    usage: usageSection,
    links: {
      signBase: `${base}/sign/`,
      poolUrl: `${base}/pool/${encodeURIComponent(summary.chatId)}`
    }
  };
}
