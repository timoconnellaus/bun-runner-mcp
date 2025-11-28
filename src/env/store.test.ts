import { describe, test, expect } from 'bun:test';
import { parseEnvFile } from './store.js';

// ============================================================
// parseEnvFile - parse dotenv-style file content
// ============================================================
describe('parseEnvFile', () => {
  describe('basic parsing', () => {
    test('parses simple key=value', () => {
      const content = 'API_KEY=abc123';
      expect(parseEnvFile(content)).toEqual({ API_KEY: 'abc123' });
    });

    test('parses multiple variables', () => {
      const content = `API_KEY=abc123
DATABASE_URL=postgres://localhost
DEBUG=true`;
      expect(parseEnvFile(content)).toEqual({
        API_KEY: 'abc123',
        DATABASE_URL: 'postgres://localhost',
        DEBUG: 'true',
      });
    });

    test('handles empty content', () => {
      expect(parseEnvFile('')).toEqual({});
    });

    test('handles whitespace-only content', () => {
      expect(parseEnvFile('   \n\n   ')).toEqual({});
    });
  });

  describe('comments', () => {
    test('ignores comment lines starting with #', () => {
      const content = `# This is a comment
API_KEY=value
# Another comment
SECRET=hidden`;
      expect(parseEnvFile(content)).toEqual({
        API_KEY: 'value',
        SECRET: 'hidden',
      });
    });
  });

  describe('empty lines', () => {
    test('ignores empty lines', () => {
      const content = `

API_KEY=value

SECRET=hidden

`;
      expect(parseEnvFile(content)).toEqual({
        API_KEY: 'value',
        SECRET: 'hidden',
      });
    });
  });

  describe('quoted values', () => {
    test('strips double quotes from value', () => {
      const content = 'MESSAGE="Hello World"';
      expect(parseEnvFile(content)).toEqual({ MESSAGE: 'Hello World' });
    });

    test('strips single quotes from value', () => {
      const content = "MESSAGE='Hello World'";
      expect(parseEnvFile(content)).toEqual({ MESSAGE: 'Hello World' });
    });

    test('handles mismatched quotes (no stripping)', () => {
      const content = 'MESSAGE="Hello\'';
      expect(parseEnvFile(content)).toEqual({ MESSAGE: '"Hello\'' });
    });

    test('handles empty quoted string', () => {
      const content = 'EMPTY=""';
      expect(parseEnvFile(content)).toEqual({ EMPTY: '' });
    });

    test('preserves spaces in quoted values', () => {
      const content = 'PATH="  /usr/local/bin  "';
      expect(parseEnvFile(content)).toEqual({ PATH: '  /usr/local/bin  ' });
    });
  });

  describe('whitespace handling', () => {
    test('trims whitespace around key', () => {
      const content = '  API_KEY  =value';
      expect(parseEnvFile(content)).toEqual({ API_KEY: 'value' });
    });

    test('trims whitespace around value', () => {
      const content = 'API_KEY=  value  ';
      expect(parseEnvFile(content)).toEqual({ API_KEY: 'value' });
    });

    test('trims both key and value', () => {
      const content = '  API_KEY  =  value  ';
      expect(parseEnvFile(content)).toEqual({ API_KEY: 'value' });
    });
  });

  describe('edge cases', () => {
    test('handles value with equals sign', () => {
      const content = 'CONNECTION=postgres://user:pass@host/db?ssl=true';
      expect(parseEnvFile(content)).toEqual({
        CONNECTION: 'postgres://user:pass@host/db?ssl=true',
      });
    });

    test('handles empty value', () => {
      const content = 'EMPTY=';
      expect(parseEnvFile(content)).toEqual({ EMPTY: '' });
    });

    test('ignores lines without = sign', () => {
      const content = `VALID=value
INVALID_NO_EQUALS
ALSO_VALID=123`;
      expect(parseEnvFile(content)).toEqual({
        VALID: 'value',
        ALSO_VALID: '123',
      });
    });

    test('handles key with numbers', () => {
      const content = 'KEY123=value';
      expect(parseEnvFile(content)).toEqual({ KEY123: 'value' });
    });

    test('handles special characters in value', () => {
      const content = 'SPECIAL=!@#$%^&*()';
      expect(parseEnvFile(content)).toEqual({ SPECIAL: '!@#$%^&*()' });
    });

    test('overwrites duplicate keys (last wins)', () => {
      const content = `KEY=first
KEY=second
KEY=third`;
      expect(parseEnvFile(content)).toEqual({ KEY: 'third' });
    });

    test('skips line with empty key', () => {
      const content = '=value\nVALID=ok';
      expect(parseEnvFile(content)).toEqual({ VALID: 'ok' });
    });
  });

  describe('real-world examples', () => {
    test('parses typical .env file', () => {
      const content = `# Database configuration
DATABASE_URL="postgres://user:password@localhost:5432/mydb"
DATABASE_POOL_SIZE=10

# API Keys
STRIPE_KEY=sk_test_abc123
STRIPE_WEBHOOK_SECRET='whsec_xyz789'

# Feature flags
ENABLE_NEW_FEATURE=true
DEBUG=false

# Empty optional value
OPTIONAL_CONFIG=`;

      const result = parseEnvFile(content);
      expect(result).toEqual({
        DATABASE_URL: 'postgres://user:password@localhost:5432/mydb',
        DATABASE_POOL_SIZE: '10',
        STRIPE_KEY: 'sk_test_abc123',
        STRIPE_WEBHOOK_SECRET: 'whsec_xyz789',
        ENABLE_NEW_FEATURE: 'true',
        DEBUG: 'false',
        OPTIONAL_CONFIG: '',
      });
    });
  });
});

// ============================================================
// loadEnvVars, getEnvVars, getEnvVarNames tests would go here
// with mocked Bun.file and process.env
// See Phase 2 of the test plan for implementation
// ============================================================
