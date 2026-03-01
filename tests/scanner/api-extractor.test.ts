import { describe, it, expect } from 'vitest';
import { extractRoutes, extractExports, extractProcedures, extractSwiftApiCallSites } from '../../engine/scanner/api-extractor.js';

describe('api-extractor', () => {
  describe('extractExports (TypeScript)', () => {
    it('extracts exported functions', () => {
      const source = `
export function createUser(input: CreateUserInput): User {
  return db.insert(input);
}
export const deleteUser = (id: string) => db.delete(id);
`;
      const exports = extractExports(source, 'test.ts', 'typescript');
      expect(exports).toHaveLength(2);
      expect(exports[0].name).toBe('createUser');
      expect(exports[0].kind).toBe('function');
      expect(exports[1].name).toBe('deleteUser');
    });

    it('extracts exported classes', () => {
      const source = `export class UserService { }`;
      const exports = extractExports(source, 'test.ts', 'typescript');
      expect(exports[0].kind).toBe('class');
      expect(exports[0].name).toBe('UserService');
    });

    it('extracts exported types and interfaces', () => {
      const source = `
export interface User { id: string; name: string; }
export type UserId = string;
`;
      const exports = extractExports(source, 'test.ts', 'typescript');
      expect(exports).toHaveLength(2);
      expect(exports.find(e => e.name === 'User')?.kind).toBe('interface');
      expect(exports.find(e => e.name === 'UserId')?.kind).toBe('type');
    });
  });

  describe('extractRoutes (TypeScript — Hono/Express)', () => {
    it('extracts Hono route definitions', () => {
      const source = `
app.get('/api/users', (c) => c.json(users));
app.post('/api/users', async (c) => { });
app.delete('/api/users/:id', handler);
`;
      const routes = extractRoutes(source, 'routes.ts', 'typescript');
      expect(routes).toHaveLength(3);
      expect(routes[0]).toMatchObject({ method: 'GET', path: '/api/users' });
      expect(routes[1]).toMatchObject({ method: 'POST', path: '/api/users' });
      expect(routes[2]).toMatchObject({ method: 'DELETE', path: '/api/users/:id' });
    });
  });

  describe('extractProcedures (TypeScript — tRPC)', () => {
    it('extracts tRPC procedure definitions', () => {
      const source = `
export const userRouter = router({
  getUser: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => { }),
  createUser: publicProcedure
    .input(createUserSchema)
    .mutation(async ({ input }) => { }),
});
`;
      const procs = extractProcedures(source, 'router.ts', 'typescript');
      expect(procs).toHaveLength(2);
      expect(procs[0]).toMatchObject({ name: 'getUser', kind: 'query' });
      expect(procs[1]).toMatchObject({ name: 'createUser', kind: 'mutation' });
    });
  });

  describe('extractExports (Swift)', () => {
    it('extracts Swift functions and structs', () => {
      const source = `
func fetchUser(id: String) async throws -> User {
    return try await api.get("/users/\\(id)")
}
struct UserDTO: Codable {
    let id: String
    let name: String
}
class UserService {
    func create() { }
}
`;
      const exports = extractExports(source, 'User.swift', 'swift');
      expect(exports.find(e => e.name === 'fetchUser')).toBeDefined();
      expect(exports.find(e => e.name === 'UserDTO')?.kind).toBe('class');
      expect(exports.find(e => e.name === 'UserService')?.kind).toBe('class');
    });
  });

  describe('GraphQL extraction', () => {
    it('extracts Query fields from GraphQL schema as routes', () => {
      const source = `
    type Query {
      users: [User]
      post(id: ID!): Post
    }
  `;
      const routes = extractRoutes(source, 'schema.graphql', 'graphql');
      expect(routes.find(r => r.handler === 'users')).toBeDefined();
      expect(routes.find(r => r.handler === 'post')).toBeDefined();
      expect(routes.find(r => r.handler === 'users')?.method).toBe('QUERY');
      expect(routes.find(r => r.handler === 'post')?.method).toBe('QUERY');
    });

    it('extracts Mutation fields from GraphQL schema as routes', () => {
      const source = `
    type Mutation {
      createUser(input: CreateUserInput!): User
      deletePost(id: ID!): Boolean
    }
  `;
      const routes = extractRoutes(source, 'schema.graphql', 'graphql');
      expect(routes.find(r => r.handler === 'createUser')).toBeDefined();
      expect(routes.find(r => r.handler === 'deletePost')).toBeDefined();
      expect(routes.find(r => r.handler === 'createUser')?.method).toBe('MUTATION');
      expect(routes.find(r => r.handler === 'deletePost')?.method).toBe('MUTATION');
    });

    it('extracts Subscription fields from GraphQL schema as routes', () => {
      const source = `
    type Subscription {
      messageAdded: Message
    }
  `;
      const routes = extractRoutes(source, 'schema.graphql', 'graphql');
      expect(routes.find(r => r.handler === 'messageAdded')).toBeDefined();
      expect(routes.find(r => r.handler === 'messageAdded')?.method).toBe('SUBSCRIPTION');
    });

    it('does not extract non-root type fields as routes', () => {
      const source = `
    type User {
      id: ID!
      name: String
    }
  `;
      const routes = extractRoutes(source, 'schema.graphql', 'graphql');
      expect(routes).toHaveLength(0);
    });

    it('extracts fields from single-line type block', () => {
      const source = `type Query { health: Boolean }`;
      const routes = extractRoutes(source, 'schema.graphql', 'graphql');
      expect(routes.some(r => r.handler === 'health' && r.method === 'QUERY')).toBe(true);
    });
  });
});

