NEWSCHEMA('Sources', function(schema) {

	schema.define('flowstreamid', 'String(30)');
	schema.define('id', UID);
	schema.define('url', String, true);
	schema.define('token', String);

	schema.addWorkflow('meta', function($, model) {

		var DB = MAIN.flowstream.db[model.flowstreamid];
		if (!DB) {
			$.invalid(404);
			return;
		}

		var item = DB.sources.findItem('url', model.url);
		if (item && item.id !== model.id) {
			$.invalid('@(The source already exists in the database.)');
			return;
		}

		check(model, function(err, response) {

			if (err) {
				$.invalid(err);
				return;
			}

			model.meta = response;
			$.success();
		});
	});

	schema.setQuery(function($) {

		var FS = MAIN.flowstream.instances[$.params.fsid];
		if (!FS) {
			$.invalid(404);
			return;
		}

		var output = [];

		for (var i = 0; i < FS.sources.length; i++) {
			var app = FS.sources[i];
			output.push({ id: app.id, url: app.url, name: app.meta.name, dtcreated: app.dtcreated, online: !!app.socket, error: app.error });
		}

		$.callback(output);
	});

	schema.setRemove(function($) {

		var FS = MAIN.flowstream.instances[$.params.fsid];
		if (!FS) {
			$.invalid(404);
			return;
		}

		var id = $.params.id;
		var index = FS.sources.findIndex('id', id);
		if (index !== -1) {
			var app = FS.sources[index];
			FS.sources.splice(index, 1);
			// FUNC.refresh();
			// FUNC.save();
			app.socket && app.socket.close();
			MAIN.flowstream.save();
			$.success();
		} else
			$.invalid(404);
	});

	schema.setRead(function($) {
		var FS = MAIN.flowstream.instances[$.params.fsid];
		if (FS) {
			var id = $.params.id;
			var app = FS.sources.findItem('id', id);
			if (app) {
				$.callback({ id: id, url: app.url, token: app.token });
				return;
			}
		}
		$.invalid(404);
	});

	schema.setSave(function($, model) {

		var FS = MAIN.flowstream.instances[model.flowstreamid];
		if (!FS) {
			$.invalid(404);
			return;
		}

		var DB = MAIN.flowstream.db[model.flowstreamid];

		var item = model.id ? FS.sources.findItem('id', model.id) : null;
		if (item) {

			item.url = model.url;
			item.token = model.token;
			item.dtupdated = NOW;
			item.meta = model.meta;
			item.checksum = HASH(JSON.stringify(model.meta)) + '';
			item.restart = true;

			var source = DB.sources.findItem('id', model.id);
			source.url = item.url;
			source.token = item.token;
			source.dtupdated = NOW;
			source.meta = item.meta;
			source.checksum = item.checksum;

		} else {

			delete model.flowstreamid;

			model.id = UID();
			model.dtcreated = NOW;
			model.checksum = HASH(JSON.stringify(model.meta)) + '';

			if (!DB.sources)
				DB.sources = [];

			DB.sources.push(CLONE(model));

			model.restart = true;
			FS.sources.push(model);
		}

		MAIN.tms.refresh(FS);
		MAIN.flowstream.save();
		$.success();
	});

});

function check(item, callback) {
	WEBSOCKETCLIENT(function(client) {

		if (item.token)
			client.headers['x-token'] = item.token;

		client.options.reconnect = 0;

		client.on('open', function() {
			client.tmsready = true;
		});

		client.on('error', function(err) {
			client.tmsready = false;
			callback(err);
			clearTimeout(client.timeout);
		});

		client.on('close', function() {
			client.tmsready = false;
			callback(401);
		});

		client.on('message', function(msg) {
			switch (msg.type) {
				case 'meta':
					callback(null, msg);
					clearTimeout(client.timeout);
					client.close();
					break;
			}
		});

		client.timeout = setTimeout(function() {
			if (client.tmsready) {
				client.close();
				callback(408);
			}
		}, 1500);

		client.connect(item.url.replace(/^http/g, 'ws'));
	});
}