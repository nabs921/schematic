import { Parser } from '@dbml/core';

export interface ColumnDefinition {
  name: string;
  type: string;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  isUnique: boolean;
  isNullable: boolean;
  defaultValue?: string;
  references?: {
    table: string;
    column: string;
  };
}

export interface TableDefinition {
  name: string;
  fields: ColumnDefinition[];
  note?: string;
}

export interface RelationshipDefinition {
  id: string;
  sourceTable: string;
  sourceColumn: string;
  targetTable: string;
  targetColumn: string;
  cardinality: '1:1' | '1:N' | 'N:M';
  rawRelation: string;
}

export interface ParsedSchema {
  tables: TableDefinition[];
  relationships: RelationshipDefinition[];
}

export interface SqlParseError {
  message: string;
  line: number;
  column: number;
}

export interface ParseResult {
  success: boolean;
  schema: ParsedSchema | null;
  errors: SqlParseError[];
}

/**
 * Safely parses PostgreSQL DDL into a structured schema AST using @dbml/core.
 */
export function parseSqlSchema(sql: string): ParseResult {
  if (!sql || !sql.trim()) {
    return {
      success: true,
      schema: { tables: [], relationships: [] },
      errors: [],
    };
  }

  try {
    const database = Parser.parse(sql, 'postgres');
    const tables: TableDefinition[] = [];
    const relationships: RelationshipDefinition[] = [];

    // Map all tables and columns
    for (const schema of database.schemas) {
      for (const t of schema.tables) {
        const fields: ColumnDefinition[] = t.fields.map((f) => {
          let typeStr = f.type?.type_name || 'UNKNOWN';
          if (f.type?.args) {
            typeStr += `(${f.type.args})`;
          }

          let defaultVal: string | undefined;
          if (f.dbdefault) {
            defaultVal = typeof f.dbdefault === 'object' ? f.dbdefault.value : String(f.dbdefault);
          }

          return {
            name: f.name,
            type: typeStr,
            isPrimaryKey: Boolean(f.pk),
            isForeignKey: false, // will populate from refs below
            isUnique: Boolean(f.unique),
            isNullable: !f.not_null && !f.pk,
            defaultValue: defaultVal,
          };
        });

        // @dbml/core exposes column-level PKs through f.pk, but composite
        // primary keys live in the table's index list. Promote those columns so
        // the diagram badges and exporters can represent composite keys.
        const compositePk = (
          t.indexes as unknown as
            | Array<{ pk?: unknown; columns?: Array<{ value?: string }> }>
            | undefined
        )?.find((index) => Boolean(index.pk) && (index.columns?.length ?? 0) > 1);
        if (compositePk) {
          for (const column of compositePk.columns ?? []) {
            const field = fields.find((candidate) => candidate.name === column.value);
            if (field) {
              field.isPrimaryKey = true;
              field.isNullable = false;
            }
          }
        }

        tables.push({
          name: t.name,
          fields,
          note: t.note || undefined,
        });
      }

      // Map references / relationships
      for (let i = 0; i < schema.refs.length; i++) {
        const ref = schema.refs[i];
        if (!ref.endpoints || ref.endpoints.length < 2) continue;

        const ep0 = ref.endpoints[0];
        const ep1 = ref.endpoints[1];

        // Determine which side is source (FK) and target (PK)
        // In DBML postgres parser: 0..* is typically the FK table, 1 is referenced PK table
        let fkEp = ep0;
        let pkEp = ep1;

        if (ep1.relation === '0..*' || ep1.relation === '*' || ep1.relation === '1..*') {
          fkEp = ep1;
          pkEp = ep0;
        }

        const sourceTable = fkEp.tableName;
        const sourceCol = fkEp.fieldNames?.[0] || '';
        const targetTable = pkEp.tableName;
        const targetCol = pkEp.fieldNames?.[0] || '';

        // Mark column as foreign key in table definition
        const sourceTableDef = tables.find((t) => t.name === sourceTable);
        if (sourceTableDef) {
          const colDef = sourceTableDef.fields.find((f) => f.name === sourceCol);
          if (colDef) {
            colDef.isForeignKey = true;
            colDef.references = {
              table: targetTable,
              column: targetCol,
            };
          }
        }

        let cardinality: '1:1' | '1:N' | 'N:M' = '1:N';
        if (
          (fkEp.relation === '1' || fkEp.relation === '0..1') &&
          (pkEp.relation === '1' || pkEp.relation === '0..1')
        ) {
          cardinality = '1:1';
        } else if (
          (fkEp.relation === '*' || fkEp.relation === '0..*') &&
          (pkEp.relation === '*' || pkEp.relation === '0..*')
        ) {
          cardinality = 'N:M';
        }

        relationships.push({
          id: `ref-${sourceTable}-${sourceCol}-${targetTable}-${targetCol}-${i}`,
          sourceTable,
          sourceColumn: sourceCol,
          targetTable,
          targetColumn: targetCol,
          cardinality,
          rawRelation: `${sourceTable}.${sourceCol} -> ${targetTable}.${targetCol}`,
        });
      }
    }

    return {
      success: true,
      schema: { tables, relationships },
      errors: [],
    };
  } catch (error) {
    const parseError = error as {
      message?: string;
      diags?: Array<{
        text?: string;
        message?: string;
        location?: { start?: { line?: number; column?: number } };
      }>;
      location?: { start?: { line?: number; column?: number } };
    };
    const errors: SqlParseError[] = [];

    if (parseError.diags && Array.isArray(parseError.diags)) {
      for (const diag of parseError.diags) {
        errors.push({
          message: diag.text || diag.message || 'Syntax error',
          line: diag.location?.start?.line || 1,
          column: diag.location?.start?.column || 1,
        });
      }
    } else if (parseError.location) {
      errors.push({
        message: parseError.message || 'Syntax error',
        line: parseError.location.start?.line || 1,
        column: parseError.location.start?.column || 1,
      });
    } else {
      errors.push({
        message: parseError.message || 'Failed to parse SQL',
        line: 1,
        column: 1,
      });
    }

    return {
      success: false,
      schema: null,
      errors,
    };
  }
}
