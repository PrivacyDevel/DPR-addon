type frontends = {
	[frontent: string]: {
		cookies: string,
		instances: [string]
	}
};

export type service = {
	upstream: [string],
	documentOnly: boolean,
	frontends: frontends
};


type flatInstanceList = [instance: string, frontend: string][];

export const SERVICES_URL = "https://codeberg.org/PrivacyDev/DPR-addon/raw/branch/master/src/services.json";
export const UPDATE_INTERVAL_MINUTES = 60 * 2;

export function flattenInstanceList(frontends: frontends): flatInstanceList {
	let instances: flatInstanceList = [];
	for(let frontend of Object.keys(frontends)) {
		instances = instances.concat(frontends[frontend].instances.map(instance => [instance, frontend]));
	}
	return instances;
}

export function transformUrl(srcUrlStr: string, instances: flatInstanceList): string | undefined {
	// select random instance
	let [instance, frontend] = instances[Math.floor(Math.random() * instances.length)];
	let instanceUrl = new URL("https://" + instance);

	let url = new URL(srcUrlStr);
	let search = new URLSearchParams(url.search);
	switch(url.host) {
		case "youtu.be":
			search.append("q", url.pathname.slice(1));
			url.pathname = "/watch";
		case "www.google.com":
			if(url.pathname == "/maps")
				return;
			
			switch(frontend) {
				case "librex":
					url.pathname = "search.php";
					break;
				case "goo":
					url.pathname = "web.jsp";
					search.append("MT", search.get("q"));
					search.delete("q");
			}
		default:
			instanceUrl.pathname = instanceUrl.pathname == "/" ? url.pathname : instanceUrl.pathname + url.pathname;
			instanceUrl.search = search.toString();
			return instanceUrl.toString();
	}
}

export function findInstanceServiceAndFrontend(urlStr: string, services: service[]): [instance: string, service: service, frontend: string] | undefined {
	for(let service of services) {
		for(let frontend of Object.keys(service.frontends)) {
			let instance = service.frontends[frontend].instances.find(instance => urlStr.startsWith("https://" + instance));
			if(instance) return [instance, service, frontend];
		}
	}
}

export function transformUrlBack(srcUrlStr: string, services: service[]): string | undefined {

	let [instance, service, frontend] = findInstanceServiceAndFrontend(srcUrlStr, services);
	let upstreamUrl = new URL("https://" + service.upstream[0]);
	let instanceUrl = new URL("https://" + instance);

	let url = new URL(srcUrlStr);
	let search = new URLSearchParams(url.search);
	switch(upstreamUrl.host) {
		case "www.google.com":
			switch(frontend) {
				case "goo":
					search.append("q", search.get("MT"));
					search.delete("MT");
				case "librex":
					url.pathname = "search";
			}
		default:
			upstreamUrl.pathname = url.pathname.replace(instanceUrl.pathname, "");
			upstreamUrl.search = search.toString();
			return upstreamUrl.toString();
	}


}

export function startAutoUpdate(lastUpdated: number | undefined, updateFunction: (nextUpdateTimestamp: number) => void): void {
	let nextUpdateTimestamp = Math.max((lastUpdated || 0) + (1000 * UPDATE_INTERVAL_MINUTES), Date.now() + (1000 * 30));
	console.log("next update is scheduled for: " + new Date(nextUpdateTimestamp).toString());
	updateFunction(nextUpdateTimestamp);
}
