import { execFileWithInput } from '../../src/exec-utils.js';

describe('execFileWithInput integration tests', () => {
  test('should execute a simple bash command', async () => {
    const result = await execFileWithInput('bash', 'echo "Hello World"', {});
    expect(result.stdout.trim()).toBe('Hello World');
    expect(result.stderr).toBe('');
  });

  test('should handle command errors properly in bash', async () => {
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

  test('should handle command errors properly in fish', async () => {
    try {
      await execFileWithInput('fish', 'totallynonexistentcommand', {});
      fail('Should have thrown an error');
    } catch (error: any) {
      expect(error.stderr).toContain('totallynonexistentcommand');
      expect(error.message).toBeTruthy();
    }
  });

  test('should execute zsh command', async () => {
    const result = await execFileWithInput('zsh', 'echo "Hello from Zsh"', {});
    expect(result.stdout.trim()).toBe('Hello from Zsh');
    expect(result.stderr).toBe('');
  });

  test('should handle command errors properly in zsh', async () => {
    try {
      await execFileWithInput('zsh', 'completelynonexistentcommand', {});
      fail('Should have thrown an error');
    } catch (error: any) {
      expect(error.stderr).toContain('completelynonexistentcommand');
      expect(error.message).toBeTruthy();
    }
  });

  test('should handle multiline scripts in zsh', async () => {
    const script = `
      echo "Line 1 from Zsh"
      for i in 1 2 3; do
        echo "Number $i"
      done
    `;
    const result = await execFileWithInput('zsh', script, {});
    expect(result.stdout).toContain('Line 1 from Zsh');
    expect(result.stdout).toContain('Number 1');
    expect(result.stdout).toContain('Number 2');
    expect(result.stdout).toContain('Number 3');
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
