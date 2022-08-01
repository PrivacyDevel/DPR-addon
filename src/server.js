const http = require("http");
const fs = require("fs");

const common = require("./common");


let services = JSON.parse(fs.readFileSync("services.json"));

http.createServer((req, res) => {

	res.setHeader("Content-Type", "text/plain");

	let url = req.url.slice(1);
	let success = false;
	services.forEach(service => {
		let urls = new Set();
		service.transformations.forEach(transformation => {
			if(new URL(url).origin == new URL("https://" + transformation.domain).origin && !success) {
				let instances = common.flattenInstanceList(service.instances);
				let newUrl = common.transformUrl(url, instances, service.transformations);
				res.writeHead(200);
				res.end(newUrl);
				console.log(newUrl);
				success = true;
			} else {
				console.log(url + "!=" + "https://" + transformation.domain);
			}
		});
	});

	if(!success) {
		res.writeHead(404);
		res.end(url + " not found");
	}
	//res.end(req.url);
	//res.writeHead(302, {Location: "http://192.168.6.2"}).end();
}).listen(8080);

