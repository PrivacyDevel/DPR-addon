const SERVICES_URL = "https://codeberg.org/PrivacyDev/DPR-addon/raw/branch/master/src/services.json";
const UPDATE_INTERVAL_MINUTES = 60 * 2;

let g_listeners = [];

function errorHandler(error) {
	console.error(error);
}

function addListener(url, listeners, listener) {
	chrome.webRequest.onBeforeRequest.addListener(listener, {"urls": url}, ["blocking"]);
	listeners.push(listener);
}

function transformUrl(srcUrlStr, instances) {
	let instance = new URL(instances[Math.floor(Math.random() * instances.length)]);
	let url = new URL(srcUrlStr);

	url.hostname = instance.hostname;
	url.protocol = instance.protocol;
}

function createListeners(services) {
	let listeners = [];
	for(let service of services) {
		addListener(service.org, listeners, details => {
			if(service.documentOnly && details.documentUrl)
				return;
			return {"redirectUrl": transformUrl(details.url, service.instances).toString()};
		});
		if(service.orig == "*://*.youtube.com/*") {
			addListener("*://youtu.be/*", listeners, details => {
				let url = transformUrl(details.url, service.instances);
				let oldSearch = url.search.slice(1);
				url.search = "?v=" + url.pathname.slice(1);
				if(oldSearch.length)
					url.search += "&" + oldSearch;
				url.pathname = "/watch";
				return {"redirectUrl": url.toString()};
			});
		}
	}
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
	for(let listener of g_listeners) {
		chrome.webRequest.onBeforeRequest.removeListener(listener);
	}
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
