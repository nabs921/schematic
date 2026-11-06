import { ModelExporter, Parser, exporter } from '@dbml/core';
import type { ColumnDefinition, ParsedSchema } from './parser';

export interface ProjectExportInput {
  name: string;
  sql: string;
  schema: ParsedSchema | null;
  notes: unknown[];
}

/**
 * Convert PostgreSQL DDL into DBML using @dbml/core's model exporter.
 */
export function exportDbmlFromSql(sql: string): string {
  const database = Parser.parse(sql, 'postgres');
  return ModelExporter.export(database, 'dbml');
}

/**
 * Convert DBML into PostgreSQL DDL.
 */
export function importDbmlToSql(dbml: string): string {
  return exporter.export(dbml, 'postgres');
}

/** Sanitise a SQL identifier into something Mermaid accepts. */
function mermaidIdentifier(value: string): string {
  const sanitised = value.replace(/[^a-zA-Z0-9_]/g, '_');
  return /^[0-9]/.test(sanitised) ? `_${sanitised}` : sanitised || '_';
}

/** Strip length/precision arguments so Mermaid gets a simple type token. */
function mermaidType(type: string): string {
  return mermaidIdentifier(
    type
      .toLowerCase()
      .replace(/\([^)]*\)/g, '')
      .replace(/\s+/g, '_')
  );
}

export function exportMermaid(schema: ParsedSchema): string {
  const lines: string[] = ['erDiagram'];

  for (const table of schema.tables) {
    lines.push(`  ${mermaidIdentifier(table.name)} {`);
    for (const field of table.fields) {
      const keys: string[] = [];
      if (field.isPrimaryKey) keys.push('PK');
      if (field.isForeignKey) keys.push('FK');
      if (field.isUnique && !field.isPrimaryKey) keys.push('UK');
      const keySuffix = keys.length > 0 ? ` ${keys.join(', ')}` : '';
      lines.push(
        `    ${mermaidType(field.type)} ${mermaidIdentifier(field.name)}${keySuffix}`
      );
    }
    lines.push('  }');
  }

  for (const relationship of schema.relationships) {
    const cardinality =
      relationship.cardinality === '1:1'
        ? '||--||'
        : relationship.cardinality === 'N:M'
          ? '}o--o{'
          : '}o--||';
    lines.push(
      `  ${mermaidIdentifier(relationship.sourceTable)} ${cardinality} ${mermaidIdentifier(
        relationship.targetTable
      )} : "${relationship.sourceColumn.replace(/"/g, "'")}"`
    );
  }

  return `${lines.join('\n')}\n`;
}

function toPascalCase(value: string): string {
  const parts = value.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  const joined = parts
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
  return /^[0-9]/.test(joined) ? `_${joined}` : joined || 'Model';
}

function toCamelCase(value: string): string {
  const pascal = toPascalCase(value);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

function uniqueName(base: string, used: Set<string>): string {
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${base}${suffix}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

interface PrismaField {
  name: string;
  type: string;
  nativeType?: string;
  isOptional: boolean;
  isId: boolean;
  isUnique: boolean;
  defaultExpression?: string;
  relation?: {
    targetModel: string;
    sourceField: string;
    targetField: string;
  };
}

function prismaNativeType(type: string): string | undefined {
  const normalised = type.toLowerCase();
  if (normalised.includes('uuid')) return '@db.Uuid';
  if (normalised.includes('timestamp')) {
    return normalised.includes('with time zone') ? '@db.Timestamptz' : '@db.Timestamp';
  }
  if (normalised.includes('date')) return '@db.Date';
  if (normalised.startsWith('time')) return '@db.Time';
  if (normalised.includes('varchar') || normalised.includes('character varying')) {
    const length = normalised.match(/\((\d+)\)/)?.[1];
    return length ? `@db.VarChar(${length})` : '@db.VarChar';
  }
  if (normalised.includes('char')) return '@db.Char';
  return undefined;
}

function prismaScalarType(type: string): { type: string; nativeType?: string } {
  const normalised = type.toLowerCase();
  if (normalised.includes('bool')) return { type: 'Boolean' };
  if (normalised.includes('uuid')) return { type: 'String', nativeType: '@db.Uuid' };
  if (normalised.includes('bigint') || normalised.includes('int8')) return { type: 'BigInt' };
  if (normalised.includes('numeric') || normalised.includes('decimal') || normalised.includes('money')) {
    return { type: 'Decimal' };
  }
  if (normalised.includes('int')) return { type: 'Int' };
  if (normalised.includes('json')) return { type: 'Json' };
  if (normalised.includes('bytea') || normalised.includes('blob')) return { type: 'Bytes' };
  if (normalised.includes('timestamp') || normalised.includes('date') || normalised.startsWith('time')) {
    return { type: 'DateTime', nativeType: prismaNativeType(type) };
  }
  if (normalised.includes('float') || normalised.includes('double') || normalised.includes('real')) {
    return { type: 'Float' };
  }
  return { type: 'String', nativeType: prismaNativeType(type) };
}

function prismaDefault(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === 'null') return undefined;
  const lower = trimmed.toLowerCase();
  if (lower === 'current_timestamp' || lower === 'now()') return 'now()';
  if (lower === 'gen_random_uuid()') {
    return 'dbgenerated("gen_random_uuid()")';
  }
  if (lower === 'uuid_generate_v4()') {
    return 'dbgenerated("uuid_generate_v4()")';
  }
  if (lower === 'true' || lower === 'false') return lower;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return trimmed;
  if (/^'.*'$/.test(trimmed)) return trimmed;
  // A bare identifier in a DDL DEFAULT is normally a string/enum literal.
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(trimmed)) return JSON.stringify(trimmed);
  // Functions, casts, and other SQL expressions need to be passed through.
  return `dbgenerated(${JSON.stringify(trimmed)})`;
}

