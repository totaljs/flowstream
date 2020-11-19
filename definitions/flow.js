const Fs = require('fs');
const Path = require('path');

var FLOW = {};

FLOW.instance = FLOWSTREAM();
FLOW.instance.interval = 5000;
FLOW.instance.on('stats', function() {
	if (MAIN.ws) {
		FLOW.instance.stats.TYPE = 'flow/stats';
		MAIN.ws.send(FLOW.instance.stats);
	}
});

FLOW.instance.onstatus = function(status) {

	var instance = this;

	if (status == null)
		status = instance.currentstatus;
	else
		instance.currentstatus = status;

	if (status != null)
		MAIN.ws && MAIN.ws.send({ TYPE: 'flow/status', id: instance.id, data: status });

};

FLOW.instance.ondashboard = function(status) {

	var instance = this;

	if (status == null)
		status = instance.dashboardstatus;
	else
		instance.dashboardstatus = status;

	if (status != null)
		MAIN.ws && MAIN.ws.send({ TYPE: 'dashboard', id: instance.id, component: instance.component, data: status });

};

// Refresh all components
FLOW.refresh = function(callback) {
	var path = PATH.root('private');
	Fs.readdir(path, function(err, files) {
		files.wait(function(item, next) {

			if (item.indexOf('flow_') === -1 || item.lastIndexOf('.html') === -1) {
				next();
				return;
			}

			Fs.readFile(Path.join(path, item), function(err, response) {
				FLOW.instance.add(item.replace(/flow_|\.html/g, ''), response.toString('utf8'));
				next();
			});

		}, callback);
	});
};

FLOW.json = function(controller) {
	Fs.readFile(PATH.databases('flow.json'), function(err, response) {
		controller.binary(response ? response : Buffer.from('{}', 'ascii'), 'application/json');
	});
};

FLOW.dashboard = function() {

	var meta = FLOW.instance.meta;
	var output = [];

	var keys = Object.keys(meta.flow);
	for (var i = 0; i < keys.length; i++) {
		var item = meta.flow[keys[i]];
		var com = meta.components[item.component];
		var data = {};
		data.id = item.id;
		data.component = item.component;
		data.name = com.name;
		data.icon = com.icon;
		output.push(data);
	}

	return output;
};

FLOW.save = function(data) {
	Fs.writeFile(PATH.databases('flow.json'), data, ERROR('FLOW.save'));
};

FLOW.load = function() {
	Fs.readFile(PATH.databases('flow.json'), function(err, response) {
		if (response) {

			FLOW.instance.use(response.toString('utf8').parseJSON(true), ERROR('FLOW'));
			FLOW.topics = {};

			var meta = FLOW.instance.meta;
			var components = meta.components;
			var keys = Object.keys(meta.flow);

			for (var i = 0; i < keys.length; i++) {
				var key = keys[i];
				var instance = meta.flow[key];
				var com = components[instance.component];
				if (com.topics) {
					for (var j = 0; j < com.topics.length; j++) {
						if (!FLOW.topics[com.topics[j]])
							FLOW.topics[com.topics[j]] = [];
						FLOW.topics[com.topics[j]].push(instance.id);
					}
				}
			}
		}
	});
};

ON('ready', function() {
	FLOW.refresh(FLOW.load);

	if (DEBUG)
		setInterval(FLOW.refresh, 5000);

});

global.FLOW = FLOW;