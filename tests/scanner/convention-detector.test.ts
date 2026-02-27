import { describe, it, expect } from 'vitest';
import { detectConventions } from '../../engine/scanner/convention-detector.js';

describe('convention-detector', () => {
  it('detects camelCase naming in TS', () => {
    const files = [
      { path: 'src/userService.ts', exports: ['createUser', 'deleteUser', 'getUserById'] },
      { path: 'src/jobService.ts', exports: ['createJob', 'listJobs'] },
    ];
    const conventions = detectConventions(files, 'typescript');
    expect(conventions.naming).toBe('camelCase');
  });

  it('detects snake_case naming in Python', () => {
    const files = [
      { path: 'src/user_service.py', exports: ['create_user', 'delete_user'] },
    ];
    const conventions = detectConventions(files, 'python');
    expect(conventions.naming).toBe('snake_case');
  });

  it('detects feature-based file organization', () => {
    const files = [
      { path: 'src/users/service.ts', exports: [] },
      { path: 'src/users/router.ts', exports: [] },
      { path: 'src/jobs/service.ts', exports: [] },
      { path: 'src/jobs/router.ts', exports: [] },
    ];
    const conventions = detectConventions(files, 'typescript');
    expect(conventions.fileOrganization).toBe('feature-based');
  });

  it('detects layer-based file organization', () => {
    const files = [
      { path: 'src/services/userService.ts', exports: [] },
      { path: 'src/services/jobService.ts', exports: [] },
      { path: 'src/routes/userRoutes.ts', exports: [] },
      { path: 'src/routes/jobRoutes.ts', exports: [] },
    ];
    const conventions = detectConventions(files, 'typescript');
    expect(conventions.fileOrganization).toBe('layer-based');
  });

  it('detects error handling patterns', () => {
    const sourceSnippets = [
      'try { await doThing(); } catch (e) { logger.error(e); }',
      'try { x(); } catch (err) { throw new AppError(err); }',
    ];
    const conventions = detectConventions([], 'typescript', sourceSnippets);
    expect(conventions.errorHandling).toBe('try-catch');
  });

  it('detects co-located testing pattern', () => {
    const files = [
      { path: 'src/services/user.ts', exports: [] },
      { path: 'src/services/user.test.ts', exports: [] },
      { path: 'src/services/job.ts', exports: [] },
      { path: 'src/services/job.test.ts', exports: [] },
    ];
    const conventions = detectConventions(files, 'typescript');
    expect(conventions.testingPatterns).toBe('co-located');
  });
});
