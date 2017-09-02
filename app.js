let http = require('http');
let https = require('https');
let express = require('express');
let bodyParser = require('body-parser');
let session = require('express-session');
let fortune = require('./lib/fortune.js');
let formidable = require('formidable');
let credentials = require('./credentials.js');
let connect = require('connect');
let compression = require('compression');
let fs = require('fs');
let email = require('./lib/email.js');
let mongoose = require('mongoose');
mongoose.Promise = require('bluebird');
let emailService = email(credentials);
let Dealer = require('./models/dealer.js');
let User = require('./models/user.js');
let passport = require('passport');
let LocalStrategy = require('passport-local').Strategy;
let crypto = require('crypto');
let argon = require('argon2');
let expressVue = require('express-vue');
let path = require('path');
let logger = require('express-fluent-logger');
let amqp = require('amqp');
let rabbit = amqp.createConnection({ host: '172.17.0.8' });

let multer = require('multer');
let xlstojson = require("xls-to-json-lc");
let xlsxtojson = require("xlsx-to-json-lc");

const MIN_PASSWORD_LENGTH = 4;
const MAX_PASSWORD_LENGTH = 20;
const AUTHID_PREFIX = 'deepinsight:';
const EXCEL_UPLOAD_DIRECTORY = './uploads/'

// 'deepinsight:' is a prefix for our user ID storage rule
// Thus remove it from authId before sending it to user
let getUserNameFromAuthID = (req) => {
  let nameWithPrefix = req.user.authId;
  return nameWithPrefix.slice(AUTHID_PREFIX.length, nameWithPrefix.length);
}

//multers disk storage settings
let storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, EXCEL_UPLOAD_DIRECTORY)
    },
    filename: (req, file, cb) => {
        let datetimestamp = Date.now();
        cb(null, file.fieldname + '-' + datetimestamp + '.' + file.originalname.split('.')[file.originalname.split('.').length -1])
    }
});

//RabbitMQ integration
let messageExchange;

rabbit.on('ready', () => {
  console.log('RabbitMQ is ready');
  rabbit.exchange('my-first-exchange', {type:'direct', autoDelete: false}, (ex) => {
    console.log('RabbitMQ: message exchange is created');
    messageExchange = ex;
  });
  rabbit.queue('first-queue-name', {autoDelete: false}, (q) => {
    q.bind('my-first-exchange', 'first-queue');
    q.subscribe( (message, headers, deliveryInfo, messageObject) => {
      // console.log(message);
      // console.log(headers);
      // console.log(deliveryInfo);
      // console.log(messageObject);
    });
  });
});

const app = express();

