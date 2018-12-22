#!/usr/bin/env node

const ejs = require('ejs');
const fs = require('fs');
const minimatch = require('minimatch');
const mkdirp = require('mkdirp');
const path = require('path');
const program = require('commander');
const readline = require('readline');
const sortedObject = require('sorted-object');
const util = require('util');

const MODE_0666 = 0o0666;
const MODE_0755 = 0o0755;
const TEMPLATE_DIR = path.join(__dirname, '..', 'templates');
const VERSION = require('../package').version;

const _exit = process.exit;

/**
 * Graceful exit for async STDIO
 */

function exit(code) {
  let draining = 0;
  const streams = [process.stdout, process.stderr];

  // flush output for Node.js Windows pipe bug
  // https://github.com/joyent/node/issues/6247 is just one bug example
  // https://github.com/visionmedia/mocha/issues/333 has a good discussion
  function done() {
    if (!(draining - 1)) _exit(code);
  }

  exit.exited = true;

  streams.forEach(stream => {
    // submit empty write request and wait for completion
    draining += 1;
    stream.write('', done);
  });

  done();
}

// Re-assign process.exit because of commander
// TODO: Switch to a different command framework
process.exit = exit;

/**
 * Make the given dir relative to base.
 *
 * @param {string} base
 * @param {string} dir
 */

function mkdir(base, dir) {
  const loc = path.join(base, dir);

  console.log(`   \x1b[36mcreate\x1b[0m : ${loc}${path.sep}`);
  mkdirp.sync(loc, MODE_0755);
}

/**
 * Determine if launched from cmd.exe
 */

function launchedFromCmd() {
  return process.platform === 'win32' && process.env._ === undefined;
}

/**
 * Install an around function; AOP.
 */

function around(obj, method, fn) {
  const old = obj[method];

  obj[method] = (...args) => {
    const newArgs = new Array(arguments.length);
    for (let i = 0; i < newArgs.length; i += 1) newArgs[i] = args[i];
    return fn.call(this, old, newArgs);
  };
}

/**
 * Install a before function; AOP.
 */

function before(obj, method, fn) {
  const old = obj[method];

  obj[method] = (...args) => {
    fn.call(this);
    old.apply(this, args);
  };
}

/**
 * Prompt for confirmation on STDOUT/STDIN
 */

function confirm(msg, callback) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.question(msg, input => {
    rl.close();
    callback(/^y|yes|ok|true$/i.test(input));
  });
}

/**
 * echo str > file.
 *
 * @param {String} file
 * @param {String} str
 */

function write(file, str, mode) {
  fs.writeFileSync(file, str, { mode: mode || MODE_0666 });
  console.log(`   \x1b[36mcreate\x1b[0m : ${file}`);
}

// CLI

around(program, 'optionMissingArgument', (fn, args) => {
  program.outputHelp();
  fn.apply(this, args);
  return { args: [], unknown: [] };
});

before(program, 'outputHelp', () => {
  // track if help was shown for unknown option
  this._helpShown = true;
});

before(program, 'unknownOption', () => {
  // allow unknown options if help was shown, to prevent trailing error
  this._allowUnknownOption = this._helpShown;

  // show help if not yet shown
  if (!this._helpShown) {
    program.outputHelp();
  }
});

/**
 * Load template file.
 */

function loadTemplate(name) {
  const contents = fs.readFileSync(path.join(__dirname, '..', 'templates', `${name}.ejs`), 'utf-8');
  const locals = Object.create(null);

  function render() {
    return ejs.render(contents, locals, {
      escape: util.inspect,
    });
  }

  return {
    locals,
    render,
  };
}

/**
 * Copy file from template directory.
 */

function copyTemplate(from, to) {
  write(to, fs.readFileSync(path.join(TEMPLATE_DIR, from), 'utf-8'));
}

/**
 * Copy multiple files from template directory.
 */

function copyTemplateMulti(fromDir, toDir, nameGlob) {
  fs.readdirSync(path.join(TEMPLATE_DIR, fromDir))
    .filter(minimatch.filter(nameGlob, { matchBase: true }))
    .forEach(name => {
      copyTemplate(path.join(fromDir, name), path.join(toDir, name));
    });
}

/**
 * Create an app name from a directory path, fitting npm naming requirements.
 *
 * @param {String} pathName
 */

function createAppName(pathName) {
  return path
    .basename(pathName)
    .replace(/[^A-Za-z0-9.-]+/g, '-')
    .replace(/^[-_.]+|-+$/g, '')
    .toLowerCase();
}

