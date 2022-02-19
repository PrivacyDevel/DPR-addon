const SERVICES_URL = "https://codeberg.org/PrivacyDev/DPR-addon/raw/branch/master/src/services.json";
const UPDATE_INTERVAL_MINUTES = 60 * 2;

let g_listeners = [];

function errorHandler(error) {
	console.error(error);
}

function createListeners(services) {
	let listeners = [];
	for(let service of services) {
		let listener = details => {
			let instance = new URL(service.instances[Math.floor(Math.random() * service.instances.length)]);
			let url = new URL(details.url);

			if(service.documentOnly && details.documentUrl)
				return;

			url.hostname = instance.hostname;
			url.protocol = instance.protocol;
			return {"redirectUrl": url.toString()};
		};
		browser.webRequest.onBeforeRequest.addListener(listener, {"urls": service.orig}, ["blocking"]);
		listeners.push(listener);
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
	await browser.storage.local.set({"config": {"lastUpdated": Date.now(), "services": services}});
	
	let listeners = createListeners(services);
	for(let listener of g_listeners) {
		browser.webRequest.onBeforeRequest.removeListener(listener);
	}
	g_listeners = listeners;

	console.log("service list updated successfully!");
}

browser.alarms.onAlarm.addListener(alarm => {
	updateConfig().catch(errorHandler);
});

(async() => {

	console.log("initializing addon...");
	
	let config = (await browser.storage.local.get("config")).config;
	if(!config) {
		let services = await (await fetch("services.json")).json();
		config = {"services": services};
		await browser.storage.local.set({"config": config});
		updateConfig().catch(errorHandler);
	}

	let nextUpdateTimestamp = Math.max((config.lastUpdated || 0) + (1000 * UPDATE_INTERVAL_MINUTES), Date.now() + (1000 * 30));
	console.log("next update is scheduled for: " + new Date(nextUpdateTimestamp).toString());

	browser.alarms.create({
		"periodInMinutes": UPDATE_INTERVAL_MINUTES,
		"when": nextUpdateTimestamp
	});

	g_listeners = createListeners(config.services);

	console.log("addon initialized successfully!");

})().catch(errorHandler);
