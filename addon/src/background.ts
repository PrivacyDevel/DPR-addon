import * as common from "./common";

type bookmarkListener = (id: string, bookmark: chrome.bookmarks.BookmarkTreeNode) => void;
type beforeRequestListener = (details: chrome.webRequest.WebRequestBodyDetails) => void | chrome.webRequest.BlockingResponse;
type beforeSendHeaderListener = (details: chrome.webRequest.WebRequestHeadersDetails) => void | chrome.webRequest.BlockingResponse;
interface onBeforeRequestListenerDetails extends chrome.webRequest.WebRequestBodyDetails {documentUrl: string};

let g_beforeRequestListeners: beforeRequestListener[] = [];
let g_beforeSendHeadersListeners: beforeSendHeaderListener[] = [];
let g_bookmarkListener: bookmarkListener;

function createListeners(services : common.service[]): [beforeRequestListener[], beforeSendHeaderListener[], bookmarkListener] {
	let beforeRequestListeners = [];
	let beforeSendHeadersListeners = [];
	services.forEach(service => {

		let instances = common.flattenInstanceList(service.frontends);

		let urls = service.upstream.map(domain => "*://*." + domain + "/*");
		let listener = (details: onBeforeRequestListenerDetails) => {
			if(!(service.documentOnly && details.documentUrl))
				return {"redirectUrl": common.transformUrl(details.url, instances)};
		};
		chrome.webRequest.onBeforeRequest.addListener(listener, {"urls": urls}, ["blocking"]);
		beforeRequestListeners.push(listener);

		Object.keys(service.frontends).forEach(frontend => {
			let cookies = service.frontends[frontend].cookies;
			if(cookies) {
				let listener = (details: chrome.webRequest.WebRequestHeadersDetails) => {
					let newHeaders = details.requestHeaders.filter(header => header.name.toLowerCase() != "cookies");
					newHeaders.push({"name": "Cookie", "value": cookies});
					return {"requestHeaders": newHeaders};
				};
				chrome.webRequest.onBeforeSendHeaders.addListener(listener, {"urls": service.frontends[frontend].instances.map(instance => "*://" + instance + "/*")}, ["blocking", "requestHeaders"]);
				beforeSendHeadersListeners.push(listener);
			}
		});
	});

	let bookmarkListener = (id: string, bookmark: chrome.bookmarks.BookmarkTreeNode) => {
		if(bookmark.url) {
			let newUrl = common.transformUrlBack(bookmark.url, services);
			let newTitle = bookmark.title == bookmark.url ? newUrl : bookmark.title;
			chrome.bookmarks.update(id, {"url": newUrl, "title": newTitle});
		}
	};
	chrome.bookmarks.onCreated.addListener(bookmarkListener);

	return [beforeRequestListeners, beforeSendHeadersListeners, bookmarkListener];
}

async function updateConfig(): Promise<void> {
	
	console.log("updating service list...");

	let services = await common.fetchServices();
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

chrome.alarms.onAlarm.addListener(common.sync(updateConfig));

console.log("initializing addon...");

chrome.storage.local.get("config", async items => {
	let config = items.config;
	if(!config) {
		let services = await (await fetch("services.json")).json();
		config = {"services": services};
		chrome.storage.local.set({"config": config});
	}
	
	common.startAutoUpdate(config.lastUpdated, nextUpdateTimestamp => {
		chrome.alarms.create({
		"periodInMinutes": common.UPDATE_INTERVAL_MINUTES,
		"when": nextUpdateTimestamp
		});
	});
	
	[g_beforeRequestListeners, g_beforeSendHeadersListeners, g_bookmarkListener] = createListeners(config.services);

	console.log("addon initialized successfully!");
});
