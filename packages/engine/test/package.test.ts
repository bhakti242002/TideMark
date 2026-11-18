import { expect, test } from 'vitest';
import { PACKAGE_NAME } from '../src/index.js';

test('engine package exposes its name', () => {
  expect(PACKAGE_NAME).toBe('@tidemark/engine');
});
