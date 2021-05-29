const DB_FILE = 'database.json';
const DIRECTORY = CONF.directory || PATH.root('flowstream');

PATH.mkdir(DIRECTORY);

var FS = {};

FS.version = 1;
FS.db = {};
FS.instances = {};

PATH.flowstream = function(path) {
	return path ? PATH.join(DIRECTORY, path) : DIRECTORY;
};

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

var saveid;

FS.save = function() {
	saveid && clearTimeout(saveid);
	saveid = setTimeout(FS.save_force, 1000);
};

FS.save_force = function() {

	saveid = null;

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

	if (CONF.backup) {
		PATH.fs.rename(PATH.join(DIRECTORY, DB_FILE), PATH.join(DIRECTORY, DB_FILE.replace(/\.json/, '') + '_' + (new Date()).format('yyyyMMddHHmm') + '.bk'), function() {
			PATH.fs.writeFile(PATH.join(DIRECTORY, DB_FILE), JSON.stringify(FS.db), ERROR('TMS.save'));
		});
	} else
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
		}, function() {
		});

	});
};

FS.init = function(id, callback) {

	var item = FS.db[id];
	var flow = FLOWSTREAM(id, ERROR('FlowStream "{0}" error'.format(item.name)));

	FS.instances[id] = flow;

	// Interval for statistics
	flow.interval = 5000;

	flow.sockets = {}; // TMS
	flow.sources = item.sources ? CLONE(item.sources) : []; // TMS

	flow.errors = [];
	flow.variables = item.variables;
	flow.variables2 = FS.db.variables;

	flow.components = function(prepare_export) {

		var self = this;
		var arr = [];

		for (var key in self.meta.components) {
			var com = self.meta.components[key];
			if (prepare_export) {

				var obj = {};
				obj.id = com.id;
				obj.name = com.name;
				obj.type = com.type;
				obj.css = com.ui.css;
				obj.js = com.ui.js;
				obj.icon = com.icon;
				obj.config = com.config;
				obj.html = com.ui.html;
				obj.schema = com.schema ? com.schema.id : null;
				obj.readme = com.ui.readme;
				obj.template = com.ui.template;
				obj.settings = com.ui.settings;
				obj.inputs = com.inputs;
				obj.outputs = com.outputs;
				obj.group = com.group;
				obj.version = com.version;
				obj.author = com.author;

				arr.push(obj);

			} else
				arr.push(com);
		}

		return arr;
	};

	// Captures stats from the Flow
	flow.on('stats', function() {
		if (flow.ws) {
			flow.stats.TYPE = 'flow/stats';
			flow.ws.send(flow.stats);
		}
	});

	var cleanerid;
	var problematic = [];
	var cleaner = function() {
		cleanerid = null;
		for (var key of problematic) {
			delete item.components[key];
			flow.unregister(key);
		}
		flow.ws && flow.ws.send({ TYPE: 'flow/components', data: FS.components(true) });
		MAIN.flowstream.save();
	};

	var cleanerservice = function() {
		cleanerid && clearTimeout(cleanerid);
		cleanerid = setTimeout(cleaner, 500);
	};

	flow.onregister = function(component) {
		if (!component.schema && component.schemaid && (component.type === 'pub' || component.type === 'sub')) {
			var tmp = flow.sources.findItem('id', component.schemaid[0]);
			if (tmp && tmp.meta) {
				var arr = component.type === 'pub' ? tmp.meta.publish : tmp.meta.subscribe;
				component.schema = arr.findItem('id', component.schemaid[1]);
				component.itemid = component.schemaid[0];
			} else {
				problematic.push(component.id);
				cleanerservice();
			}
		}
	};

	flow.onconnect = function(instance) {
		instance.save = function() {
			var db = MAIN.flowstream.db[id];
			if (db) {
				var item = db.design[instance.id];
				if (item) {
					item.x = instance.x;
					item.y = instance.y;
					item.note = instance.note;
					item.config = instance.config;
					MAIN.flowstream.save();
					flow.ws && flow.ws.send({ TYPE: 'flow/redraw', id: instance.id, data: item });
				}
			}
		};
	};

	flow.onreconfigure = function(instance) {
		item.design[instance.id].config = instance.config;
		flow.ws && flow.ws.send({ TYPE: 'flow/config', id: instance.id, data: instance.config });
		MAIN.flowstream.save();
		MAIN.flowstream.refresh(instance.main.name, 'config');
	};

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

	flow.on('schema', function() {
		if (flow.ready) {
			for (var key in flow.sockets)
				flow.sockets[key].synchronize();
		}
	});

	// Load components
	MAIN.tms.refresh(flow, function() {
		flow.load(item.components, item.design, function() {

			for (var source of flow.sources) {
				if (source.socket)
					source.socket.synchronize();
			}

			flow.ready = true;
			callback && callback();
		});
	}, true);

};

ON('ready', function() {
	FS.load();
});

MAIN.flowstream = FS;