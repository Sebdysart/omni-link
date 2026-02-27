// engine/scanner/type-extractor.ts — Extracts type definitions and schema definitions from source code
import type { TypeDef, TypeField, SchemaDef } from '../types.js';
import { createParser } from './tree-sitter.js';

// ─── Type Extraction ────────────────────────────────────────────────────────

/**
 * Extract type/interface/struct definitions from source code.
 * - TypeScript: interface_declaration, type_alias_declaration
 * - Swift: struct declarations (class_declaration with `struct` keyword)
 * - Python: class definitions (BaseModel, dataclass, etc.)
 */
export function extractTypes(
  source: string,
  file: string,
  language: string,
  repo: string,
): TypeDef[] {
  if (language === 'typescript' || language === 'tsx') {
    return extractTSTypes(source, file, language, repo);
  }
  if (language === 'swift') {
    return extractSwiftTypes(source, file, repo);
  }
  if (language === 'python') {
    return extractPythonTypes(source, file, repo);
  }
  return [];
}

// ─── TypeScript Types ───────────────────────────────────────────────────────

function extractTSTypes(source: string, file: string, language: string, repo: string): TypeDef[] {
  const parser = createParser(language);
  const tree = parser.parse(source);
  const results: TypeDef[] = [];

  // Extract interfaces
  const interfaces = tree.rootNode.descendantsOfType('interface_declaration');
  for (const iface of interfaces) {
    const nameNode = iface.descendantsOfType('type_identifier')[0];
    if (!nameNode) continue;

    const body = iface.descendantsOfType('interface_body')[0];
    const fields = body ? extractTSInterfaceFields(body) : [];

    const typeDef: import('../types.js').TypeDef = {
      name: nameNode.text,
      fields,
      source: { repo, file, line: iface.startPosition.row + 1 },
    };

    // Capture extends clause: interface Foo extends A, B { ... }
    const extendsClause = iface.children.find((c: any) => c.type === 'extends_type_clause');
    if (extendsClause) {
      const parentNames: string[] = extendsClause.children
        .filter((c: any) => c.type === 'type_identifier')
        .map((c: any) => c.text as string);
      if (parentNames.length > 0) {
        typeDef.extends = parentNames;
      }
    }

    results.push(typeDef);
  }

  // Extract type aliases (only those with object type bodies have meaningful fields)
  const typeAliases = tree.rootNode.descendantsOfType('type_alias_declaration');
  for (const alias of typeAliases) {
    const nameNode = alias.descendantsOfType('type_identifier')[0];
    if (!nameNode) continue;

    // Try to find an object_type child for field extraction
    const objectType = alias.descendantsOfType('object_type')[0];
    const fields = objectType ? extractTSObjectTypeFields(objectType) : [];

    const typeDef: import('../types.js').TypeDef = {
      name: nameNode.text,
      fields,
      source: { repo, file, line: alias.startPosition.row + 1 },
    };

    // Capture intersection type parents: type Combined = TypeA & TypeB
    const intersectionNode = alias.children.find((c: any) => c.type === 'intersection_type');
    if (intersectionNode) {
      const memberNames: string[] = intersectionNode.children
        .filter((c: any) => c.type === 'type_identifier')
        .map((c: any) => c.text as string);
      if (memberNames.length > 0) {
        typeDef.extends = memberNames;
      }
    }

    results.push(typeDef);
  }

  return results;
}

function extractTSInterfaceFields(body: any): TypeField[] {
  const fields: TypeField[] = [];
  const props = body.descendantsOfType('property_signature');

  for (const prop of props) {
    // Only process direct children of this body
    if (prop.parent !== body) continue;

    const nameNode = prop.descendantsOfType('property_identifier')[0];
    if (!nameNode) continue;

    const typeAnnotation = prop.descendantsOfType('type_annotation')[0];
    const typeText = typeAnnotation
      ? typeAnnotation.text.replace(/^:\s*/, '')
      : 'unknown';

    // Check for optional marker (?)
    const hasQuestion = prop.children.some((c: any) => c.type === '?');

    fields.push({
      name: nameNode.text,
      type: typeText,
      optional: hasQuestion,
    });
  }

  return fields;
}

