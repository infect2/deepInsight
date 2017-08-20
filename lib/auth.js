var User = require('../models/user.js');
var passport = require('passport');
var FacebookStrategy = require('passport-facebook').Strategy;
var GoogleStrategy = require('passport-google-oauth').OAuth2Strategy;
var LocalStrategy = require('passport-local').Strategy;
var argon = require('argon2');
var async = require('async');

passport.serializeUser(function(user, done){
  done(null, user._id);
});

passport.deserializeUser(function(id, done){
  User.findById(id, function(err, user){
    if(err || !user) return done(err, null);
    done(null, user);
  });
});

module.exports = function(app, options){

  // if success and failure redirects aren't specified,
  // set some reasonable defaults
  if(!options.successRedirect)
    options.successRedirect = '/account';
  if(!options.failureRedirect)
    options.failureRedirect = '/login';

  return {

    init: function() {
      var env = app.get('env');
      var config = options.providers;

      // configure Facebook strategy
      passport.use(new FacebookStrategy({
        clientID: config.facebook[env].appId,
        clientSecret: config.facebook[env].appSecret,
        callbackURL: (options.baseUrl || '') + '/auth/facebook/callback',
      }, function(accessToken, refreshToken, profile, done){
        //facebook prefix for namespace
        var authId = 'facebook:' + profile.id;
        User.findOne({ authId: authId }, function(err, user){
          if(err) return done(err, null);
          if(user) return done(null, user);
          user = new User({
            authId: authId,
            name: profile.displayName,
            created: Date.now(),
            role: 'customer',
          });
          user.save(function(err){
            if(err) return done(err, null);
            done(null, user);
          });
        });
      }));

      // passport.use(new GoogleStrategy({
      //  clientID: config.google[env].clientID,
      //  clientSecret: config.google[env].clientSecret,
      //  callbackURL: (options.baseUrl || '') + '/auth/google/callback',
      // }, function(token, tokenSecret, profile, done){
      //  var authId = 'google:' + profile.id;
      //  User.findOne({ authId: authId }, function(err, user){
      //    if(err) return done(err, null);
      //    if(user) return done(null, user);
      //    user = new User({
      //      authId: authId,
      //      name: profile.displayName,
      //      created: Date.now(),
      //      role: 'customer',
      //    });
      //    user.save(function(err){
      //      if(err) return done(err, null);
      //      done(null, user);
      //    });
      //  });
      // }));

      //userNameField, passwordField are set to login form's names
      passport.use(new LocalStrategy({usernameField: 'userId',
                                      passwordField: 'password'},
                                      function(userName, password, done){
          var authId = 'deepinsight:' + userName;

          var cb = done;
          User.findOne({ authId: authId }, function(err, user){
            if(err) {
              return done(err, null);
            }
            if(!user) {
              return done(null, null);
            }
            argon.verify(user.password, password).then(() => { 
              console.log('Successful password supplied!');
              cb(null, user)
            }).catch(() => {
              console.log('Invalid password supplied!');
              cb(null, null)
            });
          });
      }));

      app.use(passport.initialize());
      app.use(passport.session());
    },

    registerRoutes: function(){
      // register Facebook routes
      app.get('/auth/facebook', function(req, res, next){
        if(req.query.redirect) req.session.authRedirect = req.query.redirect;
        passport.authenticate('facebook')(req, res, next);
      });
      app.get('/auth/facebook/callback', passport.authenticate('facebook', 
        { failureRedirect: options.failureRedirect }),
        function(req, res){
          // we only get here on successful authentication
          var redirect = req.session.authRedirect;
          if(redirect) delete req.session.authRedirect;
          res.redirect(303, redirect || options.successRedirect);
        }
      );

      // register Google routes
      app.get('/auth/google', function(req, res, next){
        if(req.query.redirect) req.session.authRedirect = req.query.redirect;
        passport.authenticate('google', { scope: 'profile' })(req, res, next);
      });
      app.get('/auth/google/callback', passport.authenticate('google', 
        { failureRedirect: options.failureRedirect }),
        function(req, res){
          // we only get here on successful authentication
          var redirect = req.session.authRedirect;
          if(redirect) delete req.session.authRedirect;
          res.redirect(303, req.query.redirect || options.successRedirect);
        }
      );
    },

  };
};
