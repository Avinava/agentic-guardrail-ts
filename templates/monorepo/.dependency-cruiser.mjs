// Architecture rules for a monorepo. Workspace directories are grouped into tiers, lowest
// first. A package may import from packages in lower tiers only: never from its own tier,
// never from a higher one. Adjust TIERS to this repo's packages (globs allowed: 'apps/*').
const TIERS = [
  ['packages/types'], // tier 0: no workspace dependencies
  ['packages/core'], // tier 1: may import tier 0
  ['apps/*'], // apps: may import any package, never another app
];

const toRegex = (dir) => dir.replaceAll('*', '[^/]+');
const group = (dirs) => `(${dirs.map(toRegex).join('|')})`;

const tierRules = TIERS.map((tier, i) => ({
  name: `tier-${i}`,
  comment: `${tier.join(', ')} may only import from lower tiers`,
  severity: 'error',
  from: { path: `^${group(tier)}/` },
  to: { path: `^${group(TIERS.slice(i).flat())}/`, pathNot: '^$1/' },
}));

/** @type {import('dependency-cruiser').IConfiguration} */
export default {
  forbidden: [
    ...tierRules,
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'not-to-unresolvable',
      severity: 'error',
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: 'no-relative-cross-package',
      comment: 'Import other workspace packages by name, not by relative path',
      severity: 'error',
      from: { path: '^(packages|apps)/([^/]+)/' },
      to: { path: '^(packages|apps)/', pathNot: '^$1/$2/', dependencyTypes: ['local'] },
    },
    {
      name: 'no-non-package-json',
      severity: 'error',
      from: {},
      to: { dependencyTypes: ['npm-no-pkg', 'npm-unknown'] },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)(dist|build|coverage)/' },
    tsConfig: { fileName: 'tsconfig.base.json' },
    tsPreCompilationDeps: true,
    combinedDependencies: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['source', 'import', 'require', 'node', 'default', 'types'],
    },
  },
};
