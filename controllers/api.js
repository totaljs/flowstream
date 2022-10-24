exports.install = function() {

	// FlowStream
	ROUTE('+API    /api/    -streams                          *Streams      --> query');
	ROUTE('+API    /api/    -streams_read/{id}                *Streams      --> read');
	ROUTE('+API    /api/    +streams_save                     *Streams      --> save');
	ROUTE('+API    /api/    -streams_remove/{id}              *Streams      --> remove');
	ROUTE('+API    /api/    -streams_stats                    *Streams      --> stats');
	ROUTE('+API    /api/    -streams_pause/{id}               *Streams      --> pause');
	ROUTE('+API    /api/    -streams_restart/{id}             *Streams      --> restart');

	// Variables
	ROUTE('+API    /api/    -variables                        *Variables    --> read');
	ROUTE('+API    /api/    +variables_save                   *Variables    --> save');

	// Clipboard
	ROUTE('+API    /api/    -clipboard_export/id              *Clipboard    --> export');
	ROUTE('+API    /api/    +clipboard_import                 *Clipboard    --> import', [60000 * 5]);

	// Socket
	ROUTE('+SOCKET  /flows/{id}/',     socket, 1024 * 5);

	// Notifications
	ROUTE('GET      /notify/{id}/',    notify);
	ROUTE('POST     /notify/{id}/',    notify);
};

function socket(id) {
	var self = this;
	MODULE('flowstream').socket(id, self);
}

function notify(id) {

	var self = this;

	if (PREF.notify) {
		var arr = id.split('-');
		var instance = MAIN.flowstream.instances[arr[0]];
		if (instance) {
			var obj = {};
			obj.id = arr[1];
			obj.method = self.req.method;
			obj.headers = self.headers;
			obj.query = self.query;
			obj.body = self.body;
			obj.url = self.url;
			obj.ip = self.ip;
			arr[1] && instance.notify(arr[1], obj);
			instance.flow && instance.flow.$socket && instance.flow.$socket.send({ TYPE: 'flow/notify', data: obj });
		}
	}

	self.html('<html><body style="font-family:Arial;font-size:11px;color:#777;background-color:#FFF">Close the window<script>window.close();</script></body></html>');
}