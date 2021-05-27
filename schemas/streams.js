NEWSCHEMA('Streams', function(schema) {

	schema.define('id', 'String(30)');
	schema.define('name', String, true);
	schema.define('author', String);
	schema.define('version', String);
	schema.define('icon', String);
	schema.define('reference', String);
	schema.define('group', String);
	schema.define('url', String);
	schema.define('color', 'String(7)');
	schema.define('readme', String);

	schema.setQuery(function($) {
		var arr = [];
		for (var key in MAIN.flowstream.db) {
			if (key !== 'variables') {
				var item = MAIN.flowstream.db[key];
				var instance = MAIN.flowstream.instances[key];
				var outputs = [];
				var inputs = [];

				for (var id in instance.meta.flow) {
					var fi = instance.meta.flow[id];
					var ci = instance.meta.components[fi.component];
					if (ci) {
						if (ci.type === 'output')
							outputs.push({ name: fi.config.name, note: fi.note });
						if (ci.type === 'input')
							inputs.push({ name: fi.config.name, note: fi.note });
					}
				}

				arr.push({ id: item.id, name: item.name, group: item.group, author: item.author, reference: item.reference, url: item.url, color: item.color, icon: item.icon, readme: item.readme, dtcreated: item.dtcreated, dtupdated: item.dtupdated, errors: !!instance.errors.length, stats: instance.stats, size: item.size || 0, version: item.version, outputs: outputs, inputs: inputs });
			}
		}
		$.callback(arr);
	});

	schema.setRead(function($) {
		var id = $.id;
		var item = MAIN.flowstream.db[id];
		if (item) {
			var data = {};
			for (var key of schema.fields)
				data[key] = item[key];
			$.callback(data);
		} else
			$.invalid(404);
	});

	schema.setSave(function($, model) {

		var init = !model.id;

		if (init) {
			model.id = 'f' + UID();
			model.design = {};
			model.components = {};
			model.variables = {};
			model.dtcreated = NOW;
			MAIN.flowstream.db[model.id] = model;
			MAIN.flowstream.init(model.id, ERROR('FlowStream.init'));
			MAIN.flowstream.refresh(model.id, 'meta');
		} else {
			var item = MAIN.flowstream.db[model.id];
			if (item) {
				item.dtupdated = NOW;
				item.name = model.name;
				item.icon = model.icon;
				item.url = model.url;
				item.version = model.version;
				item.reference = model.reference;
				item.author = model.author;
				item.group = model.group;
				item.color = model.color;
				item.readme = model.readme;
				MAIN.flowstream.refresh(model.id, 'meta');
			} else {
				$.invalid(404);
				return;
			}
		}

		MAIN.flowstream.save();
		AUDIT($);
		$.success();
	});

	schema.setRemove(function($) {
		var id = $.id;
		var item = MAIN.flowstream.db[id];
		if (item) {
			var instance = MAIN.flowstream.instances[id];
			instance.destroy();
			instance.ws && instance.ws.destroy();
			delete MAIN.flowstream.db[id];
			MAIN.flowstream.save();
			AUDIT($);
			$.success();
		} else
			$.invalid(404);
	});

	schema.addWorkflow('raw', function($) {
		var item = MAIN.flowstream.db[$.id];
		if (item)
			$.callback(item);
		else
			$.invalid(404);
	});

	schema.addWorkflow('stats', function($) {

		var data = {};
		data.messages = 0;
		data.pending = 0;
		data.mm = 0;
		data.memory = process.memoryUsage().heapUsed;

		for (var key in MAIN.flowstream.instances) {
			var flow = MAIN.flowstream.instances[key];
			data.messages += flow.stats.messages;
			data.mm += flow.stats.mm;
			data.pending += flow.stats.pending;
		}

		$.callback(data);
	});

});