function extractTSObjectTypeFields(objectType: any): TypeField[] {
  const fields: TypeField[] = [];
  const props = objectType.descendantsOfType('property_signature');

  for (const prop of props) {
    if (prop.parent !== objectType) continue;

    const nameNode = prop.descendantsOfType('property_identifier')[0];
    if (!nameNode) continue;

    const typeAnnotation = prop.descendantsOfType('type_annotation')[0];
    const typeText = typeAnnotation
      ? typeAnnotation.text.replace(/^:\s*/, '')
      : 'unknown';

    const hasQuestion = prop.children.some((c: any) => c.type === '?');

    fields.push({
      name: nameNode.text,
      type: typeText,
      optional: hasQuestion,
    });
  }

  return fields;
}

// ─── Swift Types ────────────────────────────────────────────────────────────

function extractSwiftTypes(source: string, file: string, repo: string): TypeDef[] {
  const parser = createParser('swift');
  const tree = parser.parse(source);
  const results: TypeDef[] = [];

  // tree-sitter-swift uses class_declaration for both struct and class
  const classDecls = tree.rootNode.descendantsOfType('class_declaration');
  for (const decl of classDecls) {
    const nameNode = decl.descendantsOfType('type_identifier')[0];
    if (!nameNode) continue;

    const body = decl.descendantsOfType('class_body')[0];
    const fields = body ? extractSwiftFields(body) : [];

    results.push({
      name: nameNode.text,
      fields,
      source: { repo, file, line: decl.startPosition.row + 1 },
    });
  }

  return results;
}

function extractSwiftFields(body: any): TypeField[] {
  const fields: TypeField[] = [];
  const props = body.descendantsOfType('property_declaration');

  for (const prop of props) {
    // Only direct children of this body
    if (prop.parent !== body) continue;

    // Get name from pattern > simple_identifier
    const pattern = prop.descendantsOfType('pattern')[0];
    const nameNode = pattern?.descendantsOfType('simple_identifier')[0];
    if (!nameNode) continue;

    // Get type from type_annotation
    const typeAnnotation = prop.descendantsOfType('type_annotation')[0];
    let typeText = 'Any';
    let optional = false;

    if (typeAnnotation) {
      typeText = typeAnnotation.text.replace(/^:\s*/, '');
      // Check for optional_type child
      const optionalType = typeAnnotation.descendantsOfType('optional_type')[0];
      if (optionalType) {
        optional = true;
      }
    }

    fields.push({
      name: nameNode.text,
      type: typeText,
      optional,
    });
  }

  return fields;
}

// ─── Python Types ───────────────────────────────────────────────────────────

function extractPythonTypes(source: string, file: string, repo: string): TypeDef[] {
  const parser = createParser('python');
  const tree = parser.parse(source);
  const results: TypeDef[] = [];

  const classDefs = tree.rootNode.descendantsOfType('class_definition');
  for (const classDef of classDefs) {
    const nameNode = classDef.childForFieldName('name');
    if (!nameNode) continue;

    const body = classDef.childForFieldName('body');
    const fields = body ? extractPythonFields(body) : [];

    results.push({
      name: nameNode.text,
      fields,
      source: { repo, file, line: classDef.startPosition.row + 1 },
    });
  }

  return results;
}

function extractPythonFields(body: any): TypeField[] {
  const fields: TypeField[] = [];

  // Look for expression_statement > assignment with type annotations
  const statements = body.descendantsOfType('expression_statement');
  for (const stmt of statements) {
    if (stmt.parent !== body) continue;

    const assignment = stmt.descendantsOfType('assignment')[0];
    if (!assignment) continue;

    // Check if assignment has a type annotation (: after identifier)
    const hasColon = assignment.children.some((c: any) => c.type === ':');
    if (!hasColon) continue;

    // Get name (first identifier child)
    const nameNode = assignment.children.find((c: any) => c.type === 'identifier');
    if (!nameNode) continue;

    // Get type (the 'type' node child)
    const typeNode = assignment.descendantsOfType('type')[0];
    let typeText = 'Any';
    let optional = false;

    if (typeNode) {
      typeText = typeNode.text;
      // Check for Optional[...] pattern
      if (typeText.startsWith('Optional[') || typeText === 'None') {
        optional = true;
      }
    }

    // Also check if default value is None
    const noneNode = assignment.descendantsOfType('none')[0];
    if (noneNode) {
      optional = true;
    }

    fields.push({
      name: nameNode.text,
      type: typeText,
      optional,
    });
  }

  return fields;
}

