MAIN.tms = {};

function makemodel(item) {
	return { url: item.url, token: item.token, error: item.error };
}

function connect(fs, item, callback) {

	if (item.socket) {
		item.socket.close();
		item.socket = null;
	}

	WEBSOCKETCLIENT(function(client) {

		item.restart = false;
		client.options.reconnectserver = true;

		if (item.token)
			client.headers['x-token'] = item.token;

		client.on('open', function() {
			fs.sockets[item.id] = client;
			item.socket = client;
			item.error = 0;
			item.init = true;
			client.subscribers = {};
			client.tmsready = true;
			client.model = makemodel(item);
			AUDIT(client, 'open');

			if (fs.ready)
				client.synchronize();

		});

		client.synchronize = function() {

			client.synchronized = true;

			var publishers = {};

			for (var key in fs.meta.flow) {
				var instance = fs.meta.flow[key];
				var com = fs.meta.components[instance.component];
				if (com.itemid === item.id && com.outputs && com.outputs.length) {
					if (Object.keys(instance.connections).length)
						publishers[com.schema.id] = 1;
				}
			}

			client.send({ type: 'subscribers', subscribers: Object.keys(publishers) });
		};

		client.on('close', function(code) {

			if (code === 4001)
				client.destroy();

			item.error = code;
			client.model = makemodel(item);
			AUDIT(client, 'close');

			delete item.socket;
			delete fs.sockets[item.id];
			client.tmsready = false;
		});

		client.on('message', function(msg) {

			switch (msg.type) {
				case 'meta':

					item.meta = msg;

					var checksum = HASH(JSON.stringify(msg)) + '';
					client.subscribers = {};
					client.publishers = {};

					for (var i = 0; i < msg.publish.length; i++) {
						var pub = msg.publish[i];
						client.publishers[pub.id] = pub.schema;
					}

					for (var i = 0; i < msg.subscribe.length; i++) {
						var sub = msg.subscribe[i];
						client.subscribers[sub.id] = 1;
					}

					if (item.checksum !== checksum) {
						item.init = false;
						item.checksum = checksum;
						MAIN.tms.refresh2();
					}

					MAIN.tms.ready && client.synchronize();
					break;

				case 'subscribers':
					client.subscribers = {};
					if (msg.subscribers instanceof Array) {
						for (var i = 0; i < msg.subscribers.length; i++) {
							var key = msg.subscribers[i];
							client.subscribers[key] = 1;
						}
					}
					break;

				case 'publish':
					var schema = client.publishers[msg.id];
					if (schema) {
						// HACK: very fast validation
						var err = new ErrorBuilder();
						var data = framework_jsonschema.transform(schema, err, msg.data, true);
						if (data) {
							var id = 'pub' + item.id + 'X' + msg.id;
							for (var key in fs.meta.flow) {
								var flow = fs.meta.flow[key];
								if (flow.component === id)
									flow.process(data, client);
							}
						}
					}
					break;
			}

		});

		client.connect(item.url.replace(/^http/g, 'ws'));
		callback && setImmediate(callback);
	});
}

const TEMPLATE_PUBLISH = `<script total>

	exports.name = '{0}';
	exports.icon = '{3}';
	exports.config = {};
	exports.outputs = [{ id: 'publish', name: '{1}' }];
	exports.group = 'Publishers';
	exports.type = 'pub';
	exports.schemaid = ['{7}', '{1}'];

	exports.make = function(instance) {
		instance.process = function(msg, client) {
			instance.send('publish', msg, client);
		};
	};

</script>

<style>
	.f-{5} .url { font-size: 11px; }
</style>

<readme>
	{2}
</readme>

<body>
	<header>
		<div><i class="{3} mr5"></i><span>{0}</span></div>
		<div class="url">{4}</div>
	</header>
	<div class="schema">{6}</div>
</body>`;

const TEMPLATE_SUBSCRIBE = `<script total>

	exports.name = '{0}';
	exports.icon = '{3}';
	exports.group = 'Subscribers';
	exports.config = {};
	exports.inputs = [{ id: 'subscribe', name: '{1}' }];
	exports.type = 'sub';
	exports.schemaid = ['{7}', '{1}'];

	exports.make = function(instance) {
		instance.message = function(msg, client) {
			var socket = instance.main.sockets['{7}'];
			if (socket && socket.subscribers['{1}']) {
				/*
					var err = new ErrorBuilder();
					var data = framework_jsonschema.transform(schema, err, msg.data, true);
					if (data)
						socket.send({ type: 'subscribe', id: '{1}', data: data });
				*/
				socket.send({ type: 'subscribe', id: '{1}', data: msg.data });
			}
			msg.destroy();
		};
	};

</script>

<style>
	.f-{5} .url { font-size: 11px; }
</style>

<readme>
	{2}
</readme>

<body>
	<header>
		<div><i class="{3} mr5"></i><span>{0}</span></div>
		<div class="url">{4}</div>
	</header>
	<div class="schema">{6}</div>
</body>`;

