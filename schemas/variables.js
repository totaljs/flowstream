// Global variables

NEWSCHEMA('Variables', function(schema) {

	schema.define('id', 'String(30)');
	schema.define('data', Object);

	schema.setRead(function($) {
		$.callback(MAIN.flowstream.db.variables);
	});

	schema.setSave(function($, model) {

		if (!model)
			model = {};

		if (model.id) {
			// Custom FlowStream
			var DB = MAIN.flowstream.db[model.id];
			if (DB) {
				var FS = MAIN.flowstream.instances[model.id];
				FS.variables = DB.variables = model.data;
				MAIN.flowstream.save();
				for (var key in FS.meta.flow) {
					var instance = FS.meta.flow[key];
					instance.variables && instance.variables(DB.variables);
				}
				MAIN.flowstream.refresh(model.id, 'variables');
				FS.ws && FS.ws.send({ TYPE: 'flow/variables', data: model.data });
				$.success();
			} else
				$.invalid(404);
			return;
		}

		MAIN.flowstream.db.variables = model;
		MAIN.flowstream.save();

		for (var key in MAIN.flowstream.instances) {
			var instance = MAIN.flowstream.instances[key];
			instance.variables2 = model;
			for (var id in instance.meta.flow) {
				var com = instance.meta.flow[id];
				com.variables2 && com.variables2(model);
			}
			instance.ws && instance.ws.send({ TYPE: 'flow/variables2', data: model });
		}

		$.success();

	});

	schema.addWorkflow('stream', function($) {
		var id = $.id;
		var DB = MAIN.flowstream.db[id];
		if (DB)
			$.callback(DB.variables || {});
		else
			$.invalid(404);
	});

});