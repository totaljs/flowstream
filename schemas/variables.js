// Global variables

NEWSCHEMA('Variables', function(schema) {

	schema.define('data', Object);

	schema.setRead(function($) {
		$.callback(MAIN.flowstream.db.variables);
	});

	schema.setSave(function($, model) {

		if (!model)
			model = {};

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

});