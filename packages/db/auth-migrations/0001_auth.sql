-- Better Auth core tables (better-auth 1.7), for the ftcref-auth D1 only: never the stats DB.
-- Generated from `getMigrations(authOptions).compileMigrations()`; see apps/account/src/auth.ts.
-- Privacy: name/email hold a handle and a placeholder address; image, the account token columns and
-- session ipAddress/userAgent stay NULL (hooks in auth.ts). They exist because Better Auth expects them.
create table "user" ("id" text not null primary key, "name" text not null, "email" text not null unique, "emailVerified" integer not null, "image" text, "createdAt" date not null, "updatedAt" date not null);
create table "session" ("id" text not null primary key, "expiresAt" date not null, "token" text not null unique, "createdAt" date not null, "updatedAt" date not null, "ipAddress" text, "userAgent" text, "userId" text not null references "user" ("id") on delete cascade);
create table "account" ("id" text not null primary key, "accountId" text not null, "providerId" text not null, "userId" text not null references "user" ("id") on delete cascade, "accessToken" text, "refreshToken" text, "idToken" text, "accessTokenExpiresAt" date, "refreshTokenExpiresAt" date, "scope" text, "password" text, "createdAt" date not null, "updatedAt" date not null);
create table "verification" ("id" text not null primary key, "identifier" text not null, "value" text not null, "expiresAt" date not null, "createdAt" date not null, "updatedAt" date not null);
create index "session_userId_idx" on "session" ("userId");
create index "account_userId_idx" on "account" ("userId");
create index "verification_identifier_idx" on "verification" ("identifier");
-- The daily purge (apps/account/src/index.ts purgeExpired) deletes by expiry.
create index "session_expiresAt_idx" on "session" ("expiresAt");
create index "verification_expiresAt_idx" on "verification" ("expiresAt");
