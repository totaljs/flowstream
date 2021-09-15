const DB_FILE = 'database.json';
const DIRECTORY = CONF.directory || PATH.root('flowstream');

PATH.mkdir(DIRECTORY);

var FS = {};

FS.version = 1;
FS.db = {};
FS.instances = {};

var saveid;

FS.save = function() {
	saveid && clearTimeout(saveid);
	saveid = setTimeout(FS.save_force, 1000);
};

FS.save_force = function() {
	saveid = null;

	for (var key in FS.db) {
		if (key !== 'variables') {
			var flow = FS.db[key];
			flow.size = Buffer.byteLength(JSON.stringify(flow));
		}
	}

	if (CONF.backup) {
		PATH.fs.rename(PATH.join(DIRECTORY, DB_FILE), PATH.join(DIRECTORY, DB_FILE.replace(/\.json/, '') + '_' + (new Date()).format('yyyyMMddHHmm') + '.bk'), function() {
			PATH.fs.writeFile(PATH.join(DIRECTORY, DB_FILE), JSON.stringify(FS.db), ERROR('FlowStream.save'));
		});
	} else
		PATH.fs.writeFile(PATH.join(DIRECTORY, DB_FILE), JSON.stringify(FS.db), ERROR('FlowStream.save'));
};

FS.init = function(id, next) {

	var flow = FS.db[id];
	flow.variables2 = FS.db.variables || {};

	MODULE('flowstream').init(flow, CONF.flowstream_worker, function(err, instance) {

		instance.ondestroy = function() {
			for (var key in instance.routes)
				instance.routes[key].remove();
		};

		instance.ondone = () => next();
		instance.onerror = (err, type) => console.log('FlowError', err, type);
		instance.onroute = function(url, remove) {

			var flags = [60000];

			url = url.replace(/#[a-z0-9]+/g, function(text) {
				text = text.substring(1);
				if ((/^\d+$/).test(text))
					text = +text;
				flags.push(text);
				return '';
			}).trim();

			var route;

			if (remove) {
				route = instance.routes[url];
				if (route) {
					route.remove();
					delete instance.routes[url];
				}
				return;
			}

			if (instance.routes[url])
				instance.routes[url].remove();

			route = ROUTE(url, function() {

				var self = this;
				var opt = {};
				opt.id = url;
				opt.params = self.params;
				opt.query = self.query;
				opt.body = self.body;
				opt.files = self.files;
				opt.headers = self.headers;
				opt.url = self.url;
				opt.ip = self.ip;

				instance.request(opt, function(err, meta) {

					if (err) {
						self.throw500(err);
						return;
					}

					if (meta.status)
						self.status = meta.status;

					if (meta.headers) {
						for (var key in meta.headers)
							self.header(key, meta.headers[key]);
					}

					var data = meta.body || meta.data || meta.payload;
					switch (meta.type) {
						case 'text':
						case 'plain':
							self.plain(data);
							break;
						case 'html':
							self.content(data, 'text/html');
							break;
						case 'xml':
							self.content(data, 'text/xml');
							break;
						default:
							self.json(data);
							break;
					}

				}, flags);
			});

			instance.routes[url] = route;
		};

		instance.onsave = function(data) {
			delete flow.variables2;
			FS.db[id] = data;
			FS.save();
		};

		FS.instances[id] = instance;
	});

};

ON('ready', function() {

	PATH.fs.readFile(PATH.join(DIRECTORY, DB_FILE), function(err, data) {

		FS.db = data ? data.toString('utf8').parseJSON(true) : {};

		if (!FS.db.variables)
			FS.db.variables = {};

		Object.keys(FS.db).wait(function(key, next) {
			if (key === 'variables') {
				next();
			} else
				FS.init(key, next);
		});

	});

});

MAIN.flowstream = FS;