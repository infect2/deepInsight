var http = require('http');
var express = require('express');
var fortune = require('./lib/fortune.js');
var formidable = require('formidable');
var credentials = require('./credentials.js');
var connect = require('connect');
var compression = require('compression');
var fs = require('fs');
var email = require('./lib/email.js');
var emailService = email(credentials);

var app = express();

//view engine, or handlebars setting
var handlebars = require('express-handlebars').create({
  defaultLayout: 'main',
  helpers:{
    section: function(name, options){
    if(!this._sections) this._sections = {};
    this._sections[name] = options.fn(this);
    return null;
    }
  }
});
app.engine('handlebars', handlebars.engine);
app.set('view engine','handlebars');

// use domains for better error handling
app.use(function(req, res, next){
    // create a domain for this request
    var domain = require('domain').create();
    // handle errors on this domain
    domain.on('error', function(err){
        console.error('DOMAIN ERROR CAUGHT\n', err.stack);
        try {
            // failsafe shutdown in 5 seconds
            setTimeout(function(){
                console.error('Failsafe shutdown.');
                process.exit(1);
            }, 5000);

            // disconnect from the cluster
            var worker = require('cluster').worker;
            if(worker) worker.disconnect();

            // stop taking new requests
            server.close();

            try {
                // attempt to use Express error route
                next(err);
            } catch(error){
                // if Express error route failed, try
                // plain Node response
                console.error('Express error mechanism failed.\n', error.stack);
                res.statusCode = 500;
                res.setHeader('content-type', 'text/plain');
                res.end('Server error.');
            }
        } catch(error){
            console.error('Unable to send 500 response.\n', error.stack);
        }
    });

    // add the request and response objects to the domain
    domain.add(req);
    domain.add(res);

    // execute the rest of the request chain in the domain
    domain.run(next);
});

app.set('port', process.env.PORT || 3000);

//logger setting
switch(app.get('env')){
  case 'development':
    app.use(require('morgan')('dev'));
    break;
  case 'production':
    app.use(require('express-logger')({
      path: __dirname + '/log/requests.log'
    }));
    break;
}

//test page support. it should be placed in front of other routers
app.use(function(req, res, next){
  res.locals.showTests = app.get('env') !== 'production' && req.query.test === '1';
  next();
});

// mocked weather data for partials, or Handlebars Widget
function getWeatherData(){
    return {
        locations: [
            {
                name: 'Portland',
                forecastUrl: 'http://www.wunderground.com/US/OR/Portland.html',
                iconUrl: 'http://icons-ak.wxug.com/i/c/k/cloudy.gif',
                weather: 'Overcast',
                temp: '54.1 F (12.3 C)',
            },
            {
                name: 'Bend',
                forecastUrl: 'http://www.wunderground.com/US/OR/Bend.html',
                iconUrl: 'http://icons-ak.wxug.com/i/c/k/partlycloudy.gif',
                weather: 'Partly Cloudy',
                temp: '55.0 F (12.8 C)',
            },
            {
                name: 'Manzanita',
                forecastUrl: 'http://www.wunderground.com/US/OR/Manzanita.html',
                iconUrl: 'http://icons-ak.wxug.com/i/c/k/rain.gif',
                weather: 'Light Rain',
                temp: '55.0 F (12.8 C)',
            },
        ],
    };
}

// middleware to add weather data to context
app.use(function(req, res, next){
  if(!res.locals.partials) {
    res.locals.partials = {};
  }
  res.locals.partials.weatherContext = getWeatherData();
  next();
});

//static file serving
app.use(express.static(__dirname + '/public'));
//
app.use(require('body-parser').urlencoded({ extended: true }));
//cookie signing middleware
app.use(require('cookie-parser')(credentials.cookieSecret));
//session setting
app.use(require('express-session')({
  resave: false,
  saveUninitialized: false,
  secret: credentials.cookieSecret
}));

//gzip compression
app.use(compression());

// flash message middleware
app.use(function(req, res, next){
        // if there's a flash message, transfer
        // it to the context, then clear it
        res.locals.flash = req.session.flash;
        delete req.session.flash;
        next();
});

app.use(function(req, res, next){
  var cluster = require('cluster');
  if(cluster.isWorker) {
    console.log('Worker %d processing request for %s', cluster.worker.id, req.url);
  }
  next();
});

app.get('/', function(req, res){
  res.cookie('sangseoklim', "handsome", { signed: true });
  res.render('home');
});

app.get('/about', function(req, res){
  res.clearCookie('sangseoklim');
  res.render('about', {
    fortune: fortune.getFortune(),
    pageTestScript: 'qa/tests-about.js'
  });
});

