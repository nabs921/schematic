export type SqlDialect = 'postgres' | 'mysql' | 'sqlite' | 'mssql' | 'oracle';

export interface DialectMeta {
  id: SqlDialect;
  name: string;
  shortName: string;
  badgeLabel: string;
  description: string;
  defaultPort: number;
}

export const SUPPORTED_DIALECTS: Record<SqlDialect, DialectMeta> = {
  postgres: {
    id: 'postgres',
    name: 'PostgreSQL',
    shortName: 'Postgres',
    badgeLabel: 'PostgreSQL',
    description: 'PostgreSQL 12+ (SERIAL, UUID, TIMESTAMPTZ, JSONB)',
    defaultPort: 5432,
  },
  mysql: {
    id: 'mysql',
    name: 'MySQL / MariaDB',
    shortName: 'MySQL',
    badgeLabel: 'MySQL',
    description: 'MySQL 8+ & MariaDB (AUTO_INCREMENT, Backticks, InnoDB)',
    defaultPort: 3306,
  },
  sqlite: {
    id: 'sqlite',
    name: 'SQLite',
    shortName: 'SQLite',
    badgeLabel: 'SQLite',
    description: 'SQLite 3 (INTEGER PRIMARY KEY, AUTOINCREMENT, TEXT)',
    defaultPort: 0,
  },
  mssql: {
    id: 'mssql',
    name: 'Microsoft SQL Server',
    shortName: 'SQL Server',
    badgeLabel: 'T-SQL',
    description: 'SQL Server (IDENTITY, [Brackets], NVARCHAR, DATETIME2)',
    defaultPort: 1433,
  },
  oracle: {
    id: 'oracle',
    name: 'Oracle Database',
    shortName: 'Oracle',
    badgeLabel: 'Oracle',
    description: 'Oracle 12c+ (GENERATED AS IDENTITY, VARCHAR2, NUMBER)',
    defaultPort: 1521,
  },
};

export const DIALECT_OPTIONS: DialectMeta[] = Object.values(SUPPORTED_DIALECTS);

/**
 * Intelligent heuristics to detect SQL dialect based on distinctive syntax patterns.
 */
export function detectSqlDialect(sql: string): SqlDialect {
  if (!sql || !sql.trim()) return 'postgres';

  // MySQL markers
  if (
    /\bAUTO_INCREMENT\b/i.test(sql) ||
    /\bENGINE\s*=\s*(InnoDB|MyISAM|MEMORY)\b/i.test(sql) ||
    /`\w+`/i.test(sql) ||
    /\b(TINYINT|MEDIUMINT)\b/i.test(sql)
  ) {
    return 'mysql';
  }

  // SQLite markers
  if (
    /\bAUTOINCREMENT\b/i.test(sql) ||
    /\bWITHOUT\s+ROWID\b/i.test(sql)
  ) {
    return 'sqlite';
  }

  // SQL Server (T-SQL) markers
  if (
    /\bIDENTITY\s*\(\s*\d+\s*,\s*\d+\s*\)/i.test(sql) ||
    /\[\w+\]\s+(INT|VARCHAR|NVARCHAR|DATETIME2)/i.test(sql) ||
    /\b(NVARCHAR|NCHAR|DATETIME2|DATETIMEOFFSET|SMALLDATETIME)\b/i.test(sql) ||
    /\bGO\b\s*$/im.test(sql)
  ) {
    return 'mssql';
  }

  // Oracle markers
  if (
    /\bVARCHAR2\b/i.test(sql) ||
    /\bNUMBER\s*(\(\d+(,\s*\d+)?\))?\b/i.test(sql) ||
    /\bGENERATED\s+(ALWAYS|BY\s+DEFAULT)\s+AS\s+IDENTITY\b/i.test(sql) ||
    /\b(VARCHAR2|NVARCHAR2|CLOB|BLOB|RAW)\b/i.test(sql)
  ) {
    return 'oracle';
  }

  // Default to PostgreSQL
  return 'postgres';
}
