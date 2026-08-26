/*
 * Author: MoyuZJ
 * Team: LinearTeam
 * Contact: linearteam@foxmail.com
 * Made by MoyuZJ in China with ♥
 */

/**
 * 单点登录绑定关系存储。
 *
 * 表跟随业务数据库（ctx.databaseService）：SQLite 与 MySQL（mysql-plugin 驱动）
 * 均可使用，删除用户时由数据库层 ON DELETE CASCADE 自动清理绑定。
 * DDL 采用跨方言写法（无 AUTOINCREMENT / CREATE INDEX IF NOT EXISTS）。
 */

export interface SsoBinding {
  provider: string;
  sub: string;
  user_id: number;
  username: string | null;
  email: string | null;
  created_at: string;
}

/** 最小数据库接口（由 ctx.databaseService 满足，方法允许同步或 Promise）。 */
export interface SsoDb {
  exec(sql: string): unknown;
  run(sql: string, ...params: unknown[]): unknown;
  get<T = unknown>(sql: string, ...params: unknown[]): T | undefined | Promise<T | undefined>;
  all<T = unknown>(sql: string, ...params: unknown[]): T[] | Promise<T[]>;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sso_bindings (
  provider VARCHAR(64) NOT NULL,
  sub VARCHAR(255) NOT NULL,
  user_id BIGINT NOT NULL,
  username VARCHAR(255),
  email VARCHAR(255),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (provider, sub)
);
`;

/** 表已存在时跳过建表（容错：MySQL 建表语句在已存在表上直接返回）。 */
export async function ensureSchema(db: SsoDb): Promise<void> {
  await Promise.resolve(db.exec(SCHEMA)).catch((error) => {
    if (String(error?.message ?? error).includes('already exists')) return;
    throw error;
  });
}

export async function findBinding(db: SsoDb, provider: string, sub: string): Promise<SsoBinding | undefined> {
  return await Promise.resolve(db.get<SsoBinding>('SELECT * FROM sso_bindings WHERE provider=? AND sub=?', provider, sub));
}

export async function listBindingsByUser(db: SsoDb, userId: number): Promise<SsoBinding[]> {
  return await Promise.resolve(db.all<SsoBinding>('SELECT * FROM sso_bindings WHERE user_id=? ORDER BY provider', userId));
}

export async function createBinding(db: SsoDb, input: { provider: string; sub: string; userId: number; username: string | null; email: string | null }): Promise<void> {
  await Promise.resolve(db.run('INSERT INTO sso_bindings(provider, sub, user_id, username, email) VALUES(?,?,?,?,?)', input.provider, input.sub, input.userId, input.username, input.email));
}

/** 登录成功后刷新用户名/邮箱快照（不改变 provider/sub 主键）。 */
export async function refreshBindingSnapshot(db: SsoDb, provider: string, sub: string, username: string | null, email: string | null): Promise<void> {
  await Promise.resolve(db.run('UPDATE sso_bindings SET username=?, email=? WHERE provider=? AND sub=?', username, email, provider, sub));
}

export async function removeBindingByUserAndProvider(db: SsoDb, userId: number, provider: string): Promise<void> {
  await Promise.resolve(db.run('DELETE FROM sso_bindings WHERE user_id=? AND provider=?', userId, provider));
}