let g_beforeRequestListeners = [];
let g_beforeSendHeadersListeners = [];

function createListeners(services) {
	let beforeRequestListeners = [];
	let beforeSendHeadersListeners = [];
	services.forEach(service => {

		let instances = flattenInstanceList(service.instances);

		let urls = new Set();
		service.transformations.forEach(transformation => {
			urls.add("*://*." + transformation.domain + "/*");
		});
		let listener = details => {
			if(service.documentOnly && details.documentUrl)
				return;

			return {"redirectUrl": transformUrl(details.url, instances, service.transformations)};
		};
		chrome.webRequest.onBeforeRequest.addListener(listener, {"urls": Array.from(urls)}, ["blocking"]);
		beforeRequestListeners.push(listener);

		listener = details => {
			let newHeaders = [];
			details.requestHeaders.forEach(header => {
				if(header.name.toLowerCase() != "cookies")
					newHeaders.push(header);
			});
			for(let [instance, index] of instances) {
				if(details.url.startsWith("https://" + instance) && service.cookies) {
					cookies = service.cookies[index];
					if(cookies)
						newHeaders.push({"name": "Cookie", "value": cookies});
					break;
				}
			}
			return {"requestHeaders": newHeaders};
		};
		chrome.webRequest.onBeforeSendHeaders.addListener(listener, {"urls": instances.map(instance => "*://" + instance[0] + "/*")}, ["blocking", "requestHeaders"]);
		beforeSendHeadersListeners.push(listener);
	});
	return [beforeRequestListeners, beforeSendHeadersListeners];
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
	
	let [beforeRequestListeners, beforeSendHeadersListeners] = createListeners(services);

	g_beforeRequestListeners.forEach(listener => {
		chrome.webRequest.onBeforeRequest.removeListener(listener);
	});
	g_beforeRequestListeners = beforeRequestListeners;

	g_beforeSendHeadersListeners.forEach(listener => {
		chrome.webRequest.onBeforeSendHeaders.removeListener(listener);
	});
	g_beforeSendHeadersListeners = beforeSendHeadersListeners;


	console.log("service list updated successfully!");
}

function wrappedUpdateConfig() {
	updateConfig().catch(console.error);
}

console.log("initializing addon...");

chrome.storage.local.get("config", async items => {
	let config = items.config;
	if(!config) {
		let services = await (await fetch("services.json")).json();
		config = {"services": services};
		chrome.storage.local.set({"config": config}, wrappedUpdateConfig);
	}
	
	startAutoUpdate(config.lastUpdated, wrappedUpdateConfig);
	
	[g_beforeRequestListeners, g_beforeSendHeadersListener] = createListeners(config.services);

	console.log("addon initialized successfully!");
});
