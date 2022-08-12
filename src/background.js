let g_beforeRequestListeners = [];
let g_beforeSendHeadersListeners = [];
let g_bookmarkListener;

function createListeners(services) {
	let beforeRequestListeners = [];
	let beforeSendHeadersListeners = [];
	services.forEach(service => {

		let instances = flattenInstanceList(service.frontends);

		let urls = service.upstream.map(domain => "*://*." + domain + "/*");
		let listener = details => {
			if(!(service.documentOnly && details.documentUrl))
				return {"redirectUrl": transformUrl(details.url, instances)};
		};
		chrome.webRequest.onBeforeRequest.addListener(listener, {"urls": urls}, ["blocking"]);
		beforeRequestListeners.push(listener);

		Object.keys(service.frontends).forEach(frontend => {
			let cookies = service.frontends[frontend].cookies;
			if(cookies) {
				listener = details => {
					let newHeaders = details.requestHeaders.filter(header => header.name.toLowerCase() != "cookies");
					newHeaders.push({"name": "Cookie", "value": cookies});
					return {"requestHeaders": newHeaders};
				};
				chrome.webRequest.onBeforeSendHeaders.addListener(listener, {"urls": service.frontends[frontend].instances.map(instance => "*://" + instance + "/*")}, ["blocking", "requestHeaders"]);
				beforeSendHeadersListeners.push(listener);
			}
		});
	});

	let bookmarkListener = (id, bookmark) => {
		if(bookmark.url) chrome.bookmarks.update(id, {"url": transformUrlBack(bookmark.url, services)});
	};
	chrome.bookmarks.onCreated.addListener(listener);

	return [beforeRequestListeners, beforeSendHeadersListeners, bookmarkListener];
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
	
	let [beforeRequestListeners, beforeSendHeadersListeners, bookmarkListener] = createListeners(services);

	g_beforeRequestListeners.forEach(listener => {
		chrome.webRequest.onBeforeRequest.removeListener(listener);
	});
	g_beforeRequestListeners = beforeRequestListeners;

	g_beforeSendHeadersListeners.forEach(listener => {
		chrome.webRequest.onBeforeSendHeaders.removeListener(listener);
	});
	g_beforeSendHeadersListeners = beforeSendHeadersListeners;

	chrome.bookmarks.onCreated.removeListener(g_bookmarkListener);
	g_bookmarkListener = bookmarkListener;


	console.log("service list updated successfully!");
}

function wrappedUpdateConfig() {
	updateConfig().catch(console.error);
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
	
	startAutoUpdate(config.lastUpdated, nextUpdateTimestamp => {
		chrome.alarms.create({
		"periodInMinutes": UPDATE_INTERVAL_MINUTES,
		"when": nextUpdateTimestamp
		});
	});
	
	[g_beforeRequestListeners, g_beforeSendHeadersListener, g_bookmarkListener] = createListeners(config.services);

	console.log("addon initialized successfully!");
});
