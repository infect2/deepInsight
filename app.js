let http = require('http');
let https = require('https');
let express = require('express');
let bodyParser = require('body-parser');
let session = require('express-session');
let csrf = require('csurf')();
let fortune = require('./lib/fortune.js');
let formidable = require('formidable');
let credentials = require('./credentials.js');
let connect = require('connect');
let compression = require('compression');
let fs = require('fs');
let email = require('./lib/email.js');

let mongoose = require('mongoose');
let Promise = require('bluebird');
let emailService = email(credentials);

//Model Schema Import
let User = require('./models/user.js');
let Questionnaire = require('./models/questionnaire.js');
let Survey = require('./models/survey.js');
let SurveyResult = require('./models/surveyResult.js');
let ParticipantChoice = require('./models/participantChoice.js');

let passport = require('passport');
let LocalStrategy = require('passport-local').Strategy;
let crypto = require('crypto');
let argon = require('argon2');
let expressVue = require('express-vue');
let path = require('path');
let logger = require('express-fluent-logger');
let amqp = require('amqp');

let multer = require('multer');
let xlstojson = require("xls-to-json-lc");
let xlsxtojson = require("xlsx-to-json-lc");

//programming utilities
let Util = require('./lib/util.js');

const MIN_PASSWORD_LENGTH = 4;
const MAX_PASSWORD_LENGTH = 20;
const AUTHID_PREFIX = 'deepinsight:';
const EXCEL_UPLOAD_DIRECTORY = './uploads/';
const LOGGER_TIMEOUT = 3.0;
const DB_NAME = "test";

mongoose.Promise = Promise;

// 'deepinsight:' is a prefix for our user ID storage rule
// Thus remove it from authId before sending it to user
let getUserNameFromAuthID = (req) => {
  let nameWithPrefix = req.user.authId;
  return nameWithPrefix.slice(AUTHID_PREFIX.length, nameWithPrefix.length);
};

//multers disk storage settings
let storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, EXCEL_UPLOAD_DIRECTORY);
  },
  filename: (req, file, cb) => {
    let datetimestamp = Date.now();
    cb(null, file.fieldname + '-' + datetimestamp + '.' + file.originalname.split('.')[file.originalname.split('.').length -1]);
  }
});

//authentication
let ensureAuthenticated = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect('login');
};

let validateID = (userId) => {
  console.log("Fix Me: validateID");
  return true;
};

let validatePassword = (passwd) => {
  console.log("Fix Me: validatePassword");
  return true;
};

//authorization utilities
let allow = (roles) => {
  return (req, res, next) => {
          if(req.user && roles.split(',').indexOf(req.user.role)!==-1) return next();
          res.redirect(303, '/unauthorized');
  };
};

// authorization helpers
let customerOnly = (req, res, next) => {
  if(req.user && req.user.role==='customer') return next();
  // we want customer-only pages to know they need to logon
  res.redirect(303, '/unauthorized');
};

let employeeOnly = (req, res, next) => {
  if(req.user && req.user.role==='employee') return next();
  // we want employee-only authorization failures to be "hidden", to
  // prevent potential hackers from even knowhing that such a page exists
  res.redirect(303, '/unauthorized');
};

const app = express();

// running enviroment setting
app.set('port', process.env.PORT || 3000);
app.set('mongodbIP', process.env.MONGODB.split(':')[0] || '172.17.0.4');
app.set('mongodbPort', process.env.MONGODB.split(':')[1] || '27017');
app.set('rabbitmqIP', process.env.RABBITMQ || '172.17.0.8');
app.set('loggerIP', process.env.LOGGER.split(':')[0] || '172.17.0.7');
app.set('loggerPort', process.env.LOGGER.split(':')[1] || '24224');

//RabbitMQ integration
let rabbit = amqp.createConnection({ host: app.get('rabbitmqIP') });

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

let mongoOpts = {
  useMongoClient: true,
  server: {
    socketOptions: {keepAlive: 1}
  },
  reconnectTries: 5,
  reconnectInterval: 1000
};

//logger setting
app.use(logger('deepinsight',{
  host: app.get('loggerIP'),
  port: app.get('loggerPort'),
  timeout: LOGGER_TIMEOUT,
  responseHeaders: ['x-userid']
}));

