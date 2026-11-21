import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'test-results/**', 'playwright-report/**'] },
  ...tseslint.configs.recommended,
  { files: ['src/**/*.tsx', 'src/**/*.ts'], ...reactHooks.configs.flat.recommended },
);
