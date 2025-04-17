import { runCommand } from '../../src/run-command.js';
import { TextContent } from "@modelcontextprotocol/sdk/types.js";

describe('runCommand', () => {

  test('should change workdir based on cwd arg', async () => {
    // This test verifies that the cwd parameter is properly used
    // We run the pwd command in a specific directory to check if it works
    const result = await runCommand({
      command: "pwd",
      cwd: "/"
    });
    
    // Check that the command was successful
    expect(result.isError).toBe(false);
    
    // Look for output message with name STDOUT
    const stdout = result.content.find(msg => msg.name === 'STDOUT') as TextContent;
    
    // Verify the working directory was set to the root directory
    expect(stdout).toBeTruthy();
    expect((stdout.text as string).trim()).toBe('/');
  });

  test('should handle command execution errors', async () => {
    // This test verifies that errors are properly handled
    const result = await runCommand({
      command: "nonexistentcommand",
    });
    
    // Check that the command returned an error
    expect(result.isError).toBe(true);
    
    // Look for error output message with name STDERR
    const stderr = result.content.find(msg => msg.name === 'STDERR') as TextContent;
    
    // Verify error message contains the command name
    expect(stderr).toBeTruthy();
    expect(stderr.text as string).toContain('nonexistentcommand');
  });

  test('should handle missing command parameter', async () => {
    // This test verifies how the function handles a missing command parameter
    const result = await runCommand({});
    
    // Check that the command returned an error
    expect(result.isError).toBe(true);
    
    // Look for error output message with name STDERR
    const stderr = result.content.find(msg => msg.name === 'STDERR') as TextContent;
    
    // Verify error message indicates undefined command
    expect(stderr).toBeTruthy();
    expect(stderr.text as string).toContain('undefined: command not found');
  });

  test('should execute command and return stdout', async () => {
    // This test verifies that a successful command execution returns stdout
    const result = await runCommand({
      command: "echo 'Hello World'",
    });
    
    // Check that the command was successful
    expect(result.isError).toBe(false);
    
    // Look for output message with name STDOUT
    const stdout = result.content.find(msg => msg.name === 'STDOUT') as TextContent;
    
    // Verify the output contains the expected string
    expect(stdout).toBeTruthy();
    expect((stdout.text as string).trim()).toBe('Hello World');
  });

});
