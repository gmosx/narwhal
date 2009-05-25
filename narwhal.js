(function (fixtures) {

var system = {};
system.print = fixtures.print;
system.debug = fixtures.debug;
system.prefix = fixtures.prefix;
system.platform = fixtures.platform;
system.platforms = fixtures.platforms;
system.evalGlobal = fixtures.evalGlobal;

system.evaluate = fixtures.evaluate;

// logger shim
var shim = function () {
    if (system.debug && system.print) {
        system.print(Array.prototype.join.apply(arguments, [" "]));
    }
};
var log = {fatal:shim, error:shim, warn:shim, info:shim, debug:shim};
system.log = log;

// fs shim
system.fs = {
    read : fixtures.read,
    isFile : fixtures.isFile
};

// global reference
global = fixtures.global;
global.print = fixtures.print;
global.system = system;

// equivalent to "var sandbox = require('sandbox');"
var sandboxFactory = fixtures.evaluate(
    fixtures.read(fixtures.prefix + "/lib/sandbox.js"),
    "sandbox.js",
    1
);
var sandbox = {};
sandboxFactory(null, sandbox, system);

// create the primary Loader and Sandbox:
var loader = sandbox.Loader({ paths : fixtures.path.split(":") });
var modules = {system: system};
global.require = sandbox.Sandbox({loader: loader, modules: modules});

try {
    require("global");
} catch (e) {
    system.log.error("Couldn't load global/primordial patches ("+e+")");
}

global.require.force("system");

var parser = require("narwhal").parser;
var options = parser.parse(system.args);

system.packagePrefixes = [system.prefix];
system.packagePrefixes.unshift.apply(system.packagePrefixes, options.packagePrefies);
system.debug = options.debug;

// enable loader tracing
global.require.debug = options.verbose;

// in verbose mode, list all the modules that are 
// already loaded
if (options.verbose) {
    Object.keys(modules).forEach(function (name) {
        print('@ ' + name);
    });
}

// find the program module and its prefix
var program;
if (system.args.length && !options.interactive && !options.main) {
    if (!program)
        program = system.fs.path(system.args[0]).canonical();

    // add package prefixes for all of the packages
    // containing the program, from specific to general
    var parts = system.fs.split(program);
    for (var i = 0; i < parts.length; i++) {
        var path = system.fs.join.apply(null, parts.slice(0, i));
        var packageJson = system.fs.join(path, 'package.json');
        if (system.fs.isFile(packageJson))
            system.packagePrefixes.unshift(path);
    }

    if (program.isDirectory()) {
        if (!program.join('package.json').isFile())
            throw new Error("Program directory does not contain a package.json");
        system.packagePrefixes.unshift(program);
    }
}

// load packages
var packages;
if (!options.noPackages) {
    try {
        packages = require("packages");
        packages.main();
    } catch (e) {
        system.log.error("Warning: Couldn't load packages. Packages won't be available. ("+e+")");
    }
} else {
    packages = {
        catalog: {},
        packageOrder: []
    }
}

// run -r, --require, -e, -c , --command CLI options
options.todo.forEach(function (item) {
    var action = item[0];
    var value = item[1];
    if (action == "include") {
        require.paths.unshift(value);
    } else if (action == "require") {
        require(value);
    } else if (action == "eval") {
        system.evalGlobal(value);
    } else if (action == "path") {
        var paths = packages.packageOrder.map(function (pkg) {
            return pkg.directory.join('bin');
        }).filter(function (path) {
            return path.isDirectory();
        });
        var oldPaths = system.env.PATH.split(value);
        while (oldPaths.length) {
            var path = oldPaths.shift();
            if (paths.indexOf(path) < 0)
                paths.push(path);
        }
        print(paths.join(value));
    }
});

// load the program module
if (options.main) {
    require(options.main);
} else if (program) {
    if (program.isDirectory()) {
        require(packages.root.directory.resolve(packages.root.main || 'main').toString());
    } else {
        require(program.toString());
    }
}

/* send an unload event if that module has been required */
if (require.loader.isLoaded('unload')) {
    require('unload').send();
}

})
