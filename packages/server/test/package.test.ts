import { PACKAGE_NAME as ENGINE } from '@tidemark/engine';
import { expect, test } from 'vitest';
import { DEPENDS_ON, PACKAGE_NAME } from '../src/index.js';

// Imports the engine by package name, as real server code will, so this fails
// if the @tidemark/source condition stops resolving to engine source.
test('server resolves the engine package by name', () => {
  expect(PACKAGE_NAME).toBe('@tidemark/server');
  expect(DEPENDS_ON).toEqual([ENGINE]);
});