export function exportPrisma(schema: ParsedSchema): string {
  const modelNames = new Map<string, string>();
  const usedModels = new Set<string>();
  for (const table of schema.tables) {
    modelNames.set(table.name, uniqueName(toPascalCase(table.name), usedModels));
  }

  const fieldsByTable = new Map<string, PrismaField[]>();

  for (const table of schema.tables) {
    const usedFields = new Set<string>();
    const fields: PrismaField[] = [];
    const primaryKeyCount = table.fields.filter((field) => field.isPrimaryKey).length;

    for (const field of table.fields) {
      const scalar = prismaScalarType(field.type);
      fields.push({
        name: uniqueName(toCamelCase(field.name), usedFields),
        type: scalar.type,
        nativeType: scalar.nativeType,
        isOptional: field.isNullable && !field.isPrimaryKey,
        isId: field.isPrimaryKey && primaryKeyCount === 1,
        isUnique: field.isUnique && !field.isPrimaryKey,
        defaultExpression: prismaDefault(field.defaultValue),
      });
    }

    fieldsByTable.set(table.name, fields);
  }

  // Add relationship fields. Each FK gets a forward relation and a back-relation
  // on the referenced model so the generated Prisma schema is valid.
  for (const relationship of schema.relationships) {
    const sourceTable = schema.tables.find((table) => table.name === relationship.sourceTable);
    const targetTable = schema.tables.find((table) => table.name === relationship.targetTable);
    if (!sourceTable || !targetTable) continue;

    const sourceFields = fieldsByTable.get(sourceTable.name);
    const targetFields = fieldsByTable.get(targetTable.name);
    if (!sourceFields || !targetFields) continue;

    const sourceField = sourceFields.find(
      (field) => field.name === toCamelCase(relationship.sourceColumn)
    );
    const targetField = targetFields.find(
      (field) => field.name === toCamelCase(relationship.targetColumn)
    );
    if (!sourceField || !targetField) continue;

    const forwardName = uniqueName(
      `${toCamelCase(targetTable.name)}By${toPascalCase(relationship.sourceColumn)}`,
      new Set(sourceFields.map((field) => field.name))
    );
    const backName = uniqueName(
      `${toCamelCase(sourceTable.name)}By${toPascalCase(relationship.sourceColumn)}`,
      new Set(targetFields.map((field) => field.name))
    );

    sourceFields.push({
      name: forwardName,
      type: modelNames.get(targetTable.name) ?? toPascalCase(targetTable.name),
      isOptional: sourceField.isOptional,
      isId: false,
      isUnique: false,
      relation: {
        targetModel: modelNames.get(targetTable.name) ?? toPascalCase(targetTable.name),
        sourceField: sourceField.name,
        targetField: targetField.name,
      },
    });

    targetFields.push({
      name: backName,
      type: `${modelNames.get(sourceTable.name) ?? toPascalCase(sourceTable.name)}${
        relationship.cardinality === '1:1' ? '?' : '[]'
      }`,
      isOptional: false,
      isId: false,
      isUnique: false,
    });
  }

  const blocks: string[] = [
    '// Generated by Schematic — https://github.com/schematic',
    '',
  ];

  for (const table of schema.tables) {
    const modelName = modelNames.get(table.name) ?? toPascalCase(table.name);
    const fields = fieldsByTable.get(table.name) ?? [];
    const lines: string[] = [`model ${modelName} {`];

    for (const field of fields) {
      const attributes: string[] = [];
      if (field.isId) attributes.push('@id');
      if (field.isUnique) attributes.push('@unique');
      if (field.defaultExpression) attributes.push(`@default(${field.defaultExpression})`);
      if (field.nativeType) attributes.push(field.nativeType);
      if (field.relation) {
        attributes.push(
          `@relation(fields: [${field.relation.sourceField}], references: [${field.relation.targetField}])`
        );
      }

      const line = `  ${field.name} ${field.type}${field.isOptional ? '?' : ''}${
        attributes.length > 0 ? ` ${attributes.join(' ')}` : ''
      }`;
      lines.push(line);
    }

    const primaryKeyFields = table.fields.filter((field) => field.isPrimaryKey);
    if (primaryKeyFields.length > 1) {
      lines.push('');
      lines.push(
        `  @@id([${primaryKeyFields
          .map((field) => toCamelCase(field.name))
          .join(', ')}])`
      );
    }

    if (modelName !== table.name) {
      lines.push('');
      lines.push(`  @@map("${table.name}")`);
    }

    lines.push('}');
    blocks.push(lines.join('\n'));
    blocks.push('');
  }

  return `${blocks.join('\n').trim()}\n`;
}

