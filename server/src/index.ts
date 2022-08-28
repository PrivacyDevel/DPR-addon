#!/usr/bin/env node

import * as http from "http";
import * as fs from "fs";

import * as common from "./common";


let config: {services: common.service[], lastUpdated?: number} = {services: []};

if(fs.existsSync("config.json")) {
	config = JSON.parse(fs.readFileSync("config.json", "utf8"));
} else {
	config.services = JSON.parse(fs.readFileSync("src/services.json", "utf8"));
}

async function updateConfig(): Promise<void> {
	let services = await common.fetchServices();
	config = {
		"services": services,
		"lastUpdated": Date.now()
	};
	fs.writeFileSync("config.json", JSON.stringify(config));
	console.log("service list updated successfully!");
}

common.startAutoUpdate(config.lastUpdated, nextUpdateTimestamp => {
	setTimeout(async () => {
		await updateConfig();
		setInterval(common.sync(updateConfig), common.UPDATE_INTERVAL_MINUTES * 1000 * 60);
	}, nextUpdateTimestamp - Date.now());
});

http.createServer((req, res) => {

	res.setHeader("Content-Type", "text/plain");

	let oldUrl = req.url.slice(1);
	let url: URL;
	try {
		url = new URL(oldUrl);
	} catch(error) {
		try {
			oldUrl = "https://" + oldUrl;
			url = new URL(oldUrl);
		} catch(error) {
			res.writeHead(400).end(JSON.stringify(error));
			return;
		}
	}

	for(let service of config.services) {
		for(let domain of service.upstream) {
			if(url.host.endsWith(new URL("https://" + domain).host)) {
				let instances = common.flattenInstanceList(service.frontends);
				let newUrl = common.transformUrl(oldUrl, instances);
				res.writeHead(302, {Location: newUrl}).end();
				console.log(newUrl);
				return;
			}
		}
	}

	res.writeHead(404).end(oldUrl + " not found");
}).listen(8080);
