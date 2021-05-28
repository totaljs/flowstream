exports.install = function() {
	ROUTE('+GET /*');
	ROUTE('+GET /flows/{id}/', 'flow');
};