/**
 * Check if the given directory `dir` is empty.
 *
 * @param {String} dir
 * @param {Function} fn
 */

function emptyDirectory(dir, fn) {
  fs.readdir(dir, (err, files) => {
    if (err && err.code !== 'ENOENT') throw err;
    fn(!files || !files.length);
  });
}

/**
 * Create application at the given directory.
 *
 * @param {string} name
 * @param {string} dir
 */

function createApplication(name, dir) {
  // Package
  const pkg = {
    name,
    version: '0.0.0',
    private: true,
    main: 'server.js',
    scripts: {
      start: 'NODE_ENV=production node server.js',
      dev: 'nodemon server.js',
      lint: 'eslint . --ext .js',
      'lint:fix': 'eslint --fix . --ext .js',
      test: 'echo "Error: no test specified" && exit 1',
    },
    dependencies: {
      chalk: '^2.4.1',
      express: '^4.16.4',
    },
    devDependencies: {
      eslint: '^5.10.0',
      'eslint-config-airbnb-base': '^13.1.0',
      'eslint-config-prettier': '^3.3.0',
      'eslint-plugin-import': '^2.14.0',
      'eslint-plugin-node': '^8.0.0',
      'eslint-plugin-prettier': '^3.0.0',
      nodemon: '^1.18.8',
      prettier: '^1.15.3',
    },
  };

  // directory creation
  if (dir !== '.') {
    mkdir(dir, '.');
  }

  // JavaScript
  copyTemplate('server.js', path.join(dir, 'server.js'));
  const app = loadTemplate('app.js');

  // App modules
  app.locals.localModules = Object.create(null);
  app.locals.modules = Object.create(null);
  app.locals.mounts = [];
  app.locals.uses = [];

  // Request logger
  app.locals.modules.logger = 'morgan';
  app.locals.uses.push("logger('dev')");
  pkg.dependencies.morgan = '^1.9.1';

  // Body parsers
  app.locals.uses.push('express.json()');
  app.locals.uses.push('express.urlencoded({ extended: true })');

  // copy config
  mkdir(dir, 'config');
  copyTemplateMulti('config', `${dir}/config`, '*.js');

  // copy routers
  mkdir(dir, 'routers');
  copyTemplateMulti('routers', `${dir}/routers`, '*.js');

  // copy gitignore file
  copyTemplate('gitignore', path.join(dir, '.gitignore'));

  // copy eslint config file
  copyTemplate('eslintrc.js', path.join(dir, '.eslintrc.js'));

  // copy prettier config file
  copyTemplate('prettierrc.js', path.join(dir, '.prettierrc.js'));

  // Index router mount
  app.locals.localModules.indexRouter = './routers/index';
  app.locals.mounts.push({ path: '/', code: 'indexRouter' });

  // User router mount
  app.locals.localModules.userRouter = './routers/user';
  app.locals.mounts.push({ path: '/user', code: 'userRouter' });

  // sort dependencies like npm(1)
  pkg.dependencies = sortedObject(pkg.dependencies);

  // write files
  write(path.join(dir, 'app.js'), app.render());
  write(path.join(dir, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`);

  const prompt = launchedFromCmd() ? '>' : '$';

  if (dir !== '.') {
    console.log();
    console.log('   change directory:');
    console.log('     %s cd %s', prompt, dir);
  }

  console.log();
  console.log('   install dependencies:');
  console.log('     %s npm install or yarn', prompt);
  console.log();
  console.log('   run the app:');
  console.log('     npm start or npm run dev', prompt, name);
  console.log();
}

/**
 * Main program.
 */

function main() {
  // Path
  const destinationPath = program.args.shift() || '.';

  // App name
  const appName = createAppName(path.resolve(destinationPath)) || 'node-skeleton';

  // Generate application
  emptyDirectory(destinationPath, empty => {
    if (empty || program.force) {
      createApplication(appName, destinationPath);
    } else {
      confirm('destination is not empty, continue? [y/N] ', ok => {
        if (ok) {
          process.stdin.destroy();
          createApplication(appName, destinationPath);
        } else {
          console.error('aborting');
          exit(1);
        }
      });
    }
  });
}

program
  .name('express')
  .version(VERSION, '    --version')
  .usage('[options] [dir]')
  .parse(process.argv);

if (!exit.exited) {
  main();
}