interface DrizzleColumn {
  key: string;
  dbName: string;
  type: string;
  args?: string;
  extras: string[];
}

function drizzleIdentifier(value: string): string {
  const camel = toCamelCase(value);
  return /^[0-9]/.test(camel) ? `_${camel}` : camel || 'column';
}

function drizzleColumn(
  field: ColumnDefinition,
  variables: Map<string, string>,
  compositePrimaryKey: boolean
): DrizzleColumn {
  const normalised = field.type.toLowerCase();
  const length = normalised.match(/\((\d+)\)/)?.[1];
  const precision = normalised.match(/\((\d+)\s*,\s*(\d+)\)/);
  const key = drizzleIdentifier(field.name);
  const dbName = field.name;

  let type = 'text';
  let args: string | undefined;

  if (normalised.includes('uuid')) {
    type = 'uuid';
  } else if (normalised.includes('varchar') || normalised.includes('character varying')) {
    type = 'varchar';
    if (length) args = `{ length: ${length} }`;
  } else if (normalised.includes('char')) {
    type = 'char';
    if (length) args = `{ length: ${length} }`;
  } else if (normalised.includes('bigint') || normalised.includes('int8')) {
    type = 'bigint';
  } else if (normalised.includes('smallint') || normalised.includes('int2')) {
    type = 'smallint';
  } else if (normalised.includes('serial')) {
    type = normalised.includes('big') ? 'bigserial' : 'serial';
  } else if (normalised.includes('int')) {
    type = 'integer';
  } else if (normalised.includes('numeric') || normalised.includes('decimal')) {
    type = 'numeric';
    if (precision) args = `{ precision: ${precision[1]}, scale: ${precision[2]} }`;
  } else if (normalised.includes('double')) {
    type = 'doublePrecision';
  } else if (normalised.includes('real') || normalised.includes('float')) {
    type = 'real';
  } else if (normalised.includes('bool')) {
    type = 'boolean';
  } else if (normalised.includes('timestamp')) {
    type = 'timestamp';
    args = normalised.includes('with time zone') ? '{ withTimezone: true }' : undefined;
  } else if (normalised.includes('date')) {
    type = 'date';
  } else if (normalised.startsWith('time')) {
    type = 'time';
    args = normalised.includes('with time zone') ? '{ withTimezone: true }' : undefined;
  } else if (normalised.includes('jsonb')) {
    type = 'jsonb';
  } else if (normalised.includes('json')) {
    type = 'json';
  }

  const extras: string[] = [];
  if (field.isPrimaryKey && !compositePrimaryKey) extras.push('primaryKey()');
  extras.push(field.isNullable ? '' : 'notNull()');

  if (field.isUnique && !field.isPrimaryKey) extras.push('unique()');

  const defaultValue = field.defaultValue?.trim();
  if (defaultValue) {
    const lower = defaultValue.toLowerCase();
    if (lower === 'current_timestamp' || lower === 'now()') {
      extras.push('defaultNow()');
    } else if (lower === 'gen_random_uuid()' || lower === 'uuid_generate_v4()') {
      extras.push('defaultRandom()');
    } else if (lower === 'current_date' || lower === 'current_time') {
      extras.push(`default(sql\`${defaultValue}\`)`);
    } else if (lower === 'true' || lower === 'false' || /^-?\d+(\.\d+)?$/.test(defaultValue)) {
      extras.push(`default(${defaultValue})`);
    } else if (/^'.*'$/.test(defaultValue)) {
      extras.push(`default(${defaultValue})`);
    } else if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(defaultValue)) {
      extras.push(`default(${JSON.stringify(defaultValue)})`);
    } else {
      extras.push(`default(sql\`${defaultValue}\`)`);
    }
  }

  if (field.references) {
    const targetTable = variables.get(field.references.table);
    const targetColumn = drizzleIdentifier(field.references.column);
    if (targetTable) {
      extras.push(`references(() => ${targetTable}.${targetColumn})`);
    }
  }

  return {
    key,
    dbName,
    type,
    args,
    extras: extras.filter(Boolean),
  };
}

