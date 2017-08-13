var http = require('http');

http.createServer(function (req, res) {
var path = req.url.replace(/\/?(?:\?.*)?$/,'').toLowerCase();
  switch (path) {
    case '':
      res.writeHead(200, {'Content-Type': 'text/plain'});
      res.end('Homepage');
      break;
    case '/about':
      res.writeHead(200, {'Content-Type': 'text/plain'});
      res.end('About My Homepage');
      break;
    default:
      res.writeHead(404, {'Content-Type': 'text/plain'});
      res.end('Not Found');    
  }
}).listen(3000, "127.0.0.1");

console.log('Server running at http://127.0.0.1:3000/');
