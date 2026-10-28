// Architecture rules for a single package. Layers are listed lowest first:
// a layer may import from layers below it, never from layers above it.
// Adjust LAYERS to the directories this project actually has.
const LAYERS = [
  'src/shared',
  'src/domain',
  'src/application',
  'src/infrastructure',
  'src/interface',
];

const layerRules = LAYERS.slice(0, -1).map((layer, i) => ({
  name: `layer-${layer.split('/').pop()}`,
  comment: `${layer} may only import from layers below it`,
  severity: 'error',
  from: { path: `^${layer}/` },
  to: { path: `^(${LAYERS.slice(i + 1).join('|')})/` },
}));

/** @type {import('dependency-cruiser').IConfiguration} */
export default {
  forbidden: [
    ...layerRules,
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
      name: 'not-to-dev-dep',
      comment: 'Production code must not import devDependencies',
      severity: 'error',
      from: { path: '^src/', pathNot: '\\.(test|spec)\\.[cm]?[jt]sx?$' },
      to: { dependencyTypes: ['npm-dev'], dependencyTypesNot: ['type-only'] },
    },
    {
      name: 'no-non-package-json',
      severity: 'error',
      from: {},
      to: { dependencyTypes: ['npm-no-pkg', 'npm-unknown'] },
    },
    {
      name: 'not-to-test',
      severity: 'error',
      from: { pathNot: '\\.(test|spec)\\.[cm]?[jt]sx?$|^test/' },
      to: { path: '\\.(test|spec)\\.[cm]?[jt]sx?$|^test/' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)(dist|build|coverage)/' },
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
    },
  },
};