switch(app.get('env')){
  case 'development':
    console.log("development mode");
    app.use(require('morgan')('dev'));
    mongoose.connect("mongodb://" + app.get('mongodbIP') + ':' + app.get('mongodbPort') + '/' + DB_NAME, mongoOpts);
    break;
  case 'production':
    console.log("production mode");
    mongoose.connect("mongodb://" + app.get('mongodbIP') + ':' + app.get('mongodbPort') + '/' + DB_NAME, mongoOpts);
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
app.use(csrf);
app.use((req, res, next) => {
  res.locals._csrfToken = req.csrfToken();
  next();
});

//gzip compression
app.use(compression());

// flash message middleware
app.use((req, res, next) => {
        // if there's a flash message, transfer
        // it to the context, then clear it
        res.locals.flash = req.session.flash;
        delete req.session.flash;
        next();
});

// cluster
app.use((req, res, next) => {
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
});

app.get('/about',  (req, res) => {
  res.clearCookie('sangseoklim');
  res.render('about', {
    fortune: fortune.getFortune(),
    pageTestScript: 'qa/tests-about.js'
  });
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

app.get('/upload', ensureAuthenticated, (req,res) => {
  res.render('upload', { csrf: 'CSRF token goes here' });
});

// multipart upload should be put in in front of crsf verification middleware
// please refere to the issue in https://github.com/expressjs/csurf/issues/58
app.post('/upload', allow('customer,employee'), ensureAuthenticated, (req, res) => {
    let exceltojson;
    let upload = multer({ //multer settings
                    storage: storage,
                    fileFilter : function(req, file, callback) { //file filter
                        if (['xls', 'xlsx'].indexOf(file.originalname.split('.')[file.originalname.split('.').length-1]) === -1) {
                            return callback(new Error('Wrong extension type'));
                        }
                        // csrf((req, res, error)=>{
                        //   if(error) {
                        //     console.log('CSRF error');
                        //     return callback(new Error('Mal-formed data'));
                        //   } else {
                        //     callback(null,true);
                        //   }
                        // });
                        callback(null, true);
                    }
                }).single('file');
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
            }, function(err, result){
                if(err) {
                    return res.json({error_code:1,err_desc:err, data: null});
                } 
                addNewQuestionnaire("0.99", "alim com", result, (err, questionnaire)=>{
                  res.json({error_code:err,err_desc:null, data: result});
                });
            });
        } catch (e){
            res.json({error_code:1,err_desc:"Corupted excel file"});
        }
    });
});

//new commer register page
app.get('/register', (req, res) => {
  res.render('register', { csrf: 'CSRF token goes here' });
});

//show questionnaire list
let getQuestionnaireList = (cb) => {
  Questionnaire.find(function (err, result) {
    if (err) {
      cb(err, null);
    } else {
      cb(null, result.map( (data) => {
        return {
          name: data.name,
          version: data.version
        };
      }));
    }
  });
};

app.get('/questionnaire/list', (req, res) => {
  getQuestionnaireList((err, result) => {
    res.render('questionnaire_list', {questionnaire: result});
  });
});

let getContentFromQuestionnaire = (version, name, cb) => {
  // cb(null, "Hello Content");
  Questionnaire.find( {version: version, name: name}, function (err, result) {
    if (err) {
      cb(err, null);
    } else {
      cb(null, result);
    }
  });
};

app.get('/questionnaire/showContent', (req, res) => {
  getContentFromQuestionnaire( req.query['version'], req.query['name'], (err, result) => {
    res.render('questionnaire_detail', {content: result});
  });
});

//add a new questionnaire
//if the given version already exists, it will be updated with a new version
let addNewQuestionnaire = (version, name, content, cb) => {
  let questionnaire = new Questionnaire({
    id: "id-field-to-be-replaced",
    version: version,
    name: name,
    content: JSON.stringify(content),
    created: Date.now(),
    lastUpdated: null
  });

  questionnaire.save((err) => {
    if(err) {
      return cb(err, null);
    }
    cb(null, questionnaire);
  });
};

app.get('/survey/success', (req, res) => {
  res.render('surveycreatesuccess');
});

app.get('/survey/fail', (req, res) => {
  res.render('surveycreatefail', { message: "MESSAGE SHOULD BE DETERMINED"});
});

//create survey from questionnaire
app.get('/survey/create', (req,res) => {
  let name = req.query['name'];
  let version = req.query['version'];
  res.render('createsurvey', { name, version });
});

// check if start date and date are correct
let validateSurveyCreateReq = (req) => {
  let ret;
  ret = Util.compareDate(req.startDate, req.endDate);
  if( !ret ) {
    return {
      ret: false,
      message: "Start date is later than end date"
    };
  }

  //More validate logic MUST BE ADDED
  return {
    ret: true,
    message: "everything all right"
  };
};

