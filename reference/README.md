# Reference: the Tidemark prototype engine

`engine.js` and `data.js` are the engine and dataset from the original Tidemark web prototype.
They are the spec for milestone M1 (see docs/SPEC.md section 3.1). Port them to TypeScript in
`packages/engine`; don't import from this folder.

To run them as-is: load `data.js` then `engine.js` in the same scope (they define globals), and call
`Engine.trace('haircut')` or `Engine.selfTest()`.
