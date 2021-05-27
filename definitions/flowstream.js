const DB_FILE = 'database.json';
const DIRECTORY = CONF.directory || PATH.root('flowstream');

PATH.mkdir(DIRECTORY);

var FS = {};

FS.version = 1;
FS.db = {};
FS.instances = {};

FS.find = function(ref) {
	for (var key in FS.db) {
		var item = FS.db[key];
		if (item.reference === ref)
			return FS.instances[key];
	}
};

FS.refresh = function(flowid, type) {
	for (var key in FS.instances) {
		var flow = FS.instances[key];
		for (var id in flow.meta.flow) {
			var instance = flow.meta.flow[id];
			instance && instance.flowstream && instance.flowstream(flowid, type);
		}
	}
};

FS.error = function(err, id) {
	console.log('FlowStream error', err, id);
};

FS.save = function() {

	for (var key in FS.db) {

		if (key !== 'variables') {
			var item = FS.db[key];
			item.size = Buffer.byteLength(JSON.stringify(item), 'utf8');

			// Cleans designs
			for (var id in item.design) {
				var opt = item.design[id];
				if (!item.components[opt.component])
					delete item.design[id];
			}

		}
	}

	PATH.fs.writeFile(PATH.join(DIRECTORY, DB_FILE), JSON.stringify(FS.db), ERROR('TMS.save'));
};

FS.load = function() {
	PATH.fs.readFile(PATH.join(DIRECTORY, DB_FILE), function(err, data) {

		if (data)
			FS.db = data.toString('utf8').parseJSON(true);
		else
			FS.db = {};

		if (!FS.db.variables)
			FS.db.variables = {};

		Object.keys(FS.db).wait(function(key, next) {
			if (key === 'variables') {
				next();
			} else {
				FS.init(key, function(err) {
					err && FS.error(err, key);
					next();
				});
			}
		});

	});
};

FS.init = function(id, callback) {

	var item = FS.db[id];
	var flow = FLOWSTREAM(id, ERROR('FlowStream "{0}" error'.format(item.name)));

	FS.instances[id] = flow;

	// Interval for statistics
	flow.interval = 5000;
	flow.errors = [];
	flow.variables = item.variables;
	flow.variables2 = FS.db.variables;

	// Captures stats from the Flow
	flow.on('stats', function() {
		if (flow.ws) {
			flow.stats.TYPE = 'flow/stats';
			flow.ws.send(flow.stats);
		}
	});

	flow.onerror = function(err) {

		err += '';

		var obj = {};
		obj.error = err;
		obj.id = this.id;
		obj.ts = new Date();

		flow.errors.unshift(obj);

		if (flow.errors.length > 10)
			flow.errors.pop();

		flow.ws && flow.ws.send({ TYPE: 'flow/error', error: err, id: this.id, ts: obj.ts });
	};

	// component.status() will execute this method
	flow.onstatus = function(status) {

		var instance = this;

		if (status == null)
			status = instance.currentstatus;
		else
			instance.currentstatus = status;

		if (status != null)
			flow.ws && flow.ws.send({ TYPE: 'flow/status', id: instance.id, data: status });

	};

	// component.dashboard() will execute this method
	flow.ondashboard = function(status) {

		var instance = this;

		if (status == null)
			status = instance.dashboardstatus;
		else
			instance.dashboardstatus = status;

		if (status != null)
			flow.ws && flow.ws.send({ TYPE: 'dashboard', id: instance.id, component: instance.component, data: status });

	};

	// Load components
	flow.load(item.components, item.design, callback);
};

ON('ready', function() {
	FS.load();
});

MAIN.flowstream = FS;