//add a new Survey into DB
let addNewSurvey = (req, cb) => {
  let survey = new Survey(req);
  survey.save( (err) => {
    if(err) {
      cb(err, null);
    } else {
      cb(null, survey);
    }
  });
};

app.post('/survey/create', (req, res) => {
  let newSurveyCreateRequest = {
    surveyName: req.body.surveyName,
    clientName: req.body.clientName,
    questionnaireID: req.query['surveyname'] + ":" + req.query['version'],
    startDate: req.body.startDate,
    endDate: req.body.endDate,
    state: "CREATED",
    reportTemplate: "FIXEME"
  }
  let validated = validateSurveyCreateReq(newSurveyCreateRequest);
  if(validated.ret == false) {
    res.render('surveycreatefail', { message: validated.message });
  } else {
    addNewSurvey(newSurveyCreateRequest, (err, survey) => {
      if( err ) {
        res.render('surveycreatefail', { message: "please contact administrator" });
      } else {
        res.redirect(303, '/survey/success');
      }
    });
  }
});

let addNewUser = (authId, password, name, role, cb) => {
  let newUser = {
    authId,
    password,
    name,
    role,
    cb
  };

  crypto.randomBytes(16, (err, salt) => {
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
};

//show questionnaire list
let getSurveyList = (cb) => {
  Survey.find(function (err, result) {
    if (err) {
      cb(err, null);
    } else {
      cb(null, result.map( (data) => {
        return {
          id: data.id,
          questionnaireID: data.questionnaireID,
          clientName: data.clientName,
          surveyName: data.surveyName,
          state: data.state,
          startDate: data.startDate,
          endDate: data.endDate
        };
      }));
    }
  });
};

app.get('/survey/list', (req, res) => {
  getSurveyList((err, result) => {
    res.render('survey_list', {survey: result});
  });
});

let getSurveyChoiceData = (name, version, cb) => {
  Questionnaire.find( { name: name, version: version }, (err, result) => {
    if (err) {
      cb(err, null);
    } else {
      cb(null, result.map( (data) => {
        return {
          content: data.content
        };
      }));
    }
  });
};

let beautifyContent = (content) => {
  try {
    let parsed = JSON.parse(content);
    return parsed.map( (data) => { return data['항목'];});
  } catch (error) {
    return null;
  }
};

app.get('/survey/participate', (req, res) => {
  let questionnaireID = req.query['questionnaireID'];
  getSurveyChoiceData(questionnaireID.split(':')[0], questionnaireID.split(':')[1], (err, result) => {
    //JSON data will be sent to client
    //styling will be done in client
    //FIX ME
    //result MUST have only one, but as of now due the lack of validation
    //multiple of the same questionnaire exist
    let parsed = beautifyContent( result[0].content );
    res.render('surveyinputform', { content: JSON.stringify(parsed) });
  });
});

let saveSurveyResult = (req, cb) => {
  let surveyResult = new SurveyResult(req);
  surveyResult.save(req, (err, result) => {
    if( err ) {
      cb(err, null);
    } else {
      cb(null, result);
    }
  });
};

app.post('/survey/participate', (req, res) => {
  let userChoice = {
    clientName: "NCSOFT",
    questionnaireID: "alim comm:0.99",
    clientChoice: [ "HighlyLikely ", "Likely" ].join(':'),
    reportTemplate: "TO-BE-FIXED",
    created: Date.now()
  };

  saveSurveyResult( userChoice, (err, result) => {
    res.render('thankyou');
  });
});

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

//fale safe test purpose
app.get('/fail', (req, res) => {
  throw new Error("Intended!");
});

app.get('/epic-fail', (req, res) => {
  process.nextTick( () => {
    throw new Error("Disatster!");
  });
});

//REST API Example
app.get('/api/purpose', (req, res) => {
  res.json({
          name: "deepinsight",
          id: 12345,
          description: "online survey",
          location: "South Korea",
  });
});

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
let serverSptions = {
  key: fs.readFileSync(__dirname + '/keys/deepinsight.pem'),
  cert: fs.readFileSync(__dirname + '/keys/deepinsight.crt')
};

let startServer = () => {
  server = https.createServer(serverSptions, app).listen(app.get('port'), () => {
    console.log( 'Express started in ' + app.get('env') +
      ' mode on http://localhost:' + app.get('port') +
      '; press Ctrl-C to terminate.' );
  });
};

if(require.main === module){
  // application run directly; start app server
  startServer();
} else {
    // application imported as a module via "require": export function to create server
    module.exports = startServer;
}