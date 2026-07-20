import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  // Not source we author/lint: build output, deps, vendored upstream, tooling dumps.
  { ignores: ['dist', 'node_modules', 'react-bits-upstream', 'output', 'scripts', '*.config.*'] },
  js.configs.recommended,
  {
    files: ['api/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
        fetch: 'readonly',
      },
    },
  },
  ...tseslint.configs.recommended,
  jsxA11y.flatConfigs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // Unused code is already enforced by tsc (noUnusedLocals/noUnusedParameters).
      '@typescript-eslint/no-unused-vars': 'off',
      // React-Three-Fiber attaches many "unknown" DOM/three.js props (position,
      // args, attach, …); this rule is not meaningful for r3f JSX.
      'react/no-unknown-property': 'off',

      // --- Downgraded to warnings ---------------------------------------------
      // This is a hand-tuned Three.js/animation codebase; the rules below flag
      // intentional patterns (rAF-driven state, mutable refs, omitted effect deps)
      // that are correct here. Keep them visible as warnings, not build-breaking.
      '@typescript-eslint/no-explicit-any': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/static-components': 'warn',
      // Full-screen interactive canvas surfaces (the sketchbook scene) legitimately
      // handle pointer input without being native buttons; keyboard input is wired
      // separately (WASD / arrow keys). Surface as warnings rather than errors.
      'jsx-a11y/click-events-have-key-events': 'warn',
      'jsx-a11y/no-static-element-interactions': 'warn',
    },
  },
  {
    // React Three Fiber is intentionally imperative: frame callbacks mutate
    // Three.js uniforms/refs, and canvas interaction state is synchronized in
    // effects. React Compiler's DOM-oriented purity rules misclassify these.
    files: ['src/components/SketchbookTerrain/**/*.{ts,tsx}'],
    rules: {
      'react-hooks/immutability': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/exhaustive-deps': 'off',
      'jsx-a11y/no-noninteractive-element-interactions': 'off',
      'jsx-a11y/no-noninteractive-tabindex': 'off',
    },
  },
  {
    // This module exports the provider and its paired consumer hook by design.
    files: ['src/context/GyroscopeContext.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
)
