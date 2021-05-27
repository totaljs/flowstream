NEWSCHEMA('Components', function(schema) {

	schema.define('flowstreamid', 'String(30)', true);
	schema.define('id', 'String(30)');
	schema.define('body', String, true);

	schema.setRead(function($) {
		var item = MAIN.flowstream.db[$.params.fsid];
		if (item) {
			var component = item.components[$.params.id];
			if (component)
				$.callback({ id: $.params.id, flowstreamid: $.params.fsid, body: component });
			else
				$.invalid(404);
		} else
			$.invalid(404);

	});

	schema.setSave(function($, model) {

		var item = MAIN.flowstream.db[model.flowstreamid];
		if (!item) {
			$.invalid(404);
			return;
		}

		if (!model.id)
			model.id = 'c' + UID();

		item.components[model.id] = model.body;

		AUDIT($);

		var instance = MAIN.flowstream.instances[model.flowstreamid];

		instance.add(model.id, model.body, $.successful(function() {
			instance.ws && instance.ws.send({ TYPE: 'flow/components', data: instance.components(true) });
			MAIN.flowstream.save();
			$.success();
		}));

	});

	schema.setRemove(function($) {
		var item = MAIN.flowstream.db[$.params.fsid];
		if (item) {

			AUDIT($);

			var instance = MAIN.flowstream.instances[$.params.fsid];
			instance.unregister($.params.id, function() {
				delete item.components[$.params.id];

				if (instance.ws) {
					instance.ws.send({ TYPE: 'flow/components', data: instance.components(true) });
					instance.ws.send({ TYPE: 'flow/design', data: instance.export() });
				}

				$.success();
				MAIN.flowstream.save();
			});

		} else
			$.invalid(404);

	});

});