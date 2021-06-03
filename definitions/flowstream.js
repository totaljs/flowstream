const DB_FILE = 'database.json';
const DIRECTORY = CONF.directory || PATH.root('flowstream');

PATH.mkdir(DIRECTORY);

var FS = {};

FS.version = 1;
FS.db = {};
FS.instances = {};

var saveid;

FS.save = function() {
	saveid && clearTimeout(saveid);
	saveid = setTimeout(FS.save_force, 1000);
};

FS.save_force = function() {
	saveid = null;

	for (var key in FS.db) {
		if (key !== 'variables') {
			var flow = FS.db[key];
			flow.size = Buffer.byteLength(JSON.stringify(flow));
		}
	}

	if (CONF.backup) {
		PATH.fs.rename(PATH.join(DIRECTORY, DB_FILE), PATH.join(DIRECTORY, DB_FILE.replace(/\.json/, '') + '_' + (new Date()).format('yyyyMMddHHmm') + '.bk'), function() {
			PATH.fs.writeFile(PATH.join(DIRECTORY, DB_FILE), JSON.stringify(FS.db), ERROR('FlowStream.save'));
		});
	} else
		PATH.fs.writeFile(PATH.join(DIRECTORY, DB_FILE), JSON.stringify(FS.db), ERROR('FlowStream.save'));
};

FS.init = function(id, next) {

	var flow = FS.db[id];

	flow.variables2 = FS.db.variables || {};

	var instance = MODULE('flowstream').init(flow, true);

	instance.ondone = () => next();
	instance.onerror = (err, type) => console.log('FlowError', err, type);
	instance.onsave = function(data) {
		delete flow.variables2;
		FS.db[id] = data;
		FS.save();
	};

	FS.instances[id] = instance;
};

ON('ready', function() {

	PATH.fs.readFile(PATH.join(DIRECTORY, DB_FILE), function(err, data) {

		FS.db = data ? data.toString('utf8').parseJSON(true) : {};

		if (!FS.db.variables)
			FS.db.variables = {};

		Object.keys(FS.db).wait(function(key, next) {
			if (key === 'variables') {
				next();
			} else
				FS.init(key, next);
		});

	});

});

MAIN.flowstream = FS;