-- API keys (apps/account/src/keys.ts). The key itself is never stored: only its SHA-256 hash and its
-- first few characters, so the account page can tell keys apart.
create table "api_key" ("id" text not null primary key, "userId" text not null references "user" ("id") on delete cascade, "name" text not null, "start" text not null, "hash" text not null unique, "createdAt" date not null, "lastUsedAt" date, "expiresAt" date);
create index "api_key_userId_idx" on "api_key" ("userId");
-- The daily purge deletes expired keys.
create index "api_key_expiresAt_idx" on "api_key" ("expiresAt");
