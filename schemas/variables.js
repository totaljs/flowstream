// Global variables

NEWSCHEMA('Variables', function(schema) {

	schema.define('data', Object);

	schema.setRead(function($) {
		$.callback(MAIN.flowstream.db.variables);
	});

	schema.setSave(function($, model) {

		if (!model.data)
			model.data = {};

		MAIN.flowstream.db.variables = model.data;
		MAIN.flowstream.save();

		for (var key in MAIN.flowstream.instances) {
			var instance = MAIN.flowstream.instances[key];
			instance.variables2(model.data);
		}

		$.success();
	});

});