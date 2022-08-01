const SERVICES_URL = "https://codeberg.org/PrivacyDev/DPR-addon/raw/branch/master/src/services.json";
const UPDATE_INTERVAL_MINUTES = 60 * 2;

function flattenInstanceList(instances) {
	return instances.map((instances, i) => instances.map(instance => [instance, i])).reduce((a, b) => a.concat(b));
}

function transformUrl(srcUrlStr, instances, transformations) {
	// select random instance
	let [instance, index] = instances[Math.floor(Math.random() * instances.length)];

	// search for longest pattern match and use the corresponding transformation
	let matches = {};
	transformations.forEach(transformation => {
		let pattern = new RegExp("^.*?://(?:.*?\\.)?" + transformation.pattern.replace("{{domain}}", transformation.domain.replace(".", "\\.")));
		let match = srcUrlStr.match(pattern);
		if(match) matches[match[0]] = [pattern, transformation.replacements[index]];
	});
	let longestMatch = Object.keys(matches).reduce((a, b) => {
		if(a.length < b.length) return b;
		return a;
	});
	let [pattern, replacement] = matches[longestMatch];

	// perform transformation
	let dstUrlStr = srcUrlStr.replace(pattern, "https://" + replacement.replace("{{instance}}", instance));
	return dstUrlStr;
}

function startAutoUpdate(lastUpdated, updateFunction) {
	let nextUpdateTimestamp = Math.max((lastUpdated || 0) + (1000 * UPDATE_INTERVAL_MINUTES), Date.now() + (1000 * 30));
	console.log("next update is scheduled for: " + new Date(nextUpdateTimestamp).toString());

	setTimeout(() => {
		setInterval(updateFunction, UPDATE_INTERVAL_MINUTES);
	}, nextUpdateTimestamp);
}

if(exports) {
	exports.flattenInstanceList = flattenInstanceList;
	exports.transformUrl = transformUrl;
}
