exports.install = function() {

	// FlowStream
	ROUTE('+API    /api/    -streams                          *Streams      --> query');
	ROUTE('+API    /api/    -streams_read/{id}                *Streams      --> read');
	ROUTE('+API    /api/    +streams_save                     *Streams      --> save');
	ROUTE('+API    /api/    -streams_remove/{id}              *Streams      --> remove');
	ROUTE('+API    /api/    -streams_stats                    *Streams      --> stats');

	// Sources
	ROUTE('+API    /api/    -sources/{fsid}                   *Sources      --> query');
	ROUTE('+API    /api/    -sources_read/{fsid}/{id}         *Sources      --> read');
	ROUTE('+API    /api/    +sources_save                     *Sources      --> meta save (response)', [5000]);
	ROUTE('+API    /api/    -sources_remove/{fsid}/{id}       *Sources      --> remove');

	// Variables
	ROUTE('+API    /api/    -variables                        *Variables    --> read');
	ROUTE('+API    /api/    +variables_save                   *Variables    --> save');

	// Clipboard
	ROUTE('+API    /api/    -clipboard_export/id              *Clipboard    --> export');
	ROUTE('+API    /api/    +clipboard_import                 *Clipboard    --> import');

	// Components
	ROUTE('+API    /api/    -components/{fsid}                *Components   --> query');
	ROUTE('+API    /api/    -components_read/{fsid}/{id}      *Components   --> read');
	ROUTE('+API    /api/    +components_save                  *Components   --> save');
	ROUTE('+API    /api/    -components_remove/{fsid}/{id}    *Components   --> remove');

	// Socket
	ROUTE('+SOCKET  /flows/{id}/', socket, 1024 * 5);

};

function notify(instance, msg) {
	var arr = instance.instances();
	arr.wait(function(com, next) {
		com[msg.TYPE] && com[msg.TYPE](msg);
		setImmediate(next);
	}, 3);
}

function socket(id) {

	var self = this;
	var timeout;
	var FS = MAIN.flowstream.instances[id];
	var DB = MAIN.flowstream.db[id];

	if (!FS) {
		self.destroy();
		return;
	}

	FS.ws = self;
	self.autodestroy(() => FS.ws = null);

	var refreshstatus = function() {

		timeout = null;
		var arr = FS.instances();

		// Sends last statuses
		arr.wait(function(com, next) {
			com.status();
			setImmediate(next);
		}, 3);

	};

	self.on('open', function(client) {
		timeout && clearTimeout(timeout);
		timeout = setTimeout(refreshstatus, 1500);
		client.send({ TYPE: 'flow/variables', data: FS.variables });
		client.send({ TYPE: 'flow/variables2', data: FS.variables2 });
		client.send({ TYPE: 'flow/components', data: FS.components(true) });
		client.send({ TYPE: 'flow/design', data: FS.export() });
		client.send({ TYPE: 'flow/errors', data: FS.errors });
	});

	self.on('message', function(client, message) {
		switch (message.TYPE) {
			case 'call':
				var instance = FS.meta.flow[message.id];
				if (instance && instance.call) {
					message.id = message.callbackid;
					message.TYPE = 'flow/call';
					instance.call(message.data, function(data) {
						message.data = data;
						client.send(message);
					});
				}
				break;
			case 'note':
				var instance = FS.meta.flow[message.id];
				if (instance) {
					instance.note = message.data;
					DB.design[message.id].note = message.data;
					message.TYPE = 'flow/note';
					self.send(message);
					MAIN.flowstream.save();
				}
				break;
			case 'status':
				notify(FS, message);
				break;
			case 'refresh':
				refreshstatus();
				break;
			case 'reset':
				FS.errors.length = 0;
				message.TYPE = 'flow/reset';
				self.send(message);
				break;
			case 'trigger':
				var instance = FS.meta.flow[message.id];
				instance && instance.trigger && instance.trigger(message);
				break;
			case 'reconfigure':
				FS.reconfigure(message.id, message.data);
				break;
			case 'save':
				DB.design = message.data;
				FS.use(CLONE(message.data), function(err) {
					err && ERROR(err);
					MAIN.flowstream.save();
					MAIN.flowstream.refresh(id, 'flow');
				});
				message.TYPE = 'flow/design';
				self.send(message, conn => conn !== client);
				break;
			case 'variables':
				FS.variables = DB.variables = message.data;
				MAIN.flowstream.save();
				for (var key in FS.meta.flow) {
					var instance = FS.meta.flow[key];
					instance.variables && instance.variables(DB.variables);
				}
				MAIN.flowstream.refresh(id, 'variables');
				break;
		}
	});
}