var TIDYUPWHITE = new RegExp(String.fromCharCode(160), 'g');

FUNC.import = function(callback) {
	SET('importform @default', { callback: callback });
	SET('common.form', 'importform');
};

FUNC.rtrim = function(value) {
	var lines = value.split('\n');
	var reg = /\s+$/;
	for (var i = 0; i < lines.length; i++)
		lines[i] = lines[i].replace(reg, '');
	return lines.join('\n').replace(TIDYUPWHITE, ' ');
};

(function() {

	var TABSCOUNT = function(val) {
		var count = 0;
		for (var i = 0; i < val.length; i++) {
			if (val.charAt(i) === '\t')
				count++;
			else
				break;
		}
		return count;
	};

	var TABS = function(count) {
		var str = '';
		for (var i = 0; i < count; i++)
			str += '\t';
		return str;
	};

	FUNC.wrapbracket = function(cm, pos) {

		var line = cm.getLine(pos.line);

		if (!(/(function|switch|else|with|if|for|while)\s\(/).test(line) || (/\w/).test(line.substring(pos.ch)))
			return;

		var tabs = TABSCOUNT(line);
		var lines = cm.lineCount();
		var plus = '';
		var nl;

		if (line.indexOf('= function') !== -1)
			plus = ';';
		else if (line.indexOf(', function') !== -1 || line.indexOf('(function') !== -1)
			plus = ');';

		if (pos.line + 1 >= lines) {
			// end of value
			cm.replaceRange('\n' + TABS(tabs + 1) + '\n' + TABS(tabs) + '}' + plus, pos, null, '+input');
			pos.line++;
			pos.ch = tabs + 1;
			cm.setCursor(pos);
			return true;
		}

		if (plus) {
			var lchar = line.substring(line.length - 2);

			if (lchar !== ');') {
				lchar = line.charAt(line.length - 1);
				if (lchar !== ';' && lchar !== ')')
					lchar = '';
			}

			if (lchar) {
				pos.ch = line.length - lchar.length;
				var post = {};
				post.line = pos.line;
				post.ch = line.length;
				cm.replaceRange('', pos, post, '+move');
			}
		}

		for (var i = pos.line + 1; i < lines; i++) {

			var cl = cm.getLine(i);
			var tc = TABSCOUNT(cl);

			if (tc <= tabs) {
				var nl = cl && cl.indexOf('}') === -1 ? true : false;
				pos.line = i - 1;
				pos.ch = 10000;
				cm.replaceRange('\n' + TABS(tabs) + '}' + plus + (nl ? '\n' : ''), pos, null, '+input');
				pos.ch = tabs.length;
				cm.setCursor(pos);
				return true;
			}
		}
	};
})();