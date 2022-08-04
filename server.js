#!/usr/bin/env node

const http = require("http");
const https = require("https");
const fs = require("fs");

const common = require("./src/common");


let config = {};

if(fs.existsSync("config.json")) {
	config = JSON.parse(fs.readFileSync("config.json"));
} else {
	config.services = JSON.parse(fs.readFileSync("src/services.json"));
}

function updateConfig() {
	https.get(common.SERVICES_URL, res => {
		let body = "";
		res.on("data", data => {
			body += data;
		});
		res.on("end", () => {
			config = {
				"services": JSON.parse(body),
				"lastUpdated": Date.now()
			};
			fs.writeFileSync("config.json", JSON.stringify(config));
			console.log("service list updated successfully!");
		});
	});
}

common.startAutoUpdate(config.lastUpdated, nextUpdateTimestamp => {
	setTimeout(() => {
		updateConfig();
		setInterval(updateConfig, common.UPDATE_INTERVAL_MINUTES * 1000 * 60);
	}, nextUpdateTimestamp - Date.now());
});

http.createServer((req, res) => {

	res.setHeader("Content-Type", "text/plain");

	let url = req.url.slice(1);
	try {
		for(let service of config.services) {
			for(let transformation of service.transformations) {
				if(new URL(url).origin == new URL("https://" + transformation.domain).origin) {
					let instances = common.flattenInstanceList(service.instances);
					let newUrl = common.transformUrl(url, instances, service.transformations);
					res.writeHead(200).end(newUrl);
					//res.writeHead(302, {Location: "http://192.168.6.2"}).end(newUrl);
					console.log(newUrl);
					return;
				}
			}
		}
	} catch(error) {
		res.writeHead(400).end(JSON.stringify(error));
		return;
	}

	res.writeHead(404).end(url + " not found");
}).listen(8080);
