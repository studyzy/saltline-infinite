// Single entry point for three.js inside shared/.
//
// The browser game imports ./vendor/three.module.js directly; this re-export
// resolves to the same file URL under Node, so both sides share one module
// instance and one set of math classes.
export * from "../js/vendor/three.module.js";