describe('extractSwiftApiCallSites', () => {
  it('extracts URL path strings from Swift source', () => {
    const source = `
class UserService {
    func fetchUsers() async throws -> [User] {
        return try await apiClient.get("/api/users")
    }
    func createUser(_ body: CreateUserBody) async throws -> User {
        return try await apiClient.post("/api/users", body: body)
    }
}`;
    const results = extractSwiftApiCallSites(source, 'Services/UserService.swift');
    expect(results.length).toBeGreaterThan(0);
    const urlEntry = results.find(r => r.signature.includes('/api/users'));
    expect(urlEntry).toBeDefined();
    expect(urlEntry!.file).toBe('Services/UserService.swift');
    expect(urlEntry!.kind).toBe('constant');
  });

  it('extracts tRPC procedure names from Swift source', () => {
    const source = `
class PostService {
    func createPost(body: CreatePostBody) async throws -> Post {
        return try await trpcClient.mutation("post.create", body: body)
    }
    func listPosts() async throws -> [Post] {
        return try await trpcClient.query("post.list")
    }
}`;
    const results = extractSwiftApiCallSites(source, 'Services/PostService.swift');
    const createEntry = results.find(r => r.signature === 'post.create');
    const listEntry = results.find(r => r.signature === 'post.list');
    expect(createEntry).toBeDefined();
    expect(listEntry).toBeDefined();
    expect(createEntry!.file).toBe('Services/PostService.swift');
  });

  it('returns empty array for Swift source with no API calls', () => {
    const source = `
struct User: Codable {
    let id: String
    let name: String
}`;
    const results = extractSwiftApiCallSites(source, 'Models/User.swift');
    expect(results).toEqual([]);
  });

  it('does not extract non-API string literals', () => {
    const source = `
let greeting = "Hello world"
let errorMessage = "Something went wrong"
let version = "1.0.0"`;
    const results = extractSwiftApiCallSites(source, 'test.swift');
    expect(results).toHaveLength(0);
  });

  it('deduplicates repeated URL references in the same file', () => {
    const source = `
class Service {
    func a() async throws { return try await client.get("/api/posts") }
    func b() async throws { return try await client.get("/api/posts") }
}`;
    const results = extractSwiftApiCallSites(source, 'Services/Service.swift');
    const posts = results.filter(r => r.signature === '/api/posts');
    // Should only appear once (deduped by value+file key)
    expect(posts).toHaveLength(1);
  });
});
