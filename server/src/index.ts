import * as http from "http";
import * as fs from "fs";

import * as pg from "pg";

import * as common from "./common";


let config: common.config = {services: []};
let client = new pg.Client({"host": "/var/run/postgresql", "database": "dpr"});


const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function updateConfig(): Promise<void> {
	let services = await common.fetchServices();
	config = {
		"services": services,
		"lastUpdated": Date.now()
	};
	fs.writeFileSync("config.json", JSON.stringify(config));
	console.log("service list updated successfully!");
}


if(fs.existsSync("config.json")) {
	config = JSON.parse(fs.readFileSync("config.json", "utf8"));
} else {
	config.services = JSON.parse(fs.readFileSync("src/services.json", "utf8"));
}

common.startAutoUpdate(config.lastUpdated, nextUpdateTimestamp => {
	setTimeout(async () => {
		await updateConfig();
		setInterval(common.sync(updateConfig), common.UPDATE_INTERVAL_MINUTES * 1000 * 60);
	}, nextUpdateTimestamp - Date.now());
});

client.connect();

setTimeout(async () => {
	try {
		while(true) {
			for(let service of config.services) {
				
				let upstreamIds: number[] = [];
				for(let url of service.upstream) {
					let result = await client.query("SELECT id FROM upstream WHERE url = $1", [url]);
					if(result.rowCount == 0) {
						result = await client.query("INSERT INTO upstream(url) VALUES($1) RETURNING id", [url]);
					}
					upstreamIds.push(result.rows[0].id);
				}

				for(let frontend of Object.keys(service.frontends)) {

					let result = await client.query("SELECT id FROM frontend WHERE frontend = $1", [frontend]);
					if(result.rowCount == 0) {
						result = await client.query("INSERT INTO frontend(frontend) VALUES($1) RETURNING id", [frontend]);
					}
					for(let upstreamId of upstreamIds) {
						await client.query("INSERT INTO upstream_frontend(upstream_id, frontend_id) VALUES($1, $2) ON CONFLICT DO NOTHING", [upstreamId, result.rows[0].id]);
					}

					for(let instance of service.frontends[frontend].instances) {
						let success = false;
						try {
							console.log("checking uptime: " + instance);
							let response = await fetch("https://" + instance);
							if(response.ok) success = true;
						} catch(e) {
							console.log(e);
						}

						result = await client.query("SELECT id FROM instance WHERE url = $1", [instance]);
						if(result.rowCount == 0) {
							result = await client.query("INSERT INTO instance(url) VALUES($1) RETURNING id", [instance]);
						}
						let instance_id = result.rows[0].id;
						await client.query("INSERT INTO up(instance_id, up) VALUES($1, $2)", [instance_id, success]);
					}
				}
			}
		}
	} catch(e) {
		console.log(e);
	}
}, 0);

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

