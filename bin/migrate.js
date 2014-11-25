#! /usr/bin/env node

var program = require('commander');
var prompt = require('prompt');
var colors = require('colors');
var slug = require('slug');
var path = require('path');
var fs = require('fs');

var config_filename = '.migrate.json';
var config_path = process.cwd() + '/' + config_filename;
var CONFIG;

program
  .option('init', 'Init migrations on current path')
  .option('create [description]', 'Create Migration')
  .option('down', 'Migrate down')
  .option('up', 'Migrate up')
  .parse(process.argv);

// migrate init
if (program.init) {
  init();
  process.exit();
}

CONFIG = loadConfiguration();

// migrate create
if (program.create) {
  createMigration(program.create, function () {
    process.exit();
  });
}
// migrate down
else if (program.down) {
  migrate(-1, function () {
    process.exit();
  });
}
// migrate up
else if (program.up) {
  migrate(1, function () {
    process.exit();
  });
}
// otherwise show help message
else {
  program.help();
}

/*
 *  Helpers
 */

function error(msg) {
  console.error(msg.red);
  process.exit(1);
}

function success(msg) {
  console.log(msg.green);
}

function loadConfiguration() {
  try {
    return require(config_path);
  } catch (e) {
    error('Missing ' + config_filename + ' file. Type `migrate init` to create.');
  }
}

function updateTimestamp(timestamp) {
  CONFIG.current_timestamp = timestamp;
  var data = JSON.stringify(CONFIG, null, 2);
  fs.writeFileSync(config_path, data);
}

function init() {
  if (fs.existsSync(config_path)) {
    error(config_filename + ' already exists!');
  }

  var schema = {
    properties: {
      basepath: {
        description: 'Enter migrations directory',
        type: 'string',
        default: 'migrations'
      },
      connection: {
        description: 'Enter mongo connection string',
        type: 'string',
        required: true
      }
    }
  };

  prompt.start();
  prompt.get(schema, function (error, result) {
    CONFIG = {
      basepath: result.basepath,
      connection: result.connection,
      current_timestamp: 0,
      models: {}
    };

    var data = JSON.stringify(CONFIG, null, 2);
    fs.writeFileSync(config_path, data);

    success(config_filename + ' file created!\nEdit it to include your models definitions');
  });
}

function createMigration(description, cb) {

  if (!description || description === true) {
    error('Missing migration description');
  }

  var timestamp = Date.now();
  var description = slug(description);
  var migrationName = timestamp + '-' + description + '.js';
  var template = path.normalize(__dirname + '/../template/migration.js');
  var filename = path.normalize(CONFIG.basepath + '/' + migrationName);

  // create migrations directory
  if (!fs.existsSync(CONFIG.basepath)){
    fs.mkdirSync(CONFIG.basepath);
  }

  var data = fs.readFileSync(template);
  fs.writeFileSync(filename, data);
  success('Created migration ' + migrationName);
  cb();
}

function connnectDB() {
  // load local app mongoose instance
  var mongoose = require(process.cwd() + '/node_modules/mongoose');
  mongoose.connect(CONFIG.connection);
}

function loadModel(model_name) {
  return require(process.cwd() + '/' + CONFIG.models[model_name]);
}

function getTimestamp(name) {
  return parseInt((name.split('-'))[0]);
}

function migrate(direction, cb) {
  var migrations = fs.readdirSync(CONFIG.basepath);

  connnectDB();

  migrations = migrations.filter(function (migration_name) {
    var timestamp = getTimestamp(migration_name);

    if (direction > 0) {
      return timestamp > CONFIG.current_timestamp;
    } else if (direction < 0) {
      return timestamp <= CONFIG.current_timestamp;
    }
  });

  loopMigrations(direction, migrations, cb);
}

function loopMigrations(direction, migrations, cb) {
  if (direction > 0 && migrations.length !== 0) {
    applyMigration('up', migrations.shift(), function () {
      direction--;
      loopMigrations(direction, migrations, cb);
    });
  } else if (direction < 0 && migrations.length !== 0) {
    applyMigration('down', migrations.pop(), function () {
      direction++;
      loopMigrations(direction, migrations, cb);
    });
  } else {
    cb();
  }
}

function applyMigration(direction, name, cb) {
  var migration = require(process.cwd() + '/' + CONFIG.basepath + '/' + name);
  var timestamp = getTimestamp(name);

  success('Applying migration ' + name + ' - ' + direction);
  migration[direction].call({
    model: loadModel
  }, callback);

  function callback() {

    if (direction == 'down') {
      timestamp--;
    }

    updateTimestamp(timestamp);
    cb();
  }
}