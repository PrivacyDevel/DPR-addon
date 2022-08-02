const http = require("http");
const https = require("https");
const fs = require("fs");

const common = require("./src/common");


let services = JSON.parse(fs.readFileSync("src/services.json"));

function updateConfig() {
	https.get(common.SERVICES_URL, res => {
		let body = "";
		res.on("data", data => {
			body += data;
		});
		res.on("end", () => {
			services = JSON.parse(body);
			console.log(services);
		});
	});
}

common.startAutoUpdate(0, nextUpdateTimestamp => {
	setTimeout(() => {
		setInterval(updateConfig, UPDATE_INTERVAL_MINUTES * 1000);
		updateConfig();
	}, nextUpdateTimestamp);
});

http.createServer((req, res) => {

	res.setHeader("Content-Type", "text/plain");

	let url = req.url.slice(1);
	try {
		for(let service of services) {
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

	//res.writeHead(404).end(url + " not found");
	res.writeHead(404).end(JSON.stringify(services));
}).listen(8080);

