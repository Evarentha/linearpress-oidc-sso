/*
 * OIDC SSO Binding Store
 *
 * Links between provider accounts (provider + sub) and site accounts.
 *
 * Authors:
 * MoyuZJ <moyuzj@evarentha.com> @LinearTeam - Made in China with ♥
 * worryzu <worryzu@evarentha.com> @LinearTeam
 *
 * Copyright (C) 2026 Evarentha
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * <p><code>created_account</code> marks bindings that created the site
 * account; such accounts have a random password, so their last binding must
 * not be removed.</p>
 *
 * @since 1.0.0
 */

import type { DatabaseService } from 'linearpress/plugin-api';

export interface SsoBinding { provider: string; sub: string; user_id: number; username: string | null; email: string | null; created_at: string; created_account: number; }

export async function ensureSchema(db: DatabaseService): Promise<void> {
  await db.exec(`CREATE TABLE IF NOT EXISTS sso_bindings (provider VARCHAR(64) NOT NULL, sub VARCHAR(191) NOT NULL, user_id BIGINT NOT NULL, username VARCHAR(255) NULL, email VARCHAR(255) NULL, created_at VARCHAR(40) NOT NULL, created_account INT NOT NULL DEFAULT 0, PRIMARY KEY (provider, sub))`);
  if (!await db.hasColumn('sso_bindings', 'created_account')) await db.exec('ALTER TABLE sso_bindings ADD COLUMN created_account INT NOT NULL DEFAULT 0');
}

export const findBinding = (db: DatabaseService, provider: string, sub: string) => db.get<SsoBinding>('SELECT * FROM sso_bindings WHERE provider = ? AND sub = ?', provider, sub);
export const bindingsOf = (db: DatabaseService, userId: number) => db.all<SsoBinding>('SELECT * FROM sso_bindings WHERE user_id = ? ORDER BY provider', userId);
export const createBinding = (db: DatabaseService, row: { provider: string; sub: string; userId: number; username: string | null; email: string | null; createdAccount?: boolean; now: string }) =>
  db.run('INSERT INTO sso_bindings (provider, sub, user_id, username, email, created_at, created_account) VALUES (?, ?, ?, ?, ?, ?, ?)', row.provider, row.sub, row.userId, row.username, row.email, row.now, row.createdAccount ? 1 : 0);
export const refreshBinding = (db: DatabaseService, provider: string, sub: string, username: string | null, email: string | null) =>
  db.run('UPDATE sso_bindings SET username = ?, email = ? WHERE provider = ? AND sub = ?', username, email, provider, sub);
export const removeBinding = (db: DatabaseService, userId: number, provider: string) => db.run('DELETE FROM sso_bindings WHERE user_id = ? AND provider = ?', userId, provider);
export const countByProvider = async (db: DatabaseService) => new Map((await db.all<{ provider: string; n: number }>('SELECT provider, COUNT(*) AS n FROM sso_bindings GROUP BY provider')).map((row) => [row.provider, Number(row.n)]));