app.get('/tours/hood-river', function(req, res){
  res.render('tours/hood-river');
});

app.get('/tours/oregon-coast', function(req, res){
  res.render('tours/oregon-coast');
});

app.get('/tours/request-group-rate', function(req, res){
  res.render('tours/request-group-rate');
});

app.get('/nursery-rhyme', function(req, res){
        res.render('nursery-rhyme');
});

app.get('/data/nursery-rhyme', function(req, res){
        res.json({
                animal: 'squirrel',
                bodyPart: 'tail',
                adjective: 'bushy',
                noun: 'heck',
        });
});

app.get('/thank-you', function(req, res){
        res.render('thank-you');
});
app.get('/newsletter', function(req, res){
    // we will learn about CSRF later...for now, we just 
    // provide a dummy value
    res.render('newsletter', { csrf: 'CSRF token goes here' });
});
app.post('/process', function(req, res){
    if(req.xhr || req.accepts('json,html')==='json'){
        // if there were an error, we would send { error: 'error description' }
        res.send({ success: true });
    } else {
        // if there were an error, we would redirect to an error page
        res.redirect(303, '/thank-you');
    }
});

// for now, we're mocking NewsletterSignup:
function NewsletterSignup(){
}

NewsletterSignup.prototype.save = function(cb){
  cb();
};

var VALID_EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

app.post('/newsletter', function(req, res){
        var name = req.body.name || '', email = req.body.email || '';
        // input validation
        if(!email.match(VALID_EMAIL_REGEX)) {
                if(req.xhr) return res.json({ error: 'Invalid name email address.' });
                req.session.flash = {
                        type: 'danger',
                        intro: 'Validation error!',
                        message: 'The email address you entered was  not valid.',
                };
                return res.redirect(303, '/newsletter/archive');
        }
        new NewsletterSignup({ name: name, email: email }).save(function(err){
                if(err) {
                        if(req.xhr) return res.json({ error: 'Database error.' });
                        req.session.flash = {
                                type: 'danger',
                                intro: 'Database error!',
                                message: 'There was a database error; please try again later.',
                        };
                        return res.redirect(303, '/newsletter/archive');
                }
                if(req.xhr) return res.json({ success: true });
                req.session.flash = {
                        type: 'success',
                        intro: 'Thank you!',
                        message: 'You have now been signed up for the newsletter.',
                };
                return res.redirect(303, '/newsletter/archive');
        });
});

app.get('/contest/vacation-photo', function(req, res){
    var now = new Date(); 
    res.render('contest/vacation-photo', { year: now.getFullYear(), month: now.getMonth() });
});

// make sure data directory exists
var dataDir = __dirname + '/data';
var vacationPhotoDir = dataDir + '/vacation-photo';
if(!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
if(!fs.existsSync(vacationPhotoDir)) fs.mkdirSync(vacationPhotoDir);

function saveContestEntry(contestName, email, year, month, photoPath){
    // TODO...this will come later
}

app.post('/contest/vacation-photo/:year/:month', function(req, res){
    var form = new formidable.IncomingForm();
    form.parse(req, function(err, fields, files){ 
        if(err) return res.redirect(303, '/error');
        console.log('received fields:');
        console.log(fields);
        console.log('received files:');
        console.log(files);
        res.redirect(303, '/thank-you');
    });
});

app.get('/contest/vacation-photo/entries', function(req, res){
        res.render('contest/vacation-photo/entries');
});

app.get('/fail', function(req, res){
  throw new Error("Intended!");
});

app.get('/epic-fail', function(req, res){
  process.nextTick(function(){
    throw new Error("Disatster!");    
  });
});

app.use(function(req, res){
  res.status(404);
  res.render('404');
  emailService.send('infect2@hanmail.net', 'Service Alert', '404 Not Found');
});

app.use(function(err, req,res, next){
  console.error(err.stack);
  res.status(500);
  res.render('500');
  emailService.send('infect2@hanmail.net', 'Service Alert', 'Internal Server Error');
});

var server;

function startServer() {
    server = http.createServer(app).listen(app.get('port'), function(){
      console.log( 'Express started in ' + app.get('env') +
        ' mode on http://localhost:' + app.get('port') +
        '; press Ctrl-C to terminate.' );
    });
}

if(require.main === module){
    // application run directly; start app server
    startServer();
} else {
    // application imported as a module via "require": export function to create server
    module.exports = startServer;
}

// app.listen(app.get('port'), function(){
//   console.log('Express started on http://localhost' + app.get('port'));
//   console.log("Execution Mode: " + app.get('env'));
// });