export function exportDrizzle(schema: ParsedSchema): string {
  const variables = new Map<string, string>();
  const usedVariables = new Set<string>();
  for (const table of schema.tables) {
    variables.set(table.name, uniqueName(drizzleIdentifier(table.name), usedVariables));
  }

  const imports = new Set<string>(['pgTable']);
  const tableBlocks: string[] = [];
  const usesSql = schema.tables.some((table) =>
    table.fields.some((field) => {
      const value = field.defaultValue?.trim();
      if (!value) return false;
      const lower = value.toLowerCase();
      if (
        lower === 'current_timestamp' ||
        lower === 'now()' ||
        lower === 'gen_random_uuid()' ||
        lower === 'uuid_generate_v4()' ||
        lower === 'current_date' ||
        lower === 'current_time' ||
        lower === 'true' ||
        lower === 'false' ||
        /^-?\d+(\.\d+)?$/.test(value) ||
        /^'.*'$/.test(value) ||
        /^[A-Za-z_][A-Za-z0-9_]*$/.test(value)
      ) {
        return false;
      }
      return true;
    })
  );

  for (const table of schema.tables) {
    const tableVariable = variables.get(table.name) ?? drizzleIdentifier(table.name);
    const primaryKeys = table.fields.filter((field) => field.isPrimaryKey);
    const compositePrimaryKey = primaryKeys.length > 1;
    const columns = table.fields.map((field) => {
      const column = drizzleColumn(field, variables, compositePrimaryKey);
      imports.add(column.type);
      return column;
    });

    const columnLines = columns.map((column) => {
      const params = column.args
        ? `'${column.dbName}', ${column.args}`
        : `'${column.dbName}'`;
      const chain = column.extras.length > 0 ? `.${column.extras.join('.')}` : '';
      return `  ${column.key}: ${column.type}(${params})${chain},`;
    });

    let tableArgs = '';
    if (compositePrimaryKey) {
      imports.add('primaryKey');
      tableArgs = `, (table) => [primaryKey({ columns: [${primaryKeys
        .map((field) => `table.${drizzleIdentifier(field.name)}`)
        .join(', ')}] })]`;
    }

    tableBlocks.push(
      `export const ${tableVariable} = pgTable('${table.name}', {\n${columnLines.join(
        '\n'
      )}\n}${tableArgs});`
    );
  }

  const importList = Array.from(imports).sort().join(', ');
  const header = `import { ${importList} } from 'drizzle-orm/pg-core';${
    usesSql ? "\nimport { sql } from 'drizzle-orm';" : ''
  }`;

  return `${header}\n\n${tableBlocks.join('\n\n')}\n`;
}

export function exportProjectJson(input: ProjectExportInput): string {
  return `${JSON.stringify(
    {
      version: 1,
      exportedAt: new Date().toISOString(),
      name: input.name,
      sql: input.sql,
      schema: input.schema,
      notes: input.notes,
    },
    null,
    2
  )}\n`;
}
