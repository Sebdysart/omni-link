// engine/scanner/api-extractor.ts — Extracts exports, routes, and tRPC procedures from source code
import type { ExportDef, RouteDefinition, ProcedureDef } from '../types.js';
import { createParser } from './tree-sitter.js';

// ─── Exports ────────────────────────────────────────────────────────────────

/**
 * Extract exported symbols from source code.
 * - TypeScript: walks export_statement nodes
 * - Swift: walks top-level function_declaration, class_declaration (struct/class)
 */
export function extractExports(
  source: string,
  file: string,
  language: string,
): ExportDef[] {
  if (language === 'typescript' || language === 'tsx') {
    return extractTSExports(source, file, language);
  }
  if (language === 'swift') {
    return extractSwiftExports(source, file);
  }
  return [];
}

function extractTSExports(source: string, file: string, language: string): ExportDef[] {
  const parser = createParser(language);
  const tree = parser.parse(source);
  const results: ExportDef[] = [];

  const exportNodes = tree.rootNode.descendantsOfType('export_statement');
  for (const exportNode of exportNodes) {
    const declaration = exportNode.namedChildren.find((c: any) =>
      [
        'function_declaration',
        'class_declaration',
        'interface_declaration',
        'type_alias_declaration',
        'lexical_declaration',
        'enum_declaration',
      ].includes(c.type),
    );
    if (!declaration) continue;

    switch (declaration.type) {
      case 'function_declaration': {
        const nameNode = declaration.childForFieldName('name');
        if (nameNode) {
          results.push({
            name: nameNode.text,
            kind: 'function',
            signature: declaration.text.split('{')[0].trim(),
            file,
            line: declaration.startPosition.row + 1,
          });
        }
        break;
      }
      case 'class_declaration': {
        const nameNode = declaration.descendantsOfType('type_identifier')[0];
        if (nameNode) {
          results.push({
            name: nameNode.text,
            kind: 'class',
            signature: `class ${nameNode.text}`,
            file,
            line: declaration.startPosition.row + 1,
          });
        }
        break;
      }
      case 'interface_declaration': {
        const nameNode = declaration.descendantsOfType('type_identifier')[0];
        if (nameNode) {
          results.push({
            name: nameNode.text,
            kind: 'interface',
            signature: `interface ${nameNode.text}`,
            file,
            line: declaration.startPosition.row + 1,
          });
        }
        break;
      }
      case 'type_alias_declaration': {
        const nameNode = declaration.descendantsOfType('type_identifier')[0];
        if (nameNode) {
          results.push({
            name: nameNode.text,
            kind: 'type',
            signature: declaration.text.replace(/;$/, '').trim(),
            file,
            line: declaration.startPosition.row + 1,
          });
        }
        break;
      }
      case 'enum_declaration': {
        const nameNode = declaration.descendantsOfType('identifier')[0];
        if (nameNode) {
          results.push({
            name: nameNode.text,
            kind: 'enum',
            signature: `enum ${nameNode.text}`,
            file,
            line: declaration.startPosition.row + 1,
          });
        }
        break;
      }
      case 'lexical_declaration': {
        const declarators = declaration.descendantsOfType('variable_declarator');
        for (const declarator of declarators) {
          const nameNode = declarator.childForFieldName('name');
          if (!nameNode) continue;
          const valueNode = declarator.childForFieldName('value');
          const isFunction =
            valueNode &&
            (valueNode.type === 'arrow_function' ||
              valueNode.type === 'function_expression' ||
              valueNode.type === 'function');
          results.push({
            name: nameNode.text,
            kind: isFunction ? 'function' : 'constant',
            signature: declarator.text,
            file,
            line: declarator.startPosition.row + 1,
          });
        }
        break;
      }
    }
  }

  return results;
}

