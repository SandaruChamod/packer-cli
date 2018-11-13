import path from 'path';
import gulp from 'gulp';
import gulpFile from 'gulp-file';
import chmod from 'gulp-chmod';
import merge from 'lodash/merge';
import { ModuleFormat, RollupFileOptions } from 'rollup';

import rollupUglify from '../plugins/rollup-plugin-uglify-es';
import gulpHbsRuntime from '../plugins/gulp-hbs-runtime';


import { PackageConfig } from '../model/package-config';
import logger from '../common/logger';
import { meta } from './meta';
import {
  buildPlugin,
  bundleBuild, externalFilter,
  extractBundleExternals,
  getBanner,
  getBaseConfig,
  postBundlePlugins,
  preBundlePlugins,
  resolvePlugins,
  rollupStyleBuildPlugin
} from './build-util';

export default function init() {
  gulp.task('build:copy:essentials', () => {
    const log = logger.create('[build:copy:essentials]');
    try {
      log.trace('start');
      const packageJson = meta.readPackageData();
      const config = meta.readPackerConfig(log);

      const targetPackage: PackageConfig = {};
      const fieldsToCopy = [
        'name',
        'version',
        'description',
        'keywords',
        'author',
        'repository',
        'license',
        'bugs',
        'homepage'
      ];

      // only copy needed properties from project's package json
      fieldsToCopy.forEach((field: string) => {
        targetPackage[field] = packageJson[field];
      });

      if (config.compiler.buildMode === 'node-cli') {
        targetPackage.bin = packageJson.bin;
      }

      targetPackage.main = path.join('bundle', `${packageJson.name}.${config.output.format}.min.js`);

      if (config.compiler.scriptPreprocessor === 'typescript') {
        targetPackage.typings = 'index.d.ts';
      }

      if (config.output.es5) {
        targetPackage.module = path.join('fesm5', `${packageJson.name}.esm.min.js`);
        targetPackage.fesm5 = path.join('fesm5', `${packageJson.name}.esm.min.js`);
      }

      if (config.output.esnext) {
        targetPackage.esnext = path.join('fesmnext', `${packageJson.name}.esm.min.js`);
        targetPackage.fesmnext = path.join('fesmnext', `${packageJson.name}.esm.min.js`);
      }

      // Map dependencies to target package file
      switch (config.output.dependencyMapMode) {
        case 'cross-map-peer-dependency':
          targetPackage.peerDependencies = packageJson.dependencies;
          break;
        case 'cross-map-dependency':
          targetPackage.dependencies = packageJson.peerDependencies;
          break;
        case 'map-dependency':
          targetPackage.dependencies = packageJson.dependencies;
          break;
        case 'map-peer-dependency':
          targetPackage.peerDependencies = packageJson.peerDependencies;
          break;
        case 'all':
          targetPackage.peerDependencies = packageJson.peerDependencies;
          targetPackage.dependencies = packageJson.dependencies;
          break;
      }

      // copy the needed additional files in the 'dist' folder
      return gulp.src((config.copy || []).map((copyFile: string) => {
        return path.join(process.cwd(), copyFile);
      }))
        .on('error', (e) => {
          log.error('copy source missing: %s\n', e.stack || e.message);
        })
        .pipe(gulpFile('package.json', JSON.stringify(targetPackage, null, 2)))
        .pipe(gulp.dest(path.join(process.cwd(), config.dist)))
        .on('finish', () => {
          log.trace('end');
        });
    } catch (e) {
      log.error('failure: %s\n', e.stack || e.message);
    }
  });

  gulp.task('build:copy:bin', () => {
    const log = logger.create('[build:copy:bin]');
    try {
      log.trace('start');
      const packageJson = meta.readPackageData();
      const config = meta.readPackerConfig(log);

      if (config.compiler.buildMode !== 'node-cli') {
        log.trace('not a cli project: bin copy abort');
        log.trace('start');
        return;
      }

      return gulp.src([path.join(process.cwd(), '.packer/bin.hbs')])
        .on('error', (e) => {
          log.error('bin source missing: %s\n', e.stack || e.message);
        })
        .pipe(gulpHbsRuntime({
          packageName: packageJson.name,
          format: config.output.format
        }, {
          rename: `${packageJson.name}.js`
        }))
        .pipe(chmod({
          group: {
            execute: true,
            read: true
          },
          others: {
            execute: true,
            read: true
          },
          owner: {
            execute: true,
            read: true,
            write: true
          }
        })) // Grant read and execute permission.
        .pipe(gulp.dest(path.join(process.cwd(), config.dist, 'bin')))
        .on('finish', () => {
          log.trace('end');
        });
    } catch (e) {
      log.error('failure: %s\n', e.stack || e.message);
    }
  });

  gulp.task('build:copy', gulp.parallel('build:copy:essentials', 'build:copy:bin'));

  gulp.task('build:bundle', async () => {
    const log = logger.create('[build:bundle]');
    try {
      log.trace(' start');
      const typescript = require('typescript');
      const config = meta.readPackerConfig(log);
      const packageJson = meta.readPackageData();
      const banner = getBanner(config, packageJson);
      const baseConfig = getBaseConfig(config, packageJson, banner);
      const externals = extractBundleExternals(config);
      const buildTasks: Array<Promise<void>> = [];
      // flat bundle.
      const flatConfig: RollupFileOptions = merge({}, baseConfig, {
        external: externals,
        output: {
          amd: config.output.amd,
          file: path.join(process.cwd(), config.dist, 'bundle', `${packageJson.name}.${config.output.format}.js`),
          format: config.output.format,
          globals: config.bundle.globals,
          name: config.output.namespace
        },
        plugins: [
          rollupStyleBuildPlugin(config, packageJson, false, false, true),
          ...preBundlePlugins(config),
          ...resolvePlugins(config),
          ...buildPlugin('bundle', true, true, config, typescript),
          ...postBundlePlugins('[build:bundle]', 'flat')
        ]
      });

      log.trace('flat bundle rollu6p config:\n%o', flatConfig);
      buildTasks.push(bundleBuild(config, packageJson, flatConfig, 'flat', log));

      if (config.output.es5) {
        // FESM+ES5 flat module bundle.
        const es5config: RollupFileOptions = merge({}, baseConfig, {
          external: externalFilter(config),
          output: {
            file: path.join(process.cwd(), config.dist, 'fesm5', `${packageJson.name}.esm.js`),
            format: 'esm' as ModuleFormat
          },
          plugins: [
            rollupStyleBuildPlugin(config, packageJson, false, true, false),
            ...preBundlePlugins(config),
            ...resolvePlugins(config),
            ...buildPlugin('es5', false, true, config, typescript),
            ...postBundlePlugins('[build:bundle]', 'es5')
          ]
        });

        log.trace('es5 bundle rollup config:\n%o', es5config);
        buildTasks.push(bundleBuild(config,  packageJson, es5config, 'es5', log));
      }

      if (config.output.esnext) {
        // FESM+ESNEXT flat module bundle.
        const esnextConfig: RollupFileOptions = merge({}, baseConfig, {
          external: externalFilter(config),
          output: {
            file: path.join(process.cwd(), config.dist, 'fesmnext', `${packageJson.name}.esm.js`),
            format: 'esm' as ModuleFormat
          },
          plugins: [
            rollupStyleBuildPlugin(config, packageJson, false, true, false),
            ...preBundlePlugins(config),
            ...resolvePlugins(config),
            ...buildPlugin('esnext', false, true, config, typescript),
            ...postBundlePlugins('[build:bundle]', 'esnext')
          ]
        });

        log.trace('esnext bundle rollup config:\n%o', esnextConfig);
        buildTasks.push(bundleBuild(config,  packageJson, esnextConfig, 'esnext', log));
      }

      if (config.compiler.concurrentBuild) {
        await Promise.all(buildTasks);
      } else {
        for (const task of buildTasks) {
          await task;
        }
      }
      log.trace('end');
    } catch (e) {
      log.error('failure: %s\n', e.stack || e.message);
    }
  });

  gulp.task('build', gulp.series('build:clean', gulp.parallel('build:copy', 'build:bundle')));
}
