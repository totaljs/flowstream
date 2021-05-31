const DB_FILE = 'database.json';
const DIRECTORY = CONF.directory || PATH.root('flowstream');

PATH.mkdir(DIRECTORY);

var FS = {};

FS.version = 1;
FS.db = {};
FS.instances = {};

require('total4/flowstream').prototypes().Message.variables = function(str, data) {
	if (str.indexOf('{') !== -1) {
		str = str.args(this.vars);
		if (str.indexOf('{') !== -1) {
			str = str.args(this.instance.main.variables);
			if (str.indexOf('{') !== -1) {
				str = str.args(this.instance.main.variables2);
				if (data == true || (data && typeof(data) === 'object'))
					str = str.args(data == true ? this.data : data);
			}
		}
	}
	return str;
};

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
			FS.refresh_io();
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
			FS.refresh_io();
			callback && callback();
		});
	}, true);

};

const TEMPLATE_INPUT = `<script total>

	exports.name = '{title}';
	exports.icon = '{icon}';
	exports.config = {};
	exports.outputs = [{ id: 'data', name: 'Output' }];
	exports.group = 'Inputs';
	exports.type = 'input2';

	exports.make = function(instance) {
	};

</script>

<readme>
	{readme}
</readme>

<body>
	<header>
		<div><i class="{icon} mr5"></i><span>{title}</span></div>
	</header>
</body>`;

const TEMPLATE_OUTPUT = `<script total>

	exports.name = '{title}';
	exports.icon = '{icon}';
	exports.config = {};
	exports.inputs = [{ id: 'data', name: 'Input' }];
	exports.group = 'Outputs';
	exports.type = 'output2';

	exports.make = function(instance) {

		var instances = null;

		instance.message = function($) {
			if (instances && instances.length) {
				for (var com of instances)
					com.send('data', $);
			}
		};

		instance.flowstream = function() {
			instances = [];
			for (var key in MAIN.flowstream.instances) {
				var fs = MAIN.flowstream.instances[key];
				for (var fid in fs.meta.flow) {
					var fi = fs.meta.flow[fid];
					var com = fs.meta.components[fi.component];
					if (com.type === 'input')
						instances.push(fi);
				}
			}
		};

		instance.configure = function() {
			MAIN.flowstream.refresh_io();
		};

		setTimeout(() => instance.flowstream(), 500);
	};

</script>

<readme>
	{readme}
</readme>

<body>
	<header>
		<div><i class="{icon} mr5"></i><span>{title}</span></div>
	</header>
</body>`;


var refreshioid;

// Refreshes Inputs/Outputs component
FS.refresh_io = function() {
	refreshioid && clearTimeout(refreshioid);
	refreshioid = setTimeout(FS.refresh_io_force, 500);
};

FS.refresh_io_force = function() {

	refreshioid = null;

	var components = [];

	for (var key in MAIN.flowstream.instances) {
		var instance = MAIN.flowstream.instances[key];
		var db = MAIN.flowstream.db[key];
		for (var a in instance.meta.flow) {
			var fi = instance.meta.flow[a];
			var ci = instance.meta.components[fi.component];
			if (ci.type === 'input' || ci.type === 'output')
				components.push({ id: key + '_' + a, fsid: key, flow: db.name, name: fi.config.name, readme: fi.config.readme, icon: db.icon, reference: db.reference, type: ci.type });
		}
	}

	var ts = Date.now().toString(36) + '';
	var checksum = {};
	var isrefresh = false;

	Object.keys(MAIN.flowstream.instances).wait(function(key, next) {
		var instance = MAIN.flowstream.instances[key];
		var db = MAIN.flowstream.db[key];
		components.wait(function(com, next) {
			if (com.fsid !== key) {

				var a = instance.meta.components[com.id];
				if (a && a.ui)
					checksum[com.id] = a.ui.checksum;

				var arg = {};
				arg.title = com.flow + ': ' + com.name;
				arg.name = com.name;
				arg.readme = com.readme;
				arg.icon = com.icon;
				arg.reference = com.reference;
				db.components[com.id] = com.type === 'input' ? TEMPLATE_OUTPUT.arg(arg) : TEMPLATE_INPUT.arg(arg);
				var imported = instance.add(com.id, db.components[com.id], next);
				imported.ts = ts;
				if (checksum[com.id] !== imported.ui.checksum) {
					checksum[com.id] = imported.ui.checksum;
					isrefresh = true;
				}
			} else
				next();
		}, next);
	}, function() {

		for (var key in MAIN.flowstream.instances) {
			var instance = MAIN.flowstream.instances[key];
			for (var comid in instance.meta.components) {
				var com = instance.meta.components[comid];
				if ((com.type === 'input2' || com.type === 'output2') && com.ts !== ts) {
					instance.unregister(comid);
					delete MAIN.flowstream.db[key].components[comid];
				}
			}
		}

		// clean removed
		MAIN.flowstream.save();

		if (isrefresh) {
			for (var key in MAIN.flowstream.instances) {
				var instance = MAIN.flowstream.instances[key];
				instance.ws && instance.ws.send({ TYPE: 'flow/components', data: instance.components(true) });
			}
		}

	});


};

ON('ready', function() {
	FS.load();
});

MAIN.flowstream = FS;