function extractSwiftExports(source: string, file: string): ExportDef[] {
  const parser = createParser('swift');
  const tree = parser.parse(source);
  const results: ExportDef[] = [];
  const root = tree.rootNode;

  // Top-level function_declaration
  for (const child of root.namedChildren) {
    if (child.type === 'function_declaration') {
      const nameNode = child.descendantsOfType('simple_identifier')[0];
      if (nameNode) {
        results.push({
          name: nameNode.text,
          kind: 'function',
          signature: child.text.split('{')[0].trim(),
          file,
          line: child.startPosition.row + 1,
        });
      }
    } else if (child.type === 'class_declaration') {
      // tree-sitter-swift uses class_declaration for both struct and class
      const nameNode = child.descendantsOfType('type_identifier')[0];
      if (nameNode) {
        results.push({
          name: nameNode.text,
          kind: 'class',
          signature: child.text.split('{')[0].trim(),
          file,
          line: child.startPosition.row + 1,
        });
      }
    } else if (child.type === 'protocol_declaration') {
      const nameNode = child.descendantsOfType('type_identifier')[0];
      if (nameNode) {
        results.push({
          name: nameNode.text,
          kind: 'interface',
          signature: child.text.split('{')[0].trim(),
          file,
          line: child.startPosition.row + 1,
        });
      }
    }
  }

  return results;
}

// ─── Routes ─────────────────────────────────────────────────────────────────

const HTTP_METHODS = new Set(['get', 'post', 'put', 'delete', 'patch', 'options', 'head']);

/**
 * Extract GraphQL operations (Query/Mutation/Subscription fields) from SDL source.
 *
 * Known limitations:
 * - Fields with multi-line argument lists are not extracted (args must be on the same line
 *   as the field name, e.g., `field(arg: Type): ReturnType`).
 * - Fields inside inline type declarations (e.g., `type Query { field: T }`) are extracted
 *   only if they fit on a single field per line.
 */
function extractGraphQLOperations(source: string, file: string): RouteDefinition[] {
  const routes: RouteDefinition[] = [];
  const ROOT_TYPES = ['Query', 'Mutation', 'Subscription'];

  let currentRootType: string | null = null;
  let braceDepth = 0;
  let lineNumber = 0;

  for (const rawLine of source.split('\n')) {
    lineNumber++;
    const line = rawLine.trim();

    // Check if entering a root type block
    if (currentRootType === null) {
      for (const rootType of ROOT_TYPES) {
        if (new RegExp(`^type\\s+${rootType}\\s*\\{`).test(line)) {
          currentRootType = rootType;
          braceDepth = 1;

          // Handle single-line type blocks: type Query { field: T }
          const afterBrace = line.replace(/^[^{]*\{/, '').trim();
          if (afterBrace) {
            // Check if block closes on same line
            if (afterBrace.includes('}')) {
              // Extract any fields between { and }
              const inlineContent = afterBrace.replace(/}.*$/, '').trim();
              const inlineField = inlineContent.match(/^(\w+)\s*(?:\([^)]*\))?\s*:/);
              if (inlineField) {
                routes.push({
                  method: currentRootType.toUpperCase(),
                  path: `/${inlineField[1]}`,
                  handler: inlineField[1],
                  file,
                  line: lineNumber,
                });
              }
              currentRootType = null;
              braceDepth = 0;
            }
            // If not closing on same line, the next loop iteration will pick up
          }
          break; // done checking ROOT_TYPES
        }
      }
      continue;
    }

    // We are inside a root type block — track brace depth
    for (const ch of line) {
      if (ch === '{') braceDepth++;
      else if (ch === '}') braceDepth--;
    }

    if (braceDepth <= 0) {
      currentRootType = null;
      braceDepth = 0;
      continue;
    }

    // Extract field name at depth 1: fieldName(args): ReturnType or fieldName: ReturnType
    if (braceDepth === 1) {
      const fieldMatch = line.match(/^(\w+)\s*(?:\([^)]*\))?\s*:/);
      if (fieldMatch) {
        routes.push({
          method: currentRootType.toUpperCase(),
          path: `/${fieldMatch[1]}`,
          handler: fieldMatch[1],
          file,
          line: lineNumber,
        });
      }
    }
  }

  return routes;
}

/**
 * Extract HTTP route definitions from Hono/Express-style code.
 * Looks for `app.METHOD(path, handler)` patterns.
 * Also handles GraphQL SDL files (.graphql/.gql) via SDL parsing.
 */
