var http = require('http'),
    fs = require('fs');


function serveStaticFile(res, path, contentType, responseCode) {
  if(!responseCode) {
    responseCode = 200;
  }
  fs.readFile(__dirname+path, function(err,data){
    if(err) {
      res.writeHead(200, {'Content-Type': 'text/plain'});
      res.end('Internal Error');
    } else {
      res.writeHead(200, {'Content-Type': contentType});
      res.end(data);
    }
  })
}

http.createServer(function (req, res) {
  //. single character except newline
  //(?:): none capturing parentheses. 
  //(":\?.*")?$ means ?characters one or two at the end of string
  //in order to remove query string (? parameter). e.g) url?iam=you
  var path = req.url.replace(/\/?(?:\?.*)?$/,'').toLowerCase();
  switch (path) {
    case '':
      serveStaticFile(res, '/public/index.html', 'text/html')
      break;
    case '/about':
      serveStaticFile(res, '/public/about.html', 'text/html')
      break;
    case '/img/survey.jpg':
      serveStaticFile(res, '/public/img/survey.jpg', 'image/jpeg')
      break;
    default:
        serveStaticFile(res, '/public/404.html', 'text/html')
  }
}).listen(3000, "127.0.0.1");

console.log('Server running at http://127.0.0.1:3000/');
