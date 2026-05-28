import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

// L5-B — Liste des booléens de rôle qui vivaient sur le bridge useAuth().
// Le bridge est retiré (L5-A) : toute réintroduction doit passer par
// `useCapability("xxx")` (cf. src/hooks/use-capability.ts).
const AUTH_BRIDGE_BOOLEANS = [
  "isAdmin",
  "isChef",
  "isChefAny",
  "isChefGlobal",
  "isAdminOrChef",
  "isRh",
  "isCommercial",
  "isBureauEtude",
  "isAtelierChef",
  "isAtelierMetier",
  "isLogistique",
  "isPoseur",
  "isChefMetierScoped",
];

const bridgeMessage =
  "L5-B: ne pas réintroduire de booléen de rôle sur useAuth(). " +
  "Utiliser useCapability('xxx') (src/hooks/use-capability.ts).";

// Sélecteurs AST pour les deux patterns interdits :
//   const { isAdmin } = useAuth()
//   useAuth().isAdmin
const bridgeRestrictedSyntax = AUTH_BRIDGE_BOOLEANS.flatMap((name) => [
  {
    selector: `VariableDeclarator[init.callee.name='useAuth'] ObjectPattern > Property[key.name='${name}']`,
    message: bridgeMessage,
  },
  {
    selector: `MemberExpression[object.callee.name='useAuth'][property.name='${name}']`,
    message: bridgeMessage,
  },
]);

export default tseslint.config(
  { ignores: ["dist", ".output", ".vinxi", "e2e/**", "playwright.config.ts"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      "no-restricted-syntax": ["error", ...bridgeRestrictedSyntax],
    },
  },
  // Exceptions : l'implémentation du contexte + tests peuvent référencer les noms.
  {
    files: [
      "src/lib/auth-context.tsx",
      "src/lib/preview-context.tsx",
      "src/**/__tests__/**",
      "src/**/*.test.{ts,tsx}",
      "src/routes/roadmap.tsx",
    ],
    rules: {
      "no-restricted-syntax": "off",
    },
  },
  eslintPluginPrettier,
);