export function extractRoutes(
  source: string,
  file: string,
  language: string,
): RouteDefinition[] {
  if (language === 'graphql') {
    return extractGraphQLOperations(source, file);
  }

  if (language !== 'typescript' && language !== 'tsx' && language !== 'javascript') {
    return [];
  }

  const parser = createParser(language);
  const tree = parser.parse(source);
  const results: RouteDefinition[] = [];

  const callExpressions = tree.rootNode.descendantsOfType('call_expression');
  for (const call of callExpressions) {
    const funcNode = call.childForFieldName('function');
    if (!funcNode || funcNode.type !== 'member_expression') continue;

    const propertyNode = funcNode.childForFieldName('property');
    if (!propertyNode) continue;

    const method = propertyNode.text.toLowerCase();
    if (!HTTP_METHODS.has(method)) continue;

    const args = call.childForFieldName('arguments');
    if (!args) continue;

    // First argument should be a string literal (the path)
    const firstArg = args.namedChildren[0];
    if (!firstArg) continue;

    let path: string | null = null;
    if (firstArg.type === 'string' || firstArg.type === 'template_string') {
      // Strip surrounding quotes
      path = firstArg.text.replace(/^['"`]|['"`]$/g, '');
    }
    if (!path) continue;

    // Handler is second argument (or rest of args)
    const handlerNode = args.namedChildren[1];
    const handler = handlerNode?.text ?? '';

    results.push({
      method: method.toUpperCase(),
      path,
      handler,
      file,
      line: call.startPosition.row + 1,
    });
  }

  return results;
}

// ─── tRPC Procedures ────────────────────────────────────────────────────────

/**
 * Extract tRPC procedure definitions from router({...}) patterns.
 * Each property in the router object maps to a procedure name.
 * The chain terminator (.query/.mutation/.subscription) determines the kind.
 */
export function extractProcedures(
  source: string,
  file: string,
  language: string,
): ProcedureDef[] {
  if (language !== 'typescript' && language !== 'tsx' && language !== 'javascript') {
    return [];
  }

  const parser = createParser(language);
  const tree = parser.parse(source);
  const results: ProcedureDef[] = [];

  // Find all call_expression nodes where the function is `router`
  const callExpressions = tree.rootNode.descendantsOfType('call_expression');
  for (const call of callExpressions) {
    const funcNode = call.childForFieldName('function');
    if (!funcNode) continue;

    // router(...) direct call
    const isRouterCall =
      (funcNode.type === 'identifier' && funcNode.text === 'router') ||
      (funcNode.type === 'member_expression' &&
        funcNode.childForFieldName('property')?.text === 'router');

    if (!isRouterCall) continue;

    const args = call.childForFieldName('arguments');
    if (!args) continue;

    // First argument should be an object
    const objArg = args.namedChildren.find((c: any) => c.type === 'object');
    if (!objArg) continue;

    // Each pair in the object is a procedure
    const pairs = objArg.descendantsOfType('pair');
    for (const pair of pairs) {
      // Only process direct children (not nested objects)
      if (pair.parent !== objArg) continue;

      const keyNode = pair.childForFieldName('key');
      const valueNode = pair.childForFieldName('value');
      if (!keyNode || !valueNode) continue;

      const procName = keyNode.text;
      const kind = detectProcedureKind(valueNode);
      if (!kind) continue;

      results.push({
        name: procName,
        kind,
        file,
        line: pair.startPosition.row + 1,
      });
    }
  }

  return results;
}

/**
 * Walk a call chain to find the terminal .query(), .mutation(), or .subscription() call.
 */
function detectProcedureKind(node: any): 'query' | 'mutation' | 'subscription' | null {
  // The value is typically a call_expression chain like:
  //   publicProcedure.input(...).query(...)
  // The outermost call_expression has a member_expression whose property is the kind.
  if (node.type === 'call_expression') {
    const funcNode = node.childForFieldName('function');
    if (funcNode?.type === 'member_expression') {
      const prop = funcNode.childForFieldName('property')?.text;
      if (prop === 'query' || prop === 'mutation' || prop === 'subscription') {
        return prop as 'query' | 'mutation' | 'subscription';
      }
    }
  }

  // Recurse into call_expression children
  const callChildren = node.descendantsOfType('call_expression');
  for (const child of callChildren) {
    if (child === node) continue;
    const funcNode = child.childForFieldName('function');
    if (funcNode?.type === 'member_expression') {
      const prop = funcNode.childForFieldName('property')?.text;
      if (prop === 'query' || prop === 'mutation' || prop === 'subscription') {
        return prop as 'query' | 'mutation' | 'subscription';
      }
    }
  }

  return null;
}
