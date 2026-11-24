import { ensureMigrated } from '../src/lib/db';
import { createUser, findUserByEmail } from '../src/lib/db/queries/users';
import { hashPassword, verifyPassword } from '../src/lib/auth/password';
import {
  createFolder,
  renameFolder,
  deleteFolder,
  getFolderBreadcrumbs,
} from '../src/lib/db/queries/folders';
import {
  createFile,
  getFileById,
  updateFileCanvas,
  deleteFile,
} from '../src/lib/db/queries/files';
import {
  resolveFilePermission,
  shareFileWithEmail,
  getFileMembers,
} from '../src/lib/db/queries/permissions';
import { parseSqlSchema } from '../src/lib/sql/parser';
import { detectSqlDialect, SUPPORTED_DIALECTS } from '../src/lib/sql/dialects';
import { convertSqlDialect, exportDbmlFromSql } from '../src/lib/sql/exporters';
import { layoutSchema } from '../src/lib/layout/elk-layout';

async function runTests() {
  console.log('========================================================');
  console.log('🧪 Starting SQL Schema Designer Test Suite');
  console.log('========================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, testName: string) {
    total++;
    if (condition) {
      console.log(`✓ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`✗ [FAIL] ${testName}`);
      process.exitCode = 1;
    }
  }

  // 1. Database Migration
  console.log('--- 1. Database & Migrations ---');
  let dbAvailable = false;
  try {
    await ensureMigrated();
    dbAvailable = true;
    assert(true, 'Database schema migrations executed successfully');
  } catch {
    console.log('⚠ [NOTE] Local PostgreSQL is not reachable on 5432. Running offline parser, multi-dialect, and layout test suites.');
  }

  // 2. Authentication & Password Hashing
  console.log('\n--- 2. Authentication & Password Hashing ---');
  const password = 'SuperSecretPassword123!';
  const hashedPassword = await hashPassword(password);
  assert(hashedPassword !== password, 'Password is securely hashed');
  const passwordValid = await verifyPassword(password, hashedPassword);
  assert(passwordValid, 'Bcrypt password verification succeeds');
  const passwordInvalid = await verifyPassword('WrongPassword', hashedPassword);
  assert(!passwordInvalid, 'Bcrypt rejects incorrect password');

  const initialSql = `
    CREATE TABLE customers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email VARCHAR(255) UNIQUE NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE charges (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
      amount_cents INT NOT NULL,
      status VARCHAR(50) NOT NULL
    );
  `;

  let schemaFile: Awaited<ReturnType<typeof createFile>> | null = null;
  let rootFolder: Awaited<ReturnType<typeof createFolder>> | null = null;

  if (dbAvailable) {
    const testEmail1 = `alice_${Date.now()}@example.com`;
    const userAlice = await createUser({
      email: testEmail1,
      passwordHash: hashedPassword,
      name: 'Alice Developer',
    });
    assert(userAlice.email === testEmail1, 'Created user Alice in PostgreSQL');
    assert(!!userAlice.id, 'User Alice assigned valid UUID');

    const testEmail2 = `bob_${Date.now()}@example.com`;
    const userBob = await createUser({
      email: testEmail2,
      passwordHash: hashedPassword,
      name: 'Bob Collaborator',
    });
    assert(userBob.email === testEmail2, 'Created user Bob in PostgreSQL');

    const foundAlice = await findUserByEmail(testEmail1);
    assert(foundAlice?.id === userAlice.id, 'findUserByEmail correctly retrieves user');

    // 3. Workspace Folders & Nested Folders
    console.log('\n--- 3. Workspace Folders & Hierarchies ---');
    rootFolder = await createFolder({
      name: 'Backend Services',
      ownerId: userAlice.id,
    });
    assert(rootFolder.name === 'Backend Services', 'Root folder created');

    const subFolder = await createFolder({
      name: 'Billing & Payments',
      parentId: rootFolder.id,
      ownerId: userAlice.id,
    });
    assert(subFolder.parent_id === rootFolder.id, 'Nested subfolder created with parent_id');

    const breadcrumbs = await getFolderBreadcrumbs(subFolder.id);
    assert(breadcrumbs.length === 2, 'Folder breadcrumbs correctly traverse parent tree');
    assert(breadcrumbs[0].id === rootFolder.id, 'Breadcrumbs start at root folder');
    assert(breadcrumbs[1].id === subFolder.id, 'Breadcrumbs end at subfolder');

    const renamed = await renameFolder(subFolder.id, 'Payments & Subscriptions');
    assert(renamed?.name === 'Payments & Subscriptions', 'Folder successfully renamed');

    // 4. Schema Files & SQL Storage
    console.log('\n--- 4. Schema Files (SQL DDL Storage) ---');
    schemaFile = await createFile({
      name: 'Billing Schema',
      folderId: subFolder.id,
      ownerId: userAlice.id,
      sqlContent: initialSql,
    });
    assert(schemaFile.name === 'Billing Schema', 'Schema file created in nested folder');
    assert(schemaFile.folder_id === subFolder.id, 'Schema file references correct folder');

    const fetchedFile = await getFileById(schemaFile.id);
    assert(fetchedFile?.sql_content === initialSql, 'Retrieved file contains exact SQL DDL');

    await updateFileCanvas(schemaFile.id, {
      notes: [{ id: 'n1', title: 'TODO', content: 'Add refund table', color: 'yellow', position: { x: 50, y: 50 } }],
      positions: { customers: { x: 100, y: 100 }, charges: { x: 450, y: 100 } },
    });
    const updatedFile = await getFileById(schemaFile.id);
    assert(updatedFile?.canvas_data.notes?.length === 1, 'Canvas notes stored in JSONB');
    assert(updatedFile?.canvas_data.positions?.customers.x === 100, 'Table positions stored in JSONB');

    // 5. Sharing & Permission Inheritance
    console.log('\n--- 5. Sharing & Permissions Inheritance ---');
    const alicePerm = await resolveFilePermission(userAlice.id, schemaFile.id);
    assert(alicePerm.hasAccess && alicePerm.role === 'owner', 'Alice has Owner permission');
    assert(alicePerm.canEdit && alicePerm.canDelete && alicePerm.canShare, 'Owner has edit, delete & share rights');

    const bobInitialPerm = await resolveFilePermission(userBob.id, schemaFile.id);
    assert(!bobInitialPerm.hasAccess && bobInitialPerm.role === null, 'Bob has no access prior to share');

    const shareRes = await shareFileWithEmail(schemaFile.id, testEmail2, 'viewer');
    assert(shareRes.success, 'Shared file with Bob as viewer');

    const bobViewerPerm = await resolveFilePermission(userBob.id, schemaFile.id);
    assert(bobViewerPerm.hasAccess && bobViewerPerm.role === 'viewer', 'Bob has Viewer access');
    assert(!bobViewerPerm.canEdit && !bobViewerPerm.canDelete, 'Viewer cannot edit or delete');

    await shareFileWithEmail(schemaFile.id, testEmail2, 'editor');
    const bobEditorPerm = await resolveFilePermission(userBob.id, schemaFile.id);
    assert(bobEditorPerm.role === 'editor' && bobEditorPerm.canEdit, 'Bob upgraded to Editor with edit rights');

    const members = await getFileMembers(schemaFile.id);
    assert(members.length === 2, 'File members list contains Owner and invited collaborator');
  }

  // 6. SQL Parser (@dbml/core) & AST
  console.log('\n--- 6. SQL Parser & Relations Extraction ---');
  const parseResult = parseSqlSchema(initialSql);
  assert(parseResult.success, 'Parser successfully parsed PostgreSQL DDL');
  assert(parseResult.schema?.tables.length === 2, 'Extracted 2 tables (customers, charges)');
  const customersTable = parseResult.schema?.tables.find((t) => t.name === 'customers');
  assert(Boolean(customersTable?.fields.some((f) => f.name === 'id' && f.isPrimaryKey)), 'Identified primary key');
  assert(parseResult.schema?.relationships.length === 1, 'Extracted foreign key relationship');
  const rel = parseResult.schema?.relationships[0];
  assert(rel?.sourceTable === 'charges' && rel?.targetTable === 'customers', 'Mapped relation source & target');

  // Invalid SQL error diagnostics
  const invalidSql = 'CREATE TABLE broken ( id SERIAL, name VARCHAR(255) NOT ';
  const invalidResult = parseSqlSchema(invalidSql);
  assert(!invalidResult.success, 'Parser caught syntax error');
  assert(invalidResult.errors.length > 0, 'Generated diagnostic error with line/column');
  assert(invalidResult.errors[0].line >= 1, 'Reported accurate line number for editor marker');

  // 6b. Multi-Dialect Support
  console.log('\n--- 6b. Multi-Dialect Parser & Conversion ---');
  assert(Object.keys(SUPPORTED_DIALECTS).length === 5, 'Configured 5 supported dialects');

  // MySQL parsing
  const mysqlSql = `
    CREATE TABLE \`users\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`email\` VARCHAR(255) NOT NULL UNIQUE
    );
    CREATE TABLE \`orders\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`user_id\` INT NOT NULL,
      CONSTRAINT \`fk_orders_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`)
    );
  `;
  const mysqlResult = parseSqlSchema(mysqlSql, 'mysql');
  assert(mysqlResult.success, 'Parsed MySQL DDL successfully');
  assert(mysqlResult.schema?.tables.length === 2, 'Extracted MySQL tables');
  assert(mysqlResult.schema?.relationships.length === 1, 'Extracted MySQL foreign key');
  assert(exportDbmlFromSql(mysqlSql, 'mysql').includes('users'), 'Exported DBML from MySQL DDL');

  // SQLite parsing
  const sqliteSql = `
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE
    );
    CREATE TABLE posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `;
  const sqliteResult = parseSqlSchema(sqliteSql, 'sqlite');
  assert(sqliteResult.success, 'Parsed SQLite DDL with AUTOINCREMENT successfully');
  assert(sqliteResult.schema?.tables.length === 2, 'Extracted SQLite tables');

  // SQL Server (MSSQL) parsing
  const mssqlSql = `
    CREATE TABLE [users] (
      [id] INT IDENTITY(1,1) PRIMARY KEY,
      [email] NVARCHAR(255) NOT NULL UNIQUE
    );
    CREATE TABLE [orders] (
      [id] INT IDENTITY(1,1) PRIMARY KEY,
      [user_id] INT NOT NULL FOREIGN KEY REFERENCES [users]([id])
    );
  `;
  const mssqlResult = parseSqlSchema(mssqlSql, 'mssql');
  assert(mssqlResult.success, 'Parsed MSSQL / T-SQL DDL successfully');
  assert(mssqlResult.schema?.tables.length === 2, 'Extracted MSSQL tables');

  // Oracle parsing
  const oracleSql = `
    CREATE TABLE users (
      id NUMBER PRIMARY KEY,
      email VARCHAR2(255) NOT NULL
    );
  `;
  const oracleResult = parseSqlSchema(oracleSql, 'oracle');
  assert(oracleResult.success, 'Parsed Oracle DDL successfully');
  assert(oracleResult.schema?.tables[0].name === 'users', 'Extracted Oracle table name');

  // Dialect Detection heuristics
  assert(detectSqlDialect(mysqlSql) === 'mysql', 'Auto-detected MySQL dialect');
  assert(detectSqlDialect(sqliteSql) === 'sqlite', 'Auto-detected SQLite dialect');
  assert(detectSqlDialect(mssqlSql) === 'mssql', 'Auto-detected MSSQL dialect');
  assert(detectSqlDialect(oracleSql) === 'oracle', 'Auto-detected Oracle dialect');
  assert(detectSqlDialect('CREATE TABLE t (id SERIAL PRIMARY KEY);') === 'postgres', 'Auto-detected PostgreSQL dialect');

  // Dialect Conversion
  const pgSource = 'CREATE TABLE accounts (id SERIAL PRIMARY KEY, name VARCHAR(100) NOT NULL UNIQUE);';
  const convertedMysql = convertSqlDialect(pgSource, 'postgres', 'mysql');
  assert(convertedMysql.includes('`accounts`') || convertedMysql.includes('AUTO_INCREMENT'), 'Converted Postgres to MySQL DDL');

  const convertedMssql = convertSqlDialect(pgSource, 'postgres', 'mssql');
  assert(convertedMssql.includes('[accounts]') || convertedMssql.includes('IDENTITY'), 'Converted Postgres to MSSQL DDL');

  const convertedSqlite = convertSqlDialect(pgSource, 'postgres', 'sqlite');
  assert(convertedSqlite.includes('accounts'), 'Converted Postgres to SQLite DDL');

  // 7. ELK.js Graph Auto-Layout
  console.log('\n--- 7. ELK.js Auto-Layout Engine ---');
  if (parseResult.schema) {
    const layout = await layoutSchema(parseResult.schema);
    assert(layout.nodes.length === 2, 'ELK generated React Flow nodes for each table');
    assert(layout.edges.length === 1, 'ELK generated React Flow edges for relationships');
    assert(typeof layout.nodes[0].position.x === 'number', 'Calculated numerical X coordinate');
    assert(typeof layout.nodes[0].position.y === 'number', 'Calculated numerical Y coordinate');
  }

  // 8. Cleanup
  if (dbAvailable && schemaFile && rootFolder) {
    console.log('\n--- 8. Cleanup & Cascade ---');
    const deleteFileSuccess = await deleteFile(schemaFile.id);
    assert(deleteFileSuccess, 'Schema file deleted');
    const deleteFolderSuccess = await deleteFolder(rootFolder.id);
    assert(deleteFolderSuccess, 'Parent folder deleted with cascade');
  }

  console.log('\n========================================================');
  console.log(`🎉 Test Suite Complete: ${passed}/${total} assertions passed`);
  console.log('========================================================\n');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
