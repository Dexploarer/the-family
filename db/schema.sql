create table if not exists group_wallets (
  chat_id text primary key,
  safe_address text not null,
  threshold integer not null,
  owners jsonb not null,
  created_at timestamptz not null
);

create table if not exists wallet_links (
  telegram_user_id text not null,
  address text not null,
  nonce text not null,
  status text not null,
  created_at timestamptz not null,
  linked_at timestamptz,
  primary key (telegram_user_id, address)
);

create table if not exists pending_prompts (
  chat_id text not null,
  telegram_user_id text not null,
  command text not null,
  collected jsonb not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (chat_id, telegram_user_id)
);

create table if not exists safe_creation_sessions (
  id text primary key,
  chat_id text not null,
  creator_telegram_id text not null,
  threshold integer not null,
  owners jsonb not null,
  status text not null,
  deployed_safe_address text,
  deployment_tx_hash text,
  created_at timestamptz not null
);

create table if not exists trade_proposals (
  id text primary key,
  chat_id text not null references group_wallets(chat_id),
  proposer_telegram_id text not null,
  token_address text not null,
  input_amount_wei text not null,
  min_output_amount text not null,
  fee_amount_wei text not null,
  route text not null,
  status text not null,
  risk_report jsonb not null,
  transactions jsonb not null,
  created_at timestamptz not null
);

create table if not exists flap_launches (
  id text primary key,
  chat_id text not null references group_wallets(chat_id),
  proposer_telegram_id text not null,
  name text not null,
  symbol text not null,
  metadata_uri text not null,
  buy_tax_bps integer not null,
  sell_tax_bps integer not null,
  tax_duration_seconds integer not null,
  initial_buy_wei text not null,
  recipients jsonb not null,
  salt text not null,
  transactions jsonb not null,
  created_at timestamptz not null
);

create table if not exists safe_submissions (
  id text primary key,
  chat_id text not null references group_wallets(chat_id),
  source_type text not null,
  source_id text not null,
  safe_address text not null,
  safe_tx_hash text not null,
  safe_transaction jsonb not null,
  transaction_service_url text not null,
  status text not null,
  sender_address text,
  submitted_at timestamptz,
  created_at timestamptz not null
);

create table if not exists pool_members (
  chat_id text not null references group_wallets(chat_id),
  telegram_user_id text not null,
  role text not null,
  shares text not null,
  deposited_wei text not null,
  withdrawn_wei text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (chat_id, telegram_user_id)
);

create table if not exists pool_nav_snapshots (
  id text primary key,
  chat_id text not null references group_wallets(chat_id),
  nav_wei text not null,
  liquid_wei text not null,
  positions_wei text not null,
  total_shares text not null,
  captured_at timestamptz not null
);

create index if not exists pool_nav_snapshots_chat_captured_at_idx
  on pool_nav_snapshots(chat_id, captured_at desc);

create table if not exists pool_ledger_entries (
  id text primary key,
  chat_id text not null references group_wallets(chat_id),
  telegram_user_id text not null,
  type text not null,
  amount_wei text not null,
  shares_delta text not null,
  nav_wei text not null,
  total_shares_after text not null,
  transaction_hash text,
  created_at timestamptz not null
);

create unique index if not exists pool_ledger_entries_transaction_hash_idx
  on pool_ledger_entries(lower(transaction_hash))
  where transaction_hash is not null;

create index if not exists pool_ledger_entries_chat_created_at_idx
  on pool_ledger_entries(chat_id, created_at desc);

create table if not exists pool_withdrawal_requests (
  id text primary key,
  chat_id text not null references group_wallets(chat_id),
  telegram_user_id text not null,
  recipient_address text not null,
  shares text not null,
  gross_amount_wei text not null,
  fee_amount_wei text not null,
  net_amount_wei text not null,
  nav_wei text not null,
  total_shares_at_request text not null,
  status text not null,
  requested_at timestamptz not null,
  prepared_at timestamptz,
  executed_at timestamptz,
  cancelled_at timestamptz,
  safe_submission_id text references safe_submissions(id),
  execution_transaction_hash text
);

create index if not exists pool_withdrawal_requests_chat_status_idx
  on pool_withdrawal_requests(chat_id, status, requested_at desc);

create table if not exists usage_events (
  id text primary key,
  command text not null,
  telegram_user_id text not null,
  created_at timestamptz not null
);

create index if not exists usage_events_created_at_idx on usage_events(created_at desc);

alter table usage_events add column if not exists chat_id text;
create index if not exists usage_events_chat_created_at_idx on usage_events(chat_id, created_at desc);

create table if not exists platform_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

create table if not exists group_settings (
  chat_id text primary key,
  languages text not null default 'en',
  updated_at timestamptz not null default now()
);

create table if not exists admin_users (
  id text primary key,
  email text not null unique,
  password_hash text,
  role text not null check (role in ('super_admin', 'admin')),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  last_login_at timestamptz
);

create table if not exists admin_sessions (
  id text primary key,
  user_id text not null references admin_users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null
);

create index if not exists admin_sessions_user_id_idx on admin_sessions(user_id);
create index if not exists admin_sessions_expires_at_idx on admin_sessions(expires_at);