// ─── Schema Extraction ──────────────────────────────────────────────────────

/**
 * Extract schema definitions (Zod, Joi, etc.) from source code.
 * Currently supports:
 * - TypeScript: z.object({...}) patterns (Zod schemas)
 */
export function extractSchemas(
  source: string,
  file: string,
  language: string,
  repo: string,
): SchemaDef[] {
  if (language === 'typescript' || language === 'tsx' || language === 'javascript') {
    return extractZodSchemas(source, file, language, repo);
  }
  return [];
}

function extractZodSchemas(source: string, file: string, language: string, repo: string): SchemaDef[] {
  const parser = createParser(language);
  const tree = parser.parse(source);
  const results: SchemaDef[] = [];

  // Find variable declarations where the init is a z.object(...) call
  const declarators = tree.rootNode.descendantsOfType('variable_declarator');
  for (const declarator of declarators) {
    const nameNode = declarator.childForFieldName('name');
    const valueNode = declarator.childForFieldName('value');
    if (!nameNode || !valueNode) continue;

    // Check if the value is a z.object() call (possibly chained)
    const zodObjectCall = findZodObjectCall(valueNode);
    if (!zodObjectCall) continue;

    // Extract fields from the object argument
    const args = zodObjectCall.childForFieldName('arguments');
    if (!args) continue;

    const objArg = args.namedChildren.find((c: any) => c.type === 'object');
    if (!objArg) continue;

    const fields = extractZodFields(objArg);

    results.push({
      name: nameNode.text,
      kind: 'zod',
      fields,
      source: { repo, file, line: declarator.startPosition.row + 1 },
    });
  }

  return results;
}

/**
 * Find a z.object() call expression within a node (may be nested in chains).
 */
function findZodObjectCall(node: any): any | null {
  if (node.type === 'call_expression') {
    const funcNode = node.childForFieldName('function');
    if (funcNode?.type === 'member_expression') {
      const obj = funcNode.childForFieldName('object');
      const prop = funcNode.childForFieldName('property');
      if (obj?.text === 'z' && prop?.text === 'object') {
        return node;
      }
    }
  }

  // Recurse into call_expression children (for chained calls)
  for (const child of node.namedChildren) {
    const found = findZodObjectCall(child);
    if (found) return found;
  }

  return null;
}

function extractZodFields(objNode: any): TypeField[] {
  const fields: TypeField[] = [];

  const pairs = objNode.descendantsOfType('pair');
  for (const pair of pairs) {
    // Only direct children of this object
    if (pair.parent !== objNode) continue;

    const keyNode = pair.childForFieldName('key');
    if (!keyNode) continue;

    const valueNode = pair.childForFieldName('value');
    const typeText = valueNode ? inferZodType(valueNode.text) : 'unknown';
    const optional = valueNode ? valueNode.text.includes('.optional()') || valueNode.text.includes('.nullable()') : false;

    fields.push({
      name: keyNode.text,
      type: typeText,
      optional,
    });
  }

  return fields;
}

/**
 * Infer a human-readable type from a Zod chain expression.
 */
function inferZodType(zodExpr: string): string {
  // Match the base z.TYPE() pattern
  const match = zodExpr.match(/z\.(\w+)/);
  if (!match) return 'unknown';

  const zodType = match[1];
  const typeMap: Record<string, string> = {
    string: 'string',
    number: 'number',
    boolean: 'boolean',
    date: 'Date',
    bigint: 'bigint',
    object: 'object',
    array: 'array',
    enum: 'enum',
    union: 'union',
    literal: 'literal',
    any: 'any',
    unknown: 'unknown',
    void: 'void',
    null: 'null',
    undefined: 'undefined',
    never: 'never',
  };

  return typeMap[zodType] ?? zodType;
}