function makeschema(item) {

	var str = '';

	for (var key in item.properties) {
		var prop = item.properties[key];
		str += '<div><code>{0}</code><span>{1}</span></div>'.format(key, prop.type);
	}

	return str;
}

MAIN.tms.refresh = function(fs, callback, replace) {

	fs.sources.wait(function(item, next) {

		if (item.init) {

			if (item.restart || !item.socket)
				connect(fs, item, next);
			else
				next();

		} else {

			var index = item.url.indexOf('/', 10);
			var url = item.url.substring(0, index);

			if (item.meta.publish instanceof Array) {
				for (var i = 0; i < item.meta.publish.length; i++) {
					var m = item.meta.publish[i];
					var readme = [];

					readme.push('# ' + item.meta.name);
					readme.push('- URL address: <' + url + '>');
					readme.push('- Channel: __publish__');
					readme.push('- JSON schema `' + m.id + '.json`');

					readme.push('```json');
					readme.push(JSON.stringify(m.schema, null, '  '));
					readme.push('```');

					var id = 'pub' + item.id + 'X' + m.id;

					if (replace) {
						var db = MAIN.flowstream.db[fs.name];
						db.components[id] = TEMPLATE_PUBLISH.format(item.meta.name, m.id, readme.join('\n'), m.icon || 'fas fa-broadcast-tower', m.url, id, makeschema(m.schema), item.id);
					} else {
						var com = fs.add(id, TEMPLATE_PUBLISH.format(item.meta.name, m.id, readme.join('\n'), m.icon || 'fas fa-broadcast-tower', m.url, id, makeschema(m.schema), item.id));
						m.url = url;
						com.type = 'pub';
						com.itemid = item.id;
						com.schema = m;
					}
				}
			}

			if (item.meta.subscribe instanceof Array) {
				for (var i = 0; i < item.meta.subscribe.length; i++) {
					var m = item.meta.subscribe[i];
					var readme = [];

					readme.push('# ' + item.meta.name);
					readme.push('- URL address: <' + url + '>');
					readme.push('- Channel: __subscribe__');
					readme.push('- JSON schema `' + m.id + '.json`');

					readme.push('```json');
					readme.push(JSON.stringify(m, null, '  '));
					readme.push('```');

					var id = 'sub' + item.id + 'X' + m.id;

					if (replace) {
						var db = MAIN.flowstream.db[fs.name];
						db.components[id] = TEMPLATE_SUBSCRIBE.format(item.meta.name, m.id, readme.join('\n'), m.icon || 'fas fa-satellite-dish', m.url, id, makeschema(m.schema), item.id);
					} else {
						var com = fs.add(id, TEMPLATE_SUBSCRIBE.format(item.meta.name, m.id, readme.join('\n'), m.icon || 'fas fa-satellite-dish', m.url, id, makeschema(m.schema), item.id));
						m.url = url;
						com.type = 'sub';
						com.itemid = item.id;
						com.schema = m;
					}
				}
			}

			if (item.socket)
				next();
			else
				connect(fs, item, next);
		}

	}, function() {

		var components = fs.meta.components;
		var unregister = [];

		for (var key in components) {
			var com = components[key];
			var type = com.type;
			if (type === 'pub' || type === 'sub') {
				var index = key.indexOf('X');
				if (index !== -1) {

					var sourceid = key.substring(3, index);
					var subid = key.substring(index + 1);
					var source = fs.sources.findItem('id', sourceid);

					if (source) {
						if (type === 'pub') {
							if (source.meta.publish instanceof Array) {
								if (source.meta.publish.findItem('id', subid))
									continue;
							}
						} else {
							if (source.meta.subscribe instanceof Array) {
								if (source.meta.subscribe.findItem('id', subid))
									continue;
							}
						}
					}

					unregister.push(key);
				}
			}
		}

		unregister.wait(function(key, next) {
			fs.unregister(key, next);
		}, function() {

			if (fs.ws) {
				fs.ws.send({ TYPE: 'flow/components', data: fs.components(true) });
				fs.ws.send({ TYPE: 'flow/design', data: fs.export() });
			}

			MAIN.flowstream.save();
			callback && callback();
		});

	});

};

MAIN.tms.synchronize = function(fs, force) {

	var sync = {};

	for (var key in fs.meta.components) {
		var com = fs.meta.components[key];
		if (com.itemid)
			sync[com.itemid] = fs.sources.findItem('id', com.itemid);
	}

	for (var key in sync) {
		var source = sync[key];
		if (source && source.socket && (force || !source.socket.synchronized))
			source.socket.synchronize();
	}
};

MAIN.tms.refresh2 = function(fs) {
	setTimeout2('tms_refresh_' + fs.name, function() {
		MAIN.tms.refresh(fs);
	}, 500);
};