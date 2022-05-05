const SERVICES_URL = "https://codeberg.org/PrivacyDev/DPR-addon/raw/branch/master/src/services.json";
const UPDATE_INTERVAL_MINUTES = 60 * 2;

let g_listeners = [];

function errorHandler(error) {
	console.error(error);
}

function addListener(urls, listeners, listener) {
	chrome.webRequest.onBeforeRequest.addListener(listener, {"urls": urls}, ["blocking"]);
	listeners.push(listener);
}

function transformUrl(srcUrlStr, service) {
	// select random instance
	let instances = service.instances.map((instances, i) => instances.map(instance => [instance, i])).reduce((a, b) => a.concat(b));
	let [instance, index] = instances[Math.floor(Math.random() * instances.length)];

	// search for longest pattern match and use the corresponding transformation
	let matches = {};
	service.transformations.forEach(transformation => {
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

function createListeners(services) {
	let listeners = [];
	services.forEach(service => {
		let urls = new Set();
		service.transformations.forEach(transformation => {
			urls.add("*://*." + transformation.domain + "/*");
		});
		addListener(Array.from(urls), listeners, details => {
			if(service.documentOnly && details.documentUrl)
				return;

			return {"redirectUrl": transformUrl(details.url, service)};
		});
	});
	return listeners;
}

async function updateConfig() {
	
	console.log("updating service list...");

	let response = await fetch(SERVICES_URL);
	if(!response.ok) {
		console.error("updating service failed!");
		return;
	}
	let services = await response.json();
	chrome.storage.local.set({"config": {"lastUpdated": Date.now(), "services": services}});
	
	let listeners = createListeners(services);

	g_listeners.forEach(listener => {
		chrome.webRequest.onBeforeRequest.removeListener(listener);
	});
	g_listeners = listeners;

	console.log("service list updated successfully!");
}

function wrappedUpdateConfig() {
	updateConfig().catch(errorHandler);
}

chrome.alarms.onAlarm.addListener(wrappedUpdateConfig);

console.log("initializing addon...");

chrome.storage.local.get("config", async items => {
	let config = items.config;
	if(!config) {
		let services = await (await fetch("services.json")).json();
		config = {"services": services};
		chrome.storage.local.set({"config": config}, wrappedUpdateConfig);
	}

	let nextUpdateTimestamp = Math.max((config.lastUpdated || 0) + (1000 * UPDATE_INTERVAL_MINUTES), Date.now() + (1000 * 30));
	console.log("next update is scheduled for: " + new Date(nextUpdateTimestamp).toString());

	chrome.alarms.create({
		"periodInMinutes": UPDATE_INTERVAL_MINUTES,
		"when": nextUpdateTimestamp
	});

	g_listeners = createListeners(config.services);

	console.log("addon initialized successfully!");
});
