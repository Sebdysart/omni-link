import { describe, it, expect } from 'vitest';
import { extractTypes, extractSchemas } from '../../engine/scanner/type-extractor.js';

describe('type-extractor', () => {
  it('extracts TypeScript interfaces with fields', () => {
    const source = `
export interface User {
  id: string;
  email: string;
  name?: string;
  createdAt: Date;
}
`;
    const types = extractTypes(source, 'types.ts', 'typescript', 'backend');
    expect(types).toHaveLength(1);
    expect(types[0].name).toBe('User');
    expect(types[0].fields).toHaveLength(4);
    expect(types[0].fields[2].optional).toBe(true);
  });

  it('extracts Zod schemas', () => {
    const source = `
export const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  age: z.number().optional(),
});
`;
    const schemas = extractSchemas(source, 'schemas.ts', 'typescript', 'backend');
    expect(schemas).toHaveLength(1);
    expect(schemas[0].name).toBe('createUserSchema');
    expect(schemas[0].kind).toBe('zod');
    expect(schemas[0].fields).toHaveLength(3);
  });

  it('extracts Swift Codable structs', () => {
    const source = `
struct UserDTO: Codable {
    let id: String
    let email: String
    var name: String?
}
`;
    const types = extractTypes(source, 'Models.swift', 'swift', 'ios-app');
    expect(types).toHaveLength(1);
    expect(types[0].name).toBe('UserDTO');
    expect(types[0].fields).toHaveLength(3);
    expect(types[0].fields[2].optional).toBe(true);
  });

  it('extracts Python dataclass/pydantic models', () => {
    const source = `
class User(BaseModel):
    id: str
    email: str
    name: Optional[str] = None
`;
    const types = extractTypes(source, 'models.py', 'python', 'backend');
    expect(types).toHaveLength(1);
    expect(types[0].name).toBe('User');
  });
});
