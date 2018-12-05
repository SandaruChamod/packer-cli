import rollupIstanbul from 'rollup-plugin-istanbul';
import rollupPreprocessor from 'karma-rollup-preprocessor';

import {
  getScriptBuildPlugin,
  extractBundleExternals,
  getPreBundlePlugins,
  getDependencyResolvePlugins,
  getStyleBuildPlugins,
  customRollupPlugins
} from '../tasks/build-util';
import { args, requireDependency } from '../tasks/util';
import { parseScriptPreprocessorExtension } from '../tasks/parser';
import logger from '../common/logger';

import { meta } from '../tasks/meta';

/**
 * Get karma packer plugin
 */
export function karmaPackerPlugin() {
  const log = logger.create('[test]');

  try {
    const typescript = requireDependency('typescript', log);
    const packerConfig = meta.readPackerConfig(log);
    const babelConfig = meta.readBabelConfig();

    const testGlob: string = '**/*.spec.' + parseScriptPreprocessorExtension(packerConfig.compiler.script.preprocessor);
    log.trace('test glob: %s', testGlob);

    const packerPreprocess = {};
    packerPreprocess[testGlob] = ['rollup'];

    let coveragePlugins = [];
    if (args.includes('--coverage') || args.includes('-C')) {
      log.trace('identified as coverage task');
      coveragePlugins = [
        rollupIstanbul({
          exclude: [ testGlob, 'node_modules/**' ]
        })
      ];
    }

    /**
     * This is just a normal Rollup config object,
     * except that `input` is handled for you.
     */
    const externals = extractBundleExternals(packerConfig);
    const packerPlugin = {
      external: externals,
      output: {
        format: 'iife',
        name: 'test',
        sourcemap: 'inline',
        globals: packerConfig.bundle.globals,
      },
      plugins: [
        ...getStyleBuildPlugins(packerConfig, null, false, true, log),
        ...getPreBundlePlugins(packerConfig),
        ...getDependencyResolvePlugins(packerConfig),
        ...getScriptBuildPlugin('bundle', false, false, packerConfig, babelConfig, typescript, log),
        ...customRollupPlugins(packerConfig, 'bundle'),
        ...coveragePlugins
      ]
    };

    const testFramework = String(packerConfig.test.framework).toLowerCase();

    return {
      packerPlugin,
      packerPreprocess,
      rollupPreprocessor,
      testFramework,
      testGlob
    };
  } catch (e) {
    log.error('task failure: %s\n', e.stack || e.message);
    process.exit(1);
  }
}
