if (!DEF.onAuthorize) {
	AUTH(function($) {
		$.success(EMPTYOBJECT);
	});
}