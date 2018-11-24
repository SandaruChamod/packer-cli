import rollupIstanbul from 'rollup-plugin-istanbul';
import rollupPreprocessor from 'karma-rollup-preprocessor';
import rollupIgnoreImport from 'rollup-plugin-ignore-import';

import path from 'path';

import {
  getScriptBuildPlugin,
  extractBundleExternals,
  getPreBundlePlugins,
  getDependencyResolvePlugins
} from '../tasks/build-util';
import { args } from '../tasks/util';
import { parseScriptPreprocessorExtension } from '../tasks/parser';
import logger from '../common/logger';

import { meta } from '../tasks/meta';

/**
 * Get karma packer plugin
 */
export function karmaPackerPlugin() {
  const log = logger.create('[test]');

  try {
    const typescript = require('typescript');
    const config = meta.readPackerConfig(log);

    const testGlob: string = path.join(config.source,
      '**/*.spec.' + parseScriptPreprocessorExtension(config.compiler.script.preprocessor));
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
    const externals = extractBundleExternals(config);
    const packerPlugin = {
      external: externals,
      output: {
        format: 'iife',
        name: 'test',
        sourcemap: 'inline',
        globals: config.bundle.globals,
      },
      plugins: [
        rollupIgnoreImport({
          extensions: ['.scss', '.sass', '.styl', '.css', '.less']
        }),
        ...getPreBundlePlugins(config),
        ...getDependencyResolvePlugins(config),
        ...getScriptBuildPlugin('bundle', false, false, config, typescript, log),
        ...coveragePlugins
      ]
    };

    const testFramework = String(config.testFramework).toLowerCase();

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