//view engine, or handlebars setting
let handlebars = require('express-handlebars').create({
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

const vueOptions = {
    rootPath: path.join(__dirname, './views'),
    layout: {
        start: '<div id="app">',
        end: '</div>'
    }
};

const expressVueMiddleware = expressVue.init(vueOptions);

app.use(expressVueMiddleware);

app.set('view engine','handlebars');

app.use((req,res,next) => {
  messageExchange.publish('first-queue', {message: req.url});
  next();
});

// use domains for better error handling
app.use((req, res, next) => {
    // create a domain for this request
    let domain = require('domain').create();
    // handle errors on this domain
    domain.on('error', (err) => {
        console.error('DOMAIN ERROR CAUGHT\n', err.stack);
        try {
            // failsafe shutdown in 5 seconds
            setTimeout(() => {
                console.error('Failsafe shutdown.');
                process.exit(1);
            }, 5000);

            // disconnect from the cluster
            let worker = require('cluster').worker;
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

let opts = {
  useMongoClient: true,
  server: {
    socketOptions: {keepAlive: 1}
  },
  reconnectTries: 5,
  reconnectInterval: 1000
};

//logger setting
app.use(logger('deepinsight',{
  host:'172.17.0.7',
  port: 24224,
  timeout: 3.0,
  responseHeaders: ['x-userid']
}));

switch(app.get('env')){
  case 'development':
    console.log("development mode");
    app.use(require('morgan')('dev'));
    mongoose.connect(credentials.mongo.development.connectionString, opts);
    break;
  case 'production':
    console.log("production mode");
    mongoose.connect(credentials.mongo.development.connectionString, opts);
    app.use(require('express-logger')({
      path: __dirname + '/log/requests.log'
    }));
    break;
  default:
    throw new Error('Unknown execution environment: ' + app.get('env'));
}

app.use(bodyParser.json());

// CORS for API support
app.use('/api', require('cors')());

//test page support. it should be placed in front of other routers
app.use( (req, res, next) => {
  res.locals.showTests = app.get('env') !== 'production' && req.query.test === '1';
  next();
});

// mocked weather data for partials, or Handlebars Widget
let getWeatherData = () => {
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
app.use( (req, res, next) => {
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
//mongodb based session store
const MongoSessionStore = require('connect-mongo')(session);

app.use(session({
  resave: false,
  saveUninitialized: false,
  secret: credentials.cookieSecret,
  store: new MongoSessionStore({
    mongooseConnection: mongoose.connection
  })
}));
//CSRF shoud put after body-parser, cookie-parser, express-session
// app.use(require('csurf')());
app.use( (req, res, next) => {
  // res.locals._csrfToken = req.csrfToken();
  next();
});
//gzip compression
app.use(compression());

// flash message middleware
app.use( (req, res, next) => {
        // if there's a flash message, transfer
        // it to the context, then clear it
        res.locals.flash = req.session.flash;
        delete req.session.flash;
        next();
});

app.use( (req, res, next) => {
  let cluster = require('cluster');
  if(cluster.isWorker) {
    console.log('Worker %d processing request for %s', cluster.worker.id, req.url);
  }
  next();
});

//Authentication
let auth = require('./lib/auth.js')(app, {
        baseUrl: process.env.BASE_URL,
        providers: credentials.authProviders,
        successRedirect: '/account',
        failureRedirect: '/unauthorized',
});
// auth.init() links in Passport middleware:
auth.init();

// now we can specify our auth routes:
auth.registerRoutes();

app.get('/',  (req, res) => {
  res.cookie('sangseoklim', "handsome", { signed: true });
  res.render('home');
});

app.get('/vue-template', (req, res, next) => {
    let data = {
        otherData: 'Something Else' 
    };
    let vueOptions = {
        head: {
            title: 'Page Title',
            meta: [ 
                { property:'og:title', content: 'Page Title'},
                { name:'twitter:title', content: 'Page Title'},
            ]
        }    
    }
    res.renderVue('main', data, vueOptions);
})

app.get('/about',  (req, res) => {
  res.clearCookie('sangseoklim');
  res.render('about', {
    fortune: fortune.getFortune(),
    pageTestScript: 'qa/tests-about.js'
  });
});

app.get('/thank-you', (req, res) => {
  res.render('thank-you');
});

//login page display
app.get('/login', (req, res) => {
  if(!!req.user) {
    //user is already in logined
    //logout first
    res.render('logout', { username: getUserNameFromAuthID(req) });
    return;
  }
  res.render('login', { csrf: 'CSRF token goes here' });
});

//FIX ME
//ajax based login will not work with redirect
app.post('/login',
  passport.authenticate('local', {failureRedirect: '/login'}),
  (req, res) => {
    if(req.xhr) {
      return res.json({ success: true });
    } else {
      return res.redirect(303, '/account');
    }
});

//logout
app.get('/logout', (req, res) => {
  req.logout();
  req.session.destroy();
  res.redirect("/login");
});

app.get('/upload', (req,res) => {
  res.render('upload', { csrf: 'CSRF token goes here' });
});

let upload = multer({ //multer settings
                storage: storage,
                fileFilter : function(req, file, callback) { //file filter
                    if (['xls', 'xlsx'].indexOf(file.originalname.split('.')[file.originalname.split('.').length-1]) === -1) {
                        return callback(new Error('Wrong extension type'));
                    }
                    callback(null, true);
                }
            }).single('file');

app.post('/upload', (req, res) => {
    let exceltojson;
    upload(req,res, (err) => {
        if(err){
             res.json({error_code:1,err_desc:err});
             return;
        }
        /** Multer gives us file info in req.file object */
        if(!req.file){
            res.json({error_code:1,err_desc:"No file passed"});
            return;
        }
        /** Check the extension of the incoming file and 
         *  use the appropriate module
         */
        if(req.file.originalname.split('.')[req.file.originalname.split('.').length-1] === 'xlsx'){
            exceltojson = xlsxtojson;
        } else {
            exceltojson = xlstojson;
        }
        try {
            exceltojson({
                input: req.file.path,
                output: null, //since we don't need output.json
                lowerCaseHeaders:true
            }, function(err,result){
                if(err) {
                    return res.json({error_code:1,err_desc:err, data: null});
                } 
                console.log(result);
                res.json({error_code:0,err_desc:null, data: result});
            });
        } catch (e){
            res.json({error_code:1,err_desc:"Corupted excel file"});
        }
    })
});

//new commer register page
app.get('/register', (req, res) => {
    res.render('register', { csrf: 'CSRF token goes here' });
});

let ensureAuthenticated = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect('login');
}

let validateID = (userId) => {
  console.log("Fix Me: validateID");
  return true;
}

let validatePassword = (passwd) => {
  console.log("Fix Me: validatePassword");
  return true;
}

let  addNewUser = (authId, password, name, role, cb) => {
  let newUser = {
    authId,
    password,
    name,
    role,
    cb
  }

  crypto.randomBytes(16, function (err, salt) {
    if (err) throw err;
    argon.hash(newUser.password, salt).then(hash => {
      let user = new User({
        authId: "deepinsight:" + newUser.authId,
        name: newUser.name,
        password: hash,
        created: Date.now(),
        role: newUser.role,
      });
      user.save( (err) => {
        if(err) {
          return newUser.cb(err, null);
        }
        newUser.cb(null, user);
      });

    });
  });
}
//add a new user to user DB
app.post('/register', (req, res) => {
  let response;
  let userId = req.body.userId || '',
      password1 = req.body.password1 || '',
      password2 = req.body.password2 || '';
  console.log('ID: %s, Password %s : %s', userId, password1, password2);

  //ID and Password are validated
  if(password1 !== password2) {
    response = 'Passwords are not equal';
    console.log(response);
  }
  if(!validateID(userId)) {
    response = 'User ID is wrong, Please Try with different ID';
    console.log(response);
  }
  if(!validatePassword(password1)) {
    response = 'password policy is broken, try with different password';
    console.log(response);
  }

  try {
    //ready to add a user to MongoDB
    addNewUser(userId, password1, 'NCSOFT', 'customer', (err, user) => {
      if(req.xhr) {
        return res.json({ success: (err)? false : true });
      } else {
        return res.redirect(303, '/account');
      }
    });
  } catch (error) {
    console.log("User Registeration Error", error.stack);
    res.redirect(303, '/register');
  }

});

app.get('/newsletter', ensureAuthenticated, (req, res) => {
    res.render('newsletter', { csrf: 'CSRF token goes here' });
});

app.get('/fail', (req, res) => {
  throw new Error("Intended!");
});

app.get('/epic-fail', (req, res) => {
  process.nextTick( () => {
    throw new Error("Disatster!");    
  });
});

//REST API
app.get('/api/purpose', (req, res) => {
  res.json({
          name: "deepinsight",
          id: 12345,
          description: "online survey",
          location: "South Korea",
  });
});

// authorization helpers
let customerOnly = (req, res, next) => {
        if(req.user && req.user.role==='customer') return next();
        // we want customer-only pages to know they need to logon
        res.redirect(303, '/unauthorized');
}
let employeeOnly = (req, res, next) => {
        if(req.user && req.user.role==='employee') return next();
        // we want employee-only authorization failures to be "hidden", to
        // prevent potential hackers from even knowhing that such a page exists
        next('route');
}
let allow = (roles) => {
        return (req, res, next) => {
                if(req.user && roles.split(',').indexOf(req.user.role)!==-1) return next();
                res.redirect(303, '/unauthorized');
        };
}

app.get('/unauthorized', (req, res) => {
        res.status(403).render('unauthorized');
});

// customer routes
app.get('/account', allow('customer,employee'), (req, res) => {
  res.render('account', { username: getUserNameFromAuthID(req) });
});

// 404 not found
app.use((req, res) => {
  res.status(404);
  res.render('404');
  emailService.send('infect2@hanmail.net', 'Service Alert', '404 Not Found');
});

// 500 internal server error
app.use((err, req,res, next) => {
  console.error(err.stack);
  res.status(500);
  res.render('500');
  emailService.send('infect2@hanmail.net', 'Service Alert', 'Internal Server Error');
});

let server;
let options = {
  key: fs.readFileSync(__dirname + '/keys/deepinsight.pem'),
  cert: fs.readFileSync(__dirname + '/keys/deepinsight.crt')
};

let startServer = () => {
    server = https.createServer(options, app).listen(app.get('port'), () => {
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