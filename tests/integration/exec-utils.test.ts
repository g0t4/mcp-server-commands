import { execFileWithInput } from '../../src/exec-utils.js';

describe('execFileWithInput integration tests', () => {
  test('should execute a simple bash command', async () => {
    const result = await execFileWithInput('bash', 'echo "Hello World"', {});
    expect(result.stdout.trim()).toBe('Hello World');
    expect(result.stderr).toBe('');
  });

  test('should handle command errors properly', async () => {
    try {
      await execFileWithInput('bash', 'nonexistentcommand', {});
      fail('Should have thrown an error');
    } catch (error: any) {
      expect(error.stderr).toContain('nonexistentcommand');
      expect(error.message).toBeTruthy();
    }
  });

  test('should handle fish shell command', async () => {
    const result = await execFileWithInput('fish', 'echo "Hello from Fish"', {});
    expect(result.stdout.trim()).toBe('Hello from Fish');
    expect(result.stderr).toBe('');
  });

  test('should respect working directory option', async () => {
    const result = await execFileWithInput(
      'bash',
      'pwd',
      { cwd: '/tmp' }
    );
    expect(result.stdout.trim()).toBe('/tmp');
  });

  test('should handle multiline scripts', async () => {
    const script = `
      echo "Line 1"
      echo "Line 2"
      echo "Line 3"
    `;
    const result = await execFileWithInput('bash', script, {});
    expect(result.stdout).toContain('Line 1');
    expect(result.stdout).toContain('Line 2');
    expect(result.stdout).toContain('Line 3');
  });
});
